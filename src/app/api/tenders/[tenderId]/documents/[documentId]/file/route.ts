// ============================================================
// /api/tenders/[tenderId]/documents/[documentId]/file
// GET -> Doküman için kısa süreli önizleme / indirme bağlantısına yönlendirir.
//
// Amaç: Kullanıcının analiz ekranında daha önce yüklediği şartnameyi
// silmeden/değiştirmeden tekrar görüntüleyebilmesi ve indirebilmesi.
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { adminStorage } from '@/lib/firebase/admin';
import { requireCompany, withApiErrorHandling, ApiError } from '@/lib/api/guard';
import { getTenderOrThrow } from '@/lib/tenders/access';
import type { TenderDocument } from '@/types/tender';

interface RouteParams {
  params: { tenderId: string; documentId: string };
}

function safeDownloadName(fileName: string) {
  return fileName.replace(/[\r\n"]/g, '').slice(0, 180) || 'dokuman';
}

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: RouteParams) => {
  const { companyId } = await requireCompany();
  const { ref } = await getTenderOrThrow(companyId, params.tenderId);

  const documentRef = ref.collection('documents').doc(params.documentId);
  const snap = await documentRef.get();

  if (!snap.exists) {
    throw new ApiError(404, 'document_not_found', 'Doküman bulunamadı.');
  }

  const document = snap.data() as TenderDocument;

  if (!document.storagePath) {
    throw new ApiError(404, 'document_file_missing', 'Bu doküman için yüklü dosya bulunamadı.');
  }

  if (!adminStorage) {
    throw new ApiError(503, 'storage_not_enabled', 'Firebase Storage aktif değil.');
  }

  const mode = req.nextUrl.searchParams.get('mode') === 'download' ? 'download' : 'preview';
  const disposition = mode === 'download'
    ? `attachment; filename="${safeDownloadName(document.fileName)}"`
    : `inline; filename="${safeDownloadName(document.fileName)}"`;

  const [url] = await adminStorage.bucket().file(document.storagePath).getSignedUrl({
    action: 'read',
    expires: Date.now() + 15 * 60 * 1000,
    responseDisposition: disposition,
    ...(document.mimeType ? { responseType: document.mimeType } : {})
  });

  return NextResponse.redirect(url, 302);
});
