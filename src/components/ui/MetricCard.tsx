'use client';

import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type MetricTone = 'success' | 'warning' | 'danger' | 'neutral' | 'brand';

const TONE_STYLES: Record<MetricTone, { value: string; iconColor: string }> = {
  success: { value: 'text-success-700', iconColor: 'text-success-600' },
  warning: { value: 'text-warning-700', iconColor: 'text-warning-600' },
  danger: { value: 'text-danger-700', iconColor: 'text-danger-600' },
  neutral: { value: 'text-slate-700', iconColor: 'text-muted' },
  brand: { value: 'text-brand-700', iconColor: 'text-brand-600' }
};

/**
 * Tremor-tarzı metrik kartı — "büyük değer / küçük etiket" mantığı
 * (örn. "82 Risk Skoru", "5 Kritik Belge"). Executive Header'ın KPI
 * panelinde ve gerektiğinde başka analitik özetlerde kullanılır.
 *
 * ÖNEMLİ: değer metni TRUNCATE EDİLMEZ — uzun bir değer ("Tespit
 * edilemedi" gibi) geldiğinde kart 2 satıra sarılır, anlamsızca
 * kesilmez (kullanıcı talebi). `leading-tight` + doğal satır kırma
 * (`break-words`) ile bu sağlanır; kart yüksekliği içeriğe göre büyür
 * (sabit yükseklik zorlanmaz).
 */
export default function MetricCard({
  icon: Icon,
  label,
  value,
  tone = 'neutral'
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: MetricTone;
}) {
  const style = TONE_STYLES[tone];
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.15 }}
      className="rounded-xl border border-border bg-surface px-4 py-3.5 shadow-card transition-shadow hover:shadow-hover"
    >
      <Icon size={16} className={cn(style.iconColor, 'mb-2')} strokeWidth={2} aria-hidden />
      <p className={cn('break-words text-2xl font-bold leading-tight tracking-tight', style.value)}>{value}</p>
      <p className="mt-1.5 text-[11px] font-medium leading-snug text-muted-foreground">{label}</p>
    </motion.div>
  );
}
