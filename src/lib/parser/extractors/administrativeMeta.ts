// ============================================================
// Extractor — İdari Şartname Meta Bilgileri
// İKN, teklif geçerlilik süresi, kısmi teklif, alt yüklenici, konsorsiyum,
// elektronik eksiltme, sözleşme türü
// ============================================================
import { containsPhrase } from '../normalize';
import type { ExtractionResult } from '../types';

/** Bu extractor'ın HAM (merge edilmemiş) çıktı tipi. */
export interface AdminMetaData {
  /** İhale Kayıt Numarası */
  ikn: string | null;
  bidValidityDays: number | null;
  partialBidAllowed: boolean | null;
  alternativeBidAllowed: boolean | null;
  subcontractorAllowed: boolean | null;
  consortiumAllowed: boolean | null;
  domesticBidderRequirement: boolean | null;
  electronicAuction: boolean | null;
  contractType: string | null;
  /** Teklif para birimi (ör. "TRY", "Türk Lirası") */
  currency: string | null;
  /** KDV bilgisi — kısa not (ör. "Teklif fiyatlarına KDV dahil edilmeyecektir") */
  vatInfo: string | null;
}

/**
 * Bir anahtar kelimenin yakınında "evet/hayır" anlamına gelen ifadeleri arar.
 * - "verilebilir" / "kabul edilir" / "edilecektir" -> true
 * - "verilemez" / "kabul edilmez" / "edilmeyecektir" / "yoktur" -> false
 * Hiçbiri bulunamazsa null döner.
 */
function findBooleanNear(text: string, anchor: RegExp, windowSize = 150): boolean | null {
  // Global eşleşme: madde başlıkları genelde birden fazla terimi virgülle
  // sıralar (ör. "Kısmi Teklif, Alternatif Teklif, Alt Yüklenici,
  // Konsorsiyum" gibi bir bölüm başlığı) — bu başlıktaki ilk eşleşmede
  // hiçbir evet/hayır ifadesi YOKTUR. Gerçek cevap genelde daha sonraki bir
  // cümlede geçer. Bu yüzden ilk eşleşmede durmak yerine, anlamlı bir
  // sonuç bulana kadar TÜM eşleşmeler sırayla taranır.
  const globalAnchor = new RegExp(anchor.source, anchor.flags.includes('g') ? anchor.flags : anchor.flags + 'g');
  const matches = [...text.matchAll(globalAnchor)];

  for (const match of matches) {
    if (match.index === undefined) continue;

    let window = text.slice(match.index, match.index + windowSize);
    // Pencereyi bir sonraki cümle/satır sınırında kes — aksi halde
    // ardışık cümlelerdeki ZIT anlamlı kelimeler ("Alt yüklenici
    // kullanılabilir." cümlesinden hemen sonra gelen "Alternatif teklif
    // verilemez." gibi) VEYA bir başlıktan sonra gelen ilk gerçek cümle
    // ("Alternatif Teklif, Alt Yüklenici, Konsorsiyum" başlığından sonra
    // \n\n ile başlayan "Kısmi teklif verilebilir." cümlesi) bu alanın
    // penceresine sızıp yanlış sonuç verir. Hem nokta+boşluk+büyük harf
    // hem de satır başı+büyük harf sınır kabul edilir.
    const sentenceEndMatch = window.match(/[.!?]\s+[A-ZÇĞİÖŞÜ]|\n+[A-ZÇĞİÖŞÜ]/);
    if (sentenceEndMatch && sentenceEndMatch.index !== undefined) {
      window = window.slice(0, sentenceEndMatch.index + 1);
    }
    const lowerWindow = window.toLocaleLowerCase('tr-TR');

    const negative =
      /(?:verilemez|veremez|kabul\s+edilmez|edilmeyecek|uygulanmayacak|yoktur|yapılamaz|katılamaz|sunamaz|teklif\s+veremez|öngörülmemiştir|izin\s+verilmemektedir|kullan[ıi]lamaz)/.test(
        lowerWindow
      );
    if (negative) return false;

    const positive =
      /(?:verilebilir|kabul\s+edilir|edilecektir|uygulanacaktır|vardır|yapılabilir|öngörülmüştür|izin\s+verilmektedir|mümkündür|kullan[ıi]labilir)/.test(
        lowerWindow
      );
    if (positive) return true;

    // Bu eşleşmede anlamlı bir sonuç yoksa (başlık/liste olabilir), bir
    // sonraki eşleşmeyi dene.
  }

  return null;
}

export function extractAdministrativeMeta(text: string): ExtractionResult<AdminMetaData> {
  const data: AdminMetaData = {
    ikn: null,
    bidValidityDays: null,
    partialBidAllowed: null,
    alternativeBidAllowed: null,
    subcontractorAllowed: null,
    consortiumAllowed: null,
    domesticBidderRequirement: null,
    electronicAuction: null,
    contractType: null,
    currency: null,
    vatInfo: null
  };

  let foundAny = false;

  // İhale Kayıt Numarası (İKN): "İhale Kayıt Numarası: 2026/123456" formatı.
  // EKAP'ta İKN her zaman YYYY/XXXXXX (4 haneli yıl + 6 haneli sıra no) şeklindedir.
  const iknMatch = text.match(/(?:Ihale\s+Kay[ıi]t\s+Numaras[ıi]|IKN)[^\n:]{0,10}[:\-]?\s*(\d{4}\s*\/\s*\d{4,6})/i);
  if (iknMatch) {
    data.ikn = iknMatch[1].replace(/\s+/g, '');
    foundAny = true;
  }

  // Teklif Geçerlilik Süresi: "Tekliflerin geçerlilik süresi ... 120 gün"
  const validityMatch = text.match(
    /teklif(?:lerin)?\s+geçerlilik\s+süresi[^.\n]{0,60}?(\d+)\s*(?:\(?\s*takvim\s+)?gün/i
  );
  if (validityMatch) {
    data.bidValidityDays = Number(validityMatch[1]);
    foundAny = true;
  }

  // Kısmi Teklif
  if (containsPhrase(text, 'kısmi teklif')) {
    const result = findBooleanNear(text, /kısmi\s+teklif/i);
    if (result !== null) {
      data.partialBidAllowed = result;
      foundAny = true;
    }
  }

  // Alternatif Teklif
  if (containsPhrase(text, 'alternatif teklif')) {
    const result = findBooleanNear(text, /alternatif\s+teklif/i);
    if (result !== null) {
      data.alternativeBidAllowed = result;
      foundAny = true;
    }
  }

  // Alt Yüklenici
  if (containsPhrase(text, 'alt yüklenici')) {
    const result = findBooleanNear(text, /alt\s+yüklenici/i);
    if (result !== null) {
      data.subcontractorAllowed = result;
      foundAny = true;
    }
  }

  // Konsorsiyum
  if (containsPhrase(text, 'konsorsiyum')) {
    const result = findBooleanNear(text, /konsorsiyum/i);
    if (result !== null) {
      data.consortiumAllowed = result;
      foundAny = true;
    }
  }

  // Yerli İstekli Şartı
  if (containsPhrase(text, 'yerli istekli')) {
    const result = findBooleanNear(text, /yerli\s+istekli/i, 200);
    data.domesticBidderRequirement = result;
    foundAny = true;
  }

  // Elektronik Eksiltme
  if (containsPhrase(text, 'elektronik eksiltme')) {
    const result = findBooleanNear(text, /elektronik\s+eksiltme/i);
    data.electronicAuction = result ?? false; // "yapılmayacaktır" gibi varsayılan negatif
    foundAny = true;
  }

  // Sözleşme Türü
  if (containsPhrase(text, 'birim fiyat')) {
    data.contractType = 'Birim Fiyat';
    foundAny = true;
  } else if (containsPhrase(text, 'götürü bedel')) {
    data.contractType = 'Götürü Bedel';
    foundAny = true;
  } else if (containsPhrase(text, 'karma') && containsPhrase(text, 'sözleşme')) {
    data.contractType = 'Karma';
    foundAny = true;
  }

  // Teklif Para Birimi
  if (containsPhrase(text, 'türk lirası') || /\bTRY\b/.test(text) || /\bTL\b/.test(text)) {
    data.currency = 'TRY (Türk Lirası)';
    foundAny = true;
  }

  // KDV Bilgisi — kısa not, madde metni değil
  const vatMatch = text.match(
    /teklif\s+fiyat(?:lar)?[ıi][^.\n]{0,40}?KDV[^.\n]{0,60}\./i
  ) ?? text.match(/KDV[^.\n]{0,80}(?:dahil|hariç)[^.\n]{0,40}\./i);
  if (vatMatch) {
    data.vatInfo = vatMatch[0].replace(/\s+/g, ' ').trim();
    foundAny = true;
  }

  return {
    data,
    confidence: foundAny ? 'found' : 'not_found'
  };
}
