// ============================================================
// Parser — Metin Normalizasyonu ve Türkçe Format Yardımcıları
//
// Şartname metinleri genellikle PDF'den çıkarılır ve şu sorunları içerir:
// - Fazla boşluk/satır sonu
// - Türkçe büyük/küçük harf tutarsızlıkları (İ/I, ı/i)
// - Türkçe sayı formatları (1.500.000,50 vb.)
// - Türkçe tarih formatları (14.10.2026, 14/10/2026, 14 Ekim 2026)
// ============================================================

/**
 * Metni analiz için normalize eder:
 * - Birden fazla boşluk/sekme tek boşluğa indirilir
 * - Birden fazla satır sonu ikiye indirilir (paragraf ayrımı korunur)
 * - Başta/sonda boşluk temizlenir
 * - "İ" (U+0130, noktalı büyük İ) karakteri "I" (ASCII büyük I) ile
 *   değiştirilir. Bu, JavaScript regex /i bayrağının "İşin" gibi
 *   kelimeleri "işin" kalıbıyla eşleştirebilmesi için gereklidir —
 *   /i bayrağı "I" <-> "i" eşlemesini yapar ancak "İ" (U+0130) ile
 *   "i" arasında eşleme YAPMAZ. Bu değişiklik metnin görsel olarak
 *   "İstanbul" -> "Istanbul" gibi görünmesine yol açar, ancak
 *   eşleştirme doğruluğu için kabul edilebilir bir ödündür.
 */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/İ/g, 'I')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/**
 * Türkçe karakterleri koruyarak büyük harfe çevirir
 * (regex eşleştirmede case-insensitive arama için kullanılabilir,
 * ancak burada öncelikle anahtar kelime karşılaştırması için yardımcıdır).
 */
export function turkishUpper(text: string): string {
  return text
    .replace(/i/g, 'İ')
    .replace(/ı/g, 'I')
    .toUpperCase();
}

/**
 * Türkçe formatlı bir sayıyı (1.500.000,50 / 1.500.000 / 1500000 / ₺1.500.000)
 * JavaScript number'a çevirir. Çözümlenemezse null döner.
 *
 * Desteklenen formatlar:
 *   "1500000"        -> 1500000
 *   "1.500.000"      -> 1500000
 *   "1.500.000,50"   -> 1500000.50
 *   "₺1.500.000"     -> 1500000
 *   "1.500.000,50 TL" -> 1500000.50
 */
export function parseTurkishCurrency(value: string): number | null {
  if (!value) return null;

  // Para birimi sembolleri ve birimleri temizle
  let cleaned = value
    .replace(/[₺$€]/g, '')
    .replace(/TL|TRY|Türk Lirası/gi, '')
    .trim();

  if (!cleaned) return null;

  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');

  if (hasComma && hasDot) {
    // "1.500.000,50" -> noktalar binlik ayraç, virgül ondalık
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (hasComma && !hasDot) {
    // "1500000,50" -> virgül ondalık ayraç
    cleaned = cleaned.replace(',', '.');
  } else if (hasDot && !hasComma) {
    // Belirsiz: "1.500.000" (binlik) veya "1500.50" (ondalık)
    // Türkçe şartnamelerde nokta genelde binlik ayraçtır.
    // Eğer son nokta grubunda tam 3 hane varsa ve birden fazla nokta varsa
    // binlik ayraç kabul edilir.
    const dotGroups = cleaned.split('.');
    const lastGroup = dotGroups[dotGroups.length - 1];
    if (dotGroups.length > 2 || lastGroup.length === 3) {
      cleaned = cleaned.replace(/\./g, '');
    }
    // Aksi halde (örn. "1500.5") nokta ondalık ayraç olarak bırakılır.
  }

  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

/**
 * Türkçe tarih formatlarını ISO 8601 (YYYY-MM-DD) string'e çevirir.
 * Çözümlenemezse null döner.
 *
 * Desteklenen formatlar:
 *   "14.10.2026", "14/10/2026", "14-10-2026" -> "2026-10-14"
 *   "14 Ekim 2026"                            -> "2026-10-14"
 */
export function parseTurkishDate(value: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();

  // DD.MM.YYYY / DD/MM/YYYY / DD-MM-YYYY
  const numericMatch = trimmed.match(/^(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{4})$/);
  if (numericMatch) {
    const [, day, month, year] = numericMatch;
    return toIsoDate(Number(year), Number(month), Number(day));
  }

  // "14 Ekim 2026"
  const monthNames: Record<string, number> = {
    ocak: 1,
    şubat: 2,
    subat: 2,
    mart: 3,
    nisan: 4,
    mayıs: 5,
    mayis: 5,
    haziran: 6,
    temmuz: 7,
    ağustos: 8,
    agustos: 8,
    eylül: 9,
    eylul: 9,
    ekim: 10,
    kasım: 11,
    kasim: 11,
    aralık: 12,
    aralik: 12
  };

  const textMatch = trimmed.match(/^(\d{1,2})\s+([A-Za-zçÇğĞıİöÖşŞüÜ]+)\s+(\d{4})$/);
  if (textMatch) {
    const [, day, monthName, year] = textMatch;
    const month = monthNames[monthName.toLocaleLowerCase('tr-TR')];
    if (month) {
      return toIsoDate(Number(year), month, Number(day));
    }
  }

  return null;
}

function toIsoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Yüzde değeri içeren bir string'i (örn. "%3", "% 3", "3%", "3") number'a çevirir.
 */
export function parsePercent(value: string): number | null {
  const match = value.match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  const num = Number(match[1].replace(',', '.'));
  return Number.isFinite(num) ? num : null;
}

/**
 * Bir metinde belirli bir ifadenin (case-insensitive, Türkçe karakter
 * duyarlı) geçip geçmediğini kontrol eder.
 */
export function containsPhrase(text: string, phrase: string): boolean {
  return text.toLocaleLowerCase('tr-TR').includes(phrase.toLocaleLowerCase('tr-TR'));
}

/**
 * Tüm extractor'lar için ortak kısaltma kuralı: hiçbir alan, şartnameden
 * uzun bir madde paragrafını aynen kopyalamamalıdır. Bu yardımcı, bir metni
 * en fazla ilk 1-2 cümleyle VE bir karakter limitiyle sınırlar. Kullanıcı
 * talebi: "Hiçbir kartta 2 cümleden uzun açıklama olmasın."
 */
export function truncateToShortText(text: string, maxLength = 220): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const sentences = normalized.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  let result = sentences[0] ?? normalized;
  // İlk cümle çok kısaysa (örn. bir bağlaçla bitiyorsa) ikinci cümleyi de ekle —
  // ama toplamda hâlâ "2 cümle" sınırının içinde kalınır.
  if (sentences.length > 1 && (result.length < 80 || result.endsWith(','))) {
    result = `${result} ${sentences[1]}`;
  }
  if (result.length > maxLength) {
    result = `${result.slice(0, maxLength).trim()}…`;
  }
  return result.trim();
}

/**
 * "Bu madde boş bırakılmıştır" gibi standart "uygulanmaz" ifadelerini tespit eder.
 */
export function isEmptyClause(text: string): boolean {
  const emptyPhrases = [
    'bu madde boş bırakılmıştır',
    'bu madde boş bırakılmıs',
    'boş bırakılmıştır',
    'uygulanmayacaktır',
    'bu bent boş bırakılmıştır'
  ];
  return emptyPhrases.some((phrase) => containsPhrase(text, phrase));
}

/**
 * normalizeText() İ->I dönüşümü yaptığı için, normalize edilmiş metinden
 * doğrudan alıntılanan parçalar kullanıcıya "Işin", "Idarenin" gibi yanlış
 * görünür. Bu yardımcı, kelime başındaki "I" harfini — hemen ardından
 * küçük bir harf geldiğinde (Türkçe'de büyük I ile başlayıp küçük harfle
 * devam eden gerçek kelime yoktur; bu kalıp sadece İ->I dönüşümünün izidir)
 * — "İ"ye geri çevirir. SADECE kullanıcıya gösterilecek özetlenmiş/kısaltılmış
 * metinlerde kullanılmalıdır (regex eşleştirme için ham normalize metin
 * olduğu gibi kalmalıdır).
 */
export function restoreTurkishI(text: string): string {
  return text.replace(/\bI(?=[a-zçğıöşü])/g, 'İ');
}
