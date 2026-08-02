import { adminDb } from '@/lib/firebase/admin';
import { requireAdminPermission } from '@/lib/auth/adminGuard';
import { CreditCard } from 'lucide-react';
export default async function Page(){
  await requireAdminPermission('subscriptions');
  const snap=await adminDb.collection('companies').limit(200).get().catch(()=>null);
  const rows=snap?.docs.map(d=>({id:d.id,...d.data() as any}))||[];
  return <div className="mx-auto w-full max-w-[1500px] space-y-6"><section className="rounded-[34px] border border-slate-200 bg-white p-8 shadow-sm"><div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-xs font-bold uppercase tracking-[.18em] text-blue-700"><CreditCard size={14}/>Finans</div><h1 className="mt-5 text-4xl font-semibold">Abonelikler</h1><p className="mt-3 text-slate-600">Şirketlerin paket, faturalandırma ve deneme durumlarını izleyin.</p></section><section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-6 py-4">Şirket</th><th>Paket</th><th>Durum</th><th>Trial bitiş</th><th>Kredi</th></tr></thead><tbody>{rows.map((r:any)=><tr key={r.id} className="border-t"><td className="px-6 py-4 font-semibold">{r.name||r.id}</td><td>{r.plan?.name||'trial'}</td><td>{r.plan?.billingStatus||'trialing'}</td><td>{r.plan?.trialEndsAt?new Date(r.plan.trialEndsAt).toLocaleDateString('tr-TR'):'—'}</td><td>{r.plan?.analysisCreditsRemaining??r.plan?.analysisCredits??0}</td></tr>)}</tbody></table></section></div>
}
