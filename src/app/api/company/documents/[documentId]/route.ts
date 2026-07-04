import { NextRequest } from 'next/server';
import { adminDb, adminStorage } from '@/lib/firebase/admin';
import { requireRole, apiError, apiSuccess, withApiErrorHandling, ApiError } from '@/lib/api/guard';
import type { CompanyDocument, CompanyDocumentCategory } from '@/types';

interface RouteParams { params: { documentId: string } }

const VALID_CATEGORIES: CompanyDocumentCategory[] = [
  'kurumsal_belge', 'kalite_belgesi', 'is_deneyim_belgesi', 'referans_belgesi', 'yetki_belgesi', 'katalog_brosur', 'diger'
];

function cleanText(value: unknown, max = 255): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

export const PATCH = withApiErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const { companyId } = await requireRole(['owner', 'admin']);
  const ref = adminDb.collection('companies').doc(companyId).collection('companyDocuments').doc(params.documentId);
  const snap = await ref.get();
  if (!snap.exists) throw new ApiError(404, 'document_not_found', 'Belge bulunamadı.');

  const body = await req.json().catch(() => ({}));
  const patch: Partial<CompanyDocument> = { updatedAt: new Date().toISOString() };

  if ('title' in body) {
    const title = cleanText(body.title, 140);
    if (!title) return apiError(400, 'invalid_title', 'Belge adı zorunludur.');
    patch.title = title;
  }
  if ('category' in body) {
    const category = body.category as CompanyDocumentCategory;
    if (!VALID_CATEGORIES.includes(category)) return apiError(400, 'invalid_category', 'Belge türü geçerli değil.');
    patch.category = category;
  }
  if ('issuer' in body) patch.issuer = cleanText(body.issuer, 160);
  if ('validUntil' in body) patch.validUntil = cleanText(body.validUntil, 32);
  if ('note' in body) patch.note = cleanText(body.note, 1200);

  await ref.update(patch);
  const updated = await ref.get();
  return apiSuccess({ document: updated.data() as CompanyDocument });
});

export const DELETE = withApiErrorHandling(async (_req: NextRequest, { params }: RouteParams) => {
  const { companyId } = await requireRole(['owner', 'admin']);
  const ref = adminDb.collection('companies').doc(companyId).collection('companyDocuments').doc(params.documentId);
  const snap = await ref.get();
  if (!snap.exists) throw new ApiError(404, 'document_not_found', 'Belge bulunamadı.');
  const document = snap.data() as CompanyDocument;

  if (adminStorage && document.storagePath) {
    await adminStorage.bucket().file(document.storagePath).delete({ ignoreNotFound: true });
  }

  await ref.delete();
  return apiSuccess({ deleted: true });
});
