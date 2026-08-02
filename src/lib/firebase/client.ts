// ============================================================
// Firebase Client SDK — Tarayıcı tarafı
// Yalnızca NEXT_PUBLIC_* env değişkenlerini kullanır.
// ============================================================
import { initializeApp, getApps, getApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage, connectStorageEmulator, type FirebaseStorage } from 'firebase/storage';

const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || undefined,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);

/**
 * Firebase Storage henüz aktif değil (Cloud Billing gerektiriyor — Faz 2).
 * NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET tanımlı değilse `storage` null olur
 * ve Storage'a bağımlı özellikler (doküman yükleme) devre dışı kalır.
 * Faz 2'de bucket env değişkeni eklendiğinde otomatik olarak aktifleşir.
 */
export const STORAGE_ENABLED = Boolean(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);

export const storage: FirebaseStorage | null = STORAGE_ENABLED ? getStorage(firebaseApp) : null;

// Yerel geliştirmede Firebase Emulator Suite kullanmak isterseniz
// .env.local içine NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true ekleyin.
if (
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true' &&
  typeof window !== 'undefined' &&
  !(globalThis as any).__FIREBASE_EMULATORS_CONNECTED__
) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099');
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  if (storage) {
    connectStorageEmulator(storage, '127.0.0.1', 9199);
  }
  (globalThis as any).__FIREBASE_EMULATORS_CONNECTED__ = true;
}
