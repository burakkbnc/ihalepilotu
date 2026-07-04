// ============================================================
// Aşama A — Ölü Kod Temizliği: Bu barrel önceden Faz 3.5 öncesinden
// kalma, pipeline.ts tarafından ARTIK ÇAĞRILMAYAN heuristic
// extractor'ları (summary, experience, requiredDocuments,
// technicalRequirements, risks, costItems) da re-export ediyordu.
// Bu extractor'lar tüm kod tabanında (pipeline.ts, ruleBasedInsights.ts
// dahil — o da kullanılmıyordu) hiçbir yerden import edilmiyordu; dosyaları
// ile birlikte kaldırıldı. Aşağıda SADECE gerçekten kullanılan (parser
// pipeline'ının ürettiği kesin/deterministik alanlar) extractor'lar kalır.
// ============================================================
export { extractTemporaryGuarantee, extractFinalGuarantee, extractGuaranteeBankName } from './guarantee';
export type { TemporaryGuaranteeData, FinalGuaranteeData } from './guarantee';
export { extractCriticalDates } from './criticalDates';
export type { CriticalDatesData } from './criticalDates';
export { extractAdministrativeMeta } from './administrativeMeta';
export type { AdminMetaData } from './administrativeMeta';
export { extractOfficialBillOfQuantities } from './officialBillOfQuantities';
