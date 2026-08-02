import { adminDb } from '@/lib/firebase/admin';
import { requireAdminPermission } from '@/lib/auth/adminGuard';
import { BarChart3 } from 'lucide-react';
export default async function Page(){
 await requireAdminPermission('analytics');
 const [companies,users,runs]=await Promise.all([adminDb.collection('companies').get().catch(()=>null),adminDb.collection('users').get().catch(()=>null),adminDb.collectionGroup('analysisRuns').limit(1000).get().catch(()=>null)]);
 const runRows=runs?.docs.map(d=>d.data() as any)||[]; const totalCost=runRows.reduce((s,r)=>s+Number(r.estimatedCostUsd||0),0); const totalTokens=runRows.reduce((s,r)=>s+Number(r.totalTokens||0),0);
 const cards=[['Şirket',companies?.size||0],['Kullanıcı',users?.size||0],['Analiz',runRows.length],['Toplam token',new Intl.NumberFormat('tr-TR').format(totalTokens)],['AI maliyeti',new Intl.NumberFormat('tr-TR',{style:'currency',currency:'USD'}).format(totalCost)]];
 return <div className="mx-auto w-full max-w-[1500px] space-y-6"><section className="rounded-[34px] border border-slate-200 bg-white p-8 shadow-sm"><div className="inline-flex items-center gap-2 rounded-full bg-cyan-50 px-4 py-2 text-xs font-bold uppercase tracking-[.18em] text-cyan-700"><BarChart3 size={14}/>Platform</div><h1 className="mt-5 text-4xl font-semibold">Analitik</h1><p className="mt-3 text-slate-600">Platform büyüklüğü ve AI tüketimine ilişkin temel göstergeler.</p></section><section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">{cards.map(([l,v])=><div key={String(l)} className="rounded-[26px] border border-slate-200 bg-white p-6"><p className="text-sm font-semibold text-slate-500">{l}</p><p className="mt-3 text-3xl font-semibold">{v}</p></div>)}</section></div>
}
