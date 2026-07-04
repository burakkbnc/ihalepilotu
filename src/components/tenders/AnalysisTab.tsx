'use client';

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent, ButtonLink } from '@/components/ui';
import { RefreshCw, Download, Share2, BrainCircuit, FileCheck2, ListChecks, Clock3, Bot } from 'lucide-react';
import AnalysisResultsView from './AnalysisResultsView';
import TenderItemsPanel from './TenderItemsPanel';
import TenderAssistantPanel from './TenderAssistantPanel';
import type { AnalysisRun, TenderAnalysis, TenderItem, TenderDocument } from '@/types/tender';

export default function AnalysisTab({
  tenderId,
  tenderTitle,
  referenceNumber,
  institutionName,
  initialSections,
  initialRuns,
  initialItems,
  initialDocuments,
  editable
}: {
  tenderId: string;
  tenderTitle: string;
  referenceNumber: string | null;
  institutionName: string | null;
  initialSections: TenderAnalysis[];
  initialRuns: AnalysisRun[];
  initialItems: TenderItem[];
  initialDocuments: TenderDocument[];
  editable: boolean;
}) {
  const [sections, setSections] = useState<TenderAnalysis[]>(initialSections);
  const [runs, setRuns] = useState<AnalysisRun[]>(initialRuns);
  const [items, setItems] = useState<TenderItem[]>(initialItems);
  const [documents, setDocuments] = useState<TenderDocument[]>(initialDocuments);
  const [latestRun, setLatestRun] = useState<AnalysisRun | null>(initialRuns[0] ?? null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisMessage, setAnalysisMessage] = useState<string | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const uploadedDocuments = documents.filter((doc) => Boolean(doc.storagePath));
  const canAnalyze = editable && uploadedDocuments.length > 0 && !isAnalyzing;

  const handleCompleted = async (run: AnalysisRun, updatedSections: TenderAnalysis[], updatedItems: TenderItem[], updatedDocuments?: TenderDocument[]) => {
    setSections(updatedSections);
    if (updatedDocuments) setDocuments(updatedDocuments);
    setLatestRun(run);
    setItems(updatedItems);

    try {
      const res = await fetch(`/api/tenders/${tenderId}/analysis/runs`);
      const body = await res.json();
      if (res.ok) setRuns(body.data.runs as AnalysisRun[]);
    } catch {
      // kritik değil
    }
  };

  const runDocumentAnalysis = async () => {
    setAnalysisError(null);
    setAnalysisMessage(null);

    if (uploadedDocuments.length === 0) {
      setAnalysisError('Analiz için önce en az bir doküman yükleyin.');
      return;
    }

    setIsAnalyzing(true);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/analysis/from-documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || 'Analiz başlatılamadı.');

      const run = body.data.run as AnalysisRun;
      await handleCompleted(
        run,
        body.data.sections as TenderAnalysis[],
        body.data.items as TenderItem[],
        body.data.documents as TenderDocument[] | undefined
      );

      const issueCount = (body.data.documents as TenderDocument[] | undefined)?.filter((doc) => doc.status === 'ocr_required' || doc.status === 'failed').length ?? 0;
      setAnalysisMessage(
        issueCount > 0
          ? `Analiz tamamlandı; ${issueCount} doküman için metin/görüntü çıkarımı sorunlu olabilir.`
          : `Analiz tamamlandı: ${run.sectionsFound}/${run.sectionsTotal} bölümde veri bulundu.`
      );
    } catch (err: any) {
      setAnalysisError(err?.message || 'Analiz başlatılamadı.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const llmStatus = latestRun?.llmStatus ?? 'not_attempted';
  const llmErrorMessage = latestRun?.llmErrorMessage ?? null;
  const analyzedAt = latestRun?.createdAt ?? null;
  const completedDocuments = documents.filter((doc) => doc.status === 'completed').length;

  const resultsViewProps = {
    sections,
    llmStatus,
    llmErrorMessage,
    tenderId,
    tenderTitle,
    referenceNumber,
    institutionName,
    analyzedAt
  };

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-[28px] border border-border bg-surface shadow-card">
        <div className="grid grid-cols-1 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="relative p-5 md:p-6">
            <div className="absolute -right-10 -top-12 h-36 w-36 rounded-full bg-brand-100/70 blur-3xl" aria-hidden />
            <div className="relative">
              <p className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-brand-700">
                <BrainCircuit size={14} strokeWidth={2.2} aria-hidden />
                Analiz Merkezi
              </p>
              <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-950 md:text-2xl">
                Şartname operasyon analizi
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                Dokümanlardan tarih, belge, teminat, yeterlilik ve birim fiyat bilgileri çıkarılır. Sistem karar verdirmez; operasyonel kontrol listesi oluşturur.
              </p>

              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="rounded-2xl border border-border bg-white/80 px-3.5 py-3 shadow-sm">
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <FileCheck2 size={14} strokeWidth={2} aria-hidden />
                    Doküman
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{uploadedDocuments.length} kayıtlı / {completedDocuments} tamamlandı</p>
                </div>
                <div className="rounded-2xl border border-border bg-white/80 px-3.5 py-3 shadow-sm">
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <ListChecks size={14} strokeWidth={2} aria-hidden />
                    Cetvel
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{items.length > 0 ? `${items.length} kalem` : 'Henüz oluşmadı'}</p>
                </div>
                <div className="rounded-2xl border border-border bg-white/80 px-3.5 py-3 shadow-sm">
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <Clock3 size={14} strokeWidth={2} aria-hidden />
                    Durum
                  </div>
                  <p className="mt-1 text-sm font-semibold text-slate-900">{isAnalyzing ? 'Analiz çalışıyor' : analyzedAt ? 'Analiz hazır' : 'Analiz bekliyor'}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-between gap-4 border-t border-border bg-surface-muted p-5 xl:border-l xl:border-t-0 md:p-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">İşlem</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">
                Dokümanları güncelledikten sonra analizi yenileyin; oluşan birim fiyat cetvelini Excel olarak indirin.
              </p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                <span className="rounded-xl border border-border bg-white px-3 py-2 text-center">Yükle</span>
                <span className="rounded-xl border border-border bg-white px-3 py-2 text-center">Analiz et</span>
                <span className="rounded-xl border border-border bg-white px-3 py-2 text-center">Dışa aktar</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={runDocumentAnalysis}
                disabled={!canAnalyze}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-55"
              >
                <RefreshCw size={15} strokeWidth={2.1} className={isAnalyzing ? 'animate-spin' : ''} aria-hidden />
                {isAnalyzing ? 'Analiz Ediliyor…' : sections.length > 0 ? 'Analizi Yenile' : 'Analizi Başlat'}
              </button>
              <ButtonLink href={`/api/tenders/${tenderId}/items/export`} variant="outline" size="sm">
                <Download size={14} strokeWidth={2} aria-hidden />
                Excel İndir
              </ButtonLink>
              <button
                type="button"
                disabled
                title="Yakında"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border-strong bg-white px-3 py-1.5 text-xs font-medium text-muted-foreground opacity-70"
              >
                <Share2 size={14} strokeWidth={2} aria-hidden />
                Paylaş
              </button>
            </div>
          </div>
        </div>
      </div>

      {analysisMessage && <p className="rounded-xl border border-success-100 bg-success-50 px-4 py-2 text-sm text-success-700">{analysisMessage}</p>}
      {analysisError && <p className="rounded-xl border border-danger-100 bg-danger-50 px-4 py-2 text-sm text-danger-700">{analysisError}</p>}

      <Tabs defaultValue="genel">
        <TabsList className="flex-wrap">
          <TabsTrigger value="genel">Genel Özet</TabsTrigger>
          <TabsTrigger value="idari">İdari Şartname</TabsTrigger>
          <TabsTrigger value="teknik">Teknik Şartname</TabsTrigger>
          <TabsTrigger value="teminat">Teminat</TabsTrigger>
          <TabsTrigger value="belgeler">Belgeler</TabsTrigger>
          <TabsTrigger value="cetvel">Birim Fiyat Cetveli</TabsTrigger>
          <TabsTrigger value="ai">Detaylı Analiz</TabsTrigger>
          <TabsTrigger value="asistan"><span className="inline-flex items-center gap-1.5"><Bot size={14} strokeWidth={2} aria-hidden /> İhale Asistanı</span></TabsTrigger>
        </TabsList>

        <TabsContent value="genel">
          <AnalysisResultsView {...resultsViewProps} visibleSections={['genel']} />
        </TabsContent>
        <TabsContent value="idari">
          <AnalysisResultsView {...resultsViewProps} visibleSections={['idari']} />
        </TabsContent>
        <TabsContent value="teknik">
          <AnalysisResultsView {...resultsViewProps} visibleSections={['teknik']} />
        </TabsContent>
        <TabsContent value="teminat">
          <AnalysisResultsView {...resultsViewProps} visibleSections={['teminat']} />
        </TabsContent>
        <TabsContent value="belgeler">
          <AnalysisResultsView {...resultsViewProps} visibleSections={['belgeler']} />
        </TabsContent>
        <TabsContent value="cetvel">
          <TenderItemsPanel tenderId={tenderId} items={items} editable={editable} />
        </TabsContent>
        <TabsContent value="ai">
          <AnalysisResultsView {...resultsViewProps} visibleSections={['ai']} />
        </TabsContent>
        <TabsContent value="asistan">
          <TenderAssistantPanel tenderId={tenderId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
