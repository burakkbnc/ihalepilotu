'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { UploadCloud, FileCheck2, CheckCircle2, Eye, Download } from 'lucide-react';
import { Card, CardHeader, CardContent, SectionHeader, Badge, Button, ButtonLink } from '@/components/ui';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui';
import { TENDER_DOCUMENT_TYPE_LABELS, formatDateTime } from '@/lib/tenders/format';
import { STORAGE_ENABLED } from '@/lib/firebase/client';
import { uploadTenderDocument } from '@/lib/tenders/uploadDocument';
import type { TenderDocument, TenderDocumentType } from '@/types/tender';

const STATUS_LABELS: Record<TenderDocument['status'], string> = {
  pending_upload: 'Yükleme Bekleniyor',
  uploaded: 'Yüklendi',
  extracting_text: 'Metin/Görüntü Çıkarılıyor',
  // SPRINT NOTU (Vision LLM): bu durum artık "OCR gerekli" anlamına
  // gelmiyor (OCR artık zorunlu/ana yol değil) — sayfa görüntüsüne
  // dönüştürme/okuma sırasında bir sorun yaşandığını belirtir. Firestore
  // alan adı (TenderDocumentStatus) geriye dönük uyumluluk için
  // 'ocr_required' olarak KALDI, sadece kullanıcıya gösterilen metin
  // güncellendi.
  ocr_required: 'Görüntü/Metin Sorunlu',
  analyzing: 'Analiz Ediliyor',
  completed: 'Tamamlandı',
  failed: 'Başarısız'
};

const STATUS_VARIANT: Record<TenderDocument['status'], 'neutral' | 'success' | 'warning' | 'danger'> = {
  pending_upload: 'warning',
  uploaded: 'success',
  extracting_text: 'neutral',
  ocr_required: 'warning',
  analyzing: 'neutral',
  completed: 'success',
  failed: 'danger'
};

export default function TenderDocumentsPanel({
  tenderId,
  companyId,
  initialDocuments,
  editable
}: {
  tenderId: string;
  companyId: string;
  initialDocuments: TenderDocument[];
  editable: boolean;
}) {
  const router = useRouter();
  const [documents, setDocuments] = useState(initialDocuments);
  const [error, setError] = useState<string | null>(null);
  const [submittingType, setSubmittingType] = useState<TenderDocumentType | null>(null);

  const handleUpload = async (
    e: FormEvent<HTMLFormElement>,
    documentType: TenderDocumentType,
    documentDate?: string | null
  ) => {
    e.preventDefault();
    setError(null);

    if (!companyId) {
      setError('Şirket bilgisi bulunamadı. Lütfen sayfayı yenileyin.');
      return;
    }

    const form = e.currentTarget;
    const fileInput = form.elements.namedItem('file') as HTMLInputElement;
    const file = fileInput.files?.[0];

    if (!file) {
      setError('Lütfen bir dosya seçin.');
      return;
    }

    setSubmittingType(documentType);
    try {
      const document = await uploadTenderDocument({
        companyId,
        tenderId,
        documentType,
        file,
        documentDate
      });

      setDocuments((prev) => [...prev, document]);
      fileInput.value = '';
      router.refresh();
    } catch (err: any) {
      setError(err?.message || 'Doküman yüklenemedi.');
    } finally {
      setSubmittingType(null);
    }
  };


  return (
    <Card>
      <CardHeader>
        <SectionHeader
          title="Dokümanlar"
          description="İdari şartname, teknik şartname, zeyilname/düzeltme ilanı ve ek belgeleri tek alandan yükleyin. Dosya türü PDF, Word, Excel, TXT veya görsel olabilir."
        />
      </CardHeader>
      <CardContent className="space-y-5 pt-0">
        {editable && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
            <UploadSlot
              documentType="idari_sartname"
              title="İdari Şartname Yükle"
              submitting={submittingType === 'idari_sartname'}
              disabled={!STORAGE_ENABLED}
              onSubmit={handleUpload}
            />
            <UploadSlot
              documentType="teknik_sartname"
              title="Teknik Şartname Yükle"
              submitting={submittingType === 'teknik_sartname'}
              disabled={!STORAGE_ENABLED}
              onSubmit={handleUpload}
            />
            <UploadSlot
              documentType="zeyilname"
              title="Zeyilname / Düzeltme İlanı Yükle"
              submitting={submittingType === 'zeyilname'}
              disabled={!STORAGE_ENABLED}
              onSubmit={handleUpload}
              showDateField
            />
            <UploadSlot
              documentType="ek_belge"
              title="Ek Belge Yükle"
              submitting={submittingType === 'ek_belge'}
              disabled={!STORAGE_ENABLED}
              onSubmit={handleUpload}
            />
          </div>
        )}

        {!STORAGE_ENABLED && editable && (
          <p className="rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-700" role="alert">
            Firebase Storage bucket tanımlı değil. Dosya yüklemek için .env.local içinde NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET değerini ekleyin.
          </p>
        )}

        {error && (
          <p className="rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700" role="alert">
            {error}
          </p>
        )}

        <div>
          <div className="mb-2 flex items-center gap-2">
            <FileCheck2 size={14} strokeWidth={2} className="text-muted-foreground" aria-hidden />
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Kayıtlı Dokümanlar</p>
          </div>
          {documents.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border-strong py-6 text-center text-sm text-muted-foreground">
              Henüz doküman yüklenmedi.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dosya Adı</TableHead>
                  <TableHead>Tür</TableHead>
                  <TableHead>Belge Tarihi</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead>Boyut</TableHead>
                  <TableHead>Eklenme</TableHead>
                  <TableHead className="text-right">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium text-slate-800">{doc.fileName}</TableCell>
                    <TableCell>{TENDER_DOCUMENT_TYPE_LABELS[doc.documentType]}</TableCell>
                    <TableCell>
                      {doc.documentType === 'zeyilname' ? (
                        doc.documentDate ? (
                          formatOptionalDateTime(doc.documentDate)
                        ) : (
                          <span className="text-warning-700">Girilmedi (yükleme sırası esas alınır)</span>
                        )
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[doc.status]}>{STATUS_LABELS[doc.status]}</Badge>
                    </TableCell>
                    <TableCell>{formatFileSize(doc.fileSize)}</TableCell>
                    <TableCell>{formatOptionalDateTime(doc.createdAt)}</TableCell>
                    <TableCell>
                      <DocumentActions tenderId={tenderId} document={doc} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </CardContent>
    </Card>
  );
}


function DocumentActions({
  tenderId,
  document
}: {
  tenderId: string;
  document: TenderDocument;
}) {
  if (!document.storagePath) {
    return (
      <div className="flex justify-end text-xs text-muted-foreground">
        Dosya yok
      </div>
    );
  }

  const previewUrl = `/api/tenders/${tenderId}/documents/${document.id}/file?mode=preview`;
  const downloadUrl = `/api/tenders/${tenderId}/documents/${document.id}/file?mode=download`;

  return (
    <div className="flex justify-end gap-2">
      <ButtonLink
        href={previewUrl}
        target="_blank"
        rel="noopener noreferrer"
        variant="ghost"
        size="sm"
        title="Dokümanı önizle"
      >
        <Eye size={14} strokeWidth={2} aria-hidden />
        Önizle
      </ButtonLink>
      <ButtonLink
        href={downloadUrl}
        variant="outline"
        size="sm"
        title="Dokümanı indir"
      >
        <Download size={14} strokeWidth={2} aria-hidden />
        İndir
      </ButtonLink>
    </div>
  );
}

function UploadSlot({
  documentType,
  title,
  submitting,
  disabled,
  onSubmit,
  showDateField = false
}: {
  documentType: TenderDocumentType;
  title: string;
  submitting: boolean;
  disabled: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>, documentType: TenderDocumentType, documentDate?: string | null) => void;
  /** Zeyilname/düzeltme ilanı gibi güncelleme dokümanlarında, birden
      fazla belge arasındaki kronolojik sırayı belirlemek için belge
      tarihi girişi gösterilir. */
  showDateField?: boolean;
}) {
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [documentDate, setDocumentDate] = useState('');

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setSelectedFileName(file ? file.name : null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    const form = event.currentTarget;
    await onSubmit(event, documentType, documentDate || null);
    const fileInput = form.elements.namedItem('file') as HTMLInputElement | null;
    if (!fileInput?.files?.length) {
      setSelectedFileName(null);
      setDocumentDate('');
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-2xl border border-border-strong bg-surface p-4 transition hover:border-brand-200 hover:shadow-sm"
    >
      <div className="flex items-center gap-2">
        <UploadCloud size={16} strokeWidth={2} className="text-brand-600" aria-hidden />
        <p className="text-sm font-medium text-slate-800">{title}</p>
      </div>
      <label
        className={`flex min-h-[96px] flex-col items-center justify-center rounded-xl border border-dashed px-3 py-4 text-center text-xs transition ${
          disabled || submitting
            ? 'cursor-not-allowed border-border bg-slate-50 text-slate-400'
            : 'cursor-pointer border-border-strong bg-surface-muted text-muted-foreground hover:border-brand-300 hover:bg-brand-50/40'
        }`}
      >
        <input
          name="file"
          type="file"
          disabled={disabled || submitting}
          accept=".pdf,.doc,.docx,.txt,.xls,.xlsx,image/*"
          className="sr-only"
          onChange={handleFileChange}
        />
        <CheckCircle2 size={18} strokeWidth={2} className="mb-1 text-brand-600" aria-hidden />
        <span>{selectedFileName ? 'Dosya seçildi' : 'PDF / Word / Excel / TXT / Görsel'}</span>
        {selectedFileName && (
          <span className="mt-2 max-w-full truncate rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
            {selectedFileName}
          </span>
        )}
      </label>
      {showDateField && (
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Belge Tarihi (önerilir)
          </label>
          <input
            type="date"
            value={documentDate}
            onChange={(e) => setDocumentDate(e.target.value)}
            disabled={disabled || submitting}
            className="w-full rounded-lg border border-border-strong bg-surface px-2.5 py-1.5 text-sm transition focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Birden fazla zeyilname varsa, hangisinin daha güncel olduğunu
            belirlemek için kullanılır. Boş bırakırsanız yükleme sırası
            esas alınır (daha az güvenilir).
          </p>
        </div>
      )}
      {disabled && (
        <p className="text-xs text-warning-700">
          Storage env değeri eksik olduğu için dosya seçimi kapalı.
        </p>
      )}
      <Button type="submit" variant="outline" size="sm" disabled={disabled || submitting || !selectedFileName}>
        {submitting ? 'Yükleniyor…' : selectedFileName ? 'Yükle ve Kaydet' : 'Önce dosya seç'}
      </Button>
    </form>
  );
}

function formatFileSize(size?: number | null) {
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}


function formatOptionalDateTime(value?: string | Date | null) {
  if (!value) return "—";
  try {
    return formatDateTime(value as any);
  } catch {
    return "—";
  }
}
