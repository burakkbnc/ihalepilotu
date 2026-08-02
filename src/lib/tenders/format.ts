// ============================================================
// İhale durumu için Türkçe etiketler ve renk sınıfları
// ============================================================
import type { TenderStatus, TenderDocumentType } from '@/types/tender';

export const TENDER_STATUS_LABELS: Record<TenderStatus, string> = {
  draft: 'Taslak',
  documents_pending: 'Doküman Bekleniyor',
  processing: 'İşleniyor',
  analysis_ready: 'Analiz Hazır',
  ready_for_bid: 'Teklife Hazır',
  archived: 'Arşivlendi'
};

export const TENDER_STATUS_STYLES: Record<TenderStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  documents_pending: 'bg-amber-50 text-amber-700',
  processing: 'bg-blue-50 text-blue-700',
  analysis_ready: 'bg-emerald-50 text-emerald-700',
  ready_for_bid: 'bg-brand-50 text-brand-700',
  archived: 'bg-slate-100 text-slate-400'
};

export const TENDER_DOCUMENT_TYPE_LABELS: Record<TenderDocumentType, string> = {
  idari_sartname: 'İdari Şartname',
  teknik_sartname: 'Teknik Şartname',
  sozlesme_tasarisi: 'Sözleşme Tasarısı',
  birim_fiyat_cetveli: 'Birim Fiyat Cetveli',
  zeyilname: 'Zeyilname / Düzeltme İlanı',
  ek_belge: 'Ek Belge'
};

export const RISK_LEVEL_LABELS: Record<'low' | 'medium' | 'high', string> = {
  low: 'Düşük',
  medium: 'Orta',
  high: 'Yüksek'
};

export const RISK_LEVEL_STYLES: Record<'low' | 'medium' | 'high', string> = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-amber-50 text-amber-700',
  high: 'bg-red-50 text-red-700'
};

export function yesNoLabel(value: boolean | null): string {
  if (value === null) return 'Bilgi tespit edilemedi';
  return value ? 'Evet' : 'Hayır';
}

export function formatDate(value: string | null): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  } catch {
    return '—';
  }
}

export function formatDateTime(value: string | null): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '—';
  }
}

export function formatCurrency(value?: number | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return '0,00 TL';
  }
  return value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL';
}
