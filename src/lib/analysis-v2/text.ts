export const NOT_DETECTED = 'tespit_edilemedi';

export function fixTurkishMojibake(text: string): string {
  const replacements: Record<string, string> = {
    'Ý': 'İ', 'ý': 'ı', 'Þ': 'Ş', 'þ': 'ş', 'Ð': 'Ğ', 'ð': 'ğ',
    'Ýþ': 'İş', 'iþ': 'iş', 'Ýhale': 'İhale', 'Þartname': 'Şartname'
  };
  return text.replace(/Ýþ|iþ|Ýhale|Þartname|[ÝýÞþÐð]/g, (ch) => replacements[ch] ?? ch);
}

export function cleanTenderText(text: string | null | undefined): string {
  if (!text) return '';
  return fixTurkishMojibake(text)
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => !isNoiseLine(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function isNoiseLine(line: string): boolean {
  if (!line) return false;
  if (/^(\d{8,}\s*[-–]?\s*){3,}\d{8,}$/.test(line)) return true;
  if (/^sayfa\s*\d+/i.test(line)) return true;
  if (/^\d+\s*$/.test(line)) return true;
  return false;
}

export function normalizeForSearch(text: string): string {
  return fixTurkishMojibake(text)
    .toLocaleLowerCase('tr-TR')
    .replace(/[ıİ]/g, 'i')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u')
    .replace(/[şŞ]/g, 's')
    .replace(/[öÖ]/g, 'o')
    .replace(/[çÇ]/g, 'c');
}

export function compact(text: string, max = 240): string {
  const clean = fixTurkishMojibake(text)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[-•*\d.)\s]+/, '')
    .trim();
  return clean.length > max ? `${clean.slice(0, max).trim()}…` : clean;
}

export function uniq<T>(items: T[], keyFn: (item: T) => string, max = 20): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = normalizeForSearch(keyFn(item));
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

export function field(value: string) {
  return { value: value?.trim() || NOT_DETECTED };
}

export function splitUsefulLines(text: string): string[] {
  return cleanTenderText(text)
    .split(/\n+/)
    .map((line) => compact(line, 700))
    .filter((line) => line.length >= 8 && line.length <= 700);
}

export function findSentence(text: string, pattern: RegExp, max = 240): string | null {
  const lines = splitUsefulLines(text);
  const hit = lines.find((line) => pattern.test(line));
  return hit ? compact(hit, max) : null;
}
