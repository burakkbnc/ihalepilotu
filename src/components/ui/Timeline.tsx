'use client';

import { motion } from 'framer-motion';
import { ArrowDown } from 'lucide-react';
import { Card } from './Card';

export interface TimelineStep {
  label: string;
  detail?: string;
}

/**
 * İş akışını dikey bir timeline olarak gösterir — kullanıcı talebi:
 * "Kullanıcı işin akışını görebilmeli." Her adım arasında ok (↓) ile
 * bağlanır. Abartısız fade-in animasyonu. Card primitive'i üzerine
 * kurulu.
 */
export default function Timeline({ steps }: { steps: TimelineStep[] }) {
  if (steps.length === 0) return null;

  return (
    <div className="flex flex-col">
      {steps.map((step, idx) => (
        <motion.div
          key={idx}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: idx * 0.04 }}
        >
          <Card className="flex items-center gap-3 px-4 py-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
              {idx + 1}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium leading-snug text-slate-800">{step.label}</p>
              {step.detail && <p className="text-xs leading-relaxed text-muted-foreground">{step.detail}</p>}
            </div>
          </Card>
          {idx < steps.length - 1 && (
            <div className="flex justify-center py-1">
              <ArrowDown size={14} className="text-muted-foreground/60" strokeWidth={2} aria-hidden />
            </div>
          )}
        </motion.div>
      ))}
    </div>
  );
}
