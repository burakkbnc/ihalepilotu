import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileStack,
  ListChecks,
  Plus,
  ShieldAlert,
  Sparkles,
  TimerReset
} from 'lucide-react';
import { redirectSuperAdminAwayFromCompanyApp } from '@/lib/auth/adminGuard';
import { adminDb } from '@/lib/firebase/admin';
import { ButtonLink, Card, EmptyState } from '@/components/ui';
import { formatDate } from '@/lib/tenders/format';
import type { Tender } from '@/types/tender';

type CalendarEventType = 'submission' | 'tender_date' | 'question' | 'guarantee' | 'review';
type CalendarEventTone = 'critical' | 'warning' | 'normal' | 'done' | 'muted';

interface CalendarEvent {
  id: string;
  tender: Tender;
  title: string;
  description: string;
  date: string;
  type: CalendarEventType;
  tone: CalendarEventTone;
  source: 'Şartname' | 'Operasyon önerisi';
}

function toDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, day: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + day);
  return next;
}

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function daysUntil(value: string | null): number | null {
  const date = toDate(value);
  if (!date) return null;
  date.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - startOfToday().getTime()) / (1000 * 60 * 60 * 24));
}

function getEventTone(dateValue: string, baseTone: CalendarEventTone = 'normal'): CalendarEventTone {
  const days = daysUntil(dateValue);
  if (days === null) return baseTone;
  if (days < 0) return 'muted';
  if (days <= 1) return 'critical';
  if (days <= 7) return 'warning';
  return baseTone;
}

function buildEvents(tenders: Tender[]): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  for (const tender of tenders) {
    const submissionDate = toDate(tender.submissionDeadline);
    const tenderDate = toDate(tender.tenderDate);

    if (submissionDate) {
      const submissionISO = toISODate(submissionDate);
      events.push({
        id: `${tender.id}-submission`,
        tender,
        title: 'Teklif son teslim',
        description: 'Teklif dosyası ve EKAP hazırlığı için ana kritik tarih.',
        date: submissionISO,
        type: 'submission',
        tone: getEventTone(submissionISO, 'critical'),
        source: 'Şartname'
      });

      const questionDate = addDays(submissionDate, -5);
      const questionISO = toISODate(questionDate);
      events.push({
        id: `${tender.id}-question`,
        tender,
        title: 'Soru sorma kontrolü',
        description: 'İdareye sorulacak belirsizlikler için önerilen son kontrol.',
        date: questionISO,
        type: 'question',
        tone: getEventTone(questionISO, 'warning'),
        source: 'Operasyon önerisi'
      });

      const guaranteeDate = addDays(submissionDate, -3);
      const guaranteeISO = toISODate(guaranteeDate);
      events.push({
        id: `${tender.id}-guarantee`,
        tender,
        title: 'Teminat kontrolü',
        description: 'Geçici teminat, imza sirküleri ve teklif zarfı kontrolü.',
        date: guaranteeISO,
        type: 'guarantee',
        tone: getEventTone(guaranteeISO, 'warning'),
        source: 'Operasyon önerisi'
      });
    }

    if (tenderDate) {
      const tenderISO = toISODate(tenderDate);
      events.push({
        id: `${tender.id}-tender-date`,
        tender,
        title: 'İhale tarihi',
        description: 'İhale oturumu / teklif değerlendirme günü.',
        date: tenderISO,
        type: 'tender_date',
        tone: getEventTone(tenderISO, 'normal'),
        source: 'Şartname'
      });
    }

    if (tender.hasAnalysis && tender.updatedAt) {
      const reviewDate = addDays(new Date(tender.updatedAt), 2);
      const reviewISO = toISODate(reviewDate);
      events.push({
        id: `${tender.id}-review`,
        tender,
        title: 'Analiz aksiyon kontrolü',
        description: 'Riskler, belgeler ve teknik yeterlilik maddeleri gözden geçirilmeli.',
        date: reviewISO,
        type: 'review',
        tone: getEventTone(reviewISO, tender.highRiskCount > 0 ? 'warning' : 'normal'),
        source: 'Operasyon önerisi'
      });
    }
  }

  return events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function getMonthDays(events: CalendarEvent[]) {
  const today = startOfToday();
  const firstEvent = events.find((event) => {
    const days = daysUntil(event.date);
    return days !== null && days >= -3;
  });
  const anchor = firstEvent ? new Date(firstEvent.date) : today;
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const mondayBasedStart = (firstDay.getDay() + 6) % 7;
  const cells: Array<{ date: Date | null; events: CalendarEvent[] }> = [];

  for (let i = 0; i < mondayBasedStart; i += 1) cells.push({ date: null, events: [] });

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    const date = new Date(year, month, day);
    const key = toISODate(date);
    cells.push({ date, events: events.filter((event) => event.date === key).slice(0, 3) });
  }

  while (cells.length % 7 !== 0) cells.push({ date: null, events: [] });

  return {
    title: anchor.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }),
    cells
  };
}

function eventToneClass(tone: CalendarEventTone): string {
  const classes: Record<CalendarEventTone, string> = {
    critical: 'border-red-200 bg-red-50 text-red-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-700',
    normal: 'border-blue-100 bg-blue-50 text-blue-700',
    done: 'border-emerald-100 bg-emerald-50 text-emerald-700',
    muted: 'border-slate-200 bg-slate-50 text-slate-500'
  };
  return classes[tone];
}

function eventDotClass(tone: CalendarEventTone): string {
  const classes: Record<CalendarEventTone, string> = {
    critical: 'bg-red-500',
    warning: 'bg-amber-500',
    normal: 'bg-blue-500',
    done: 'bg-emerald-500',
    muted: 'bg-slate-400'
  };
  return classes[tone];
}

function eventIcon(type: CalendarEventType) {
  if (type === 'submission') return <ShieldAlert size={17} />;
  if (type === 'tender_date') return <CalendarCheck2 size={17} />;
  if (type === 'question') return <BellRing size={17} />;
  if (type === 'guarantee') return <FileStack size={17} />;
  return <ListChecks size={17} />;
}

function urgencyLabel(event: CalendarEvent): string {
  const days = daysUntil(event.date);
  if (days === null) return 'Tarih yok';
  if (days < 0) return `${Math.abs(days)} gün geçti`;
  if (days === 0) return 'Bugün';
  if (days === 1) return 'Yarın';
  return `${days} gün kaldı`;
}

function countEvents(events: CalendarEvent[], predicate: (event: CalendarEvent) => boolean): number {
  return events.filter(predicate).length;
}

function PipelineStep({ label, active, done }: { label: string; active?: boolean; done?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={
          done
            ? 'grid h-9 w-9 place-items-center rounded-full bg-emerald-500 text-white'
            : active
              ? 'grid h-9 w-9 place-items-center rounded-full bg-amber-500 text-white'
              : 'grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-400'
        }
      >
        {done ? <CheckCircle2 size={17} /> : active ? <Clock3 size={17} /> : <span className="h-2 w-2 rounded-full bg-current" />}
      </span>
      <span className={active || done ? 'text-sm font-semibold text-slate-900' : 'text-sm font-medium text-slate-500'}>{label}</span>
    </div>
  );
}

export default async function CalendarPage() {
  const result = await redirectSuperAdminAwayFromCompanyApp();
  const profile = result!.profile;
  const companyId = profile.companyId!;

  const snap = await adminDb
    .collection('companies')
    .doc(companyId)
    .collection('tenders')
    .orderBy('createdAt', 'desc')
    .get();

  const tenders = snap.docs.map((doc) => doc.data() as Tender);
  const events = buildEvents(tenders);
  const month = getMonthDays(events);
  const todayKey = toISODate(startOfToday());
  const upcomingEvents = events.filter((event) => {
    const days = daysUntil(event.date);
    return days !== null && days >= 0;
  });
  const overdueEvents = events.filter((event) => event.tone === 'muted');
  const thisWeekEvents = upcomingEvents.filter((event) => {
    const days = daysUntil(event.date);
    return days !== null && days <= 7;
  });
  const criticalEvents = upcomingEvents.filter((event) => event.tone === 'critical');
  const canCreate = profile.role === 'owner' || profile.role === 'admin';
  const selectedTender = upcomingEvents[0]?.tender ?? tenders[0] ?? null;
  const selectedTenderEvents = selectedTender ? events.filter((event) => event.tender.id === selectedTender.id) : [];

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-6">
      <header className="overflow-hidden rounded-[34px] border border-white/10 bg-[#050A18] text-white shadow-[0_28px_90px_rgba(15,23,42,0.20)]">
        <div className="relative p-7 lg:p-10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_10%,rgba(96,165,250,0.30),transparent_31%),radial-gradient(circle_at_20%_100%,rgba(14,165,233,0.22),transparent_35%),linear-gradient(135deg,#050A18_0%,#081832_56%,#050A18_100%)]" />
          <div className="pointer-events-none absolute right-0 top-0 h-full w-[42%] opacity-40 [background-image:linear-gradient(rgba(255,255,255,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.06)_1px,transparent_1px)] [background-size:32px_32px]" />
          <div className="relative grid gap-8 xl:grid-cols-[1.1fr_0.9fr] xl:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-sky-200">
                <CalendarDays size={14} />
                Takvim Analiz Merkezi
              </div>
              <h1 className="mt-6 max-w-4xl text-4xl font-semibold tracking-[-0.055em] text-white lg:text-6xl">
                Kritik tarihleri kaçırmadan ihale operasyonunu yönet.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-slate-300 lg:text-lg">
                Şartnameden gelen teklif ve ihale tarihlerini, operasyon önerileriyle birlikte tek takvimde izleyin.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <ButtonLink href="/tenders" variant="outline" size="md" className="rounded-2xl border-white/15 bg-white/[0.06] text-white hover:bg-white/[0.10]">
                  <FileStack size={17} />
                  İhale Dosyaları
                </ButtonLink>
                {canCreate && (
                  <ButtonLink href="/tenders/new" variant="primary" size="md" className="rounded-2xl bg-sky-400 text-slate-950 hover:bg-sky-300">
                    <Plus size={17} />
                    Yeni İhale Başlat
                  </ButtonLink>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <KpiCard icon={<CalendarClock size={22} />} label="Bu hafta" value={String(thisWeekEvents.length)} helper="Yaklaşan işlem" />
              <KpiCard icon={<AlertTriangle size={22} />} label="Kritik" value={String(criticalEvents.length)} helper="Bugün / yarın" />
              <KpiCard icon={<TimerReset size={22} />} label="Bugün" value={String(countEvents(events, (event) => event.date === todayKey))} helper="Takvim kaydı" />
              <KpiCard icon={<FileStack size={22} />} label="Aktif ihale" value={String(tenders.filter((tender) => tender.status !== 'archived').length)} helper="Takipte" />
            </div>
          </div>
        </div>
      </header>

      {events.length === 0 ? (
        <Card className="p-8">
          <EmptyState icon={CalendarDays} message="Henüz takvime düşen kritik tarih yok. İhale oluşturup teklif/ihale tarihlerini eklediğinizde bu ekran otomatik dolacak." />
          {canCreate && (
            <div className="mt-6 flex justify-center">
              <ButtonLink href="/tenders/new" variant="primary" size="md">
                Yeni İhale Oluştur
              </ButtonLink>
            </div>
          )}
        </Card>
      ) : (
        <>
          <section className="grid gap-6 2xl:grid-cols-[0.85fr_1.15fr_0.75fr]">
            <aside className="rounded-[30px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.07)]">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-blue-700">
                <Sparkles size={16} />
                AI Operasyon Özeti
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">Bu hafta dikkat</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                {thisWeekEvents.length > 0
                  ? `Bu hafta ${thisWeekEvents.length} işlem var. ${criticalEvents.length > 0 ? `${criticalEvents.length} tanesi kritik seviyede.` : 'Kritik seviyede işlem görünmüyor.'}`
                  : 'Bu hafta kritik bir işlem görünmüyor. Yine de analiz aksiyonları ve teminat kontrolleri takip edilmeli.'}
              </p>

              <div className="mt-6 space-y-3">
                {upcomingEvents.slice(0, 4).map((event) => (
                  <Link key={event.id} href={`/tenders/${event.tender.id}`} className="group block rounded-2xl border border-slate-200 bg-slate-50/80 p-4 transition hover:border-blue-200 hover:bg-blue-50/60">
                    <div className="flex items-start gap-3">
                      <span className={`mt-1 h-2.5 w-2.5 rounded-full ${eventDotClass(event.tone)}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-950">{event.title}</p>
                        <p className="mt-1 line-clamp-1 text-xs text-slate-500">{event.tender.title}</p>
                        <p className="mt-2 text-xs font-semibold text-blue-700">{urgencyLabel(event)} · {formatDate(event.date)}</p>
                      </div>
                      <ArrowRight size={15} className="text-slate-300 transition group-hover:text-blue-700" />
                    </div>
                  </Link>
                ))}
              </div>
            </aside>

            <section className="rounded-[30px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.07)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Aylık görünüm</p>
                  <h2 className="mt-2 text-2xl font-semibold capitalize tracking-tight text-slate-950">{month.title}</h2>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-red-50 px-3 py-1 text-red-700">Kritik</span>
                  <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">Yaklaşıyor</span>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">Normal</span>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-7 gap-2 text-center text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((day) => (
                  <div key={day}>{day}</div>
                ))}
              </div>

              <div className="mt-3 grid grid-cols-7 gap-2">
                {month.cells.map((cell, index) => {
                  const key = cell.date ? toISODate(cell.date) : `empty-${index}`;
                  const isToday = cell.date ? key === todayKey : false;
                  return (
                    <div key={key} className={cell.date ? `min-h-[112px] rounded-2xl border p-2 ${isToday ? 'border-blue-300 bg-blue-50/70' : 'border-slate-200 bg-slate-50/70'}` : 'min-h-[112px] rounded-2xl border border-transparent'}>
                      {cell.date && (
                        <>
                          <div className="flex items-center justify-between">
                            <span className={isToday ? 'grid h-7 w-7 place-items-center rounded-full bg-blue-700 text-xs font-bold text-white' : 'text-xs font-semibold text-slate-500'}>{cell.date.getDate()}</span>
                            {cell.events.length > 0 && <span className="text-[10px] font-bold text-slate-400">{cell.events.length}</span>}
                          </div>
                          <div className="mt-2 space-y-1.5">
                            {cell.events.map((event) => (
                              <Link key={event.id} href={`/tenders/${event.tender.id}`} className={`block truncate rounded-lg border px-2 py-1 text-[10px] font-semibold ${eventToneClass(event.tone)}`} title={`${event.title} - ${event.tender.title}`}>
                                {event.title}
                              </Link>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <aside className="rounded-[30px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.07)]">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-blue-700">
                <BellRing size={16} />
                Yaklaşan İşler
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">Öncelik sırası</h2>

              <div className="mt-6 space-y-3">
                {upcomingEvents.slice(0, 7).map((event) => (
                  <Link key={event.id} href={`/tenders/${event.tender.id}`} className="block rounded-2xl border border-slate-200 p-4 transition hover:border-blue-200 hover:bg-blue-50/50">
                    <div className="flex items-start gap-3">
                      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-2xl border ${eventToneClass(event.tone)}`}>{eventIcon(event.type)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-950">{event.title}</p>
                          <span className="shrink-0 text-xs font-bold text-slate-500">{urgencyLabel(event)}</span>
                        </div>
                        <p className="mt-1 line-clamp-1 text-xs text-slate-500">{event.tender.title}</p>
                        <p className="mt-2 text-xs text-slate-400">{event.source} · {formatDate(event.date)}</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              {overdueEvents.length > 0 && (
                <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
                  {overdueEvents.length} geçmiş tarih arşivde görünüyor. İlgili ihalelerin durumunu kontrol edin.
                </div>
              )}
            </aside>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[30px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.07)]">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Seçili ihale zaman çizelgesi</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{selectedTender?.title ?? 'İhale seçilmedi'}</h2>
                  {selectedTender && <p className="mt-2 text-sm text-slate-500">{selectedTender.institutionName || 'İdare bilgisi yok'} · {selectedTender.referenceNumber || 'Referans no yok'}</p>}
                </div>
                {selectedTender && (
                  <Link href={`/tenders/${selectedTender.id}`} className="inline-flex items-center gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100">
                    Detaya git <ArrowRight size={15} />
                  </Link>
                )}
              </div>

              <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <PipelineStep label="Doküman indirildi" done={Boolean(selectedTender && selectedTender.documentCount > 0)} />
                <PipelineStep label="Analiz çalıştı" done={Boolean(selectedTender?.hasAnalysis)} />
                <PipelineStep label="Soru/cevap kontrol" active={selectedTenderEvents.some((event) => event.type === 'question' && event.tone !== 'muted')} />
                <PipelineStep label="Teminat kontrol" active={selectedTenderEvents.some((event) => event.type === 'guarantee' && event.tone !== 'muted')} />
                <PipelineStep label="Teklif teslim" active={selectedTenderEvents.some((event) => event.type === 'submission' && event.tone !== 'muted')} />
                <PipelineStep label="Sözleşme süreci" />
              </div>
            </div>

            <div className="rounded-[30px] border border-slate-200/80 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.07)]">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-blue-700">
                <ListChecks size={16} />
                Takvim kayıtları
              </div>
              <div className="mt-5 divide-y divide-slate-100">
                {events.slice(0, 8).map((event) => (
                  <div key={event.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-950">{event.title}</p>
                      <p className="mt-1 line-clamp-1 text-xs text-slate-500">{event.tender.title}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold text-slate-900">{formatDate(event.date)}</p>
                      <p className="text-xs text-slate-400">{urgencyLabel(event)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, helper }: { icon: ReactNode; label: string; value: string; helper: string }) {
  return (
    <div className="rounded-[26px] border border-white/10 bg-white/[0.07] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-200/80">{label}</p>
          <p className="mt-2 text-4xl font-semibold tracking-[-0.04em] text-white">{value}</p>
        </div>
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sky-400/15 text-sky-200">{icon}</span>
      </div>
      <p className="mt-3 text-xs text-slate-400">{helper}</p>
    </div>
  );
}
