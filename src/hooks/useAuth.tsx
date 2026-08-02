'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
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
  signInWithGoogle: () => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function createSessionCookie(idToken: string) {
  const res = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message || 'Oturum oluşturulamadı.');
  }
}

async function ensureServerProfile(user: User, displayName?: string | null) {
  const idToken = await user.getIdToken();
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ displayName: displayName || user.displayName || user.email?.split('@')[0] || 'Kullanıcı' })
  });
  if (!res.ok && res.status !== 409) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message || 'Kullanıcı profili oluşturulamadı.');
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => onAuthStateChanged(auth, (firebaseUser) => {
    setUser(firebaseUser);
    if (!firebaseUser) { setProfile(null); setLoading(false); }
  }), []);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, 'users', user.uid), (snap) => {
      setProfile(snap.exists() ? (snap.data() as UserProfile) : null);
      setLoading(false);
    }, () => setLoading(false));
  }, [user]);

  const signIn = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    await createSessionCookie(await cred.user.getIdToken());
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const cred = await signInWithPopup(auth, provider);
    await ensureServerProfile(cred.user, cred.user.displayName);
    await createSessionCookie(await cred.user.getIdToken());
  };

  const signUp = async (email: string, password: string, displayName: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await ensureServerProfile(cred.user, displayName);
    if (process.env.NEXT_PUBLIC_REQUIRE_EMAIL_VERIFICATION === 'true') await sendEmailVerification(cred.user);
    await createSessionCookie(await cred.user.getIdToken());
  };

  const resetPassword = async (email: string) => sendPasswordResetEmail(auth, email);
  const resendVerification = async () => { if (auth.currentUser) await sendEmailVerification(auth.currentUser); };
  const signOut = async () => { await fetch('/api/auth/session', { method: 'DELETE' }); await firebaseSignOut(auth); };

  return <AuthContext.Provider value={{ user, profile, loading, signIn, signInWithGoogle, signUp, resetPassword, resendVerification, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth, AuthProvider içinde kullanılmalıdır.');
  return ctx;
}
