import { adminDb } from '@/lib/firebase/admin';
import { requireSuperAdmin } from '@/lib/auth/adminGuard';
import { updateCompanyPlan, updateCompanyStatus } from '../actions';
import { BarChart3, Building2, CalendarDays, Coins, Crown, Gauge, PauseCircle, PlayCircle, Save, ShieldCheck, Sparkles, Users } from 'lucide-react';
import type { CompanyPlan } from '@/types';

const FALLBACK_PLANS: CompanyPlan['name'][] = ['trial', 'starter', 'pro', 'enterprise'];

function formatDate(value?: string) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('tr-TR');
}

function planLabel(name: string) {
  const labels: Record<string, string> = {
    trial: 'Trial',
    starter: 'Starter',
    pro: 'Pro',
    enterprise: 'Enterprise'
  };
  return labels[name] || name;
}

function num(n: number) {
  return new Intl.NumberFormat('tr-TR').format(n || 0);
}

function usd(n: number) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(n || 0);
}

export default async function Page() {
  await requireSuperAdmin();
  const [companySnap, packageSnap, runsSnap] = await Promise.all([
    adminDb.collection('companies').orderBy('createdAt', 'desc').limit(100).get().catch(() => null),
    adminDb.collection('packages').where('status', '==', 'active').get().catch(() => null),
    adminDb.collectionGroup('analysisRuns').orderBy('createdAt', 'desc').limit(1000).get().catch(() => null)
  ]);

  const rows = companySnap?.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) || [];
  const packageNames = packageSnap?.docs.map((d) => String((d.data() as any).name || d.id)).filter(Boolean) || [];
  const planNames = Array.from(new Set([...(packageNames.length ? packageNames : FALLBACK_PLANS)]));

  const usageByCompany = new Map<string, { totalTokens: number; cost: number; runs: number }>();
  (runsSnap?.docs || []).forEach((doc) => {
    const data = doc.data() as any;
    const companyId = data.companyId || '';
    if (!companyId) return;
    const current = usageByCompany.get(companyId) || { totalTokens: 0, cost: 0, runs: 0 };
    current.totalTokens += Number(data.totalTokens || 0);
    current.cost += Number(data.estimatedCostUsd || 0);
    current.runs += 1;
    usageByCompany.set(companyId, current);
  });

  const activeCount = rows.filter((r: any) => (r.status || 'active') !== 'disabled').length;
  const disabledCount = rows.length - activeCount;
  const totalTokens = Array.from(usageByCompany.values()).reduce((sum, row) => sum + row.totalTokens, 0);
  const totalCost = Array.from(usageByCompany.values()).reduce((sum, row) => sum + row.cost, 0);

  return <div className="mx-auto w-full max-w-[1500px] space-y-7">
    <section className="overflow-hidden rounded-[38px] border border-slate-800/60 bg-slate-950 shadow-[0_28px_90px_rgba(15,23,42,.22)]">
      <div className="relative grid gap-0 lg:grid-cols-[1.05fr_.95fr]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,rgba(56,189,248,.18),transparent_32%),radial-gradient(circle_at_10%_80%,rgba(37,99,235,.18),transparent_36%)]" />
        <div className="relative p-8 lg:p-11">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-600 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[.20em] text-sky-200"><Building2 size={14}/> Super Admin</div>
          <h1 className="mt-7 max-w-2xl text-5xl font-semibold tracking-tight text-white md:text-6xl">Şirket yönetimi</h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">Tenant şirketlerini, paket limitlerini ve şirket bazlı AI kullanımını tek ekrandan yönetin.</p>
        </div>
        <div className="relative grid gap-4 p-6 lg:grid-cols-2 lg:p-8">
          <div className="rounded-[28px] border border-white/10 bg-white/10 p-6 backdrop-blur"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-sky-400/15 text-sky-200"><Building2 size={24}/></div><p className="mt-8 text-sm font-semibold text-slate-300">Toplam şirket</p><p className="mt-2 text-5xl font-semibold text-white">{rows.length}</p></div>
          <div className="rounded-[28px] border border-white/10 bg-white/10 p-6 backdrop-blur"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-400/15 text-emerald-200"><ShieldCheck size={24}/></div><p className="mt-8 text-sm font-semibold text-slate-300">Aktif / pasif</p><p className="mt-2 text-5xl font-semibold text-white">{activeCount}<span className="text-2xl text-slate-400"> / {disabledCount}</span></p></div>
          <div className="rounded-[28px] border border-white/10 bg-white/10 p-6 backdrop-blur"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-cyan-400/15 text-cyan-200"><Sparkles size={24}/></div><p className="mt-8 text-sm font-semibold text-slate-300">Toplam token</p><p className="mt-2 text-4xl font-semibold text-white">{num(totalTokens)}</p></div>
          <div className="rounded-[28px] border border-white/10 bg-white/10 p-6 backdrop-blur"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-blue-400/15 text-blue-200"><Coins size={24}/></div><p className="mt-8 text-sm font-semibold text-slate-300">AI maliyeti</p><p className="mt-2 text-4xl font-semibold text-white">{usd(totalCost)}</p></div>
        </div>
      </div>
    </section>

    <section className="space-y-4">
      {rows.map((r: any) => {
        const status = r.status || 'active';
        const plan = r.plan || { name: 'trial', tenderLimit: 5, userLimit: 3 };
        const isDisabled = status === 'disabled';
        const usage = usageByCompany.get(r.id) || { totalTokens: 0, cost: 0, runs: 0 };

        return <article key={r.id} className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-[0_18px_60px_rgba(15,23,42,.06)] transition hover:-translate-y-0.5 hover:shadow-[0_26px_80px_rgba(15,23,42,.10)]">
          <div className="grid gap-5 2xl:grid-cols-[1.05fr_.95fr_1fr_auto] 2xl:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-semibold leading-tight text-slate-950">{r.name || r.id}</h2>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${isDisabled ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{isDisabled ? 'Pasif' : 'Aktif'}</span>
              </div>
              <p className="mt-2 break-all text-xs text-slate-400">{r.id}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-3 py-1"><ShieldCheck size={13}/> Owner: {r.ownerId || '—'}</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-3 py-1"><CalendarDays size={13}/> {formatDate(r.createdAt)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><Crown className="text-blue-700" size={18}/><p className="mt-2 text-xs font-semibold text-slate-500">Plan</p><p className="mt-1 font-semibold text-slate-950">{planLabel(plan.name || 'trial')}</p></div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><Gauge className="text-blue-700" size={18}/><p className="mt-2 text-xs font-semibold text-slate-500">İhale</p><p className="mt-1 font-semibold text-slate-950">{plan.tenderLimit ?? '∞'}</p></div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><Users className="text-blue-700" size={18}/><p className="mt-2 text-xs font-semibold text-slate-500">Kullanıcı</p><p className="mt-1 font-semibold text-slate-950">{plan.userLimit ?? '∞'}</p></div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><BarChart3 className="text-cyan-700" size={18}/><p className="mt-2 text-xs font-semibold text-slate-500">Token</p><p className="mt-1 font-semibold text-slate-950">{num(usage.totalTokens)}</p></div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><Coins className="text-emerald-700" size={18}/><p className="mt-2 text-xs font-semibold text-slate-500">Maliyet</p><p className="mt-1 font-semibold text-slate-950">{usd(usage.cost)}</p></div>
            </div>

            <form action={updateCompanyPlan} className="rounded-3xl border border-slate-100 bg-slate-50/80 p-4">
              <input type="hidden" name="companyId" value={r.id} />
              <div className="grid grid-cols-2 gap-3 md:grid-cols-[1.1fr_.7fr_.7fr_auto]">
                <label className="space-y-1"><span className="text-[11px] font-bold uppercase tracking-[.12em] text-slate-400">Plan</span><select name="planName" defaultValue={plan.name || 'trial'} className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300">{planNames.map((name) => <option key={name} value={name}>{planLabel(name)}</option>)}</select></label>
                <label className="space-y-1"><span className="text-[11px] font-bold uppercase tracking-[.12em] text-slate-400">İhale limiti</span><input name="tenderLimit" defaultValue={plan.tenderLimit ?? ''} placeholder="∞" className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300" /></label>
                <label className="space-y-1"><span className="text-[11px] font-bold uppercase tracking-[.12em] text-slate-400">User limiti</span><input name="userLimit" defaultValue={plan.userLimit ?? ''} placeholder="∞" className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-300" /></label>
                <button className="mt-5 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-slate-800"><Save size={15}/> Kaydet</button>
              </div>
            </form>

            <form action={updateCompanyStatus} className="2xl:justify-self-end">
              <input type="hidden" name="companyId" value={r.id} />
              <input type="hidden" name="status" value={isDisabled ? 'active' : 'disabled'} />
              <button className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold 2xl:w-auto ${isDisabled ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-rose-50 text-rose-700 hover:bg-rose-100'}`}>{isDisabled ? <PlayCircle size={16}/> : <PauseCircle size={16}/>} {isDisabled ? 'Aktife al' : 'Pasife çek'}</button>
            </form>
          </div>
        </article>;
      })}
      {rows.length === 0 && <div className="rounded-[28px] border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">Henüz şirket kaydı yok.</div>}
    </section>
  </div>;
}
