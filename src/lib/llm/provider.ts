// ============================================================
// LLM Servis Katmanı — Provider-Agnostic Interface (Faz 4)
//
// FAZ 4 MİMARİSİ — 3 KATMANLI GÜVENLİK:
//   Katman 1 (bu dosya + providers/*.ts): System prompt içinde LLM'e
//     maliyet tahmini, teklif fiyatı önerisi, yaklaşık maliyet, kazanma
//     olasılığı ve "bu ihaleye gir/girme" yorumu üretmesi AÇIKÇA yasaklanır.
//   Katman 2 (bu dosyadaki LLMAnalysisRawJson tipi): Şema seviyesinde
//     estimatedCost/suggestedBidPrice/bidRecommendation/winProbability
//     gibi alanlar HİÇ TANIMLANMAZ — yapısal olarak bu bilgilerin
//     saklanması/gösterilmesi mümkün değildir.
//   Katman 3 (llmAnalysis.ts -> sanitizeField/checkForbidden): LLM'den
//     dönen ham metin alındıktan sonra yasaklı kelime/kalıp taraması
//     yapılır; şüpheli bir alan tespit edilirse o alan "Bu alan güvenlik
//     nedeniyle gizlendi" ile değiştirilir, ham içerik hiçbir şekilde
//     kullanıcıya gösterilmez. NOT: Teminat Analizi'nin oran/IBAN/
//     geçerlilik tarihi gibi faktüel alt-alanları bu filtreye TABİ
//     DEĞİLDİR (şartnamede açıkça yazan resmi veridir, yorum değildir).
//
// Faz 4 v2 NOTU: Ham JSON şeması artık 8 düz string değil, kartlı/
// yapılandırılmış UI'ı besleyen iç içe alt-şemalardır (bkz. aşağıdaki
// LLMAnalysisRawJson). Bu, kullanıcının "yazı bloğu gibi görünmesin"
// geri bildirimine yanıt olarak yapılan bir tasarım değişikliğidir.
//
// Tasarım ilkeleri:
// - Parser (rule-based) katmanı LLM'den TAMAMEN bağımsızdır ve Faz 3.5
//   ekranlarını (Kritik Tarihler, Kesin Yakalanan İdari Bilgiler,
//   Katılım/Teklif Kuralları, Teminat Analizi, Resmi Birim Fiyat Cetveli)
//   üretmeye DEVAM EDER — bu refactor pipeline.ts'e dokunmaz.
// - LLM SADECE Faz 4 kartlı UI'ını besleyen bölümleri üretir: Hızlı
//   Bakış, İş Özeti, Katılım Uygunluğu, Teminat Analizi, Riskler, Teknik
//   Yükümlülükler, Gerekli Belgeler.
// - Kritik tarihler ve resmi cetvel LLM'den ASLA gelmez.
// ============================================================

import type { TenderAnalysisSection } from './sections';

/**
 * LLM'e gönderilecek bağlam — rule-based analiz sonuçları ve ham metin.
 * Provider implementasyonları bu veriyi kendi prompt formatına çevirir.
 */
export interface LLMAnalysisRequest {
  tenderTitle: string;
  /** Faz 3.5 rule-based extractor'ların ürettiği kesin alanlar (bağlam için LLM'e gösterilir, ama LLM bunları YENİDEN ÜRETMEZ) */
  ruleBasedSections: TenderAnalysisSection[];
  /** Normalize edilmemiş ham idari şartname metni */
  rawAdministrativeText: string | null;
  /** Normalize edilmemiş ham teknik şartname metni */
  rawTechnicalText: string | null;
  /**
   * SPRINT NOTU (Zeyilname/Düzeltme İlanı Desteği): zeyilname/düzeltme
   * ilanı dokümanlarının metni, KRONOLOJİK SIRAYLA (en eskiden en
   * yeniye) ve her biri kendi tarih etiketiyle birleştirilmiş hâli.
   * İdari/teknik metin bloklarından AYRIDIR — LLM'e bunun bir
   * GÜNCELLEME/DEĞİŞİKLİK kaynağı olduğu, orijinal metinle çelişen
   * maddelerde ESAS ALINMASI gerektiği açıkça belirtilir.
   */
  zeyilnameText: string | null;
  /**
   * Faz 3.5 regex/parser'ının çıkardığı resmi Birim Fiyat Cetveli satırları
   * — LLM'e SADECE çapraz-kontrol/bfc_uyarilari üretimi için bağlam olarak
   * verilir; LLM kendi okumasını (birim_fiyat_cetveli) bundan BAĞIMSIZ
   * olarak dokümandan üretir, bu listeyi kopyalamaz.
   */
  parserBoqItems?: Array<{ orderNo: number; name: string; unit: string | null; quantity: number | null }>;
  /**
   * SPRINT NOTU (Vision LLM merkezli mimari): Taranmış/görsel dokümanların
   * sayfa görüntüleri. Bunlar OCR'dan geçmez — Vision destekli provider'a
   * (bkz. providers/anthropic.ts) DOĞRUDAN görüntü olarak gönderilir. Bir
   * provider görsel girişi desteklemiyorsa (ör. gelecekteki bir metin-only
   * provider) bu alanı yok sayabilir; o durumda ilgili doküman analizde
   * eksik kalır (uydurma yapılmaz).
   */
  documentImages?: Array<{
    fileName: string;
    documentType: string;
    pages: Array<{ pageNumber: number; base64: string; mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' }>;
    /**
     * Bu dokümanın GERÇEK toplam sayfa sayısı (PDF ise) — `pages.length`
     * ile aynı olması beklenir (artık sessiz kesme yok). Farklıysa,
     * llmAnalysis.ts orkestrasyon katmanı bunu "kapsam" hesaplamasında
     * kullanır (bkz. LlmAnalizKapsami).
     */
    totalPdfPages?: number;
  }>;
  /**
   * SPRINT NOTU (mimari bug fix — chunk'lama): Bir dokümanın BÜYÜK bir
   * parçası (chunk'ı) için bu istek üretildiğinde doldurulur. Provider
   * (bkz. providers/anthropic.ts) bunu görürse, kullanıcı mesajına "bu
   * dokümanın X/Y parçasıdır, SADECE gördüğün sayfalardan çıkarım yap"
   * talimatını ekler. Chunk'lama gerekmiyorsa (doküman tek çağrıya
   * sığıyorsa) bu alan undefined kalır.
   */
  chunkInfo?: {
    chunkIndex: number;
    totalChunks: number;
    /** Kullanıcıya/loglara gösterilebilecek okunabilir aralık etiketi, ör. "Sayfa 16-30" */
    pageRangeLabel: string;
  };
}

/** C) Katılım Uygunluğu — ham JSON'daki tek bir checklist satırı. */
export interface RawKatilimKriteri {
  sonuc: string;
  kaynak: string;
}

/**
 * E) Riskler — ham JSON'daki tek bir risk öğesi.
 *
 * Faz 4.5: risk_skoru/etki/olasilik eklendi (kullanıcı talebi — risk
 * sıralama, filtreleme, skor ortalaması, ihaleler arası karşılaştırma
 * için). Bu alanlar maliyet tahmini veya teklif önerisi ÜRETMEZ; sadece
 * şartnamede belirtilen riskin GÖRELİ önemini ifade eder. Optional
 * tanımlanır — eski/uyumsuz provider çıktılarında bu alanlar
 * gelmeyebilir, llmAnalysis.ts bu durumda güvenli bir varsayılana düşer
 * (geriye dönük uyumluluk).
 */
export interface RawRiskOgesi {
  baslik: string;
  seviye: 'düşük' | 'orta' | 'yüksek';
  aciklama: string;
  kaynak: string;
  risk_skoru?: number;
  etki?: 'düşük' | 'orta' | 'yüksek';
  olasilik?: 'düşük' | 'orta' | 'yüksek';
  /**
   * SPRINT NOTU (Aşama A — dedup altyapısı): Teknik altyapı alanı, SADECE
   * tekrar eden kayıtları tespit etmek (dedup/merge) için kullanılır —
   * UI'da GÖSTERİLMEZ. Bu maddenin dayandığı şartname madde/sıra numarası
   * (ör. "7.3"). Emin değilsen boş bırak/gönderme; UYDURMA.
   */
  kaynak_madde?: string;
  /**
   * SPRINT NOTU (Aşama A — dedup altyapısı): Teknik altyapı alanı, SADECE
   * dedup için kullanılır — UI'da GÖSTERİLMEZ. Bu konuyu normalize eden
   * KISA (2-4 kelime, alt çizgiyle) bir etiket (ör. "saglik_hizmeti").
   * Aynı konuyu farklı chunk'lar farklı başlıkla üretse bile bu etiket
   * TUTARLI olmalı.
   */
  konu_etiketi?: string;
}

/** G) Gerekli Belgeler — ham JSON'daki tek bir belge satırı. */
export interface RawGerekliBelge {
  belge_adi: string;
  durum: string;
  kaynak: string;
  /** Aşama A — dedup altyapısı (bkz. RawRiskOgesi.kaynak_madde). UI'da gösterilmez. */
  kaynak_madde?: string;
  /** Aşama A — dedup altyapısı (bkz. RawRiskOgesi.konu_etiketi). UI'da gösterilmez. */
  konu_etiketi?: string;
}

/**
 * LLM'den (parse edilmeden önce) beklenen ham JSON şeması. Bilinçli olarak
 * estimatedCost / suggestedBidPrice / bidRecommendation / winProbability
 * gibi alanlar İÇERMEZ — bu tip Faz 4 güvenlik mimarisinin katman 2'sidir.
 */
/**
 * Faktüel bir alan için LLM'den beklenen ham şekil: hem değeri hem de
 * (varsa) kaynağını taşır. Geriye dönük uyumluluk için düz string de
 * kabul edilir (kaynak o durumda boş kalır).
 */
export type RawFaktuelAlan = string | { deger?: string; kaynak?: string };

export interface LLMAnalysisRawJson {
  hizli_bakis: {
    is_turu: string;
    katilim_durumu: string;
    one_cikan_risk: string;
    kritik_uyari: string;
  };
  is_ozeti: {
    bu_is_ne: string;
    nerede_ne_zaman: string;
    yuklenici_ne_saglayacak: string;
  };
  katilim_uygunlugu: {
    yerli_istekli_sarti: RawKatilimKriteri;
    konsorsiyum: RawKatilimKriteri;
    alt_yuklenici: RawKatilimKriteri;
    kismi_teklif: RawKatilimKriteri;
    elektronik_eksiltme: RawKatilimKriteri;
    is_deneyimi: RawKatilimKriteri;
  };
  mali_yeterlilik: {
    is_deneyimi_orani: RawFaktuelAlan;
    ciro_yeterliligi_orani: RawFaktuelAlan;
    bilanco_sarti: RawFaktuelAlan;
    gelir_tablosu_sarti: RawFaktuelAlan;
    banka_referans_sarti: RawFaktuelAlan;
  };
  teminat_analizi: {
    gecici_teminat_orani: RawFaktuelAlan;
    kesin_teminat_orani: RawFaktuelAlan;
    teminat_gecerlilik_tarihi: RawFaktuelAlan;
    nakit_teminat_iban: RawFaktuelAlan;
    alici_adi: RawFaktuelAlan;
    kabul_edilen_teminat_turleri: RawFaktuelAlan;
    ceza_oranlari: RawFaktuelAlan;
  };
  riskler: RawRiskOgesi[];
  /**
   * H) LLM'in dokümanları okurken fark ettiği çelişkiler — aynı alanın
   * idari/teknik dokümanlarda (veya aynı dokümanın farklı yerlerinde)
   * farklı değerlerle geçmesi. Optional — çelişki yoksa boş dizi.
   */
  celiskiler?: Array<{
    alan?: string;
    idari_deger?: string;
    teknik_deger?: string;
    aciklama?: string;
  }>;
  /**
   * Birim Fiyat Cetveli — LLM'in şartname içindeki tabloyu semantik
   * olarak okuyarak ürettiği satırlar. Parser/regex çıktısının YERİNE
   * GEÇMEZ; ayrı, çapraz-doğrulama amaçlı bir okumadır. Optional —
   * cetvel bulunamazsa boş dizi veya alan hiç gelmeyebilir.
   */
  birim_fiyat_cetveli?: Array<{
    sira_no?: string;
    kalem_adi?: string;
    birim?: string;
    miktar?: string;
    birim_fiyat?: string;
    kdv_orani?: string;
    toplam_tutar?: string;
    kaynak?: string;
    guven_seviyesi?: 'düşük' | 'orta' | 'yüksek';
  }>;
  /**
   * LLM'in kendi BFC okuması ile kendisine bağlam olarak verilen
   * parser/regex BFC çıktısı arasında fark ettiği tutarsızlıklar.
   */
  bfc_uyarilari?: Array<{
    kalem_adi?: string;
    parser_degeri?: string;
    ai_degeri?: string;
    aciklama?: string;
  }>;
  /**
   * SPRINT NOTU (Zeyilname/Düzeltme İlanı Desteği): zeyilname/düzeltme
   * ilanı ile değişen veya iptal edilen maddeler. Optional — zeyilname
   * bağlamı verilmediyse veya değişiklik yoksa boş dizi.
   */
  zeyilname_degisiklikleri?: Array<{
    alan?: string;
    orijinal_deger?: string;
    guncel_deger?: string;
    zeyilname_kaynagi?: string;
    durum?: 'degistirildi' | 'iptal_edildi';
  }>;
  /**
   * Özel Gereklilik Kartları — sabit kategori listesi YOKTUR, LLM
   * dokümanda gerçekten bulduğu özel/standart-dışı hükümleri serbestçe
   * kategorize eder. Optional — hiçbir özel hüküm bulunamazsa boş dizi.
   */
  ozel_gereklilikler?: Array<{
    baslik?: string;
    kategori_tipi?: string;
    onem_derecesi?: 'kritik' | 'orta' | 'dusuk';
    aciklama?: string;
    teklif_etkisi?: string;
    maliyet_etkisi?: string;
    operasyon_etkisi?: string;
    gerekli_belgeler?: string[];
    ilgili_kalemler?: string[];
    kaynak?: string;
    kullanici_aksiyonu?: string;
    /** Aşama A — dedup altyapısı (bkz. RawRiskOgesi.kaynak_madde). UI'da gösterilmez. */
    kaynak_madde?: string;
    /** Aşama A — dedup altyapısı (bkz. RawRiskOgesi.konu_etiketi). UI'da gösterilmez. */
    konu_etiketi?: string;
  }>;
  teknik_yukumluluk: {
    kategoriler?: Array<{ baslik?: unknown; maddeler?: unknown; kaynak?: unknown }>;
    ulasim?: string[];
    konaklama?: string[];
    yemek?: string[];
    rehberlik?: string[];
    sigorta?: string[];
    baski_gorunurluk?: string[];
    hediyelik_ikram?: string[];
  };
  gerekli_belgeler: RawGerekliBelge[];
  /**
   * Faz 4.5: LLM'in şartnamenin TAMAMINI değerlendirerek ürettiği
   * yönetici özeti — kullanıcının ilk bakışta "bu iş ne?" sorusunu
   * cevaplayan iş/program kapsamı özetidir. Risk/teminat/yeterlilik
   * uyarıları bu metnin konusu değildir; onlar ayrı kartlarda gösterilir.
   * Optional — eski provider çıktılarında (geriye dönük uyumluluk)
   * bulunmayabilir.
   */
  executive_summary?: {
    genel_ozet: string;
    genel_risk_skoru: number;
    risk_seviyesi: 'düşük' | 'orta' | 'yüksek';
    katilim_durumu: 'uygun' | 'sartli' | 'uygun_degil';
    onerilen_odaklar: string[];
  };
}

/** Bir LLM API çağrısının token kullanımı — sağlayıcı tarafından raporlanır. */
export interface LLMUsage {
  /** Kullanılan model adı (ör. 'claude-sonnet-4-6') */
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/** generateAnalysis()'in dönüş değeri — ham JSON + token kullanımı (varsa). */
export interface LLMAnalysisResult {
  rawJson: LLMAnalysisRawJson;
  usage?: LLMUsage;
}

/**
 * Tüm LLM provider implementasyonlarının uyması gereken arayüz.
 */
export interface LLMProvider {
  /** Provider tanımlayıcısı — ör. 'mock', 'anthropic', 'openai', 'gemini' */
  readonly name: string;

  /**
   * Şartname metinlerine ve rule-based bağlama dayanarak Faz 4'ün
   * yapılandırılmış kartlı UI'ını besleyen JSON'u üretir. Dönüş değeri
   * HAM (doğrulanmamış) JSON + (varsa) token kullanım bilgisidir —
   * output validation (katman 3) çağıran kod tarafından (llmAnalysis.ts)
   * ayrıca uygulanır.
   */
  generateAnalysis(request: LLMAnalysisRequest): Promise<LLMAnalysisResult>;
}
