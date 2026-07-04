'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';

function mapAuthError(code: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'Bu e-posta adresi ile zaten bir hesap mevcut.';
    case 'auth/weak-password':
      return 'Şifre en az 6 karakter olmalıdır.';
    case 'auth/invalid-email':
      return 'Geçersiz e-posta adresi.';
    default:
      return 'Kayıt sırasında bir hata oluştu. Lütfen tekrar deneyin.';
  }
}

export default function RegisterPage() {
  const router = useRouter();
  const { signUp } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('Şifre en az 6 karakter olmalıdır.');
      return;
    }

    setSubmitting(true);
    try {
      await signUp(email, password, displayName);
      // Yeni kullanıcının companyId'si yok — şirket oluşturma adımına yönlendir
      router.replace('/company/new');
    } catch (err: any) {
      setError(mapAuthError(err?.code || ''));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-lg font-medium text-slate-800">Hesap Oluştur</h2>

      <div>
        <label htmlFor="displayName" className="mb-1 block text-sm font-medium text-slate-600">
          Ad Soyad
        </label>
        <input
          id="displayName"
          type="text"
          required
          minLength={2}
          maxLength={80}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          placeholder="Adınız Soyadınız"
        />
      </div>

      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-600">
          E-posta
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          placeholder="ornek@firma.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-600">
          Şifre
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          placeholder="En az 6 karakter"
        />
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
      >
        {submitting ? 'Hesap oluşturuluyor…' : 'Kayıt Ol'}
      </button>

      <p className="text-center text-sm text-slate-500">
        Zaten hesabınız var mı?{' '}
        <Link href="/login" className="font-medium text-brand-600 hover:underline">
          Giriş yapın
        </Link>
      </p>
    </form>
  );
}
