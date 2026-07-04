import { NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireRole, apiError, apiSuccess, withApiErrorHandling, ApiError } from '@/lib/api/guard';
import type { PastTenderRecord, PastTenderResult } from '@/types';

interface RouteParams { params: { recordId: string } }
const VALID_RESULTS: PastTenderResult[] = ['won', 'lost', 'cancelled', 'ongoing', 'no_bid'];
const VALID_CURRENCIES: PastTenderRecord['currency'][] = ['TRY', 'USD', 'EUR'];

function cleanText(value: unknown, max = 255): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}
function cleanAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? Math.round(num * 100) / 100 : null;
}

export const PATCH = withApiErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const { companyId } = await requireRole(['owner', 'admin']);
  const ref = adminDb.collection('companies').doc(companyId).collection('pastTenders').doc(params.recordId);
  const snap = await ref.get();
  if (!snap.exists) throw new ApiError(404, 'record_not_found', 'Geçmiş ihale kaydı bulunamadı.');

  const body = await req.json().catch(() => ({}));
  const patch: Partial<PastTenderRecord> = { updatedAt: new Date().toISOString() };
  if ('tenderName' in body) {
    const tenderName = cleanText(body.tenderName, 180);
    if (!tenderName) return apiError(400, 'invalid_tender_name', 'İhale adı zorunludur.');
    patch.tenderName = tenderName;
  }
  if ('institution' in body) {
    const institution = cleanText(body.institution, 160);
    if (!institution) return apiError(400, 'invalid_institution', 'Kurum adı zorunludur.');
    patch.institution = institution;
  }
  if ('result' in body) {
    const result = body.result as PastTenderResult;
    if (!VALID_RESULTS.includes(result)) return apiError(400, 'invalid_result', 'İhale sonucu geçerli değil.');
    patch.result = result;
  }
  if ('currency' in body && VALID_CURRENCIES.includes(body.currency)) patch.currency = body.currency;
  if ('year' in body) patch.year = typeof body.year === 'number' && body.year >= 1990 && body.year <= 2100 ? body.year : null;
  if ('tenderDate' in body) patch.tenderDate = cleanText(body.tenderDate, 32);
  if ('offerAmount' in body) patch.offerAmount = cleanAmount(body.offerAmount);
  if ('note' in body) patch.note = cleanText(body.note, 1600);
  if ('relatedDocumentIds' in body) {
    patch.relatedDocumentIds = Array.isArray(body.relatedDocumentIds)
      ? body.relatedDocumentIds.filter((id: unknown): id is string => typeof id === 'string').slice(0, 20)
      : [];
  }

  await ref.update(patch);
  const updated = await ref.get();
  return apiSuccess({ record: updated.data() as PastTenderRecord });
});

export const DELETE = withApiErrorHandling(async (_req: NextRequest, { params }: RouteParams) => {
  const { companyId } = await requireRole(['owner', 'admin']);
  const ref = adminDb.collection('companies').doc(companyId).collection('pastTenders').doc(params.recordId);
  const snap = await ref.get();
  if (!snap.exists) throw new ApiError(404, 'record_not_found', 'Geçmiş ihale kaydı bulunamadı.');
  await ref.delete();
  return apiSuccess({ deleted: true });
});
