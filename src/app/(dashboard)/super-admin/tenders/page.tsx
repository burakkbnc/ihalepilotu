import Link from 'next/link';
import { adminDb } from '@/lib/firebase/admin';
import { requireAdminPermission } from '@/lib/auth/adminGuard';
import { Archive, Building2, FileText, Search, Trash2 } from 'lucide-react';
import TenderAdminActions from './TenderAdminActions';

export const dynamic = 'force-dynamic';

type SearchParams = { q?: string; view?: string };

function fmt(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default async function SuperAdminTendersPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdminPermission('tenders');

  const companySnaps = await adminDb.collection('companies').get();
  const companies = new Map(companySnaps.docs.map((doc) => [doc.id, String(doc.data().name || doc.id)]));

  const group = await adminDb.collectionGroup('tenders').get();
  const q = String(searchParams.q || '').trim().toLocaleLowerCase('tr-TR');
  const showTrash = searchParams.view === 'trash';

  const all = group.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) }));
  const rows = all
    .filter((row) => Boolean(row.deletedAt) === showTrash)
    .filter((row) => {
      if (!q) return true;
      const companyName = companies.get(row.companyId) || '';
      return [row.title, row.referenceNumber, row.institutionName, companyName, row.id]
        .some((value) => String(value || '').toLocaleLowerCase('tr-TR').includes(q));
    })
    .sort((a, b) => String(b.deletedAt || b.createdAt || '').localeCompare(String(a.deletedAt || a.createdAt || '')));

  const activeCount = all.filter((row) => !row.deletedAt).length;
  const trashCount = all.filter((row) => row.deletedAt).length;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[32px] bg-slate-950 p-7 text-white shadow-[0_24px_80px_rgba(15,23,42,.22)]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.2em] text-sky-300">Platform yönetimi</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">İhale kayıtları</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Demo ve müşteri ihalelerini şirketler arasında görüntüleyin. Silme işlemleri önce geri alınabilir çöp kutusuna taşınır.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/10 px-5 py-4"><FileText size={18} className="text-sky-300"/><p className="mt-2 text-xs text-slate-300">Aktif</p><p className="text-2xl font-semibold">{activeCount}</p></div>
            <div className="rounded-2xl border border-white/10 bg-white/10 px-5 py-4"><Trash2 size={18} className="text-rose-300"/><p className="mt-2 text-xs text-slate-300">Çöp kutusu</p><p className="text-2xl font-semibold">{trashCount}</p></div>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_18px_60px_rgba(15,23,42,.06)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-2">
            <Link href="/super-admin/tenders" className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold ${!showTrash ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600'}`}><FileText size={15}/> Aktif ihaleler</Link>
            <Link href="/super-admin/tenders?view=trash" className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold ${showTrash ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600'}`}><Archive size={15}/> Çöp kutusu</Link>
          </div>
          <form className="relative w-full md:w-96">
            {showTrash && <input type="hidden" name="view" value="trash" />}
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
            <input name="q" defaultValue={searchParams.q || ''} placeholder="İhale, kurum, şirket veya ID ara" className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm outline-none focus:border-sky-300 focus:bg-white" />
          </form>
        </div>
      </section>

      <section className="space-y-3">
        {rows.map((row) => (
          <article key={`${row.companyId}-${row.id}`} className="rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_14px_45px_rgba(15,23,42,.05)]">
            <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold text-slate-950">{row.title || 'İsimsiz ihale'}</h2>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${row.deletedAt ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{row.deletedAt ? 'Çöp kutusunda' : row.status || 'draft'}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1.5"><Building2 size={13}/> {companies.get(row.companyId) || row.companyId}</span>
                  <span>İdare: {row.institutionName || '—'}</span>
                  <span>İKN: {row.referenceNumber || '—'}</span>
                  <span>Doküman: {row.documentCount ?? 0}</span>
                  <span>Oluşturma: {fmt(row.createdAt)}</span>
                  {row.deletedAt && <span>Silinme: {fmt(row.deletedAt)}</span>}
                </div>
                <p className="mt-2 break-all text-[11px] text-slate-400">{row.companyId} / {row.id}</p>
              </div>
              <TenderAdminActions companyId={row.companyId} tenderId={row.id} title={row.title || 'İsimsiz ihale'} isDeleted={Boolean(row.deletedAt)} />
            </div>
          </article>
        ))}
        {rows.length === 0 && <div className="rounded-[28px] border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500">Bu görünümde ihale bulunamadı.</div>}
      </section>
    </div>
  );
}
