'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Mail } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setLoading(true); setMessage(null);
    try { await resetPassword(email); setMessage('Şifre sıfırlama bağlantısı e-posta adresinize gönderildi.'); }
    catch { setMessage('İşlem tamamlanamadı. E-posta adresini kontrol edip tekrar deneyin.'); }
    finally { setLoading(false); }
  };
  return <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-600">İhale Pilotu</p><h2 className="mt-3 text-4xl font-semibold tracking-[-0.045em] text-slate-950">Şifrenizi yenileyin</h2><p className="mt-3 text-base leading-7 text-slate-500">Kayıtlı e-posta adresinize güvenli bir sıfırlama bağlantısı gönderelim.</p><form onSubmit={submit} className="mt-8 space-y-5"><div className="relative"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17}/><input type="email" required value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="ornek@firma.com" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-11 py-3.5 text-sm focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-100"/></div>{message&&<p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">{message}</p>}<button disabled={loading} className="w-full rounded-xl bg-slate-950 px-4 py-3.5 text-sm font-semibold text-white disabled:opacity-60">{loading?'Gönderiliyor…':'Sıfırlama bağlantısı gönder'}</button></form><p className="mt-6 text-center text-sm"><Link href="/login" className="font-semibold text-brand-700 hover:underline">Giriş ekranına dön</Link></p></div>;
}
