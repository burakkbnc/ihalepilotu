import { Square } from 'lucide-react';
import { Card } from './Card';
import { Badge } from './Badge';
import ReferenceBadge from './ReferenceBadge';

/**
 * Gerekli Belgeler checklist öğesi — Card primitive'i üzerine kurulu.
 * Sol checkbox / orta açıklama / sağ durum badge şeklinde 3 net kolon
 * (kullanıcı talebi). Soldaki kare (checkbox görünümü) SADECE görsel
 * bir ipucudur — hiçbir state tutmaz, tıklanamaz, veri kaydetmez. Amaç
 * kullanıcıya "yapılacaklar listesi" hissi vermek. Metinler TRUNCATE
 * EDİLMEZ — belge adı ve açıklama gerektiğinde doğal olarak sarılır.
 */
export default function ChecklistItem({
  belgeAdi,
  zorunlu,
  aciklama,
  kaynak
}: {
  belgeAdi: string;
  /** null ise "zorunlu mu" bilgisi şartnamede belirtilmemiş anlamına gelir. */
  zorunlu?: boolean | null;
  aciklama: string;
  kaynak?: string | null;
}) {
  return (
    <Card className="flex items-start gap-3 p-3.5 shadow-card">
      <Square size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-muted-foreground/50" aria-hidden />

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug text-slate-800">{belgeAdi}</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">{aciklama}</p>
        {kaynak && (
          <div className="mt-1.5">
            <ReferenceBadge reference={kaynak} />
          </div>
        )}
      </div>

      <div className="shrink-0">
        {zorunlu === true && <Badge variant="danger">Zorunlu</Badge>}
        {zorunlu === false && <Badge variant="neutral">Opsiyonel</Badge>}
      </div>
    </Card>
  );
}
