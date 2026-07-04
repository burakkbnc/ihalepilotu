import { FileText } from 'lucide-react';
import { Badge } from './Badge';

/**
 * Kaynak referans rozeti — "Madde 7.1", "Teknik Şartname 4.2" gibi
 * şartname madde referanslarını gösterir. İleride PDF deep-link desteği
 * eklenecek (kullanıcı talebi #9) — bu yüzden component zaten hover
 * efektine ve tıklanabilir bir görünüme sahip, ama şu an gerçekten
 * tıklanamaz (onClick yok, cursor-default). Badge primitive'inin
 * `outline` variant'ı üzerine kurulu, sadece köşe yarıçapı ve hover
 * rengi bu rozete özgü (rounded-md, brand-tonlu hover) olacak şekilde
 * override edilmiş.
 */
export default function ReferenceBadge({ reference }: { reference: string | null | undefined }) {
  if (!reference || reference === 'tespit_edilemedi') return null;

  return (
    <Badge
      variant="outline"
      className="rounded-md transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
      title="PDF kaynak bağlantısı yakında eklenecek"
    >
      <FileText size={11} strokeWidth={2} aria-hidden />
      {reference}
    </Badge>
  );
}
