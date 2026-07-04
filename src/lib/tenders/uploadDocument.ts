'use client';

import { ref, uploadBytes } from 'firebase/storage';
import { storage, STORAGE_ENABLED } from '@/lib/firebase/client';
import type { TenderDocument, TenderDocumentType } from '@/types/tender';

const MAX_UPLOAD_SIZE = 25 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel'
]);

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.txt', '.xls', '.xlsx', '.png', '.jpg', '.jpeg', '.webp']);

function getExtension(fileName: string) {
  const index = fileName.lastIndexOf('.');
  return index >= 0 ? fileName.slice(index).toLowerCase() : '';
}

function isAllowedFile(file: File) {
  const extension = getExtension(file.name);
  return ALLOWED_MIME_TYPES.has(file.type) || file.type.startsWith('image/') || ALLOWED_EXTENSIONS.has(extension);
}


function safeFileName(fileName: string) {
  return fileName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 140) || 'document';
}

export async function uploadTenderDocument({
  companyId,
  tenderId,
  documentType,
  file,
  documentDate
}: {
  companyId: string;
  tenderId: string;
  documentType: TenderDocumentType;
  file: File;
  /** Zeyilname/düzeltme ilanı gibi güncelleme dokümanları için belgenin kendi tarihi (opsiyonel) */
  documentDate?: string | null;
}): Promise<TenderDocument> {
  if (!STORAGE_ENABLED || !storage) {
    throw new Error('Firebase Storage aktif değil. NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET env değişkenini kontrol edin.');
  }

  if (file.size > MAX_UPLOAD_SIZE) {
    throw new Error('Dosya boyutu 25 MB sınırını aşamaz.');
  }

  if (!isAllowedFile(file)) {
    throw new Error('Desteklenen dosya türleri: PDF, Word, Excel, TXT ve görsel dosyaları.');
  }

  const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeFileName(file.name)}`;
  const storagePath = `companies/${companyId}/tenders/${tenderId}/documents/${uniqueName}`;

  await uploadBytes(ref(storage, storagePath), file, {
    contentType: file.type || 'application/octet-stream',
    customMetadata: {
      originalName: file.name,
      documentType,
      tenderId,
      companyId
    }
  });

  const res = await fetch(`/api/tenders/${tenderId}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      documentType,
      fileName: file.name,
      mimeType: file.type || null,
      fileSize: file.size,
      storagePath,
      documentDate: documentDate || null
    })
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.error?.message || 'Dosya yüklendi fakat doküman kaydı oluşturulamadı.');
  }

  return body.data.document as TenderDocument;
}
