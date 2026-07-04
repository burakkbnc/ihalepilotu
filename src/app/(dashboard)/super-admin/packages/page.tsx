import { adminDb } from '@/lib/firebase/admin';
import { requireSuperAdmin } from '@/lib/auth/adminGuard';
import { createPackage, updatePackageStatus } from '../actions';
import { Package, PauseCircle, PlayCircle, Plus } from 'lucide-react';

const DEFAULT_PACKAGES = [
  { id:'trial', name:'trial', label:'Trial', tenderLimit:5, userLimit:3, monthlyPrice:0, status:'active' },
  { id:'starter', name:'starter', label:'Starter', tenderLimit:25, userLimit:10, monthlyPrice:0, status:'active' },
  { id:'pro', name:'pro', label:'Pro', tenderLimit:100, userLimit:30, monthlyPrice:0, status:'active' },
  { id:'enterprise', name:'enterprise', label:'Enterprise', tenderLimit:null, userLimit:null, monthlyPrice:0, status:'active' }
];

export default async function Page() {
  await requireSuperAdmin();
  const snap = await adminDb.collection('packages').orderBy('createdAt','desc').get().catch(() => null);
  const firestoreRows = snap?.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) || [];
  const rows = firestoreRows.length ? firestoreRows : DEFAULT_PACKAGES;

  return <div className="mx-auto w-full max-w-[1500px] space-y-6">
    <section className="rounded-[34px] border border-slate-200 bg-white p-8 shadow-[0_20px_70px_rgba(15,23,42,.08)]">
      <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-xs font-bold uppercase tracking-[.18em] text-blue-700"><Package size={14}/> Super Admin</div>
      <h1 className="mt-5 text-4xl font-semibold tracking-tight text-slate-950">Paketler</h1>
      <p className="mt-3 max-w-3xl text-slate-600">Yeni paket ekleyin, limitleri tanımlayın ve paketleri aktif/pasif yönetin.</p>
    </section>

    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="flex items-center gap-2 text-xl font-semibold text-slate-950"><Plus size={18}/> Paket ekle</h2>
      <form action={createPackage} className="mt-5 grid gap-3 md:grid-cols-5">
        <input name="name" required placeholder="pro_plus" className="rounded-xl border border-slate-200 px-4 py-3 text-sm" />
        <input name="label" placeholder="Pro Plus" className="rounded-xl border border-slate-200 px-4 py-3 text-sm" />
        <input name="tenderLimit" placeholder="İhale limiti" className="rounded-xl border border-slate-200 px-4 py-3 text-sm" />
        <input name="userLimit" placeholder="Kullanıcı limiti" className="rounded-xl border border-slate-200 px-4 py-3 text-sm" />
        <input name="monthlyPrice" placeholder="Aylık ücret" className="rounded-xl border border-slate-200 px-4 py-3 text-sm" />
        <button className="md:col-span-5 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white">Paketi kaydet</button>
      </form>
    </section>

    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{rows.map((p:any)=>{ const status = p.status || 'active'; return <div key={p.id || p.name} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-blue-700">{p.name}</p><h3 className="mt-2 text-2xl font-semibold text-slate-950">{p.label || p.name}</h3></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${status === 'disabled' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{status === 'disabled' ? 'Pasif' : 'Aktif'}</span></div>
      <div className="mt-5 space-y-2 text-sm text-slate-600"><p>İhale limiti: <b>{p.tenderLimit ?? 'Sınırsız'}</b></p><p>Kullanıcı limiti: <b>{p.userLimit ?? 'Sınırsız'}</b></p><p>Aylık ücret: <b>{p.monthlyPrice ? `${p.monthlyPrice} TL` : 'Tanımsız'}</b></p></div>
      <form action={updatePackageStatus} className="mt-5"><input type="hidden" name="id" value={p.id || p.name}/><input type="hidden" name="status" value={status === 'disabled' ? 'active' : 'disabled'}/><button className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${status === 'disabled' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{status === 'disabled' ? <PlayCircle size={14}/> : <PauseCircle size={14}/>} {status === 'disabled' ? 'Aktife al' : 'Pasife çek'}</button></form>
    </div>})}</section>
  </div>;
}
