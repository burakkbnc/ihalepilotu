import type { CompanyDocument, PastTenderRecord } from '@/types';
import type { Tender, TenderAnalysis } from '@/types/tender';

export type AssistantSourceType = 'ihale_analiz_sonucu' | 'sirket_belgeleri' | 'gecmis_ihaleler';

export interface AssistantSource {
  type: AssistantSourceType;
  title: string;
  detail?: string | null;
}

export interface AssistantAnswer {
  answer: string;
  sources: AssistantSource[];
  confidence: 'low' | 'medium' | 'high';
}

const STOP_WORDS = new Set(['bu','buna','bunun','ihale','ihaleye','icin','için','var','mi','mı','mu','mü','ne','nedir','hangi','gore','göre','biz','bizim','uygun','mudur','midir','musun','misin','sistem','belge','belgeler','gecmis','geçmiş']);

function normalize(input: unknown): string {
  return String(input ?? '').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇ\s]/gi, ' ').replace(/\s+/g, ' ').trim();
}

function tokens(input: unknown): string[] {
  return normalize(input).split(' ').filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}


const TECHNICAL_KEYS = new Set([
  'id', 'tenderId', 'companyId', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'uploadedBy',
  'source', 'sourceType', 'sourceDocument', 'sourceReference', 'rawAnalysis', 'rawResponse', 'metadata',
  'provider', 'runId', 'confidence', 'hasConflict', 'conflictReason', 'extractedAt'
]);

const SECTION_LABELS: Record<string, string> = {
  administrativeMeta: 'İdari şartname genel bilgileri',
  workExperience: 'İş deneyimi şartları',
  guarantee: 'Teminat bilgileri',
  requiredDocuments: 'İstenen belgeler',
  technicalRequirements: 'Teknik yeterlilikler',
  risks: 'Risk analizi',
  criticalDates: 'Kritik tarihler',
  boq: 'Birim fiyat cetveli',
  tenderItems: 'Birim fiyat cetveli',
  llmAnalysis: 'İhale analiz sonucu'
};

const FIELD_LABELS: Record<string, string> = {
  value: '',
  ikn: 'İKN',
  institutionName: 'İdare',
  tenderTitle: 'İhale adı',
  tenderProcedure: 'Usul',
  tenderType: 'İhale türü',
  submissionDate: 'Teklif tarihi',
  tenderDate: 'İhale tarihi',
  workStartDate: 'İşe başlama tarihi',
  workDuration: 'İşin süresi',
  partialOffer: 'Kısmi teklif',
  subcontractorAllowed: 'Alt yüklenici',
  required: 'Şart aranıyor',
  requiredRatio: 'Gerekli oran',
  minimumAmount: 'Asgari tutar',
  similarWorkDefinition: 'Benzer iş tanımı',
  temporaryGuarantee: 'Geçici teminat',
  finalGuarantee: 'Kesin teminat',
  rate: 'Oran',
  amount: 'Tutar',
  validity: 'Geçerlilik',
  iban: 'IBAN',
  receiver: 'Alıcı',
  title: 'Başlık',
  name: 'Ad',
  description: 'Açıklama',
  note: 'Not',
  category: 'Kategori',
  severity: 'Önem',
  date: 'Tarih',
  deadline: 'Son tarih'
};

function isEmptyText(value: string) {
  return !value || value === '-' || value === 'null' || value === 'undefined';
}

function prettifyKey(key: string) {
  return FIELD_LABELS[key] ?? key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').trim();
}

function formatPrimitive(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayır';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  return String(value).trim();
}

function humanizeValue(value: unknown, depth = 0): string {
  if (value === null || value === undefined || depth > 4) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return formatPrimitive(value);
  if (Array.isArray(value)) {
    return value.map((item) => humanizeValue(item, depth + 1)).filter((item) => !isEmptyText(item)).slice(0, 8).join(', ');
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('value' in obj) return humanizeValue(obj.value, depth + 1);

    return Object.entries(obj)
      .filter(([key]) => !TECHNICAL_KEYS.has(key))
      .map(([key, val]) => {
        const cleanValue = humanizeValue(val, depth + 1);
        if (isEmptyText(cleanValue)) return '';
        const label = prettifyKey(key);
        return label ? `${label}: ${cleanValue}` : cleanValue;
      })
      .filter(Boolean)
      .slice(0, 12)
      .join('. ');
  }
  return '';
}

function sectionLabel(id: string) {
  return SECTION_LABELS[id] ?? 'İhale analiz sonucu';
}

function stringifyCompact(value: unknown, depth = 0): string {
  return humanizeValue(value, depth);
}

function hasTechnicalLeak(text: string) {
  return /\b(tenderId|companyId|administrativeMeta|technicalRequirements|rawAnalysis|metadata|sourceType|sourceDocument|sourceReference|llmAnalysis|Firestore|undefined|null)\b/i.test(text);
}

function sanitizeAnswer(text: string) {
  const cleaned = text
    .replace(/\b(tenderId|companyId|administrativeMeta|technicalRequirements|rawAnalysis|metadata|sourceType|sourceDocument|sourceReference|llmAnalysis)\b\s*:?\s*/gi, '')
    .replace(/\s*\|\s*/g, '. ')
    .replace(/\b(undefined|null)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\.{2,}/g, '.')
    .trim();

  if (!cleaned || hasTechnicalLeak(cleaned)) {
    return 'Yüklenen dokümanlarda bu soruya ilişkin doğrulanabilir bir bilgi bulunamadı.';
  }
  return cleaned;
}

function scoreHaystack(queryTokens: string[], haystack: string) {
  const normalized = normalize(haystack);
  return queryTokens.reduce((score, token) => score + (normalized.includes(token) ? 1 : 0), 0);
}

function resultLabel(result: PastTenderRecord['result']) {
  const labels: Record<PastTenderRecord['result'], string> = { won: 'kazanılmış', lost: 'kaybedilmiş', cancelled: 'iptal edilmiş', ongoing: 'devam eden', no_bid: 'teklif verilmemiş' };
  return labels[result] ?? result;
}

function includesAny(question: string, words: string[]) {
  const normalized = normalize(question);
  return words.some((word) => normalized.includes(normalize(word)));
}

function mergedValue<T = unknown>(field: unknown): T | null {
  if (field === null || field === undefined) return null;
  if (typeof field === 'object' && !Array.isArray(field) && 'value' in (field as Record<string, unknown>)) {
    const value = (field as Record<string, unknown>).value;
    return (value === undefined ? null : value) as T | null;
  }
  return field as T;
}

function present(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function formatPercent(value: unknown) {
  const clean = mergedValue(value);
  if (!present(clean)) return '';
  if (typeof clean === 'number') return `%${clean}`;
  const text = String(clean).trim();
  return text.includes('%') ? text : `%${text}`;
}

function formatMoney(value: unknown) {
  const clean = mergedValue(value);
  if (!present(clean)) return '';
  if (typeof clean === 'number') return `${clean.toLocaleString('tr-TR')} TL`;
  return String(clean).trim();
}

function yesNo(value: unknown) {
  const clean = mergedValue(value);
  if (clean === true) return 'kabul edilmektedir';
  if (clean === false) return 'kabul edilmemektedir';
  return '';
}

function findSection(analysisSections: TenderAnalysis[], id: string) {
  return analysisSections.find((section) => section.id === id) as (TenderAnalysis & { data?: any }) | undefined;
}

function formatGuaranteeSection(section: (TenderAnalysis & { data?: any }) | undefined): string {
  const data = section?.data;
  if (!data) return '';

  const temporary = data.temporary ?? {};
  const final = data.final ?? {};
  const lines: string[] = [];

  const temporaryPercent = formatPercent(temporary.percent);
  const temporaryAmount = formatMoney(temporary.amount);
  const temporaryValidUntil = mergedValue<string>(temporary.validUntil);
  const temporaryTypes = mergedValue<string[]>(temporary.guaranteeTypes);
  const temporarySource = mergedValue<string>(temporary.sourceReference);
  const iban = mergedValue<string>(temporary.iban);
  const recipient = mergedValue<string>(temporary.recipientInstitution);
  const cash = yesNo(temporary.cashAccepted);
  const electronic = yesNo(temporary.electronicAccepted);

  if (temporaryPercent || temporaryAmount) {
    lines.push(`Geçici teminat ${temporaryPercent ? `oranı ${temporaryPercent}` : ''}${temporaryPercent && temporaryAmount ? ', ' : ''}${temporaryAmount ? `tutarı ${temporaryAmount}` : ''} olarak belirtilmiştir.`);
  }
  if (temporaryValidUntil) lines.push(`Geçici teminat geçerlilik tarihi: ${temporaryValidUntil}.`);
  if (Array.isArray(temporaryTypes) && temporaryTypes.length > 0) lines.push(`Kabul edilen geçici teminat türleri: ${temporaryTypes.slice(0, 5).join(', ')}.`);
  if (cash) lines.push(`Nakit teminat ${cash}.`);
  if (electronic) lines.push(`Elektronik teminat ${electronic}.`);
  if (iban || recipient) lines.push(`Nakit teminat bilgisi${recipient ? `: ${recipient}` : ''}${iban ? ` / IBAN: ${iban}` : ''}.`);
  if (temporarySource) lines.push(`İlgili madde: ${temporarySource}.`);

  const finalPercent = formatPercent(final.percent);
  const belowThresholdPercent = formatPercent(final.belowThresholdPercent);
  const belowThresholdCondition = mergedValue<string>(final.belowThresholdCondition);
  const finalSource = mergedValue<string>(final.sourceReference);
  if (finalPercent) lines.push(`Kesin teminat oranı ${finalPercent} olarak belirtilmiştir.`);
  if (belowThresholdPercent) lines.push(`Sınır değerin altında teklif verilmesi halinde kesin teminat oranı ${belowThresholdPercent}${belowThresholdCondition ? `; ${belowThresholdCondition}` : ''}.`);
  if (finalSource) lines.push(`Kesin teminat için ilgili madde: ${finalSource}.`);

  return lines.join(' ');
}

function llmFieldText(field: unknown): string {
  const value = mergedValue<string>(field);
  if (!present(value)) return '';
  const text = String(value).trim();
  return text === 'tespit_edilemedi' ? '' : text;
}

function formatLlmGuaranteeSection(section: (TenderAnalysis & { data?: any }) | undefined): string {
  const data = section?.data?.teminatAnalizi;
  if (!data) return '';
  const lines: string[] = [];
  const temporaryRate = llmFieldText(data.geciciTeminatOrani);
  const finalRate = llmFieldText(data.kesinTeminatOrani);
  const validity = llmFieldText(data.teminatGecerlilikTarihi);
  const acceptedTypes = llmFieldText(data.kabulEdilenTeminatTurleri);
  const iban = llmFieldText(data.nakitTeminatIban);
  const receiver = llmFieldText(data.aliciAdi);
  const penalties = llmFieldText(data.cezaOranlari);

  if (temporaryRate) lines.push(`Geçici teminat: ${temporaryRate}.`);
  if (finalRate) lines.push(`Kesin teminat: ${finalRate}.`);
  if (validity) lines.push(`Teminat geçerlilik bilgisi: ${validity}.`);
  if (acceptedTypes) lines.push(`Kabul edilen teminat türleri: ${acceptedTypes}.`);
  if (iban || receiver) lines.push(`Nakit teminat bilgisi${receiver ? `: ${receiver}` : ''}${iban ? ` / IBAN: ${iban}` : ''}.`);
  if (penalties) lines.push(`Ceza oranları: ${penalties}.`);
  return lines.join(' ');
}

function formatCriticalDatesSection(section: (TenderAnalysis & { data?: any }) | undefined): string {
  const data = section?.data;
  if (!data) return '';
  const fields: Array<[string, unknown]> = [
    ['İhale tarihi', data.tenderDate],
    ['Teklif son tarihi', data.submissionDeadline],
    ['Soru sorma son tarihi', data.questionDeadline],
    ['Geçici teminat son tarihi', data.temporaryGuaranteeDeadline],
    ['İşe başlama tarihi', data.workStartDate],
    ['İş bitiş tarihi', data.workEndDate],
    ['Sözleşme imzalama süresi', data.contractSigningPeriodDays]
  ];
  return fields
    .map(([label, value]) => {
      const clean = mergedValue(value);
      if (!present(clean)) return '';
      return `${label}: ${clean}${label === 'Sözleşme imzalama süresi' ? ' gün' : ''}.`;
    })
    .filter(Boolean)
    .join(' ');
}

function formatExperienceSection(section: (TenderAnalysis & { data?: any }) | undefined): string {
  const data = section?.data;
  if (!data) return '';
  const lines: string[] = [];
  const required = mergedValue<boolean>(data.required);
  const ratio = formatPercent(data.ratioPercent);
  const similarWork = mergedValue<string>(data.similarWorkDescription);
  const experienceType = mergedValue<string>(data.experienceType);
  if (required === true) lines.push(`Bu ihalede iş deneyimi şartı aranıyor${ratio ? `; istenen oran ${ratio}` : ''}.`);
  if (required === false) lines.push('Analizde iş deneyimi şartı aranmadığı görülüyor.');
  if (similarWork) lines.push(`Benzer iş tanımı: ${similarWork}.`);
  if (experienceType) lines.push(`İş deneyimi türü: ${experienceType}.`);
  return lines.join(' ');
}

function formatRequiredDocumentsSection(section: (TenderAnalysis & { data?: any }) | undefined): string {
  const docs = mergedValue<string[]>((section as any)?.data?.documents);
  if (!Array.isArray(docs) || docs.length === 0) return '';
  return `Analizde istenen belgeler arasında ${docs.slice(0, 8).map((doc) => `“${doc}”`).join(', ')} yer alıyor${docs.length > 8 ? ' ve devamı bulunuyor' : ''}.`;
}

function sourceTitleForSection(id: string) {
  return sectionLabel(id);
}

export function answerTenderAssistant(params: { question: string; tender: Tender; analysisSections: TenderAnalysis[]; companyDocuments: CompanyDocument[]; pastTenders: PastTenderRecord[]; }): AssistantAnswer {
  const { question, tender, analysisSections, companyDocuments, pastTenders } = params;
  const qTokens = tokens(`${question} ${tender.title} ${tender.institutionName ?? ''}`);
  const asksExperience = includesAny(question, ['iş deneyim', 'is deneyim', 'deneyim', 'benzer iş', 'benzer is', 'referans']);
  const asksDocuments = includesAny(question, ['belge', 'evrak', 'sertifika', 'yeterlilik']);
  const asksDates = includesAny(question, ['tarih', 'son gün', 'deadline', 'teklif', 'teslim']);
  const asksGuarantee = includesAny(question, ['teminat', 'oran', 'geçici teminat', 'kesin teminat']);
  const sources: AssistantSource[] = [];
  const analysisText = analysisSections.map((section) => `${section.id}: ${stringifyCompact(section)}`).join('\n');
  const analysisScore = scoreHaystack(qTokens, analysisText);

  if (asksExperience) {
    const docs = companyDocuments.filter((doc) => doc.category === 'is_deneyim_belgesi' || doc.category === 'referans_belgesi').map((doc) => ({ doc, score: scoreHaystack(qTokens, `${doc.title} ${doc.issuer ?? ''} ${doc.note ?? ''}`) })).sort((a, b) => b.score - a.score);
    const records = pastTenders.map((record) => ({ record, score: scoreHaystack(qTokens, `${record.tenderName} ${record.institution} ${record.note ?? ''} ${record.year ?? ''}`) })).sort((a, b) => b.score - a.score);
    const bestRecord = records[0];
    const bestDoc = docs[0];
    if (bestRecord && (bestRecord.score > 0 || pastTenders.length === 1)) {
      sources.push({ type: 'gecmis_ihaleler', title: bestRecord.record.tenderName, detail: bestRecord.record.institution });
      const docPart = bestDoc ? ` Ayrıca şirket belgelerinde “${bestDoc.doc.title}” kaydı bulunuyor.` : '';
      if (bestDoc) sources.push({ type: 'sirket_belgeleri', title: bestDoc.doc.title, detail: bestDoc.doc.issuer });
      return { answer: `Geçmiş kayıtlarınıza göre ${bestRecord.record.year ? `${bestRecord.record.year} yılında ` : ''}${bestRecord.record.institution} için yapılan “${bestRecord.record.tenderName}” işi benzer görünmektedir. Kayıt durumu: ${resultLabel(bestRecord.record.result)}.${docPart}`, sources, confidence: bestRecord.score >= 2 ? 'high' : 'medium' };
    }
    if (bestDoc) {
      sources.push({ type: 'sirket_belgeleri', title: bestDoc.doc.title, detail: bestDoc.doc.issuer });
      return { answer: `Şirket belgelerinde “${bestDoc.doc.title}” kaydı var. Geçmiş ihale kayıtlarında bu soruyla eşleşen net bir iş bulunamadı.`, sources, confidence: 'medium' };
    }
  }

  if (asksDocuments) {
    const relevantDocs = companyDocuments.map((doc) => ({ doc, score: scoreHaystack(qTokens, `${doc.title} ${doc.category} ${doc.issuer ?? ''} ${doc.note ?? ''}`) })).filter((item) => item.score > 0 || asksDocuments).sort((a, b) => b.score - a.score).slice(0, 5);
    if (relevantDocs.length > 0) {
      relevantDocs.forEach(({ doc }) => sources.push({ type: 'sirket_belgeleri', title: doc.title, detail: doc.issuer }));
      return { answer: `Şirket belgelerinde ilgili görünen kayıtlar: ${relevantDocs.map(({ doc }) => `“${doc.title}”`).join(', ')}. Sistem yalnızca kayıtlı belge adlarını gösterir; belge içeriği çıkarımı yoksa uygunluk yorumu yapmaz.`, sources, confidence: 'medium' };
    }
  }

  if (asksGuarantee && analysisSections.length > 0) {
    const guaranteeSection = findSection(analysisSections, 'guarantee');
    const llmSection = findSection(analysisSections, 'llmAnalysis');
    const structuredAnswer = sanitizeAnswer(formatGuaranteeSection(guaranteeSection));
    const llmAnswer = sanitizeAnswer(formatLlmGuaranteeSection(llmSection));
    const answer = !structuredAnswer.startsWith('Yüklenen dokümanlarda') ? structuredAnswer : llmAnswer;
    if (answer && !answer.startsWith('Yüklenen dokümanlarda')) {
      sources.push({ type: 'ihale_analiz_sonucu', title: sourceTitleForSection(guaranteeSection ? 'guarantee' : 'llmAnalysis') });
      return { answer, sources, confidence: 'high' };
    }
    return { answer: 'Yüklenen dokümanlarda teminat bilgisine ilişkin doğrulanabilir bir kayıt bulunamadı.', sources, confidence: 'low' };
  }

  if (asksDates && analysisSections.length > 0) {
    const criticalDatesSection = findSection(analysisSections, 'criticalDates');
    const answer = sanitizeAnswer(formatCriticalDatesSection(criticalDatesSection));
    if (answer && !answer.startsWith('Yüklenen dokümanlarda')) {
      sources.push({ type: 'ihale_analiz_sonucu', title: sourceTitleForSection('criticalDates') });
      return { answer, sources, confidence: 'high' };
    }
    return { answer: 'Yüklenen dokümanlarda kritik tarihlere ilişkin doğrulanabilir bir kayıt bulunamadı.', sources, confidence: 'low' };
  }

  if (asksExperience && analysisSections.length > 0) {
    const experienceSection = findSection(analysisSections, 'experience');
    const answer = sanitizeAnswer(formatExperienceSection(experienceSection));
    if (answer && !answer.startsWith('Yüklenen dokümanlarda')) {
      sources.push({ type: 'ihale_analiz_sonucu', title: sourceTitleForSection('experience') });
      return { answer, sources, confidence: 'high' };
    }
  }

  if (asksDocuments && analysisSections.length > 0) {
    const requiredDocumentsSection = findSection(analysisSections, 'requiredDocuments');
    const answer = sanitizeAnswer(formatRequiredDocumentsSection(requiredDocumentsSection));
    if (answer && !answer.startsWith('Yüklenen dokümanlarda')) {
      sources.push({ type: 'ihale_analiz_sonucu', title: sourceTitleForSection('requiredDocuments') });
      return { answer, sources, confidence: 'high' };
    }
  }

  if (analysisScore > 0 && analysisSections.length > 0) {
    const matched = analysisSections
      .map((section) => ({ section, text: stringifyCompact((section as any).data ?? section), score: scoreHaystack(tokens(question), `${sectionLabel(section.id)} ${stringifyCompact((section as any).data ?? section)}`) }))
      .filter((item) => item.text.trim().length > 0 && item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 1);

    matched.forEach(({ section }) => sources.push({ type: 'ihale_analiz_sonucu', title: sectionLabel(section.id) }));
    const excerpt = matched.map((m) => `${m.text}`).join(' ').slice(0, 500);
    return {
      answer: excerpt
        ? sanitizeAnswer(`Analizde bu konuya ilişkin şu bilgi yer alıyor: ${excerpt}`)
        : 'Yüklenen dokümanlarda bu soruya ilişkin doğrulanabilir bir bilgi bulunamadı.',
      sources,
      confidence: matched[0]?.score >= 2 ? 'medium' : 'low'
    };
  }

  return {
    answer: 'Yüklenen dokümanlarda bu soruya ilişkin doğrulanabilir bir bilgi bulunamadı.',
    sources,
    confidence: 'low'
  };
}
