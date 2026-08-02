import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Etiket + değer çiftini gösteren satır, InfoCard içinde kullanılır.
 * Değer TRUNCATE EDİLMEZ — uzun bir değer (örn. tam IBAN, uzun sözleşme
 * türü adı) `min-w-0` + `break-words` ile doğal olarak sarılır.
 */
export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  const isEmpty = value === null || value === undefined || value === 'tespit_edilemedi';
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          'min-w-0 break-words text-right text-sm',
          isEmpty ? 'text-muted-foreground' : 'font-medium text-slate-800'
        )}
      >
        {isEmpty ? 'Tespit edilemedi' : value}
      </span>
    </div>
  );
}

/**
 * Genel bilgi kartı — Teminat Analizi'nin iki kolonlu yapısında
 * (Geçici Teminat / Kesin Teminat) ve IBAN gibi tekil bilgi kutularında
 * kullanılır. Card primitive'inden farklı bir görsel varyant olduğu
 * için (accent tonu, daha sade border) doğrudan Card'ı kullanmaz, ama
 * aynı `cn()` kompozisyon yaklaşımını izler.
 */
export default function InfoCard({
  title,
  tone = 'default',
  children
}: {
  title?: string;
  tone?: 'default' | 'accent';
  children: ReactNode;
}) {
  return (
    <div className={cn('rounded-xl border p-4', tone === 'accent' ? 'border-brand-100 bg-brand-50/40' : 'border-border bg-surface-muted')}>
      {title && <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>}
      <div className="divide-y divide-border/60">{children}</div>
    </div>
  );
}
