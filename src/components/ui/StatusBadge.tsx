import { Check, X, AlertTriangle, HelpCircle, AlertCircle } from 'lucide-react';
import { Badge, type BadgeVariant } from './Badge';

export type StatusBadgeTone = 'uygun' | 'yasak' | 'zorunlu' | 'belirsiz' | 'dikkat';

const TONE_VARIANT: Record<StatusBadgeTone, BadgeVariant> = {
  uygun: 'success',
  yasak: 'danger',
  zorunlu: 'brand',
  belirsiz: 'neutral',
  dikkat: 'warning'
};

const TONE_ICONS: Record<StatusBadgeTone, typeof Check> = {
  uygun: Check,
  yasak: X,
  zorunlu: AlertCircle,
  belirsiz: HelpCircle,
  dikkat: AlertTriangle
};

const TONE_LABELS: Record<StatusBadgeTone, string> = {
  uygun: 'Uygun',
  yasak: 'Yasak',
  zorunlu: 'Zorunlu',
  belirsiz: 'Belirsiz',
  dikkat: 'Dikkat'
};

/**
 * Katılım Uygunluğu satırları ve benzeri durum göstergeleri için rozet —
 * Badge primitive'i üzerine kurulu. Kullanıcı talebi: Uygun / Yasak /
 * Zorunlu / Belirsiz / Dikkat durum setini destekler. Emoji KULLANILMAZ —
 * lucide-react ikonları kullanılır.
 */
export default function StatusBadge({ tone, label }: { tone: StatusBadgeTone; label?: string }) {
  const Icon = TONE_ICONS[tone];
  return (
    <Badge variant={TONE_VARIANT[tone]}>
      <Icon size={12} strokeWidth={2.5} aria-hidden />
      {label ?? TONE_LABELS[tone]}
    </Badge>
  );
}
