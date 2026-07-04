import { adminDb } from '@/lib/firebase/admin';
import { requireSuperAdmin } from '@/lib/auth/adminGuard';
import { BarChart3, BrainCircuit, Building2, Coins, Database, FileText, Sparkles } from 'lucide-react';

function usd(n: number) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(n || 0);
}

function num(n: number) {
  return new Intl.NumberFormat('tr-TR').format(n || 0);
}

function formatDate(value?: string) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('tr-TR');
}

export default async function Page() {
  await requireSuperAdmin();
  const [companiesSnap, users, tenders, runsCount, runsSnap] = await Promise.all([
    adminDb.collection('companies').limit(500).get().catch(() => null),
    adminDb.collection('users').count().get().catch(() => null),
    adminDb.collectionGroup('tenders').count().get().catch(() => null),
    adminDb.collectionGroup('analysisRuns').count().get().catch(() => null),
    adminDb.collectionGroup('analysisRuns').orderBy('createdAt', 'desc').limit(1000).get().catch(() => null)
  ]);

  const companyMap = new Map<string, any>();
  (companiesSnap?.docs || []).forEach((doc) => companyMap.set(doc.id, { id: doc.id, ...(doc.data() as any) }));

  const runs = (runsSnap?.docs || []).map((doc) => {
    const data = doc.data() as any;
    const tenderRef = doc.ref.parent.parent;
    const companyRef = tenderRef?.parent.parent;
    const companyId = data.companyId || companyRef?.id || '';
    return { id: doc.id, companyId, ...(data as any) };
  });

  const totals = runs.reduce((acc, r: any) => {
    acc.inputTokens += Number(r.inputTokens || 0);
    acc.outputTokens += Number(r.outputTokens || 0);
    acc.totalTokens += Number(r.totalTokens || 0);
    acc.estimatedCostUsd += Number(r.estimatedCostUsd || 0);
    return acc;
  }, { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 });

  const byProvider = new Map<string, { provider: string; count: number; tokens: number; cost: number }>();
  const byCompany = new Map<string, { companyId: string; companyName: string; count: number; inputTokens: number; outputTokens: number; tokens: number; cost: number; lastRunAt: string | null }>();

  runs.forEach((r: any) => {
    const provider = r.provider || 'unknown';
    const providerRow = byProvider.get(provider) || { provider, count: 0, tokens: 0, cost: 0 };
    providerRow.count += 1;
    providerRow.tokens += Number(r.totalTokens || 0);
    providerRow.cost += Number(r.estimatedCostUsd || 0);
    byProvider.set(provider, providerRow);

    const companyId = r.companyId || 'unknown';
    const company = companyMap.get(companyId);
    const companyRow = byCompany.get(companyId) || {
      companyId,
      companyName: company?.name || companyId || 'Bilinmeyen şirket',
      count: 0,
      inputTokens: 0,
      outputTokens: 0,
      tokens: 0,
      cost: 0,
      lastRunAt: null
    };
    companyRow.count += 1;
    companyRow.inputTokens += Number(r.inputTokens || 0);
    companyRow.outputTokens += Number(r.outputTokens || 0);
    companyRow.tokens += Number(r.totalTokens || 0);
    companyRow.cost += Number(r.estimatedCostUsd || 0);
    if (r.createdAt && (!companyRow.lastRunAt || new Date(r.createdAt).getTime() > new Date(companyRow.lastRunAt).getTime())) {
      companyRow.lastRunAt = r.createdAt;
    }
    byCompany.set(companyId, companyRow);
  });

  const providerRows = Array.from(byProvider.values()).sort((a, b) => b.cost - a.cost);
  const companyRows = Array.from(byCompany.values()).sort((a, b) => b.cost - a.cost || b.tokens - a.tokens);

  const cards = [
    { label: 'Şirket', value: companiesSnap?.size ?? 0, icon: Building2 },
    { label: 'Kullanıcı', value: users?.data().count ?? 0, icon: FileText },
    { label: 'İhale dosyası', value: tenders?.data().count ?? 0, icon: BarChart3 },
    { label: 'Analiz çalışması', value: runsCount?.data().count ?? 0, icon: BrainCircuit }
  ];

  const costCards = [
    { label: 'Input token', value: num(totals.inputTokens), icon: Database },
    { label: 'Output token', value: num(totals.outputTokens), icon: Database },
    { label: 'Toplam token', value: num(totals.totalTokens), icon: BrainCircuit },
    { label: 'Tahmini AI maliyeti', value: usd(totals.estimatedCostUsd), icon: Coins }
  ];

  return <div className="mx-auto w-full max-w-[1500px] space-y-7">
    <section className="overflow-hidden rounded-[38px] border border-slate-800/60 bg-slate-950 shadow-[0_28px_90px_rgba(15,23,42,.22)]">
      <div className="relative grid gap-0 lg:grid-cols-[1.05fr_.95fr]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,rgba(56,189,248,.18),transparent_32%),radial-gradient(circle_at_10%_80%,rgba(37,99,235,.18),transparent_36%)]" />
        <div className="relative p-8 lg:p-11">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-600 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[.20em] text-sky-200"><BarChart3 size={14}/> Super Admin</div>
          <h1 className="mt-7 max-w-2xl text-5xl font-semibold tracking-tight text-white md:text-6xl">AI kullanım merkezi</h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">Şirket bazlı token tüketimini, provider maliyetini ve son analiz hareketlerini takip edin.</p>
        </div>
        <div className="relative grid gap-4 p-6 lg:grid-cols-2 lg:p-8">
          {costCards.map((r) => { const Icon = r.icon; return <div key={r.label} className="rounded-[28px] border border-white/10 bg-white/10 p-6 backdrop-blur"><div className="grid h-14 w-14 place-items-center rounded-2xl bg-sky-400/15 text-sky-200"><Icon size={24}/></div><p className="mt-8 text-sm font-semibold text-slate-300">{r.label}</p><p className="mt-2 text-3xl font-semibold text-white">{r.value}</p></div>; })}
        </div>
      </div>
    </section>

    <section className="grid gap-4 md:grid-cols-4">{cards.map((r: any) => { const Icon = r.icon; return <div key={r.label} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-700"><Icon size={22}/></div><p className="mt-5 text-sm font-semibold text-slate-500">{r.label}</p><p className="mt-3 text-4xl font-semibold text-slate-950">{num(r.value)}</p></div>; })}</section>

    <section className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-6">
        <div className="inline-flex items-center gap-2 rounded-full bg-cyan-50 px-3 py-1 text-xs font-bold uppercase tracking-[.16em] text-cyan-700"><Sparkles size={13}/> Paket kararı için ana tablo</div>
        <h2 className="mt-3 text-2xl font-semibold text-slate-950">Şirket bazlı AI kullanımı</h2>
        <p className="mt-1 text-sm text-slate-500">Son 1000 analiz kaydı üzerinden şirketlere göre token ve maliyet toplamı.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-[.14em] text-slate-500"><tr><th className="px-6 py-4">Şirket</th><th>Analiz</th><th>Input</th><th>Output</th><th>Toplam token</th><th>Maliyet</th><th className="pr-6">Son analiz</th></tr></thead>
          <tbody>{companyRows.map((r) => <tr key={r.companyId} className="border-t border-slate-100"><td className="px-6 py-4"><p className="font-semibold text-slate-950">{r.companyName}</p><p className="mt-1 break-all text-xs text-slate-400">{r.companyId}</p></td><td className="py-4 font-semibold text-slate-800">{num(r.count)}</td><td className="py-4 text-slate-600">{num(r.inputTokens)}</td><td className="py-4 text-slate-600">{num(r.outputTokens)}</td><td className="py-4 font-semibold text-slate-900">{num(r.tokens)}</td><td className="py-4 font-semibold text-slate-900">{usd(r.cost)}</td><td className="py-4 pr-6 text-slate-500">{formatDate(r.lastRunAt || undefined)}</td></tr>)}</tbody>
        </table>
        {companyRows.length === 0 && <p className="px-6 py-8 text-slate-500">Henüz şirket bazlı token bilgisi yazılmış analiz yok.</p>}
      </div>
    </section>

    <section className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
      <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Provider dağılımı</h2>
        <div className="mt-5 space-y-3">
          {providerRows.map((r) => <div key={r.provider} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-4"><p className="font-semibold text-slate-950">{r.provider}</p><p className="text-sm font-semibold text-slate-600">{usd(r.cost)}</p></div>
            <p className="mt-2 text-sm text-slate-500">{num(r.count)} analiz · {num(r.tokens)} token</p>
          </div>)}
          {providerRows.length === 0 && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Henüz token bilgisi yazılmış analiz yok.</p>}
        </div>
      </div>

      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-6"><h2 className="text-lg font-semibold text-slate-950">Son analiz kayıtları</h2><p className="mt-1 text-sm text-slate-500">Son 1000 kayıt üzerinden hesaplanır.</p></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-[.14em] text-slate-500"><tr><th className="px-6 py-4">Tarih</th><th>Şirket</th><th>Provider</th><th>Model</th><th>Token</th><th className="pr-6">Maliyet</th></tr></thead>
            <tbody>{runs.slice(0, 12).map((r: any) => <tr key={r.id} className="border-t border-slate-100"><td className="px-6 py-4 text-slate-600">{formatDate(r.createdAt)}</td><td className="py-4 font-semibold text-slate-800">{companyMap.get(r.companyId)?.name || r.companyId || '—'}</td><td className="py-4 font-semibold text-slate-800">{r.provider || '—'}</td><td className="py-4 text-slate-500">{r.model || '—'}</td><td className="py-4 text-slate-600">{num(Number(r.totalTokens || 0))}</td><td className="py-4 pr-6 font-semibold text-slate-900">{usd(Number(r.estimatedCostUsd || 0))}</td></tr>)}</tbody>
          </table>
          {runs.length === 0 && <p className="px-6 py-8 text-slate-500">Henüz analiz çalışması yok.</p>}
        </div>
      </div>
    </section>
  </div>;
}
