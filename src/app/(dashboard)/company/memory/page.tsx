'use client';

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import {
  Archive,
  Award,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  FileBadge2,
  FileText,
  History,
  LibraryBig,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UploadCloud
} from 'lucide-react';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { storage, STORAGE_ENABLED } from '@/lib/firebase/client';
import { useAuth } from '@/hooks/useAuth';
import type { CompanyDocument, CompanyDocumentCategory, PastTenderRecord, PastTenderResult } from '@/types';

type TabKey = 'documents' | 'pastTenders';

const CATEGORY_LABELS: Record<CompanyDocumentCategory, string> = {
  kurumsal_belge: 'Kurumsal Belge',
  kalite_belgesi: 'Kalite Belgesi',
  is_deneyim_belgesi: 'İş Deneyim Belgesi',
  referans_belgesi: 'Referans Belgesi',
  yetki_belgesi: 'Yetki Belgesi',
  katalog_brosur: 'Katalog / Broşür',
  diger: 'Diğer'
};

const RESULT_LABELS: Record<PastTenderResult, string> = {
  won: 'Kazanıldı',
  lost: 'Kaybedildi',
  cancelled: 'İptal',
  ongoing: 'Devam Ediyor',
  no_bid: 'Teklif Verilmedi'
};

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function formatMoney(value?: number | null, currency = 'TRY') {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);
}

function fileSizeLabel(size?: number | null) {
  if (!size) return 'Dosya yok';
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export default function CompanyMemoryPage() {
  const { profile, loading: authLoading } = useAuth();
  const [serverCompanyId, setServerCompanyId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('documents');
  const [documents, setDocuments] = useState<CompanyDocument[]>([]);
  const [records, setRecords] = useState<PastTenderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedDocumentFile, setSelectedDocumentFile] = useState<File | null>(null);

  const effectiveCompanyId = profile?.companyId || serverCompanyId;

  const [docForm, setDocForm] = useState({
    title: '',
    category: 'is_deneyim_belgesi' as CompanyDocumentCategory,
    issuer: '',
    validUntil: '',
    fileName: '',
    fileSize: '',
    note: ''
  });

  const [tenderForm, setTenderForm] = useState({
    tenderName: '',
    institution: '',
    year: String(new Date().getFullYear()),
    tenderDate: '',
    offerAmount: '',
    currency: 'TRY' as PastTenderRecord['currency'],
    result: 'won' as PastTenderResult,
    note: ''
  });

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [docRes, tenderRes] = await Promise.all([fetch('/api/company/documents'), fetch('/api/company/past-tenders')]);
      const docBody = await docRes.json();
      const tenderBody = await tenderRes.json();
      if (!docRes.ok) throw new Error(docBody?.error?.message || 'Şirket belgeleri yüklenemedi.');
      if (!tenderRes.ok) throw new Error(tenderBody?.error?.message || 'Geçmiş ihaleler yüklenemedi.');
      setDocuments(docBody.data.documents as CompanyDocument[]);
      setRecords(tenderBody.data.records as PastTenderRecord[]);
    } catch (err: any) {
      setError(err?.message || 'Şirket hafızası yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (authLoading || profile?.companyId || serverCompanyId) return;

    let cancelled = false;

    const loadCompanyContext = async () => {
      try {
        const res = await fetch('/api/company/context', { cache: 'no-store' });
        const body = await res.json().catch(() => null);
        if (!cancelled && res.ok && body?.data?.companyId) {
          setServerCompanyId(body.data.companyId);
        }
      } catch {
        // Sessiz geç: API tarafındaki kayıt işlemi zaten gerçek şirket kontrolünü yapıyor.
      }
    };

    loadCompanyContext();

    return () => {
      cancelled = true;
    };
  }, [authLoading, profile?.companyId, serverCompanyId]);

  const stats = useMemo(() => {
    const activeDocs = documents.filter((doc) => !doc.validUntil || new Date(doc.validUntil) >= new Date()).length;
    return {
      documents: documents.length,
      activeDocs,
      workExperienceDocs: documents.filter((doc) => doc.category === 'is_deneyim_belgesi').length,
      pastTenders: records.length,
      won: records.filter((record) => record.result === 'won').length
    };
  }, [documents, records]);

  const filteredDocuments = useMemo(() => {
    const needle = query.toLocaleLowerCase('tr-TR');
    return documents.filter((doc) => `${doc.title} ${CATEGORY_LABELS[doc.category]} ${doc.issuer || ''} ${doc.note || ''}`.toLocaleLowerCase('tr-TR').includes(needle));
  }, [documents, query]);

  const filteredRecords = useMemo(() => {
    const needle = query.toLocaleLowerCase('tr-TR');
    return records.filter((record) => `${record.tenderName} ${record.institution} ${record.year || ''} ${RESULT_LABELS[record.result]} ${record.note || ''}`.toLocaleLowerCase('tr-TR').includes(needle));
  }, [records, query]);

  const handleDocumentSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      if (!effectiveCompanyId) {
        throw new Error('Şirket bilgisi henüz yüklenemedi. Sayfayı yenileyip tekrar deneyin.');
      }

      let filePayload: {
        fileName: string | null;
        fileSize: number | null;
        mimeType: string | null;
        storagePath: string | null;
        downloadUrl: string | null;
      } = {
        fileName: docForm.fileName || null,
        fileSize: docForm.fileSize ? Number(docForm.fileSize) : null,
        mimeType: null,
        storagePath: null,
        downloadUrl: null
      };

      if (selectedDocumentFile) {
        if (!STORAGE_ENABLED || !storage) {
          throw new Error('Dosya yükleme için Firebase Storage bucket tanımlı değil. .env.local içine NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET eklenmeli.');
        }
        if (selectedDocumentFile.size > 25 * 1024 * 1024) {
          throw new Error('Dosya boyutu 25 MB sınırını aşamaz.');
        }

        const safeName = selectedDocumentFile.name
          .normalize('NFKD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9._-]/g, '-')
          .replace(/-+/g, '-')
          .slice(0, 120);
        const path = `companies/${effectiveCompanyId}/company-documents/${Date.now()}-${safeName}`;
        const fileRef = storageRef(storage, path);
        const uploadResult = await uploadBytes(fileRef, selectedDocumentFile, {
          contentType: selectedDocumentFile.type || 'application/octet-stream'
        });
        const downloadUrl = await getDownloadURL(uploadResult.ref);

        filePayload = {
          fileName: selectedDocumentFile.name,
          fileSize: selectedDocumentFile.size,
          mimeType: selectedDocumentFile.type || 'application/octet-stream',
          storagePath: path,
          downloadUrl
        };
      }

      const res = await fetch('/api/company/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: docForm.title,
          category: docForm.category,
          issuer: docForm.issuer || null,
          validUntil: docForm.validUntil || null,
          fileName: filePayload.fileName,
          fileSize: filePayload.fileSize,
          mimeType: filePayload.mimeType,
          storagePath: filePayload.storagePath,
          downloadUrl: filePayload.downloadUrl,
          note: docForm.note || null
        })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || 'Belge eklenemedi.');
      setDocForm({ title: '', category: 'is_deneyim_belgesi', issuer: '', validUntil: '', fileName: '', fileSize: '', note: '' });
      setSelectedDocumentFile(null);
      setMessage(selectedDocumentFile ? 'Belge dosyası yüklendi ve şirket hafızasına eklendi.' : 'Şirket belgesi hafızaya eklendi.');
      await loadAll();
    } catch (err: any) {
      setError(err?.message || 'Belge eklenemedi.');
    } finally {
      setSaving(false);
    }
  };

  const handleDocumentFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setSelectedDocumentFile(file);
    if (file) {
      setDocForm((current) => ({
        ...current,
        title: current.title || file.name.replace(/\.[^.]+$/, ''),
        fileName: file.name,
        fileSize: String(file.size)
      }));
    }
  };

  const handleTenderSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/company/past-tenders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenderName: tenderForm.tenderName,
          institution: tenderForm.institution,
          year: tenderForm.year ? Number(tenderForm.year) : null,
          tenderDate: tenderForm.tenderDate || null,
          offerAmount: tenderForm.offerAmount ? Number(tenderForm.offerAmount) : null,
          currency: tenderForm.currency,
          result: tenderForm.result,
          note: tenderForm.note || null
        })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || 'Geçmiş ihale eklenemedi.');
      setTenderForm({ tenderName: '', institution: '', year: String(new Date().getFullYear()), tenderDate: '', offerAmount: '', currency: 'TRY', result: 'won', note: '' });
      setMessage('Geçmiş ihale kaydı hafızaya eklendi.');
      await loadAll();
    } catch (err: any) {
      setError(err?.message || 'Geçmiş ihale eklenemedi.');
    } finally {
      setSaving(false);
    }
  };

  const deleteDocument = async (id: string) => {
    if (!confirm('Bu belge kaydını silmek istediğinize emin misiniz?')) return;
    await fetch(`/api/company/documents/${id}`, { method: 'DELETE' });
    await loadAll();
  };

  const deleteRecord = async (id: string) => {
    if (!confirm('Bu geçmiş ihale kaydını silmek istediğinize emin misiniz?')) return;
    await fetch(`/api/company/past-tenders/${id}`, { method: 'DELETE' });
    await loadAll();
  };

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-6">
      <header className="overflow-hidden rounded-[34px] border border-white/10 bg-[#050A18] text-white shadow-[0_28px_90px_rgba(15,23,42,0.20)]">
        <div className="relative p-7 lg:p-10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_18%,rgba(96,165,250,0.24),transparent_30%),radial-gradient(circle_at_22%_100%,rgba(14,165,233,0.22),transparent_35%),linear-gradient(135deg,#050A18_0%,#081832_52%,#050A18_100%)]" />
          <div className="relative grid gap-8 xl:grid-cols-[1.1fr_0.9fr] xl:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-sky-200">
                <LibraryBig size={14} /> Faz 11 · Şirket Hafızası
              </div>
              <h1 className="mt-5 text-3xl font-semibold tracking-tight md:text-5xl">Kurumsal belgeler ve geçmiş ihaleler tek merkezde.</h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300 md:text-base">
                İş deneyimi, sertifika, referans ve önceki ihale verilerini burada toplayın. Sonraki fazda kapalı devre ihale asistanı bu hafızayı analiz sonuçlarıyla birlikte okuyacak.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <StatCard icon={FileBadge2} label="Belge" value={stats.documents} />
              <StatCard icon={ShieldCheck} label="Aktif Belge" value={stats.activeDocs} />
              <StatCard icon={Award} label="İş Deneyimi" value={stats.workExperienceDocs} />
              <StatCard icon={History} label="Kazanılan" value={stats.won} />
            </div>
          </div>
        </div>
      </header>

      {(error || message) && (
        <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
          {error || message}
        </div>
      )}

      <section className="grid gap-6 xl:grid-cols-[0.78fr_1.22fr]">
        <aside className="space-y-4">
          <div className="rounded-[30px] border border-slate-200/80 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.07)]">
            <div className="flex rounded-2xl bg-slate-100 p-1">
              <TabButton active={activeTab === 'documents'} onClick={() => setActiveTab('documents')} icon={Archive}>Belgeler</TabButton>
              <TabButton active={activeTab === 'pastTenders'} onClick={() => setActiveTab('pastTenders')} icon={BriefcaseBusiness}>Geçmiş İhaleler</TabButton>
            </div>
          </div>

          {activeTab === 'documents' ? (
            <FormCard title="Belge ekle" eyebrow="Şirket arşivi" icon={UploadCloud} onSubmit={handleDocumentSubmit} saving={saving} submitLabel="Belgeyi kaydet">
              <Input label="Belge adı" required value={docForm.title} onChange={(v) => setDocForm((f) => ({ ...f, title: v }))} placeholder="ISO 9001 Kalite Yönetim Belgesi" />
              <Select label="Belge türü" value={docForm.category} onChange={(v) => setDocForm((f) => ({ ...f, category: v as CompanyDocumentCategory }))} options={Object.entries(CATEGORY_LABELS)} />
              <Input label="Veren kurum" value={docForm.issuer} onChange={(v) => setDocForm((f) => ({ ...f, issuer: v }))} placeholder="TSE, Ticaret Odası..." />
              <Input label="Geçerlilik tarihi" type="date" value={docForm.validUntil} onChange={(v) => setDocForm((f) => ({ ...f, validUntil: v }))} />
              <FileInput file={selectedDocumentFile} onChange={handleDocumentFileChange} storageEnabled={STORAGE_ENABLED} />
              <Textarea label="Not" value={docForm.note} onChange={(v) => setDocForm((f) => ({ ...f, note: v }))} placeholder="Belgenin kapsamı, hangi ihalelerde kullanılabileceği..." />
            </FormCard>
          ) : (
            <FormCard title="Geçmiş ihale ekle" eyebrow="Kurumsal geçmiş" icon={Plus} onSubmit={handleTenderSubmit} saving={saving} submitLabel="İhaleyi kaydet">
              <Input label="İhale adı" required value={tenderForm.tenderName} onChange={(v) => setTenderForm((f) => ({ ...f, tenderName: v }))} placeholder="Tanıtım ve organizasyon hizmet alımı" />
              <Input label="Kurum" required value={tenderForm.institution} onChange={(v) => setTenderForm((f) => ({ ...f, institution: v }))} placeholder="Ankara Büyükşehir Belediyesi" />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Yıl" type="number" value={tenderForm.year} onChange={(v) => setTenderForm((f) => ({ ...f, year: v }))} />
                <Input label="Tarih" type="date" value={tenderForm.tenderDate} onChange={(v) => setTenderForm((f) => ({ ...f, tenderDate: v }))} />
              </div>
              <div className="grid grid-cols-[1fr_110px] gap-3">
                <Input label="Teklif tutarı" type="number" value={tenderForm.offerAmount} onChange={(v) => setTenderForm((f) => ({ ...f, offerAmount: v }))} />
                <Select label="Para" value={tenderForm.currency} onChange={(v) => setTenderForm((f) => ({ ...f, currency: v as PastTenderRecord['currency'] }))} options={[['TRY', 'TRY'], ['USD', 'USD'], ['EUR', 'EUR']]} />
              </div>
              <Select label="Sonuç" value={tenderForm.result} onChange={(v) => setTenderForm((f) => ({ ...f, result: v as PastTenderResult }))} options={Object.entries(RESULT_LABELS)} />
              <Textarea label="Not" value={tenderForm.note} onChange={(v) => setTenderForm((f) => ({ ...f, note: v }))} placeholder="Neden kazanıldı/kaybedildi, benzer iş ilişkisi, kritik notlar..." />
            </FormCard>
          )}
        </aside>

        <main className="rounded-[30px] border border-slate-200/80 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.07)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">Kayıtlar</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{activeTab === 'documents' ? 'Şirket Belgeleri' : 'Geçmiş İhaleler'}</h2>
            </div>
            <div className="relative w-full md:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Hafızada ara..." className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-10 py-3 text-sm font-medium outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100" />
            </div>
          </div>

          {loading ? (
            <div className="grid min-h-[360px] place-items-center text-slate-500"><Loader2 className="animate-spin" /></div>
          ) : activeTab === 'documents' ? (
            <div className="mt-5 space-y-3">
              {filteredDocuments.length === 0 ? <Empty title="Henüz belge yok" text="İş deneyimi, ISO, ticaret sicil ve referans belgelerini ekleyerek kurumsal hafızayı başlatın." /> : filteredDocuments.map((doc) => (
                <div key={doc.id} className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4 transition hover:bg-white hover:shadow-lg hover:shadow-slate-200/60">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">{CATEGORY_LABELS[doc.category]}</span>
                        <span className="rounded-full bg-slate-200/70 px-3 py-1 text-xs font-bold text-slate-600">{fileSizeLabel(doc.fileSize)}</span>
                      </div>
                      <h3 className="mt-3 text-lg font-semibold text-slate-950">{doc.title}</h3>
                      <p className="mt-1 text-sm text-slate-500">{doc.issuer || 'Kurum bilgisi yok'} · Geçerlilik: {formatDate(doc.validUntil)}</p>
                      {doc.fileName && <p className="mt-2 text-sm font-semibold text-slate-700">Dosya: {doc.fileName}</p>}
                      {doc.downloadUrl && <a href={doc.downloadUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 transition hover:bg-blue-100">Dosyayı aç</a>}
                      {doc.note && <p className="mt-3 text-sm leading-6 text-slate-600">{doc.note}</p>}
                    </div>
                    <button onClick={() => deleteDocument(doc.id)} className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-slate-400 transition hover:bg-rose-50 hover:text-rose-600" aria-label="Belgeyi sil"><Trash2 size={17} /></button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {filteredRecords.length === 0 ? <Empty title="Henüz geçmiş ihale yok" text="Kazanılan, kaybedilen ve devam eden ihaleleri ekleyerek şirket geçmişini oluşturun." /> : filteredRecords.map((record) => (
                <div key={record.id} className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4 transition hover:bg-white hover:shadow-lg hover:shadow-slate-200/60">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-3 py-1 text-xs font-bold ${record.result === 'won' ? 'bg-emerald-50 text-emerald-700' : record.result === 'lost' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{RESULT_LABELS[record.result]}</span>
                        <span className="rounded-full bg-slate-200/70 px-3 py-1 text-xs font-bold text-slate-600">{record.year || 'Yıl yok'}</span>
                      </div>
                      <h3 className="mt-3 text-lg font-semibold text-slate-950">{record.tenderName}</h3>
                      <p className="mt-1 text-sm text-slate-500">{record.institution} · {formatDate(record.tenderDate)} · {formatMoney(record.offerAmount, record.currency)}</p>
                      {record.note && <p className="mt-3 text-sm leading-6 text-slate-600">{record.note}</p>}
                    </div>
                    <button onClick={() => deleteRecord(record.id)} className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-slate-400 transition hover:bg-rose-50 hover:text-rose-600" aria-label="Kaydı sil"><Trash2 size={17} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </section>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return <div className="rounded-[24px] border border-white/10 bg-white/[0.07] p-4"><Icon className="text-sky-200" size={20} /><p className="mt-4 text-3xl font-semibold">{value}</p><p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-300">{label}</p></div>;
}
function TabButton({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon: any; children: ReactNode }) {
  return <button onClick={onClick} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold transition ${active ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}><Icon size={16} />{children}</button>;
}
function FormCard({ title, eyebrow, icon: Icon, onSubmit, saving, submitLabel, children }: { title: string; eyebrow: string; icon: any; onSubmit: (e: FormEvent) => void; saving: boolean; submitLabel: string; children: ReactNode }) {
  return <form onSubmit={onSubmit} className="rounded-[30px] border border-slate-200/80 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.07)]"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">{eyebrow}</p><h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{title}</h2></div><div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20"><Icon size={21} /></div></div><div className="mt-6 space-y-4">{children}<button disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:opacity-60">{saving ? 'Kaydediliyor…' : submitLabel}<CheckCircle2 size={16} /></button></div></form>;
}
function Input({ label, value, onChange, type = 'text', required = false, placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; placeholder?: string }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{label}</span><input required={required} type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100" /></label>;
}
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[][] }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100">{options.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>;
}
function Textarea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{label}</span><textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={4} className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100" /></label>;
}
function FileInput({ file, onChange, storageEnabled }: { file: File | null; onChange: (event: ChangeEvent<HTMLInputElement>) => void; storageEnabled: boolean }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Belge dosyası</span>
      <div className={`rounded-2xl border border-dashed px-4 py-4 ${storageEnabled ? 'border-blue-200 bg-blue-50/40' : 'border-amber-200 bg-amber-50'}`}>
        <input
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.txt"
          onChange={onChange}
          className="block w-full text-sm font-medium text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-blue-600 file:px-4 file:py-2.5 file:text-sm file:font-bold file:text-white hover:file:bg-blue-700"
        />
        <p className="mt-2 text-xs font-medium text-slate-500">
          {storageEnabled ? 'PDF, Word, Excel veya görsel yükleyebilirsiniz. Maksimum 25 MB.' : 'Storage bucket tanımlı olmadığı için dosya yükleme pasif. Metadata kaydı yapılabilir.'}
        </p>
        {file && <p className="mt-2 text-xs font-bold text-blue-700">Seçilen dosya: {file.name} · {fileSizeLabel(file.size)}</p>}
      </div>
    </label>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return <div className="grid min-h-[360px] place-items-center rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center"><div><ClipboardList className="mx-auto text-slate-400" size={38} /><h3 className="mt-4 text-lg font-semibold text-slate-950">{title}</h3><p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{text}</p></div></div>;
}
