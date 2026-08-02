'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import TenderStatusBadge from './TenderStatusBadge';
import { TENDER_STATUS_LABELS } from '@/lib/tenders/format';
import type { TenderStatus } from '@/types/tender';

const STATUS_OPTIONS: TenderStatus[] = [
  'draft',
  'documents_pending',
  'processing',
  'analysis_ready',
  'ready_for_bid',
  'archived'
];

export default function TenderStatusEditor({
  tenderId,
  status,
  editable
}: {
  tenderId: string;
  status: TenderStatus;
  editable: boolean;
}) {
  const router = useRouter();
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!editable) {
    return <TenderStatusBadge status={status} />;
  }

  const handleChange = async (newStatus: TenderStatus) => {
    if (newStatus === status) return;
    setError(null);
    setUpdating(true);
    try {
      const res = await fetch(`/api/tenders/${tenderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || 'Durum güncellenemedi.');
      router.refresh();
    } catch (err: any) {
      setError(err?.message || 'Durum güncellenemedi.');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <select
        value={status}
        disabled={updating}
        onChange={(e) => handleChange(e.target.value as TenderStatus)}
        className="rounded-lg border border-border-strong bg-surface px-2 py-1 text-xs font-medium transition focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt} value={opt}>
            {TENDER_STATUS_LABELS[opt]}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-danger-600">{error}</span>}
    </div>
  );
}
