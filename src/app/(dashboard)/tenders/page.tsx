import Link from 'next/link';
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  FileStack,
  FileText,
  FolderKanban,
  Plus,
  Search,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import { redirectSuperAdminAwayFromCompanyApp } from '@/lib/auth/adminGuard';
import { adminDb } from '@/lib/firebase/admin';
import TenderStatusBadge from '@/components/tenders/TenderStatusBadge';
import {
  Card,
  CardContent,
  ButtonLink,
  EmptyState,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell
} from '@/components/ui';
import { formatDate } from '@/lib/tenders/format';
import type { Tender } from '@/types/tender';

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const target = new Date(date).getTime();
  if (Number.isNaN(target)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getReadinessTone(score?: number): { label: string; className: string } {
  if (typeof score !== 'number') return { label: 'Analiz bekleniyor', className: 'bg-slate-100 text-slate-600' };
  if (score >= 75) return { label: 'Öncelikli kontrol', className: 'bg-blue-50 text-blue-700' };
  if (score >= 45) return { label: 'Kontrol edilecek', className: 'bg-amber-50 text-amber-700' };
  return { label: 'Hazırlık iyi', className: 'bg-emerald-50 text-emerald-700' };
}

function getDeadlineLabel(date: string | null): { label: string; className: string } {
  const days = daysUntil(date);
  if (days === null) return { label: 'Tarih yok', className: 'text-slate-400' };
  if (days < 0) return { label: 'Süre geçti', className: 'text-slate-500' };
  if (days === 0) return { label: 'Bugün', className: 'text-red-700' };
  if (days <= 3) return { label: `${days} gün kaldı`, className: 'text-red-700' };
  if (days <= 7) return { label: `${days} gün kaldı`, className: 'text-amber-700' };
  return { label: `${days} gün kaldı`, className: 'text-slate-500' };
}

function getPreparationPercent(tender: Tender): number {
  let score = 18;
  if (tender.documentCount > 0) score += 22;
  if (tender.hasAnalysis) score += 32;
  if (tender.submissionDeadline) score += 10;
  if (tender.institutionName) score += 8;
  if (tender.status === 'ready_for_bid') score = 100;
  if (tender.status === 'analysis_ready') score = Math.max(score, 72);
  return Math.min(score, 100);
}

export default async function TendersPage() {
  const result = await redirectSuperAdminAwayFromCompanyApp();
  const profile = result!.profile;
  const companyId = profile.companyId!;

  const snap = await adminDb
    .collection('companies')
    .doc(companyId)
    .collection('tenders')
    .orderBy('createdAt', 'desc')
    .get();

  const tenders = snap.docs.map((d) => d.data() as Tender);
  const canCreate = profile.role === 'owner' || profile.role === 'admin';
  const analyzedCount = tenders.filter((tender) => tender.hasAnalysis).length;
  const controlTopicTotal = tenders.reduce((sum, tender) => sum + (tender.highRiskCount || 0), 0);
  const activeTenders = tenders.filter((tender) => tender.status !== 'archived').length;
  const upcomingTender = tenders
    .map((tender) => ({ tender, days: daysUntil(tender.submissionDeadline) }))
    .filter((item): item is { tender: Tender; days: number } => item.days !== null && item.days >= 0)
    .sort((a, b) => a.days - b.days)[0];

  return (
    <div className="space-y-7">
      <section className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-slate-950 shadow-card">
        <div className="relative p-6 sm:p-7">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(96,165,250,0.32),transparent_32%),radial-gradient(circle_at_92%_0%,rgba(20,184,166,0.18),transparent_28%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-medium text-slate-200">
                <FolderKanban size={14} aria-hidden />
                İhale operasyon merkezi
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">İhaleler</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Aktif ihale dosyalarınızı, analiz durumunu, hazırlık seviyesini ve teklif akışını tek ekranda izleyin.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <ButtonLink href="/dashboard" variant="outline" size="md" className="border-white/10 bg-white/10 text-white hover:bg-white/20">
                Genel bakış
              </ButtonLink>
              {canCreate && (
                <ButtonLink href="/tenders/new" variant="primary" size="md" className="bg-white text-slate-950 hover:bg-slate-100">
                  <Plus size={15} strokeWidth={2.25} aria-hidden />
                  Yeni İhale
                </ButtonLink>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Toplam ihale</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{tenders.length}</p>
            </div>
            <span className="rounded-2xl bg-brand-50 p-3 text-brand-700">
              <FileStack size={20} aria-hidden />
            </span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{activeTenders} aktif dosya takip ediliyor.</p>
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Analiz tamamlanan</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{analyzedCount}</p>
            </div>
            <span className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
              <CheckCircle2 size={20} aria-hidden />
            </span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">AI değerlendirmesi hazır olan dosyalar.</p>
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Kontrol başlığı</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{controlTopicTotal}</p>
            </div>
            <span className="rounded-2xl bg-blue-50 p-3 text-blue-700">
              <ShieldCheck size={20} aria-hidden />
            </span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Teklif öncesi gözden geçirilecek maddeler.</p>
        </Card>

        <Card className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">En yakın tarih</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                {upcomingTender ? `${upcomingTender.days}g` : '—'}
              </p>
            </div>
            <span className="rounded-2xl bg-amber-50 p-3 text-amber-700">
              <CalendarClock size={20} aria-hidden />
            </span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {upcomingTender ? upcomingTender.tender.title : 'Yaklaşan teklif tarihi yok.'}
          </p>
        </Card>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-border p-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-950">İhale dosyaları</h2>
              <p className="mt-1 text-sm text-muted-foreground">Evrak, analiz ve teklif hazırlık durumunu hızlıca takip edin.</p>
            </div>
            <div className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400 lg:w-72">
              <Search size={16} aria-hidden />
              <span>Arama ve filtreleme yakında</span>
            </div>
          </div>

          {tenders.length === 0 ? (
            <CardContent className="pt-5">
              <EmptyState
                icon={FileStack}
                message={
                  canCreate
                    ? 'Henüz ihale yok. İlk ihalenizi oluşturarak şartname analizine başlayabilirsiniz.'
                    : 'Şirketinize ait herhangi bir ihale bulunmuyor.'
                }
              />
              {canCreate && (
                <div className="mt-5 flex justify-center">
                  <ButtonLink href="/tenders/new" variant="primary" size="md">
                    Yeni İhale Oluştur
                  </ButtonLink>
                </div>
              )}
            </CardContent>
          ) : (
            <Table className="rounded-none border-0 shadow-none">
              <TableHeader>
                <TableRow>
                  <TableHead>İhale</TableHead>
                  <TableHead>Hazırlık</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead>Teklif Son Tarihi</TableHead>
                  <TableHead>Kontrol</TableHead>
                  <TableHead>Doküman</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenders.map((tender) => {
                  const preparation = getPreparationPercent(tender);
                  const readinessTone = getReadinessTone(tender.genelRiskSkoru);
                  const deadline = getDeadlineLabel(tender.submissionDeadline);

                  return (
                    <TableRow key={tender.id} className="group">
                      <TableCell className="min-w-[280px] py-4">
                        <Link href={`/tenders/${tender.id}`} className="block font-semibold leading-snug text-slate-950 group-hover:text-brand-700">
                          {tender.title}
                        </Link>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{tender.institutionName || 'İdare bilgisi bekleniyor'}</span>
                          {tender.referenceNumber && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">{tender.referenceNumber}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[150px] py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-brand-600" style={{ width: `${preparation}%` }} />
                          </div>
                          <span className="text-xs font-semibold text-slate-700">%{preparation}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <TenderStatusBadge status={tender.status} />
                      </TableCell>
                      <TableCell className="min-w-[150px] py-4">
                        <p className="font-medium text-slate-800">{formatDate(tender.submissionDeadline)}</p>
                        <p className={`mt-0.5 text-xs font-medium ${deadline.className}`}>{deadline.label}</p>
                      </TableCell>
                      <TableCell className="min-w-[140px] py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${readinessTone.className}`}>
                          {readinessTone.label}
                        </span>
                        {typeof tender.genelRiskSkoru === 'number' && (
                          <p className="mt-1 text-xs text-muted-foreground">Hazırlık puanı: {tender.genelRiskSkoru}/100</p>
                        )}
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="flex items-center gap-2 text-sm text-slate-700">
                          <FileText size={15} className="text-slate-400" aria-hidden />
                          {tender.documentCount}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>

        <aside className="space-y-5">
          <Card className="overflow-hidden bg-slate-950 text-white">
            <div className="p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-cyan-100">
                <Sparkles size={16} aria-hidden />
                Sıradaki ürün adımı
              </div>
              <h3 className="mt-4 text-xl font-semibold tracking-tight">Hazırlık checklisti</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Analizden çıkan teminat, belge ve tarih maddelerini yapılacaklar listesine dönüştüren teklif hazırlık merkezi.
              </p>
              <div className="mt-5 space-y-2 text-sm text-slate-200">
                <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2">
                  <ShieldCheck size={15} className="text-emerald-300" /> Teminat takibi
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2">
                  <FileText size={15} className="text-cyan-300" /> Eksik belge merkezi
                </div>
                <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2">
                  <CalendarClock size={15} className="text-amber-300" /> Kritik tarih uyarıları
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <p className="text-sm font-semibold text-slate-950">Hızlı aksiyon</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Yeni ihale ekleyip idari ve teknik şartnameyi yükleyerek analiz akışını başlatın.
              </p>
              {canCreate && (
                <ButtonLink href="/tenders/new" variant="outline" size="md" className="mt-4 w-full justify-between">
                  Yeni ihale oluştur
                  <ArrowRight size={15} aria-hidden />
                </ButtonLink>
              )}
            </CardContent>
          </Card>
        </aside>
      </section>
    </div>
  );
}
