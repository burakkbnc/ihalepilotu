// ============================================================
// /api/tenders
// GET  -> Şirketin tüm ihalelerini listeler (owner/admin/member)
// POST -> Yeni ihale oluşturur (owner/admin)
// ============================================================
import { NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import type { Query } from 'firebase-admin/firestore';
import {
  requireCompany,
  requireRole,
  apiError,
  apiSuccess,
  withApiErrorHandling,
  ApiError
} from '@/lib/api/guard';
import { logActivity } from '@/lib/activity/log';
import type { CreateTenderInput, Tender } from '@/types/tender';

const MAX_TITLE_LENGTH = 200;
const MAX_REF_LENGTH = 80;
const MAX_INSTITUTION_LENGTH = 200;

function isIsoDateString(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

export const GET = withApiErrorHandling(async (req: NextRequest) => {
  const { companyId } = await requireCompany();

  const url = new URL(req.url);
  const statusFilter = url.searchParams.get('status');

  let query = adminDb
    .collection('companies')
    .doc(companyId)
    .collection('tenders')
    .orderBy('createdAt', 'desc') as Query;

  if (statusFilter) {
    query = query.where('status', '==', statusFilter);
  }

  const snap = await query.get();
  const tenders = snap.docs.map((d) => d.data() as Tender);

  return apiSuccess({ tenders });
});

export const POST = withApiErrorHandling(async (req: NextRequest) => {
  const { session, profile, companyId } = await requireRole(['owner', 'admin']);

  const body = (await req.json().catch(() => ({}))) as Partial<CreateTenderInput>;

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title || title.length < 2 || title.length > MAX_TITLE_LENGTH) {
    return apiError(400, 'invalid_title', `İhale başlığı 2-${MAX_TITLE_LENGTH} karakter olmalıdır.`);
  }

  const referenceNumber =
    typeof body.referenceNumber === 'string' ? body.referenceNumber.trim().slice(0, MAX_REF_LENGTH) : null;

  const institutionName =
    typeof body.institutionName === 'string'
      ? body.institutionName.trim().slice(0, MAX_INSTITUTION_LENGTH)
      : null;

  let submissionDeadline: string | null = null;
  if (body.submissionDeadline != null) {
    if (!isIsoDateString(body.submissionDeadline)) {
      return apiError(400, 'invalid_submission_deadline', 'Teklif son teslim tarihi geçerli bir tarih olmalıdır.');
    }
    submissionDeadline = new Date(body.submissionDeadline).toISOString();
  }

  let tenderDate: string | null = null;
  if (body.tenderDate != null) {
    if (!isIsoDateString(body.tenderDate)) {
      return apiError(400, 'invalid_tender_date', 'İhale tarihi geçerli bir tarih olmalıdır.');
    }
    tenderDate = new Date(body.tenderDate).toISOString();
  }

  // Plan limiti kontrolü
  const companyRef = adminDb.collection('companies').doc(companyId);
  const companySnap = await companyRef.get();
  const company = companySnap.data();
  const tenderLimit = company?.plan?.tenderLimit as number | null | undefined;

  if (tenderLimit !== null && tenderLimit !== undefined) {
    const tendersCountSnap = await companyRef.collection('tenders').count().get();
    if (tendersCountSnap.data().count >= tenderLimit) {
      throw new ApiError(
        403,
        'tender_limit_reached',
        `Şirket ihale limitine (${tenderLimit}) ulaşıldı. Lütfen paketi yükseltin.`
      );
    }
  }

  const now = new Date().toISOString();
  const tenderRef = companyRef.collection('tenders').doc();

  const tender: Tender = {
    id: tenderRef.id,
    companyId,
    title,
    referenceNumber: referenceNumber || null,
    institutionName: institutionName || null,
    status: 'draft',
    submissionDeadline,
    tenderDate,
    documentCount: 0,
    hasAnalysis: false,
    conflictCount: 0,
    highRiskCount: 0,
    createdBy: session.uid,
    createdAt: now,
    updatedAt: now
  };

  await tenderRef.set(tender);

  await logActivity({
    companyId,
    tenderId: tender.id,
    type: 'tender_created',
    message: `"${title}" ihalesi oluşturuldu.`,
    actor: { session, profile }
  });

  return apiSuccess({ tender }, 201);
});
