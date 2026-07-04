'use client';

import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { Card } from './Card';
import { Badge } from './Badge';
import { cn } from '@/lib/utils';

/**
 * Accordion bölümü — kullanıcı talebi: "Teknik Yükümlülükler, Gerekli
 * Belgeler, Kaynak Metinler, Detaylı Açıklamalar" gibi yoğun/ikincil
 * içerik için kullanılır. "Hızlı Bakış, Katılım Uygunluğu, Risk Merkezi,
 * Teminat Analizi" gibi her zaman açık bölümler için KULLANILMAZ (bunlar
 * doğrudan SectionCard ile render edilir).
 *
 * Card primitive'i üzerine kurulu. Başlangıçta kapalı (defaultOpen=false
 * varsayılan) — kullanıcı isterse açar. Açılma/kapanma yumuşak
 * height+opacity geçişiyle animasyonludur. Başlık TRUNCATE EDİLMEZ —
 * uzun başlıklar doğal olarak sarılır, taşmaz.
 */
export default function AccordionSection({
  title,
  badge,
  defaultOpen = false,
  children
}: {
  title: string;
  /** Başlığın yanında gösterilen kısa sayaç/etiket (örn. "7 kategori") */
  badge?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-surface-muted"
        aria-expanded={open}
      >
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-sm font-semibold leading-snug text-slate-900">{title}</span>
          {badge && <Badge variant="neutral">{badge}</Badge>}
        </span>
        <ChevronDown
          size={18}
          className={cn('shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-border px-5 py-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
