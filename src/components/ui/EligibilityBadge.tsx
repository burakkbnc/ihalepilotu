import { Check, X, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type EligibilityTone = 'uygun' | 'yasak' | 'belirsiz';

const TONE_CONFIG: Record<EligibilityTone, { label: string; className: string; icon: typeof Check }> = {
  uygun: { label: 'Uygun', className: 'bg-success-50 text-success-700 border-success-100', icon: Check },
  yasak: { label: 'Yasak', className: 'bg-danger-50 text-danger-700 border-danger-100', icon: X },
  belirsiz: { label: 'Belirsiz', className: 'bg-slate-100 text-muted border-border', icon: HelpCircle }
};

/**
 * Katılım Uygunluğu üst katman badge'i (görsel olarak dikey bir "tile",
 * yatay Badge pill'inden farklı) — kullanıcı talebi: Yeşil=Uygun,
 * Kırmızı=Yasak, Gri=Belirsiz. Alt katmandaki StatusBadge'den (5 ton)
 * farklı olarak SADECE bu 3 tonu destekler. Label TRUNCATE EDİLMEZ —
 * uzun kategori adları (örn. "Elektronik Eksiltme") doğal olarak 2
 * satıra sarılabilir.
 */
export default function EligibilityBadge({ label, tone }: { label: string; tone: EligibilityTone }) {
  const config = TONE_CONFIG[tone];
  const Icon = config.icon;
  return (
    <div className={cn('flex flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-center', config.className)}>
      <Icon size={16} strokeWidth={2.5} aria-hidden />
      <p className="text-xs font-medium leading-tight">{label}</p>
      <p className="text-[11px] font-semibold uppercase tracking-wide">{config.label}</p>
    </div>
  );
}
