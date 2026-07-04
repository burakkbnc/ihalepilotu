import { adminDb } from '@/lib/firebase/admin';
import { requireSuperAdmin } from '@/lib/auth/adminGuard';
import { LifeBuoy } from 'lucide-react';

function formatDate(value?: string) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('tr-TR');
}

export default async function Page() {
  await requireSuperAdmin();
  const [ticketsSnap, logsSnap] = await Promise.all([
    adminDb.collection('supportTickets').orderBy('createdAt','desc').limit(50).get().catch(() => null),
    adminDb.collection('errorLogs').orderBy('createdAt','desc').limit(50).get().catch(() => null)
  ]);
  const tickets = ticketsSnap?.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) || [];
  const logs = logsSnap?.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) || [];
  return <div className="mx-auto w-full max-w-[1500px] space-y-6">
    <section className="rounded-[34px] border border-slate-200 bg-white p-8 shadow-[0_20px_70px_rgba(15,23,42,.08)]">
      <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-xs font-bold uppercase tracking-[.18em] text-blue-700"><LifeBuoy size={14}/> Super Admin</div>
      <h1 className="mt-5 text-4xl font-semibold tracking-tight text-slate-950">Destek / hata kayıtları</h1>
      <p className="mt-3 max-w-3xl text-slate-600">supportTickets ve errorLogs koleksiyonları bağlandı. Kayıt yoksa boş durum gösterilir.</p>
    </section>
    <section className="grid gap-4 xl:grid-cols-2">
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-semibold text-slate-950">Destek talepleri</h2><div className="mt-4 space-y-3">{tickets.map((t:any)=><div key={t.id} className="rounded-2xl border border-slate-100 p-4"><p className="font-semibold text-slate-950">{t.title || t.subject || 'Destek talebi'}</p><p className="mt-1 text-sm text-slate-500">{t.email || t.userEmail || '—'} · {formatDate(t.createdAt)}</p><p className="mt-2 text-sm text-slate-600">{t.message || t.description || 'Mesaj yok.'}</p></div>)}{tickets.length===0 && <p className="py-6 text-slate-500">Henüz destek talebi yok.</p>}</div></div>
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-semibold text-slate-950">Hata kayıtları</h2><div className="mt-4 space-y-3">{logs.map((l:any)=><div key={l.id} className="rounded-2xl border border-slate-100 p-4"><p className="font-semibold text-slate-950">{l.code || l.type || 'Hata'}</p><p className="mt-1 text-sm text-slate-500">{l.path || l.endpoint || '—'} · {formatDate(l.createdAt)}</p><p className="mt-2 text-sm text-slate-600">{l.message || l.errorMessage || 'Mesaj yok.'}</p></div>)}{logs.length===0 && <p className="py-6 text-slate-500">Henüz hata kaydı yok.</p>}</div></div>
    </section>
  </div>;
}
