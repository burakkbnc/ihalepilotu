// ============================================================
// /api/tenders/[tenderId]/items/[itemId]
// PATCH  -> Satırı günceller (owner/admin)
// DELETE -> Satırı siler (owner/admin)
// ============================================================
import { NextRequest } from 'next/server';
import { requireRole, apiError, apiSuccess, withApiErrorHandling, ApiError } from '@/lib/api/guard';
import { getTenderOrThrow } from '@/lib/tenders/access';
import { logActivity } from '@/lib/activity/log';
import type { TenderItem, UpsertTenderItemInput } from '@/types/tender';

interface RouteParams {
  params: { tenderId: string; itemId: string };
}

const MAX_DESCRIPTION_LENGTH = 500;
const MAX_UNIT_LENGTH = 30;
const VALID_VAT_RATES = new Set([0, 1, 10, 20]);

/**
 * Faz 3.5 öncesi oluşturulmuş TenderItem belgelerinde vatRate/total/
 * vatAmount/grandTotal alanları hiç yazılmamış olabilir (undefined).
 * Bu yardımcı, undefined/null/NaN gelen her durumda güvenli bir varsayılan
 * döner — hesaplama pipeline'ının hiçbir noktasında undefined/NaN ileri
 * taşınmaz (aksi halde tek bir eski satır tüm toplamı NaN yapabilir).
 */
function safeOrFallback(value: unknown, fallback: number): number {
  const num = Number(value);
  if (value === null || value === undefined || !Number.isFinite(num)) return fallback;
  return num;
}

export const PATCH = withApiErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const { session, profile, companyId } = await requireRole(['owner', 'admin']);
  const { ref, tender } = await getTenderOrThrow(companyId, params.tenderId);

  const itemRef = ref.collection('items').doc(params.itemId);
  const itemSnap = await itemRef.get();

  if (!itemSnap.exists) {
    throw new ApiError(404, 'item_not_found', 'Birim fiyat cetveli satırı bulunamadı.');
  }

  const existing = itemSnap.data() as TenderItem;
  const body = (await req.json().catch(() => ({}))) as Partial<UpsertTenderItemInput>;

  const updates: Partial<TenderItem> = {};

  if (body.description !== undefined) {
    const description = String(body.description).trim();
    if (!description || description.length > MAX_DESCRIPTION_LENGTH) {
      return apiError(400, 'invalid_description', `İş kalemi açıklaması 1-${MAX_DESCRIPTION_LENGTH} karakter olmalıdır.`);
    }
    updates.description = description;
  }

  if (body.unit !== undefined) {
    const unit = String(body.unit).trim();
    if (!unit || unit.length > MAX_UNIT_LENGTH) {
      return apiError(400, 'invalid_unit', `Birim 1-${MAX_UNIT_LENGTH} karakter olmalıdır.`);
    }
    updates.unit = unit;
  }

  if (body.orderNo !== undefined) {
    const orderNo = Number(body.orderNo);
    if (!Number.isFinite(orderNo) || orderNo < 0) {
      return apiError(400, 'invalid_order_no', 'Sıra No geçerli bir sayı olmalıdır.');
    }
    updates.orderNo = orderNo;
  }

  if (body.quantity !== undefined) {
    const quantity = Number(body.quantity);
    if (!Number.isFinite(quantity) || quantity < 0) {
      return apiError(400, 'invalid_quantity', 'Miktar geçerli bir sayı olmalıdır (0 veya üzeri).');
    }
    updates.quantity = quantity;
  }

  if (body.unitPrice !== undefined) {
    const unitPrice = Number(body.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return apiError(400, 'invalid_unit_price', 'Birim Fiyat geçerli bir sayı olmalıdır (0 veya üzeri).');
    }
    updates.unitPrice = unitPrice;
  }

  if (body.vatRate !== undefined) {
    const vatRate = Number(body.vatRate);
    if (!VALID_VAT_RATES.has(vatRate)) {
      return apiError(400, 'invalid_vat_rate', 'KDV oranı %0, %1, %10 veya %20 olmalıdır.');
    }
    updates.vatRate = vatRate;
  }

  if (Object.keys(updates).length === 0) {
    return apiError(400, 'no_changes', 'Güncellenecek herhangi bir alan belirtilmedi.');
  }

  // Tutar yeniden hesaplanır: Ara Toplam (KDV hariç), KDV Tutarı, Genel Toplam (KDV dahil)
  // Faz 3.5 öncesi oluşturulmuş satırlarda vatRate alanı hiç yazılmamış
  // olabilir (undefined) — bu durumda NaN'a düşmemek için fallback uygulanır.
  const quantity = safeOrFallback(updates.quantity ?? existing.quantity, 0);
  const unitPrice = safeOrFallback(updates.unitPrice ?? existing.unitPrice, 0);
  const vatRate = safeOrFallback(updates.vatRate ?? existing.vatRate, 20);
  const total = Math.round(quantity * unitPrice * 100) / 100;
  const vatAmount = Math.round(total * (vatRate / 100) * 100) / 100;
  const grandTotal = Math.round((total + vatAmount) * 100) / 100;
  updates.total = total;
  updates.vatAmount = vatAmount;
  updates.grandTotal = grandTotal;
  updates.updatedAt = new Date().toISOString();

  await itemRef.update(updates);

  const updatedSnap = await itemRef.get();
  const item = updatedSnap.data() as TenderItem;

  await logActivity({
    companyId,
    tenderId: tender.id,
    type: 'item_updated',
    message: `Birim fiyat cetveli satırı güncellendi: "${item.description}".`,
    metadata: { itemId: item.id },
    actor: { session, profile }
  });

  return apiSuccess({ item });
});

export const DELETE = withApiErrorHandling(async (_req: NextRequest, { params }: RouteParams) => {
  const { session, profile, companyId } = await requireRole(['owner', 'admin']);
  const { ref, tender } = await getTenderOrThrow(companyId, params.tenderId);

  const itemRef = ref.collection('items').doc(params.itemId);
  const itemSnap = await itemRef.get();

  if (!itemSnap.exists) {
    throw new ApiError(404, 'item_not_found', 'Birim fiyat cetveli satırı bulunamadı.');
  }

  const existing = itemSnap.data() as TenderItem;
  await itemRef.delete();

  await logActivity({
    companyId,
    tenderId: tender.id,
    type: 'item_deleted',
    message: `Birim fiyat cetveli satırı silindi: "${existing.description}".`,
    metadata: { itemId: existing.id },
    actor: { session, profile }
  });

  return apiSuccess({ itemId: params.itemId, deleted: true });
});
