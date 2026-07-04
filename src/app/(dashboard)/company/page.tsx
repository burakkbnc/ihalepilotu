import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Building2, FileText, LibraryBig, Settings, Users } from 'lucide-react';
import { redirectSuperAdminAwayFromCompanyApp } from '@/lib/auth/adminGuard';

export default async function CompanyOverviewPage() {
  const result = await redirectSuperAdminAwayFromCompanyApp();
  if (!result) redirect('/login');
  const { profile } = result;
  if (!profile.companyId || !['owner', 'admin'].includes(profile.role || '')) redirect('/dashboard');

  const cards = [
    { label: 'Kullanıcılar', href: '/company/users', icon: Users, roles: ['owner'] },
    { label: 'Şirket Belgeleri', href: '/company/documents', icon: LibraryBig, roles: ['owner', 'admin'] },
    { label: 'Geçmiş İhaleler', href: '/company/past-tenders', icon: FileText, roles: ['owner', 'admin'] },
    { label: 'Ayarlar', href: '/company/settings', icon: Settings, roles: ['owner'] }
  ].filter((x) => x.roles.includes(profile.role || ''));

  return <div className="mx-auto w-full max-w-[1400px] space-y-6">
    <section className="rounded-[34px] border border-slate-200 bg-white p-8 shadow-[0_20px_70px_rgba(15,23,42,.08)]">
      <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-xs font-bold uppercase tracking-[.18em] text-blue-700"><Building2 size={14}/> Şirket Paneli</div>
      <h1 className="mt-5 text-4xl font-semibold tracking-tight text-slate-950">Genel Bakış</h1>
      <p className="mt-3 max-w-3xl text-slate-600">Şirket kullanıcıları, belgeleri, geçmiş ihaleleri ve ayarları ayrı başlıklar altında toplandı.</p>
    </section>
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{cards.map((card) => { const Icon = card.icon; return <Link key={card.label} href={card.href} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-700"><Icon size={22}/></div><p className="mt-5 text-xl font-semibold text-slate-950">{card.label}</p><p className="mt-2 text-sm text-slate-500">Bu modüle git</p></Link>})}</section>
  </div>;
}
