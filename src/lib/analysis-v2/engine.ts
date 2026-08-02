import type {
  LlmGerekliBelge,
  LlmRiskOgesi,
  LlmTeknikYukumlulukKategori,
  LlmTeknikYukumlulukler,
  TenderAnalysisAdministrativeMeta,
  TenderAnalysisCriticalDates,
  TenderAnalysisGuarantee,
  TenderAnalysisLlmAnalysis
} from '@/types/tender';
import type { AnalysisV2Input, AnalysisV2Output } from './types';
import { mergeBoqV2 } from './boq';
import { cleanTenderText, compact, field, findSentence, normalizeForSearch, NOT_DETECTED, splitUsefulLines, uniq } from './text';

const SOURCE = 'İhale Pilotu V2 Analysis Engine';

export async function runAnalysisV2(input: AnalysisV2Input): Promise<AnalysisV2Output> {
  const now = new Date().toISOString();
  const adminText = cleanTenderText(input.administrativeText);
  const techText = cleanTenderText(input.technicalText);
  const allText = `${adminText}\n\n${techText}`.trim();
  const lower = normalizeForSearch(allText);

  const adminMeta = getSection<TenderAnalysisAdministrativeMeta['data']>(input, 'administrativeMeta');
  const criticalDates = getSection<TenderAnalysisCriticalDates['data']>(input, 'criticalDates');
  const guarantee = getSection<TenderAnalysisGuarantee['data']>(input, 'guarantee');

  // KÖK NEDEN DÜZELTMESİ (Aşama A — BFC için tek kaynak): Önceden bu motor
  // parser'ın çıkardığı satırlara EK OLARAK kendi regex okumasını
  // (extractBoqV2) da çalıştırıp ikisini birleştiriyordu — iki ayrı BOQ
  // motoru aynı anda çalışıyor, aralarında sessiz tutarsızlık riski
  // taşıyordu. Artık BFC'nin METİNDEN okunan TEK kaynağı parser'dır
  // (bkz. parser/extractors/officialBillOfQuantities.ts, pipeline.ts).
  // Parser hiç satır bulamazsa (taranmış/görsel doküman) fallback LLM'in
  // kendi okumasıdır — bu, route.ts seviyesinde ayrıca uygulanır (bkz.
  // from-documents/route.ts "Regex/parser BFC bulamadı" bloğu). Burada
  // sadece parser'ın idari+teknik çıktısı, sıra no bazında konsolide
  // edilir (aynı sıra no'nun idari/teknik'te iki kez gelmesi durumunda
  // daha güvenilir/uzun ada sahip olan tutulur).
  const officialBoqItems = mergeBoqV2(input.parserBoqItems ?? []);

  const operations = extractOperationsV2(techText || allText, officialBoqItems);
  const documents = extractDocumentsV2(allText);
  const risks = extractRisksV2(allText, lower, operations, documents, guarantee, officialBoqItems);
  const riskScore = calculateRiskScore(risks, operations.length, documents.length);
  const highRiskCount = risks.filter((r) => r.seviye === 'yüksek').length;

  const data: NonNullable<TenderAnalysisLlmAnalysis['data']> = {
    hizliBakis: {
      isTuru: field(detectWorkType(input.tenderTitle, lower, operations)),
      katilimDurumu: field(summarizeParticipation(adminMeta, lower)),
      oneCikanRisk: field(risks[0]?.baslik ?? NOT_DETECTED),
      kritikUyari: field(buildCriticalWarning(guarantee, risks, documents))
    },
    isOzeti: {
      buIsNe: field(buildWorkSummary(input.tenderTitle, allText, operations)),
      neredeNeZaman: field(buildWhereWhen(criticalDates, allText)),
      yukleniciNeSaglayacak: field(buildContractorScope(operations))
    },
    katilimUygunlugu: buildParticipation(adminMeta, lower, allText),
    maliYeterlilik: buildFinancialEligibility(allText),
    teminatAnalizi: buildGuaranteeAnalysis(guarantee, allText),
    riskler: risks,
    teknikYukumlulukler: buildTechnicalRequirements(operations),
    gerekliBelgeler: documents,
    executiveSummary: {
      genelOzet: field(buildExecutiveSummary(input.tenderTitle, operations, officialBoqItems, allText)),
      genelRiskSkoru: riskScore,
      riskSeviyesi: riskLevel(riskScore),
      katilimDurumu: riskScore >= 82 ? 'uygun_degil' : riskScore >= 45 ? 'sartli' : 'uygun',
      onerilenOdaklar: operations.slice(0, 5).map((op) => op.baslik)
    },
    provider: 'analysis_v2',
    generatedAt: now
  };

  return {
    section: {
      id: 'llmAnalysis',
      tenderId: input.tenderId,
      companyId: input.companyId,
      source: 'rule_based',
      data,
      generatedAt: now,
      updatedAt: now
    },
    officialBoqItems,
    highRiskCount,
    riskScore,
    sectionsFoundBoost: countSections(data, officialBoqItems.length)
  };
}

function getSection<T>(input: AnalysisV2Input, name: string): T | null {
  return (input.ruleBasedSections.find((section) => section.section === name)?.data as T | undefined) ?? null;
}

function buildTechnicalRequirements(operations: LlmTeknikYukumlulukKategori[]): LlmTeknikYukumlulukler {
  return {
    kategoriler: operations,
    ulasim: [],
    konaklama: [],
    yemek: [],
    rehberlik: [],
    sigorta: [],
    baskiGorunurluk: [],
    hediyelikIkram: []
  };
}


const OPERATION_BLACKLIST = /(iş\s+deneyim|is\s+deneyim|bilanço|bilanco|gelir\s+tablosu|ciro|teminat|ihale\s+tarihi|teklif\s+mektubu|katılım|katilim|yeterlik\s+kriter|yeterlilik\s+kriter|ekap|doküman|dokuman|4734|kanun|mevzuat|yasak|elektronik\s+eksiltme)/i;
const OPERATION_SIGNAL = /(kahvaltı|kahvalti|öğle\s+yemeği|ogle\s+yemegi|akşam\s+yemeği|aksam\s+yemegi|akşam\s+servisi|aksam\s+servisi|genel\s+temizlik|çevre\s+bakım|cevre\s+bakim|düzenleme|duzenleme|teknik\s+destek|araç\s+kiralama|arac\s+kiralama|tırmanma|tirmanma|paintball|macera\s+parkuru|aktivite|spor\s+malzemeleri|seyahat\s+sağlık\s+sigortası|saglik\s+sigortasi|sahne|led|ses|ışık|isik|konaklama|otel|yemek|catering|ikram|ulaşım|ulasim|transfer|midibüs|otobüs|baskı|baski|roll.?up|yaka\s+kart|backdrop|dekota|tişört|tisort|video|fotoğraf|fotograf|kayıt|kayit|personel|güvenlik|guvenlik|sigorta|organizasyon|dekor|süsleme|susleme|ekipman|malzeme|hizmeti|işi|isi|temini|kurulumu)/i;

function isOperationalTitle(text: string): boolean {
  return OPERATION_SIGNAL.test(text) && !OPERATION_BLACKLIST.test(text);
}

function extractOperationsV2(text: string, boqItems: Array<{ name: string; unit: string | null; quantity: number | null }>): LlmTeknikYukumlulukKategori[] {
  const lines = splitUsefulLines(text);
  const chunks = splitByMeaningfulHeadings(lines);
  const categories: LlmTeknikYukumlulukKategori[] = [];

  for (const chunk of chunks) {
    const title = inferTitle(chunk.title, chunk.lines);
    if (!title) continue;
    const details = extractDetails(chunk.lines, title);
    if (details.length === 0) continue;
    categories.push({ baslik: title, maddeler: details, kaynak: chunk.source });
  }

  // Resmi cetvel satırları operasyonun omurgasıdır. Her kalem için teknik şartnamedeki ilgili madde/başlık çevresinden detay toplamaya çalışır.
  for (const item of boqItems) {
    const title = compact(item.name, 100);
    if (!title || OPERATION_BLACKLIST.test(title)) continue;
    const amount = item.quantity && item.unit ? `${item.quantity} ${item.unit}` : null;
    const contextualDetails = findContextualOperationDetails(text, title);
    categories.push({
      baslik: title,
      maddeler: uniq([
        amount ? `Resmi cetvel miktarı: ${amount}.` : 'Resmi birim fiyat cetvelinde iş kalemi olarak yer alıyor.',
        ...contextualDetails
      ], (x) => x, 8),
      kaynak: contextualDetails.length ? 'Teknik Şartname / Birim Fiyat Cetveli' : 'Birim Fiyat Teklif Cetveli'
    });
  }

  return mergeOperationCategories(categories).slice(0, 16);
}


function findContextualOperationDetails(text: string, title: string): string[] {
  const lines = splitUsefulLines(text);
  const titleNorm = normalizeForSearch(title);
  const tokens = titleNorm.split(/\s+/).filter((t) => t.length >= 4 && !/(hizmeti|isi|işi|genel|adet|gun|gün|donem|dönem)/.test(t)).slice(0, 4);
  if (!tokens.length) return [];
  const hits: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const n = normalizeForSearch(lines[i]);
    const score = tokens.filter((t) => n.includes(t)).length;
    if (score === 0) continue;
    const window = lines.slice(i, Math.min(lines.length, i + 9));
    for (const line of window) {
      if (OPERATION_BLACKLIST.test(line)) continue;
      if (/(yüklenici|temin|sağlan|saglan|teslim|tarih|personel|adet|gün|gun|dönem|donem|saat|en az|en fazla|zorunlu|olacaktır|olacaktir|edilecektir|yapılacaktır|yapilacaktir|hizmet süresi|hizmet suresi)/i.test(line)) {
        hits.push(compact(line, 220));
      }
    }
    if (hits.length >= 6) break;
  }
  return uniq(hits, (x) => x, 6);
}

function splitByMeaningfulHeadings(lines: string[]): Array<{ title: string; lines: string[]; source: string }> {
  const result: Array<{ title: string; lines: string[]; source: string }> = [];
  let current: { title: string; lines: string[]; source: string } | null = null;
  const headingRx = /^(?:madde\s*)?(\d+(?:\.\d+){0,4})\s*[-–.)]?\s*(.{3,180})$/i;
  const obligationSignal = /(yüklenici|sağlan|saglan|temin|kurul|teslim|yapıl|yapil|edilecek|olacaktır|olacaktir|zorundadır|zorundadir|adet|gün|gun|kişi|kisi|öğün|ogun|saat|tarih|ölçü|olcu|ebat|cm|metre|personel)/i;

  const push = () => {
    if (current && current.lines.some((line) => obligationSignal.test(line))) result.push(current);
    current = null;
  };

  for (const line of lines) {
    const heading = line.match(headingRx);
    const headingText = heading?.[2] ?? '';
    if (heading && isOperationalTitle(headingText) && headingText.length < 140) {
      push();
      current = { title: headingText, lines: [], source: `Madde ${heading[1]}` };
      continue;
    }

    if (!current && isOperationalTitle(line) && obligationSignal.test(line)) {
      current = { title: line, lines: [line], source: SOURCE };
      continue;
    }

    if (current) {
      current.lines.push(line);
      if (current.lines.length >= 10) push();
    }
  }
  push();
  return result;
}

function inferTitle(rawTitle: string, lines: string[]): string | null {
  const normalized = compact(rawTitle, 100);
  const direct = normalized
    .replace(/^(yüklenici\s+tarafından|yüklenici|idare|hizmet kapsamında)\s*/i, '')
    .replace(/[:;.,-]+$/g, '')
    .trim();
  if (direct.length >= 4 && direct.length <= 100 && !OPERATION_BLACKLIST.test(direct)) return titleCaseish(direct);
  const first = lines.find(Boolean);
  if (!first) return null;
  return titleCaseish(compact(first.split(/yüklenici|temin|sağlan|saglan|kurul|yapıl|yapil/i)[0] || first, 90));
}

function extractDetails(lines: string[], title: string): string[] {
  const details: string[] = [];
  const detailSignal = /(adet|gün|gun|kişi|kisi|öğün|ogun|saat|tarih|cm|mm|metre|m²|m2|personel|kurul|temin|sağlan|saglan|teslim|edilecek|olacaktır|olacaktir|yüklenici|teknik|en az|en fazla|önce|sonra|kadar)/i;
  for (const line of lines) {
    if (!detailSignal.test(line)) continue;
    const clean = compact(line, 220);
    if (normalizeForSearch(clean) === normalizeForSearch(title)) continue;
    details.push(clean);
  }
  return uniq(details, (item) => item, 7);
}

function mergeOperationCategories(categories: LlmTeknikYukumlulukKategori[]): LlmTeknikYukumlulukKategori[] {
  const map = new Map<string, LlmTeknikYukumlulukKategori>();
  for (const category of categories) {
    const key = normalizeForSearch(category.baslik)
      .replace(/\b(hizmeti|isi|işi|temini|kurulumu)\b/g, '')
      .trim();
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...category, maddeler: uniq(category.maddeler, (x) => x, 7) });
    } else {
      existing.maddeler = uniq([...existing.maddeler, ...category.maddeler], (x) => x, 7);
      existing.kaynak = existing.kaynak || category.kaynak;
    }
  }
  return [...map.values()].filter((c) => c.maddeler.length > 0);
}

function titleCaseish(text: string): string {
  return compact(text, 100).replace(/\s+/g, ' ').trim();
}

function extractDocumentsV2(text: string): LlmGerekliBelge[] {
  const lines = splitUsefulLines(text);
  const docPatterns = [
    /(?:belgesi|sertifikası|sertifika|ruhsatı|ruhsat|izin|yetki|yeterlilik|oda kayıt|sicil|levha|taahhütname|beyanname|mektubu|dekont|poliçe|sigorta|src|psikoteknik|d2|türsab|tursab|iso|ce\b)/i
  ];
  const docs: LlmGerekliBelge[] = [];

  for (const line of lines) {
    if (!docPatterns.some((p) => p.test(line))) continue;
    if (/bu madde boş|bent boş|boş bırakılmış/i.test(line)) continue;
    const name = inferDocumentName(line);
    if (!name) continue;
    docs.push({ belgeAdi: name, durum: field(compact(line, 180)), kaynak: field(inferSourceFromLine(line)) });
  }

  return uniq(docs, (doc) => doc.belgeAdi, 24).slice(0, 18);
}

function inferDocumentName(line: string): string | null {
  const candidates: Array<[RegExp, string]> = [
    [/türsab|tursab/i, 'TÜRSAB belgesi'], [/\bd2\b/i, 'D2 yetki belgesi'], [/\bsrc\b/i, 'SRC belgesi'], [/psikoteknik/i, 'Psikoteknik belgesi'],
    [/iş\s+deneyim|is\s+deneyim/i, 'İş deneyim belgesi'], [/geçici\s+teminat|gecici\s+teminat/i, 'Geçici teminat'],
    [/teklif\s+mektubu/i, 'Teklif mektubu'], [/birim\s+fiyat\s+teklif\s+cetveli/i, 'Birim fiyat teklif cetveli'],
    [/oda\s+kayıt|oda\s+kayit/i, 'Oda kayıt belgesi'], [/ticaret\s+sicil/i, 'Ticaret sicil bilgileri'], [/imza\s+sirk|imza\s+beyan/i, 'İmza yetki belgeleri'],
    [/iso\s*\d+/i, compact(line.match(/iso\s*\d+[^,;.\n]*/i)?.[0] ?? 'ISO belgesi', 80)], [/ce\b/i, 'CE belgesi'],
    [/sigorta|poliçe/i, 'Sigorta / poliçe belgesi'], [/ruhsat|izin/i, 'Ruhsat / izin belgesi'], [/yetki\s+belgesi/i, 'Yetki belgesi'], [/yeterlilik\s+belgesi/i, 'Yeterlilik belgesi'],
    [/taahhütname/i, 'Taahhütname'], [/beyanname/i, 'Beyanname']
  ];
  const found = candidates.find(([rx]) => rx.test(line));
  if (found) return found[1];
  const m = line.match(/([A-ZÇĞİÖŞÜ0-9][^.;:\n]{2,80}?(?:belgesi|sertifikası|sertifika|ruhsatı|ruhsat|izin|yetki|yeterlilik|mektubu|dekont|poliçe|sigorta))/i);
  return m ? compact(m[1], 80) : null;
}

function inferSourceFromLine(line: string): string {
  const m = line.match(/(?:madde\s*)?(\d+(?:\.\d+){0,4})/i);
  return m ? `Madde ${m[1]}` : SOURCE;
}

function buildGuaranteeAnalysis(guarantee: TenderAnalysisGuarantee['data'] | null, text: string) {
  return {
    geciciTeminatOrani: field(guarantee?.temporary?.percent?.value ? `%${guarantee.temporary.percent.value}` : findPercentText(text, /geçici\s+teminat|gecici\s+teminat/i) ?? NOT_DETECTED),
    kesinTeminatOrani: field(guarantee?.final?.percent?.value ? `%${guarantee.final.percent.value}` : findPercentText(text, /kesin\s+teminat/i) ?? NOT_DETECTED),
    teminatGecerlilikTarihi: field(guarantee?.temporary?.validUntil?.value ?? findGuaranteeValidity(text) ?? NOT_DETECTED),
    nakitTeminatIban: field(guarantee?.temporary?.iban?.value ?? text.match(/TR\d{2}\s?(?:\d{4}\s?){4,6}\d{0,2}/i)?.[0] ?? NOT_DETECTED),
    aliciAdi: field(guarantee?.temporary?.recipientInstitution?.value ?? inferRecipient(text) ?? NOT_DETECTED),
    kabulEdilenTeminatTurleri: field(guarantee?.temporary?.guaranteeTypes?.value?.length ? guarantee.temporary.guaranteeTypes.value.join(', ') : findGuaranteeTypes(text) ?? NOT_DETECTED),
    cezaOranlari: field(findSentence(text, /ceza|gecikme\s+cezası|cezai\s+şart|kesinti/i, 220) ?? NOT_DETECTED)
  };
}


function findGuaranteeValidity(text: string): string | null {
  const lines = splitUsefulLines(text).filter((l) => /teminat/i.test(l));
  const strong = lines.find((l) => /tarihinden\s+önce\s+olmamak|geçerlilik\s+tarihi\s+belirtilmelidir/i.test(l));
  if (strong) return compact(strong, 160);
  return findSentence(text, /geçici\s+teminat[\s\S]{0,120}geçerlilik|gecici\s+teminat[\s\S]{0,120}gecerlilik/i, 160);
}

function findGuaranteeTypes(text: string): string | null {
  const lines = splitUsefulLines(text);
  const typeLines = lines.filter((l) => /tedavüldeki\s+türk\s+parası|teminat\s+mektupları|devlet\s+iç\s+borçlanma|teminat\s+olarak\s+kabul/i.test(l));
  return typeLines.length ? uniq(typeLines.map((l) => compact(l, 120)), (x) => x, 4).join(' • ') : null;
}

function findPercentText(text: string, anchor: RegExp): string | null {
  const lines = splitUsefulLines(text);
  const line = lines.find((l) => anchor.test(l) && /%\s*\d/.test(l));
  const m = line?.match(/%\s*(\d+(?:[.,]\d+)?)/);
  return m ? `%${m[1].replace(',', '.')}` : null;
}

function inferRecipient(text: string): string | null {
  const lines = splitUsefulLines(text);
  const ibanIndex = lines.findIndex((l) => /TR\d{2}/i.test(l));
  const candidates = (ibanIndex >= 0 ? lines.slice(Math.max(0, ibanIndex - 2), Math.min(lines.length, ibanIndex + 3)) : lines)
    .filter((l) => /hesabına|hesabina|müdürlüğü\s+hesabı|mudurlugu\s+hesabi|il\s+müdürlüğü|genel\s+müdürlüğü/i.test(l))
    .filter((l) => !/ekap|doküman|dokuman|indir|teklif\s+verilebilmesi/i.test(l));
  for (const line of candidates) {
    const m = line.match(/numaralı\s+(.+?)\s+hesab/i) ?? line.match(/TR\d[\d\s]+\s+(.+?)\s+hesab/i) ?? line.match(/([A-ZÇĞİÖŞÜa-zçğıöşü\s]+(?:Müdürlüğü|Başkanlığı|Bakanlığı))\s+Hesab/i);
    if (m) return compact(m[1], 120);
  }
  return null;
}

function buildFinancialEligibility(text: string) {
  return {
    isDeneyimiOrani: field(findPercentText(text, /iş\s+deneyim|is\s+deneyim/i) ?? NOT_DETECTED),
    ciroYeterliligiOrani: field(findPercentText(text, /ciro|iş\s+hacmi|is\s+hacmi/i) ?? NOT_DETECTED),
    bilancoSarti: field(findCleanEligibilitySentence(text, /bilanço|bilanco/i) ?? NOT_DETECTED),
    gelirTablosuSarti: field(findCleanEligibilitySentence(text, /gelir\s+tablosu|iş\s+hacmi|is\s+hacmi|ciro/i) ?? NOT_DETECTED),
    bankaReferansSarti: field(findCleanEligibilitySentence(text, /banka\s+referans|nakdi\s+kredi|gayrinakdi/i) ?? NOT_DETECTED)
  };
}

function findCleanEligibilitySentence(text: string, pattern: RegExp): string | null {
  const line = findSentence(text, pattern, 150);
  if (!line) return null;
  if (line.endsWith('…')) return null;
  if (/^a\)|^b\)|^c\)/i.test(line.trim()) && line.length > 120) return null;
  return line;
}

function buildParticipation(adminMeta: TenderAnalysisAdministrativeMeta['data'] | null, lower: string, text: string) {
  const criterion = (kriter: string, sonuc: string, kaynak = SOURCE) => ({ kriter, sonuc: field(sonuc), kaynak: field(kaynak) });
  return {
    yerliIstekliSarti: criterion('Yerli istekli şartı', adminMeta?.domesticBidderRequirement?.value === true ? 'Yerli istekli şartı/kısıtı tespit edildi.' : NOT_DETECTED),
    konsorsiyum: criterion('Konsorsiyum', boolText(adminMeta?.consortiumAllowed?.value, 'Konsorsiyum kabul ediliyor.', 'Konsorsiyum kabul edilmiyor.')),
    altYuklenici: criterion('Alt yüklenici', boolText(adminMeta?.subcontractorAllowed?.value, 'Alt yüklenici çalıştırılabilir.', 'Alt yüklenici çalıştırılamaz.')),
    kismiTeklif: criterion('Kısmi teklif', boolText(adminMeta?.partialBidAllowed?.value, 'Kısmi teklif verilebilir.', 'Kısmi teklif verilemez.')),
    elektronikEksiltme: criterion('Elektronik eksiltme', boolText(adminMeta?.electronicAuction?.value, 'Elektronik eksiltme uygulanabilir.', 'Elektronik eksiltme yapılmayacak.')),
    isDeneyimi: criterion('İş deneyimi', /is deneyim|iş deneyim/.test(lower) ? (findSentence(text, /iş\s+deneyim|is\s+deneyim/i, 180) ?? 'İş deneyimi/yeterlilik şartı tespit edildi.') : NOT_DETECTED)
  };
}

function boolText(value: boolean | null | undefined, yes: string, no: string): string {
  if (value === true) return yes;
  if (value === false) return no;
  return NOT_DETECTED;
}

function summarizeParticipation(adminMeta: TenderAnalysisAdministrativeMeta['data'] | null, lower: string): string {
  const flags = [
    adminMeta?.partialBidAllowed?.value === false ? 'kısmi teklif kapalı' : null,
    adminMeta?.subcontractorAllowed?.value === false ? 'alt yüklenici kapalı' : null,
    adminMeta?.consortiumAllowed?.value === false ? 'konsorsiyum kapalı' : null,
    /is deneyim|iş deneyim/.test(lower) ? 'iş deneyimi şartı var' : null
  ].filter(Boolean);
  return flags.length ? `Katılımda dikkat: ${flags.join(', ')}.` : 'Belirgin katılım kısıtı tespit edilmedi.';
}

function extractRisksV2(text: string, lower: string, operations: LlmTeknikYukumlulukKategori[], docs: LlmGerekliBelge[], guarantee: TenderAnalysisGuarantee['data'] | null, boq: Array<unknown>): LlmRiskOgesi[] {
  const risks: LlmRiskOgesi[] = [];
  const push = (r: LlmRiskOgesi) => { if (!risks.some((x) => normalizeForSearch(x.baslik) === normalizeForSearch(r.baslik))) risks.push(r); };
  if (/ceza|gecikme cezasi|gecikme cezası|cezai sart|cezai şart|kesinti/.test(lower)) push(risk('Ceza / gecikme yaptırımı', 'yüksek', 'Teslim, kurulum veya hizmet aksaması halinde yaptırım doğurabilecek ceza hükümleri tespit edildi.', text, /ceza|gecikme|cezai|kesinti/i, 78));
  if (/is deneyim|iş deneyim/.test(lower)) push(risk('İş deneyimi yeterliliği', 'orta', 'Teklif bedeline bağlı iş deneyimi veya benzer iş şartı bulundu; belge tutarı ayrıca kontrol edilmeli.', text, /iş\s+deneyim|is\s+deneyim/i, 62));
  if (guarantee?.temporary?.percent?.value || /gecici teminat|geçici teminat/.test(lower)) push(risk('Geçici teminat hazırlığı', 'orta', 'Teklif öncesi geçici teminat oranı, geçerlilik tarihi ve dekont/mektup hazırlığı takip edilmeli.', text, /geçici\s+teminat|gecici\s+teminat/i, 54));
  if (operations.length >= 8) push(risk('Çok parçalı operasyon', 'orta', 'Birden fazla tedarik, kurulum ve hizmet kalemi aynı organizasyon içinde koordine edilmeli.', text, /yüklenici|temin|hizmet|organizasyon/i, 66));
  if (docs.length >= 8) push(risk('Yoğun belge seti', 'orta', 'Katılım ve yeterlilik belgeleri için eksiksiz checklist hazırlanması gerekir.', text, /belge|yeterlilik|sunulması/i, 58));
  if (boq.length >= 10) push(risk('Birim fiyat kalemi yoğun', 'orta', 'Resmi cetvelde çok sayıda kalem bulundu; her kalem için ayrı fiyat ve tedarik kontrolü gerekir.', text, /birim\s+fiyat|iş\s+kalemi/i, 55));
  if (/alt yuklenici calistirilamaz|alt yüklenici çalıştırılamaz|alt yukleniciye izin verilmez|alt yükleniciye izin verilmez/.test(lower)) push(risk('Alt yüklenici kısıtı', 'yüksek', 'Alt yüklenici kısıtı operasyonun tamamının doğrudan yüklenici kontrolünde yürütülmesini gerektirir.', text, /alt\s+yüklenici|alt\s+yuklenici/i, 73));
  if (risks.length === 0) push({ baslik: 'Belirgin kritik risk yok', seviye: 'düşük', aciklama: field('V2 taramada yüksek seviyeli açık risk bulunmadı; yine de belge ve tarih checklisti kontrol edilmeli.'), kaynak: field(SOURCE), riskSkoru: 24, etki: 'düşük', olasilik: 'düşük' });
  return risks.slice(0, 8);
}

function risk(baslik: string, seviye: 'düşük' | 'orta' | 'yüksek', aciklama: string, text: string, sourceRx: RegExp, score: number): LlmRiskOgesi {
  return { baslik, seviye, aciklama: field(aciklama), kaynak: field(findSentence(text, sourceRx, 180) ?? SOURCE), riskSkoru: score, etki: seviye === 'yüksek' ? 'yüksek' : 'orta', olasilik: 'orta' };
}

function calculateRiskScore(risks: LlmRiskOgesi[], opCount: number, docCount: number): number {
  const max = Math.max(...risks.map((r) => r.riskSkoru ?? 25), 20);
  return Math.min(100, Math.round(max + Math.min(12, opCount) + Math.min(8, docCount / 2)));
}

function riskLevel(score: number): 'düşük' | 'orta' | 'yüksek' { return score >= 70 ? 'yüksek' : score >= 40 ? 'orta' : 'düşük'; }

function detectWorkType(title: string, lower: string, operations: LlmTeknikYukumlulukKategori[]): string {
  const combined = `${normalizeForSearch(title)} ${lower.slice(0, 5000)} ${operations.map((o) => normalizeForSearch(o.baslik)).join(' ')}`;
  if (/organizasyon|yarism|yarışm|etkinlik|kongre|final|sahne|led|ses|isik|ışık/.test(combined)) return 'Organizasyon / etkinlik hizmet alımı';
  if (/yemek|catering|ikram/.test(combined)) return 'Yemek / catering hizmeti';
  if (/ulasim|ulaşım|tasima|taşıma|arac|araç|otobus|otobüs|midibus|midibüs/.test(combined)) return 'Ulaşım / araç kiralama hizmeti';
  if (/konaklama|otel|geceleme/.test(combined)) return 'Konaklama hizmeti';
  if (/yazilim|yazılım|lisans|donanim|donanım/.test(combined)) return 'Bilişim / yazılım alımı';
  if (/yapim|yapım|insaat|inşaat|onarim|onarım/.test(combined)) return 'Yapım / bakım-onarım işi';
  return 'Hizmet / mal alımı';
}

function buildWorkSummary(title: string, text: string, operations: LlmTeknikYukumlulukKategori[]): string {
  const subject = findSentence(text, /ihale\s+konusu|işin\s+konusu|isin\s+konusu|hizmet\s+alımı\s+işi|hizmet\s+alimi\s+isi/i, 200);
  if (subject) return subject;
  const ops = operations.slice(0, 4).map((o) => o.baslik).join(', ');
  return ops ? `${title}; ${ops} ana iş paketlerinden oluşan hizmet kapsamıdır.` : `${title} için şartname analizi yapılmaktadır.`;
}

function buildWhereWhen(criticalDates: TenderAnalysisCriticalDates['data'] | null, text: string): string {
  const found = [
    criticalDates?.tenderDate?.value ? `İhale tarihi: ${criticalDates.tenderDate.value}` : null,
    criticalDates?.submissionDeadline?.value ? `Son teklif: ${criticalDates.submissionDeadline.value}` : null,
    criticalDates?.workStartDate?.value ? `Başlangıç: ${criticalDates.workStartDate.value}` : null,
    criticalDates?.workEndDate?.value ? `Bitiş: ${criticalDates.workEndDate.value}` : null
  ].filter(Boolean);
  if (found.length) return found.join(' • ');
  return findSentence(text, /\d{1,2}[./]\d{1,2}[./]\d{4}|tarih|saat|başlama|bitirme|süre|sure/i, 180) ?? NOT_DETECTED;
}

function buildContractorScope(operations: LlmTeknikYukumlulukKategori[]): string {
  if (!operations.length) return NOT_DETECTED;
  return `Yüklenici ${operations.slice(0, 6).map((op) => op.baslik).join(', ')} kalemlerini sağlayacak.`;
}

function buildExecutiveSummary(title: string, operations: LlmTeknikYukumlulukKategori[], boq: Array<unknown>, text: string): string {
  const ops = operations.slice(0, 5).map((op) => op.baslik).join(', ');
  const date = findSentence(text, /\d{1,2}[./]\d{1,2}[./]\d{4}|\d+\s*gün|\d+\s+gun/i, 90);
  const boqPart = boq.length ? ` Resmi cetvelde ${boq.length} iş kalemi tespit edildi.` : '';
  return compact(`${title} kapsamında ${ops || 'şartnamedeki hizmet kalemleri'} yürütülecek.${date ? ` Tarih/süre bilgisi: ${date}.` : ''}${boqPart}`, 500);
}

function buildCriticalWarning(guarantee: TenderAnalysisGuarantee['data'] | null, risks: LlmRiskOgesi[], docs: LlmGerekliBelge[]): string {
  const high = risks.find((r) => r.seviye === 'yüksek');
  if (high) return high.baslik;
  if (guarantee?.temporary?.percent?.value) return `Geçici teminat %${guarantee.temporary.percent.value}; geçerlilik/IBAN kontrol edilmeli.`;
  if (docs.length) return `${docs.length} belge/yeterlilik kalemi tespit edildi.`;
  return NOT_DETECTED;
}

/**
 * KÖK NEDEN DÜZELTMESİ (Aşama A — analysis-v2 koşulsuz çalışmasının
 * kaldırılması): Bu fonksiyon dışa açıldı çünkü artık route.ts, gerçek
 * bir LLM analizi TAMAMLANDIĞINDA bu ağır regex motorunu (runAnalysisV2)
 * TEKRAR çalıştırmak yerine, "kaç bölüm bulundu" sayısını doğrudan LLM'in
 * kendi (aynı şekilli) sonucundan hesaplar — ikisi de aynı
 * TenderAnalysisLlmAnalysis['data'] şeklini paylaştığı için bu fonksiyon
 * her iki kaynak için de kullanılabilir.
 */
export function countSections(data: NonNullable<TenderAnalysisLlmAnalysis['data']>, boqCount: number): number {
  let n = 0;
  if (data.executiveSummary?.genelOzet.value !== NOT_DETECTED) n++;
  if (data.teknikYukumlulukler.kategoriler?.length) n++;
  if (data.gerekliBelgeler.length) n++;
  if (data.riskler.length) n++;
  if (data.teminatAnalizi.geciciTeminatOrani.value !== NOT_DETECTED || data.teminatAnalizi.nakitTeminatIban.value !== NOT_DETECTED) n++;
  if (boqCount) n++;
  return n;
}
