'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { formatDate } from '@/lib/tenders/format';
import type { Tender } from '@/types/tender';

function toDateInputValue(iso: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

export default function TenderInfoEditor({ tender, editable }: { tender: Tender; editable: boolean }) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    referenceNumber: tender.referenceNumber ?? '',
    institutionName: tender.institutionName ?? '',
    tenderDate: toDateInputValue(tender.tenderDate),
    submissionDeadline: toDateInputValue(tender.submissionDeadline)
  });

  if (!editable) {
    return (
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoField label="İdare" value={tender.institutionName || '—'} />
        <InfoField label="Kayıt No" value={tender.referenceNumber || '—'} />
        <InfoField label="İhale Tarihi" value={formatDate(tender.tenderDate)} />
        <InfoField label="Teklif Son Tarihi" value={formatDate(tender.submissionDeadline)} />
      </dl>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/tenders/${tender.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referenceNumber: form.referenceNumber.trim() || null,
          institutionName: form.institutionName.trim() || null,
          tenderDate: form.tenderDate ? new Date(form.tenderDate).toISOString() : null,
          submissionDeadline: form.submissionDeadline ? new Date(form.submissionDeadline).toISOString() : null
        })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || 'Güncellenemedi.');

      setIsEditing(false);
      router.refresh();
    } catch (err: any) {
      setError(err?.message || 'Güncellenemedi.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isEditing) {
    return (
      <div className="space-y-2">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InfoField label="İdare" value={tender.institutionName || '—'} />
          <InfoField label="Kayıt No" value={tender.referenceNumber || '—'} />
          <InfoField label="İhale Tarihi" value={formatDate(tender.tenderDate)} />
          <InfoField label="Teklif Son Tarihi" value={formatDate(tender.submissionDeadline)} />
        </dl>
        <button onClick={() => setIsEditing(true)} className="text-xs font-medium text-brand-600 hover:underline">
          Bilgileri Düzenle
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-xl border border-border bg-surface-muted p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">İdare</label>
          <input
            type="text"
            maxLength={200}
            value={form.institutionName}
            onChange={(e) => setForm((f) => ({ ...f, institutionName: e.target.value }))}
            className="w-full rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-sm transition focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Kayıt No</label>
          <input
            type="text"
            maxLength={80}
            value={form.referenceNumber}
            onChange={(e) => setForm((f) => ({ ...f, referenceNumber: e.target.value }))}
            className="w-full rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-sm transition focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">İhale Tarihi</label>
          <input
            type="date"
            value={form.tenderDate}
            onChange={(e) => setForm((f) => ({ ...f, tenderDate: e.target.value }))}
            className="w-full rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-sm transition focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Teklif Son Tarihi</label>
          <input
            type="date"
            value={form.submissionDeadline}
            onChange={(e) => setForm((f) => ({ ...f, submissionDeadline: e.target.value }))}
            className="w-full rounded-lg border border-border-strong bg-surface px-2 py-1.5 text-sm transition focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
        </div>
      </div>

      {error && <p className="text-sm text-danger-600">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? 'Kaydediliyor…' : 'Kaydet'}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setIsEditing(false)}>
          Vazgeç
        </Button>
      </div>
    </form>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm text-slate-700">{value}</dd>
    </div>
  );
}
