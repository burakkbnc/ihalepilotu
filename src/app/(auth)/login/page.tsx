'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, LockKeyhole, Mail } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

function mapAuthError(code: string): string {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'E-posta veya şifre hatalı.';
    case 'auth/too-many-requests':
      return 'Çok fazla başarısız deneme. Lütfen daha sonra tekrar deneyin.';
    case 'auth/invalid-email':
      return 'Geçersiz e-posta adresi.';
    default:
      return 'Giriş yapılamadı. Lütfen tekrar deneyin.';
  }
}

export default function LoginPage() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await signIn(email, password);
      router.replace('/dashboard');
      router.refresh();
    } catch (err: any) {
      setError(mapAuthError(err?.code || ''));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="mb-9 text-center sm:text-left">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-600">İhale Pilotu</p>
        <h2 className="mt-3 text-4xl font-semibold tracking-[-0.045em] text-slate-950">Panele giriş yapın</h2>
        <p className="mt-3 text-base leading-7 text-slate-500">
          Şartname analizi ve teklif hazırlık akışınıza devam edin.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700">
            E-posta
          </label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} aria-hidden />
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-11 py-3.5 text-sm text-slate-900 transition placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-100"
              placeholder="ornek@firma.com"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700">
            Şifre
          </label>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} aria-hidden />
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-11 py-3.5 text-sm text-slate-900 transition placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-100"
              placeholder="••••••••"
            />
          </div>
        </div>

        {error && (
          <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-slate-950/20 transition hover:-translate-y-0.5 hover:bg-brand-700 disabled:translate-y-0 disabled:opacity-60"
        >
          {submitting ? 'Giriş yapılıyor…' : 'Giriş yap'}
          <ArrowRight className="transition group-hover:translate-x-0.5" size={16} aria-hidden />
        </button>
      </form>

      <p className="mt-7 text-center text-sm text-slate-500">
        Hesabınız yok mu?{' '}
        <Link href="/register" className="font-semibold text-brand-700 hover:underline">
          Kayıt olun
        </Link>
      </p>
    </div>
  );
}
