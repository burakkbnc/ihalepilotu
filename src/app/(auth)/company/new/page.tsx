'use client';

import { useState, type FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

export default function NewCompanyPage() {
  const router = useRouter();
  const { profile, loading } = useAuth();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Kullanıcı zaten bir şirkete bağlıysa doğrudan dashboard'a git
  useEffect(() => {
    if (!loading && profile?.companyId) {
      router.replace('/dashboard');
    }
  }, [loading, profile, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError('Şirket adı en az 2 karakter olmalıdır.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/company/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed })
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body?.error?.message || 'Şirket oluşturulamadı.');
      }

      router.replace('/dashboard');
    } catch (err: any) {
      setError(err?.message || 'Şirket oluşturulamadı. Lütfen tekrar deneyin.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-lg font-medium text-slate-800">Şirketinizi Oluşturun</h2>
      <p className="text-sm text-slate-500">
        İhalelerinizi, dokümanlarınızı ve analizlerinizi bu şirket altında yöneteceksiniz.
        Şirketin sahibi (Owner) olarak ekip üyeleri davet edebilirsiniz.
      </p>

      <div>
        <label htmlFor="companyName" className="mb-1 block text-sm font-medium text-slate-600">
          Şirket Adı
        </label>
        <input
          id="companyName"
          type="text"
          required
          minLength={2}
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          placeholder="Örn: ABC Mühendislik A.Ş."
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
        {submitting ? 'Oluşturuluyor…' : 'Şirketi Oluştur ve Devam Et'}
      </button>
    </form>
  );
}
