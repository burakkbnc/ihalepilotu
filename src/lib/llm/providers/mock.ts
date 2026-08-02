// ============================================================
// MockLLMProvider — Faz 4 test/geliştirme provider'ı (v2 — yapılandırılmış şema)
//
// Gerçek bir API çağrısı yapmaz. ANTHROPIC_API_KEY tanımlı olmadığında
// veya LLM_PROVIDER=mock seçildiğinde kullanılır. Faz 4 v2'nin
// yapılandırılmış JSON şemasına uygun, basit ve GÜVENLİ (maliyet/fiyat/
// öneri İÇERMEYEN) bir çıktı üretir — sadece şartnameden çıkarılan kesin
// alanlara dayanır, hiçbir şablon "analiz tamamlandı" gibi anlamsız metin
// üretmez. Bir alan için yeterli veri yoksa "tespit_edilemedi" döner.
// Token kullanımı raporlamaz (usage: undefined) — gerçek API çağrısı
// olmadığı için maliyet hesaplaması anlamsızdır.
// ============================================================
import type { LLMAnalysisRawJson, LLMAnalysisRequest, LLMAnalysisResult, LLMProvider } from '../provider';
import type {
  TenderAnalysisAdministrativeMeta,
  TenderAnalysisGuarantee
} from '@/types/tender';

const NOT_DETECTED = 'tespit_edilemedi';

function findSectionData<T>(sections: LLMAnalysisRequest['ruleBasedSections'], section: string): T | null {
  const found = sections.find((s) => s.section === section);
  return (found?.data as T) ?? null;
}

function emptyKriter() {
  return { sonuc: NOT_DETECTED, kaynak: NOT_DETECTED };
}

function findPercentNear(text: string | null, pattern: RegExp): string {
  if (!text) return NOT_DETECTED;
  const match = text.match(pattern);
  if (!match) return NOT_DETECTED;
  const value = match[1] || match[2] || match[3];
  return value ? `%${value.replace(',', '.')}` : NOT_DETECTED;
}

function hasTerm(text: string | null, pattern: RegExp): string {
  return text && pattern.test(text) ? 'Şartnamede istenmektedir.' : NOT_DETECTED;
}

export class MockLLMProvider implements LLMProvider {
  readonly name = 'mock';

  async generateAnalysis(request: LLMAnalysisRequest): Promise<LLMAnalysisResult> {
    const adminMeta = findSectionData<NonNullable<TenderAnalysisAdministrativeMeta['data']>>(
      request.ruleBasedSections,
      'administrativeMeta'
    );
    const guarantee = findSectionData<NonNullable<TenderAnalysisGuarantee['data']>>(
      request.ruleBasedSections,
      'guarantee'
    );

    // Mock provider gerçek bir dil modeli değildir — metni "okuyup"
    // anlamlandıramaz. Bu yüzden sadece zaten kesin olarak çıkarılmış
    // (rule-based) alanlara dayanan, dürüstçe sınırlı bir çıktı üretir.
    // Bu, kullanıcıyı yanıltacak sahte "analiz tamamlandı" mesajları
    // üretmemek için kasıtlı bir tasarım kararıdır.
    const geciciTeminatOrani = guarantee?.temporary.percent.value
      ? `%${guarantee.temporary.percent.value}`
      : NOT_DETECTED;
    const kesinTeminatOrani = guarantee?.final.percent.value ? `%${guarantee.final.percent.value}` : NOT_DETECTED;
    const nakitTeminatIban = guarantee?.temporary.iban.value ?? NOT_DETECTED;
    const aliciAdi = guarantee?.temporary.recipientInstitution.value ?? NOT_DETECTED;
    const teminatGecerlilikTarihi = guarantee?.temporary.validUntil.value ?? NOT_DETECTED;

    const combinedText = `${request.rawAdministrativeText ?? ''}
${request.rawTechnicalText ?? ''}`;
    const isDeneyimiOrani = findPercentNear(
      combinedText,
      /iş\s+deneyim[\s\S]{0,220}?(?:teklif\s+bedelinin|bedelin)?\s*%\s*(\d+(?:[.,]\d+)?)/i
    );
    const ciroYeterliligiOrani = findPercentNear(
      combinedText,
      /(?:ciro|iş\s+hacmi|toplam\s+ciro)[\s\S]{0,260}?(?:teklif\s+bedelinin|bedelin)?\s*%\s*(\d+(?:[.,]\d+)?)/i
    );

    const kismiTeklifSonuc =
      adminMeta?.partialBidAllowed.value !== null && adminMeta?.partialBidAllowed.value !== undefined
        ? adminMeta.partialBidAllowed.value
          ? 'Kısmi teklif verilebilmektedir.'
          : 'Kısmi teklif verilememektedir.'
        : NOT_DETECTED;
    const altYukleniciSonuc =
      adminMeta?.subcontractorAllowed.value !== null && adminMeta?.subcontractorAllowed.value !== undefined
        ? adminMeta.subcontractorAllowed.value
          ? 'Alt yüklenici kullanılabilmektedir.'
          : 'Alt yüklenici kullanılamamaktadır.'
        : NOT_DETECTED;
    const konsorsiyumSonuc =
      adminMeta?.consortiumAllowed.value !== null && adminMeta?.consortiumAllowed.value !== undefined
        ? adminMeta.consortiumAllowed.value
          ? 'Konsorsiyum olarak teklif verilebilmektedir.'
          : 'Konsorsiyum olarak teklif verilememektedir.'
        : NOT_DETECTED;

    const rawJson: LLMAnalysisRawJson = {
      hizli_bakis: {
        is_turu: NOT_DETECTED,
        katilim_durumu: NOT_DETECTED,
        one_cikan_risk: NOT_DETECTED,
        kritik_uyari: NOT_DETECTED
      },
      is_ozeti: {
        bu_is_ne: NOT_DETECTED,
        nerede_ne_zaman: NOT_DETECTED,
        yuklenici_ne_saglayacak: NOT_DETECTED
      },
      katilim_uygunlugu: {
        yerli_istekli_sarti: emptyKriter(),
        konsorsiyum: { sonuc: konsorsiyumSonuc, kaynak: NOT_DETECTED },
        alt_yuklenici: { sonuc: altYukleniciSonuc, kaynak: NOT_DETECTED },
        kismi_teklif: { sonuc: kismiTeklifSonuc, kaynak: NOT_DETECTED },
        elektronik_eksiltme: emptyKriter(),
        is_deneyimi: { sonuc: isDeneyimiOrani !== NOT_DETECTED ? `İş deneyimi oranı ${isDeneyimiOrani} olarak tespit edildi.` : NOT_DETECTED, kaynak: NOT_DETECTED }
      },
      mali_yeterlilik: {
        is_deneyimi_orani: isDeneyimiOrani,
        ciro_yeterliligi_orani: ciroYeterliligiOrani,
        bilanco_sarti: hasTerm(combinedText, /bilanço|bilanço\s+bilgileri/i),
        gelir_tablosu_sarti: hasTerm(combinedText, /gelir\s+tablosu|iş\s+hacmi|ciro/i),
        banka_referans_sarti: hasTerm(combinedText, /banka\s+referans/i)
      },
      teminat_analizi: {
        gecici_teminat_orani: geciciTeminatOrani,
        kesin_teminat_orani: kesinTeminatOrani,
        teminat_gecerlilik_tarihi: teminatGecerlilikTarihi,
        nakit_teminat_iban: nakitTeminatIban,
        alici_adi: aliciAdi,
        kabul_edilen_teminat_turleri: NOT_DETECTED,
        ceza_oranlari: NOT_DETECTED
      },
      riskler: [],
      teknik_yukumluluk: {
        kategoriler: [
          {
            baslik: 'Teknik Kapsam',
            maddeler: ['Demo modunda teknik kapsam, gerçek LLM anahtarıyla her şartnameye göre dinamik üretilir.'],
            kaynak: 'demo'
          }
        ],
        ulasim: [],
        konaklama: [],
        yemek: [],
        rehberlik: [],
        sigorta: [],
        baski_gorunurluk: [],
        hediyelik_ikram: []
      },
      gerekli_belgeler: []
    };

    return { rawJson, usage: undefined };
  }
}
