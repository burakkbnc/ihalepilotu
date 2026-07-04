import Link from 'next/link';
import { adminDb } from '@/lib/firebase/admin';
import { requireSuperAdmin } from '@/lib/auth/adminGuard';
import { BarChart3, Building2, LifeBuoy, Package, ShieldCheck, Users, Activity, ArrowRight } from 'lucide-react';

async function safeCount(path: 'companies' | 'users' | 'packages' | 'supportTickets') {
  const snap = await adminDb.collection(path).count().get().catch(() => null);
  return snap?.data().count ?? 0;
}

async function getCounts() {
  const [companies, users, packagesCount, support, tenders] = await Promise.all([
    safeCount('companies'),
    safeCount('users'),
    safeCount('packages'),
    safeCount('supportTickets'),
    adminDb.collectionGroup('tenders').count().get().catch(() => null)
  ]);
  return { companies, users, packages: packagesCount, support, tenders: tenders?.data().count ?? 0 };
}

export default async function Page() {
  await requireSuperAdmin();
  const counts = await getCounts();
  const cards = [
    { label: 'Şirketler', value: counts.companies, href: '/super-admin/companies', icon: Building2, desc: 'Firma listeleme, paket değiştirme, pasife alma' },
    { label: 'Kullanıcılar', value: counts.users, href: '/super-admin/users', icon: Users, desc: 'Kullanıcı durumu, rol ve şirket bağı takibi' },
    { label: 'Paketler', value: counts.packages || 4, href: '/super-admin/packages', icon: Package, desc: 'Paket ekleme ve aktif/pasif yönetimi' },
    { label: 'Analiz kayıtları', value: counts.tenders, href: '/super-admin/usage', icon: BarChart3, desc: 'Analiz hacmi ve AI maliyet izleme' },
    { label: 'Destek / hata', value: counts.support, href: '/super-admin/support', icon: LifeBuoy, desc: 'Destek talepleri ve hata logları' }
  ];

  return <div className="mx-auto w-full max-w-[1500px] space-y-6">
    <section className="overflow-hidden rounded-[34px] border border-slate-200 bg-slate-950 p-8 text-white shadow-[0_24px_80px_rgba(15,23,42,.20)]">
      <div className="relative">
        <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[.18em] text-sky-200"><ShieldCheck size={14}/> Super Admin</div>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight lg:text-5xl">Platform yönetim merkezi</h1>
        <p className="mt-3 max-w-3xl text-slate-300">Bu hesap sadece platform yönetimini görür; ihale analizi, şirket hafızası ve kullanıcı operasyon ekranları Super Admin için kapatıldı.</p>
      </div>
    </section>

    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => { const Icon = card.icon; return <Link key={card.label} href={card.href} className="group rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl">
        <div className="flex items-start justify-between gap-4"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-700"><Icon size={22}/></div><ArrowRight className="text-slate-300 transition group-hover:translate-x-1 group-hover:text-blue-600" size={18}/></div>
        <p className="mt-5 text-sm font-bold uppercase tracking-[.14em] text-slate-500">{card.label}</p>
        <p className="mt-2 text-4xl font-semibold text-slate-950">{card.value}</p>
        <p className="mt-3 text-sm leading-6 text-slate-500">{card.desc}</p>
      </Link>})}
    </section>

    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-50 text-emerald-700"><Activity size={18}/></div><div><h2 className="text-xl font-semibold text-slate-950">Operasyon notu</h2><p className="text-sm text-slate-500">Paket, firma pasifleştirme ve kullanıcı pasifleştirme aksiyonları artık gerçek Firestore kayıtlarını günceller.</p></div></div>
    </section>
  </div>;
}
