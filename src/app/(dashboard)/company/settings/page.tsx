import { redirect } from 'next/navigation';
import { Settings } from 'lucide-react';
import { redirectSuperAdminAwayFromCompanyApp } from '@/lib/auth/adminGuard';

export default async function CompanySettingsPage() {
  const result = await redirectSuperAdminAwayFromCompanyApp();
  if (!result) redirect('/login');
  if (result.profile.role !== 'owner') redirect('/dashboard');

  return <div className="mx-auto w-full max-w-[1100px] space-y-6">
    <section className="rounded-[34px] border border-slate-200 bg-white p-8 shadow-[0_20px_70px_rgba(15,23,42,.08)]">
      <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-xs font-bold uppercase tracking-[.18em] text-blue-700"><Settings size={14}/> Şirket Paneli</div>
      <h1 className="mt-5 text-4xl font-semibold tracking-tight text-slate-950">Ayarlar</h1>
      <p className="mt-3 max-w-3xl text-slate-600">Paket, fatura, şirket bilgileri ve erişim ayarları için mimari alan hazırlandı. Kritik ayarlar owner rolüyle sınırlandı.</p>
    </section>
    <section className="rounded-[28px] border border-slate-200 bg-white p-6"><p className="text-slate-600">Bir sonraki sprintte şirket adı, paket yükseltme, fatura bilgileri ve güvenlik ayarları buraya bağlanabilir.</p></section>
  </div>;
}
