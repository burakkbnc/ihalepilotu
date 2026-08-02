import type { OfficialBillItem, TenderAnalysisLlmAnalysis } from '@/types/tender';
import type { TenderAnalysisSection } from '@/lib/llm/sections';

export interface AnalysisV2Input {
  tenderTitle: string;
  companyId: string;
  tenderId: string;
  administrativeText: string | null;
  technicalText: string | null;
  ruleBasedSections: TenderAnalysisSection[];
  parserBoqItems?: OfficialBillItem[];
}

export interface AnalysisV2Output {
  section: TenderAnalysisLlmAnalysis;
  officialBoqItems: OfficialBillItem[];
  highRiskCount: number;
  riskScore: number;
  sectionsFoundBoost: number;
}
