import type { LucideIcon } from 'lucide-react';
import { Card } from './Card';

/**
 * Hızlı Bakış kartı — kompakt tek-bloklu düzen (ikon + etiket + değer),
 * amaç "10 saniyede ihale özeti". Değer TRUNCATE EDİLMEZ — uzun bir
 * değer geldiğinde (örn. uzun bir teslim süresi aralığı) en fazla 2
 * satıra sarılır (`line-clamp-2`), anlamsızca kesilmez.
 */
export default function QuickFactCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  const isEmpty = value === 'tespit_edilemedi';
  return (
    <Card className="flex min-h-[88px] items-start gap-2.5 px-3 py-3 shadow-card">
      <Icon size={14} strokeWidth={2} className="mt-0.5 shrink-0 text-brand-500" aria-hidden />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`text-[13px] leading-snug ${isEmpty ? 'text-muted-foreground' : 'font-medium text-slate-800'}`}>
          {isEmpty ? 'Tespit edilemedi' : value}
        </p>
      </div>
    </Card>
  );
}
