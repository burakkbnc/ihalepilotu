// ============================================================
// AnthropicProvider — Faz 4 Gerçek Entegrasyon (v2)
//
// ANTHROPIC_API_KEY ortam değişkeninden okunur (.env.local). Gerçek bir
// Claude API çağrısı yapar, dönen metni JSON olarak parse eder ve token
// kullanım bilgisini (varsa) geri döner (geliştirici/debug maliyet
// görünürlüğü için, bkz. llmAnalysis.ts -> estimateCostUsd).
//
// Güvenlik katmanları (bkz. ../provider.ts ve ../llmAnalysis.ts):
//   - Katman 1 (system prompt): buildSystemPrompt() ile sağlanır, bu
//     provider sadece iletir, içeriğini değiştirmez.
//   - Katman 2 (şema): LLMAnalysisRawJson tipinde maliyet/fiyat alanı yok.
//   - Katman 3 (output validation): bu provider'ın SORUMLULUĞUNDA DEĞİL —
//     llmAnalysis.ts -> runLlmAnalysis() çağıran kod tarafında uygulanır.
//     Bu provider sadece ham JSON'ı döner, hiçbir filtreleme yapmaz.
// ============================================================
import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt, summarizeRuleBasedContext, parseRawJson } from '../llmAnalysis';
import type { LLMAnalysisRequest, LLMAnalysisResult, LLMProvider } from '../provider';

export const ANTHROPIC_MODEL = 'claude-sonnet-4-6';

// GEÇİCİ (Sprint 11A sonrası doğrulama): cache hit/miss debug logları
// SADECE development'ta basılır — bkz. generateAnalysis() içindeki
// [cache-debug] logu. Production'da bu bayrak false olur, hiçbir ek log
// yazdırılmaz.
const IS_DEV = process.env.NODE_ENV !== 'production';
// KÖK NEDEN DÜZELTMESİ: "Unexpected end of JSON input" hatası 8000
// token'da bile devam ediyordu — asıl sorun sadece token sınırı değil,
// prompt'un kendisinin uzun/çok-talimatlı olmasıydı (6 ayrı yasak
// paragrafı + istisna açıklaması + ayrı "uzunluk kuralları" + ayrı
// "format kuralları" + her alan için ayrı açıklama metni). Model bu
// kadar talimatı işlerken üretimi gereksiz uzatabiliyor ve toplam yanıt
// 8000 token'ı bile zorlayabiliyordu. Çözüm iki parçalı: (1) prompt
// llmAnalysis.ts -> buildSystemPrompt() içinde büyük ölçüde sadeleştirildi
// (kurallar tek satırda, alan açıklamaları şemanın içine inline gömülü,
// "≤180 karakter" ve "en fazla 5 öğe" kuralları doğrudan şemada), (2)
// MAX_TOKENS 8000'de bırakıldı (kullanıcı önerisi: 6000-8000 aralığı) —
// artık kısaltılmış prompt ile bu sınır rahatlıkla yeterli olmalı.
//
// GÜNCELLEME (Birim Fiyat Cetveli LLM şemasına eklendi): cetvel satırları
// (en fazla 30 satır, satır başına 8 alan) + bfc_uyarilari eklendiği için
// MAX_TOKENS 11000 -> 14000'e çıkarıldı. Cetvel çok uzunsa model kendi
// güven seviyesini düşürüp kısa tutmalı (prompt kuralı) ama yine de üst
// sınır yükseltildi; stop_reason='max_tokens' hâlâ açık hata olarak
// fırlatılır.
// GÜNCELLEME (Özel Gereklilik Kartları eklendi): en fazla 10 kart × ~9
// alan (bazıları 200-300 karakter) eklendiği için MAX_TOKENS 14000 ->
// 18000'e çıkarıldı. stop_reason='max_tokens' hâlâ açık hata olarak
// fırlatılır, sessizce yutulmaz.
// GÜNCELLEME (Sprint 10 — kart birleştirme/tekrar temizliği): ozel_gereklilikler
// üst sınırı 10 -> 15 kart'a çıkarıldı, chunk boyutu da 15 -> 30 sayfaya
// çıkarıldığı için (bkz. llmAnalysis.ts CHUNK_PAGE_SIZE) tek bir chunk
// artık daha fazla konu görebiliyor. Güvenlik payı için MAX_TOKENS
// 18000 -> 20000'e çıkarıldı.
const MAX_TOKENS = 20000;
// Şartname metinleri çok uzun olabilir; tek bir analiz çağrısında modele
// gönderilecek karakter sayısını sınırlıyoruz (maliyet/performans için).
// Bu sınır Faz 3.5'in kesin alan çıkarımını ETKİLEMEZ — sadece LLM'e
// gönderilen bağlamı sınırlar.
const MAX_TEXT_CHARS_PER_DOCUMENT = 90000;
const MAX_EXCERPT_CHARS_PER_DOCUMENT = 70000;

// GÜNCELLEME (Vision LLM merkezli mimari): Taranmış/görsel dokümanlar
// artık OCR metnine çevrilmeden, sayfa görüntüleri olarak DOĞRUDAN bu
// provider'a gönderilir (bkz. request.documentImages). Görsel başına
// token maliyeti olduğu için toplam görüntü sayısı sınırlanır.
const MAX_TOTAL_IMAGES_PER_REQUEST = 40;

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';

  constructor(private readonly apiKey: string) {}

  async generateAnalysis(request: LLMAnalysisRequest): Promise<LLMAnalysisResult> {
    const client = new Anthropic({ apiKey: this.apiKey });

    const userContent = buildUserMessageContent(request);

    let responseText: string;
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    let stopReason: string | null | undefined;

    try {
      console.log(`[llm/anthropic] API çağrısı gönderiliyor (model=${ANTHROPIC_MODEL}, max_tokens=${MAX_TOKENS}).`);

      const response = await client.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: MAX_TOKENS,
        // SPRINT NOTU (Aşama A — Prompt Cache): system promptu (~5.500
        // token, bkz. buildSystemPrompt) HER çağrıda BAYT BAYT AYNIDIR —
        // chunk'a, dokümana hatta tenderId'ye bile bağlı değildir. Bu
        // yüzden `cache_control: { type: 'ephemeral' }` ile işaretlenir;
        // Anthropic API bu prefiksi cache'e yazar/okur, tekrarlanan
        // (aynı süreç içindeki chunk'lı) çağrılarda bu bloğun maliyetini
        // önemli ölçüde düşürür. `as any`, SDK'nın sürüm bazlı katı tip
        // tanımını (cache_control alanı bazı SDK sürümlerinde henüz
        // tiplenmemiş olabilir) aşmak içindir, çalışma zamanı davranışını
        // ETKİLEMEZ.
        system: [
          { type: 'text', text: buildSystemPrompt(), cache_control: { type: 'ephemeral' } }
        ] as any,
        // NOT: userContent tipimiz (AnthropicContentBlock[]) SDK'nın kendi
        // ContentBlockParam birleşimiyle yapısal olarak uyumludur; `as any`
        // burada SADECE SDK sürüm farklarında olası aşırı-katı tip
        // uyuşmazlıklarını önlemek içindir, çalışma zamanı davranışını
        // ETKİLEMEZ (gönderilen JSON şekli değişmez).
        messages: [{ role: 'user', content: userContent as any }]
      });

      // stop_reason Anthropic SDK'sının standart alanıdır. 'max_tokens'
      // değeri, yanıtın token sınırına çarpıp YARIDA KESİLDİĞİNİ gösterir
      // — bu durumda JSON parse hatası ("Unexpected end of JSON input")
      // bir SEMPTOMDUR, asıl sorun budur. Kullanıcı talebi #5 ve #6:
      // bu durum loglanmalı ve ayrı, net bir hata olarak gösterilmelidir.
      stopReason = (response as unknown as { stop_reason?: string | null }).stop_reason;

      const usage = (response as unknown as {
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          cache_read_input_tokens?: number;
          cache_creation_input_tokens?: number;
        };
      }).usage;
      inputTokens = usage?.input_tokens;
      outputTokens = usage?.output_tokens;

      console.log(
        `[llm/anthropic] Yanıt metadata — stop_reason=${stopReason ?? 'bilinmiyor'}, inputTokens=${inputTokens ?? '?'}, outputTokens=${outputTokens ?? '?'}.`
      );

      // GEÇİCİ (Sprint 11A sonrası doğrulama talebi): Prompt cache'in
      // gerçekten devreye girip girmediğini gerçek şartname testlerinde
      // gözlemlemek için `cache_read_input_tokens` (cache'ten okunan —
      // 0'dan büyükse HIT) ve `cache_creation_input_tokens` (cache'e
      // yazılan — ilk/ısıtma isteğinde beklenir) SADECE development
      // ortamında (`NODE_ENV !== 'production'`) loglanır. Production'da
      // hiçbir şey yazdırmaz — bu telemetri kalıcı bir özellik DEĞİLDİR,
      // sadece doğrulama amaçlı geçici bir gözlem noktasıdır.
      if (IS_DEV) {
        const cacheRead = usage?.cache_read_input_tokens ?? 0;
        const cacheCreation = usage?.cache_creation_input_tokens ?? 0;
        console.log(
          `[llm/anthropic][cache-debug] cache_read_input_tokens=${cacheRead} (>0 ise CACHE HIT) | ` +
            `cache_creation_input_tokens=${cacheCreation} (>0 ise bu istek cache'e YAZDI)${cacheRead === 0 && cacheCreation === 0 ? ' | UYARI: ne okuma ne yazma — cache_control hiç etkili olmamış olabilir' : ''}`
        );
      }

      const textBlock = response.content.find((block) => block.type === 'text');

      // Kullanıcı talebi #2: content[0].text boş veya eksik geliyorsa
      // açık hata ver — sessizce devam etme.
      if (!textBlock || textBlock.type !== 'text' || !textBlock.text || textBlock.text.trim().length === 0) {
        console.error(
          '[llm/anthropic] API yanıtında metin bloğu bulunamadı veya BOŞ. Ham content:',
          JSON.stringify(response.content)
        );
        throw new Error('Anthropic API yanıtında metin bloğu bulunamadı veya boş geldi (content[0].text eksik).');
      }
      responseText = textBlock.text;

      // Kullanıcı talebi #5: response length, stop_reason, ilk/son 500
      // karakter — JSON parse'dan ÖNCE loglanır (truncation'ı parse
      // hatasından önce teşhis edebilmek için).
      console.log(`[llm/anthropic] Ham yanıt uzunluğu: ${responseText.length} karakter.`);
      console.log('[llm/anthropic] Ham yanıt — ilk 500 karakter:', responseText.slice(0, 500));
      console.log('[llm/anthropic] Ham yanıt — son 500 karakter:', responseText.slice(-500));
    } catch (err) {
      throw new Error(
        `Anthropic API çağrısı başarısız oldu: ${err instanceof Error ? err.message : 'bilinmeyen hata'}`
      );
    }

    // Kullanıcı talebi #6: stop_reason='max_tokens' ise net, eyleme
    // geçirilebilir bir hata fırlat — generic "API çağrısı başarısız
    // oldu" veya "JSON değil" hatasıyla KARIŞTIRILMASIN, bu yüzden dış
    // try/catch'in DIŞINDA, kendi başına net bir mesajla fırlatılır.
    if (stopReason === 'max_tokens') {
      throw new Error(
        'LLM çıktısı token limitine takıldı (stop_reason=max_tokens), yanıt yarıda kesildi. ' +
          'Analiz daha kısa bir şema ile tekrar denenmeli — şartname metni çok uzunsa kısaltmayı ' +
          'veya MAX_TOKENS sınırını artırmayı değerlendirin.'
      );
    }

    let rawJson;
    try {
      rawJson = parseRawJson(responseText);
    } catch (err) {
      // JSON parse/şema hatası — ham yanıtı TAMAMEN logla (yukarıdaki
      // kısaltılmış log yeterli olmayabilir, hata durumunda tam metin
      // gereklidir). Bu hata yukarı (llmAnalysis.ts -> route.ts) fırlatılır
      // ve run.llmStatus='failed' + llmErrorMessage olarak UI'a yansır —
      // sessizce yutulmaz.
      console.error(
        `[llm/anthropic] JSON ayrıştırma başarısız (stop_reason=${stopReason ?? 'bilinmiyor'}). Tam ham yanıt:`,
        responseText
      );
      throw err;
    }

    return {
      rawJson,
      usage:
        inputTokens !== undefined && outputTokens !== undefined
          ? { model: ANTHROPIC_MODEL, inputTokens, outputTokens }
          : undefined
    };
  }
}

type AnthropicCacheControl = { type: 'ephemeral' };

type AnthropicContentBlock =
  | { type: 'text'; text: string; cache_control?: AnthropicCacheControl }
  | {
      type: 'image';
      source: { type: 'base64'; media_type: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'; data: string };
      cache_control?: AnthropicCacheControl;
    };

function buildUserMessageContent(request: LLMAnalysisRequest): AnthropicContentBlock[] {
  const adminText = buildDocumentIntelligenceContext(request.rawAdministrativeText, 'idari', MAX_EXCERPT_CHARS_PER_DOCUMENT);
  const techText = buildDocumentIntelligenceContext(request.rawTechnicalText, 'teknik/ek', MAX_EXCERPT_CHARS_PER_DOCUMENT);
  const zeyilnameText = request.zeyilnameText && request.zeyilnameText.trim() ? request.zeyilnameText.trim() : null;
  const ruleBasedContext = summarizeRuleBasedContext(request.ruleBasedSections);
  const parserBoqContext = summarizeParserBoqContext(request.parserBoqItems);
  const hasImages = !!request.documentImages && request.documentImages.length > 0;

  // ============================================================
  // SPRINT NOTU (Aşama A — Prompt Cache): Aşağıdaki `stableParts` bloğu,
  // AYNI dokümanın farklı chunk'ları arasında (ve hatta aynı dokümanın
  // tekrar analiz edilmesi durumunda) BAYT BAYT AYNI kalır — tenderTitle,
  // genel talimatlar, admin/teknik ham metin, zeyilname metni, parser
  // bağlamı hepsi chunk'tan BAĞIMSIZDIR (bkz. llmAnalysis.ts
  // runLlmAnalysis — chunk'lama SADECE documentImages'ı böler, metni
  // DEĞİL). Bu yüzden bu blok `cache_control: { type: 'ephemeral' }` ile
  // işaretlenir ve ayrı, SABİT SIRADA duran bir content block olarak
  // gönderilir — chunk'a özel değişken içerik (parça uyarısı, görüntüler)
  // bu bloktan SONRA gelir. Böylece Anthropic API bu prefiksi cache'ten
  // okuyabilir (aynı dokümanın chunk'ları arasında tekrarlanan sistem
  // promptu + bağlam maliyetini düşürür). Chunk'lı analizlerde
  // llmAnalysis.ts ayrıca ilk chunk'ı tek başına gönderip cache'i
  // "ısıtır", sonra kalanları paralel ateşler (bkz. runLlmAnalysis) —
  // TAM eşzamanlı gönderilen isteklerin cache'i ıskalayabileceği riskine
  // karşı düşük riskli bir önlem.
  // ============================================================
  const stableParts: string[] = [
    `İhale Başlığı: ${request.tenderTitle}`,
    '',
    'ANALİZ YAKLAŞIMI:',
    '- Bu ihale bağımsızdır; hiçbir hazır ihale türüne veya eski kategori şablonuna sokma.',
    '- Önce dokümanın kendi başlık/madde yapısını anla, sonra JSON alanlarını doldur.',
    '- Teknik yükümlülükleri sadece teknik_yukumluluk.kategoriler dizisinde dinamik başlıklarla ver; eski sabit alanları boş dizi bırak.',
    '- Resmi birim fiyat cetveli ayrı dosyada, ek belgede veya şartnamenin içinde olabilir; TABLOYU KENDİN OKU ve birim_fiyat_cetveli dizisini üret (tablo bozuk/taranmış olsa bile okuyabildiğin satırları çıkar, okuyamadığın hücreleri "tespit_edilemedi" bırak, satır/miktar/birim UYDURMA).',
    '- Aşağıdaki "ZATEN ÇIKARILMIŞ KESİN ALANLAR" ve "PARSER\'IN OKUDUĞU RESMİ CETVEL" blokları regex/kural tabanlı bir ön-çıkarımdır, SADECE bağlam/çapraz kontrol amaçlıdır — senin okumanın yerine geçmez. Kendi okuman bu bloklardaki bir değerle çelişiyorsa kendi okumana güven; genel alanlar için celiskiler dizisine, BFC satırları için bfc_uyarilari dizisine ekle.'
  ];

  if (zeyilnameText) {
    stableParts.push(
      '- ÖNEMLİ: Aşağıda bir "ZEYİLNAME / DÜZELTME İLANI" bloğu var. Bu, orijinal şartnameyi GÜNCELLEYEN/İPTAL EDEN bir dokümandır — sistem talimatındaki "ZEYİLNAME / DÜZELTME İLANI ÖNCELİK KURALI"nı UYGULA: değişen maddelerde GÜNCEL değeri esas al, iptal edilen maddeleri analiz dışı bırak, tüm değişiklikleri zeyilname_degisiklikleri dizisine ekle.'
    );
  }

  if (hasImages) {
    stableParts.push(
      '- Aşağıda bazı dokümanların METNİ DEĞİL, SAYFA GÖRÜNTÜLERİ verilmiştir (taranmış/görsel doküman — OCR YAPILMADI, görüntüleri doğrudan SEN okuyorsun). Her görüntü öncesinde hangi dokümana/sayfaya ait olduğunu belirten bir metin etiketi var. Bu sayfaları normal bir şartname okur gibi dikkatle oku; kaynak alanlarında artık gerçek sayfa numarasını yazabilirsin (ör. "Sayfa 3"), madde no bulamıyorsan sayfa numarası yeterlidir.'
    );
  }

  if (adminText) stableParts.push(`\n--- İDARİ DOKÜMAN AKILLI KESİTLERİ (METİN) ---\n${adminText}`);
  if (techText) stableParts.push(`\n--- TEKNİK / EK DOKÜMAN AKILLI KESİTLERİ (METİN) ---\n${techText}`);
  if (zeyilnameText) {
    stableParts.push(
      `\n--- ZEYİLNAME / DÜZELTME İLANI (KRONOLOJİK SIRAYLA, EN SONUNCUSU EN GÜNCELDİR — orijinal metinle çelişirse BUNU esas al) ---\n${zeyilnameText}`
    );
  }

  stableParts.push(
    `\n--- ZATEN ÇIKARILMIŞ KESİN ALANLAR (bağlam için; ilgili JSON alanlarına aynen yansıt, çelişkiye düşme) ---\n${ruleBasedContext}`
  );

  if (parserBoqContext) {
    stableParts.push(
      `\n--- PARSER'IN OKUDUĞU RESMİ CETVEL (sadece çapraz kontrol/bfc_uyarilari için bağlam; birim_fiyat_cetveli'ni SEN dokümandan üret) ---\n${parserBoqContext}`
    );
  }

  const stableText = stableParts.join('\n');

  // Chunk'a ÖZEL, değişken içerik — SABİT bloktan SONRA gelir, cache
  // breakpoint'ini bozmaması için AYRI bir content block'tur.
  const variableParts: string[] = [];
  if (request.chunkInfo) {
    variableParts.push(
      `⚠️ PARÇALI DOKÜMAN UYARISI (ÇOK ÖNEMLİ): Bu doküman büyük olduğu için ${request.chunkInfo.totalChunks} parçaya bölündü. Sen şu an SADECE ${request.chunkInfo.chunkIndex}/${request.chunkInfo.totalChunks}. parçayı görüyorsun (${request.chunkInfo.pageRangeLabel}). Dokümanın GERİ KALANINI GÖREMİYORSUN.`,
      '- SADECE bu parçada gördüğün sayfalardan çıkarım yap. Diğer parçalarda olabilecek bilgiyi TAHMİN ETME veya "muhtemelen vardır" diye UYDURMA.',
      '- Bu parçada bir alan için bilgi göremiyorsan (ör. teminat, katılım şartları başka bir parçada olabilir) o alanı "tespit_edilemedi" bırak — bu NORMAL bir durumdur, senin bu parçada göremediğin anlamına gelir, dokümanda hiç yok anlamına GELMEZ. Sonuçlar daha sonra diğer parçalarla otomatik olarak birleştirilecektir.',
      '- Riskler, özel gereklilikler, teknik yükümlülük kategorileri gibi dizi alanlarını SADECE bu parçada gördüğün maddelerden üret; eksiksiz/kapsamlı olmaya çalışma, sadece BU PARÇANIN içeriğini doğru yansıt.'
    );
  }

  const blocks: AnthropicContentBlock[] = [{ type: 'text', text: stableText, cache_control: { type: 'ephemeral' } }];

  if (!hasImages) {
    variableParts.push('\nYukarıdaki bilgilere dayanarak, sistem talimatındaki JSON şemasını üret.');
    blocks.push({ type: 'text', text: variableParts.join('\n') });
    return blocks;
  }

  // --- Multimodal içerik: SABİT blok (cache'li) + chunk'a özel blok + görüntü blokları ---
  if (variableParts.length > 0) {
    blocks.push({ type: 'text', text: variableParts.join('\n') });
  }

  let imageCount = 0;
  for (const doc of request.documentImages!) {
    if (imageCount >= MAX_TOTAL_IMAGES_PER_REQUEST) break;
    const isZeyilname = doc.documentType === 'zeyilname';
    blocks.push({
      type: 'text',
      text: isZeyilname
        ? `\n--- GÖRÜNTÜ DOKÜMANI (ZEYİLNAME/DÜZELTME İLANI — ÖNCELİK KURALI GEÇERLİDİR): "${doc.fileName}" — ${doc.pages.length} sayfa ---`
        : `\n--- GÖRÜNTÜ DOKÜMANI: "${doc.fileName}" (${doc.documentType}) — ${doc.pages.length} sayfa ---`
    });
    for (const page of doc.pages) {
      if (imageCount >= MAX_TOTAL_IMAGES_PER_REQUEST) break;
      blocks.push({ type: 'text', text: `Sayfa ${page.pageNumber}:` });
      blocks.push({
        type: 'image',
        source: { type: 'base64', media_type: page.mediaType, data: page.base64 }
      });
      imageCount += 1;
    }
  }

  blocks.push({
    type: 'text',
    text: '\nYukarıdaki metin bağlamı VE sayfa görüntülerine dayanarak, sistem talimatındaki JSON şemasını üret.'
  });

  return blocks;
}

function summarizeParserBoqContext(items: LLMAnalysisRequest['parserBoqItems']): string | null {
  if (!items || items.length === 0) return null;
  return JSON.stringify(
    items.slice(0, 60).map((i) => ({ sira: i.orderNo, ad: i.name, birim: i.unit, miktar: i.quantity })),
    null,
    0
  );
}

function buildDocumentIntelligenceContext(text: string | null, label: string, maxChars: number): string | null {
  if (!text || !text.trim()) return null;
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (normalized.length <= MAX_TEXT_CHARS_PER_DOCUMENT) return normalized;

  const windows: string[] = [];
  const addWindow = (title: string, start: number, size: number) => {
    const safeStart = Math.max(0, start);
    const chunk = normalized.slice(safeStart, safeStart + size).trim();
    if (!chunk) return;
    const key = chunk.slice(0, 600);
    if (windows.some((w) => w.includes(key))) return;
    windows.push(`\n### ${label.toUpperCase()} / ${title}\n${chunk}`);
  };

  addWindow('başlangıç', 0, 14000);
  const patterns: Array<[string, RegExp]> = [
    ['ihale-tarih-kapsam', /(ihale\s+tarihi|ihale\s+konusu|işin\s+konusu|işe\/alıma|amaç\s+ve\s+kapsam)/i],
    ['katılım-yeterlik', /(katılım\s+ve\s+yeterlik|yeterlik\s+kriter|mesleki\s+ve\s+teknik|iş\s+deneyim|benzer\s+iş)/i],
    ['teminat', /(geçici\s+teminat|kesin\s+teminat|teminat\s+olarak|iban|nakit\s+teminat)/i],
    ['belgeler', /(sunulması\s+gereken\s+belge|yetki\s+belgesi|türsab|d2\s+yetki|src|oda\s+kayıt|iso|sertifika|ruhsat)/i],
    ['teknik-hizmetler', /(yüklenici|temin\s+edilecektir|sağlanacaktır|kurulacaktır|hizmeti|ekipman|personel|araç|konaklama|catering|yemek|baskı|sahne|led)/i],
    ['birim-fiyat-cetveli', /(birim\s+fiyat\s+teklif\s+cetveli|sıra\s+no[\s\S]{0,300}iş\s+kalemi|iş\s+kaleminin\s+adı|toplam\s+tutar)/i],
    ['ceza-ve-teslim', /(ceza|gecikme|teslim|sözleşme|işe\s+başlama|bitirme|süre)/i]
  ];

  for (const [title, pattern] of patterns) {
    const match = pattern.exec(normalized);
    if (match?.index !== undefined) addWindow(title, match.index - 2500, 18000);
  }

  addWindow('son', Math.max(0, normalized.length - 12000), 12000);

  let result = windows.join('\n');
  if (result.length > maxChars) result = `${result.slice(0, maxChars)}\n\n[...akıllı kesit sınırı nedeniyle kısaltıldı...]`;
  return result;
}
