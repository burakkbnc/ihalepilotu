// ============================================================
// SPRINT NOTU — Vision LLM Merkezli Mimariye Geçiş
//
// ESKİ DAVRANIŞ: Taranmış/görsel PDF -> ZORUNLU olarak Tesseract OCR
// çalıştırılır, OCR mevcut değilse veya yetersiz sonuç verirse doküman
// TAMAMEN analiz dışı bırakılırdı ("ocr_required"/"ocr_failed" hatası).
// OCR, analiz kalitesini belirleyen ANA sistemdi.
//
// YENİ DAVRANIŞ:
//   1. Metin tabanlı PDF/DOCX/TXT -> metni çıkar, doğrudan LLM'e gönder
//      (DEĞİŞMEDİ, zaten bu şekildeydi).
//   2. Görsel/taranmış PDF veya doğrudan yüklenen görsel dosya -> sayfa
//      görüntüleri üretilir (bkz. pdfToImages.ts) ve `extractedImages`
//      olarak döner — bunlar Vision destekli LLM'e (Anthropic) DOĞRUDAN
//      gönderilir (bkz. providers/anthropic.ts). Bu artık ANA yoldur.
//   3. Tesseract OCR artık YARDIMCI/İKİNCİL bir katmandır: sadece sayfa
//      görüntüleme (rasterizasyon) başarısız olursa devreye girer, ki
//      kullanıcı en azından bir miktar metinle analiz alabilsin. OCR'ın
//      mevcut olmaması ARTIK dokümanı analiz dışı bırakmaz.
//
// Kod içindeki "OCR zorunlu" varsayımları (isTesseractOcrAvailable()
// false ise dokümanı tamamen reddetme) kaldırıldı.
// ============================================================
import { adminStorage } from '@/lib/firebase/admin';
import { isTesseractOcrAvailable, runTesseractOcr } from '@/lib/ocr/tesseract';
import { renderPdfPagesToImages, getPdfPageCount, type PdfPageImage } from '@/lib/documents/pdfToImages';
import { TextDecoder } from 'util';
import type { TenderDocument } from '@/types/tender';

export type ExtractedDocumentText = {
  documentId: string;
  documentType: TenderDocument['documentType'];
  fileName: string;
  text: string;
  characterCount: number;
};

/**
 * Vision LLM'e doğrudan gönderilecek sayfa görüntüleri. Bir doküman AYNI
 * ANDA hem `extracted` (varsa kısmi/düşük güvenli metin — OCR'dan veya
 * pdf-parse'ın az miktarda metninden) hem de `extractedImages` içinde
 * yer alabilir; LLM her ikisini de görebilir. Ana sinyal her zaman
 * görüntülerdir.
 */
export type ExtractedDocumentImages = {
  documentId: string;
  documentType: TenderDocument['documentType'];
  fileName: string;
  pages: PdfPageImage[];
  /**
   * SPRINT NOTU (mimari bug fix — sayfa sınırı kaldırıldı): Dokümanın
   * GERÇEK toplam sayfa sayısı (PDF ise). `pages.length` ile aynı olmalıdır
   * (artık sessizce kesme YOK); farklıysa (ör. MAX_ABSOLUTE_PDF_PAGES
   * güvenlik tavanı aşıldıysa veya bazı sayfalar render hatası verdiyse)
   * bu, "X sayfanın Y'si analiz edildi" kapsam raporlaması için kullanılır.
   * PDF olmayan (tekil görsel) dokümanlarda totalPdfPages = 1.
   */
  totalPdfPages: number;
};

export type ExtractionIssue = {
  documentId: string;
  fileName: string;
  code:
    | 'no_storage_path'
    | 'empty_text'
    | 'render_failed'
    | 'ocr_failed'
    | 'unsupported_type'
    | 'download_failed'
    | 'parse_failed'
    | 'storage_disabled';
  message: string;
};

const MAX_EXTRACTED_CHARS_PER_DOCUMENT = 120000;
const ANTHROPIC_SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export async function extractTextFromTenderDocuments(documents: TenderDocument[]): Promise<{
  extracted: ExtractedDocumentText[];
  extractedImages: ExtractedDocumentImages[];
  issues: ExtractionIssue[];
}> {
  const extracted: ExtractedDocumentText[] = [];
  const extractedImages: ExtractedDocumentImages[] = [];
  const issues: ExtractionIssue[] = [];

  if (!adminStorage) {
    return {
      extracted,
      extractedImages,
      issues: documents.map((doc) => ({
        documentId: doc.id,
        fileName: doc.fileName,
        code: 'storage_disabled',
        message: 'Firebase Admin Storage aktif değil. NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET değerini kontrol edin.'
      }))
    };
  }

  for (const doc of documents) {
    if (!doc.storagePath) {
      issues.push({
        documentId: doc.id,
        fileName: doc.fileName,
        code: 'no_storage_path',
        message: 'Dokümanın Storage yolu bulunamadı.'
      });
      continue;
    }

    let buffer: Buffer;
    try {
      const [downloaded] = await adminStorage.bucket().file(doc.storagePath).download();
      buffer = downloaded;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Bilinmeyen indirme hatası';
      console.error(`[extractText] "${doc.fileName}" Storage'dan indirilemedi. Hata: ${message}`);
      issues.push({
        documentId: doc.id,
        fileName: doc.fileName,
        code: 'download_failed',
        message: 'Doküman Firebase Storage üzerinden indirilemedi.'
      });
      continue;
    }

    console.log(
      `[extractText] "${doc.fileName}" işleniyor — tür=${doc.documentType}, mimeType=${doc.mimeType || 'yok'}, boyut=${buffer.length} bayt.`
    );

    try {
      const fileName = doc.fileName.toLowerCase();
      const mimeType = (doc.mimeType || '').toLowerCase();
      const isPdf = fileName.endsWith('.pdf') || mimeType === 'application/pdf';
      const isPlainImage = isImageFile(fileName, mimeType);

      // --- YOL 1: Doğrudan yüklenen görsel dosya (png/jpg/webp/gif) ---
      // Vision LLM'in doğrudan desteklediği formatlarda hiç metin
      // çıkarmaya/OCR'a gerek yok; görüntü doğrudan LLM'e gider.
      if (isPlainImage) {
        if (ANTHROPIC_SUPPORTED_IMAGE_TYPES.has(mimeType) || /\.(png|jpe?g|webp|gif)$/.test(fileName)) {
          extractedImages.push({
            documentId: doc.id,
            documentType: doc.documentType,
            fileName: doc.fileName,
            pages: [{ pageNumber: 1, base64: buffer.toString('base64'), mediaType: inferImageMediaType(fileName, mimeType) }],
            totalPdfPages: 1
          });
          continue;
        }

        // TIFF gibi Vision API'nin desteklemediği bir görsel formatıysa,
        // tek çare olarak (opsiyonel) OCR denenir — bu, ana yol değil,
        // gerçek bir format kısıtı nedeniyle son çare fallback'idir.
        const ocrText = await tryOptionalOcr(buffer, doc);
        if (ocrText) {
          extracted.push({
            documentId: doc.id,
            documentType: doc.documentType,
            fileName: doc.fileName,
            text: ocrText.slice(0, MAX_EXTRACTED_CHARS_PER_DOCUMENT),
            characterCount: ocrText.length
          });
        } else {
          issues.push({
            documentId: doc.id,
            fileName: doc.fileName,
            code: 'unsupported_type',
            message: 'Bu görsel formatı (ör. TIFF) Vision LLM tarafından doğrudan desteklenmiyor ve OCR ile de metin üretilemedi.'
          });
        }
        continue;
      }

      // --- YOL 2: PDF (metin tabanlı VEYA taranmış/görsel) ---
      if (isPdf) {
        // KÖK NEDEN DÜZELTMESİ (kritik bug): Önceden `parseBufferToText`
        // (yani `pdf-parse` kütüphanesi) burada KENDİ try/catch'İ OLMADAN
        // çağrılıyordu. Bazı taranmış/tarayıcı-kaynaklı PDF'lerde (ör.
        // fotokopi makinesi çıktısı, standart-dışı iç yapı) `pdf-parse`
        // İSTİSNA FIRLATABİLİYOR (boş metin döndürmek yerine). Bu istisna
        // en dıştaki catch'e düşüyor ve bu satırdan sonraki TÜM vision/
        // görüntü mantığı (render dahil) HİÇ ÇALIŞTIRILMADAN atlanıyordu
        // — yani doküman sessizce tamamen kayboluyordu, `[pdfToImages]`
        // logu bile hiç basılmıyordu (Trabzon testinde tam olarak
        // gözlemlenen davranış). Artık bu çağrı KENDİ try/catch'inde;
        // pdf-parse başarısız olursa metin boş sayılır ve akış NORMAL
        // ŞEKİLDE taranmış/görsel (vision) yoluna devam eder.
        let parsedTextRaw = '';
        try {
          parsedTextRaw = await parseBufferToText(buffer, doc);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Bilinmeyen pdf-parse hatası';
          console.error(
            `[extractText] pdf-parse "${doc.fileName}" için istisna fırlattı (muhtemelen tamamen taranmış/metin katmanı olmayan bir PDF) — metin boş kabul edilip taranmış/görsel (vision) yoluna devam ediliyor. Hata: ${message}`
          );
        }
        const parsedText = normalizeExtractedText(parsedTextRaw);
        const textScore = meaningfulTextScore(parsedText);
        const looksReliable = !looksScannedOrUnreliable(parsedText);

        // KÖK NEDEN ARAŞTIRMASI: Bu karar ("metin mi güvenilir, yoksa
        // taranmış/vision mı?") daha önce HİÇ görünür değildi — sadece
        // sonucuna göre sessizce dallanılıyordu. Artık tam skor kırılımı
        // loglanıyor, böylece "neden vision'a hiç girmedi?" sorusuna
        // kesin cevap var.
        console.log(
          `[extractText] "${doc.fileName}" metin güvenilirlik skoru — ` +
            `parsedText.length=${parsedText.length}, usableCharacters=${textScore.usableCharacters}, ` +
            `uniqueWordCount=${textScore.uniqueWordCount}, digitRatio=${textScore.digitRatio.toFixed(2)}, ` +
            `repetitionRatio=${textScore.repetitionRatio.toFixed(2)} -> ` +
            `${looksReliable ? 'METİN YOLU (güvenilir kabul edildi)' : 'VISION YOLU (taranmış/güvenilmez kabul edildi)'}`
        );
        if (looksReliable && parsedText.length > 0) {
          console.log(`[extractText] "${doc.fileName}" metninin ilk 300 karakteri: ${JSON.stringify(parsedText.slice(0, 300))}`);
        }

        if (looksReliable) {
          // Metin tabanlı PDF -> metni doğrudan kullan (ANA YOL, değişmedi).
          extracted.push({
            documentId: doc.id,
            documentType: doc.documentType,
            fileName: doc.fileName,
            text: parsedText.slice(0, MAX_EXTRACTED_CHARS_PER_DOCUMENT),
            characterCount: parsedText.length
          });
          continue;
        }

        // Taranmış/görsel PDF -> sayfa görüntülerini üret, Vision LLM'e
        // gönder (YENİ ANA YOL — OCR DEĞİL).
        //
        // KÖK NEDEN DÜZELTMESİ (mimari bug fix): Önceden burada
        // `renderPdfPagesToImages(buffer, DEFAULT_MAX_VISION_PDF_PAGES)`
        // çağrılıyordu — yani doküman kaç sayfa olursa olsun SESSİZCE
        // sadece ilk 15 sayfa render ediliyordu (Trabzon Gençlik Kampı
        // testinde 78 sayfalık dokümanın 63 sayfası hiç görülmüyordu).
        // Artık TÜM sayfalar render edilir (MAX_ABSOLUTE_PDF_PAGES güvenlik
        // tavanına kadar); büyük dokümanları birden fazla LLM çağrısına
        // (chunk) bölme işi artık llmAnalysis.ts'e ait — rasterizasyon
        // katmanı hiçbir içerik kararı vermez, sadece "elimde ne var"ı verir.
        let pages: PdfPageImage[] = [];
        let renderError: string | null = null;
        let totalPdfPages = 0;
        try {
          console.log(`[extractText] "${doc.fileName}" için getPdfPageCount() çağrılıyor...`);
          totalPdfPages = await getPdfPageCount(buffer);
          console.log(`[extractText] "${doc.fileName}" getPdfPageCount() sonucu: ${totalPdfPages} sayfa. Şimdi renderPdfPagesToImages() çağrılıyor...`);
          pages = await renderPdfPagesToImages(buffer);
        } catch (err) {
          renderError = err instanceof Error ? err.message : 'Bilinmeyen render hatası';
          // KÖK NEDEN ARAŞTIRMASI: Bu hata ÖNCEDEN sadece `renderError`
          // değişkenine yazılıp `issues` dizisine (kullanıcıya doküman
          // durumu olarak) gidiyordu — TERMİNALE HİÇ YAZDIRILMIYORDU. Bir
          // native modül (ör. @napi-rs/canvas) yükleme hatası gibi kritik
          // bir sorun sessizce kayboluyordu. Artık tam hata + stack trace
          // konsola basılıyor.
          console.error(
            `[extractText] "${doc.fileName}" için PDF render BAŞARISIZ OLDU (getPdfPageCount veya renderPdfPagesToImages istisna fırlattı). Hata: ${renderError}`
          );
          if (err instanceof Error && err.stack) {
            console.error(`[extractText] Stack trace: ${err.stack}`);
          }
        }
        console.log(`[extractText] "${doc.fileName}" render sonucu: ${pages.length} sayfa başarıyla render edildi (toplam ${totalPdfPages} sayfadan).`);

        if (pages.length > 0) {
          extractedImages.push({
            documentId: doc.id,
            documentType: doc.documentType,
            fileName: doc.fileName,
            pages,
            totalPdfPages: totalPdfPages || pages.length
          });
          // Varsa az miktardaki metni de (pdf-parse'ın filigran/sayfa
          // kodu dışında yakaladığı herhangi bir parça) ek bağlam olarak
          // sakla — Vision görüntüleri ana sinyal, bu SADECE destekleyici.
          if (parsedText.length >= 30) {
            extracted.push({
              documentId: doc.id,
              documentType: doc.documentType,
              fileName: doc.fileName,
              text: parsedText.slice(0, MAX_EXTRACTED_CHARS_PER_DOCUMENT),
              characterCount: parsedText.length
            });
          }
          continue;
        }

        // Sayfa render işlemi (pdfjs/canvas) başarısız oldu — bu ARTIK
        // dokümanı otomatik reddetmez. Son çare olarak (opsiyonel,
        // mevcutsa) Tesseract OCR denenir; o da başarısız olursa doküman
        // 'render_failed' ile işaretlenir (sessizce yutulmaz, kullanıcıya
        // açıkça gösterilir).
        const ocrText = await tryOptionalOcr(buffer, doc);
        if (ocrText) {
          extracted.push({
            documentId: doc.id,
            documentType: doc.documentType,
            fileName: doc.fileName,
            text: ocrText.slice(0, MAX_EXTRACTED_CHARS_PER_DOCUMENT),
            characterCount: ocrText.length
          });
          continue;
        }

        issues.push({
          documentId: doc.id,
          fileName: doc.fileName,
          code: 'render_failed',
          message: renderError
            ? `PDF sayfaları görüntüye dönüştürülemedi: ${renderError}`
            : 'PDF sayfaları görüntüye dönüştürülemedi ve yedek OCR de metin üretemedi.'
        });
        continue;
      }

      // --- YOL 3: Diğer metin tabanlı formatlar (txt/docx/doc) ---
      const parsedText = normalizeExtractedText(await parseBufferToText(buffer, doc));
      if (!parsedText || parsedText.length < 30) {
        issues.push({
          documentId: doc.id,
          fileName: doc.fileName,
          code: 'empty_text',
          message: 'Bu dosyadan anlamlı metin çıkarılamadı.'
        });
        continue;
      }

      extracted.push({
        documentId: doc.id,
        documentType: doc.documentType,
        fileName: doc.fileName,
        text: parsedText.slice(0, MAX_EXTRACTED_CHARS_PER_DOCUMENT),
        characterCount: parsedText.length
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Metin çıkarma sırasında bilinmeyen hata oluştu.';
      console.error(`[extractText] "${doc.fileName}" için beklenmeyen bir istisna oluştu (doküman tamamen atlanıyor). Hata: ${message}`);
      issues.push({
        documentId: doc.id,
        fileName: doc.fileName,
        code: message === 'unsupported_type' ? 'unsupported_type' : 'parse_failed',
        message:
          message === 'unsupported_type'
            ? 'Bu dosya türü otomatik olarak işlenemiyor. PDF, DOCX, TXT veya görsel (PNG/JPG/WEBP) yükleyin.'
            : message
      });
    }
  }

  return { extracted, extractedImages, issues };
}

/**
 * Son çare/yardımcı OCR denemesi — ARTIK zorunlu bir ön koşul değildir.
 * Tesseract mevcut değilse veya sonuç yetersizse sessizce null döner;
 * çağıran kod bunu bir "issue" olarak işler, bu fonksiyon kendisi hata
 * fırlatmaz (analiz akışını bloklamaz).
 */
async function tryOptionalOcr(buffer: Buffer, doc: TenderDocument): Promise<string | null> {
  if (!isTesseractOcrAvailable()) return null;
  try {
    console.log(`[extractText] "${doc.fileName}" için son çare OCR (Tesseract) deneniyor...`);
    const ocr = await runTesseractOcr(buffer, doc.fileName, doc.mimeType);
    const text = normalizeExtractedText(ocr.text);
    const score = meaningfulTextScore(text);
    console.log(
      `[extractText] "${doc.fileName}" OCR sonucu — usableCharacters=${score.usableCharacters}, uniqueWordCount=${score.uniqueWordCount} -> ${
        score.usableCharacters >= 400 && score.uniqueWordCount >= 35 ? 'KABUL EDİLDİ' : 'YETERSİZ, reddedildi'
      }`
    );
    if (score.usableCharacters >= 400 && score.uniqueWordCount >= 35) {
      return text;
    }
    return null;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen OCR hatası';
    console.error(`[extractText] "${doc.fileName}" için son çare OCR de BAŞARISIZ oldu. Hata: ${message}`);
    return null;
  }
}

async function parseBufferToText(buffer: Buffer, doc: TenderDocument): Promise<string> {
  const fileName = doc.fileName.toLowerCase();
  const mimeType = (doc.mimeType || '').toLowerCase();

  if (fileName.endsWith('.txt') || mimeType.startsWith('text/')) {
    return buffer.toString('utf8');
  }

  if (fileName.endsWith('.docx') || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  }

  if (fileName.endsWith('.doc') || mimeType === 'application/msword') {
    return parseLegacyWordOrHtml(buffer);
  }

  if (fileName.endsWith('.pdf') || mimeType === 'application/pdf') {
    const pdfParseModule = await import('pdf-parse');
    const pdfParse = pdfParseModule.default || pdfParseModule;
    const result = await pdfParse(buffer);
    return result.text || '';
  }

  if (isImageFile(fileName, mimeType)) {
    return '';
  }

  throw new Error('unsupported_type');
}

function isImageFile(fileName: string, mimeType: string): boolean {
  return (
    fileName.endsWith('.png') ||
    fileName.endsWith('.jpg') ||
    fileName.endsWith('.jpeg') ||
    fileName.endsWith('.webp') ||
    fileName.endsWith('.gif') ||
    fileName.endsWith('.tif') ||
    fileName.endsWith('.tiff') ||
    mimeType.startsWith('image/')
  );
}

function inferImageMediaType(fileName: string, mimeType: string): 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' {
  if (ANTHROPIC_SUPPORTED_IMAGE_TYPES.has(mimeType)) return mimeType as any;
  if (/\.(jpe?g)$/.test(fileName)) return 'image/jpeg';
  if (/\.webp$/.test(fileName)) return 'image/webp';
  if (/\.gif$/.test(fileName)) return 'image/gif';
  return 'image/png';
}

/**
 * Eski `shouldForceOcr` fonksiyonunun yeniden adlandırılmış hali —
 * artık "OCR'a zorla" değil "bu metne güvenme, görüntü yoluna geç"
 * anlamına gelir. Mantık DEĞİŞMEDİ (taranmış/filigranlı PDF tespiti).
 */
function looksScannedOrUnreliable(text: string): boolean {
  const score = meaningfulTextScore(text);
  // Taranmış/filigranlı PDF'lerde pdf-parse genelde sadece tekrar eden sayı,
  // sayfa numarası veya filigran döndürür. Bu durumda "metin var" sanıp
  // görüntü yoluna geçmemek analizin kök nedeniydi.
  if (score.usableCharacters < 400) return true;
  if (score.uniqueWordCount < 35) return true;
  if (score.digitRatio > 0.55 && score.uniqueWordCount < 80) return true;
  if (score.repetitionRatio > 0.45) return true;
  return false;
}

function meaningfulTextScore(text: string): {
  usableCharacters: number;
  uniqueWordCount: number;
  digitRatio: number;
  repetitionRatio: number;
} {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const usable = cleaned.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü0-9]/g, '');
  const digits = usable.replace(/\D/g, '').length;
  const words = cleaned.toLocaleLowerCase('tr-TR').match(/[a-zçğıöşü]{3,}/gi) ?? [];
  const unique = new Set(words);
  const counts = new Map<string, number>();
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
  const repeated = [...counts.values()].filter((count) => count > 3).reduce((sum, count) => sum + count, 0);
  return {
    usableCharacters: usable.length,
    uniqueWordCount: unique.size,
    digitRatio: usable.length ? digits / usable.length : 1,
    repetitionRatio: words.length ? repeated / words.length : 1
  };
}

function parseLegacyWordOrHtml(buffer: Buffer): string {
  const utf8 = buffer.toString('utf8');
  const sample = utf8.slice(0, 2000);
  const declaresLatin5 = /charset\s*=\s*["']?(?:iso-8859-9|windows-1254)/i.test(sample);
  const decoded = declaresLatin5 ? new TextDecoder('iso-8859-9').decode(buffer) : utf8;
  const html = fixMojibake(decoded);

  if (/<html|<body|<p\b|<div\b|<table\b/i.test(html)) {
    return htmlToPlainText(html);
  }

  return html;
}

function htmlToPlainText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<\/(p|div|tr|h\d)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(td|th)>/gi, '\t')
      .replace(/<[^>]+>/g, ' ')
  );
}

function decodeHtmlEntities(text: string): string {
  const named: Record<string, string> = {
    nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
    ouml: 'ö', Ouml: 'Ö', uuml: 'ü', Uuml: 'Ü', ccedil: 'ç', Ccedil: 'Ç',
    gbreve: 'ğ', Gbreve: 'Ğ', scedil: 'ş', Scedil: 'Ş', Idot: 'İ', inodot: 'ı'
  };
  return text
    .replace(/&(#\d+|#x[0-9a-f]+|[a-zA-Z]+);/g, (m, entity) => {
      if (entity[0] === '#') {
        const code = entity[1]?.toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return named[entity] ?? m;
    });
}

function fixMojibake(text: string): string {
  const replacements: Record<string, string> = {
    'Ý': 'İ', 'ý': 'ı', 'Þ': 'Ş', 'þ': 'ş', 'Ð': 'Ğ', 'ð': 'ğ'
  };
  return text.replace(/[ÝýÞþÐð]/g, (ch) => replacements[ch] ?? ch);
}

function normalizeExtractedText(text: string): string {
  return fixMojibake(text)
    .replace(/\u0000/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
