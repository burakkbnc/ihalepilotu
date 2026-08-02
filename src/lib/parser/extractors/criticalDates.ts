// ============================================================
// Extractor — Kritik Tarihler
// İhale tarihi, teklif son teslim tarihi, soru sorma son tarihi,
// geçici teminat son tarihi, iş başlangıç/bitiş, sözleşme imza süresi
// ============================================================
import { parseTurkishDate } from '../normalize';
import type { ExtractionResult } from '../types';

/** Bu extractor'ın HAM (merge edilmemiş) çıktı tipi. */
export interface CriticalDatesData {
  tenderDate: string | null;
  submissionDeadline: string | null;
  questionDeadline: string | null;
  temporaryGuaranteeDeadline: string | null;
  workStartDate: string | null;
  workEndDate: string | null;
  contractSigningPeriodDays: number | null;
}

const DATE_FRAGMENT = '\\b(\\d{1,2}[.\\/\\-]\\d{1,2}[.\\/\\-]\\d{4}|\\d{1,2}\\s+[A-Za-zçÇğĞıİöÖşŞüÜ]+\\s+\\d{4})';

function extractDateNear(text: string, anchors: RegExp[]): string | null {
  for (const anchor of anchors) {
    const combined = new RegExp(anchor.source + `[^\\n]{0,60}?${DATE_FRAGMENT}`, 'gi');
    const matches = [...text.matchAll(combined)];
    for (const match of matches) {
      const parsed = parseTurkishDate(match[1]);
      if (parsed) return parsed;
    }
  }
  return null;
}

export function extractCriticalDates(text: string): ExtractionResult<CriticalDatesData> {
  const data: CriticalDatesData = {
    tenderDate: null,
    submissionDeadline: null,
    questionDeadline: null,
    temporaryGuaranteeDeadline: null,
    workStartDate: null,
    workEndDate: null,
    contractSigningPeriodDays: null
  };

  // İhale Tarihi ve Saati
  data.tenderDate = extractDateNear(text, [/ihale\s+tarihi\s+ve\s+saati/i, /ihale\s+tarihi/i]);

  // Teklif (son) verme/teslim tarihi
  data.submissionDeadline = extractDateNear(text, [
    /tekliflerin\s+(?:sunulacağı|verileceği|teslim\s+edileceği|son\s+teslim)\s+(?:son\s+)?tarih/i,
    /son\s+teklif\s+verme\s+tarihi/i,
    /teklif\s+son\s+(?:teslim\s+)?tarihi/i
  ]);

  // Soru sorma son tarihi (zeyilname / açıklama talebi)
  data.questionDeadline = extractDateNear(text, [
    /son\s+yaz[ıi]l[ıi]\s+açıklama\s+talep[\s\S]{0,5}tarihi/i,
    /açıklama\s+istenmesi[^\n]{0,60}?son\s+tarih/i,
    /soru\s+sorma\s+son\s+tarihi/i
  ]);

  // Geçici teminat son geçerlilik tarihi (guarantee extractor da bunu bulabilir,
  // burada genel tarih taraması için ayrıca denenir)
  data.temporaryGuaranteeDeadline = extractDateNear(text, [
    /geçici\s+teminat[^.\n]{0,60}?geçerlilik[^.\n]{0,30}/i
  ]);

  // İşin başlangıç tarihi
  data.workStartDate = extractDateNear(text, [/işin\s+başlangıç\s+tarihi/i, /işe\s+başlama\s+tarihi/i]);

  // İşin bitiş tarihi
  data.workEndDate = extractDateNear(text, [
    /işin\s+(?:bitiş|sona\s+erme)\s+tarihi/i,
    /işi(?:n)?\s+tamamlanma\s+tarihi/i
  ]);

  // Sözleşme imza süresi (gün)
  const contractMatch = text.match(
    /sözleşme[^.\n]{0,60}?(\d+)\s*(?:\(?\s*[A-Za-zçÇğĞıİöÖşŞüÜ]*\s*\)?\s*)?(?:gün|takvim\s+günü)\s+içinde/i
  );
  if (contractMatch) {
    const days = Number(contractMatch[1]);
    if (Number.isFinite(days)) {
      data.contractSigningPeriodDays = days;
    }
  }

  const foundCount = Object.values(data).filter((v) => v !== null).length;

  return {
    data,
    confidence: foundCount > 0 ? 'found' : 'not_found'
  };
}
