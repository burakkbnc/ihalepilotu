// ============================================================
// Firebase Admin SDK — Sunucu tarafı (API Routes / Server Actions)
// UYARI: Bu dosya yalnızca sunucu kodunda import edilmelidir.
// Service account anahtarını içerir, asla client'a sızdırılmamalıdır.
// ============================================================
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage, type Storage } from 'firebase-admin/storage';

function getAdminApp(): App {
  if (getApps().length) {
    return getApps()[0];
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  // Vercel/CI ortamlarında \n karakterleri kaçış (escape) olarak gelir.
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Firebase Admin ortam değişkenleri eksik: FIREBASE_ADMIN_PROJECT_ID, ' +
        'FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY tanımlanmalıdır.'
    );
  }

  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || undefined;

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    // storageBucket tanımsızsa Admin SDK varsayılan (geçersiz) bucket adı
    // üretmeye çalışmaz; Storage o zaman kullanılamaz olarak işaretlenir.
    ...(storageBucket ? { storageBucket } : {})
  });
}

const adminApp = getAdminApp();

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);

/**
 * Firebase Storage henüz aktif değil (Cloud Billing gerektiriyor — Faz 2).
 * NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET tanımlı değilse adminStorage null olur.
 * Faz 2'de bucket env değişkeni eklendiğinde otomatik olarak aktifleşir.
 */
export const ADMIN_STORAGE_ENABLED = Boolean(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);

export const adminStorage: Storage | null = ADMIN_STORAGE_ENABLED ? getStorage(adminApp) : null;
