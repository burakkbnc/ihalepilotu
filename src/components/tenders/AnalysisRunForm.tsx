'use client';

import { useState, type FormEvent } from 'react';
import { AlertTriangle, FileSearch, ShieldAlert } from 'lucide-react';
import type { AnalysisRun, TenderAnalysis, TenderDocument, TenderItem } from '@/types/tender';

export default function AnalysisRunForm({
  tenderId,
  hasExistingAnalysis,
  documents,
  onCompleted
}: {
  tenderId: string;
  hasExistingAnalysis: boolean;
  documents: TenderDocument[];
  onCompleted: (run: AnalysisRun, sections: TenderAnalysis[], items: TenderItem[], documents?: TenderDocument[]) => void;
}) {
  const [administrativeText, setAdministrativeText] = useState('');
  const [technicalText, setTechnicalText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [documentSubmitting, setDocumentSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    sectionsFound: number;
    sectionsTotal: number;
    conflictCount: number;
    llmStatus: AnalysisRun['llmStatus'];
    llmErrorMessage: string | null;
  } | null>(null);

  const uploadedDocuments = documents.filter((doc) => Boolean(doc.storagePath));
  const canRunFromDocuments = uploadedDocuments.length > 0;

  const handleDocumentAnalysis = async () => {
    setError(null);
    setResult(null);

    if (!canRunFromDocuments) {
      setError('Dosyadan analiz için önce en az bir doküman yükleyin.');
      return;
    }

    setDocumentSubmitting(true);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/analysis/from-documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || 'Dosya analizi başlatılamadı.');

      const run = body.data.run as AnalysisRun;
      setResult({
        sectionsFound: run.sectionsFound,
        sectionsTotal: run.sectionsTotal,
        conflictCount: run.conflictCount ?? 0,
        llmStatus: run.llmStatus,
        llmErrorMessage: run.llmErrorMessage
      });
      onCompleted(
        run,
        body.data.sections as TenderAnalysis[],
        body.data.items as TenderItem[],
        body.data.documents as TenderDocument[] | undefined
      );
    } catch (err: any) {
      setError(err?.message || 'Dosya analizi başlatılamadı.');
    } finally {
      setDocumentSubmitting(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    const adminTrimmed = administrativeText.trim();
    const techTrimmed = technicalText.trim();

    if (!adminTrimmed && !techTrimmed) {
      setError('En az bir metin (İdari Şartname veya Teknik Şartname) girilmelidir.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/analysis/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          administrativeText: adminTrimmed || null,
          technicalText: techTrimmed || null
        })
      });

      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || 'Analiz başlatılamadı.');

      const run = body.data.run as AnalysisRun;

      setResult({
        sectionsFound: run.sectionsFound,
        sectionsTotal: run.sectionsTotal,
        conflictCount: run.conflictCount ?? 0,
        llmStatus: run.llmStatus,
        llmErrorMessage: run.llmErrorMessage
      });
      onCompleted(run, body.data.sections as TenderAnalysis[], body.data.items as TenderItem[]);
    } catch (err: any) {
      setError(err?.message || 'Analiz başlatılamadı.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-card">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">Analizi Başlat</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Yüklediğiniz dosyalardan otomatik olarak analiz oluşturulur.
          {hasExistingAnalysis && ' Yeniden çalıştırmak mevcut analiz sonuçlarının üzerine yazar.'}
        </p>
      </div>

      <div className="rounded-2xl border border-brand-200 bg-brand-50/70 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-brand-600 text-white">
              <FileSearch size={18} strokeWidth={2.2} aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">Yüklenen dosyalardan analiz</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                {canRunFromDocuments
                  ? `${uploadedDocuments.length} doküman hazır. Sistem dosyadan metin çıkarıp analiz kartlarını doldurmayı deneyecek.`
                  : 'Henüz yüklü doküman bulunmuyor. Önce Dokümanlar bölümünden idari/teknik şartname yükleyin.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={!canRunFromDocuments || documentSubmitting || submitting}
            onClick={handleDocumentAnalysis}
            className="inline-flex shrink-0 items-center justify-center rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {documentSubmitting ? 'Dosyalar İşleniyor…' : hasExistingAnalysis ? 'Dosyadan Yeniden Analiz Et' : 'Dosyadan Analiz Et'}
          </button>
        </div>
      </div>

      <details className="rounded-2xl border border-border bg-surface-muted p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-800">Manuel metin yapıştırarak analiz</summary>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">İdari Şartname Metni</label>
            <textarea
              value={administrativeText}
              onChange={(e) => setAdministrativeText(e.target.value)}
              rows={10}
              placeholder="İdari şartname metnini buraya yapıştırın…"
              className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm transition focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
            />
            <p className="mt-1 text-xs text-muted-foreground">{administrativeText.length.toLocaleString('tr-TR')} karakter</p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Teknik Şartname Metni</label>
            <textarea
              value={technicalText}
              onChange={(e) => setTechnicalText(e.target.value)}
              rows={10}
              placeholder="Teknik şartname metnini buraya yapıştırın…"
              className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm transition focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
            />
            <p className="mt-1 text-xs text-muted-foreground">{technicalText.length.toLocaleString('tr-TR')} karakter</p>
          </div>
        </div>
        <button
          type="submit"
          disabled={submitting || documentSubmitting}
          className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-slate-800 disabled:opacity-60"
        >
          {submitting ? 'Analiz Çalışıyor…' : hasExistingAnalysis ? 'Metinden Yeniden Analiz Et' : 'Metinden Analiz Et'}
        </button>
      </details>

      {error && <p className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">{error}</p>}
      {result && (
        <div className="space-y-1.5">
          <p className={`flex items-start gap-1.5 text-sm ${result.conflictCount > 0 ? 'text-warning-700' : 'text-success-700'}`}>
            {result.conflictCount > 0 && <AlertTriangle size={14} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden />}
            <span>
              Analiz tamamlandı: {result.sectionsFound}/{result.sectionsTotal} bölümde veri bulundu.
              {result.conflictCount > 0 &&
                ` ${result.conflictCount} alanda idari/teknik şartname çelişkisi tespit edildi.`}
            </span>
          </p>
          {result.llmStatus === 'failed' && (
            <p className="flex items-start gap-1.5 rounded-lg border border-danger-100 bg-danger-50 px-3 py-2 text-sm text-danger-700">
              <ShieldAlert size={14} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                Analiz tamamlanamadı. Lütfen tekrar deneyin; sorun devam ederse destek ekibiyle iletişime geçin. Kesin alanlar bu durumdan etkilenmedi.
              </span>
            </p>
          )}
          {result.llmStatus === 'skipped_mock' && (
            <p className="flex items-start gap-1.5 rounded-lg border border-warning-100 bg-warning-50 px-3 py-2 text-sm text-warning-700">
              <ShieldAlert size={14} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                Analiz şu anda tamamlanamadı. Sadece kesin alanlar (idari bilgiler, teminat, kritik tarihler, resmi cetvel) hazır; geri kalanı için lütfen tekrar deneyin.
              </span>
            </p>
          )}
        </div>
      )}
    </form>
  );
}
