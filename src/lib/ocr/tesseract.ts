// ============================================================
// Tesseract OCR — SPRINT NOTU (Vision LLM merkezli mimari): Bu katman
// artık analiz mimarisinin ANA yolu DEĞİLDİR. Taranmış/görsel PDF'ler
// artık öncelikle sayfa görüntüleri olarak doğrudan Vision destekli LLM'e
// gönderilir (bkz. src/lib/documents/pdfToImages.ts ve extractText.ts).
// Tesseract, YALNIZCA Vision LLM mevcut değilse (provider='mock' veya
// görsel gönderimi desteklemeyen bir provider seçiliyse) ya da sayfa
// render işlemi başarısız olursa devreye giren İKİNCİL/yardımcı bir
// metin-tahmini katmanı olarak korunmuştur. Hiçbir çağıran kod bu
// modülün varlığını ZORUNLU bir ön koşul olarak varsaymamalıdır.
// ============================================================
import { renderPdfPagesToImages, type PdfPageImage } from '@/lib/documents/pdfToImages';

export type OcrResult = {
  text: string;
  provider: 'tesseract';
  pagesProcessed?: number;
};

const DEFAULT_OCR_LANGUAGE = process.env.TESSERACT_LANG || 'tur+eng';
const DEFAULT_MAX_PDF_PAGES = Number(process.env.TESSERACT_MAX_PDF_PAGES || '15');

export function isTesseractOcrAvailable(): boolean {
  return true;
}

export async function runTesseractOcr(buffer: Buffer, fileName: string, mimeType?: string | null): Promise<OcrResult> {
  const lower = fileName.toLowerCase();
  const type = (mimeType || '').toLowerCase();

  if (lower.endsWith('.pdf') || type === 'application/pdf') {
    return runPdfOcr(buffer);
  }

  if (isImageFile(lower, type)) {
    const text = await recognizeImage(buffer);
    return {
      text: normalizeOcrText(text),
      provider: 'tesseract',
      pagesProcessed: 1
    };
  }

  throw new Error('Bu dosya OCR için desteklenmiyor. PDF veya görsel dosyası yükleyin.');
}

async function runPdfOcr(buffer: Buffer): Promise<OcrResult> {
  let pages: PdfPageImage[];
  try {
    pages = await renderPdfPagesToImages(buffer, DEFAULT_MAX_PDF_PAGES);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen OCR hatası';
    throw new Error(
      `Tesseract OCR PDF okuma başarısız: ${message}. Not: Sunucuda @napi-rs/canvas/pdfjs-dist kurulumu tamamlanmalı. Vercel deploy için npm install sonrası yeniden deploy edin.`
    );
  }

  if (pages.length === 0) {
    throw new Error('PDF sayfaları render edilemedi (görüntüye dönüştürme başarısız).');
  }

  const chunks: string[] = [];
  for (const page of pages) {
    const pageText = await recognizeImage(Buffer.from(page.base64, 'base64'));
    if (pageText.trim()) {
      chunks.push(`--- Sayfa ${page.pageNumber} ---\n${pageText}`);
    }
  }

  return {
    text: normalizeOcrText(chunks.join('\n\n')),
    provider: 'tesseract',
    pagesProcessed: pages.length
  };
}

async function recognizeImage(imageBuffer: Buffer): Promise<string> {
  const tesseract = await import('tesseract.js');
  const result = await tesseract.recognize(imageBuffer, DEFAULT_OCR_LANGUAGE);
  return result.data?.text || '';
}

function isImageFile(fileName: string, mimeType: string): boolean {
  return (
    fileName.endsWith('.png') ||
    fileName.endsWith('.jpg') ||
    fileName.endsWith('.jpeg') ||
    fileName.endsWith('.webp') ||
    fileName.endsWith('.tif') ||
    fileName.endsWith('.tiff') ||
    mimeType.startsWith('image/')
  );
}

function normalizeOcrText(text: string): string {
  return text
    .replace(/\u0000/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
