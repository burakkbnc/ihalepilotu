// ============================================================
// İhale Pilotu — Faz 2 + Faz 3 Tip Tanımları
// İhale (Tender), Doküman, Analiz, Analiz Geçmişi, Birim Fiyat Kalemi, Aktivite
//
// Firestore yapısı (alt koleksiyonlar):
//   companies/{companyId}/tenders/{tenderId}
//   companies/{companyId}/tenders/{tenderId}/documents/{documentId}
//   companies/{companyId}/tenders/{tenderId}/analysis/{section}
//   companies/{companyId}/tenders/{tenderId}/analysisRuns/{runId}
//   companies/{companyId}/tenders/{tenderId}/items/{itemId}
//   companies/{companyId}/tenders/{tenderId}/activities/{activityId}
//
// NOT: Bu fazda (Faz 3) Storage ve OCR entegrasyonu YOKTUR. Kullanıcı
// şartname metnini doğrudan yapıştırır (paste-text). TenderDocument
// kayıtları hâlâ metadata placeholder'dır (status: 'pending_upload').
// ============================================================

import type { UserRole } from './index';
import type { MergedField, DocumentSource } from '@/lib/parser/types';

export type { MergedField, DocumentSource };

/** İhalenin genel durumu — hazırlık akışındaki aşama */
export type TenderStatus =
  | 'draft' // Yeni oluşturuldu, dokümanlar henüz yüklenmedi
  | 'documents_pending' // Dokümanlar bekleniyor / eksik
  | 'processing' // Dokümanlar işleniyor (Faz 3: OCR/parser)
  | 'analysis_ready' // Analiz tamamlandı, sonuçlar görüntülenebilir
  | 'ready_for_bid' // Teklife hazır
  | 'archived'; // Arşivlendi

/**
 * companies/{companyId}/tenders/{tenderId}
 * Bir ihale kaydının ana belgesi.
 */
export interface Tender {
  id: string;
  companyId: string;

  /** Kullanıcı tarafından girilen başlık (örn. "Ankara Belediyesi Organizasyon Hizmeti") */
  title: string;

  /** Opsiyonel: İdarenin verdiği ihale kayıt numarası (EKAP no vb.) */
  referenceNumber: string | null;

  /** Opsiyonel: İdare adı — analiz tamamlanmadan kullanıcı tarafından da girilebilir */
  institutionName: string | null;

  status: TenderStatus;

  /**
   * Kritik tarihler — Faz 3'te parser tarafından doldurulacak,
   * ancak kullanıcı manuel olarak da girebilir/güncelleyebilir.
   */
  submissionDeadline: string | null; // Teklif son teslim tarihi (ISO)
  tenderDate: string | null; // İhale tarihi (ISO)

  /** Doküman sayıları — hızlı dashboard gösterimi için denormalize edilir */
  documentCount: number;
  /** Faz 3'te analiz tamamlandığında true olur */
  hasAnalysis: boolean;
  /**
   * Son analiz çalıştırmasında tespit edilen idari/teknik şartname çelişki
   * sayısı — dashboard'da "Çelişki Tespit Edildi: N" göstermek için
   * denormalize edilir. Analiz hiç çalıştırılmadıysa 0'dır.
   */
  conflictCount: number;
  /**
   * Son analiz çalıştırmasında tespit edilen "Yüksek" seviye risk sayısı
   * (çelişkiler dahil) — dashboard'da "Kritik Uyarılar: N" göstermek için
   * denormalize edilir. Analiz hiç çalıştırılmadıysa 0'dır.
   */
  highRiskCount: number;
  /**
   * LLM analizinin executiveSummary.genelRiskSkoru'sundan denormalize
   * edilen genel risk skoru (0-100) — dashboard'da "Ortalama Uygunluk
   * Skoru" KPI'si için kullanılır. Optional: LLM analizi hiç
   * çalıştırılmadıysa veya LLM bu alanı üretmediyse (örn. mock provider)
   * undefined'dır — dashboard bu durumda "—" gösterir, sahte bir skor
   * ÜRETİLMEZ.
   */
  genelRiskSkoru?: number;

  createdBy: string; // uid
  createdAt: string;
  updatedAt: string;
}

/** Tender oluşturma isteği gövdesi */
export interface CreateTenderInput {
  title: string;
  referenceNumber?: string | null;
  institutionName?: string | null;
  submissionDeadline?: string | null;
  tenderDate?: string | null;
}

/** Tender güncelleme isteği gövdesi — kısmi güncelleme */
export interface UpdateTenderInput {
  title?: string;
  referenceNumber?: string | null;
  institutionName?: string | null;
  status?: TenderStatus;
  submissionDeadline?: string | null;
  tenderDate?: string | null;
}

// ============================================================
// TenderDocument — Doküman metadata placeholder (Storage Faz 3'te)
// ============================================================

export type TenderDocumentType =
  | 'idari_sartname' // İdari Şartname
  | 'teknik_sartname' // Teknik Şartname
  | 'sozlesme_tasarisi' // Sözleşme Tasarısı (opsiyonel)
  | 'birim_fiyat_cetveli' // Birim Fiyat Cetveli (opsiyonel)
  | 'zeyilname' // Zeyilname / Düzeltme İlanı — orijinal dokümanları güncelleyen/iptal eden değişiklik belgesi
  | 'ek_belge'; // Ek Dokümanlar (opsiyonel)

export type TenderDocumentStatus =
  | 'pending_upload' // Kayıt oluşturuldu, dosya henüz yüklenmedi (Storage yok)
  | 'uploaded'
  | 'extracting_text'
  | 'ocr_required'
  | 'analyzing'
  | 'completed'
  | 'failed';

/**
 * companies/{companyId}/tenders/{tenderId}/documents/{documentId}
 * Faz 2'de dosya İÇERİĞİ tutulmaz — yalnızca metadata.
 * fileUrl/storagePath alanları Faz 3'te Storage entegrasyonu ile doldurulacaktır.
 */
export interface TenderDocument {
  id: string;
  tenderId: string;
  companyId: string;

  documentType: TenderDocumentType;
  fileName: string;
  /** MIME tipi — Faz 3'te gerçek dosya yüklendiğinde doğrulanır */
  mimeType: string | null;
  /** Bayt cinsinden dosya boyutu — Faz 3'te doldurulur */
  fileSize: number | null;
  /**
   * SPRINT NOTU (Zeyilname/Düzeltme İlanı Desteği): Dokümanın kendi
   * tarihi (kullanıcı tarafından girilir, ör. zeyilname yayım tarihi).
   * Birden fazla zeyilname olduğunda HANGİ değişikliğin GÜNCEL olduğunu
   * belirlemek için `createdAt` (yükleme zamanı) YETERSİZDİR — kullanıcı
   * dosyaları istediği sırada yükleyebilir, yükleme sırası belgenin
   * gerçek tarihini yansıtmaz. Bu alan opsiyoneldir; boşsa sistem
   * `createdAt`'i (yükleme sırasını) yedek olarak kullanır ama bu daha
   * az güvenilirdir — UI kullanıcıyı bu alanı doldurmaya teşvik eder.
   */
  documentDate?: string | null;

  /** Faz 3'te Storage path'i (companies/{companyId}/tenders/{tenderId}/documents/{fileName}) */
  storagePath: string | null;

  status: TenderDocumentStatus;
  /** OCR/parser hata mesajı (varsa) */
  errorMessage: string | null;

  uploadedBy: string; // uid
  createdAt: string;
  updatedAt: string;
}

/** Doküman kaydı oluşturma isteği — Faz 2'de yalnızca metadata kaydı */
export interface CreateTenderDocumentInput {
  documentType: TenderDocumentType;
  fileName: string;
  mimeType?: string | null;
  fileSize?: number | null;
  storagePath?: string | null;
  /** Belgenin kendi tarihi (ör. zeyilname yayım tarihi) — opsiyonel */
  documentDate?: string | null;
}

// ============================================================
// TenderAnalysis — Analiz sonuçları (Faz 3 — birleşik/merge mimarisi)
//
// Her alan MergedField<T> ile sarmalanır: {value, source, hasConflict, ...}
// source: 'administrative' | 'technical' | 'merged' | null
// Bu sayede UI her alanın hangi şartnameden geldiğini ve çelişki olup
// olmadığını gösterebilir. Liste alanları (string[]) MergedField<string[]>
// olarak tutulur — birleşim (union) sonucu ve kaynak bilgisi taşır.
// ============================================================

/** Risk seviyesi */
export type RiskLevel = 'low' | 'medium' | 'high';

export interface RiskItem {
  level: RiskLevel;
  title: string;
  reason: string;
}

/** İdari/Teknik şartname arasında tespit edilen sayısal/boolean çelişkisi */
export interface FieldConflict {
  /** Çelişkinin ait olduğu bölüm (ör. 'guarantee', 'administrativeMeta') */
  section: AnalysisSection;
  /** Kullanıcıya gösterilecek alan adı (ör. "Geçici Teminat Oranı") */
  fieldLabel: string;
  /** İdari şartnamede bulunan değerin okunabilir hâli (ör. "%3") */
  administrativeValue: string;
  /** Teknik şartnamede bulunan değerin okunabilir hâli (ör. "%5") */
  technicalValue: string;
}

/**
 * companies/{companyId}/tenders/{tenderId}/analysis/{section}
 * Her analiz bölümü ayrı bir belge olarak tutulur (section = belge ID'si).
 *
 * Faz 3'te bu koleksiyon, kullanıcının yapıştırdığı idari VE teknik şartname
 * metinleri üzerinde AYRI AYRI çalışan iki parser'ın (administrative/technical)
 * sonuçlarının merge motoru tarafından birleştirilmesiyle doldurulur.
 */
export type AnalysisSection =
  | 'summary'
  | 'experience'
  | 'guarantee'
  | 'requiredDocuments'
  | 'technicalRequirements'
  | 'criticalDates'
  | 'administrativeMeta'
  | 'risks'
  | 'aiSummary'
  | 'costItems'
  | 'officialBillOfQuantities'
  | 'conflicts'
  | 'llmAnalysis';

export interface TenderAnalysisBase {
  id: AnalysisSection;
  tenderId: string;
  companyId: string;
  /** Bu bölümün hangi kaynaktan üretildiği — 'rule_based' (merge edilmiş) | 'llm' | 'manual' */
  source: 'rule_based' | 'llm' | 'manual' | null;
  generatedAt: string | null;
  updatedAt: string;
}

/** 1. İşin Özeti */
export interface TenderAnalysisSummary extends TenderAnalysisBase {
  id: 'summary';
  data: {
    subject: MergedField<string | null>; // İşin Konusu
    scope: MergedField<string | null>; // İşin Kapsamı
    purpose: MergedField<string | null>; // İşin Amacı
    location: MergedField<string | null>; // Yer
    startDate: MergedField<string | null>;
    endDate: MergedField<string | null>;
    durationDays: MergedField<number | null>;
    institutionInfo: MergedField<string | null>;
    /** Program/etkinlik tarihleri (kongre, organizasyon, gezi vb. işler için) */
    programDates: MergedField<string[]>;
    /** Katılımcı/kişi sayısı bilgileri (ör. "32 kişilik grup", "150 katılımcı") */
    participantCounts: MergedField<string[]>;
  } | null;
}

/** 2. İş Deneyimi Analizi */
export interface TenderAnalysisExperience extends TenderAnalysisBase {
  id: 'experience';
  data: {
    required: MergedField<boolean | null>;
    ratioPercent: MergedField<number | null>;
    similarWorkDescription: MergedField<string | null>;
    experienceType: MergedField<string | null>;
  } | null;
}

/** 3. Teminat Analizi — Geçici ve Kesin teminat KESİNLİKLE ayrı tutulur, hiçbir yerde toplanmaz. */
export interface TemporaryGuaranteeInfo {
  percent: MergedField<number | null>;
  amount: MergedField<number | null>;
  validUntil: MergedField<string | null>;
  cashAccepted: MergedField<boolean | null>;
  electronicAccepted: MergedField<boolean | null>;
  iban: MergedField<string | null>;
  recipientInstitution: MergedField<string | null>;
  accountingUnit: MergedField<string | null>;
  guaranteeTypes: MergedField<string[]>;
  /** Şartnamedeki kaynak madde referansı (varsa) */
  sourceReference: MergedField<string | null>;
}

export interface FinalGuaranteeInfo {
  percent: MergedField<number | null>;
  /** Sınır değerin (eşik) ALTINDA teklif verilirse uygulanacak özel oran (varsa) — ör. "%9" */
  belowThresholdPercent: MergedField<number | null>;
  /** Bu özel oranın hangi durumda uygulandığına dair kısa not (1 kısa cümle, madde metni DEĞİL) */
  belowThresholdCondition: MergedField<string | null>;
  sourceReference: MergedField<string | null>;
}

export interface TenderAnalysisGuarantee extends TenderAnalysisBase {
  id: 'guarantee';
  data: {
    temporary: TemporaryGuaranteeInfo;
    final: FinalGuaranteeInfo;
    bankName: MergedField<string | null>;
  } | null;
}

/** 4. Gerekli Belgeler */
export interface TenderAnalysisRequiredDocuments extends TenderAnalysisBase {
  id: 'requiredDocuments';
  data: {
    documents: MergedField<string[]>;
  } | null;
}

/**
 * 5. Teknik Yeterlilikler
 *
 * Genel hizmet alımlarının yanı sıra kongre/organizasyon/seyahat hizmeti
 * ihalelerinde sıkça geçen başlıkları da kapsar (ulaşım, otobüs, uçak,
 * konaklama, yemek, rehberlik, sigorta, baskı/görünürlük, hediyelik vb.)
 */
export interface TenderAnalysisTechnicalRequirements extends TenderAnalysisBase {
  id: 'technicalRequirements';
  data: {
    personnelRequirements: MergedField<string[]>;
    equipmentRequirements: MergedField<string[]>;
    certificateRequirements: MergedField<string[]>;
    referenceRequirements: MergedField<string[]>;
    serviceRequirements: MergedField<string[]>;
    deliveryRequirements: MergedField<string[]>;
    performanceRequirements: MergedField<string[]>;
    /** Ulaşım şartları (genel) */
    transportationRequirements: MergedField<string[]>;
    /** Otobüs/araç şartları (ör. "2021 model üstü", "en az 38 yolcu kapasiteli") */
    vehicleRequirements: MergedField<string[]>;
    /** Uçak bileti şartları */
    flightRequirements: MergedField<string[]>;
    /** Konaklama şartları */
    accommodationRequirements: MergedField<string[]>;
    /** Yemek/catering şartları */
    cateringRequirements: MergedField<string[]>;
    /** Rehberlik/tercümanlık şartları (ör. "İngilizce ileri düzey", sertifikalar) */
    guideRequirements: MergedField<string[]>;
    /** Sigorta şartları (ör. "yurtdışı sağlık sigortası") */
    insuranceRequirements: MergedField<string[]>;
    /** Baskı/görünürlük (banner, basılı materyal vb.) hizmetleri */
    printingRequirements: MergedField<string[]>;
    /** Hediyelik eşya hizmetleri (ör. "24 adet tişört") */
    giftRequirements: MergedField<string[]>;
    /** Yüklenicinin genel sorumlulukları */
    contractorResponsibilities: MergedField<string[]>;
  } | null;
}

/** 6. Kritik Tarihler */
export interface TenderAnalysisCriticalDates extends TenderAnalysisBase {
  id: 'criticalDates';
  data: {
    tenderDate: MergedField<string | null>;
    submissionDeadline: MergedField<string | null>;
    questionDeadline: MergedField<string | null>;
    temporaryGuaranteeDeadline: MergedField<string | null>;
    workStartDate: MergedField<string | null>;
    workEndDate: MergedField<string | null>;
    contractSigningPeriodDays: MergedField<number | null>;
  } | null;
}

/** 7. İdari Bilgiler (İdari Şartname Meta Bilgileri) */
export interface TenderAnalysisAdministrativeMeta extends TenderAnalysisBase {
  id: 'administrativeMeta';
  data: {
    /** İhale Kayıt Numarası */
    ikn: MergedField<string | null>;
    bidValidityDays: MergedField<number | null>;
    partialBidAllowed: MergedField<boolean | null>;
    alternativeBidAllowed: MergedField<boolean | null>;
    subcontractorAllowed: MergedField<boolean | null>;
    consortiumAllowed: MergedField<boolean | null>;
    domesticBidderRequirement: MergedField<boolean | null>;
    electronicAuction: MergedField<boolean | null>;
    contractType: MergedField<string | null>;
    currency: MergedField<string | null>;
    vatInfo: MergedField<string | null>;
  } | null;
}

/** 8. Risk Analizi */
export interface TenderAnalysisRisks extends TenderAnalysisBase {
  id: 'risks';
  data: {
    items: RiskItem[];
  } | null;
}

/** 9. AI Özeti — LLM tarafından üretilen yönetici özeti ve içgörüler */
export interface TenderAnalysisAiSummary extends TenderAnalysisBase {
  id: 'aiSummary';
  data: {
    executiveSummary: string;
    additionalInsights: string[];
    highlights: string[];
    /** Özeti üreten provider — 'mock' | 'anthropic' | 'openai' | 'gemini' */
    provider: string;
  } | null;
}

/** Tespit edilen tek bir hizmet/birim fiyat kalemi taslağı */
/**
 * Bir maliyet kaleminin geldiği kaynak türü:
 * - 'official_bill_of_quantities': EK'teki resmi Birim Fiyat Teklif Cetveli tablosundan
 * - 'technical_cost_item': teknik şartname metni içinden çıkarılan somut, fiyatlandırılabilir alt kalem
 * - 'derived_estimate': doğrudan metinde sayı geçmeyen ama (kişi×gün gibi) türetilebilen taslak kalem
 */
export type CostItemSourceType = 'official_bill_of_quantities' | 'technical_cost_item' | 'derived_estimate' | 'ai_bfc';

/** Maliyet kaleminin idari mi teknik mi şartnameden geldiği */
export type CostItemSourceDocument = 'idari' | 'teknik';

/**
 * Tek bir maliyet/fiyatlandırma kalemi. Hem resmi cetvel satırlarını
 * (sourceType='official_bill_of_quantities') hem de teknik şartnameden
 * çıkarılan alt kalemleri (sourceType='technical_cost_item') temsil eder.
 * Analiz aşamasında salt-okunur bir ÖNERİ olarak üretilir; kullanıcı
 * "Birim Fiyat Cetveline Aktar" dediğinde bir TenderItem'a dönüştürülür.
 */
export interface CostItem {
  id: string;
  /** Kısa, fiyatlandırılabilir ürün/hizmet adı (ör. "Yaka Kartı") — uzun madde metni DEĞİL */
  name: string;
  quantity: number | null;
  unit: string | null;
  /** Maliyet kategorisi: Ulaşım, Konaklama, Yemek, Rehberlik, Sigorta, Baskı ve Görünürlük, Hediyelik, İkram, Müze / Etkinlik, Diğer */
  category: string;
  sourceType: CostItemSourceType;
  /** Bu kalemin eşleştiği resmi cetvel kalemi adı (varsa) — ör. "Tişört ve Şapka" */
  parentOfficialItemName: string | null;
  /** Kısa açıklayıcı not (ör. ölçü, malzeme) — uzun şartname metni değil */
  shortNote: string | null;
  sourceDocument: CostItemSourceDocument;
  /** Şartnamedeki yaklaşık madde referansı (ör. "Madde 4.7.2") — bulunamazsa null */
  sourceReference: string | null;
  /** 0-1 arası tespit güven skoru */
  confidence: number;
  /** Kullanıcının bu öneri için girdiği birim fiyat (henüz cetvele aktarılmadıysa, sadece UI'da tutulur) */
  unitPrice?: number;
  /** quantity * unitPrice (varsa) */
  totalPrice?: number;
}

/** EK'teki resmi Birim Fiyat Teklif Cetveli'nden çıkarılan tek bir satır (Sıra No / İş Kalemi / Birim / Miktar) */
export interface OfficialBillItem {
  id: string;
  orderNo: number;
  name: string;
  unit: string | null;
  quantity: number | null;
  sourceDocument: CostItemSourceDocument;
  confidence: number;
}

/** 10a. Maliyet Kırılımı / Alt Kalemler — teknik şartnameden çıkarılan fiyatlandırılabilir kalemler */
export interface TenderAnalysisCostItems extends TenderAnalysisBase {
  id: 'costItems';
  data: {
    items: CostItem[];
  } | null;
}

/** 10b. Resmi Birim Fiyat Cetveli — EK'teki resmi tablodan çıkarılan satırlar */
export interface TenderAnalysisOfficialBillOfQuantities extends TenderAnalysisBase {
  id: 'officialBillOfQuantities';
  data: {
    items: OfficialBillItem[];
  } | null;
}

/** Çelişkiler — idari ve teknik şartname arasında tutarsız bulunan tüm alanlar */
export interface TenderAnalysisConflicts extends TenderAnalysisBase {
  id: 'conflicts';
  data: {
    items: FieldConflict[];
  } | null;
}

/**
 * 12. Faz 4 LLM Analizi — yapılandırılmış, anlam gerektiren bölümler.
 *
 * KRİTİK GÜVENLİK KURALI (Faz 4 mimarisi, 3 katmanlı koruma — katman 2/3):
 * Bu tip KASITLI OLARAK maliyet/fiyat/teklif/kazanma-olasılığı alanı
 * İÇERMEZ (estimatedCost, suggestedBidPrice, bidRecommendation,
 * winProbability gibi alanlar şemada YOKTUR). LLM'in bu tür bir çıktı
 * üretmesi prompt ile yasaklanır (katman 1); ama şema seviyesinde bu
 * alanların hiç var olmaması, yanlışlıkla bu bilgilerin saklanmasını/
 * gösterilmesini de yapısal olarak engeller. Üçüncü katman (output
 * validation) llmAnalysis.ts'de uygulanır.
 *
 * Faz 4 v2 NOTU: Önceki sürümde 8 düz string alan vardı (her biri
 * tek bir uzun metin). Kullanıcı geri bildirimine göre artık her bölüm
 * KARTLI/YAPILANDIRILMIŞ alt-şemalara ayrılmıştır (bkz. LlmQuickGlance,
 * LlmIsOzeti, LlmKatilimUygunlugu, LlmTeminatAnalizi, LlmRiskOgesi,
 * LlmTeknikYukumlulukler, LlmGerekliBelge) — bu sayede UI artık uzun
 * metin akışı değil, taranabilir kart/checklist/liste gösterebilir.
 * Teminat Analizi'nin alt-alanları (oran, IBAN, geçerlilik tarihi, ceza
 * oranı) BİLİNÇLİ OLARAK katman-3 maliyet/fiyat filtresine TABİ DEĞİLDİR
 * — bunlar şartnamede açıkça yazan resmi verilerdir, yorum/tahmin değil.
 *
 * Her metin alanı en fazla 1-2 cümlelik (veya tek satırlık) kısa bir
 * özettir — şartname metninin uzun pasajları ASLA bu alanlara taşınmaz.
 * Belirsiz/bulunamayan bilgi için değer "tespit_edilemedi" sabit
 * string'idir (heuristik tahmin veya uydurma içerik YASAKTIR).
 */
/**
 * Tek bir kısa metin alanı — en fazla 1-2 cümle (veya tek satır). Üretim/
 * güvenlik metadata'sı içerir (flagged=true ise içerik güvenlik filtresi
 * tarafından gizlenmiştir).
 */
export interface LlmAnalysisField {
  /** 1-2 cümlelik (veya tek satır) kısa özet, veya bulunamadıysa sabit 'tespit_edilemedi' string'i */
  value: string;
  /**
   * Bu alanın şartnamedeki kaynağı — madde no, bölüm başlığı veya sayfa
   * referansı. LLM'in kaynak belirtebildiği faktüel alanlarda doldurulur
   * (ör. mali yeterlilik, teminat analizi); belirtemediği durumlarda
   * undefined/boş bırakılır (UYDURULMAZ).
   */
  kaynak?: string;
  /** Üretim/güvenlik metadata'sı — UI'da rozet göstermek için */
  flagged?: boolean;
  /** flagged=true ise, hangi güvenlik kuralının tetiklendiğine dair kısa not (kullanıcıya gösterilmez, log amaçlı) */
  flagReason?: string;
}

/** A) Hızlı Bakış — üstte gösterilen 4 mini kart, her biri tek cümle. */
export interface LlmQuickGlance {
  isTuru: LlmAnalysisField;
  katilimDurumu: LlmAnalysisField;
  oneCikanRisk: LlmAnalysisField;
  kritikUyari: LlmAnalysisField;
}

/** B) İş Özeti — uzun paragraf DEĞİL, 3 kısa maddelik özet. */
export interface LlmIsOzeti {
  buIsNe: LlmAnalysisField;
  neredeNeZaman: LlmAnalysisField;
  yukleniciNeSaglayacak: LlmAnalysisField;
}

/** C) Katılım Uygunluğu — checklist satırı: Kriter | Sonuç | Kaynak. */
export interface LlmKatilimKriteri {
  kriter: string;
  sonuc: LlmAnalysisField;
  kaynak: LlmAnalysisField;
}

export interface LlmKatilimUygunlugu {
  yerliIstekliSarti: LlmKatilimKriteri;
  konsorsiyum: LlmKatilimKriteri;
  altYuklenici: LlmKatilimKriteri;
  kismiTeklif: LlmKatilimKriteri;
  elektronikEksiltme: LlmKatilimKriteri;
  isDeneyimi: LlmKatilimKriteri;
}

/** D0) Mali Yeterlilik — iş deneyimi, ciro ve finansal belgeler. */
export interface LlmMaliYeterlilik {
  isDeneyimiOrani: LlmAnalysisField;
  ciroYeterliligiOrani: LlmAnalysisField;
  bilancoSarti: LlmAnalysisField;
  gelirTablosuSarti: LlmAnalysisField;
  bankaReferansSarti: LlmAnalysisField;
}

/**
 * D) Teminat Analizi — YAPILANDIRILMIŞ, FAKTÜEL alanlar.
 *
 * ÖNEMLİ: Bu alanlar (oran, tür, geçerlilik tarihi, IBAN, ceza oranı,
 * resmi cetvel miktarı) maliyet tahmini, teklif fiyatı önerisi DEĞİLDİR
 * — şartnamede AÇIKÇA yazan resmi verilerdir. Bu yüzden bu alt-alanlar
 * katman-3 (output validation) güvenlik filtresinin "maliyet/fiyat/teklif
 * önerisi" kalıplarına karşı taranmaz; sadece serbest metin İÇEREN diğer
 * LLM alanları (riskler, teknik yükümlülükler vb.) bu filtreye girer.
 * Bu netlik, önceki yanlış-pozitif "güvenlik nedeniyle gizlendi" hatasının
 * kök nedenini KALICI olarak ortadan kaldırır.
 */
export interface LlmTeminatAnalizi {
  geciciTeminatOrani: LlmAnalysisField;
  kesinTeminatOrani: LlmAnalysisField;
  teminatGecerlilikTarihi: LlmAnalysisField;
  nakitTeminatIban: LlmAnalysisField;
  aliciAdi: LlmAnalysisField;
  kabulEdilenTeminatTurleri: LlmAnalysisField;
  cezaOranlari: LlmAnalysisField;
}

/**
 * E) Riskler — her biri kart olarak gösterilen yapılandırılmış risk öğesi.
 *
 * Faz 4.5: riskSkoru (0-100), etki, olasilik eklendi — LLM tarafından
 * üretilir, risk sıralama/filtreleme/skor ortalaması/ihaleler arası
 * karşılaştırma için kullanılacaktır. Maliyet tahmini veya teklif önerisi
 * DEĞİLDİR; sadece şartnamede belirtilen riskin göreli önemini ifade
 * eder. Optional — Faz 4.5 ÖNCESİ yazılmış Firestore kayıtlarında bu
 * alanlar bulunmaz (geriye dönük uyumluluk); UI bu durumda skor/etki/
 * olasılık satırlarını basitçe göstermez, eski seviye rozeti çalışmaya
 * devam eder.
 */
export interface LlmRiskOgesi {
  baslik: string;
  seviye: 'düşük' | 'orta' | 'yüksek';
  aciklama: LlmAnalysisField;
  kaynak: LlmAnalysisField;
  riskSkoru?: number;
  etki?: 'düşük' | 'orta' | 'yüksek';
  olasilik?: 'düşük' | 'orta' | 'yüksek';
  /**
   * SPRINT NOTU (Aşama A — dedup altyapısı): SADECE chunk'lar arası
   * tekrar tespiti (dedup/merge) için kullanılan teknik altyapı alanı —
   * UI KARTLARINDA HİÇ GÖSTERİLMEZ. Optional, geriye dönük uyumlu.
   */
  kaynakMadde?: string;
  /** Aşama A — dedup altyapısı (bkz. kaynakMadde). UI'da gösterilmez. */
  konuEtiketi?: string;
}

export interface LlmTeknikYukumlulukKategori {
  baslik: string;
  maddeler: string[];
  kaynak?: string | null;
}

/** F) Teknik Yükümlülükler — kategori bazlı kısa madde listeleri. */
export interface LlmTeknikYukumlulukler {
  /** Dinamik kategoriler: her ihale kendi kapsamına göre başlık üretir. */
  kategoriler?: LlmTeknikYukumlulukKategori[];
  /** Eski kayıtlarla geriye dönük uyumluluk için korunur. */
  ulasim: string[];
  konaklama: string[];
  yemek: string[];
  rehberlik: string[];
  sigorta: string[];
  baskiGorunurluk: string[];
  hediyelikIkram: string[];
}

/** G) Gerekli Belgeler — checklist satırı: Belge adı | Durum/açıklama | Kaynak. */
export interface LlmGerekliBelge {
  belgeAdi: string;
  durum: LlmAnalysisField;
  kaynak: LlmAnalysisField;
  /** Aşama A — dedup altyapısı (bkz. LlmRiskOgesi.kaynakMadde). UI'da gösterilmez. */
  kaynakMadde?: string;
  /** Aşama A — dedup altyapısı (bkz. LlmRiskOgesi.konuEtiketi). UI'da gösterilmez. */
  konuEtiketi?: string;
}

/**
 * H) Çelişkiler — LLM'in dokümanları okurken fark ettiği, AYNI ALANIN
 * farklı dokümanlarda/bölümlerde FARKLI değerlerle geçtiği durumlar.
 * Bu, Faz 3.5'in önceden tanımlı sabit alan listesiyle (guarantee %, vb.)
 * karşılaştırma yapan rule-based 'conflicts' section'ından FARKLIDIR —
 * burada LLM, önceden tanımlanmamış herhangi bir alanda da çelişki
 * fark edebilir (serbest/semantik tespit).
 */
export interface LlmCeliski {
  alan: string;
  idariDeger: LlmAnalysisField;
  teknikDeger: LlmAnalysisField;
  aciklama: LlmAnalysisField;
}

/**
 * J) Zeyilname / Düzeltme İlanı Değişiklikleri — LLM'in zeyilname/düzeltme
 * ilanı içeriğini orijinal idari/teknik şartname ile karşılaştırarak
 * tespit ettiği değişiklikler. `durum: 'iptal_edildi'` olan bir madde,
 * analizin GERİ KALANINDA (diğer tüm alanlarda) ARTIK GEÇERLİ SAYILMAZ —
 * LLM'e bu maddeyi analiz dışı bırakması, güncel/değişmemiş hükmü esas
 * alması talimatı verilir (bkz. llmAnalysis.ts buildSystemPrompt).
 */
export interface LlmZeyilnameDegisikligi {
  alan: string;
  orijinalDeger: LlmAnalysisField;
  guncelDeger: LlmAnalysisField;
  /** Hangi zeyilname/düzeltme ilanı (dosya adı ve/veya tarihi) bu değişikliği yaptı */
  zeyilnameKaynagi: LlmAnalysisField;
  durum: 'degistirildi' | 'iptal_edildi';
}

/**
 * K) Özel Gereklilik Kartı — LLM'in şartnameyi okurken tespit ettiği,
 * teklif hazırlığını/maliyetlendirmeyi/operasyonu/yeterliliği etkileyen
 * ÖZEL (standart olmayan) hükümler. SABİT bir kategori listesi YOKTUR —
 * "kategoriTipi" tamamen LLM'in bu dokümanda gerçekten bulduğu konuya
 * göre serbestçe ürettiği bir etikettir (ör. "Personel ve Sertifika",
 * "Dış Tedarik / Restoran Hizmeti", "Makine/Ekipman Şartı" vb. — bunlar
 * SADECE örnektir, zorunlu/sabit değildir). Bu tip, teknik_yukumluluk.
 * kategoriler'den (genel iş kapsamı/operasyon akışı) FARKLI bir amaca
 * hizmet eder: burada odak "bu özel hüküm teklifi/maliyeti/yeterliliği
 * NASIL etkiler?" sorusudur, sadece "ne yapılacak?" değil.
 */
export interface LlmOzelGereklilik {
  baslik: string;
  /** LLM'in bu dokümana özgü ürettiği serbest metin kategori etiketi (sabit enum DEĞİL) */
  kategoriTipi: string;
  onemDerecesi: 'kritik' | 'orta' | 'dusuk';
  aciklama: LlmAnalysisField;
  teklifEtkisi: LlmAnalysisField;
  maliyetEtkisi: LlmAnalysisField;
  operasyonEtkisi: LlmAnalysisField;
  gerekliBelgeler: string[];
  /** Bu özel hükmün ilişkili olduğu BFC/iş kalemi adları (varsa) — LLM'in kendi BFC okumasıyla metindeki hükmü ilişkilendirmesi için */
  ilgiliKalemler: string[];
  kaynak: LlmAnalysisField;
  kullaniciAksiyonu: LlmAnalysisField;
  /** Aşama A — dedup altyapısı (bkz. LlmRiskOgesi.kaynakMadde). UI'da gösterilmez. */
  kaynakMadde?: string;
  /** Aşama A — dedup altyapısı (bkz. LlmRiskOgesi.konuEtiketi). UI'da gösterilmez. */
  konuEtiketi?: string;
}

/**
 * I) Birim Fiyat Cetveli — LLM'in şartname içinde (ayrı dosya, ek belge
 * veya idari/teknik şartname içindeki tablo olarak) geçen birim fiyat
 * teklif cetvelini SEMANTİK olarak okuyup çıkardığı satırlar. Bu, Faz
 * 3.5'in regex/parser tabanlı `officialBillOfQuantities` section'ından
 * (bkz. TenderAnalysisOfficialBillOfQuantities) AYRIDIR ve onun YERİNE
 * GEÇMEZ — ikisi birbirini doğrulayan, farklı kaynaklı iki okumadır.
 * Tablo bozuk/taranmış/parçalı olsa bile LLM okuyabildiği satırları
 * çıkarır; okuyamadığı hücreleri "tespit_edilemedi" bırakır, UYDURMAZ.
 */
export interface LlmBoqKalemi {
  siraNo: LlmAnalysisField;
  kalemAdi: string;
  birim: LlmAnalysisField;
  miktar: LlmAnalysisField;
  birimFiyat: LlmAnalysisField;
  kdvOrani: LlmAnalysisField;
  toplamTutar: LlmAnalysisField;
  kaynak: LlmAnalysisField;
  /** LLM'in bu satırı ne kadar güvenle okuduğu — tablo net değilse 'düşük' olmalı. */
  guvenSeviyesi: 'düşük' | 'orta' | 'yüksek';
}

/**
 * Birim Fiyat Cetveli Uyarıları — LLM'in semantik okuması ile Faz 3.5
 * regex/parser'ının çıkardığı resmi cetvel arasında fark ettiği
 * tutarsızlıklar (ör. parser 12 satır buldu ama LLM 15 satır görüyor,
 * veya aynı kalemde miktar/birim farklı okunmuş). Kullanıcı hangi
 * kaynağın doğru olduğuna kendisi karar vermelidir; sistem bunu
 * OTOMATİK olarak çözmez, sadece görünür kılar.
 */
export interface LlmBfcUyarisi {
  kalemAdi: string;
  parserDegeri: LlmAnalysisField;
  aiDegeri: LlmAnalysisField;
  aciklama: LlmAnalysisField;
}

/**
 * Faz 4 LLM çağrısının token kullanımı ve tahmini maliyeti — sadece
 * geliştirici/debug görünürlüğü içindir, UI'da kullanıcıya gösterilmesi
 * ZORUNLU DEĞİLDİR (kullanıcı talebi). Firestore'da saklanır, ayrıca
 * console.log ile de yazılır.
 */
export interface LlmUsageMetadata {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  createdAt: string;
}

/**
 * Faz 4.5 — Yönetici Özeti (AI Değerlendirmesi). LLM'in şartnamenin
 * TAMAMINI değerlendirerek ürettiği tek-paragraf özet + göreli risk
 * skoru. Katılım kısıtları, teminat yükü, operasyonel zorluklar, teslim
 * süresi, idare onay süreçleri ve sözleşme riskleri birlikte
 * değerlendirilir. Teklif ver/verme önerisi veya maliyet tahmini
 * DEĞİLDİR — şartnamenin karmaşıklık/risk seviyesini ifade eden göreli
 * bir göstergedir. Yönetici dashboardu, ihale karşılaştırma, portföy
 * sıralama ve risk analitiği için kullanılması planlanır.
 */
export interface LlmExecutiveSummary {
  genelOzet: LlmAnalysisField;
  /** 0-100 aralığında göreli risk göstergesi — LLM tarafından üretilir. */
  genelRiskSkoru: number;
  riskSeviyesi: 'düşük' | 'orta' | 'yüksek';
  katilimDurumu: 'uygun' | 'sartli' | 'uygun_degil';
  onerilenOdaklar: string[];
}

/**
 * Analiz Kapsamı — dokümanın ne kadarının fiilen LLM'e gönderilip
 * analiz edildiğinin DETERMİNİSTİK (LLM'e SORULMADAN, sistem tarafından
 * hesaplanan) kaydı. LLM'e "kaç sayfa gördün" diye SORULMAZ (halüsinasyon
 * riski) — bu bilgi tamamen orkestrasyon katmanında (llmAnalysis.ts),
 * gerçek sayfa sayıları karşılaştırılarak üretilir.
 *
 * SPRINT NOTU (mimari bug fix — chunk'lama): Önceden taranmış/görsel
 * PDF'lerde sadece ilk 15 sayfa LLM'e gönderiliyordu, kullanıcıya bu
 * konuda HİÇBİR bilgi verilmiyordu. Artık büyük dokümanlar parçalara
 * (chunk) bölünüp TAMAMI analiz ediliyor; bu alan kullanıcıya "X
 * sayfanın tamamı analiz edildi" (veya kısmi kaldıysa dürüstçe "Y
 * sayfa analiz edilemedi") bilgisini gösterir.
 */
export interface LlmAnalizKapsami {
  /** Vision'a giden PDF dokümanlarının toplam sayfa sayısı (biliniyorsa) */
  toplamSayfa: number;
  /** Fiilen LLM'e görüntü olarak gönderilen sayfa sayısı */
  analizEdilenSayfa: number;
  /** Kaç ayrı LLM çağrısına (chunk) bölündüğü — 1 ise bölünmedi */
  parcaSayisi: number;
  /** analizEdilenSayfa >= toplamSayfa */
  tamamiOkundu: boolean;
}

export interface TenderAnalysisLlmAnalysis extends TenderAnalysisBase {
  id: 'llmAnalysis';
  data: {
    hizliBakis: LlmQuickGlance;
    isOzeti: LlmIsOzeti;
    katilimUygunlugu: LlmKatilimUygunlugu;
    maliYeterlilik?: LlmMaliYeterlilik;
    teminatAnalizi: LlmTeminatAnalizi;
    riskler: LlmRiskOgesi[];
    teknikYukumlulukler: LlmTeknikYukumlulukler;
    gerekliBelgeler: LlmGerekliBelge[];
    /**
     * LLM'in dokümanlar arasında (idari/teknik/ek) fark ettiği çelişkiler.
     * Optional/undefined olabilir — Faz 4.6 ÖNCESİ üretilmiş kayıtlarda bu
     * alan hiç yoktur (geriye dönük uyumluluk); UI bu durumda "Çelişkiler"
     * bölümünü basitçe göstermez.
     */
    celiskiler?: LlmCeliski[];
    /**
     * Zeyilname/düzeltme ilanı ile değişen veya iptal edilen maddeler.
     * Optional/undefined olabilir — zeyilname yüklenmemişse boş kalır.
     */
    zeyilnameDegisiklikleri?: LlmZeyilnameDegisikligi[];
    /**
     * Özel Gereklilik Kartları — teklif hazırlığını/maliyeti/operasyonu/
     * yeterliliği etkileyen, standart olmayan hükümler. Optional/undefined
     * olabilir (geriye dönük uyumluluk + hiçbir özel hüküm bulunamazsa).
     */
    ozelGereklilikler?: LlmOzelGereklilik[];
    /**
     * LLM'in şartnamedeki birim fiyat cetvelini semantik olarak okuyarak
     * ürettiği satırlar — Faz 3.5 regex/parser çıktısının YERİNE GEÇMEZ,
     * onu tamamlayan/doğrulayan ikinci bir okumadır. Optional/undefined
     * olabilir (geriye dönük uyumluluk + LLM tabloyu hiç bulamadıysa).
     */
    birimFiyatCetveli?: LlmBoqKalemi[];
    /**
     * LLM'in semantik okuması ile parser'ın regex okuması arasında
     * bulduğu BFC-özel tutarsızlıklar. Optional — tutarsızlık yoksa
     * boş dizi veya undefined olabilir.
     */
    bfcUyarilari?: LlmBfcUyarisi[];
    /**
     * Faz 4.5 — AI Değerlendirmesi bölümünü besler. Optional/undefined
     * olabilir: Faz 4.5 ÖNCESİ üretilmiş Firestore kayıtlarında bu alan
     * hiç yoktur (geriye dönük uyumluluk) — UI bu durumda "AI
     * Değerlendirmesi" bölümünü basitçe göstermez, diğer tüm bölümler
     * (riskler, hızlı bakış, vb.) normal çalışmaya devam eder.
     */
    executiveSummary?: LlmExecutiveSummary;
    /** Üretimde kullanılan provider adı (ör. 'anthropic') */
    provider: string;
    /** Üretim zamanı (ISO) */
    generatedAt: string;
    /** Token/maliyet görünürlüğü (geliştirici/debug amaçlı) */
    usage?: LlmUsageMetadata;
    /**
     * Dokümanın ne kadarının fiilen analiz edildiği — chunk'lı analizlerde
     * doldurulur. Optional: metin-tabanlı (Vision kullanılmayan) analizlerde
     * veya tek-parçalı (chunk gerekmeyen) analizlerde undefined kalabilir —
     * UI bu durumda kapsam banner'ını göstermez (varsayılan: tam okuma
     * varsayılır, çünkü chunk'lama HİÇ tetiklenmediyse zaten tüm gönderilen
     * içerik okunmuştur).
     */
    analizKapsami?: LlmAnalizKapsami;
  } | null;
}

export type TenderAnalysis =
  | TenderAnalysisSummary
  | TenderAnalysisExperience
  | TenderAnalysisGuarantee
  | TenderAnalysisRequiredDocuments
  | TenderAnalysisTechnicalRequirements
  | TenderAnalysisCriticalDates
  | TenderAnalysisAdministrativeMeta
  | TenderAnalysisRisks
  | TenderAnalysisAiSummary
  | TenderAnalysisCostItems
  | TenderAnalysisOfficialBillOfQuantities
  | TenderAnalysisConflicts
  | TenderAnalysisLlmAnalysis;

// ============================================================
// TenderItem — Birim Fiyat Cetveli satırı (9. bölüm)
// ============================================================

/**
 * companies/{companyId}/tenders/{tenderId}/items/{itemId}
 * Faz 3 itibarıyla bu koleksiyon yalnızca kullanıcı tarafından manuel
 * olarak doldurulur (spec: "Kullanıcı birim fiyatları manuel girebilmelidir").
 * Parser'ın bu koleksiyonu otomatik doldurması (birim fiyat cetveli çıkarımı)
 * kapsamı sonraki bir faza bırakılmıştır.
 */
export interface TenderItem {
  id: string;
  tenderId: string;
  companyId: string;

  /** Sıra No */
  orderNo: number;
  /** İş Kalemi açıklaması */
  description: string;
  /** Birim (adet, m2, gün, kişi vb.) */
  unit: string;
  /** Miktar */
  quantity: number;
  /** Birim Fiyat (TL) */
  unitPrice: number;
  /** KDV oranı (yüzde) — satır bazında seçilebilir: 0, 1, 10, 20. Varsayılan: 20 */
  vatRate: number;
  /** Ara Toplam = quantity * unitPrice (KDV HARİÇ, sunucu tarafında hesaplanır) */
  total: number;
  /** KDV Tutarı = total * (vatRate / 100) */
  vatAmount: number;
  /** Genel Satır Toplamı = total + vatAmount (KDV DAHİL) */
  grandTotal: number;

  /**
   * Bu satır parser tarafından mı yoksa kullanıcı tarafından manuel mi
   * eklendi. 'ai_approved' değeri, artık kaldırılmış olan "AI-BFC onay
   * akışı" özelliğinden (bkz. eski sprint: Vision LLM Merkezli Mimariye
   * Geçiş madde 3) kalma geçmiş kayıtlar için geriye dönük uyumluluk
   * amacıyla tipte tutulur — YENİ satırlar artık bu değerle oluşturulmaz.
   */
  source: 'parser' | 'manual' | 'ai_approved';

  /** Maliyet kategorisi (ör. "Baskı ve Görünürlük") — analizden aktarılan satırlarda dolu */
  category: string | null;
  /** Bu satırın hangi kaynak türünden geldiği — resmi cetvel mi, teknik maliyet kalemi mi, manuel mi */
  sourceType: CostItemSourceType | 'manual_entry';
  /** Eşleştirildiği resmi cetvel kalemi adı (varsa) */
  parentOfficialItemName: string | null;
  /** Kısa not (ölçü, malzeme vb.) */
  shortNote: string | null;
  /** İdari mi teknik şartnameden mi geldiği */
  sourceDocument: CostItemSourceDocument | null;
  /** Şartnamedeki madde referansı */
  sourceReference: string | null;
  /** Tespit güven skoru (manuel girişlerde null) */
  confidence: number | null;

  createdAt: string;
  updatedAt: string;
}

/** Tender item oluşturma/güncelleme isteği */
export interface UpsertTenderItemInput {
  orderNo: number;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  /** KDV oranı (yüzde) — 0, 1, 10 veya 20. Belirtilmezse 20 varsayılır. */
  vatRate?: number;
  /** Aşağıdaki alanlar opsiyoneldir; analiz önerisinden aktarılan satırlarda dolu gelir */
  category?: string | null;
  sourceType?: CostItemSourceType | 'manual_entry';
  parentOfficialItemName?: string | null;
  shortNote?: string | null;
  sourceDocument?: CostItemSourceDocument | null;
  sourceReference?: string | null;
  confidence?: number | null;
}

// ============================================================
// Activity — Aktivite / Audit Log
// ============================================================

export type ActivityType =
  | 'tender_created'
  | 'tender_updated'
  | 'tender_status_changed'
  | 'document_registered'
  | 'document_status_changed'
  | 'analysis_completed'
  | 'analysis_failed'
  | 'item_added'
  | 'item_updated'
  | 'item_deleted';

/**
 * companies/{companyId}/tenders/{tenderId}/activities/{activityId}
 * İhale üzerinde gerçekleşen olayların kronolojik kaydı.
 * Dashboard'daki "Son Analizler" / aktivite akışı için kullanılır.
 */
export interface Activity {
  id: string;
  tenderId: string;
  companyId: string;

  type: ActivityType;
  /** İnsan tarafından okunabilir özet (Türkçe) */
  message: string;
  /** Ek bağlamsal veri (örn. eski/yeni durum) */
  metadata: Record<string, unknown> | null;

  actorUid: string;
  actorName: string;
  actorRole: UserRole;

  createdAt: string;
}

// ============================================================
// AnalysisRun — Analiz Geçmişi
// ============================================================

export type AnalysisRunStatus = 'completed' | 'failed';

/**
 * companies/{companyId}/tenders/{tenderId}/analysisRuns/{runId}
 * Her "Analizi Başlat" çalıştırması bir kayıt oluşturur. Bu sayede
 * analiz geçmişi saklanır ve yeniden çalıştırma mümkün olur.
 * En güncel sonuçlar ayrıca analysis/{section} belgelerine de yazılır
 * (UI bu belgelerden okur); analysisRuns geçmiş/audit amaçlıdır.
 *
 * Faz 3.5 itibarıyla bu kayıt, Faz 4 LLM entegrasyonuna temiz veri
 * hazırlama amacını da taşır: ham şartname metinleri (rawAdministrativeText,
 * rawTechnicalText) ve Faz 3.5'te kesin olarak çıkarılan alanlar
 * (extractedFields, officialBoqItems) saklanır. Faz 4 geldiğinde LLM bu
 * ham metinleri kullanarak işin özeti, teknik yükümlülükler, risk analizi,
 * maliyet kırılımı ve fiyatlandırılabilir kalemleri üretecektir.
 */
export interface AnalysisRun {
  id: string;
  tenderId: string;
  companyId: string;

  status: AnalysisRunStatus;

  /** Girdi olarak kullanılan ham metinlerin uzunlukları (karakter) */
  administrativeTextLength: number;
  technicalTextLength: number;

  /** Faz 4'te LLM'in kullanacağı ham şartname metinleri (kısaltılmamış) */
  rawAdministrativeText: string | null;
  rawTechnicalText: string | null;

  /** Faz 3.5'te regex/rule-based olarak KESİN çıkarılan alanlar — idari meta, teminat, kritik tarihler */
  extractedFields: {
    administrativeMeta: NonNullable<TenderAnalysisAdministrativeMeta['data']> | null;
    guarantee: NonNullable<TenderAnalysisGuarantee['data']> | null;
    criticalDates: NonNullable<TenderAnalysisCriticalDates['data']> | null;
  } | null;

  /** Resmi Birim Fiyat Cetveli'nden çıkarılan satırlar */
  officialBoqItems: OfficialBillItem[];

  /** Bu çalıştırmada üretilen bölüm sayısı ve kaç tanesinin "found" olduğu */
  sectionsFound: number;
  sectionsTotal: number;

  /** İdari ve teknik şartname arasında tespit edilen çelişki sayısı (Dashboard'da gösterilir) */
  conflictCount: number;

  /**
   * Bu çalıştırmanın Faz 4 LLM analizi için hazır olup olmadığı —
   * ham metinlerden en az biri mevcutsa true. Faz 4 bu bayrağı kullanarak
   * hangi analizlerin LLM ile yeniden işlenmeye uygun olduğunu belirleyecek.
   */
  llmReady: boolean;

  /**
   * Faz 4 LLM analizinin bu çalıştırmadaki SONUCU — UI'ın placeholder mı,
   * gerçek kart içeriği mi, yoksa açık bir hata mı göstereceğine karar
   * vermesi için gereklidir:
   *   - 'not_attempted': llmReady=false olduğu için LLM hiç çağrılmadı
   *     (metin girilmemiş).
   *   - 'skipped_mock': provider 'mock' (LLM_PROVIDER=mock veya
   *     ANTHROPIC_API_KEY tanımsız) — bilinçli olarak gerçek analiz
   *     üretilmedi, bu bir HATA DEĞİLDİR.
   *   - 'completed': gerçek LLM çağrısı başarılı oldu, analysis/llmAnalysis
   *     section'ı yazıldı.
   *   - 'failed': gerçek bir LLM/API/şema hatası oluştu (bkz. llmErrorMessage)
   *     — UI bunu sessiz placeholder DEĞİL, açık hata olarak göstermelidir.
   */
  llmStatus: 'not_attempted' | 'skipped_mock' | 'completed' | 'failed';

  /** llmStatus='failed' ise, kullanıcıya gösterilecek/log'lanacak hata mesajı */
  llmErrorMessage: string | null;

  /** Super Admin > Kullanım / AI maliyeti ekranı için token ve maliyet metrikleri */
  provider?: string | null;
  model?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;

  errorMessage: string | null;

  triggeredBy: string; // uid
  triggeredByName: string;

  createdAt: string;
}

/** Analiz başlatma isteği gövdesi */
export interface RunAnalysisInput {
  administrativeText?: string | null;
  technicalText?: string | null;
}

