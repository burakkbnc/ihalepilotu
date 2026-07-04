// ============================================================
// /api/tenders/[tenderId]
// GET   -> İhale detayını getirir (owner/admin/member)
// PATCH -> İhale bilgilerini günceller (owner/admin)
// ============================================================
import { NextRequest } from 'next/server';
import {
  requireCompany,
  requireRole,
  apiError,
  apiSuccess,
  withApiErrorHandling
} from '@/lib/api/guard';
import { getTenderOrThrow } from '@/lib/tenders/access';
import { logActivity } from '@/lib/activity/log';
import type { Tender, TenderStatus, UpdateTenderInput } from '@/types/tender';

const MAX_TITLE_LENGTH = 200;
const MAX_REF_LENGTH = 80;
const MAX_INSTITUTION_LENGTH = 200;

const VALID_STATUSES: TenderStatus[] = [
  'draft',
  'documents_pending',
  'processing',
  'analysis_ready',
  'ready_for_bid',
  'archived'
];

interface RouteParams {
  params: { tenderId: string };
}

function isIsoDateString(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

export const GET = withApiErrorHandling(async (_req: NextRequest, { params }: RouteParams) => {
  const { companyId } = await requireCompany();
  const { tender } = await getTenderOrThrow(companyId, params.tenderId);
  return apiSuccess({ tender });
});

export const PATCH = withApiErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const { session, profile, companyId } = await requireRole(['owner', 'admin']);
  const { ref, tender } = await getTenderOrThrow(companyId, params.tenderId);

  const body = (await req.json().catch(() => ({}))) as Partial<UpdateTenderInput>;
  const updates: Record<string, unknown> = {};
  const activityNotes: string[] = [];

  if (body.title !== undefined) {
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title || title.length < 2 || title.length > MAX_TITLE_LENGTH) {
      return apiError(400, 'invalid_title', `İhale başlığı 2-${MAX_TITLE_LENGTH} karakter olmalıdır.`);
    }
    updates.title = title;
  }

  if (body.referenceNumber !== undefined) {
    updates.referenceNumber =
      body.referenceNumber === null
        ? null
        : String(body.referenceNumber).trim().slice(0, MAX_REF_LENGTH) || null;
  }

  if (body.institutionName !== undefined) {
    updates.institutionName =
      body.institutionName === null
        ? null
        : String(body.institutionName).trim().slice(0, MAX_INSTITUTION_LENGTH) || null;
  }

  if (body.submissionDeadline !== undefined) {
    if (body.submissionDeadline === null) {
      updates.submissionDeadline = null;
    } else if (!isIsoDateString(body.submissionDeadline)) {
      return apiError(400, 'invalid_submission_deadline', 'Teklif son teslim tarihi geçerli bir tarih olmalıdır.');
    } else {
      updates.submissionDeadline = new Date(body.submissionDeadline).toISOString();
    }
  }

  if (body.tenderDate !== undefined) {
    if (body.tenderDate === null) {
      updates.tenderDate = null;
    } else if (!isIsoDateString(body.tenderDate)) {
      return apiError(400, 'invalid_tender_date', 'İhale tarihi geçerli bir tarih olmalıdır.');
    } else {
      updates.tenderDate = new Date(body.tenderDate).toISOString();
    }
  }

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      return apiError(400, 'invalid_status', `Durum şu değerlerden biri olmalı: ${VALID_STATUSES.join(', ')}`);
    }
    if (body.status !== tender.status) {
      updates.status = body.status;
      activityNotes.push(`Durum "${tender.status}" -> "${body.status}" olarak değiştirildi.`);
    }
  }

  if (Object.keys(updates).length === 0) {
    return apiError(400, 'no_changes', 'Güncellenecek herhangi bir alan belirtilmedi.');
  }

  updates.updatedAt = new Date().toISOString();

  await ref.update(updates);

  const updatedSnap = await ref.get();
  const updatedTender = updatedSnap.data() as Tender;

  // Aktivite kaydı
  if (updates.status !== undefined) {
    await logActivity({
      companyId,
      tenderId: tender.id,
      type: 'tender_status_changed',
      message: activityNotes.join(' '),
      metadata: { from: tender.status, to: updates.status },
      actor: { session, profile }
    });
  } else {
    await logActivity({
      companyId,
      tenderId: tender.id,
      type: 'tender_updated',
      message: 'İhale bilgileri güncellendi.',
      metadata: { updatedFields: Object.keys(updates).filter((k) => k !== 'updatedAt') },
      actor: { session, profile }
    });
  }

  return apiSuccess({ tender: updatedTender });
});
