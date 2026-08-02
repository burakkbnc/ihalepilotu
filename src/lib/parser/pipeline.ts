// ============================================================
// Parser Pipeline (Faz 3.5 — Stabilizasyon ve Kesin Alan Çıkarımı)
//
// ÖNEMLİ MİMARİ KARARI: Bu fazda sistem artık "akıllı şartname analizi"
// yapmaya ÇALIŞMAZ. Anlam gerektiren alanlar (İşin Özeti, Teknik
// Yükümlülükler, Risk Analizi, Maliyet Kırılımı, Fiyatlandırılabilir Alt
// Kalemler) heuristic/regex ile ÜRETİLMEZ — bu alanlar Faz 4'te gerçek bir
// LLM tarafından üretilecektir. Bu pipeline SADECE şu kesin, regex ile
// güvenilir biçimde yakalanabilir alanları üretir:
//   - İdari meta (İKN, teklif geçerlilik süresi, kısmi/alternatif teklif,
//     alt yüklenici, konsorsiyum, sözleşme türü, para birimi, KDV bilgisi)
//   - Kritik tarihler
//   - Geçici Teminat ve Kesin Teminat (KESİNLİKLE AYRI, asla toplanmaz)
//   - Resmi Birim Fiyat Cetveli (EK tablosu — aynen çıkarılır, yorum yapılmaz)
//
// Eski heuristic extractor'lar (summary.ts, technicalRequirements.ts,
// risks.ts, costItems.ts) KOD OLARAK SİLİNMEDİ — ama bu pipeline'dan
// ARTIK ÇAĞRILMIYORLAR. Faz 4'te gerçek LLM entegrasyonu geldiğinde, bu
// dosyalar tamamen LLM tabanlı bir yaklaşımla değiştirilecek veya
// kaldırılacaktır. Şimdilik UI bu bölümler için "Faz 4 LLM analizi ile
// doldurulacaktır" mesajı gösterir.
// ============================================================
import { normalizeText } from './normalize';
import {
  extractAdministrativeMeta,
  extractCriticalDates,
  extractFinalGuarantee,
  extractGuaranteeBankName,
  extractOfficialBillOfQuantities,
  extractTemporaryGuarantee
} from './extractors';
import { mergeAdministrativeMeta, mergeCriticalDates, mergeGuarantee } from './merge';
import type { AnalysisSection, FieldConflict, OfficialBillItem } from '@/types/tender';
import type { TenderAnalysisSection } from '@/lib/llm/sections';

export interface ParserPipelineInput {
  tenderTitle: string;
  /** İdari Şartname metni (yapıştırılmış, ham) */
  administrativeText: string | null;
  /** Teknik Şartname metni (yapıştırılmış, ham) */
  technicalText: string | null;
}

export interface ParserPipelineOutput {
  sections: TenderAnalysisSection[];
  /** Pipeline'a girilen toplam normalize edilmiş metin uzunluğu (karakter) */
  inputLength: number;
  /** Tespit edilen çelişki sayısı */
  conflictCount: number;
  /** Faz 4 LLM entegrasyonu için saklanacak ham veriler ve kesin alanlar */
  llmPrep: {
    rawAdministrativeText: string | null;
    rawTechnicalText: string | null;
    extractedFields: {
      administrativeMeta: TenderAnalysisSection['data'];
      guarantee: TenderAnalysisSection['data'];
      criticalDates: TenderAnalysisSection['data'];
    };
    officialBoqItems: OfficialBillItem[];
    llmReady: boolean;
  };
}

/**
 * İdari ve teknik şartname metinlerini analiz eder, SADECE kesin/regex ile
 * güvenilir biçimde çıkarılabilir alanları üretir. Anlam gerektiren
 * bölümler (özet, teknik yükümlülükler, risk, maliyet kırılımı) bu
 * pipeline'da ÜRETİLMEZ — Faz 4 LLM entegrasyonuna bırakılır.
 */
export async function runParserPipeline(input: ParserPipelineInput): Promise<ParserPipelineOutput> {
  const administrativeRaw = input.administrativeText ?? '';
  const technicalRaw = input.technicalText ?? '';
  const administrativeNormalized = input.administrativeText ? normalizeText(input.administrativeText) : '';
  const technicalNormalized = input.technicalText ? normalizeText(input.technicalText) : '';

  const hasAdministrative = administrativeNormalized.length > 0;
  const hasTechnical = technicalNormalized.length > 0;

  // --- 1) Kesin alanlar: idari meta, kritik tarihler ---
  const adminMeta = hasAdministrative ? extractAdministrativeMeta(administrativeNormalized).data : null;
  const techMeta = hasTechnical ? extractAdministrativeMeta(technicalNormalized).data : null;

  const adminCriticalDates = hasAdministrative ? extractCriticalDates(administrativeNormalized).data : null;
  const techCriticalDates = hasTechnical ? extractCriticalDates(technicalNormalized).data : null;

  // --- 2) Teminat: Geçici ve Kesin TAMAMEN AYRI fonksiyonlarla çıkarılır ---
  const adminTempGuarantee = hasAdministrative ? extractTemporaryGuarantee(administrativeNormalized).data : null;
  const techTempGuarantee = hasTechnical ? extractTemporaryGuarantee(technicalNormalized).data : null;
  const adminFinalGuarantee = hasAdministrative ? extractFinalGuarantee(administrativeNormalized).data : null;
  const techFinalGuarantee = hasTechnical ? extractFinalGuarantee(technicalNormalized).data : null;
  const adminBankName = hasAdministrative ? extractGuaranteeBankName(administrativeNormalized) : null;
  const techBankName = hasTechnical ? extractGuaranteeBankName(technicalNormalized) : null;

  // --- 3) Merge ---
  const conflicts: FieldConflict[] = [];

  const mergedAdminMeta = mergeAdministrativeMeta(adminMeta, techMeta, conflicts);
  const mergedCriticalDates = mergeCriticalDates(adminCriticalDates, techCriticalDates, conflicts);
  const mergedGuarantee = mergeGuarantee(
    adminTempGuarantee,
    techTempGuarantee,
    adminFinalGuarantee,
    techFinalGuarantee,
    adminBankName,
    techBankName,
    conflicts
  );

  // --- 4) Resmi Birim Fiyat Cetveli (EK tablosu) — AYNEN çıkarılır, yorum yapılmaz ---
  // Ham (normalize edilmemiş) metin üzerinde çalıştırılır — çoklu boşluk
  // sütun ayraçları normalizeText tarafından tek boşluğa indirildiği için
  // bilgi kaybı olmaması adına.
  const adminOfficialBill = administrativeRaw
    ? extractOfficialBillOfQuantities(administrativeRaw, 'idari').data.items
    : [];
  const techOfficialBill = technicalRaw
    ? extractOfficialBillOfQuantities(technicalRaw, 'teknik').data.items
    : [];
  const officialBillItems: OfficialBillItem[] = [...adminOfficialBill, ...techOfficialBill];

  const sections: TenderAnalysisSection[] = [
    toSection('administrativeMeta', { data: mergedAdminMeta, confidence: confidenceOf(mergedAdminMeta) }),
    toSection('criticalDates', { data: mergedCriticalDates, confidence: confidenceOf(mergedCriticalDates) }),
    toSection('guarantee', {
      data: mergedGuarantee,
      confidence:
        confidenceOf(mergedGuarantee.temporary) === 'found' || confidenceOf(mergedGuarantee.final) === 'found'
          ? 'found'
          : 'not_found'
    }),
    toSection('officialBillOfQuantities', {
      data: { items: officialBillItems },
      confidence: officialBillItems.length > 0 ? 'found' : 'not_found'
    }),
    toSection('conflicts', {
      data: { items: conflicts },
      confidence: conflicts.length > 0 ? 'found' : 'not_found'
    })
  ];

  const combinedLength = administrativeNormalized.length + technicalNormalized.length;

  return {
    sections,
    inputLength: combinedLength,
    conflictCount: conflicts.length,
    llmPrep: {
      rawAdministrativeText: input.administrativeText ?? null,
      rawTechnicalText: input.technicalText ?? null,
      extractedFields: {
        administrativeMeta: mergedAdminMeta,
        guarantee: mergedGuarantee,
        criticalDates: mergedCriticalDates
      },
      officialBoqItems: officialBillItems,
      llmReady: hasAdministrative || hasTechnical
    }
  };
}

/**
 * Bir merge edilmiş section objesinde en az bir alanın `value`'su
 * (null/boş olmayan) doluysa 'found' döner.
 */
function confidenceOf(mergedSection: object): 'found' | 'not_found' {
  for (const field of Object.values(mergedSection as Record<string, unknown>)) {
    if (!field || typeof field !== 'object' || !('value' in field)) continue;
    const v = (field as { value: unknown }).value;
    if (v === null || v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    return 'found';
  }
  return 'not_found';
}

function toSection<T>(
  section: AnalysisSection,
  result: { data: T; confidence: TenderAnalysisSection['confidence'] }
): TenderAnalysisSection {
  return {
    section,
    data: result.data,
    confidence: result.confidence
  };
}
