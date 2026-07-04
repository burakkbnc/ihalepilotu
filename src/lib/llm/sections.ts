// ============================================================
// Parser/LLM Ortak Bölüm Tipi
// pipeline.ts tarafından üretilen, Firestore'a yazılacak
// her bir analiz bölümünün ortak şekli.
// ============================================================
import type { AnalysisSection } from '@/types/tender';
import type { ExtractionConfidence } from '@/lib/parser/types';

export type { ExtractionConfidence };

/**
 * pipeline.ts çıktısındaki her bölüm için ortak zarf.
 * `data` bölüme özel veri yapısıdır (örn. GuaranteeData, SummaryData vb.)
 * — burada `unknown` olarak tutulur, tüketen kod kendi tipine cast eder.
 */
export interface TenderAnalysisSection {
  section: AnalysisSection;
  data: unknown;
  confidence: ExtractionConfidence;
}
