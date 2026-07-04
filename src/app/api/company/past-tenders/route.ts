// ============================================================
// /api/company/past-tenders
// GET  -> Geçmiş ihaleleri listeler
// POST -> Şirket hafızasına geçmiş ihale kaydı ekler
// ============================================================
import { NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireCompany, requireRole, apiError, apiSuccess, withApiErrorHandling } from '@/lib/api/guard';
import type { CreatePastTenderRecordInput, PastTenderRecord, PastTenderResult } from '@/types';

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

export const GET = withApiErrorHandling(async () => {
  const { companyId } = await requireCompany();
  const snap = await adminDb
    .collection('companies')
    .doc(companyId)
    .collection('pastTenders')
    .orderBy('createdAt', 'desc')
    .get();

  return apiSuccess({ records: snap.docs.map((d) => d.data() as PastTenderRecord) });
});

export const POST = withApiErrorHandling(async (req: NextRequest) => {
  const { session, companyId } = await requireRole(['owner', 'admin']);
  const body = (await req.json().catch(() => ({}))) as Partial<CreatePastTenderRecordInput>;

  const tenderName = cleanText(body.tenderName, 180);
  if (!tenderName) return apiError(400, 'invalid_tender_name', 'İhale adı zorunludur.');

  const institution = cleanText(body.institution, 160);
  if (!institution) return apiError(400, 'invalid_institution', 'Kurum adı zorunludur.');

  const result = body.result as PastTenderResult;
  if (!VALID_RESULTS.includes(result)) return apiError(400, 'invalid_result', 'İhale sonucu geçerli değil.');

  const currency = VALID_CURRENCIES.includes(body.currency as any) ? (body.currency as PastTenderRecord['currency']) : 'TRY';
  const year = typeof body.year === 'number' && body.year >= 1990 && body.year <= 2100 ? body.year : null;
  const relatedDocumentIds = Array.isArray(body.relatedDocumentIds)
    ? body.relatedDocumentIds.filter((id): id is string => typeof id === 'string').slice(0, 20)
    : [];

  const now = new Date().toISOString();
  const ref = adminDb.collection('companies').doc(companyId).collection('pastTenders').doc();

  const record: PastTenderRecord = {
    id: ref.id,
    companyId,
    tenderName,
    institution,
    year,
    tenderDate: cleanText(body.tenderDate, 32),
    offerAmount: cleanAmount(body.offerAmount),
    currency,
    result,
    relatedDocumentIds,
    note: cleanText(body.note, 1600),
    createdBy: session.uid,
    createdAt: now,
    updatedAt: now
  };

  await ref.set(record);
  return apiSuccess({ record }, 201);
});
