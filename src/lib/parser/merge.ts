// ============================================================
// Merge Motoru
//
// İdari ve Teknik şartname parser sonuçlarını alan bazında birleştirir.
//
// Kurallar:
// - String alanlar: daha DETAYLI (daha uzun) olan tercih edilir.
// - Liste alanlar: BİRLEŞİM uygulanır (her iki kaynaktaki maddeler,
//   tekrarlar elenerek birleştirilir).
// - Sayısal/boolean alanlar: İDARİ ŞARTNAME ÖNCELİKLİDİR (bağlayıcı belge).
// - Çelişki: İki kaynakta da değer varsa VE değerler birbirinden
//   farklıysa (sayısal/boolean alanlarda) çelişki olarak işaretlenir.
//   String alanlarda "çelişki" kavramı uygulanmaz (biri diğerinin alt
//   kümesi/daha kısa hali olabilir) — bu nedenle çelişki sadece
//   sayısal/boolean alanlar için raporlanır.
// ============================================================
import type { DocumentSource, MergedField } from './types';

/**
 * İki sayısal/boolean değeri birleştirir. İdari öncelikli, teknik farklıysa çelişki.
 */
export function mergeScalar<T extends string | number | boolean>(
  administrativeValue: T | null,
  technicalValue: T | null
): MergedField<T | null> {
  if (administrativeValue !== null && technicalValue !== null) {
    if (administrativeValue !== technicalValue) {
      return {
        value: administrativeValue,
        source: 'administrative',
        hasConflict: true,
        conflictingValue: technicalValue,
        conflictingSource: 'technical'
      };
    }
    return { value: administrativeValue, source: 'administrative', hasConflict: false };
  }

  if (administrativeValue !== null) {
    return { value: administrativeValue, source: 'administrative', hasConflict: false };
  }

  if (technicalValue !== null) {
    return { value: technicalValue, source: 'technical', hasConflict: false };
  }

  return { value: null, source: null, hasConflict: false };
}

/**
 * İki string değeri birleştirir. Daha uzun/detaylı olan tercih edilir.
 * String alanlarda "çelişki" raporlanmaz (subjektif, ölçülebilir değil).
 */
export function mergeString(
  administrativeValue: string | null,
  technicalValue: string | null
): MergedField<string | null> {
  const adminLen = administrativeValue?.trim().length ?? 0;
  const techLen = technicalValue?.trim().length ?? 0;

  if (adminLen === 0 && techLen === 0) {
    return { value: null, source: null, hasConflict: false };
  }

  if (adminLen >= techLen && adminLen > 0) {
    return { value: administrativeValue, source: 'administrative', hasConflict: false };
  }

  return { value: technicalValue, source: 'technical', hasConflict: false };
}

/**
 * İki string listesini birleşim (union) ile birleştirir. Tekrarlar elenir
 * (case-insensitive, Türkçe karakter duyarlı karşılaştırma kullanılır).
 */
export function mergeList(administrativeList: string[], technicalList: string[]): MergedField<string[]> {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const item of [...administrativeList, ...technicalList]) {
    const key = item.trim().toLocaleLowerCase('tr-TR');
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    merged.push(item.trim());
  }

  let source: DocumentSource | null = null;
  if (administrativeList.length > 0 && technicalList.length > 0) {
    source = 'merged';
  } else if (administrativeList.length > 0) {
    source = 'administrative';
  } else if (technicalList.length > 0) {
    source = 'technical';
  }

  return { value: merged, source, hasConflict: false };
}

// ============================================================
// Bölüm Bazlı Merger'lar
//
// Her fonksiyon, idari ve teknik extractor çıktılarını (ham tipler) alır,
// MergedField'lı son hâle çevirir ve tespit edilen çelişkileri bir
// FieldConflict dizisine ekler (çağıran taraftan `conflicts` dizisi
// parametre olarak geçirilir, fonksiyon bu diziye push eder).
// ============================================================
import type { FieldConflict, AnalysisSection } from '@/types/tender';
import type { TemporaryGuaranteeData, FinalGuaranteeData } from './extractors/guarantee';
import type { CriticalDatesData } from './extractors/criticalDates';
import type { AdminMetaData } from './extractors/administrativeMeta';

/** Çelişki tespit edilirse `conflicts` dizisine okunabilir bir kayıt ekler. */
function recordConflictIfAny<T>(
  conflicts: FieldConflict[],
  section: AnalysisSection,
  fieldLabel: string,
  merged: MergedField<T>,
  formatValue: (v: T) => string
): void {
  if (merged.hasConflict && merged.conflictingValue !== undefined) {
    conflicts.push({
      section,
      fieldLabel,
      administrativeValue: formatValue(merged.value),
      technicalValue: formatValue(merged.conflictingValue)
    });
  }
}

const yesNo = (v: boolean | null) => (v === null ? 'Bilgi yok' : v ? 'Evet' : 'Hayır');
const numOrDash = (v: number | null) => (v === null ? '—' : String(v));
const strOrDash = (v: string | null) => (v === null ? '—' : v);

export function mergeGuarantee(
  adminTemp: TemporaryGuaranteeData | null,
  techTemp: TemporaryGuaranteeData | null,
  adminFinal: FinalGuaranteeData | null,
  techFinal: FinalGuaranteeData | null,
  adminBankName: string | null,
  techBankName: string | null,
  conflicts: FieldConflict[]
): NonNullable<import('@/types/tender').TenderAnalysisGuarantee['data']> {
  const at = adminTemp ?? emptyTemporaryGuarantee();
  const tt = techTemp ?? emptyTemporaryGuarantee();
  const af = adminFinal ?? emptyFinalGuarantee();
  const tf = techFinal ?? emptyFinalGuarantee();

  const temporary = {
    percent: mergeScalar(at.percent, tt.percent),
    amount: mergeScalar(at.amount, tt.amount),
    validUntil: mergeScalar(at.validUntil, tt.validUntil),
    cashAccepted: mergeScalar(at.cashAccepted, tt.cashAccepted),
    electronicAccepted: mergeScalar(at.electronicAccepted, tt.electronicAccepted),
    iban: mergeString(at.iban, tt.iban),
    recipientInstitution: mergeString(at.recipientInstitution, tt.recipientInstitution),
    accountingUnit: mergeString(at.accountingUnit, tt.accountingUnit),
    guaranteeTypes: mergeList(at.guaranteeTypes, tt.guaranteeTypes),
    sourceReference: mergeString(at.sourceReference, tt.sourceReference)
  };

  const final = {
    percent: mergeScalar(af.percent, tf.percent),
    belowThresholdPercent: mergeScalar(af.belowThresholdPercent, tf.belowThresholdPercent),
    belowThresholdCondition: mergeString(af.belowThresholdCondition, tf.belowThresholdCondition),
    sourceReference: mergeString(af.sourceReference, tf.sourceReference)
  };

  const bankName = mergeString(adminBankName, techBankName);

  // Çelişki kontrolleri — geçici ve kesin teminat AYRI AYRI kontrol edilir,
  // hiçbir koşulda birbirine eklenmez veya karıştırılmaz.
  recordConflictIfAny(conflicts, 'guarantee', 'Geçici Teminat Oranı', temporary.percent, (v) =>
    v === null ? '—' : `%${v}`
  );
  recordConflictIfAny(conflicts, 'guarantee', 'Geçici Teminat Tutarı', temporary.amount, (v) =>
    v === null ? '—' : v.toLocaleString('tr-TR') + ' TL'
  );
  recordConflictIfAny(conflicts, 'guarantee', 'Geçici Teminat Geçerlilik Tarihi', temporary.validUntil, strOrDash);
  recordConflictIfAny(conflicts, 'guarantee', 'Nakit Teminat IBAN', temporary.iban, strOrDash);
  recordConflictIfAny(conflicts, 'guarantee', 'Kesin Teminat Oranı', final.percent, (v) =>
    v === null ? '—' : `%${v}`
  );
  recordConflictIfAny(conflicts, 'guarantee', 'Sınır Değer Altı Kesin Teminat Oranı', final.belowThresholdPercent, (v) =>
    v === null ? '—' : `%${v}`
  );

  return { temporary, final, bankName };
}

function emptyTemporaryGuarantee(): TemporaryGuaranteeData {
  return {
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
}

function emptyFinalGuarantee(): FinalGuaranteeData {
  return {
    percent: null,
    belowThresholdPercent: null,
    belowThresholdCondition: null,
    sourceReference: null
  };
}

export function mergeCriticalDates(
  admin: CriticalDatesData | null,
  tech: CriticalDatesData | null,
  conflicts: FieldConflict[]
): NonNullable<import('@/types/tender').TenderAnalysisCriticalDates['data']> {
  const a = admin ?? emptyCriticalDates();
  const t = tech ?? emptyCriticalDates();

  const tenderDate = mergeScalar(a.tenderDate, t.tenderDate);
  const submissionDeadline = mergeScalar(a.submissionDeadline, t.submissionDeadline);
  const questionDeadline = mergeScalar(a.questionDeadline, t.questionDeadline);
  const temporaryGuaranteeDeadline = mergeScalar(a.temporaryGuaranteeDeadline, t.temporaryGuaranteeDeadline);
  const workStartDate = mergeScalar(a.workStartDate, t.workStartDate);
  const workEndDate = mergeScalar(a.workEndDate, t.workEndDate);
  const contractSigningPeriodDays = mergeScalar(a.contractSigningPeriodDays, t.contractSigningPeriodDays);

  recordConflictIfAny(conflicts, 'criticalDates', 'İhale Tarihi', tenderDate, strOrDash);
  recordConflictIfAny(conflicts, 'criticalDates', 'Teklif Son Teslim Tarihi', submissionDeadline, strOrDash);
  recordConflictIfAny(conflicts, 'criticalDates', 'İşin Başlangıç Tarihi', workStartDate, strOrDash);
  recordConflictIfAny(conflicts, 'criticalDates', 'İşin Bitiş Tarihi', workEndDate, strOrDash);

  return {
    tenderDate,
    submissionDeadline,
    questionDeadline,
    temporaryGuaranteeDeadline,
    workStartDate,
    workEndDate,
    contractSigningPeriodDays
  };
}

function emptyCriticalDates(): CriticalDatesData {
  return {
    tenderDate: null,
    submissionDeadline: null,
    questionDeadline: null,
    temporaryGuaranteeDeadline: null,
    workStartDate: null,
    workEndDate: null,
    contractSigningPeriodDays: null
  };
}

export function mergeAdministrativeMeta(
  admin: AdminMetaData | null,
  tech: AdminMetaData | null,
  conflicts: FieldConflict[]
): NonNullable<import('@/types/tender').TenderAnalysisAdministrativeMeta['data']> {
  const a = admin ?? emptyAdminMeta();
  const t = tech ?? emptyAdminMeta();

  const ikn = mergeString(a.ikn, t.ikn);
  const bidValidityDays = mergeScalar(a.bidValidityDays, t.bidValidityDays);
  const partialBidAllowed = mergeScalar(a.partialBidAllowed, t.partialBidAllowed);
  const alternativeBidAllowed = mergeScalar(a.alternativeBidAllowed, t.alternativeBidAllowed);
  const subcontractorAllowed = mergeScalar(a.subcontractorAllowed, t.subcontractorAllowed);
  const consortiumAllowed = mergeScalar(a.consortiumAllowed, t.consortiumAllowed);
  const domesticBidderRequirement = mergeScalar(a.domesticBidderRequirement, t.domesticBidderRequirement);
  const electronicAuction = mergeScalar(a.electronicAuction, t.electronicAuction);
  const contractType = mergeString(a.contractType, t.contractType);
  const currency = mergeString(a.currency, t.currency);
  const vatInfo = mergeString(a.vatInfo, t.vatInfo);

  recordConflictIfAny(conflicts, 'administrativeMeta', 'Teklif Geçerlilik Süresi', bidValidityDays, (v) =>
    v === null ? '—' : `${v} gün`
  );
  recordConflictIfAny(conflicts, 'administrativeMeta', 'Kısmi Teklif', partialBidAllowed, yesNo);
  recordConflictIfAny(conflicts, 'administrativeMeta', 'Alternatif Teklif', alternativeBidAllowed, yesNo);
  recordConflictIfAny(conflicts, 'administrativeMeta', 'Alt Yüklenici', subcontractorAllowed, yesNo);
  recordConflictIfAny(conflicts, 'administrativeMeta', 'Konsorsiyum', consortiumAllowed, yesNo);
  recordConflictIfAny(conflicts, 'administrativeMeta', 'Sözleşme Türü', contractType, strOrDash);

  return {
    ikn,
    bidValidityDays,
    partialBidAllowed,
    alternativeBidAllowed,
    subcontractorAllowed,
    consortiumAllowed,
    domesticBidderRequirement,
    electronicAuction,
    contractType,
    currency,
    vatInfo
  };
}

function emptyAdminMeta(): AdminMetaData {
  return {
    ikn: null,
    bidValidityDays: null,
    partialBidAllowed: null,
    alternativeBidAllowed: null,
    subcontractorAllowed: null,
    consortiumAllowed: null,
    domesticBidderRequirement: null,
    electronicAuction: null,
    contractType: null,
    currency: null,
    vatInfo: null
  };
}

/** numOrDash şu an doğrudan kullanılmıyor ama gelecekte sayısal alan
 * formatlamada tutarlılık için merge.ts'e dahil edildi. */
void numOrDash;
