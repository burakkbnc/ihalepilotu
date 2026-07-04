'use client';

import { motion } from 'framer-motion';
import { AlertOctagon, AlertTriangle, CheckCircle2, Gauge } from 'lucide-react';
import { Card } from './Card';
import { Badge, type BadgeVariant } from './Badge';
import ReferenceBadge from './ReferenceBadge';
import { cn } from '@/lib/utils';

export type RiskLevel = 'düşük' | 'orta' | 'yüksek';

// Faz 4.2 kullanıcı talebi: Yüksek = kırmızı, Orta = turuncu, Düşük = yeşil.
// Not: "orta" seviyesi için Badge'in 'warning' (amber) variant'ı değil,
// kullanıcının özellikle istediği turuncu tonu kullanılır — bu yüzden
// Badge'in className override'ı ile turuncu paleti elle uygulanır.
const LEVEL_CONFIG: Record<
  RiskLevel,
  { label: string; badgeVariant: BadgeVariant; badgeClassName?: string; icon: typeof AlertOctagon; accent: string; scoreText: string }
> = {
  yüksek: { label: 'Yüksek', badgeVariant: 'danger', icon: AlertOctagon, accent: 'border-l-danger-600', scoreText: 'text-danger-600' },
  orta: {
    label: 'Orta',
    badgeVariant: 'warning',
    badgeClassName: 'bg-orange-50 text-orange-700',
    icon: AlertTriangle,
    accent: 'border-l-orange-500',
    scoreText: 'text-orange-600'
  },
  düşük: { label: 'Düşük', badgeVariant: 'success', icon: CheckCircle2, accent: 'border-l-success-600', scoreText: 'text-success-600' }
};

const LEVEL_LABEL: Record<RiskLevel, string> = { yüksek: 'Yüksek', orta: 'Orta', düşük: 'Düşük' };

/**
 * Risk Merkezi kartı — Card primitive'i üzerine kurulu (sol renkli şerit
 * className override ile eklenir, Card'ın varsayılan border'ı korunur).
 * Faz 4.5: riskSkoru/etki/olasilik eklendi (LLM tarafından üretilir) —
 * "Risk Skoru: 85/100, Etki: Yüksek, Olasılık: Orta, Seviye: Yüksek"
 * formatında. Bu alanlar optional: Faz 4.5 öncesi Firestore kayıtlarında
 * bulunmazlar (geriye dönük uyumluluk) — bu durumda kart eski haliyle
 * (sadece başlık/açıklama/kaynak/seviye rozeti) render edilir. Hover'da
 * hafif yükselme.
 */
export default function RiskCard({
  baslik,
  seviye,
  aciklama,
  kaynak,
  riskSkoru,
  etki,
  olasilik
}: {
  baslik: string;
  seviye: RiskLevel;
  aciklama: string;
  kaynak?: string | null;
  riskSkoru?: number;
  etki?: RiskLevel;
  olasilik?: RiskLevel;
}) {
  const config = LEVEL_CONFIG[seviye];
  const Icon = config.icon;
  const hasScoreRow = riskSkoru !== undefined || etki !== undefined || olasilik !== undefined;

  return (
    <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.15 }}>
      <Card className={cn('border-l-[3px] p-4 transition-shadow hover:shadow-hover', config.accent)}>
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 text-sm font-medium leading-snug text-slate-900">{baslik}</p>
          <Badge variant={config.badgeVariant} className={cn('shrink-0', config.badgeClassName)}>
            <Icon size={12} strokeWidth={2.5} aria-hidden />
            {config.label}
          </Badge>
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{aciklama}</p>

        {hasScoreRow && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-2.5 text-xs">
            {riskSkoru !== undefined && (
              <span className="inline-flex items-center gap-1 font-medium">
                <Gauge size={12} strokeWidth={2} className={config.scoreText} aria-hidden />
                Risk Skoru: <span className={config.scoreText}>{riskSkoru}/100</span>
              </span>
            )}
            {etki !== undefined && (
              <span className="text-muted-foreground">
                Etki: <span className="font-medium text-slate-700">{LEVEL_LABEL[etki]}</span>
              </span>
            )}
            {olasilik !== undefined && (
              <span className="text-muted-foreground">
                Olasılık: <span className="font-medium text-slate-700">{LEVEL_LABEL[olasilik]}</span>
              </span>
            )}
          </div>
        )}

        {kaynak && (
          <div className="mt-2">
            <ReferenceBadge reference={kaynak} />
          </div>
        )}
      </Card>
    </motion.div>
  );
}
