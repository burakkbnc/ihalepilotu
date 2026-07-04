import Image from 'next/image';

/**
 * Marka bileşeni — KRİTİK KURAL:
 *
 * Gönderilen İhale Pilotu logosu (wordmark + işaret + tagline, tek dosya)
 * KESİNLİKLE yeniden tasarlanmaz, yeniden çizilmez, parçalarına ayrılıp
 * yeniden birleştirilmez, renkleri değiştirilmez, monogram/minimal versiyon
 * üretilmez. Bu component SADECE orijinal dosyayı (`/brand/logo-full-source.png`)
 * orantılı olarak ölçekleyip gösterir — `next/image`'ın width/height ile
 * yaptığı bu ölçekleme bir "yeniden tasarım" değildir, dosyanın piksel
 * içeriği hiç değişmez, sadece görüntülenen alan boyutu değişir.
 *
 * Kaynak dosya kullanıcının sağladığı LOGO.pdf'den türetilmiştir (yüksek
 * çözünürlüklü, şeffaf arka planlı PNG'ye dönüştürülmüş) — sadece PDF
 * sayfasının fazlalık şeffaf kenar boşluğu kırpılmıştır, logonun kendisi
 * (ikon/wordmark/tagline) hiçbir şekilde değiştirilmemiştir.
 *
 * Kullanım yerleri: Sidebar (üst), Dashboard/Analiz Header (sol üst).
 * Splash screen, giriş animasyonu, büyük hero logo YOK.
 */
const LOGO_ASPECT_RATIO = 7931 / 3212;

export default function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const height = size === 'sm' ? 32 : size === 'lg' ? 40 : 36;
  const width = Math.round(height * LOGO_ASPECT_RATIO);

  return (
    <Image
      src="/brand/logo-full-source.png"
      alt="İhale Pilotu — Akıllı İhale Analiz Platformu"
      width={width}
      height={height}
      className="shrink-0 object-contain"
      priority
    />
  );
}
