// ============================================================
// /api/tenders/[tenderId]/documents
// GET  -> Doküman metadata listesini getirir (owner/admin/member)
// POST -> Yüklenen doküman metadata kaydını oluşturur (owner/admin)
//
// Dosyanın kendisi client tarafında Firebase Storage'a yüklenir. Bu endpoint
// Storage path'i doğrular ve Firestore doküman metadata kaydını oluşturur.
// ============================================================
import { NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireCompany, requireRole, apiError, apiSuccess, withApiErrorHandling } from '@/lib/api/guard';
import { getTenderOrThrow } from '@/lib/tenders/access';
import { logActivity } from '@/lib/activity/log';
import type { CreateTenderDocumentInput, TenderDocument, TenderDocumentType } from '@/types/tender';

interface RouteParams {
  params: { tenderId: string };
}

const VALID_DOCUMENT_TYPES: TenderDocumentType[] = [
  'idari_sartname',
  'teknik_sartname',
  'sozlesme_tasarisi',
  'birim_fiyat_cetveli',
  'zeyilname',
  'ek_belge'
];

const MAX_DOCUMENT_DATE_LENGTH = 40;

const MAX_FILENAME_LENGTH = 255;
const MAX_FILE_SIZE = 25 * 1024 * 1024;

function isValidStoragePath(path: string, companyId: string, tenderId: string) {
  return (
    path.startsWith(`companies/${companyId}/tenders/${tenderId}/documents/`) &&
    !path.includes('..') &&
    path.split('/').length === 6
  );
}

export const GET = withApiErrorHandling(async (_req: NextRequest, { params }: RouteParams) => {
  const { companyId } = await requireCompany();
  const { ref } = await getTenderOrThrow(companyId, params.tenderId);

  const snap = await ref.collection('documents').orderBy('createdAt', 'asc').get();
  const documents = snap.docs.map((d) => d.data() as TenderDocument);

  return apiSuccess({ documents });
});

export const POST = withApiErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const { session, profile, companyId } = await requireRole(['owner', 'admin']);
  const { ref, tender } = await getTenderOrThrow(companyId, params.tenderId);

  const body = (await req.json().catch(() => ({}))) as Partial<CreateTenderDocumentInput>;

  const documentType = body.documentType;
  if (!documentType || !VALID_DOCUMENT_TYPES.includes(documentType)) {
    return apiError(
      400,
      'invalid_document_type',
      `documentType şu değerlerden biri olmalı: ${VALID_DOCUMENT_TYPES.join(', ')}`
    );
  }

  const fileName = typeof body.fileName === 'string' ? body.fileName.trim() : '';
  if (!fileName || fileName.length > MAX_FILENAME_LENGTH) {
    return apiError(400, 'invalid_file_name', `Dosya adı 1-${MAX_FILENAME_LENGTH} karakter olmalıdır.`);
  }

  const mimeType = typeof body.mimeType === 'string' ? body.mimeType : null;
  const fileSize = typeof body.fileSize === 'number' && body.fileSize >= 0 ? body.fileSize : null;
  if (fileSize !== null && fileSize > MAX_FILE_SIZE) {
    return apiError(400, 'file_too_large', 'Dosya boyutu 25 MB sınırını aşamaz.');
  }

  const storagePath = typeof body.storagePath === 'string' ? body.storagePath.trim() : null;
  if (storagePath && !isValidStoragePath(storagePath, companyId, tender.id)) {
    return apiError(400, 'invalid_storage_path', 'Dosya yolu geçerli değil.');
  }

  // SPRINT NOTU (Zeyilname/Düzeltme İlanı Desteği): belgenin kendi
  // tarihi — birden fazla zeyilname olduğunda hangisinin GÜNCEL olduğunu
  // belirlemek için kullanılır (bkz. types/tender.ts TenderDocument.documentDate).
  const documentDateRaw = typeof body.documentDate === 'string' ? body.documentDate.trim() : null;
  if (documentDateRaw && documentDateRaw.length > MAX_DOCUMENT_DATE_LENGTH) {
    return apiError(400, 'invalid_document_date', 'Belge tarihi geçerli değil.');
  }
  const documentDate = documentDateRaw || null;

  const now = new Date().toISOString();
  const docRef = ref.collection('documents').doc();

  const document: TenderDocument = {
    id: docRef.id,
    tenderId: tender.id,
    companyId,
    documentType,
    fileName,
    mimeType,
    fileSize,
    documentDate,
    storagePath,
    status: storagePath ? 'uploaded' : 'pending_upload',
    errorMessage: null,
    uploadedBy: session.uid,
    createdAt: now,
    updatedAt: now
  };

  const batch = adminDb.batch();
  batch.set(docRef, document);
  batch.update(ref, {
    documentCount: tender.documentCount + 1,
    updatedAt: now,
    ...(tender.status === 'draft' ? { status: 'documents_pending' } : {})
  });
  await batch.commit();

  await logActivity({
    companyId,
    tenderId: tender.id,
    type: 'document_registered',
    message: storagePath
      ? `"${fileName}" dokümanı yüklendi (${documentLabel(documentType)}).`
      : `"${fileName}" dokümanı kaydedildi (${documentLabel(documentType)}).`,
    metadata: { documentId: document.id, documentType },
    actor: { session, profile }
  });

  return apiSuccess({ document }, 201);
});

function documentLabel(type: TenderDocumentType): string {
  const labels: Record<TenderDocumentType, string> = {
    idari_sartname: 'İdari Şartname',
    teknik_sartname: 'Teknik Şartname',
    sozlesme_tasarisi: 'Sözleşme Tasarısı',
    birim_fiyat_cetveli: 'Birim Fiyat Cetveli',
    zeyilname: 'Zeyilname / Düzeltme İlanı',
    ek_belge: 'Ek Belge'
  };
  return labels[type];
}
