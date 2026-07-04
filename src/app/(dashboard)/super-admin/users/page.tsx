import { adminDb } from '@/lib/firebase/admin';
import { requireSuperAdmin } from '@/lib/auth/adminGuard';
import { updateUserStatus } from '../actions';
import { PauseCircle, PlayCircle, Users } from 'lucide-react';

function formatDate(value?: string) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('tr-TR');
}

export default async function Page() {
  await requireSuperAdmin();
  const snap = await adminDb.collection('users').orderBy('createdAt','desc').limit(150).get().catch(() => null);
  const rows = snap?.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) || [];
  return <div className="mx-auto w-full max-w-[1500px] space-y-6">
    <section className="rounded-[34px] border border-slate-200 bg-white p-8 shadow-[0_20px_70px_rgba(15,23,42,.08)]">
      <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-xs font-bold uppercase tracking-[.18em] text-blue-700"><Users size={14}/> Super Admin</div>
      <h1 className="mt-5 text-4xl font-semibold tracking-tight text-slate-950">Kullanıcılar</h1>
      <p className="mt-3 max-w-3xl text-slate-600">Platform kullanıcılarını görüntüleyin ve hesapları aktif/pasif yönetin.</p>
    </section>
    <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-[.14em] text-slate-500"><tr><th className="px-6 py-4">Kullanıcı</th><th>E-posta</th><th>Rol</th><th>Şirket</th><th>Durum</th><th>Oluşturma</th><th>Aksiyon</th></tr></thead><tbody>{rows.map((r:any)=>{ const status = r.status || 'active'; return <tr key={r.uid || r.id || r.email} className="border-t border-slate-100"><td className="px-6 py-5 font-semibold text-slate-950">{r.displayName || '—'}</td><td>{r.email}</td><td>{r.role || '—'}</td><td className="text-slate-500">{r.companyId || '—'}</td><td><span className={`rounded-full px-3 py-1 text-xs font-bold ${status === 'disabled' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{status === 'disabled' ? 'Pasif' : 'Aktif'}</span></td><td>{formatDate(r.createdAt)}</td><td><form action={updateUserStatus}><input type="hidden" name="uid" value={r.uid || r.id}/><input type="hidden" name="status" value={status === 'disabled' ? 'active' : 'disabled'}/><button className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${status === 'disabled' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{status === 'disabled' ? <PlayCircle size={14}/> : <PauseCircle size={14}/>} {status === 'disabled' ? 'Aktife al' : 'Pasife çek'}</button></form></td></tr>})}</tbody></table>{rows.length===0 && <p className="px-6 py-8 text-slate-500">Henüz kullanıcı kaydı yok.</p>}</div></section>
  </div>;
}
