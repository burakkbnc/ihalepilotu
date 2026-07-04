// ============================================================
// Extractor — Teminat Analizi
// Geçici/kesin teminat ayrı tutulur. Geçerlilik süresi, nakit IBAN
// ve alıcı adı idari şartnameden çekilmeye çalışılır; sabit değer üretilmez.
// ============================================================
import { parsePercent, parseTurkishCurrency, parseTurkishDate, restoreTurkishI } from '../normalize';

export interface TemporaryGuaranteeData {
  percent: number | null;
  amount: number | null;
  validUntil: string | null;
  cashAccepted: boolean | null;
  electronicAccepted: boolean | null;
  iban: string | null;
  recipientInstitution: string | null;
  accountingUnit: string | null;
  guaranteeTypes: string[];
  sourceReference: string | null;
}

export interface FinalGuaranteeData {
  percent: number | null;
  belowThresholdPercent: number | null;
  belowThresholdCondition: string | null;
  sourceReference: string | null;
}

const GUARANTEE_TYPE_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'Tedavüldeki Türk Parası', pattern: /tedavüldeki\s+türk\s+paras[ıi]/i },
  { label: 'Teminat Mektubu', pattern: /teminat\s+mektu(b|p)u/i },
  { label: 'Devlet İç Borçlanma Senetleri', pattern: /devlet\s+iç\s+borçlanma\s+senet/i },
  { label: 'Hazine Bonosu', pattern: /hazine\s+bonosu/i },
  { label: 'Devlet Tahvili', pattern: /devlet\s+tahvili/i }
];

function extractSourceReference(text: string, headingPattern: RegExp): string | null {
  const match = text.match(headingPattern);
  if (!match) return null;
  return restoreTurkishI(match[0].replace(/\s+/g, ' ').trim());
}

function isolateTemporaryGuaranteeSection(text: string): string | null {
  const match = text.match(/MADDE\s+\d+\s*[-–.:]?\s*Geçici\s+Teminat[\s\S]{0,2500}?(?=\nMADDE\s+\d|$)/i);
  if (match) return match[0];
  const altMatch = text.match(/geçici\s+teminat[\s\S]{0,2500}?(?=\nMADDE\s+\d|$)/i);
  return altMatch ? altMatch[0] : null;
}

function isolateFinalGuaranteeSection(text: string): string | null {
  const match = text.match(/MADDE\s+\d+\s*[-–.:]?\s*Kesin\s+Teminat[\s\S]{0,2500}?(?=\nMADDE\s+\d|$)/i);
  if (match) return match[0];
  const altMatch = text.match(/kesin\s+teminat[\s\S]{0,2500}?(?=\nMADDE\s+\d|$)/i);
  return altMatch ? altMatch[0] : null;
}


function firstPercentFromMatch(match: RegExpMatchArray | null): number | null {
  if (!match) return null;
  for (let i = 1; i < match.length; i += 1) {
    if (match[i]) return parsePercent(match[i]);
  }
  return null;
}

function extractStandardFinalPercent(section: string): number | null {
  // Standart kesin teminat genellikle "ihale/sözleşme bedelinin %6'sı"dır.
  // Sınır değer/aşırı düşük cümlelerinde geçen %9 gibi özel oranlar burada
  // kesinlikle standart oran olarak alınmaz.
  const standardWindow = section
    .split(/sınır\s+değer|aşırı\s+düşük|sınır\s+değerin\s+altında/i)[0]
    .slice(0, 1800);

  const match =
    standardWindow.match(/(?:ihale|sözleşme)\s+bedelinin[^%\n.]{0,140}%\s*(\d+(?:[.,]\d+)?)/i) ??
    standardWindow.match(/%\s*(\d+(?:[.,]\d+)?)\s*(?:'?[sş]?i|’?[sş]?i|oranında)?[^.\n]{0,120}(?:kesin\s+teminat)/i) ??
    standardWindow.match(/kesin\s+teminat[^.\n]{0,160}%\s*(\d+(?:[.,]\d+)?)/i);

  return firstPercentFromMatch(match);
}

function extractBelowThresholdFinalPercent(section: string): { percent: number | null; condition: string | null } {
  const belowWindowMatch = section.match(/(?:sınır\s+değer|aşırı\s+düşük)[\s\S]{0,900}/i);
  const belowWindow = belowWindowMatch?.[0] ?? '';
  if (!belowWindow) return { percent: null, condition: null };

  const match =
    belowWindow.match(/yaklaşık\s+maliyet(?:in)?[^%\n.]{0,180}%\s*(\d+(?:[.,]\d+)?)/i) ??
    belowWindow.match(/(?:sınır\s+değerin\s+altında|aşırı\s+düşük)[^%\n.]{0,260}%\s*(\d+(?:[.,]\d+)?)/i);

  const percent = firstPercentFromMatch(match);
  return {
    percent,
    condition: percent === null ? null : 'Sınır değerin altında teklif verilip ihale üzerinde kalması halinde'
  };
}

export function extractTemporaryGuarantee(text: string): { data: TemporaryGuaranteeData; confidence: 'found' | 'not_found' } {
  const data: TemporaryGuaranteeData = {
    percent: null,
    amount: null,
    validUntil: null,
    cashAccepted: null,
    electronicAccepted: null,
    iban: null,
    recipientInstitution: null,
    accountingUnit: null,
    guaranteeTypes: [],
    sourceReference: null
  };

  const section = isolateTemporaryGuaranteeSection(text);
  if (!section) return { data, confidence: 'not_found' };

  let foundAny = false;
  data.sourceReference = extractSourceReference(section, /MADDE\s+\d+\s*[-–.:]?\s*Geçici\s+Teminat/i);

  const percentMatch = section.match(/%\s*(\d+(?:[.,]\d+)?)\s*(?:'?\s*(?:undan|ından|inden|ünden|sinden))?\s*(?:az\s+olmamak)?/i);
  if (percentMatch) {
    data.percent = parsePercent(percentMatch[1]);
    foundAny = true;
  }

  const amountMatch = section.match(/([\d.,]+)\s*(?:₺|TL|TRY)/i);
  if (amountMatch) {
    data.amount = parseTurkishCurrency(amountMatch[1]);
    foundAny = true;
  }

  const validUntilMatch =
    section.match(/geçerlilik[^.\n]{0,80}?(\d{1,2}[.\/\-]\d{1,2}[.\/\-]\d{4})/i) ??
    section.match(/(\d{1,2}[.\/\-]\d{1,2}[.\/\-]\d{4})\s+tarihine\s+kadar/i);
  if (validUntilMatch) {
    data.validUntil = parseTurkishDate(validUntilMatch[1]);
    foundAny = true;
  } else {
    const relativeValidityMatch =
      section.match(/teklif(?:in|lerin)?\s+geçerlilik\s+süresinden[^.\n]{0,120}?(\d+)\s*(?:takvim\s+)?gün[^.\n]{0,80}?(?:fazla|sonra|sonrasına)/i) ??
      section.match(/geçici\s+teminat[^.\n]{0,120}?(\d+)\s*(?:takvim\s+)?gün\s+süreyle\s+geçerli/i) ??
      section.match(/geçerlilik\s+süresi[^.\n]{0,80}?(\d+)\s*(?:takvim\s+)?gün/i);
    if (relativeValidityMatch) {
      data.validUntil = restoreTurkishI(relativeValidityMatch[0].replace(/\s+/g, ' ').trim());
      foundAny = true;
    }
  }

  for (const { label, pattern } of GUARANTEE_TYPE_PATTERNS) {
    if (pattern.test(section)) {
      data.guaranteeTypes.push(label);
      foundAny = true;
    }
  }

  if (/elektronik\s+teminat/i.test(section)) {
    data.electronicAccepted = !isRejected(section, 'elektronik teminat');
    foundAny = true;
  }

  if (/nakit\s+teminat/i.test(section) || /nakit\s+olarak/i.test(section) || /IBAN/i.test(section)) {
    data.cashAccepted = !isRejected(section, 'nakit');
    foundAny = true;
  }

  const ibanMatch = section.match(/\bTR\d{2}[\s]?(?:\d{4}[\s]?){5}\d{2}\b/i);
  if (ibanMatch) {
    data.iban = ibanMatch[0].replace(/\s+/g, ' ').trim();
    foundAny = true;
  }

  const recipientMatch =
    section.match(
      /(?:idare\s+ad[ıi]|alıcı\s+ad[ıi]|alıcı|teminat\s+alıcısı|hesap\s+sahibi|lehdar)[^\n:]{0,50}[:\-]?\s*([A-ZÇĞİÖŞÜ][A-Za-zçÇğĞıİöÖşŞüÜ\s.]+(?:Belediyesi|Bakanlığı|Müdürlüğü|Başkanlığı|Üniversitesi|Valiliği|Kaymakamlığı|Genel\s+Müdürlüğü))/i
    ) ??
    section.match(
      /([A-ZÇĞİÖŞÜ][A-Za-zçÇğĞıİöÖşŞüÜ\s.]+(?:Belediyesi|Bakanlığı|Müdürlüğü|Başkanlığı|Üniversitesi|Valiliği|Kaymakamlığı|Genel\s+Müdürlüğü))[^.\n]{0,80}?(?:adına|namına|hesabına)/i
    );
  if (recipientMatch) {
    data.recipientInstitution = restoreTurkishI(recipientMatch[1].replace(/\s+/g, ' ').trim());
    foundAny = true;
  }

  const accountingMatch = section.match(/(?:muhasebe\s+birimi|muhasebe\s+yetkilisi)[^\n:.,]{0,80}?(?:Müdürlüğü|Mutemetliği|Birimi)/i);
  if (accountingMatch) {
    data.accountingUnit = restoreTurkishI(accountingMatch[0].replace(/\s+/g, ' ').trim());
    foundAny = true;
  }

  return { data, confidence: foundAny ? 'found' : 'not_found' };
}

export function extractFinalGuarantee(text: string): { data: FinalGuaranteeData; confidence: 'found' | 'not_found' } {
  const data: FinalGuaranteeData = {
    percent: null,
    belowThresholdPercent: null,
    belowThresholdCondition: null,
    sourceReference: null
  };

  const section = isolateFinalGuaranteeSection(text);
  if (!section) return { data, confidence: 'not_found' };

  let foundAny = false;
  data.sourceReference = extractSourceReference(section, /MADDE\s+\d+\s*[-–.:]?\s*Kesin\s+Teminat/i);

  const standardPercent = extractStandardFinalPercent(section);
  if (standardPercent !== null) {
    data.percent = standardPercent;
    foundAny = true;
  }

  const belowThreshold = extractBelowThresholdFinalPercent(section);
  if (belowThreshold.percent !== null) {
    data.belowThresholdPercent = belowThreshold.percent;
    data.belowThresholdCondition = belowThreshold.condition;
    foundAny = true;
  }

  return { data, confidence: foundAny ? 'found' : 'not_found' };
}

export function extractGuaranteeBankName(text: string): string | null {
  const bankMatch = text.match(
    /(T\.?C\.?\s*Ziraat\s+Bankas[ıi]|Halkbank|VakıfBank|Vakıfbank|Türkiye\s+(?:Vakıflar|Halk|Ziraat)\s+Bankas[ıi])/i
  );
  return bankMatch ? bankMatch[1].trim() : null;
}

function isRejected(text: string, anchor: string): boolean {
  const lower = text.toLocaleLowerCase('tr-TR');
  const anchorLower = anchor.toLocaleLowerCase('tr-TR');
  const idx = lower.indexOf(anchorLower);
  if (idx === -1) return false;
  const window = lower.slice(idx, idx + 160);
  return /kabul\s+edil(me|mi)?yecek|kabul\s+edilmez|reddedilir/.test(window);
}
