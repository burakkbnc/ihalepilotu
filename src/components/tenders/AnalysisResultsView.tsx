"use client";

import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Building2,
  Calendar,
  Sparkles,
  AlertTriangle,
  Plane,
  Hotel,
  UtensilsCrossed,
  MapPin,
  ShieldCheck,
  Printer,
  Gift,
  ShieldAlert,
  Landmark,
  FileBadge2,
  Hash,
  BrainCircuit,
  Target,
} from "lucide-react";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  yesNoLabel,
} from "@/lib/tenders/format";
import { cn } from "@/lib/utils";
import {
  Card,
  Badge,
  SectionCard,
  RiskCard,
  InfoCard,
  InfoRow,
  StatusBadge,
  EmptyState,
  AccordionSection,
  ReferenceBadge,
  ChecklistItem,
  EligibilityBadge,
  MasonryGrid,
} from "@/components/ui";
import type { StatusBadgeTone } from "@/components/ui/StatusBadge";
import type { EligibilityTone } from "@/components/ui/EligibilityBadge";
import type {
  LlmAnalysisField,
  LlmExecutiveSummary,
  LlmKatilimKriteri,
  MergedField,
  TenderAnalysis,
  TenderAnalysisAdministrativeMeta,
  TenderAnalysisConflicts,
  TenderAnalysisCriticalDates,
  TenderAnalysisGuarantee,
  TenderAnalysisLlmAnalysis,
} from "@/types/tender";

function findSection<T extends TenderAnalysis>(
  sections: TenderAnalysis[],
  id: T["id"],
): T | null {
  const found = sections.find((s) => s.id === id);
  return (found as T) ?? null;
}

// ============================================================
// GÜVENLİ ERİŞİM YARDIMCILARI
//
// Firestore'daki analiz belgeleri her zaman beklenen şekilde olmayabilir:
// - Faz 3.0'da yazılmış eski belgeler düz değer (örn. string[]) içerebilir,
//   Faz 3.1 şeması ise MergedField<T> ({value, source, hasConflict}) bekler.
// - Bir extractor hatası/eksik alan nedeniyle bazı alanlar tamamen
//   undefined olabilir.
// - `data`'nın kendisi null olabilir (extractor hiç çalışmadıysa).
//
// Bu yardımcılar HER ZAMAN güvenli, render edilebilir bir sonuç döner;
// hiçbir koşulda undefined.length / undefined.value gibi bir erişim
// throw etmez. (Faz 4.1/4.2: davranış değişmedi, sadece bu dosyada taşındı.)
// ============================================================

function looksLikeMergedField(raw: unknown): raw is Record<string, unknown> {
  if (!raw || typeof raw !== "object") return false;
  const obj = raw as Record<string, unknown>;
  return "value" in obj || "source" in obj || "hasConflict" in obj;
}

function asMergedField<T>(raw: unknown, emptyValue: T): MergedField<T> {
  if (looksLikeMergedField(raw)) {
    const candidate = raw as Partial<MergedField<T>>;
    return {
      value: candidate.value ?? emptyValue,
      source: candidate.source ?? null,
      hasConflict: candidate.hasConflict ?? false,
      conflictingValue: candidate.conflictingValue,
      conflictingSource: candidate.conflictingSource,
    };
  }

  if (raw !== undefined && raw !== null) {
    return { value: raw as T, source: null, hasConflict: false };
  }

  return { value: emptyValue, source: null, hasConflict: false };
}

function readField<T>(
  data: unknown,
  key: string,
  emptyValue: T,
): MergedField<T> {
  if (!data || typeof data !== "object")
    return asMergedField<T>(undefined, emptyValue);
  return asMergedField<T>((data as Record<string, unknown>)[key], emptyValue);
}

function readArray<T>(data: unknown, key: string): T[] {
  if (!data || typeof data !== "object") return [];
  const value = (data as Record<string, unknown>)[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

const fmtPercent = (v: number | null) =>
  v === null || v === undefined ? "Tespit edilemedi" : `%${v}`;
const fmtDays = (v: number | null) =>
  v === null || v === undefined ? "Tespit edilemedi" : `${v} gün`;
const fmtYesNo = (v: boolean | null) => yesNoLabel(v ?? null);
const fmtDate = (v: string | null) => formatDate(v ?? null);
const fmtText = (v: string | null) => v ?? "Tespit edilemedi";
const fmtCurrency = (v: number | null) =>
  v === null || v === undefined ? "Tespit edilemedi" : formatCurrency(v);

const isDetectedLlmValue = (field?: LlmAnalysisField) => {
  const value = field?.value?.trim();
  return (
    !!value &&
    value !== "tespit_edilemedi" &&
    value !== "Bu alan güvenlik nedeniyle gizlendi."
  );
};
const fmtLlmText = (field?: LlmAnalysisField) =>
  isDetectedLlmValue(field) ? field!.value : "Tespit edilemedi";
const firstDetectedText = (...values: Array<string | null | undefined>) => {
  const found = values.find(
    (value) => value && value.trim() && value !== "tespit_edilemedi",
  );
  return found ?? "Tespit edilemedi";
};

/** Basit fade-in sarmalayıcı — Faz 4.2 madde 11: sade fade animasyonu. */
function FadeIn({
  children,
  delay = 0,
}: {
  children: ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
    >
      {children}
    </motion.div>
  );
}

// ============================================================
// EXECUTIVE ANALYSIS HEADER — Faz 4.2 madde 1
//
// Mevcut üst kartlar tamamen kaldırıldı. Tek premium alan: solda ihale
// kimlik bilgileri, sağda 4 operasyon KPI'ı (Kontrol Durumu, Dikkat Maddesi,
// Belge Sayısı, Teminat Bilgisi). Bu alan karar yönlendirmesi yapmaz;
// yalnızca şartnameden çıkarılan operasyonel kontrol başlıklarını gösterir.
// SADECE görsel/bilgi sunumu — hiçbir analiz/hesaplama mantığına dokunmaz.
// ============================================================

// ============================================================
// AI DEĞERLENDİRMESİ — Faz 4.5
//
// Sayfanın en üstünde, Executive Header'ın da üzerinde gösterilen
// premium tek-panel bölüm. LLM'in şartnamenin TAMAMINI değerlendirerek
// ürettiği tek-paragraf yönetici özeti + genel risk skoru (0-100).
// Backward-compat: data.executiveSummary Faz 4.5 ÖNCESİ kayıtlarda
// bulunmaz — bu durumda component hiçbir şey render etmez (null),
// sayfanın geri kalanı normal çalışır.
// ============================================================

const RISK_SEVIYESI_STYLES: Record<
  "düşük" | "orta" | "yüksek",
  { ring: string; text: string; bar: string }
> = {
  yüksek: {
    ring: "ring-danger-100",
    text: "text-danger-600",
    bar: "bg-danger-500",
  },
  orta: {
    ring: "ring-orange-100",
    text: "text-orange-600",
    bar: "bg-orange-500",
  },
  düşük: {
    ring: "ring-success-100",
    text: "text-success-600",
    bar: "bg-success-500",
  },
};

function AIDegerlendirmesi({
  summary,
}: {
  summary: LlmExecutiveSummary | undefined;
}) {
  if (!summary) return null;

  return (
    <FadeIn>
      <Card className="bg-gradient-to-br from-surface to-surface-muted p-6 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BrainCircuit
              size={16}
              strokeWidth={2}
              className="text-brand-600"
              aria-hidden
            />
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
              Operasyon Özeti
            </p>
          </div>
          <Badge variant="neutral" className="rounded-full">
            Dokümandan çıkarıldı
          </Badge>
        </div>

        <p className="mt-4 max-w-5xl text-[15px] leading-relaxed text-slate-800">
          {summary.genelOzet.value}
        </p>

        {summary.onerilenOdaklar.length > 0 && (
          <div className="mt-5 border-t border-border pt-4">
            <div className="mb-3 flex items-center gap-2">
              <Target
                size={14}
                strokeWidth={2}
                className="text-muted-foreground"
                aria-hidden
              />
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Kontrol Edilecek Başlıklar
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {summary.onerilenOdaklar.slice(0, 6).map((odak, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-border bg-surface px-3 py-2.5 text-sm leading-snug text-slate-700"
                >
                  <span className="mr-2 font-semibold text-brand-600">
                    {idx + 1}.
                  </span>
                  {odak}
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </FadeIn>
  );
}

function ExecutiveAnalysisHeader({
  tenderTitle,
  ikn,
  institutionName,
  tenderDate,
  contractType,
  analyzedAt,
}: {
  tenderTitle: string;
  ikn: string | null;
  institutionName: string | null;
  tenderDate: string | null;
  contractType: string | null;
  analyzedAt?: string | null;
}) {
  const metaItems = [
    ikn ? { icon: Hash, label: "İKN", value: ikn } : null,
    institutionName
      ? { icon: Building2, label: "İdare", value: institutionName }
      : null,
    tenderDate
      ? { icon: Calendar, label: "İhale tarihi", value: formatDate(tenderDate) }
      : null,
    contractType
      ? { icon: FileBadge2, label: "Sözleşme türü", value: contractType }
      : null,
  ].filter(Boolean) as Array<{
    icon: typeof Hash;
    label: string;
    value: string;
  }>;

  return (
    <div className="overflow-hidden rounded-[28px] border border-border bg-surface shadow-card">
      <div className="relative p-6 md:p-7">
        <div
          className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-brand-100/70 blur-3xl"
          aria-hidden
        />
        <div
          className="absolute -bottom-24 left-1/4 h-60 w-60 rounded-full bg-slate-100 blur-3xl"
          aria-hidden
        />

        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-700">
                <BrainCircuit size={13} strokeWidth={2.2} aria-hidden />
                Operasyon Analizi
              </span>
              {analyzedAt && (
                <span className="rounded-full border border-border bg-white px-3 py-1 text-xs font-medium text-muted-foreground">
                  Son analiz: {formatDateTime(analyzedAt)}
                </span>
              )}
            </div>

            <h1 className="mt-4 max-w-4xl text-2xl font-semibold leading-tight tracking-tight text-slate-950 md:text-3xl">
              {tenderTitle}
            </h1>

            {metaItems.length > 0 && (
              <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {metaItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.label}
                      className="min-w-0 rounded-2xl border border-border bg-white/80 px-3.5 py-3 shadow-sm"
                    >
                      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <Icon size={13} strokeWidth={2} aria-hidden />
                        {item.label}
                      </div>
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {item.value}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-white/85 p-4 text-sm leading-relaxed text-slate-700 shadow-sm xl:max-w-sm">
            <p className="font-semibold text-slate-900">Kapsam notu</p>
            <p className="mt-1">
              Bu ekran, dokümanlardan çıkarılan operasyonel bilgileri düzenler.
              Teklif kararı ve fiyatlandırma firmaya aittir.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}


// ============================================================
// ANA COMPONENT
// ============================================================

/**
 * Hangi alt-bölümün görünür olacağını kontrol eder — kullanıcı talebiyle
 * eklenen sekmeli ihale detay sayfası (Genel Özet/İdari/Teknik/Teminat/
 * Belgeler/AI Önerileri) bu component'in TEK BİR render akışını farklı
 * sekmelere göre filtreler. Bu, hesaplama mantığını (KPI türetme, risk
 * sayma, vb. — hepsi JSX'ten önce çalışır) KORUR, sadece JSX çıktısını
 * sekmeye göre süzer.
 */
export type AnalysisVisibleSection =
  | "genel"
  | "idari"
  | "teknik"
  | "teminat"
  | "belgeler"
  | "ai";

const ALL_SECTIONS: AnalysisVisibleSection[] = [
  "genel",
  "idari",
  "teknik",
  "teminat",
  "belgeler",
  "ai",
];

export default function AnalysisResultsView({
  sections,
  llmStatus = "not_attempted",
  llmErrorMessage = null,
  tenderId,
  tenderTitle,
  referenceNumber,
  institutionName,
  analyzedAt,
  visibleSections = ALL_SECTIONS,
}: {
  sections: TenderAnalysis[];
  /** Faz 4 LLM çağrısının sonucu — UI'ın hangi placeholder/hata mesajını göstereceğini belirler. */
  llmStatus?: "not_attempted" | "skipped_mock" | "completed" | "failed";
  llmErrorMessage?: string | null;
  tenderId: string;
  tenderTitle: string;
  referenceNumber: string | null;
  institutionName: string | null;
  /** En son analiz çalıştırmasının zamanı (analiz geçmişi için). */
  analyzedAt?: string | null;
  /** Varsayılan: tümü görünür (geriye dönük uyumlu) — sekmeli sayfa bunu daraltır. */
  visibleSections?: AnalysisVisibleSection[];
}) {
  const showGenel = visibleSections.includes("genel");
  const showIdari = visibleSections.includes("idari");
  const showTeknik = visibleSections.includes("teknik");
  const showTeminat = visibleSections.includes("teminat");
  const showBelgeler = visibleSections.includes("belgeler");
  const showAi = visibleSections.includes("ai");
  const administrativeMeta = findSection<TenderAnalysisAdministrativeMeta>(
    sections,
    "administrativeMeta",
  );
  const criticalDates = findSection<TenderAnalysisCriticalDates>(
    sections,
    "criticalDates",
  );
  const guarantee = findSection<TenderAnalysisGuarantee>(sections, "guarantee");
  const conflicts = findSection<TenderAnalysisConflicts>(sections, "conflicts");
  const llmAnalysis = findSection<TenderAnalysisLlmAnalysis>(
    sections,
    "llmAnalysis",
  );
  const amIkn = readField<string | null>(administrativeMeta?.data, "ikn", null);
  const cdTenderDate = readField<string | null>(
    criticalDates?.data,
    "tenderDate",
    null,
  );

  // --- Katılım / Teklif Kuralları (rule-based, kesin) ---
  const amPartialBid = readField<boolean | null>(
    administrativeMeta?.data,
    "partialBidAllowed",
    null,
  );
  const amAlternativeBid = readField<boolean | null>(
    administrativeMeta?.data,
    "alternativeBidAllowed",
    null,
  );
  const amSubcontractor = readField<boolean | null>(
    administrativeMeta?.data,
    "subcontractorAllowed",
    null,
  );
  const amConsortium = readField<boolean | null>(
    administrativeMeta?.data,
    "consortiumAllowed",
    null,
  );
  const amDomesticBidder = readField<boolean | null>(
    administrativeMeta?.data,
    "domesticBidderRequirement",
    null,
  );
  const amElectronicAuction = readField<boolean | null>(
    administrativeMeta?.data,
    "electronicAuction",
    null,
  );
  const hasParticipationData = [
    amPartialBid.value,
    amAlternativeBid.value,
    amSubcontractor.value,
    amConsortium.value,
    amDomesticBidder.value,
    amElectronicAuction.value,
  ].some((v) => v !== null);

  // --- Riskler (LLM) ---
  const riskler = llmAnalysis?.data?.riskler ?? [];
  const riskCounts = {
    yüksek: riskler.filter((r) => r.seviye === "yüksek").length,
    orta: riskler.filter((r) => r.seviye === "orta").length,
    düşük: riskler.filter((r) => r.seviye === "düşük").length,
  };

  // --- Gerekli Belgeler (LLM) ---
  const gerekliBelgeler = llmAnalysis?.data?.gerekliBelgeler ?? [];
  const maliYeterlilik = llmAnalysis?.data?.maliYeterlilik;
  const llmTeminat = llmAnalysis?.data?.teminatAnalizi;

  // --- Teminat (rule-based) ---
  const guaranteeData = guarantee?.data;
  const temp = guaranteeData?.temporary;
  const final = guaranteeData?.final;
  const gBankName = readField<string | null>(guaranteeData, "bankName", null);
  const tPercent = temp?.percent ?? {
    value: null,
    source: null,
    hasConflict: false,
  };
  const tAmount = temp?.amount ?? {
    value: null,
    source: null,
    hasConflict: false,
  };
  const tValidUntil = temp?.validUntil ?? {
    value: null,
    source: null,
    hasConflict: false,
  };
  const tCashAccepted = temp?.cashAccepted ?? {
    value: null,
    source: null,
    hasConflict: false,
  };
  const tElectronicAccepted = temp?.electronicAccepted ?? {
    value: null,
    source: null,
    hasConflict: false,
  };
  const tIban = temp?.iban ?? { value: null, source: null, hasConflict: false };
  const tRecipient = temp?.recipientInstitution ?? {
    value: null,
    source: null,
    hasConflict: false,
  };
  const tAccountingUnit = temp?.accountingUnit ?? {
    value: null,
    source: null,
    hasConflict: false,
  };
  const tGuaranteeTypes = temp?.guaranteeTypes ?? {
    value: [],
    source: null,
    hasConflict: false,
  };
  const tSourceRef = temp?.sourceReference ?? {
    value: null,
    source: null,
    hasConflict: false,
  };
  const fPercent = final?.percent ?? {
    value: null,
    source: null,
    hasConflict: false,
  };
  const fBelowThresholdPercent = final?.belowThresholdPercent ?? {
    value: null,
    source: null,
    hasConflict: false,
  };
  const fBelowThresholdCondition = final?.belowThresholdCondition ?? {
    value: null,
    source: null,
    hasConflict: false,
  };
  const fSourceRef = final?.sourceReference ?? {
    value: null,
    source: null,
    hasConflict: false,
  };
  const hasTemporaryGuarantee =
    [
      tPercent.value,
      tAmount.value,
      tValidUntil.value,
      tIban.value,
      tRecipient.value,
    ].some((v) => v !== null) || tGuaranteeTypes.value.length > 0;
  const hasFinalGuarantee = [fPercent.value, fBelowThresholdPercent.value].some(
    (v) => v !== null,
  );
  const hasLlmGuarantee = [
    llmTeminat?.geciciTeminatOrani,
    llmTeminat?.kesinTeminatOrani,
    llmTeminat?.teminatGecerlilikTarihi,
    llmTeminat?.nakitTeminatIban,
    llmTeminat?.aliciAdi,
    llmTeminat?.kabulEdilenTeminatTurleri,
  ].some((field) => isDetectedLlmValue(field));

  const hasGuaranteeCard =
    hasTemporaryGuarantee || hasFinalGuarantee || gBankName.value !== null || hasLlmGuarantee;

  const displayTemporaryPercent =
    tPercent.value !== null
      ? fmtPercent(tPercent.value)
      : fmtLlmText(llmTeminat?.geciciTeminatOrani);
  const displayFinalPercent =
    fPercent.value !== null
      ? fmtPercent(fPercent.value)
      : fmtLlmText(llmTeminat?.kesinTeminatOrani);
  const displayValidity = firstDetectedText(
    tValidUntil.value,
    llmTeminat?.teminatGecerlilikTarihi.value,
  );
  const displayIban = firstDetectedText(
    tIban.value,
    llmTeminat?.nakitTeminatIban.value,
  );
  const displayRecipient = firstDetectedText(
    tRecipient.value,
    llmTeminat?.aliciAdi.value,
  );
  const displayGuaranteeTypes =
    tGuaranteeTypes.value.length > 0
      ? tGuaranteeTypes.value.join(", ")
      : fmtLlmText(llmTeminat?.kabulEdilenTeminatTurleri);
  const displayHasIban = displayIban !== "Tespit edilemedi";

  // --- Kesin Yakalanan İdari Bilgiler ---
  const amBidValidityDays = readField<number | null>(
    administrativeMeta?.data,
    "bidValidityDays",
    null,
  );
  const amContractType = readField<string | null>(
    administrativeMeta?.data,
    "contractType",
    null,
  );
  const amCurrency = readField<string | null>(
    administrativeMeta?.data,
    "currency",
    null,
  );
  const amVatInfo = readField<string | null>(
    administrativeMeta?.data,
    "vatInfo",
    null,
  );
  const hasAdminMetaData = [
    amIkn.value,
    amBidValidityDays.value,
    amContractType.value,
    amCurrency.value,
    amVatInfo.value,
  ].some((v) => v !== null);

  // --- Kritik Tarihler ---
  const cdSubmissionDeadline = readField<string | null>(
    criticalDates?.data,
    "submissionDeadline",
    null,
  );
  const cdQuestionDeadline = readField<string | null>(
    criticalDates?.data,
    "questionDeadline",
    null,
  );
  const cdWorkStartDate = readField<string | null>(
    criticalDates?.data,
    "workStartDate",
    null,
  );
  const cdWorkEndDate = readField<string | null>(
    criticalDates?.data,
    "workEndDate",
    null,
  );
  const cdContractSigningPeriodDays = readField<number | null>(
    criticalDates?.data,
    "contractSigningPeriodDays",
    null,
  );

  // Çelişkiler
  const conflictItems = readArray<{
    section: string;
    fieldLabel: string;
    administrativeValue: string;
    technicalValue: string;
  }>(conflicts?.data, "items");
  const conflictCount = conflictItems.length;

  const headerNode = (
    <FadeIn>
      <ExecutiveAnalysisHeader
        tenderTitle={tenderTitle}
        ikn={amIkn.value ?? referenceNumber}
        institutionName={institutionName}
        tenderDate={cdTenderDate.value}
        contractType={amContractType.value}
        analyzedAt={analyzedAt}
      />
    </FadeIn>
  );

  if (!sections || sections.length === 0) {
    return (
      <div className="space-y-4">
        {headerNode}
        <EmptyState
          icon={Sparkles}
          message="Henüz analiz çalıştırılmadı. Dokümanlar yüklendikten sonra üstteki “Dosyaları Analiz Et” butonu ile raporu oluşturun."
        />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-5"
    >
      {showGenel && headerNode}

      {/* SPRINT 10 NOTU: Eskiden burada "Çelişkiler" başlıklı ayrı bir
          banner + kart vardı (idari/teknik değerleri YAN YANA gösteren).
          Kullanıcı talebiyle KALDIRILDI — artık LLM çelişkileri arka
          planda çözüp güncel değeri ilgili karta yazıyor; gerçekten
          çözülemeyen istisnai durumlar (varsa) ilgili özel gereklilik
          kartının açıklamasına tek cümlelik bir uyarı olarak gömülüyor.
          Kullanıcı artık iki farklı cevabı yan yana görmüyor. */}

      {/* İŞ ÖZETİ — Faz 4.2 madde 3: timeline görünümü.
          NOT: kullanıcının verdiği örnek (Türkiye Etabı -> Bosna Hersek Etabı
          -> Ulaşım -> ...) belirli bir ihale senaryosuna özgü bir illüstrasyon;
          burada sabit kodlanmaz. Akış, LLM'in iş özeti alanlarından (ne/nerede-
          ne zaman/ne sağlanacak) ve teknik yükümlülük kategorilerinden (hangileri
          gerçekten dolu ise) dinamik olarak türetilir — her ihale için doğru
          kalması için. */}
      {showGenel &&
        llmAnalysis?.data?.analizKapsami &&
        (llmAnalysis.data.analizKapsami.parcaSayisi > 1 || !llmAnalysis.data.analizKapsami.tamamiOkundu) && (
          <div
            className={cn(
              "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm",
              llmAnalysis.data.analizKapsami.tamamiOkundu
                ? "border-success-100 bg-success-50 text-success-700"
                : "border-danger-100 bg-danger-50 text-danger-700",
            )}
          >
            {llmAnalysis.data.analizKapsami.tamamiOkundu ? (
              <ShieldCheck size={16} strokeWidth={2} aria-hidden />
            ) : (
              <AlertTriangle size={16} strokeWidth={2} aria-hidden />
            )}
            <span>
              {llmAnalysis.data.analizKapsami.tamamiOkundu
                ? `Doküman büyük olduğu için ${llmAnalysis.data.analizKapsami.parcaSayisi} parçaya bölündü; ${llmAnalysis.data.analizKapsami.toplamSayfa} sayfanın tamamı analiz edildi.`
                : `${llmAnalysis.data.analizKapsami.toplamSayfa} sayfadan sadece ${llmAnalysis.data.analizKapsami.analizEdilenSayfa} sayfa analiz edilebildi — ${llmAnalysis.data.analizKapsami.toplamSayfa - llmAnalysis.data.analizKapsami.analizEdilenSayfa} sayfa analiz dışı kaldı. Eksik kalan sayfalardaki bilgiler bu analizde YOK olabilir.`}
            </span>
          </div>
        )}

      {showGenel && llmAnalysis?.data && (
        <SectionCard
          title="30 Saniyelik Özet"
          description="Bu ihalenin ne olduğunu ve ne yapmanız gerektiğini anlamak için okumanız gereken tek bölüm."
        >
          <ExecutiveTenderSummary data={llmAnalysis.data} />
        </SectionCard>
      )}

      {/* ZEYİLNAME İLE DEĞİŞEN BİLGİLER — özet kartından hemen sonra,
          katılım/teminat/riskler'den ÖNCE gösterilir. Neden en üstte:
          aşağıdaki tüm bilgilerin GÜNCEL mi yoksa zeyilname ile
          değişmiş/iptal edilmiş mi olduğunu kullanıcı önce bilmeli —
          aksi halde "teminat %3" gibi bir değeri okuyup, o değerin
          aslında bir zeyilname ile %5'e çıkarıldığını fark etmeyebilir. */}
      {(showGenel || showAi) &&
        llmAnalysis?.data &&
        (llmAnalysis.data.zeyilnameDegisiklikleri?.length ?? 0) > 0 && (
          <SectionCard
            title="⚠ Zeyilname / Düzeltme İlanı ile Değişen Bilgiler"
            description="Aşağıdaki maddeler orijinal şartnameden FARKLI — analiz, güncel (zeyilname sonrası) değeri esas almıştır."
          >
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
              {llmAnalysis.data.zeyilnameDegisiklikleri!.map((degisiklik, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "rounded-xl border p-4",
                    degisiklik.durum === "iptal_edildi"
                      ? "border-danger-100 bg-danger-50"
                      : "border-warning-100 bg-warning-50",
                  )}
                >
                  <p
                    className={cn(
                      "flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide",
                      degisiklik.durum === "iptal_edildi"
                        ? "text-danger-700"
                        : "text-warning-700",
                    )}
                  >
                    <AlertTriangle size={14} strokeWidth={2} aria-hidden />
                    {degisiklik.alan}
                    {degisiklik.durum === "iptal_edildi" && " — İPTAL EDİLDİ"}
                  </p>
                  <div className="mt-2 space-y-1 text-sm">
                    <p className="text-muted-foreground line-through decoration-danger-400">
                      Eski: {cleanFieldValue(degisiklik.orijinalDeger.value)}
                    </p>
                    <p className="font-medium text-slate-800">
                      {degisiklik.durum === "iptal_edildi" ? "Bu madde artık geçerli değil." : `Güncel: ${cleanFieldValue(degisiklik.guncelDeger.value)}`}
                    </p>
                  </div>
                  {degisiklik.zeyilnameKaynagi.value !== "tespit_edilemedi" && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Kaynak: {degisiklik.zeyilnameKaynagi.value}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </SectionCard>
        )}

      {/* KATILIM UYGUNLUĞU — Faz 4.2 madde 4: iki katmanlı yapı.
          Üst katman: 5 büyük badge (Yeşil=Uygun, Kırmızı=Yasak, Gri=Belirsiz).
          Alt katman: açıklamalar, accordion içinde, ilk açılışta kapalı. */}
      {showIdari && (
        <SectionCard
          title="Bu İhaleye Girmek İçin Ne Gerekiyor?"
          description="Teklif verebilmek için uymanız gereken katılım kuralları."
          notFound={!hasParticipationData && !llmAnalysis?.data}
        >
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
            <EligibilityBadge
              label="Yerli İstekli"
              tone={requirementTone(amDomesticBidder.value)}
            />
            <EligibilityBadge
              label="Konsorsiyum"
              tone={allowedTone(amConsortium.value)}
            />
            <EligibilityBadge
              label="Alt Yüklenici"
              tone={allowedTone(amSubcontractor.value)}
            />
            <EligibilityBadge
              label="Kısmi Teklif"
              tone={allowedTone(amPartialBid.value)}
            />
            <EligibilityBadge
              label="Elektronik Eksiltme"
              tone={allowedTone(amElectronicAuction.value)}
            />
          </div>

          <div className="mt-4">
            <AccordionSection title="Açıklamalar ve Kaynaklar">
              <div className="divide-y divide-border">
                <ParticipationRow
                  label="Yerli İstekli Şartı"
                  field={amDomesticBidder}
                  kind="requirement"
                />
                <ParticipationRow
                  label="Konsorsiyum"
                  field={amConsortium}
                  kind="allowed"
                />
                <ParticipationRow
                  label="Alt Yüklenici"
                  field={amSubcontractor}
                  kind="allowed"
                />
                <ParticipationRow
                  label="Kısmi Teklif"
                  field={amPartialBid}
                  kind="allowed"
                />
                <ParticipationRow
                  label="Alternatif Teklif"
                  field={amAlternativeBid}
                  kind="allowed"
                />
                <ParticipationRow
                  label="Elektronik Eksiltme"
                  field={amElectronicAuction}
                  kind="allowed"
                />
              </div>

              {llmAnalysis?.data && (
                <div className="mt-4 border-t border-border pt-4">
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Doküman Yorumu (İş Deneyimi dahil)
                  </h4>
                  <KatilimTable katilim={llmAnalysis.data.katilimUygunlugu} />
                </div>
              )}

              <div className="mt-4 border-t border-border pt-4">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Kritik Tarihler
                </h4>
                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                  <MergedFieldDisplay
                    label="İhale Tarihi"
                    field={cdTenderDate}
                    format={fmtDate}
                  />
                  <MergedFieldDisplay
                    label="Teklif Son Teslim Tarihi"
                    field={cdSubmissionDeadline}
                    format={fmtDate}
                  />
                  <MergedFieldDisplay
                    label="Soru Sorma Son Tarihi"
                    field={cdQuestionDeadline}
                    format={fmtDate}
                  />
                  <MergedFieldDisplay
                    label="İşin Başlangıç Tarihi"
                    field={cdWorkStartDate}
                    format={fmtDate}
                  />
                  <MergedFieldDisplay
                    label="İşin Bitiş Tarihi"
                    field={cdWorkEndDate}
                    format={fmtDate}
                  />
                  <MergedFieldDisplay
                    label="Sözleşme İmza Süresi"
                    field={cdContractSigningPeriodDays}
                    format={fmtDays}
                  />
                </div>
              </div>
            </AccordionSection>
          </div>
        </SectionCard>
      )}

      {/* SPRINT NOTU (Kullanıcı Deneyimi): "İdari Kurallar" kartı kaldırıldı
          — yukarıdaki "Bu İhaleye Girmek İçin Ne Gerekiyor?" bölümü
          (EligibilityBadge grid + Açıklamalar/Kaynaklar accordion) AYNI
          alanları (konsorsiyum, alt yüklenici, yerli istekli, elektronik
          eksiltme) zaten gösteriyordu — bu tam olarak "aynı bilgiyi
          gösteren kartları birleştir" talebiyle kaldırılan bir tekrardı. */}

      {/* EKSİK BELGELER — sprint önceliği #3 (katılımdan hemen sonra,
          teminat/iş deneyiminden ÖNCE). Faz 4.2'deki "Gerekli Belgeler"
          checklist'i buraya taşındı; hem "belgeler" sekmesinde hem de
          "genel" (5 dakikalık özet) akışında gösterilir. */}
      {showBelgeler && llmAnalysis?.data && (
        <AccordionSection
          title="Eksik Belgeler"
          badge={
            gerekliBelgeler.length > 0
              ? `${gerekliBelgeler.length} belge`
              : undefined
          }
          defaultOpen
        >
          {gerekliBelgeler.length > 0 ? (
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
              {gerekliBelgeler.map((belge, idx) => (
                <ChecklistItem
                  key={idx}
                  belgeAdi={belge.belgeAdi}
                  zorunlu={inferZorunluFromText(belge.durum.value)}
                  aciklama={
                    belge.durum.value === "tespit_edilemedi"
                      ? "Tespit edilemedi"
                      : belge.durum.value
                  }
                  kaynak={
                    belge.kaynak.value !== "tespit_edilemedi"
                      ? belge.kaynak.value
                      : null
                  }
                />
              ))}
            </div>
          ) : (
            <EmptyState message="Tespit edilemedi" />
          )}
        </AccordionSection>
      )}

      {showIdari && maliYeterlilik && (
        <SectionCard
          title="İş Deneyimi İçin Hazırlık"
          description="Teklif vermeden önce hazırlamanız gereken iş deneyimi ve mali yeterlilik belgeleri."
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
            <InfoCard title="İş Deneyimi">
              <LlmFieldBlock
                label="Oran"
                field={maliYeterlilik.isDeneyimiOrani}
              />
            </InfoCard>
            <InfoCard title="Ciro Yeterliliği">
              <LlmFieldBlock
                label="Oran"
                field={maliYeterlilik.ciroYeterliligiOrani}
              />
            </InfoCard>
            <InfoCard title="Bilanço">
              <LlmFieldBlock label="Şart" field={maliYeterlilik.bilancoSarti} />
            </InfoCard>
            <InfoCard title="Gelir Tablosu">
              <LlmFieldBlock
                label="Şart"
                field={maliYeterlilik.gelirTablosuSarti}
              />
            </InfoCard>
            <InfoCard title="Banka Referansı">
              <LlmFieldBlock
                label="Şart"
                field={maliYeterlilik.bankaReferansSarti}
              />
            </InfoCard>
          </div>
        </SectionCard>
      )}

      {/* TEMİNAT ANALİZİ — Faz 4.2 madde 5: 4 bilgi kartı + IBAN vurgulu
          kart, "banka ekranı hissi". */}
      {showTeminat && (
        <SectionCard
          title="Teminat Hazırlığı"
          description={teminatActionSentence(
            displayTemporaryPercent,
            displayFinalPercent,
            displayValidity,
          )}
          notFound={!hasGuaranteeCard}
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            <InfoCard title="Geçici Teminat">
              <InfoRow label="Oran" value={displayTemporaryPercent} />
              <InfoRow label="Tutar" value={fmtCurrency(tAmount.value)} />
            </InfoCard>
            <InfoCard title="Kesin Teminat">
              <InfoRow label="Oran" value={displayFinalPercent} />
              {fBelowThresholdPercent.value !== null && (
                <InfoRow
                  label="Sınır Altı Özel Oran"
                  value={`%${fBelowThresholdPercent.value}`}
                />
              )}
            </InfoCard>
            <InfoCard title="Geçerlilik Tarihi">
              <InfoRow label="Geçici Teminat" value={displayValidity} />
            </InfoCard>
            <InfoCard title="Teminat Türleri">
              {tGuaranteeTypes.value.length > 0 ? (
                <InfoRow label="Kabul Edilen" value={displayGuaranteeTypes} />
              ) : (
                <InfoRow label="Kabul Edilen" value={displayGuaranteeTypes} />
              )}
              <InfoRow
                label="Nakit Kabulü"
                value={fmtYesNo(tCashAccepted.value)}
              />
              <InfoRow
                label="Elektronik Kabulü"
                value={fmtYesNo(tElectronicAccepted.value)}
              />
              <InfoRow label="Alıcı Adı" value={displayRecipient} />
              <InfoRow label="IBAN" value={displayIban} />
            </InfoCard>
          </div>

          {fBelowThresholdCondition.value && (
            <div className="mt-3 rounded-xl border border-warning-100 bg-warning-50 p-4">
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-warning-700">
                Sınır Değer Altı Koşulu
              </h4>
              <p className="text-sm text-slate-800">
                {fBelowThresholdCondition.value}
              </p>
            </div>
          )}

          {/* IBAN — özel vurgulu "banka ekranı" kartı */}
          {displayHasIban && (
            <div className="mt-3 rounded-xl border border-brand-200 bg-gradient-to-br from-brand-900 to-brand-700 p-5 text-white shadow-card">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-100">
                <Landmark size={14} strokeWidth={2} aria-hidden />
                Nakit Teminat IBAN
              </div>
              <p className="mt-2 font-mono text-lg tracking-wide">
                {displayIban}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-brand-100">
                {displayRecipient !== "Tespit edilemedi" && (
                  <span>Alıcı: {displayRecipient}</span>
                )}
                {tAccountingUnit.value && (
                  <span>Muhasebe Birimi: {tAccountingUnit.value}</span>
                )}
                {gBankName.value && <span>Banka: {gBankName.value}</span>}
              </div>
            </div>
          )}

          {tSourceRef.value && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Kaynak:</span>
              <ReferenceBadge reference={tSourceRef.value} />
              {fSourceRef.value && fSourceRef.value !== tSourceRef.value && (
                <ReferenceBadge reference={fSourceRef.value} />
              )}
            </div>
          )}

          {/* LLM Teminat Özeti — ek faktüel alanlar */}
          {llmAnalysis?.data && (
            <div className="mt-4 border-t border-border pt-4">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                LLM Teminat Özeti
              </h4>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <LlmFieldBlock
                  label="Geçici Teminat Oranı"
                  field={llmAnalysis.data.teminatAnalizi.geciciTeminatOrani}
                />
                <LlmFieldBlock
                  label="Kesin Teminat Oranı"
                  field={llmAnalysis.data.teminatAnalizi.kesinTeminatOrani}
                />
                <LlmFieldBlock
                  label="Teminat Geçerlilik Tarihi"
                  field={
                    llmAnalysis.data.teminatAnalizi.teminatGecerlilikTarihi
                  }
                />
                <LlmFieldBlock
                  label="Nakit Teminat IBAN"
                  field={llmAnalysis.data.teminatAnalizi.nakitTeminatIban}
                />
                <LlmFieldBlock
                  label="Alıcı Adı"
                  field={llmAnalysis.data.teminatAnalizi.aliciAdi}
                />
                <LlmFieldBlock
                  label="Kabul Edilen Teminat Türleri"
                  field={
                    llmAnalysis.data.teminatAnalizi.kabulEdilenTeminatTurleri
                  }
                />
                <LlmFieldBlock
                  label="Ceza Oranları"
                  field={llmAnalysis.data.teminatAnalizi.cezaOranlari}
                />
              </div>
            </div>
          )}
        </SectionCard>
      )}

      {/* Kesin Yakalanan İdari Bilgiler */}
      {showIdari && (
        <SectionCard
          title="Kesin Yakalanan İdari Bilgiler"
          description="Şartnameden doğrudan ve kesin olarak okunan alanlar."
          notFound={!hasAdminMetaData}
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <MergedFieldDisplay
              label="İhale Kayıt Numarası (İKN)"
              field={amIkn}
              format={fmtText}
            />
            <MergedFieldDisplay
              label="Teklif Geçerlilik Süresi"
              field={amBidValidityDays}
              format={fmtDays}
            />
            <MergedFieldDisplay
              label="Sözleşme Türü"
              field={amContractType}
              format={fmtText}
            />
            <MergedFieldDisplay
              label="Teklif Para Birimi"
              field={amCurrency}
              format={fmtText}
            />
            <div className="sm:col-span-2">
              <MergedFieldDisplay
                label="KDV Bilgisi"
                field={amVatInfo}
                format={fmtText}
              />
            </div>
          </div>
        </SectionCard>
      )}

      {/* RİSK MERKEZİ — Faz 4.2 madde 6 */}
      {showGenel && llmAnalysis?.data && (
        <SectionCard
          title="Dikkat Edilecek Maddeler"
          description="Şartnamede ayrıca kontrol edilmesi gereken başlıklar. Bu alan karar veya fiyat önerisi üretmez."
        >
          <div className="mb-4 grid grid-cols-3 gap-3">
            <RiskCountChip
              label="Yüksek Öncelik"
              count={riskCounts.yüksek}
              tone="danger"
            />
            <RiskCountChip
              label="Orta Öncelik"
              count={riskCounts.orta}
              tone="orange"
            />
            <RiskCountChip
              label="Düşük Öncelik"
              count={riskCounts.düşük}
              tone="success"
            />
          </div>

          {riskler.length > 0 ? (
            <div className="space-y-2.5">
              {riskler.map((risk, idx) => (
                <FadeIn key={idx} delay={idx * 0.03}>
                  <RiskCard
                    baslik={risk.baslik}
                    seviye={risk.seviye}
                    aciklama={
                      risk.aciklama.value === "tespit_edilemedi"
                        ? "Tespit edilemedi"
                        : risk.aciklama.value
                    }
                    kaynak={
                      risk.kaynak.value !== "tespit_edilemedi"
                        ? risk.kaynak.value
                        : null
                    }
                    riskSkoru={risk.riskSkoru}
                    etki={risk.etki}
                    olasilik={risk.olasilik}
                  />
                </FadeIn>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={ShieldCheck}
              message="Bu şartname için ayrıca vurgulanacak bir dikkat maddesi tespit edilmedi."
            />
          )}
        </SectionCard>
      )}

      {/* TEKNİK YÜKÜMLÜLÜKLER — Faz 4.2 madde 7: en önemli bölüm.
          Accordion (kapalı başlar, başlıkta toplam kategori sayısı),
          açıldığında masonry grid (eşit yükseklik ZORLANMAZ). */}
      {showTeknik && llmAnalysis?.data && (
        <AccordionSection
          title="Teknik Yükümlülükler"
          badge={`${countNonEmptyCategories(llmAnalysis.data.teknikYukumlulukler)} kategori`}
          defaultOpen
        >
          <MasonryGrid>
            {getTeknikKategoriCards(llmAnalysis.data.teknikYukumlulukler).map((category, idx) => (
              <TeknikKategoriCard
                key={`${category.label}-${idx}`}
                icon={category.icon}
                label={category.label}
                items={category.items}
                source={category.source}
              />
            ))}
          </MasonryGrid>
        </AccordionSection>
      )}

      {/* ÖZEL GEREKLİLİK KARTLARI — sabit kategori listesi YOK; LLM
          dokümana özgü, teklif/maliyet/operasyon/yeterlilik etkisi olan
          standart-dışı hükümleri kendi başlıklarıyla üretir (ör.
          personel/sertifika şartları, gezi günü dışarıda yemek verilmesi
          gibi BFC kalemini değiştiren özel hükümler vb.). Amaç: kullanıcı
          PDF'e dönmeden, kaçırılması pahalıya mal olacak özel hükümleri
          görebilsin. */}
      {showTeknik &&
        llmAnalysis?.data &&
        (llmAnalysis.data.ozelGereklilikler?.length ?? 0) > 0 && (
          <AccordionSection
            title="Özel Gereklilikler ve Maliyet Etkileri"
            badge={`${llmAnalysis.data.ozelGereklilikler!.length} kart`}
            defaultOpen
          >
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {llmAnalysis.data.ozelGereklilikler!.map((kart, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "rounded-2xl border p-4",
                    kart.onemDerecesi === "kritik"
                      ? "border-danger-100 bg-danger-50/60"
                      : kart.onemDerecesi === "orta"
                        ? "border-warning-100 bg-warning-50/60"
                        : "border-border bg-surface-muted",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {kart.kategoriTipi}
                      </p>
                      <p className="mt-0.5 text-sm font-semibold text-slate-900">
                        {kart.baslik}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                        kart.onemDerecesi === "kritik" &&
                          "bg-danger-100 text-danger-700",
                        kart.onemDerecesi === "orta" &&
                          "bg-warning-100 text-warning-700",
                        kart.onemDerecesi === "dusuk" &&
                          "bg-surface text-muted-foreground",
                      )}
                    >
                      {kart.onemDerecesi === "kritik"
                        ? "Kritik"
                        : kart.onemDerecesi === "orta"
                          ? "Orta"
                          : "Düşük"}
                    </span>
                  </div>

                  {kart.aciklama.value !== "tespit_edilemedi" && (
                    <p className="mt-2 text-sm text-slate-700">
                      {kart.aciklama.value}
                    </p>
                  )}

                  <div className="mt-3 space-y-1.5 text-xs">
                    {kart.teklifEtkisi.value !== "tespit_edilemedi" && (
                      <p>
                        <span className="font-medium text-slate-600">
                          Teklife etkisi:{" "}
                        </span>
                        <span className="text-muted-foreground">
                          {kart.teklifEtkisi.value}
                        </span>
                      </p>
                    )}
                    {kart.maliyetEtkisi.value !== "tespit_edilemedi" && (
                      <p>
                        <span className="font-medium text-slate-600">
                          Maliyete etkisi:{" "}
                        </span>
                        <span className="text-muted-foreground">
                          {kart.maliyetEtkisi.value}
                        </span>
                      </p>
                    )}
                    {kart.operasyonEtkisi.value !== "tespit_edilemedi" && (
                      <p>
                        <span className="font-medium text-slate-600">
                          Operasyona etkisi:{" "}
                        </span>
                        <span className="text-muted-foreground">
                          {kart.operasyonEtkisi.value}
                        </span>
                      </p>
                    )}
                  </div>

                  {kart.gerekliBelgeler.length > 0 && (
                    <div className="mt-3">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Gerekli belgeler
                      </p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-700">
                        {kart.gerekliBelgeler.map((belge, bIdx) => (
                          <li key={bIdx}>{belge}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {kart.ilgiliKalemler.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {kart.ilgiliKalemler.map((kalem, kIdx) => (
                        <span
                          key={kIdx}
                          className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700"
                        >
                          {kalem}
                        </span>
                      ))}
                    </div>
                  )}

                  {kart.kullaniciAksiyonu.value !== "tespit_edilemedi" && (
                    <p className="mt-3 rounded-lg bg-white/70 px-2.5 py-2 text-xs font-medium text-slate-800">
                      ✓ {kart.kullaniciAksiyonu.value}
                    </p>
                  )}

                  {kart.kaynak.value !== "tespit_edilemedi" && (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Kaynak: {kart.kaynak.value}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </AccordionSection>
        )}

      {/* GEREKLİ BELGELER artık yukarıda "Eksik Belgeler" olarak (Katılım'dan
          hemen sonra) gösteriliyor — sprint önceliği #3. Burada tekrar
          render edilmiyor (duplicate önleme). */}

      {/* SPRINT 10 NOTU: "Çelişkiler (AI)" ayrı bölümü KALDIRILDI. LLM
          artık çelişkileri arka planda çözüp güncel/geçerli değeri
          ilgili alana yazıyor; gerçekten çözemediği istisnai durumlarda
          bunu ilgili özel gereklilik kartının açıklamasına tek cümlelik
          bir uyarı olarak gömüyor (bkz. llmAnalysis.ts "ÇELİŞKİ ÇÖZÜMLEME
          KURALI"). celiskiler alanı şemada iç kayıt amaçlı kalmaya devam
          ediyor ama kullanıcıya AYRI bir liste olarak gösterilmiyor. */}

      {/* TEKLİF HAZIRLIK KONTROL LİSTESİ — sprint önceliği: analiz
          ekranının sonunda TEK bir "iş takip ekranı" kontrol listesi. */}
      {showGenel && llmAnalysis?.data && (
        <ActionChecklist data={llmAnalysis.data} />
      )}

      {(showAi || showGenel) && !llmAnalysis?.data && llmStatus !== "failed" && (
        <SectionCard title="Analiz Durumu">
          <EmptyState
            icon={Sparkles}
            message={
              llmStatus === "skipped_mock"
                ? "Bu ihale için otomatik analiz şu anda tamamlanamadı. Lütfen analizi tekrar çalıştırın; sorun devam ederse destek ekibiyle iletişime geçin."
                : "Analiz sonuçları hazır olduğunda bu alanlar doldurulacaktır."
            }
          />
        </SectionCard>
      )}

      {(showAi || showGenel) && llmStatus === "failed" && (
        <SectionCard title="Analiz Durumu">
          <div className="space-y-2 rounded-lg border border-danger-100 bg-danger-50 p-4 text-sm text-danger-700">
            <p className="flex items-center gap-1.5 font-medium">
              <ShieldAlert size={16} strokeWidth={2} aria-hidden />
              Analiz tamamlanamadı
            </p>
            <p>
              Bu ihale için analiz şu anda tamamlanamadı. Lütfen tekrar deneyin;
              sorun devam ederse destek ekibiyle iletişime geçin. Diğer
              bölümlerdeki (idari bilgiler, teminat, kritik tarihler, resmi
              cetvel) bilgiler bu durumdan etkilenmedi.
            </p>
          </div>
        </SectionCard>
      )}

      {(showAi || showGenel) && llmAnalysis?.data && (
        <p className="text-xs text-muted-foreground">
          Bu özet şartnamede açıkça yazan bilgilere dayanır; maliyet tahmini,
          teklif fiyatı önerisi veya ihaleye girme/girmeme yorumu içermez.
        </p>
      )}
    </motion.div>
  );
}

// ============================================================
// YARDIMCI RENDER BİLEŞENLERİ
// ============================================================

/**
 * Bir MergedField'ı render eder: değer + (varsa) çelişki uyarısı.
 * Değer boşsa hiçbir şey render etmez.
 */
function MergedFieldDisplay<T>({
  label,
  field,
  format,
}: {
  label: string;
  field: MergedField<T> | null | undefined;
  format: (v: T) => ReactNode;
}) {
  const safeField = field ?? {
    value: null as unknown as T,
    source: null,
    hasConflict: false,
  };
  const value = safeField.value;

  const isEmpty =
    value === null ||
    value === undefined ||
    (Array.isArray(value) && value.length === 0);
  if (isEmpty) return null;

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="flex flex-wrap items-center text-sm text-slate-700">
        {format(value)}
        {safeField.hasConflict && (
          <Badge variant="danger" className="ml-2">
            <AlertTriangle size={10} strokeWidth={2.5} aria-hidden />
            Çelişki Tespit Edildi
          </Badge>
        )}
      </span>
    </div>
  );
}

/**
 * SPRINT NOTU (Kullanıcı Deneyimi): Ham değeri ("%3") göstermek yerine
 * kullanıcıya YAPILACAK İŞİ söyleyen bir cümle üretir (ör. "Teklif
 * vermeden önce %3 oranındaki geçici teminatı hazırlamalısınız."). Bu bir
 * yeni analiz/çıkarım DEĞİLDİR — zaten çıkarılmış olan oran/tarih
 * değerlerinin sunum katmanında yeniden ifade edilmesidir.
 */
function teminatActionSentence(
  temporaryPercent: string,
  finalPercent: string,
  validity: string,
): string {
  const parts: string[] = [];
  if (temporaryPercent !== "Tespit edilemedi") {
    parts.push(`Teklif vermeden önce ${temporaryPercent} oranındaki geçici teminatı hazırlayın`);
  }
  if (finalPercent !== "Tespit edilemedi") {
    parts.push(`sözleşme aşamasında ${finalPercent} oranındaki kesin teminatı unutmayın`);
  }
  if (parts.length === 0) {
    return "Şartnamede net bir teminat şartı tespit edilemedi; idareye sormanız önerilir.";
  }
  const sentence = `${parts.join(", ")}.`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/** Ham teknik "tespit_edilemedi" değerinin kullanıcıya çıplak şekilde
    gösterilmesini engeller — temiz bir "—" gösterir. */
function cleanFieldValue(value: string): string {
  return value === "tespit_edilemedi" ? "—" : value;
}

/** "İzin var mı" tipi alanlar: true -> uygun, false -> yasak, null -> belirsiz. */
function allowedTone(v: boolean | null): EligibilityTone {
  if (v === null) return "belirsiz";
  return v ? "uygun" : "yasak";
}

/** "Şart var mı" tipi alanlar: true -> şart konmuş (kısıtlayıcı, "yasak" rengiyle gösterilir), false -> şart yok (serbest). */
function requirementTone(v: boolean | null): EligibilityTone {
  if (v === null) return "belirsiz";
  return v ? "yasak" : "uygun";
}

const PARTICIPATION_TONE: Record<
  "allowed" | "requirement",
  (v: boolean) => StatusBadgeTone
> = {
  allowed: (v) => (v ? "uygun" : "yasak"),
  requirement: (v) => (v ? "zorunlu" : "uygun"),
};

/** Katılım/Teklif Kuralları satırı (accordion içindeki açıklama katmanı). */
function ParticipationRow({
  label,
  field,
  kind,
}: {
  label: string;
  field: MergedField<boolean | null>;
  kind: "allowed" | "requirement";
}) {
  const tone: StatusBadgeTone =
    field.value === null ? "belirsiz" : PARTICIPATION_TONE[kind](field.value);
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-sm text-slate-700">{label}</span>
      <StatusBadge tone={tone} />
    </div>
  );
}

const RISK_CHIP_STYLES: Record<"danger" | "orange" | "success", string> = {
  danger: "border-danger-100 bg-danger-50 text-danger-700",
  orange: "border-orange-100 bg-orange-50 text-orange-700",
  success: "border-success-100 bg-success-50 text-success-700",
};

/** Dikkat maddeleri üst özet sayacı (Yüksek/Orta/Düşük Öncelik). */
function RiskCountChip({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "danger" | "orange" | "success";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2.5 text-center",
        RISK_CHIP_STYLES[tone],
      )}
    >
      <p className="text-xl font-semibold leading-none">{count}</p>
      <p className="mt-1 text-xs font-medium">{label}</p>
    </div>
  );
}

interface KatilimTableData {
  yerliIstekliSarti: LlmKatilimKriteri;
  konsorsiyum: LlmKatilimKriteri;
  altYuklenici: LlmKatilimKriteri;
  kismiTeklif: LlmKatilimKriteri;
  elektronikEksiltme: LlmKatilimKriteri;
  isDeneyimi: LlmKatilimKriteri;
}

/**
 * LLM'in katılım ve teklif kuralları checklist tablosu. Sonuçlar serbest metin
 * olduğu için (boolean değil), tone metin içeriğine göre tahmin edilir.
 */
function inferToneFromText(value: string): StatusBadgeTone {
  if (value === "tespit_edilemedi") return "belirsiz";
  const lower = value.toLocaleLowerCase("tr-TR");
  if (/(yasak|verilemez|yapılamaz|kabul edilmez|izin verilmiyor)/.test(lower))
    return "yasak";
  if (/(zorunlu|şarttır|gereklidir|istenmektedir)/.test(lower))
    return "zorunlu";
  if (
    /(verilebilir|yapılabilir|serbest|uygundur|kabul edilir|izin veril)/.test(
      lower,
    )
  )
    return "uygun";
  return "dikkat";
}

/**
 * Gerekli Belgeler şemasında ayrı bir "zorunlu" boolean alanı yok —
 * LLM'in `durum` metninden çıkarsanır (örn. "zorunludur/istenmektedir"
 * -> true, "isteğe bağlı/opsiyonel" -> false, aksi halde bilinmiyor).
 */
function inferZorunluFromText(durum: string): boolean | null {
  if (durum === "tespit_edilemedi") return null;
  const lower = durum.toLocaleLowerCase("tr-TR");
  if (/(isteğe bağlı|opsiyonel|gerekmiyor|istenmiyor)/.test(lower))
    return false;
  if (
    /(zorunlu|şarttır|gereklidir|istenmektedir|sunulmalıdır|ibraz edilmelidir)/.test(
      lower,
    )
  )
    return true;
  return null;
}

function KatilimTable({ katilim }: { katilim: KatilimTableData }) {
  const rows: LlmKatilimKriteri[] = [
    katilim.yerliIstekliSarti,
    katilim.konsorsiyum,
    katilim.altYuklenici,
    katilim.kismiTeklif,
    katilim.elektronikEksiltme,
    katilim.isDeneyimi,
  ];

  return (
    <div className="divide-y divide-border">
      {rows.map((row) => (
        <div
          key={row.kriter}
          className="flex flex-wrap items-center justify-between gap-2 py-2.5"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-700">{row.kriter}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {row.sonuc.flagged ? (
                <span className="flex items-center gap-1 text-warning-700">
                  <ShieldAlert size={11} strokeWidth={2} aria-hidden />{" "}
                  {row.sonuc.value}
                </span>
              ) : row.sonuc.value === "tespit_edilemedi" ? (
                "Tespit edilemedi"
              ) : (
                row.sonuc.value
              )}
            </p>
            {row.kaynak.value !== "tespit_edilemedi" && (
              <div className="mt-1">
                <ReferenceBadge reference={row.kaynak.value} />
              </div>
            )}
          </div>
          {!row.sonuc.flagged && (
            <StatusBadge tone={inferToneFromText(row.sonuc.value)} />
          )}
        </div>
      ))}
    </div>
  );
}

/** Teknik Yükümlülükler kategori kartı — ikonlu, masonry içinde içerik kadar büyür, max 4 madde + devamını göster. */
function TeknikKategoriCard({
  icon: Icon,
  label,
  items,
  source,
}: {
  icon: typeof Plane;
  label: string;
  items: string[];
  source?: string | null;
}) {
  const VISIBLE_LIMIT = 7;
  const [showAll, setShowAll] = useState(false);
  const visibleItems = showAll ? items : items.slice(0, VISIBLE_LIMIT);
  const hasMore = items.length > VISIBLE_LIMIT;

  return (
    <div className="rounded-lg border border-border bg-surface-muted p-3">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-50">
          <Icon
            size={14}
            strokeWidth={2.25}
            className="text-brand-600"
            aria-hidden
          />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          {source && <p className="text-[11px] text-muted-foreground">{source}</p>}
        </div>
      </div>
      {items.length > 0 ? (
        <>
          <ul className="space-y-0.5">
            {visibleItems.map((item, idx) => (
              <li
                key={idx}
                className="flex gap-1.5 text-[13px] leading-snug text-slate-700"
              >
                <span className="text-muted-foreground" aria-hidden>
                  •
                </span>
                {item}
              </li>
            ))}
          </ul>
          {hasMore && (
            <button
              type="button"
              onClick={() => setShowAll((s) => !s)}
              className="mt-1.5 text-[11px] font-medium text-brand-600 hover:underline"
            >
              {showAll
                ? "Daha az göster"
                : `Devamını göster (${items.length - VISIBLE_LIMIT})`}
            </button>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Tespit edilemedi</p>
      )}
    </div>
  );
}

/** Faktüel LLM alanı (Teminat Analizi gibi) — flagged ise güvenlik filtresi uyarısı gösterir. */
function LlmFieldBlock({
  label,
  field,
}: {
  label: string;
  field?: LlmAnalysisField;
}) {
  const safeField = field ?? { value: "tespit_edilemedi" };
  const isNotDetected = safeField.value === "tespit_edilemedi";

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {safeField.flagged ? (
        <span className="flex items-center gap-1.5 text-sm text-warning-700">
          <ShieldAlert size={14} strokeWidth={2} aria-hidden />
          {safeField.value}
        </span>
      ) : (
        <span
          className={cn(
            "text-sm",
            isNotDetected ? "text-muted-foreground" : "text-slate-700",
          )}
        >
          {isNotDetected ? "Tespit edilemedi" : safeField.value}
        </span>
      )}
      {!isNotDetected && safeField.kaynak && (
        <span className="text-[11px] text-muted-foreground">
          Kaynak: {safeField.kaynak}
        </span>
      )}
    </div>
  );
}

interface TeknikYukumlulukKategoriData {
  baslik: string;
  maddeler: string[];
  kaynak?: string | null;
}

interface TeknikYukumluluklerData {
  kategoriler?: TeknikYukumlulukKategoriData[];
  ulasim: string[];
  konaklama: string[];
  yemek: string[];
  rehberlik: string[];
  sigorta: string[];
  baskiGorunurluk: string[];
  hediyelikIkram: string[];
}

/** Accordion başlığındaki "N kategori" rozeti için — sadece dolu kategorileri sayar. */
function countNonEmptyCategories(data: TeknikYukumluluklerData): number {
  const dynamicCategories = data.kategoriler?.filter((category) => Array.isArray(category.maddeler) && category.maddeler.length > 0) ?? [];
  if (dynamicCategories.length > 0) return dynamicCategories.length;

  return LEGACY_TEKNIK_KATEGORI_LABELS.filter(({ key }) => {
    const arr = data[key];
    return Array.isArray(arr) && arr.length > 0;
  }).length;
}

interface IsOzetiData {
  buIsNe: LlmAnalysisField;
  neredeNeZaman: LlmAnalysisField;
  yukleniciNeSaglayacak: LlmAnalysisField;
}

interface LlmAnalysisDataForTimeline {
  isOzeti: IsOzetiData;
  teknikYukumlulukler: TeknikYukumluluklerData;
  executiveSummary?: LlmExecutiveSummary;
}

const LEGACY_TEKNIK_KATEGORI_LABELS: Array<{
  key: Exclude<keyof TeknikYukumluluklerData, "kategoriler">;
  label: string;
  icon: typeof Plane;
}> = [
  { key: "ulasim", label: "Ulaşım", icon: Plane },
  { key: "konaklama", label: "Konaklama", icon: Hotel },
  { key: "yemek", label: "Yemek", icon: UtensilsCrossed },
  { key: "rehberlik", label: "Rehberlik", icon: MapPin },
  { key: "sigorta", label: "Sigorta", icon: ShieldCheck },
  { key: "baskiGorunurluk", label: "Baskı / Görünürlük", icon: Printer },
  { key: "hediyelikIkram", label: "Hediyelik / İkram", icon: Gift },
];

function getTeknikKategoriCards(data: TeknikYukumluluklerData): Array<{
  label: string;
  items: string[];
  source?: string | null;
  icon: typeof Plane;
}> {
  const dynamicCategories = data.kategoriler?.filter((category) => Array.isArray(category.maddeler) && category.maddeler.length > 0) ?? [];
  if (dynamicCategories.length > 0) {
    return dynamicCategories.map((category) => ({
      label: category.baslik,
      items: category.maddeler,
      source: category.kaynak ?? null,
      icon: Sparkles,
    }));
  }

  return LEGACY_TEKNIK_KATEGORI_LABELS.map(({ key, label, icon }) => ({
    label,
    icon,
    items: data[key],
  }));
}

function fieldValue(field?: LlmAnalysisField): string | null {
  if (!field?.value || field.value === "tespit_edilemedi") return null;
  return field.value;
}

/**
 * SPRINT NOTU (Kullanıcı Deneyimi — "iş takip ekranı"): Analiz ekranının
 * SONUNDA, dokümanları farklı sekmelerde arama ihtiyacını ortadan
 * kaldıran, teklif hazırlayan kişinin kullanacağı TEK bir kontrol
 * listesi. Mevcut analiz verisinden (yeni bir çıkarım/analiz YAPILMADAN)
 * sentezlenir. Kontrol kutuları bu oturum için yerel state'te tutulur
 * (Firestore'a kaydedilmez) — kalıcı hale getirmek istenirse ayrı bir
 * geliştirme olarak ele alınmalı.
 */
function ActionChecklist({
  data,
}: {
  data: NonNullable<TenderAnalysisLlmAnalysis["data"]>;
}) {
  const items: string[] = [];

  const documents = (data.gerekliBelgeler ?? [])
    .map((b) => b.belgeAdi)
    .filter(Boolean)
    .slice(0, 6);
  for (const belgeAdi of documents) {
    items.push(`${belgeAdi} hazır`);
  }

  if (fieldValue(data.teminatAnalizi?.geciciTeminatOrani)) {
    items.push("Geçici teminat hazır");
  }
  if (fieldValue(data.maliYeterlilik?.isDeneyimiOrani)) {
    items.push("İş deneyim belgesi hazır");
  }
  items.push("Fiyat çalışması tamamlandı");
  items.push("Birim fiyat cetveli kontrol edildi");
  items.push("Teslim ve teklif tarihleri kontrol edildi");
  if ((data.riskler ?? []).length > 0) {
    items.push("Dikkat edilecek maddeler gözden geçirildi");
  }
  if ((data.zeyilnameDegisiklikleri ?? []).length > 0) {
    items.push("Zeyilname/düzeltme ilanı ile değişen maddeler gözden geçirildi");
  }

  const [checked, setChecked] = useState<Set<number>>(new Set());

  const toggle = (idx: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  if (items.length === 0) return null;

  return (
    <SectionCard
      title="Teklif Hazırlık Kontrol Listesi"
      description="Teklifi göndermeden önce aşağıdakileri tamamladığınızdan emin olun."
    >
      <div className="space-y-1.5">
        {items.map((label, idx) => (
          <label
            key={idx}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition hover:bg-surface-muted"
          >
            <input
              type="checkbox"
              checked={checked.has(idx)}
              onChange={() => toggle(idx)}
              className="h-4 w-4 rounded border-border-strong text-brand-600 focus:ring-brand-400"
            />
            <span
              className={cn(
                checked.has(idx) && "text-muted-foreground line-through",
              )}
            >
              {label}
            </span>
          </label>
        ))}
      </div>
    </SectionCard>
  );
}

function ExecutiveTenderSummary({
  data,
}: {
  data: LlmAnalysisDataForTimeline;
}) {
  const what = fieldValue(data.isOzeti.buIsNe);
  const whereWhen = fieldValue(data.isOzeti.neredeNeZaman);
  const delivery = fieldValue(data.isOzeti.yukleniciNeSaglayacak);
  const steps = buildWorkflowSteps(data);
  const prepNotes =
    data.executiveSummary?.onerilenOdaklar?.filter(Boolean).slice(0, 4) ?? [];

  const summary =
    fieldValue(data.executiveSummary?.genelOzet) ??
    [what, whereWhen, delivery].filter(Boolean).join(" ");

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50/80 to-white p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-600">
          Kapsam Özeti
        </p>
        <p className="mt-3 max-w-5xl text-base leading-relaxed text-slate-800">
          {summary ||
            "Dokümandan işin kapsamına ilişkin yeterli bilgi tespit edilemedi."}
        </p>
      </div>

      {steps.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Operasyon Akışı
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Dokümandan çıkarılan ana iş kalemleri ve sorumluluk akışı.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {steps.map((step, idx) => (
              <div
                key={`${idx}-${step.label}`}
                className="rounded-2xl border border-border bg-white p-4 shadow-sm"
              >
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                    {idx + 1}
                  </span>
                  <p className="text-sm font-semibold leading-snug text-slate-900">
                    {step.label}
                  </p>
                </div>
                {step.detail && (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {step.detail}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {prepNotes.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
          <p className="text-sm font-semibold text-slate-900">
            Hazırlık Notları
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            {prepNotes.map((note, idx) => (
              <div
                key={`${idx}-${note}`}
                className="rounded-xl bg-white px-3 py-2 text-sm leading-relaxed text-slate-700 shadow-sm"
              >
                {note}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * İş Özeti'ni timeline adımlarına dönüştürür — kullanıcının verdiği
 * örnek (Türkiye Etabı -> Bosna Hersek Etabı -> ...) SABİT KODLANMAZ;
 * bunun yerine LLM'in iş özeti (ne/nerede-ne zaman) ve gerçekten dolu
 * olan teknik yükümlülük kategorileri akışa eklenir. Böylece her ihale
 * için anlamlı bir akış üretilir.
 *
 * SPRINT NOTU (Acil UX Düzeltmesi): Önceden her kategoriden SADECE İLK
 * madde gösteriliyordu (`category.items[0]`) — bu, "Yemek Hizmetleri"
 * gibi bir kategoride 4 madde (Sabah Kahvaltısı, Öğle Yemeği, Akşam
 * Yemeği, Akşam Servisi) olsa bile ekranda sadece "Sabah Kahvaltısı"
 * görünmesine yol açıyordu — YANLIŞ GRUPLAMA GİBİ ALGILANIYORDU, oysa
 * asıl sorun eksik gruplama değil, EKSİK GÖSTERİMDİ. Artık kategorinin
 * TÜM maddeleri gösteriliyor.
 *
 * Ayrıca, `data.isOzeti.yukleniciNeSaglayacak` alanından otomatik olarak
 * üretilen genel "Teslim" adımı TAMAMEN KALDIRILDI — bu tek cümlelik
 * özet alanı, LLM birden fazla ilgisiz hizmeti (temizlik, sağlık, çevre
 * bakımı, teknik destek, araç kiralama, aktivite/spor, sigorta...) tek
 * cümlede özetlediğinde hepsi yanlışlıkla "Teslim" başlığı altında
 * TEK bir karta yığılmış gibi görünüyordu. Eğer şartnamede gerçekten
 * bir teslim/teslimat süreci varsa, bu artık YALNIZCA LLM'in kendi
 * dinamik teknik_yukumluluk.kategoriler listesinden (kendi başlığıyla,
 * ör. "Teslim ve Kabul Süreci") gelir — burada asla sentezlenmez.
 */
function buildWorkflowSteps(
  data: LlmAnalysisDataForTimeline,
): Array<{ label: string; detail?: string }> {
  const steps: Array<{ label: string; detail?: string }> = [];

  if (data.isOzeti.buIsNe.value !== "tespit_edilemedi") {
    steps.push({ label: data.isOzeti.buIsNe.value });
  }
  if (data.isOzeti.neredeNeZaman.value !== "tespit_edilemedi") {
    steps.push({ label: data.isOzeti.neredeNeZaman.value });
  }

  for (const category of getTeknikKategoriCards(data.teknikYukumlulukler)) {
    if (category.items.length > 0) {
      // SPRINT 10 NOTU: Bu "30 Saniyelik Özet" kartındaki önizleme kısa
      // kalmalı (kart metinleri kısaltılacak ilkesi) — tam liste zaten
      // "Teknik Yükümlülükler" sekmesinde kendi "Devamını göster"
      // düğmesiyle mevcut. Burada en fazla 5 madde + varsa "+N daha".
      const PREVIEW_LIMIT = 5;
      const preview = category.items.slice(0, PREVIEW_LIMIT).join(' • ');
      const remaining = category.items.length - PREVIEW_LIMIT;
      steps.push({
        label: category.label,
        detail: remaining > 0 ? `${preview} (+${remaining} daha)` : preview
      });
    }
  }

  return steps;
}
