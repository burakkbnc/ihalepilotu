// ============================================================
// /api/tenders/[tenderId]/items
// GET  -> Birim fiyat cetveli satırlarını listeler (owner/admin/member)
// POST -> Yeni satır ekler (owner/admin) — source: 'manual' veya analiz
//         önerisinden aktarılmışsa kaynak meta bilgileri korunur.
//
// orderNo 0 veya belirtilmemişse, mevcut en yüksek orderNo + 1 olarak
// otomatik atanır (analiz önerisinden "Cetvele Aktar" akışı için).
// ============================================================
import { NextRequest } from 'next/server';
import { requireCompany, requireRole, apiError, apiSuccess, withApiErrorHandling } from '@/lib/api/guard';
import { getTenderOrThrow } from '@/lib/tenders/access';
import { logActivity } from '@/lib/activity/log';
import type { TenderItem, UpsertTenderItemInput } from '@/types/tender';

interface RouteParams {
  params: { tenderId: string };
}

const MAX_DESCRIPTION_LENGTH = 500;
const MAX_UNIT_LENGTH = 30;
const MAX_NOTE_LENGTH = 300;
const MAX_REFERENCE_LENGTH = 100;
const MAX_CATEGORY_LENGTH = 60;

const VALID_SOURCE_TYPES = new Set(['official_bill_of_quantities', 'technical_cost_item', 'derived_estimate', 'manual_entry']);
const VALID_SOURCE_DOCUMENTS = new Set(['idari', 'teknik']);
const VALID_VAT_RATES = new Set([0, 1, 10, 20]);
const DEFAULT_VAT_RATE = 20;

function validateItemInput(body: Partial<UpsertTenderItemInput>):
  | { ok: false; error: string; message: string }
  | { ok: true; value: UpsertTenderItemInput } {
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  if (!description || description.length > MAX_DESCRIPTION_LENGTH) {
    return { ok: false, error: 'invalid_description', message: `İş kalemi açıklaması 1-${MAX_DESCRIPTION_LENGTH} karakter olmalıdır.` };
  }

  const unit = typeof body.unit === 'string' ? body.unit.trim() : '';
  if (!unit || unit.length > MAX_UNIT_LENGTH) {
    return { ok: false, error: 'invalid_unit', message: `Birim 1-${MAX_UNIT_LENGTH} karakter olmalıdır.` };
  }

  const orderNo = Number(body.orderNo);
  if (!Number.isFinite(orderNo) || orderNo < 0) {
    return { ok: false, error: 'invalid_order_no', message: 'Sıra No geçerli bir sayı olmalıdır.' };
  }

  const quantity = Number(body.quantity);
  if (!Number.isFinite(quantity) || quantity < 0) {
    return { ok: false, error: 'invalid_quantity', message: 'Miktar geçerli bir sayı olmalıdır (0 veya üzeri).' };
  }

  const unitPrice = Number(body.unitPrice);
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    return { ok: false, error: 'invalid_unit_price', message: 'Birim Fiyat geçerli bir sayı olmalıdır (0 veya üzeri).' };
  }

  // KDV Oranı: yalnızca %0, %1, %10, %20 kabul edilir (Türkiye'de yaygın oranlar).
  // Belirtilmemişse varsayılan %20 kullanılır.
  let vatRate = DEFAULT_VAT_RATE;
  if (body.vatRate !== undefined) {
    const requestedVatRate = Number(body.vatRate);
    if (!VALID_VAT_RATES.has(requestedVatRate)) {
      return { ok: false, error: 'invalid_vat_rate', message: 'KDV oranı %0, %1, %10 veya %20 olmalıdır.' };
    }
    vatRate = requestedVatRate;
  }

  // Opsiyonel meta alanlar — analiz önerisinden aktarılan satırlarda dolu gelir
  const category =
    typeof body.category === 'string' && body.category.trim().length > 0
      ? body.category.trim().slice(0, MAX_CATEGORY_LENGTH)
      : null;

  const sourceType = typeof body.sourceType === 'string' && VALID_SOURCE_TYPES.has(body.sourceType) ? body.sourceType : 'manual_entry';

  const parentOfficialItemName =
    typeof body.parentOfficialItemName === 'string' && body.parentOfficialItemName.trim().length > 0
      ? body.parentOfficialItemName.trim().slice(0, MAX_DESCRIPTION_LENGTH)
      : null;

  const shortNote =
    typeof body.shortNote === 'string' && body.shortNote.trim().length > 0
      ? body.shortNote.trim().slice(0, MAX_NOTE_LENGTH)
      : null;

  const sourceDocument =
    typeof body.sourceDocument === 'string' && VALID_SOURCE_DOCUMENTS.has(body.sourceDocument)
      ? (body.sourceDocument as 'idari' | 'teknik')
      : null;

  const sourceReference =
    typeof body.sourceReference === 'string' && body.sourceReference.trim().length > 0
      ? body.sourceReference.trim().slice(0, MAX_REFERENCE_LENGTH)
      : null;

  const confidence =
    typeof body.confidence === 'number' && Number.isFinite(body.confidence)
      ? Math.min(1, Math.max(0, body.confidence))
      : null;

  return {
    ok: true,
    value: {
      orderNo,
      description,
      unit,
      quantity,
      unitPrice,
      vatRate,
      category,
      sourceType: sourceType as UpsertTenderItemInput['sourceType'],
      parentOfficialItemName,
      shortNote,
      sourceDocument,
      sourceReference,
      confidence
    }
  };
}

export const GET = withApiErrorHandling(async (_req: NextRequest, { params }: RouteParams) => {
  const { companyId } = await requireCompany();
  const { ref } = await getTenderOrThrow(companyId, params.tenderId);

  const snap = await ref.collection('items').orderBy('orderNo', 'asc').get();
  const items = snap.docs.map((d) => d.data() as TenderItem);

  return apiSuccess({ items });
});

export const POST = withApiErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const { session, profile, companyId } = await requireRole(['owner', 'admin']);
  const { ref, tender } = await getTenderOrThrow(companyId, params.tenderId);

  const body = (await req.json().catch(() => ({}))) as Partial<UpsertTenderItemInput>;
  const validation = validateItemInput(body);

  if (validation.ok === false) {
    return apiError(400, validation.error, validation.message);
  }

  const {
    orderNo: requestedOrderNo,
    description,
    unit,
    quantity,
    unitPrice,
    vatRate,
    category,
    sourceType,
    parentOfficialItemName,
    shortNote,
    sourceDocument,
    sourceReference,
    confidence
  } = validation.value;

  // orderNo 0 (veya belirtilmemiş) ise, mevcut en yüksek orderNo + 1 ata.
  // Bu, analiz önerisinden "Cetvele Aktar" akışında kullanıcının sıra
  // numarası girmesine gerek bırakmaz.
  let orderNo = requestedOrderNo;
  if (orderNo === 0) {
    const existingSnap = await ref.collection('items').orderBy('orderNo', 'desc').limit(1).get();
    const highestOrderNo = existingSnap.empty ? 0 : (existingSnap.docs[0].data() as TenderItem).orderNo;
    orderNo = highestOrderNo + 1;
  }

  const total = Math.round(quantity * unitPrice * 100) / 100;
  const effectiveVatRate = vatRate ?? 0;
  const vatAmount = Math.round(total * (effectiveVatRate / 100) * 100) / 100;
  const grandTotal = Math.round((total + vatAmount) * 100) / 100;

  const now = new Date().toISOString();
  const itemRef = ref.collection('items').doc();

  const item: TenderItem = {
    id: itemRef.id,
    tenderId: tender.id,
    companyId,
    orderNo,
    description,
    unit,
    quantity,
    unitPrice,
    vatRate: effectiveVatRate,
    total,
    vatAmount,
    grandTotal,
    source: sourceType === 'manual_entry' ? 'manual' : 'parser',
    category: category ?? null,
    sourceType: sourceType ?? 'manual_entry',
    parentOfficialItemName: parentOfficialItemName ?? null,
    shortNote: shortNote ?? null,
    sourceDocument: sourceDocument ?? null,
    sourceReference: sourceReference ?? null,
    confidence: confidence ?? null,
    createdAt: now,
    updatedAt: now
  };

  await itemRef.set(item);

  await logActivity({
    companyId,
    tenderId: tender.id,
    type: 'item_added',
    message: `Birim fiyat cetveline "${description}" satırı eklendi.`,
    metadata: { itemId: item.id },
    actor: { session, profile }
  });

  return apiSuccess({ item }, 201);
});
