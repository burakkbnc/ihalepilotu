import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Card primitive ailesi — shadcn/ui kompozisyon deseni.
 *
 * Bu, İhale Pilotu'nun TÜM yüzeylerinin (bölüm kartları, metrik kartları,
 * risk kartları, checklist öğeleri) tek render edildiği temel kabuktur.
 * Eskiden her component kendi "rounded-2xl border border-border bg-surface
 * p-5 shadow-card" string'ini tekrar yazıyordu — bu artık TEK kaynaktan
 * gelir, tutarsızlık riski ortadan kalkar.
 *
 * Kullanım: <Card><CardHeader><CardTitle>...</CardTitle><CardDescription>...
 * </CardDescription></CardHeader><CardContent>...</CardContent></Card>
 */
export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-2xl border border-border bg-surface shadow-card', className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-start justify-between gap-3 p-5 pb-4', className)} {...props}>
      {children}
    </div>
  );
}

/**
 * `min-w-0` + doğal satır kaynağı (NOT truncate) — başlıklar gerekirse
 * 2 satıra sarılır, anlamsızca kesilmez (kullanıcı talebi).
 */
export function CardTitle({ className, children, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('min-w-0 text-sm font-semibold leading-snug text-slate-900', className)} {...props}>
      {children}
    </h3>
  );
}

export function CardDescription({ className, children, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('mt-0.5 text-xs leading-relaxed text-muted-foreground', className)} {...props}>
      {children}
    </p>
  );
}

export function CardContent({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-5 pb-5', className)} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-center gap-2 border-t border-border px-5 py-3.5', className)} {...props}>
      {children}
    </div>
  );
}

/** CardHeader'ın sağında gösterilen aksesuar slotu (örn. bir aksiyon butonu veya rozet). */
export function CardAccessory({ children }: { children: ReactNode }) {
  return <div className="shrink-0">{children}</div>;
}
