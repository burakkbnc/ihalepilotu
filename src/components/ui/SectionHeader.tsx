import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Bölüm başlığı: başlık + alt açıklama + (opsiyonel) sağ aksesuar.
 * SectionCard'ın header'ı bunun üzerine kurulu, ama bağımsız da
 * kullanılabilir (örn. Card kullanmayan özel bir bölüm düzeni için).
 * Başlık/alt açıklama TRUNCATE EDİLMEZ — doğal olarak sarılır.
 */
export default function SectionHeader({
  title,
  description,
  accessory,
  className
}: {
  title: string;
  description?: string;
  accessory?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold leading-snug text-slate-900">{title}</h3>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {accessory && <div className="shrink-0">{accessory}</div>}
    </div>
  );
}
