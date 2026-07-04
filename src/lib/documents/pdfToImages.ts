// ============================================================
// PDF -> Sayfa Görüntüleri (paylaşılan yardımcı)
//
// SPRINT NOTU (Vision LLM merkezli mimari): Bu modül, önceden yalnızca
// Tesseract OCR için (src/lib/ocr/tesseract.ts -> runPdfOcr) kullanılan
// PDF sayfa rasterizasyon mantığının PAYLAŞILAN/ORTAK halidir. Artık iki
// tüketicisi var:
//   1. src/lib/documents/extractText.ts — taranmış/görsel PDF'lerin
//      sayfalarını Vision destekli LLM'e GÖNDERMEK için (ANA YOL).
//   2. src/lib/ocr/tesseract.ts — Vision LLM mevcut değilse veya
//      başarısız olursa devreye giren İKİNCİL/yardımcı OCR katmanı için.
//
// pdfjs-dist + @napi-rs/canvas zaten package.json'da mevcuttur (önceden
// sadece OCR için kullanılıyordu), yeni bir bağımlılık EKLENMEDİ.
// ============================================================

export type PdfPageImage = {
  pageNumber: number;
  /** Base64 kodlanmış sayfa/görsel görüntüsü (data: öneki OLMADAN, ham base64). */
  base64: string;
  /**
   * Rasterize edilmiş PDF sayfaları her zaman 'image/png' üretir; ancak bu
   * tip aynı zamanda doğrudan yüklenen görsel dosyalar (jpg/webp/gif) için
   * de kullanıldığından (bkz. extractText.ts), tam Vision-desteklenen
   * format kümesini kabul eder.
   */
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
};

/**
 * KÖK NEDEN DÜZELTMESİ (Trabzon testinde bulundu — "Setting up fake
 * worker failed: Cannot find module '.../pdf.worker.mjs'"): pdfjs-dist,
 * `disableWorker: true` verilse bile bazı durumlarda kendi "fake worker"
 * (aynı thread'de çalışan, ama yine de pdf.worker.mjs dosyasını modül
 * olarak import etmeye çalışan) mekanizmasını kurmaya çalışıyor. Next.js
 * bu dosyayı sunucu webpack bundle'ının (`vendor-chunks`) yanına
 * kopyalamadığından import başarısız oluyor ve TÜM PDF render işlemi
 * (dolayısıyla Vision LLM analizi) çöküyor.
 *
 * Asıl düzeltme `next.config.js`'te `pdfjs-dist`'i webpack bundle'ının
 * DIŞINA almak (`serverComponentsExternalPackages` + `externals`) — bu
 * fonksiyon buna EK bir güvenlik katmanı: worker dosyasının gerçek
 * dosya sistemi yolunu `require.resolve` ile bulup pdfjs-dist'e açıkça
 * bildiriyor, böylece worker kurulumu hangi bundling durumunda olursa
 * olsun (bundled/unbundled) doğru dosyayı bulabiliyor.
 */
let pdfjsWorkerConfigured = false;
function configurePdfjsWorker(pdfjsLib: any): void {
  if (pdfjsWorkerConfigured) return;
  try {
    // Next.js/Node ESM ortamında CJS `require` doğrudan mevcut olmayabilir;
    // `createRequire` ile güvenli şekilde elde ediyoruz.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createRequire } = require('module');
    const require2 = createRequire(__filename);
    const workerPath = require2.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath;
  } catch (err) {
    // Bu SADECE bir güvenlik katmanı — başarısız olursa `disableWorker`
    // ayarına ve next.config.js'teki dışlamaya güvenilir. Sessizce devam
    // edilir (bu bir kritik hata DEĞİL, sadece ek katman uygulanamadı).
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[pdfToImages] pdfjs-dist worker yolu açıkça ayarlanamadı (next.config.js dışlamasına güveniliyor): ${message}`);
  } finally {
    pdfjsWorkerConfigured = true;
  }
}

const DEFAULT_PDF_RENDER_SCALE = Number(process.env.PDF_RENDER_SCALE || '1.8');

// KÖK NEDEN DÜZELTMESİ (mimari bug fix — "şartnamenin tamamını oku" ilkesi):
// Bu sabit ÖNCEDEN dokümanın kaç sayfasının rasterize edileceğini SINIRLIYORDU
// (varsayılan 15) — yani 78 sayfalık bir dokümanın 63 sayfası HİÇ render
// edilmiyor, LLM'e hiç ulaşmıyordu (Trabzon Gençlik Kampı testinde somut
// olarak doğrulandı: Madde 9/13/14/15 gibi personel/eğitmen şartları
// sayfa 26-44 aralığında olduğu için tamamen kayboluyordu).
//
// Artık bu sabit SADECE "chunk boyutu" (bir LLM çağrısına kaç sayfa
// gönderileceği) anlamına geliyor — llmAnalysis.ts bu değeri kullanarak
// büyük dokümanları BİRDEN FAZLA LLM çağrısına (chunk) böler; hiçbir sayfa
// sessizce atlanmaz. Rasterizasyonun kendisi artık dokümanın TAMAMINI
// (aşağıdaki güvenlik tavanına kadar) render eder.
export const DEFAULT_MAX_VISION_PDF_PAGES = Number(process.env.VISION_MAX_PDF_PAGES || '15');

// Mutlak güvenlik tavanı — patolojik derecede büyük (ör. yanlışlıkla
// yüklenmiş 1000 sayfalık bir arşiv) dosyaların belleği/maliyeti
// patlatmasını önlemek için. Gerçek ihale dokümanlarının neredeyse
// tamamı bunun altındadır; bu bir "içerik sınırlaması" değil, bir
// "kötüye kullanım/kaza koruması"dır — aşılırsa extractText.ts bunu
// açık bir "issue" olarak raporlar, SESSİZCE kesmez.
export const MAX_ABSOLUTE_PDF_PAGES = Number(process.env.MAX_ABSOLUTE_PDF_PAGES || '200');

/**
 * Bir PDF buffer'ının toplam sayfa sayısını, hiçbir sayfayı render
 * ETMEDEN döner. Chunk planlaması ve "X sayfanın tamamı analiz edildi"
 * kapsam raporlaması için kullanılır.
 */
export async function getPdfPageCount(buffer: Buffer): Promise<number> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  configurePdfjsWorker(pdfjsLib);
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true
  });
  const pdf = await loadingTask.promise;
  return pdf.numPages;
}

/**
 * Bir PDF buffer'ının sayfalarını PNG görüntülerine dönüştürür.
 *
 * ÖNEMLİ (mimari düzeltme): `maxPages` parametresi artık VARSAYILAN olarak
 * dokümanın TAMAMINI (MAX_ABSOLUTE_PDF_PAGES güvenlik tavanına kadar) render
 * eder — eskiden olduğu gibi sessizce 15 sayfayla sınırlamaz. `startPage`/
 * `endPage` verilirse SADECE o aralık render edilir (chunk'lama için).
 *
 * Render sırasında tek bir sayfa hata verirse o sayfa ATLANIR, tüm işlem
 * iptal edilmez — kısmi sonuç (bazı sayfalar) tamamen boş sonuçtan
 * yeğdir (kullanıcıya "analiz başarısız" yerine mümkün olanı sunma ilkesi).
 */
export async function renderPdfPagesToImages(
  buffer: Buffer,
  options: number | { maxPages?: number; startPage?: number; endPage?: number } = {}
): Promise<PdfPageImage[]> {
  // Geriye dönük uyumluluk: eski çağrılar `renderPdfPagesToImages(buffer, 15)`
  // gibi ikinci argümanı düz bir sayı (maxPages) olarak veriyordu (bkz.
  // tesseract.ts — o dosyada bilinçli olarak DOKUNULMADI, hâlâ ikincil/
  // yardımcı OCR katmanı için makul bir sayfa sınırı kullanıyor).
  const opts = typeof options === 'number' ? { maxPages: options } : options;

  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  configurePdfjsWorker(pdfjsLib);
  const { createCanvas } = await import(/* webpackIgnore: true */ '@napi-rs/canvas');

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true
  });

  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;

  const absoluteCap = Math.min(totalPages, MAX_ABSOLUTE_PDF_PAGES);
  const requestedCap = opts.maxPages !== undefined ? Math.min(absoluteCap, Math.max(1, opts.maxPages)) : absoluteCap;
  const startPage = Math.max(1, opts.startPage ?? 1);
  const endPage = Math.min(requestedCap, opts.endPage ?? requestedCap);

  // KÖK NEDEN ARAŞTIRMASI (kullanıcı raporu: chunk'lama tetiklenmiyor,
  // ~15 sayfadan fazlası hiç LLM'e ulaşmıyor gibi görünüyor): Önceden
  // tek tek sayfa render hataları SESSİZCE yutuluyordu (`catch { continue }`)
  // — bu yüzden 78 sayfalık bir dokümanda örn. 16. sayfadan itibaren
  // render'lar başarısız olsa bile HİÇBİR İZ kalmıyordu. Artık her
  // render denemesi ve her hata AÇIKÇA loglanıyor.
  console.log(
    `[pdfToImages] Render başlıyor — toplam sayfa=${totalPages}, render edilecek aralık=${startPage}-${endPage} (MAX_ABSOLUTE_PDF_PAGES=${MAX_ABSOLUTE_PDF_PAGES}${opts.maxPages !== undefined ? `, opts.maxPages=${opts.maxPages}` : ''}).`
  );

  const images: PdfPageImage[] = [];
  let failedPages = 0;

  for (let pageNumber = startPage; pageNumber <= endPage; pageNumber += 1) {
    try {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: DEFAULT_PDF_RENDER_SCALE });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext('2d');

      await page.render({
        canvasContext: context as any,
        viewport
      }).promise;

      const imageBuffer = await canvas.encode('png');
      images.push({
        pageNumber,
        base64: Buffer.from(imageBuffer).toString('base64'),
        mediaType: 'image/png'
      });
    } catch (err) {
      // KÖK NEDEN DÜZELTMESİ: Önceden bu hata TAMAMEN SESSİZDİ (`catch {
      // continue }`) — tek bir sayfa değil, art arda ONLARCA sayfa
      // başarısız olsa bile hiçbir iz kalmıyordu. Artık her başarısız
      // sayfa AÇIKÇA loglanıyor (sayfa no + hata mesajı). Tek sayfa
      // hatası yine tüm dokümanı iptal ETMEZ — kalan sayfalarla devam
      // edilir; ama artık kaç sayfanın neden başarısız olduğu görünür.
      failedPages += 1;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[pdfToImages] Sayfa ${pageNumber} render edilemedi, atlanıyor. Hata: ${message}`);
      continue;
    }
  }

  console.log(
    `[pdfToImages] Render tamamlandı — istenen aralık=${startPage}-${endPage} (${endPage - startPage + 1} sayfa), başarılı=${images.length}, başarısız=${failedPages}.`
  );

  return images;
}
