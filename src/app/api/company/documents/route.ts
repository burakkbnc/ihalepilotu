// ============================================================
// /api/company/documents
// GET  -> Şirket belgelerini listeler
// POST -> Şirket hafızasına yeni belge metadata kaydı ekler
// ============================================================
import { NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireCompany, requireRole, apiError, apiSuccess, withApiErrorHandling } from '@/lib/api/guard';
import type { CompanyDocument, CompanyDocumentCategory, CreateCompanyDocumentInput } from '@/types';

const VALID_CATEGORIES: CompanyDocumentCategory[] = [
  'kurumsal_belge',
  'kalite_belgesi',
  'is_deneyim_belgesi',
  'referans_belgesi',
  'yetki_belgesi',
  'katalog_brosur',
  'diger'
];

const MAX_TITLE_LENGTH = 140;
const MAX_NOTE_LENGTH = 1200;
const MAX_FILE_SIZE = 25 * 1024 * 1024;

function cleanText(value: unknown, max = 255): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function isValidStoragePath(path: string, companyId: string) {
  return path.startsWith(`companies/${companyId}/company-documents/`) && !path.includes('..');
}

export const GET = withApiErrorHandling(async () => {
  const { companyId } = await requireCompany();

  const snap = await adminDb
    .collection('companies')
    .doc(companyId)
    .collection('companyDocuments')
    .orderBy('createdAt', 'desc')
    .get();

  return apiSuccess({ documents: snap.docs.map((d) => d.data() as CompanyDocument) });
});

export const POST = withApiErrorHandling(async (req: NextRequest) => {
  const { session, companyId } = await requireRole(['owner', 'admin']);
  const body = (await req.json().catch(() => ({}))) as Partial<CreateCompanyDocumentInput>;

  const title = cleanText(body.title, MAX_TITLE_LENGTH);
  if (!title) return apiError(400, 'invalid_title', 'Belge adı zorunludur.');

  const category = body.category as CompanyDocumentCategory;
  if (!VALID_CATEGORIES.includes(category)) {
    return apiError(400, 'invalid_category', `Belge türü şu değerlerden biri olmalı: ${VALID_CATEGORIES.join(', ')}`);
  }

  const fileSize = typeof body.fileSize === 'number' && body.fileSize >= 0 ? body.fileSize : null;
  if (fileSize !== null && fileSize > MAX_FILE_SIZE) {
    return apiError(400, 'file_too_large', 'Dosya boyutu 25 MB sınırını aşamaz.');
  }

  const storagePath = cleanText(body.storagePath, 700);
  if (storagePath && !isValidStoragePath(storagePath, companyId)) {
    return apiError(400, 'invalid_storage_path', 'Dosya yolu geçerli değil.');
  }

  const now = new Date().toISOString();
  const ref = adminDb.collection('companies').doc(companyId).collection('companyDocuments').doc();

  const document: CompanyDocument = {
    id: ref.id,
    companyId,
    title,
    category,
    issuer: cleanText(body.issuer, 160),
    validUntil: cleanText(body.validUntil, 32),
    fileName: cleanText(body.fileName, 255),
    mimeType: cleanText(body.mimeType, 120),
    fileSize,
    storagePath,
    downloadUrl: cleanText((body as any).downloadUrl, 1200),
    note: cleanText(body.note, MAX_NOTE_LENGTH),
    uploadedBy: session.uid,
    createdAt: now,
    updatedAt: now
  };

  await ref.set(document);
  return apiSuccess({ document }, 201);
});
