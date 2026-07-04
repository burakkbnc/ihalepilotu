'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileText, UploadCloud } from 'lucide-react';
import { Card, CardContent, Button, ButtonLink, Badge } from '@/components/ui';
import { STORAGE_ENABLED } from '@/lib/firebase/client';
import { uploadTenderDocument } from '@/lib/tenders/uploadDocument';
import type { Tender, TenderDocumentType } from '@/types/tender';

export default function NewTenderPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [institutionName, setInstitutionName] = useState('');
  const [tenderDate, setTenderDate] = useState('');
  const [submissionDeadline, setSubmissionDeadline] = useState('');
  const [administrativeFile, setAdministrativeFile] = useState<File | null>(null);
  const [technicalFile, setTechnicalFile] = useState<File | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 2) {
      setError('İhale başlığı en az 2 karakter olmalıdır.');
      return;
    }

    if ((administrativeFile || technicalFile) && !STORAGE_ENABLED) {
      setError('Dosya yüklemek için Firebase Storage aktif olmalıdır.');
      return;
    }

    setSubmitting(true);
    try {
      setProgressLabel('İhale kaydı oluşturuluyor…');
      const res = await fetch('/api/tenders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: trimmedTitle,
          referenceNumber: referenceNumber.trim() || null,
          institutionName: institutionName.trim() || null,
          tenderDate: tenderDate ? new Date(tenderDate).toISOString() : null,
          submissionDeadline: submissionDeadline ? new Date(submissionDeadline).toISOString() : null
        })
      });

      const body = await res.json();
      if (!res.ok) {
        throw new Error(body?.error?.message || 'İhale oluşturulamadı.');
      }

      const tender = body.data.tender as Tender;

      if (administrativeFile) {
        setProgressLabel('İdari şartname yükleniyor…');
        await uploadTenderDocument({
          companyId: tender.companyId,
          tenderId: tender.id,
          documentType: 'idari_sartname',
          file: administrativeFile
        });
      }

      if (technicalFile) {
        setProgressLabel('Teknik şartname yükleniyor…');
        await uploadTenderDocument({
          companyId: tender.companyId,
          tenderId: tender.id,
          documentType: 'teknik_sartname',
          file: technicalFile
        });
      }

      router.replace(`/tenders/${tender.id}`);
    } catch (err: any) {
      setError(err?.message || 'İhale oluşturulamadı. Lütfen tekrar deneyin.');
    } finally {
      setSubmitting(false);
      setProgressLabel(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/tenders" className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:underline">
          <ArrowLeft size={14} strokeWidth={2} aria-hidden />
          İhalelere geri dön
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Yeni İhale Başlat</h1>
        <p className="text-sm text-muted-foreground">
          İhale kaydını oluşturun; isterseniz idari ve teknik şartnameyi aynı akışta yükleyin.
        </p>
      </div>

      <Card className="max-w-4xl">
        <CardContent className="space-y-5 pt-5">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="lg:col-span-2">
                <label htmlFor="title" className="mb-1 block text-sm font-medium text-slate-700">
                  İhale Başlığı <span className="text-danger-600">*</span>
                </label>
                <input
                  id="title"
                  type="text"
                  required
                  minLength={2}
                  maxLength={200}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Örn: Organizasyon Hizmeti Alımı"
                  className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm transition focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                />
              </div>

              <Field label="İhale Kayıt Numarası" htmlFor="referenceNumber">
                <input
                  id="referenceNumber"
                  type="text"
                  maxLength={80}
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder="Örn: 2026/123456"
                  className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm transition focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                />
              </Field>

              <Field label="İdare Adı" htmlFor="institutionName">
                <input
                  id="institutionName"
                  type="text"
                  maxLength={200}
                  value={institutionName}
                  onChange={(e) => setInstitutionName(e.target.value)}
                  placeholder="Örn: Ankara Büyükşehir Belediyesi"
                  className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm transition focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                />
              </Field>

              <Field label="İhale Tarihi" htmlFor="tenderDate">
                <input
                  id="tenderDate"
                  type="date"
                  value={tenderDate}
                  onChange={(e) => setTenderDate(e.target.value)}
                  className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm transition focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                />
              </Field>

              <Field label="Teklif Son Teslim Tarihi" htmlFor="submissionDeadline">
                <input
                  id="submissionDeadline"
                  type="date"
                  value={submissionDeadline}
                  onChange={(e) => setSubmissionDeadline(e.target.value)}
                  className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm transition focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                />
              </Field>
            </div>

            <div className="rounded-2xl border border-border-strong bg-surface-muted p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <FileText size={16} strokeWidth={2} className="text-brand-600" aria-hidden />
                  <p className="text-sm font-semibold text-slate-900">Şartname Dosyaları</p>
                </div>
                <Badge variant={STORAGE_ENABLED ? 'success' : 'warning'}>
                  {STORAGE_ENABLED ? 'Dosya yükleme aktif' : 'Storage gerekli'}
                </Badge>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <FilePicker
                  label="İdari Şartname"
                  file={administrativeFile}
                  disabled={!STORAGE_ENABLED || submitting}
                  onChange={setAdministrativeFile}
                />
                <FilePicker
                  label="Teknik Şartname"
                  file={technicalFile}
                  disabled={!STORAGE_ENABLED || submitting}
                  onChange={setTechnicalFile}
                />
              </div>
            </div>

            {progressLabel && (
              <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700" role="status">
                {progressLabel}
              </p>
            )}

            {error && (
              <p className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700" role="alert">
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Oluşturuluyor…' : 'İhaleyi Başlat'}
              </Button>
              <ButtonLink href="/tenders" variant="outline">
                Vazgeç
              </ButtonLink>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
    </div>
  );
}

function FilePicker({
  label,
  file,
  disabled,
  onChange
}: {
  label: string;
  file: File | null;
  disabled: boolean;
  onChange: (file: File | null) => void;
}) {
  return (
    <label className="flex cursor-pointer flex-col gap-2 rounded-xl border border-dashed border-border-strong bg-white p-4 transition hover:border-brand-300">
      <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
        <UploadCloud size={16} strokeWidth={2} className="text-brand-600" aria-hidden />
        {label}
      </span>
      <input
        type="file"
        disabled={disabled}
        accept=".pdf,.doc,.docx,.txt,.xls,.xlsx,image/*"
        className="text-xs text-muted-foreground file:mr-3 file:rounded-full file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-brand-700"
        onChange={(e) => onChange(e.target.files?.[0] || null)}
      />
      <span className="text-xs text-muted-foreground">{file ? file.name : 'PDF, Word, Excel, TXT veya görsel'}</span>
    </label>
  );
}
