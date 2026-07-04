import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type BadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'brand' | 'outline';

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  neutral: 'bg-slate-100 text-muted',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-700',
  brand: 'bg-brand-50 text-brand-700',
  outline: 'border border-border bg-surface-muted text-muted-foreground'
};

/**
 * Badge primitive — shadcn/ui'nin variant deseni. Tek satırlık metin
 * etiketleri (rozet) için tüm uygulamada kullanılan TEK kaynak.
 * StatusBadge / EligibilityBadge / ReferenceBadge bunun üzerine
 * kompoze edilir — her biri kendi semantik anlamını (uygun/yasak/
 * belirsiz vb.) bir variant + ikon eşlemesine indirger.
 */
export function Badge({
  variant = 'neutral',
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: BadgeVariant }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium',
        VARIANT_STYLES[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
