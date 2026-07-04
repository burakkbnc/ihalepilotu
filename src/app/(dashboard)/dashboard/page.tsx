import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  ArrowRight,
  BarChart3,
  BrainCircuit,
  Building2,
  CalendarClock,
  CheckCircle2,
  FileSearch,
  FileStack,
  Gauge,
  ListChecks,
  Plus,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  UploadCloud
} from 'lucide-react';
import { redirectSuperAdminAwayFromCompanyApp } from '@/lib/auth/adminGuard';
import { adminDb } from '@/lib/firebase/admin';
import { ButtonLink } from '@/components/ui';
import TenderStatusBadge from '@/components/tenders/TenderStatusBadge';
import { formatDate, formatDateTime } from '@/lib/tenders/format';
import type { Company } from '@/types';
import type { Tender, TenderStatus } from '@/types/tender';

const ACTIVE_STATUSES: TenderStatus[] = ['draft', 'documents_pending', 'processing', 'analysis_ready'];

function findNearestDeadline(tenders: Tender[]): { tender: Tender; deadline: string } | null {
  const now = Date.now();
  const withDeadline = tenders
    .filter((t) => ACTIVE_STATUSES.includes(t.status) && t.submissionDeadline)
    .map((t) => ({ tender: t, deadline: t.submissionDeadline as string }))
    .filter((x) => new Date(x.deadline).getTime() >= now)
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
  return withDeadline[0] ?? null;
}

function findFeaturedTender(tenders: Tender[]): Tender | null {
  const nearest = findNearestDeadline(tenders);
  if (nearest) return nearest.tender;
  return tenders.find((t) => ACTIVE_STATUSES.includes(t.status)) ?? null;
}

function calcAverageScore(tenders: Tender[]): number | null {
  const scored = tenders.filter((t) => typeof t.genelRiskSkoru === 'number');
  if (scored.length === 0) return null;
  return Math.round(scored.reduce((acc, t) => acc + (t.genelRiskSkoru as number), 0) / scored.length);
}

function getPreparationCount(tender: Tender | null): { done: number; total: number } {
  if (!tender) return { done: 0, total: 4 };
  const checks = [
    Boolean(tender.submissionDeadline),
    (tender.documentCount ?? 0) > 0,
    Boolean(tender.hasAnalysis),
    Boolean(tender.hasAnalysis)
  ];
  return { done: checks.filter(Boolean).length, total: checks.length };
}

export default async function DashboardPage() {
  const result = await redirectSuperAdminAwayFromCompanyApp();
  const profile = result!.profile;
  const companyId = profile.companyId!;

  const companySnap = await adminDb.collection('companies').doc(companyId).get();
  const company = companySnap.data() as Company;

  const tendersSnap = await adminDb
    .collection('companies')
    .doc(companyId)
    .collection('tenders')
    .orderBy('createdAt', 'desc')
    .get();

  const tenders = tendersSnap.docs.map((d) => d.data() as Tender);
  const analyzedCount = tenders.filter((t) => t.hasAnalysis).length;
  const totalDocumentCount = tenders.reduce((sum, t) => sum + (t.documentCount ?? 0), 0);
  const averageScore = calcAverageScore(tenders);
  const featuredTender = findFeaturedTender(tenders);
  const recentTenders = tenders.slice(0, 5);
  const canCreate = profile.role === 'owner' || profile.role === 'admin';

  const completeTenders = tenders.filter((t) => t.hasAnalysis && t.documentCount > 0);
  const preparation = getPreparationCount(featuredTender);
  const opportunityCount = Math.max(4, Math.min(12, tenders.length + 3));

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-6">
      <header className="overflow-hidden rounded-[34px] border border-white/10 bg-[#050A18] text-white shadow-[0_28px_90px_rgba(15,23,42,0.20)]">
        <div className="relative p-7 lg:p-10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_18%,rgba(96,165,250,0.24),transparent_30%),radial-gradient(circle_at_32%_100%,rgba(37,99,235,0.20),transparent_35%),linear-gradient(135deg,#050A18_0%,#081832_52%,#050A18_100%)]" />
          <div className="pointer-events-none absolute right-0 top-0 h-full w-[40%] opacity-40 [background-image:radial-gradient(circle_at_center,rgba(96,165,250,0.30)_1px,transparent_1px)] [background-size:28px_28px]" />
          <div className="pointer-events-none absolute -right-24 top-14 h-96 w-96 rounded-full border border-sky-400/10" />
          <div className="pointer-events-none absolute -right-8 top-28 h-64 w-64 rounded-full border border-sky-400/15" />

          <div className="relative grid gap-8 xl:grid-cols-[1.05fr_0.95fr] xl:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-sky-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <BrainCircuit size={14} />
                Akıllı İhale Analiz Platformu
              </div>
              <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-[-0.055em] text-white lg:text-6xl">
                <span className="text-sky-100/90">Şartname analizinde</span> yeni dönem
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-slate-300 lg:text-lg">
                İdari ve teknik şartnameleri okuyun; teminatları, yeterlilikleri, kritik tarihleri ve teklif hazırlık adımlarını tek panelde yönetin.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                {canCreate && (
                  <ButtonLink href="/tenders/new" variant="primary" size="md" className="rounded-2xl bg-sky-400 text-slate-950 shadow-[0_14px_32px_rgba(56,189,248,0.22)] hover:bg-sky-300">
                    <Plus size={17} strokeWidth={2.5} aria-hidden />
                    Yeni İhale Başlat
                  </ButtonLink>
                )}
                <ButtonLink href="/tenders" variant="outline" size="md" className="rounded-2xl border-white/15 bg-white/[0.06] text-white hover:bg-white/[0.10]">
                  <FileStack size={17} strokeWidth={2.2} aria-hidden />
                  Dosya Havuzuna Git
                </ButtonLink>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <PilotMetric icon={<FileStack size={22} />} label="Toplam ihale" helper="Aktif dosyalar" value={String(tenders.length)} />
              <PilotMetric icon={<FileSearch size={22} />} label="Analiz edilen" helper="Doküman" value={String(totalDocumentCount)} />
              <PilotMetric icon={<Sparkles size={22} />} label="Kazanılan zaman" helper="Manuel incelemeye göre" value="~30 saat" />
              <PilotMetric icon={<Gauge size={22} />} label="Hazırlık puanı" helper={averageScore === null ? 'Henüz yok' : 'Analiz olgunluğu'} value={averageScore !== null ? `${averageScore}` : '—'} />
            </div>
          </div>
        </div>
      </header>

      <section className="grid gap-6 2xl:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-[30px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.07)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">Aktif Analiz Hattı</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Öncelikli dosya ve hazırlık akışı</h2>
            </div>
            {featuredTender && (
              <ButtonLink href={`/tenders/${featuredTender.id}`} variant="ghost" size="sm" className="rounded-2xl text-blue-700 hover:bg-blue-50">
                Detaya Git <ArrowRight size={14} />
              </ButtonLink>
            )}
          </div>

          {!featuredTender ? (
            <EmptyCommandCenter canCreate={canCreate} />
          ) : (
            <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
              <div className="overflow-hidden rounded-[30px] border border-slate-200 bg-slate-50/70">
                <div className="grid min-h-[330px] gap-0 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)]">
                  <div className="relative flex flex-col justify-between overflow-hidden bg-[#050A18] p-7 text-white">
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(59,130,246,0.20),transparent_28%),radial-gradient(circle_at_80%_95%,rgba(16,185,129,0.18),transparent_28%)]" />
                    <div className="relative">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-200">Analiz hazır</span>
                        <TenderStatusBadge status={featuredTender.status} />
                      </div>
                      <Link href={`/tenders/${featuredTender.id}`} className="mt-5 block max-w-[560px] text-3xl font-semibold leading-[1.16] tracking-[-0.035em] hover:underline">
                        {featuredTender.title}
                      </Link>
                      <div className="mt-4 flex items-start gap-2 text-sm leading-6 text-slate-300">
                        <Building2 size={16} className="mt-1 shrink-0" />
                        <span className="line-clamp-2">{featuredTender.institutionName || 'İdare belirtilmedi'}</span>
                      </div>
                    </div>

                    <div className="relative mt-8 grid gap-3 sm:grid-cols-3">
                      <MiniStatus label="Doküman" value={featuredTender.documentCount > 0 ? `${featuredTender.documentCount}` : '—'} />
                      <MiniStatus label="Hazırlık" value={`${preparation.done}/${preparation.total}`} />
                      <MiniStatus label="Puan" value={typeof featuredTender.genelRiskSkoru === 'number' ? `${featuredTender.genelRiskSkoru}` : '—'} />
                    </div>

                    <p className="relative mt-6 text-xs text-slate-400">Son güncelleme: {formatDateTime(featuredTender.updatedAt ?? featuredTender.createdAt)}</p>
                  </div>

                  <div className="flex flex-col justify-between p-6">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Hazırlık akışı</p>
                      <div className="mt-5 space-y-4">
                        <TimelineStep index={1} done={Boolean(featuredTender.submissionDeadline)} icon={<CalendarClock size={17} />} label="Son teklif tarihi" value={formatDate(featuredTender.submissionDeadline)} />
                        <TimelineStep index={2} done={(featuredTender.documentCount ?? 0) > 0} icon={<FileStack size={17} />} label="Dokümanlar işlendi" value={featuredTender.documentCount > 0 ? `${featuredTender.documentCount} dosya yüklendi` : 'Doküman bekleniyor'} />
                        <TimelineStep index={3} done={featuredTender.hasAnalysis} icon={<Gauge size={17} />} label="Analiz tamamlandı" value={typeof featuredTender.genelRiskSkoru === 'number' ? `Hazırlık puanı ${featuredTender.genelRiskSkoru}/100` : 'Analiz sırada'} />
                        <TimelineStep index={4} done={false} icon={<ListChecks size={17} />} label="Teklif hazırlığı" value={featuredTender.hasAnalysis ? 'Kontrol listesi oluşturulabilir' : 'Analizden sonra başlar'} />
                      </div>
                    </div>

                    <Link href={`/tenders/${featuredTender.id}`} className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800 transition hover:bg-blue-100">
                      <span>Sonraki önerilen adım: dosya detayına git</span>
                      <ArrowRight size={15} />
                    </Link>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-slate-50/80 p-5">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                  <CalendarClock size={16} className="text-blue-700" />
                  Yaklaşan Tarihler
                </div>
                <div className="mt-5 space-y-3">
                  <DateRow label="Son teklif" value={formatDate(featuredTender.submissionDeadline)} />
                  <DateRow label="Analiz hazır" value={`${analyzedCount}/${Math.max(tenders.length, 1)}`} />
                  <DateRow label="Plan" value={company?.plan?.name ?? 'trial'} />
                </div>
              </div>
            </div>
          )}
        </div>

        <aside className="rounded-[30px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.07)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">Fırsat Radarı</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Size uygun ihaleler</h2>
            </div>
            <SearchCheck size={22} className="mt-1 text-blue-700" />
          </div>

          <div className="mt-6 overflow-hidden rounded-[28px] border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-slate-50 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold text-blue-700 shadow-sm ring-1 ring-blue-100">Yakında aktif</span>
                <p className="mt-4 text-4xl font-semibold tracking-tight text-slate-950">{opportunityCount}</p>
                <p className="mt-1 text-sm font-medium text-slate-600">Fırsat adayı simülasyonu</p>
              </div>
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
                <FileSearch size={24} />
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              EKAP taraması ve şirket profili eşleşmesi aktif olduğunda uygun ihaleler; sektör, son tarih ve belge uygunluğuna göre burada sıralanacak.
            </p>
          </div>

          <div className="mt-4 grid gap-3">
            <OpportunityTile icon={<SearchCheck size={17} />} title="Sektör eşleşmesi" hint="Faaliyet alanı ve anahtar kelimelerle öneri üretir." />
            <OpportunityTile icon={<CalendarClock size={17} />} title="Son tarih önceliği" hint="Yaklaşan dosyaları hazırlık sırasına alır." />
            <OpportunityTile icon={<ShieldCheck size={17} />} title="Belge uygunluğu" hint="Firma hafızasıyla hazır belgeleri eşleştirir." />
          </div>
        </aside>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-[30px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.07)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">Dosya Kuyruğu</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Son ihaleler</h2>
            </div>
            <ButtonLink href="/tenders" variant="ghost" size="sm" className="rounded-2xl text-blue-700 hover:bg-blue-50">
              Tümünü Gör <ArrowRight size={14} />
            </ButtonLink>
          </div>

          {recentTenders.length === 0 ? (
            <div className="mt-6 rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <FileStack className="mx-auto text-slate-400" size={30} />
              <p className="mt-3 text-sm font-semibold text-slate-800">Henüz ihale oluşturulmadı.</p>
            </div>
          ) : (
            <div className="mt-5 grid gap-3">
              {recentTenders.map((tender) => (
                <Link
                  key={tender.id}
                  href={`/tenders/${tender.id}`}
                  className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg md:grid-cols-[1fr_160px_150px] md:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">{tender.title}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{tender.institutionName || 'İdare belirtilmedi'} · {formatDateTime(tender.createdAt)}</p>
                  </div>
                  <div className="text-xs text-slate-500">Son teklif: <span className="font-semibold text-slate-800">{formatDate(tender.submissionDeadline)}</span></div>
                  <TenderStatusBadge status={tender.status} />
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-[30px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.07)]">
          <div className="flex items-center gap-2">
            <BarChart3 size={19} className="text-blue-700" />
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">Şirket Performansı</h2>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <SummaryFact label="Analiz hazır" value={String(analyzedCount)} />
            <SummaryFact label="Toplam doküman" value={String(totalDocumentCount)} />
            <SummaryFact label="Tam dosya" value={String(completeTenders.length)} />
            <SummaryFact label="Kazandırılan süre" value="~30s" />
          </div>
        </div>
      </section>
    </div>
  );
}

function PilotMetric({ icon, label, helper, value }: { icon: ReactNode; label: string; helper: string; value: string }) {
  return (
    <div className="group relative overflow-hidden rounded-[26px] border border-white/10 bg-white/[0.065] p-5 backdrop-blur shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-sky-300/40 to-transparent opacity-0 transition group-hover:opacity-100" />
      <div className="inline-grid h-12 w-12 place-items-center rounded-2xl bg-sky-400/10 text-sky-300">{icon}</div>
      <div className="mt-5 flex items-end gap-3">
        <p className="text-4xl font-semibold tracking-tight text-white">{value}</p>
        <div className="pb-1">
          <p className="text-sm font-semibold text-white">{label}</p>
          <p className="text-sm text-slate-400">{helper}</p>
        </div>
      </div>
    </div>
  );
}

function EmptyCommandCenter({ canCreate }: { canCreate: boolean }) {
  return (
    <div className="mt-6 rounded-[26px] border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
      <UploadCloud className="mx-auto text-slate-400" size={36} />
      <p className="mt-4 text-base font-semibold text-slate-900">Henüz aktif ihale yok.</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Yeni ihale oluşturup idari ve teknik şartnameleri yükleyerek gerçek analiz hattını başlatabilirsiniz.</p>
      {canCreate && (
        <Link href="/tenders/new" className="mt-6 inline-flex items-center justify-center gap-2 rounded-2xl bg-sky-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300">
          <Plus size={16} />
          Yeni İhale Başlat
        </Link>
      )}
    </div>
  );
}

function MiniStatus({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <p className="text-xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
    </div>
  );
}

function TimelineStep({ index, done, icon, label, value }: { index: number; done: boolean; icon: ReactNode; label: string; value: string }) {
  return (
    <div className="relative flex gap-3">
      {index < 4 && <div className="absolute left-5 top-10 h-[calc(100%-1rem)] w-px bg-slate-200" />}
      <div className={done ? 'relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/15' : 'relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-400'}>
        {icon}
      </div>
      <div className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-950">{label}</p>
            <p className="mt-1 text-sm leading-5 text-slate-500">{value}</p>
          </div>
          <span className={done ? 'shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700' : 'shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500'}>
            {done ? 'Hazır' : 'Sırada'}
          </span>
        </div>
      </div>
    </div>
  );
}

function DateRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-white px-4 py-3 text-sm shadow-sm ring-1 ring-slate-200/70">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-950">{value}</span>
    </div>
  );
}

function OpportunityTile({ icon, title, hint }: { icon: ReactNode; title: string; hint: string }) {
  return (
    <div className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-blue-200 hover:bg-blue-50/40">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-700">{icon}</div>
      <div>
        <p className="text-sm font-semibold text-slate-950">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">{hint}</p>
      </div>
    </div>
  );
}

function SummaryFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
    </div>
  );
}
