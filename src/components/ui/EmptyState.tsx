import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';

/** Veri bulunmayan bölümler için tasarlanmış boş durum gösterimi. */
export default function EmptyState({
  icon: Icon = Inbox,
  message = 'Tespit edilemedi'
}: {
  icon?: LucideIcon;
  message?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border py-8 text-center">
      <Icon size={20} className="text-muted-foreground" strokeWidth={1.75} aria-hidden />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
