// ============================================================
// Extractor — Resmi Birim Fiyat Teklif Cetveli
//
// EK'teki resmi "Sıra No / İş Kalemi Adı / Birim / Miktar" tablosunu
// yakalar. Bu kalemler "resmi cetvel kalemi" olarak işaretlenir ve
// teknik şartnameden çıkarılan maliyet kırılımı kalemlerinden (bkz.
// costItems.ts) AYRI tutulur — ikisi farklı amaçlara hizmet eder.
//
// ÖNEMLİ: Bu extractor HAM (normalize edilmemiş) metin üzerinde
// çalıştırılmalıdır. normalizeText() çoklu boşlukları tek boşluğa
// indirdiği için (bkz. parser/normalize.ts), Word/PDF'ten kopyalanan
// tablolarda sütunları ayıran çoklu-boşluk bilgisi kaybolur. Bu yüzden
// pipeline bu extractor'a normalize edilmemiş metni vermelidir (yalnızca
// \r\n -> \n dönüşümü ve baştaki/sondaki boşluk temizliği uygulanır).
//
// Desteklenen üç gerçek dünya formatı:
//   1. Pipe veya TAB ayrımlı tek satır:   "1 | Tişört | Adet | 24"
//   2. Çoklu boşlukla ayrılmış tek satır: "1    Tişört    Adet    24"
//   3. Her hücre kendi satırında (PDF metin çıkarımı):
//        1
//        Tişört
//        Adet
//        24
// ============================================================
import type { ExtractionResult } from '../types';
import type { CostItemSourceDocument, OfficialBillItem } from '@/types/tender';

function basicNormalize(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/İ/g, 'I') // Türkçe İ, case-insensitive regex'lerde standart i/I ile uyuşmadığı için
    .trim();
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `bill-${Date.now()}-${idCounter}`;
}

const UNIT_WORD = '[A-Za-zÇĞİÖŞÜçğıöşü²]{2,20}';

/** Strateji 1 & 2: pipe/tab veya 2+ boşlukla ayrılmış tek satırlı satırlar. */
function extractSeparatedRows(text: string): OfficialBillItem[] {
  const rowPattern = new RegExp(
    `^[ \\t]*(\\d{1,3})\\s*(?:[|\\t]\\s*|[ \\t]{2,})([^\\n|\\t]{3,150}?)\\s*(?:[|\\t]\\s*|[ \\t]{2,})(${UNIT_WORD})\\s*(?:[|\\t]\\s*|[ \\t]{2,})(\\d{1,6}(?:[.,]\\d+)?)[ \\t]*$`,
    'gim'
  );

  const items: OfficialBillItem[] = [];
  for (const match of text.matchAll(rowPattern)) {
    items.push({
      id: nextId(),
      orderNo: Number(match[1]),
      name: match[2].trim(),
      unit: match[3].trim(),
      quantity: parseQuantity(match[4]),
      sourceDocument: 'idari',
      confidence: 0.9
    });
  }
  return items;
}

/** Strateji 3: başlık satırını bulup, ardından 4'erli grup halinde satırları okur. */
function extractLinePerCellRows(text: string): OfficialBillItem[] {
  const headerMatch = text.match(/S[ıi]ra\s+No[\s\S]{0,120}?Miktar\s*\n/i);
  if (!headerMatch || headerMatch.index === undefined) return [];

  const afterHeader = text.slice(headerMatch.index + headerMatch[0].length);
  const lines = afterHeader
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const items: OfficialBillItem[] = [];
  let i = 0;
  while (i < lines.length) {
    const orderNoMatch = lines[i].match(/^(\d{1,3})$/);
    if (!orderNoMatch) break; // sıra no ile başlamayan satıra (ör. "TOPLAM TUTAR") gelince dur

    const description = lines[i + 1];
    const unit = lines[i + 2];
    const quantityRaw = lines[i + 3];

    if (!description || !unit || !quantityRaw || !/^\d{1,6}(?:[.,]\d+)?$/.test(quantityRaw)) break;
    if (!/^[A-Za-zÇĞİÖŞÜçğıöşü²]{2,20}$/.test(unit)) break;

    items.push({
      id: nextId(),
      orderNo: Number(orderNoMatch[1]),
      name: description,
      unit,
      quantity: parseQuantity(quantityRaw),
      sourceDocument: 'idari',
      confidence: 0.9
    });

    i += 4;
  }
  return items;
}


/** Strateji 4: PDF/DOCX metinlerinde sık görülen "sıra + açıklama, sonraki satırda birim miktar" formatı. */
function extractWrappedRows(text: string): OfficialBillItem[] {
  const headerIndex = text.search(/(?:S[ıi]ra\s+No|İş\s+Kaleminin\s+Ad[ıi]|Iş\s+Kaleminin\s+Ad[ıi]|Birim\s+Fiyat\s+(?:Teklif\s+)?Cetveli)/i);
  if (headerIndex === -1) return [];

  const chunk = text
    .slice(headerIndex, headerIndex + 18000)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  const units = '(?:gün|gun|adet|kişi|kisi|öğün|ogun|saat|ay|yıl|yil|metre|m|m²|m2|kg|lt|paket|set|takım|takim)';
  const rowPattern = new RegExp(
    `(?:^|\\n)\\s*(\\d{1,3})\\s+([\\s\\S]{3,260}?)\\s+(${units})\\s+(\\d{1,6}(?:[.,]\\d{3})*(?:[.,]\\d+)?)\\s*(?=\\n\\s*\\d{1,3}\\s+|\\n\\s*TOPLAM|$)`,
    'gi'
  );

  const items: OfficialBillItem[] = [];
  for (const match of chunk.matchAll(rowPattern)) {
    const name = cleanupDescription(match[2]);
    const unit = match[3].trim();
    const quantity = parseQuantity(match[4]);
    const orderNo = Number(match[1]);
    if (!name || !quantity || !Number.isFinite(orderNo)) continue;
    items.push({
      id: nextId(),
      orderNo,
      name,
      unit,
      quantity,
      sourceDocument: 'idari',
      confidence: 0.88
    });
  }

  return items;
}

function cleanupDescription(raw: string): string | null {
  const cleaned = raw
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^(?:[A-Z]\s*)?\d+\s*/i, '')
    .replace(/^(?:Sıra|Sira|No|İş Kalemi|Iş Kalemi|Birim|Miktar)\b.*$/i, '')
    .trim();
  if (cleaned.length < 3 || cleaned.length > 180) return null;
  if (/^(?:Teklif Edilen|Birim Fiyat|Tutarı|Tutarı5)$/i.test(cleaned)) return null;
  return cleaned;
}

function parseQuantity(raw: string): number | null {
  const trimmed = raw.trim();
  // Türkçe tabloda nokta çoğunlukla binlik ayraçtır: 1.367 => 1367.
  const normalized = /\.\d{3}(?:\D|$)/.test(trimmed)
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed.replace(',', '.');
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/**
 * Resmi Birim Fiyat Teklif Cetveli'ni metinden çıkarır. `sourceDocument`,
 * bu metnin idari mi teknik şartnameden mi geldiğini belirtir (cetvel
 * genellikle idari şartname ekinde bulunur, ama bazı kurumlar teknik
 * şartnameye de ekleyebilir).
 */
export function extractOfficialBillOfQuantities(
  rawText: string,
  sourceDocument: CostItemSourceDocument
): ExtractionResult<{ items: OfficialBillItem[] }> {
  const text = basicNormalize(rawText);

  // "Birim Fiyat Teklif Cetveli" / "Birim Fiyat Cetveli" başlığı metinde
  // hiç geçmiyorsa, bu extractor'ı çalıştırmanın anlamı yok — yanlış
  // pozitif riskini azaltmak için tamamen atla.
  if (!/Birim\s+Fiyat\s+(?:Teklif\s+)?Cetveli/i.test(text)) {
    return { data: { items: [] }, confidence: 'not_found' };
  }

  let items = extractSeparatedRows(text);
  if (items.length === 0) {
    items = extractLinePerCellRows(text);
  }
  if (items.length === 0) {
    items = extractWrappedRows(text);
  }

  items = items.map((item) => ({ ...item, sourceDocument }));

  return {
    data: { items },
    confidence: items.length > 0 ? 'found' : 'not_found'
  };
}
