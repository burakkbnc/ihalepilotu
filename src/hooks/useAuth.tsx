'use client';

// ============================================================
// useAuth — Firebase Auth durumunu ve Firestore kullanıcı profilini
// React context üzerinden tüm uygulamaya sağlar.
// ============================================================
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode
} from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/client';
import type { UserProfile } from '@/types';

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function createSessionCookie(idToken: string, expectedUid?: string, expectedEmail?: string | null) {
  const res = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message || 'Oturum oluşturulamadı.');
  }

  // Cookie'nin gerçekten yazıldığını ve sunucu tarafında geçerli
  // olduğunu teyit et. Bu sayede /company/new veya /dashboard'a
  // yönlendirme yapılmadan önce session cookie aktif garanti edilir.
  await verifySessionActive(expectedUid, expectedEmail);
}

/**
 * /api/auth/session GET ile session cookie'sinin aktif olduğunu doğrular.
 * Cookie yazımı ile bir sonraki isteğin arasında oluşabilecek kısa süreli
 * gecikmelere karşı birkaç kez tekrar dener.
 */
async function verifySessionActive(expectedUid?: string, expectedEmail?: string | null, retries = 5): Promise<void> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch('/api/auth/session', { method: 'GET', cache: 'no-store' });
    if (res.ok) {
      const body = await res.json().catch(() => null);
      const session = body?.data;
      const uidMatches = !expectedUid || session?.uid === expectedUid;
      const emailMatches = !expectedEmail || String(session?.email || '').toLowerCase() === expectedEmail.toLowerCase();
      if (uidMatches && emailMatches) return;
    }

    if (attempt < retries - 1) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw new Error('Oturum doğrulanamadı. Lütfen tekrar giriş yapmayı deneyin.');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setProfile(null);
        setLoading(false);
      }
    });
    return unsubscribeAuth;
  }, []);

  useEffect(() => {
    if (!user) return;

    const unsubscribeProfile = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return unsubscribeProfile;
  }, [user]);

  const signIn = async (email: string, password: string) => {
    // Önce eski HttpOnly session cookie temizlenir. Böylece başka hesapla
    // giriş yapıldığında sidebar eski kullanıcıyı / super admin yetkisini taşımaz.
    await fetch('/api/auth/session', { method: 'DELETE', cache: 'no-store' }).catch(() => null);

    const cred = await signInWithEmailAndPassword(auth, email, password);
    const idToken = await cred.user.getIdToken(true);
    await createSessionCookie(idToken, cred.user.uid, cred.user.email);
  };

  const signUp = async (email: string, password: string, displayName: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const idToken = await cred.user.getIdToken();

    // Firestore profilini sunucu üzerinden oluştur (Admin SDK ile)
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`
      },
      body: JSON.stringify({ displayName })
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error?.message || 'Kayıt sırasında hata oluştu.');
    }

    await createSessionCookie(idToken, cred.user.uid, cred.user.email);
  };

  const signOut = async () => {
    await fetch('/api/auth/session', { method: 'DELETE' });
    await firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth, AuthProvider içinde kullanılmalıdır.');
  }
  return ctx;
}
