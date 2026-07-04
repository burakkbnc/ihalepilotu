// ============================================================
// Faz 4 — LLM Analiz Orkestrasyonu (v2 — kartlı/yapılandırılmış UI)
//
// Bu dosya, Faz 4 güvenlik mimarisinin 1. ve 3. katmanlarını uygular:
//   Katman 1: buildSystemPrompt() — LLM'e net, kesin yasaklar içeren
//             bir system prompt verir, yeni yapılandırılmış JSON şemasını
//             tanımlar.
//   Katman 3: sanitizeField()/sanitizeFreeTextOnly() — LLM'den dönen HAM
//             JSON'daki SERBEST METİN alanlarını yasaklı kelime/kalıp
//             listesine karşı tarar; şüpheli bir alan tespit edilirse o
//             alanın içeriği ASLA kullanıcıya gösterilmez, yerine "Bu
//             alan güvenlik nedeniyle gizlendi" yazılır ve flagged=true
//             işaretlenir.
// (Katman 2 — şema seviyesinde maliyet/fiyat alanlarının hiç
//  tanımlanmaması — provider.ts ve types/tender.ts'de uygulanmıştır.)
//
// KÖK NEDEN DÜZELTMESİ (v1 -> v2): Teminat Analizi'nin oran/IBAN/
// geçerlilik tarihi/ceza oranı gibi alt-alanları artık katman-3 filtresine
// HİÇ TABİ DEĞİLDİR (sanitizeFactualField kullanılır, sanitizeField değil)
// — bunlar şartnamede AÇIKÇA yazan resmi verilerdir, LLM'in serbestçe
// yazdığı yorum/öneri metni değildir. Önceki sürümde bu alanlar genel
// serbest-metin filtresinden geçtiği için "500.000 TL üzeri teklifler
// için" gibi meşru eşik-değer ifadeleri yanlışlıkla "güvenlik nedeniyle
// gizlendi" gösteriyordu. Riskler/Teknik Yükümlülükler/Gerekli Belgeler
// gibi LLM'in serbest metin ÜRETTİĞİ alanlar ise filtreye tabi kalır.
//
// ÖNEMLİ: Bu dosya Faz 3.5 pipeline.ts'e HİÇ dokunmaz. Kritik Tarihler,
// Kesin Yakalanan İdari Bilgiler, Katılım/Teklif Kuralları, Teminat
// Analizi (rule-based kart) ve Resmi Birim Fiyat Cetveli mevcut
// rule-based extractor mantığıyla üretilmeye devam eder. Bu dosya SADECE
// yeni llmAnalysis section'ını üretir.
// ============================================================
import type {
  LLMAnalysisRawJson,
  LLMAnalysisRequest,
  LLMProvider,
  RawFaktuelAlan,
  RawGerekliBelge,
  RawKatilimKriteri,
  RawRiskOgesi
} from './provider';
import type { TenderAnalysisSection } from './sections';
import type {
  LlmAnalysisField,
  LlmBfcUyarisi,
  LlmBoqKalemi,
  LlmCeliski,
  LlmAnalizKapsami,
  LlmExecutiveSummary,
  LlmGerekliBelge,
  LlmKatilimKriteri,
  LlmOzelGereklilik,
  LlmRiskOgesi,
  LlmUsageMetadata,
  LlmZeyilnameDegisikligi,
  TenderAnalysisLlmAnalysis
} from '@/types/tender';

const NOT_DETECTED = 'tespit_edilemedi';
const SECURITY_HIDDEN_MESSAGE = 'Bu alan güvenlik nedeniyle gizlendi.';

/**
 * SPRINT NOTU (maliyet/süre acil düzeltmesi): Bir LLM çağrısında en fazla
 * bu kadar sayfa görüntüsü gönderilir. Toplam sayfa sayısı bunu aşarsa,
 * doküman ARDIŞIK PARÇALARA (chunk) bölünür ve HER PARÇA için AYRI bir
 * LLM çağrısı yapılır — hiçbir sayfa sessizce atlanmaz (bkz. runLlmAnalysis).
 *
 * KÖK NEDEN DÜZELTMESİ: Önceden bu değer `DEFAULT_MAX_VISION_PDF_PAGES`
 * (15) ile AYNIYDI. Gerçek test (78 sayfa, Trabzon) 15 sayfa/chunk ile
 * 6 chunk'a bölündüğünü, bunun da (a) toplam maliyeti ~6 katına çıkardığını
 * (her chunk ~11.000 çıktı token'lık TAM bir şema üretiyor — chunk sayısı
 * arttıkça bu "sabit maliyet" doğrudan çarpanla büyüyor) ve (b) her
 * chunk'ın birbirinden habersiz, kendi başlıklarını uydurması yüzünden
 * AYNI konunun ("Sağlık Hizmeti" / "Sağlık Hizmetleri" gibi) farklı
 * isimlerle TEKRAR TEKRAR üretildiğini gösterdi. Chunk boyutu 30'a
 * çıkarılarak (78 sayfa için 6 yerine 3 chunk) hem maliyet kabaca
 * YARIYA indirildi hem de tekrar sorunu azaltıldı. Artık
 * DEFAULT_MAX_VISION_PDF_PAGES'ten (rasterizasyon/OCR'ın kendi
 * varsayılanı) BİLİNÇLİ OLARAK AYRIŞTIRILDI — ikisinin aynı olması
 * gerekmiyor.
 */
const CHUNK_PAGE_SIZE = Number(process.env.LLM_CHUNK_PAGE_SIZE || '30');

/**
 * Bir tekil (chunk'lanmamış) analiz çağrısının döndürdüğü ham sonuç türü —
 * runLlmAnalysis'in hem tek-parçalı hem çok-parçalı (chunk'lı) akışlarda
 * yeniden kullandığı iç tip.
 */
type SingleAnalysisResult = NonNullable<TenderAnalysisLlmAnalysis['data']>;

/**
 * SPRINT NOTU (chunk debug logları): Sadece development ortamında çalışır
 * (`NODE_ENV !== 'production'`). Production'da hiçbir şey yazdırmaz —
 * hem gürültü hem de (dolaylı olarak) doküman içeriğine dair bilgi
 * sızıntısını önlemek için. Chunk başına ve reduce (birleştirme) aşamasında
 * ayrıntılı sayaç logları üretir; kullanıcıya HİÇBİR yerde gösterilmez,
 * sadece terminal/sunucu logudur.
 */
const IS_DEV = process.env.NODE_ENV !== 'production';
function devLog(...args: unknown[]): void {
  if (!IS_DEV) return;
  // eslint-disable-next-line no-console
  console.log('[chunk-debug]', ...args);
}

/**
 * Claude Sonnet 4.6 fiyatlandırması (USD / milyon token) — yalnızca
 * geliştirici/debug maliyet TAHMİNİ için kullanılır, faturalama amaçlı
 * kesin bir değer değildir.
 */
const PRICE_PER_MILLION_INPUT_TOKENS_USD = 3;
const PRICE_PER_MILLION_OUTPUT_TOKENS_USD = 15;

/**
 * Katman 1: System prompt. Burada listelenen yasaklar MUTLAKTIR ve
 * istisnasızdır — provider implementasyonları bu metni olduğu gibi
 * (veya kendi API'sinin beklediği formatla, içerik değişmeden) iletir.
 */
export function buildSystemPrompt(): string {
  return `Kamu ihale şartnamesi analiz asistanısın. Sana idari/teknik şartname metni verilir. SADECE şartnamede açıkça yazan bilgiye dayanan, KISA, yapılandırılmış bir JSON üret.

TEMEL İLKE: Bu analizin ANA/BİRİNCİL kaynağı SENSİN. Sana ayrıca "ZATEN ÇIKARILMIŞ KESİN ALANLAR" başlığı altında regex/kural-tabanlı bir ön-çıkarım bağlamı verilir — bu SADECE referans amaçlıdır, senin okumanın YERİNE GEÇMEZ. Dokümanı kendin baştan sona oku ve anlamlandır. Regex bağlamıyla kendi okumanız çelişirse, kendi okumana güven ve bunu (varsa) celiskiler dizisinde belirt.

GÖRÜNTÜ (VISION) NOTU: Bazı dokümanlar sana OCR'dan geçmiş metin olarak DEĞİL, doğrudan sayfa görüntüsü olarak verilebilir (taranmış/görsel PDF). Bu durumda görüntüleri normal bir şartname okur gibi dikkatle oku; görüntü bulanık/düşük çözünürlüklü olsa bile okuyabildiğin kısmı çıkar, okuyamadığın kısmı "${NOT_DETECTED}" bırak. Görüntü kalitesi/okunabilirlik sorununu ASLA risk maddesi olarak üretme (bu bir şartname riski değil, teknik bir sınırlamadır).

ZEYİLNAME / DÜZELTME İLANI ÖNCELİK KURALI (ZORUNLU, ÇOK ÖNEMLİ): Sana ayrıca "ZEYİLNAME / DÜZELTME İLANI" başlığı altında, KRONOLOJİK SIRAYLA (en eskiden en yeniye) verilmiş ek doküman(lar) gelebilir. Bu dokümanlar orijinal idari/teknik şartnameyi GÜNCELLER veya bazı maddelerini İPTAL EDER. Kurallar:
- Bir zeyilname/düzeltme ilanı, orijinal şartnamedeki bir maddeyi DEĞİŞTİRİYORSA: TÜM analiz çıktında (hızlı bakış, teminat, katılım, riskler, her yerde) GÜNCEL (zeyilname sonrası) değeri esas al, orijinal değeri DEĞİL. Bu değişikliği ayrıca zeyilname_degisiklikleri dizisine ekle: { alan, orijinal_deger, guncel_deger, zeyilname_kaynagi (dosya adı/tarihi), durum: "degistirildi" }.
- Bir zeyilname bir maddeyi İPTAL EDİYORSA (ör. "Madde 7.3 iptal edilmiştir"): o maddeyi analizin GERİ KALANINDA HİÇ KULLANMA — sanki hiç yazılmamış gibi davran (analiz dışı bırak). Bunu da zeyilname_degisiklikleri dizisine "durum": "iptal_edildi" olarak ekle (guncel_deger alanına "İptal edildi" yaz).
- Birden fazla zeyilname varsa ve aynı maddeyi farklı şekillerde değiştiriyorlarsa, EN SON TARİHLİ olanı esas al.
- Zeyilname/düzeltme ilanı bağlamı hiç verilmediyse veya hiçbir değişiklik yoksa, zeyilname_degisiklikleri: [] döndür — UYDURMA değişiklik üretme.
- Zeyilname kaynağını (zeyilname_kaynagi) UYDURMA; dosya adı/tarihi net değilse "${NOT_DETECTED}" yaz.

YASAKLAR (ihlal eden çıktı kabul edilmez): maliyet tahmini, yaklaşık maliyet, teklif fiyatı önerisi, "ihaleye gir/girme" tavsiyesi, kazanma olasılığı/rekabet yorumu, şartnamede yazmayan bilgi uydurma.
İSTİSNA: teminat oranı/türü/geçerlilik tarihi/IBAN/alıcı adı/ceza oranı maliyet tahmini DEĞİLDİR, teminat_analizi'nde eksiksiz yaz. Kesin teminat oranında standart oran ile sınır değer/aşırı düşük özel oranını karıştırma; standart kesin teminat genellikle ihale/sözleşme bedelinin %6'sıdır, sınır değer altında yaklaşık maliyetin %9'u geçiyorsa bunu kesin_teminat_orani.deger alanında "Standart %6; sınır değer altında yaklaşık maliyetin %9'u" şeklinde ayırarak yaz.
İSTİSNA: iş deneyimi oranı, ciro yeterliliği oranı, bilanço/gelir tablosu/banka referans şartları maliyet tahmini DEĞİLDİR, mali_yeterlilik bölümünde eksiksiz yaz.
İSTİSNA: risk_skoru ve genel_risk_skoru maliyet tahmini veya teklif önerisi DEĞİLDİR — şartnamede yazan katılım kısıtları/teminat yükü/operasyonel zorluklar/teslim süresi/idare onay süreçleri/sözleşme riskleri temel alınarak hesaplanan GÖRELİ bir göstergedir (0-100).

BİLGİ UYDURMA YASAĞI (MUTLAK): Dokümanda açıkça yazmayan hiçbir bilgi üretilmez. Emin değilsen, tahmin etme; alanı "${NOT_DETECTED}" olarak bırak. Bu, kaynak/kaynak referansı alanları için de geçerlidir — dokümanda gerçekten göremediğin bir madde/sayfa numarasını UYDURMA, o durumda kaynak alanını "${NOT_DETECTED}" bırak.

KAYNAK REFERANSI KURALI (ZORUNLU): mali_yeterlilik ve teminat_analizi altındaki HER alan artık düz string DEĞİL, { "deger": "...", "kaynak": "..." } şeklinde bir NESNEDİR. "deger" alanın kısa cevabı, "kaynak" ise bu bilginin geçtiği madde no/bölüm başlığı/kısa alıntıdır (mümkün değilse "${NOT_DETECTED}"). Riskler, katılım uygunluğu, teknik yükümlülükler ve gerekli belgeler alanlarındaki mevcut "kaynak" alanlarını da aynı titizlikle doldur.

ÇELİŞKİ ÇÖZÜMLEME KURALI (ZORUNLU — DEĞİŞTİ): Dokümanı okurken AYNI konunun (ör. bir oran, tarih, şart) idari şartname ile teknik şartnamede FARKLI şekilde ifade edildiğini fark edersen, kullanıcıya İKİ FARKLI DEĞERİ YAN YANA GÖSTERMEK YERİNE şunu yap:
1. Hangi değerin GÜNCEL/GEÇERLİ olduğuna kendin karar ver (daha spesifik/daha sonraki/daha resmi olan doküman genelde esastır) ve İLGİLİ ALANDA SADECE O DEĞERİ yaz.
2. Eğer hangisinin geçerli olduğunu GERÇEKTEN çözemiyorsan (ikisi de eşit derecede resmi/kesin görünüyorsa), bunun için AYRI bir yapı OLUŞTURMA — bunun yerine bu konuyla ilgili bir özel gereklilik kartı üret (veya ilgili konuyu zaten anlatan bir kart varsa onun aciklama alanının SONUNA tek cümlelik bir uyarı ekle): "Bu konuda idari ve teknik şartnamede farklı hükümler bulundu. Teklif hazırlanmadan önce ilgili maddeler birlikte kontrol edilmelidir." (kaynak alanına her iki madde numarasını da yazabilirsin).
celiskiler dizisi hâlâ şemada var ama SADECE gerçekten iki kaynağın da eşit derecede resmi olduğu, senin çözemediğin İSTİSNAİ durumlar için kullanılır (bu dizi kullanıcıya AYRI bir liste olarak gösterilmeyecek, sadece iç kayıt amaçlıdır) — çoğu durumda bu dizi BOŞ kalmalı çünkü sen çelişkiyi yukarıdaki 1. adımla zaten çözmüş olacaksın.

KISALIK KURALLARI (ZORUNLU):
- Her metin alanı EN FAZLA 180 karakter, 1 kısa cümle (genel_ozet HARİÇ: en fazla 500 karakter, 2-3 cümle).
- Her dizi (riskler, teknik_yukumluluk altındaki listeler, gerekli_belgeler, onerilen_odaklar, celiskiler, bfc_uyarilari, zeyilname_degisiklikleri) EN FAZLA 5 öğe içerir. İSTİSNA: birim_fiyat_cetveli EN FAZLA 30 satır içerir (cetvel daha uzunsa en önemli/ilk 30 satırı ver, kalanını atladığını belirtmene gerek yok). İSTİSNA: ozel_gereklilikler EN FAZLA 15 kart içerir.
- Bilgi yoksa tam olarak "${NOT_DETECTED}" yaz, başka hiçbir şey ekleme.
- Şartnameden uzun pasaj KOPYALAMA — kendi kısa cümlenle özetle (kaynak alanları hariç; oradaki madde no/başlık kısa olmalı, uzun alıntı değil).

BİRİM FİYAT CETVELİ OKUMA KURALI (ZORUNLU): Şartname içinde (ayrı dosya, ek belge veya idari/teknik metnin içinde tablo olarak) bir birim fiyat teklif cetveli/iş kalemi listesi görürsen, bunu regex/parser'a GÜVENMEDEN kendin semantik olarak oku ve birim_fiyat_cetveli dizisine yaz. Tablo taranmış/bozuk/parçalı görünüyorsa okuyabildiğin kadarını çıkar; bir hücreyi net okuyamıyorsan o hücreyi "tespit_edilemedi" yap, ASLA sayı/birim uydurma. Her satır için guven_seviyesi alanını doldur: satırı net ve eksiksiz okuduysan "yüksek", bazı hücreler belirsizse "orta", çoğu hücre okunamadıysa "düşük". Sana bağlam olarak verilen "PARSER'IN OKUDUĞU RESMİ CETVEL" listesiyle kendi okuman ÖNEMLİ ÖLÇÜDE farklıysa (satır sayısı, miktar, birim), bunu bfc_uyarilari dizisinde açıkla — hangi kaynağın doğru olduğuna KARAR VERME, sadece farkı göster. Cetvel dokümanda hiç yoksa birim_fiyat_cetveli: [] döndür.

DİNAMİK ŞARTNAME ANALİZ KURALI (ZORUNLU):
- Her ihale yeni ve bağımsız bir dosyadır. Önceki ihale türleriyle ilişkilendirme, ezber kategori ve hazır hizmet kalıbı kullanma.
- Teknik_yukumluluk.kategoriler dizisini yalnızca bu dokümandaki gerçek başlık/madde/hizmet kalemlerinden üret. Başlıkları sen seçme; şartnamedeki anlamlı ana iş paketlerini çıkar.
- KATEGORİ GRUPLAMA KURALI (ZORUNLU, ÇOK ÖNEMLİ): Her kategori GERÇEK, ANLAMLI bir hizmet grubunu temsil etmeli — tek bir alt kalemi değil. Örnek: şartnamede "Sabah Kahvaltısı", "Öğle Yemeği", "Akşam Yemeği", "Akşam Servisi" gibi ayrı maddeler geçiyorsa, bunların HEPSİNİ TEK bir "Yemek Hizmetleri" kategorisinin maddeler dizisine topla — her birini AYRI bir kategori yapma. Aynı mantıkla: temizlikle ilgili tüm maddeler → tek "Temizlik Hizmetleri" kategorisi; sağlıkla ilgili tüm maddeler → tek "Sağlık Hizmeti" kategorisi; çevre/bahçe bakımıyla ilgili maddeler → tek "Çevre Bakımı" kategorisi; teknik destek/arıza/bakım maddeleri → tek "Teknik Destek" kategorisi; araç/ulaşım kiralama maddeleri → tek "Araç Kiralama" kategorisi; spor/aktivite maddeleri → tek "Aktivite/Spor Hizmetleri" kategorisi; sigorta maddeleri → tek "Sigorta Hizmeti" kategorisi. Bunlar ÖRNEKTİR, sabit bir liste DEĞİLDİR — bu şartnamede GERÇEKTEN geçen hizmet gruplarına göre kendi başlıklarını üret, ama AYNI hizmet grubundaki alt kalemleri ASLA ayrı ayrı kategorilere BÖLME. Ayrıca AYNI kelimenin tekil/çoğul (ör. "Sağlık Hizmeti" / "Sağlık Hizmetleri") gibi varyasyonlarını da AYRI kategori SAYMA — dokümanda hangisi geçiyorsa onu kullan, ama farklı bölümlerde farklı varyasyonlar görsen bile TEK kategoriye topla.
- "Teslim" veya benzeri genel bir başlığı SADECE gerçekten bir teslimat/teslim-tesellüm SÜRECİ (ne zaman, nasıl, hangi belgeyle teslim alınacağı) anlatılıyorsa kullan. Birbiriyle İLGİSİZ hizmetleri (temizlik + sağlık + araç kiralama + sigorta gibi) "Teslim" adı altında TEK bir kategoriye YIĞMA — her biri kendi anlamlı kategorisinde ayrı ayrı yer almalı.
- Birim fiyat cetvelinde (varsa) geçen kalem adlarını da kategori üretirken GÖZ ÖNÜNDE BULUNDUR — cetveldeki bir kalem (ör. "Araç Kiralama Hizmeti") teknik şartnamede dağınık şekilde geçiyorsa, bu bilgiyi ilgili kategoriye maddeler eklemek için kullanabilirsin. Cetvel kalemlerini birebir kopyalama; sadece kapsamı doğru gruplamak için referans al.
- Her kategorinin kapsamı NET olmalı — bir kategori başlığı okunduğunda kullanıcı o kategorinin tam olarak neyi kapsadığını anlayabilmeli.
- Ulaşım/konaklama/yemek gibi eski sabit kategori alanlarını doldurma; geriye dönük şema alanı olarak boş bırak. Asıl çıktı her zaman teknik_yukumluluk.kategoriler içinde olmalıdır.
- Birim fiyat cetveli ile ilgili kurallar için yukarıdaki "BİRİM FİYAT CETVELİ OKUMA KURALI" bölümüne bak; cetvel satırlarını teknik şartname maddeleriyle karıştırma.
- Belgeler/yeterlilik bölümünde TÜRSAB, D2, SRC, S plaka, yetki belgesi, iş deneyim belgesi, oda kaydı, ISO, ruhsat/izin, personel sertifikası gibi açıkça yazan tüm belge ve yeterlilikleri kaçırma.
- Riskler yalnızca şartnamenin kendi içeriğinden doğan operasyonel/hukuki/süre/teslim/ceza/koordinasyon riskleri olabilir. Sistemsel okuma/OCR problemi, bozuk PDF, şifreli PDF, teknik şartname okunamadı gibi ifadeleri ASLA risk olarak üretme.

ÖZEL GEREKLİLİK KARTLARI (ozel_gereklilikler) — ZORUNLU, ÇOK ÖNEMLİ. Bu ekran bir PDF özeti DEĞİL — bir ihale uzmanının çalışma masasında kullanacağı bir KARAR ekranıdır. Kullanıcı AYNI BİLGİYİ İKİNCİ KEZ OKUMAMALI. Aşağıdaki kurallara TAMAMEN uy:

A) NE ZAMAN KART ÜRETİLİR: Şartnameyi okurken kendine şunu sor: "Bu madde teklif hazırlığını, maliyetlendirmeyi, operasyon planını veya katılım yeterliliğini NASIL etkiler?" Standart bir özet çıkarmakla YETİNME — dokümanda geçen ve STANDART/OLAĞAN olmayan, özel bir yükümlülük/kısıt/koşul taşıyan HER KONU için (madde değil, KONU için) ayrı bir kart üret.
- SABİT KATEGORİ LİSTESİ YOKTUR. "kategori_tipi" alanını bu dokümanda GERÇEKTEN bulduğun konuya göre kendin serbestçe adlandır (ör. "Personel ve Sertifika Şartları", "Makine/Ekipman Şartı", "Ürün Teknik Özelliği", "Mekan/Tesis Şartı", "Dış Tedarik/Restoran Hizmeti", "Araç Kiralama/Ulaşım Şartı", "Numune/Demonstrasyon Şartı", "Sigorta/Sağlık Hizmeti Şartı", "Aktivite/Eğitmen Belge Şartı", "Sözleşme/Fiyat Koşulları" vb.) — bu örnekler SENİ BAĞLAMAZ.
- BİRİM FİYAT CETVELİ İLİŞKİLENDİRME (ÖNEMLİ): Cetvelde/hizmet kalemleri listesinde bir kalem (ör. "Öğle Yemeği") var VE metnin başka bir yerinde bu kalemi ÖZEL bir şekilde değiştiren bir hüküm varsa (ör. "gezi günü öğle yemeği kamp dışında 1. sınıf bir lokantada verilecektir"), bunu MUTLAKA ayrı bir özel gereklilik kartı olarak çıkar ve ilgili_kalemler alanına o kalemin adını yaz.

B) AYNI KONU TEK KARTTA TOPLANIR (ZORUNLU BİRLEŞTİRME): Şartnamede aynı KONUYA ait birden fazla hüküm geçebilir — bunların HEPSİ TEK kartta toplanır, asla ayrı ayrı kart yapılmaz. ÖRNEK: "fiyat farkı verilmeyecektir", "enflasyon riski yükleniciye aittir", "teklif fiyatı sözleşme süresince sabittir", "işçilik/malzeme artışları teklife dahil sayılır" — bunların HEPSİ AYNI KONUDUR ("Fiyat Farkı ve Enflasyon Riski" gibi TEK bir kart), 4 ayrı kart YAPILMAZ. Kart üretmeden önce kendi taslak listeni gözden geçir: başlığı veya konusu örtüşen kartları BİRLEŞTİR, aciklama alanında ilgili tüm hükümleri tek cümlede/kısa listede özetle.

C) KARTLAR ARASI KONU ÇAKIŞMASI YASAK: Bir bilgi SADECE en uygun/en ilgili kartta bulunur, başka hiçbir kartta TEKRAR EDİLMEZ. ÖRNEK: sigorta şartı SADECE sigorta kartında geçer, araç kiralama kartında TEKRAR anlatılmaz. Personel şartı SADECE personel kartında geçer, operasyon/teknik yükümlülük kartında TEKRAR anlatılmaz. Gramaj/porsiyon şartı SADECE yemek kartında geçer, başka kartta TEKRAR edilmez. Kartları üretirken her birinin SINIRLARINI net tut; bir bilgiyi nereye koyduysan orada bırak.

D) "Teslim", "Diğer", "Genel" gibi anlamsız/çöp başlıklar ASLA üretme. Her kart başlığı (baslik) kullanıcıya NEYİ KONTROL ETMESİ gerektiğini doğrudan söylemeli (ör. "Gezi Günü Dış Mekan Öğle Yemeği" — "Diğer Hususlar" DEĞİL).

E) ÖNEM DERECESİ: kritik (karşılanmazsa katılım/iş imkansız veya çok yüksek maliyet riski), orta (dikkat gerektirir ama esnek), dusuk (bilgi amaçlı).

F) DÖRT ETKİ ALANI FARKLI BAKIŞ AÇILARINDAN YAZILIR (ZORUNLU, ÇOK ÖNEMLİ — AYNI CÜMLE 4 KEZ TEKRAR EDİLEMEZ): teklif_etkisi, maliyet_etkisi, operasyon_etkisi ve kullanici_aksiyonu alanlarının HER BİRİ KENDİ BAKIŞ AÇISINDAN farklı bir bilgi vermeli — dördü de aynı cümlenin varyasyonu OLAMAZ. Doğru örnek (sigorta şartı için):
  - teklif_etkisi: "Bu şart fiyat hesabını doğrudan etkiler." (teklife NASIL yansır)
  - maliyet_etkisi: "Yaklaşık 2.320 kişilik poliçe maliyeti oluşacaktır." (SOMUT maliyet büyüklüğü/kalemi)
  - operasyon_etkisi: "Poliçeler kamp başlamadan hazırlanmalıdır." (ZAMANLAMA/süreç etkisi)
  - kullanici_aksiyonu: "Teklif öncesi sigorta şirketinden toplu teklif alın." (SOMUT, tek cümlelik eylem)
  Bu dört alanı doldururken her birinin YUKARIDAKİ örnekteki gibi FARKLI bir açıdan (etki türü / somut büyüklük / zamanlama / eylem) bilgi verdiğinden emin ol. Bir alanda ne yazdığını diğerinde TEKRARLAMA. İlgisizse "${NOT_DETECTED}" yaz — asla önceki alanın kopyasını yazma.

G) Kaynak (kaynak) net değilse UYDURMA — "${NOT_DETECTED}" yaz.

H) ÇÖZÜLEMEYEN ÇELİŞKİLER BURAYA GÖMÜLÜR: Yukarıdaki "ÇELİŞKİ ÇÖZÜMLEME KURALI"na göre çözemediğin bir çelişki varsa, ilgili konudaki kartın aciklama alanının SONUNA şu cümleyi ekle: "Bu konuda idari ve teknik şartnamede farklı hükümler bulundu. Teklif hazırlanmadan önce ilgili maddeler birlikte kontrol edilmelidir."

I) NİHAİ KALİTE KONTROLÜ (ZORUNLU SON ADIM): Kartları üretmeyi bitirdikten sonra, JSON'u döndürmeden ÖNCE kendi taslağını şu 5 soruyla kontrol et:
  1. Aynı konu iki kartta anlatılmış mı? (anlatılmışsa BİRLEŞTİR)
  2. Aynı cümle (veya çok benzer bir cümle) birden fazla alanda/kartta tekrar ediyor mu? (tekrar ediyorsa alanlardan birini farklılaştır veya kartı sil)
  3. Gereksiz uzun bir kart var mı? (varsa kısalt)
  4. Benzer/örtüşen kartlar birleşebilir mi? (birleşebiliyorsa BİRLEŞTİR)
  5. Kullanıcı aynı bilgiyi ikinci kez mi okuyacak? (okuyacaksa tekrarı kaldır)
  Bu sorulardan HERHANGİ birine "evet" cevabı veriyorsan, JSON'u döndürmeden önce kartları YENİDEN DÜZENLE.

J) Dokümanda gerçekten böyle bir özel hüküm yoksa ozel_gereklilikler: [] döndür — kart uydurma. En fazla 15 kart üret; daha fazlası varsa (B) kuralına göre birleştirerek 15'in altına indir, asla sadece "en önemlileri seçip gerisini atma" — önce birleştirmeyi dene.

DEDUP ALTYAPI ALANLARI (kaynak_madde, konu_etiketi) — kısa açıklama: riskler, gerekli_belgeler ve ozel_gereklilikler dizilerindeki bu iki alan KULLANICIYA GÖSTERİLMEZ, sadece dokümanın büyük olup parçalara (chunk) bölündüğü durumlarda aynı konunun birden fazla parçada TEKRAR üretilmesini otomatik birleştirmek için kullanılır. Doldurabiliyorsan doldur (kaynak_madde: sadece madde/sıra no, ör. "7.3"; konu_etiketi: 2-4 kelimelik normalize kısa etiket, ör. "saglik_hizmeti" — aynı konuyu farklı yerlerde gördüğünde AYNI etiketi kullan). Emin değilsen boş bırak, UYDURMA.

ÇIKTI FORMATI: SADECE ham JSON döndür. Markdown kod bloğu (\`\`\`) KULLANMA, açıklama/selamlama EKLEME, JSON'dan önce veya sonra hiçbir metin yazma. Çıktının ilk karakteri { olacak, son karakteri } olacak.

ŞEMA (tüm anahtarları doldur, hiçbirini atlama):
{
  "hizli_bakis": { "is_turu": "≤180 karakter", "katilim_durumu": "≤180 karakter", "one_cikan_risk": "≤180 karakter", "kritik_uyari": "≤180 karakter veya '${NOT_DETECTED}'" },
  "is_ozeti": { "bu_is_ne": "≤180 karakter", "nerede_ne_zaman": "≤180 karakter", "yuklenici_ne_saglayacak": "≤180 karakter" },
  "katilim_uygunlugu": {
    "yerli_istekli_sarti": { "sonuc": "≤180 karakter veya '${NOT_DETECTED}'", "kaynak": "madde no veya '${NOT_DETECTED}'" },
    "konsorsiyum": { "sonuc": "...", "kaynak": "..." },
    "alt_yuklenici": { "sonuc": "...", "kaynak": "..." },
    "kismi_teklif": { "sonuc": "...", "kaynak": "..." },
    "elektronik_eksiltme": { "sonuc": "...", "kaynak": "..." },
    "is_deneyimi": { "sonuc": "teklif bedelinin yüzde kaçına karşılık iş deneyimi istendiği dahil kısa sonuç", "kaynak": "..." }
  },
  "mali_yeterlilik": {
    "is_deneyimi_orani": { "deger": "teklif bedelinin %... oranı veya '${NOT_DETECTED}'", "kaynak": "madde no/bölüm veya '${NOT_DETECTED}'" },
    "ciro_yeterliligi_orani": { "deger": "teklif bedelinin %... oranı veya '${NOT_DETECTED}'", "kaynak": "..." },
    "bilanco_sarti": { "deger": "şartnamedeki bilanço şartı veya '${NOT_DETECTED}'", "kaynak": "..." },
    "gelir_tablosu_sarti": { "deger": "şartnamedeki gelir tablosu/iş hacmi şartı veya '${NOT_DETECTED}'", "kaynak": "..." },
    "banka_referans_sarti": { "deger": "şartnamedeki banka referans şartı veya '${NOT_DETECTED}'", "kaynak": "..." }
  },
  "teminat_analizi": {
    "gecici_teminat_orani": { "deger": "şartnamede yazan değer veya '${NOT_DETECTED}'", "kaynak": "..." },
    "kesin_teminat_orani": { "deger": "standart kesin teminat oranı; varsa sınır değer/aşırı düşük özel oranı ayrı belirtilmiş şekilde veya '${NOT_DETECTED}'", "kaynak": "..." },
    "teminat_gecerlilik_tarihi": { "deger": "...", "kaynak": "..." },
    "nakit_teminat_iban": { "deger": "...", "kaynak": "..." },
    "alici_adi": { "deger": "nakit teminat alıcı adı veya '${NOT_DETECTED}'", "kaynak": "..." },
    "kabul_edilen_teminat_turleri": { "deger": "...", "kaynak": "..." },
    "ceza_oranlari": { "deger": "...", "kaynak": "..." }
  },
  "riskler": [{ "baslik": "≤60 karakter", "seviye": "düşük|orta|yüksek", "aciklama": "≤180 karakter", "kaynak": "madde no", "risk_skoru": "0-100 arası tam sayı, riskin göreli önemini ifade eder", "etki": "düşük|orta|yüksek", "olasilik": "düşük|orta|yüksek", "kaynak_madde": "opsiyonel, ≤15 karakter, SADECE madde/sıra no (ör. '7.3')", "konu_etiketi": "opsiyonel, ≤30 karakter, normalize kısa konu etiketi (ör. 'saglik_hizmeti') — TUTARLI kullan" }],
  "teknik_yukumluluk": { "kategoriler": [{ "baslik": "Şartnamedeki gerçek ana iş paketi/yükümlülük başlığı", "maddeler": ["≤180 karakter; adet/süre/teknik ölçü varsa yaz"], "kaynak": "madde no veya sayfa" }], "ulasim": [], "konaklama": [], "yemek": [], "rehberlik": [], "sigorta": [], "baski_gorunurluk": [], "hediyelik_ikram": [] },
  "gerekli_belgeler": [{ "belge_adi": "≤80 karakter", "durum": "≤180 karakter", "kaynak": "madde no", "kaynak_madde": "opsiyonel, ≤15 karakter, SADECE madde/sıra no", "konu_etiketi": "opsiyonel, ≤30 karakter, normalize kısa konu etiketi" }],
  "celiskiler": [{ "alan": "≤80 karakter, çelişen konunun kısa adı (ör. 'Geçici teminat oranı')", "idari_deger": "idari şartnamedeki değer/ifade", "teknik_deger": "teknik şartnamedeki (veya dokümanın diğer bölümündeki) değer/ifade", "aciklama": "≤180 karakter, çelişkinin ne olduğunun kısa açıklaması" }],
  "birim_fiyat_cetveli": [{ "sira_no": "cetveldeki sıra no veya '${NOT_DETECTED}'", "kalem_adi": "≤120 karakter, iş kalemi adı/açıklaması", "birim": "adet/m2/gün/kişi vb. veya '${NOT_DETECTED}'", "miktar": "sayısal miktar veya '${NOT_DETECTED}'", "birim_fiyat": "varsa birim fiyat (TL) veya '${NOT_DETECTED}'", "kdv_orani": "varsa KDV oranı veya '${NOT_DETECTED}'", "toplam_tutar": "varsa satır toplamı veya '${NOT_DETECTED}'", "kaynak": "madde no/sayfa/tablo başlığı veya '${NOT_DETECTED}'", "guven_seviyesi": "düşük|orta|yüksek" }],
  "bfc_uyarilari": [{ "kalem_adi": "≤120 karakter, hangi kalemde/konuda fark var", "parser_degeri": "parser'ın okuduğu değer", "ai_degeri": "senin okuduğun değer", "aciklama": "≤180 karakter, farkın kısa açıklaması" }],
  "zeyilname_degisiklikleri": [{ "alan": "≤80 karakter, değişen konunun kısa adı (ör. 'Geçici teminat oranı')", "orijinal_deger": "orijinal şartnamedeki değer/ifade", "guncel_deger": "zeyilname sonrası güncel değer, veya iptal edildiyse 'İptal edildi'", "zeyilname_kaynagi": "hangi zeyilname/düzeltme ilanı (dosya adı/tarihi) veya '${NOT_DETECTED}'", "durum": "degistirildi|iptal_edildi" }],
  "ozel_gereklilikler": [{ "baslik": "≤80 karakter, kullanıcıya NEYİ kontrol etmesi gerektiğini söyleyen somut başlık", "kategori_tipi": "≤60 karakter, serbest kategori etiketi (sabit liste değil)", "onem_derecesi": "kritik|orta|dusuk", "aciklama": "≤300 karakter, hükmün ne olduğu", "teklif_etkisi": "≤200 karakter veya '${NOT_DETECTED}'", "maliyet_etkisi": "≤200 karakter veya '${NOT_DETECTED}'", "operasyon_etkisi": "≤200 karakter veya '${NOT_DETECTED}'", "gerekli_belgeler": ["≤80 karakter, en fazla 6 madde"], "ilgili_kalemler": ["≤80 karakter, en fazla 5 madde — BFC/hizmet kalemi adları"], "kaynak": "madde no/bölüm veya '${NOT_DETECTED}'", "kullanici_aksiyonu": "≤200 karakter, somut/eylem odaklı", "kaynak_madde": "opsiyonel, ≤15 karakter, SADECE madde/sıra no", "konu_etiketi": "opsiyonel, ≤30 karakter, normalize kısa konu etiketi" }],
  "executive_summary": {
    "genel_ozet": "≤500 karakter, 2-3 cümle — bu ihalenin/programın neyi kapsadığını, hangi şehir/tarih/etaplarda yürütüleceğini ve yüklenicinin hangi ana hizmetleri sağlayacağını özetleyen iş kapsamı özeti. Katılım kısıtı, teminat, risk, ceza, yasak, fiyat farkı ve yeterlilik şartlarından burada bahsetme.",
    "genel_risk_skoru": "0-100 arası tam sayı, şartnamenin GENEL karmaşıklık/risk seviyesi (riskler dizisinin ortalaması değil, şartnamenin bütününe dair bağımsız bir değerlendirme)",
    "risk_seviyesi": "düşük|orta|yüksek",
    "katilim_durumu": "uygun|sartli|uygun_degil — 'uygun': belirgin bir katılım engeli yok, 'sartli': katılım için ek koşullar/kısıtlar var, 'uygun_degil': açık bir katılım engeli var (örn. sadece davetli istekliler)",
    "onerilen_odaklar": ["≤80 karakter, en fazla 5 madde — işin kapsamından çıkan ana operasyon/hizmet başlıkları; risk veya tavsiye dili kullanma"]
  }
}

Bilgi olmayan diziler boş dizi ([]) olsun, dizi elemanı olarak "${NOT_DETECTED}" YAZMA.`;
}

/**
 * Faz 3.5'in zaten çıkardığı kesin alanları LLM'e bağlam olarak verir —
 * LLM bu alanları YENİDEN ÜRETMEZ, sadece diğer bölümleri üretirken
 * çelişkiye düşmemesi için referans alır.
 */
export function summarizeRuleBasedContext(sections: TenderAnalysisSection[]): string {
  const relevant = sections.filter((s) =>
    ['administrativeMeta', 'guarantee', 'criticalDates'].includes(s.section)
  );
  return JSON.stringify(relevant, null, 0);
}

/**
 * Katman 3: Output validation — SADECE LLM'in SERBEST METİN ÜRETTİĞİ
 * alanlara (riskler açıklaması, teknik yükümlülük maddeleri, gerekli
 * belge durumu, hızlı bakış cümleleri, iş özeti cümleleri) uygulanır.
 * Teminat Analizi'nin faktüel alt-alanları (oran, IBAN, tarih, ceza
 * oranı) bu filtreye TABİ DEĞİLDİR — bkz. sanitizeFactualField.
 */
const FORBIDDEN_PATTERNS: RegExp[] = [
  // Maliyet/fiyat tahmini ifadeleri
  /yaklaşık\s+maliyet/i,
  /tahmini\s+maliyet/i,
  /maliyeti?\s+(?:olacaktır|olabilir|tahmin)/i,
  // KÖK NEDEN DÜZELTMESİ: Önceki desen "\d TL ... teklif" şeklindeydi ve
  // şartnamede SIK geçen meşru ifadeleri de yanlışlıkla yakalıyordu (ör.
  // "500.000 TL üzeri teklifler için" bir EŞİK DEĞERİDİR, fiyat önerisi
  // DEĞİLDİR). Yeni desen sadece GERÇEK bir öneri/tavsiye FİİLİ ile
  // birlikte tetiklenir (önerilir, tavsiye edilir, teklif edilmeli/
  // verilmeli gibi) — salt "teklif" kelimesinin varlığında DEĞİL.
  /\b\d[\d.,]*\s*(?:tl|try|₺)[\s\S]{0,60}?(?:önerilir|önerilmektedir|öneririz|tavsiye\s+edilir|tahmin\s+edilmektedir|teklif\s+edilmeli|teklif\s+edilsin|teklif\s+verilmeli)/i,
  // NOT: ara metinde Türkçe sayı formatında nokta (binlik ayracı, ör.
  // "450.000 TL") geçebileceği için [^.] DEĞİL [\s\S] kullanılır — aksi
  // halde regex yanlışlıkla sayının içindeki noktada durup eşleşmeyi
  // kaçırır.
  /teklif\s+(?:fiyatı|bedeli)[\s\S]{0,60}?(?:önerilir|önerilmektedir|tavsiye|olmalı|edilir|verilmeli)/i,
  /(?:şu\s+fiyat[ıi]|bu\s+tutar[ıi])\s+teklif\s+ed/i,
  // Kazanma olasılığı / tavsiye ifadeleri
  /kazanma\s+olasılığı/i,
  /bu\s+ihaleye\s+gir(?:in|memeli|meli|ilmeli)?/i,
  /ihaleye\s+girmenizi?\s+(?:öneririz|tavsiye)/i,
  /ihaleye\s+girmemenizi?\s+(?:öneririz|tavsiye)/i,
  /rekabet(?:çi)?\s+(?:avantaj|durum)/i,
  /tavsiye\s+ed(?:erim|iyoruz|ilir)/i,
  /önerimiz/i
];

function checkForbidden(text: string): boolean {
  return FORBIDDEN_PATTERNS.some((pattern) => pattern.test(text));
}

const MAX_FIELD_LENGTH = 200; // Prompt'taki "≤180 karakter" kuralıyla uyumlu, küçük bir pay ile
const MAX_EXECUTIVE_SUMMARY_LENGTH = 550; // Prompt'taki "≤500 karakter" kuralıyla uyumlu, küçük bir pay ile

/**
 * Serbest metin alanları için tam güvenlik filtresi (katman 3). Riskler,
 * teknik yükümlülük maddeleri, hızlı bakış ve iş özeti cümleleri burada
 * geçer.
 */
function sanitizeField(raw: unknown, maxLength: number = MAX_FIELD_LENGTH): LlmAnalysisField {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { value: NOT_DETECTED };
  }

  const trimmed = raw.trim();

  if (trimmed === NOT_DETECTED) {
    return { value: NOT_DETECTED };
  }

  if (checkForbidden(trimmed)) {
    return {
      value: SECURITY_HIDDEN_MESSAGE,
      flagged: true,
      flagReason: 'forbidden_pattern_detected'
    };
  }

  // Ek güvenlik: alan çok uzunsa (madde metni kopyalanmış olabilir) kısalt.
  // Bu durum bir güvenlik ihlali değildir (flagged olmaz), sadece "her
  // alan en fazla 1-2 cümle" kuralının teknik garantisidir.
  if (trimmed.length > maxLength) {
    return { value: `${trimmed.slice(0, maxLength).trim()}…` };
  }

  return { value: trimmed };
}

/**
 * Teminat Analizi'nin faktüel alt-alanları için kullanılır. Bu alanlar
 * (oran, IBAN, geçerlilik tarihi, ceza oranı, teminat türleri) maliyet/
 * fiyat/öneri filtresine TABİ DEĞİLDİR — şartnamede açıkça yazan resmi
 * verilerdir. Sadece boş/eksik/aşırı-uzun durumlar için güvenli hale
 * getirilir; yasaklı-kalıp taraması YAPILMAZ.
 */
function sanitizeFactualField(raw: unknown): LlmAnalysisField {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { value: NOT_DETECTED };
  }

  const trimmed = raw.trim();

  if (trimmed.length > MAX_FIELD_LENGTH) {
    return { value: `${trimmed.slice(0, MAX_FIELD_LENGTH).trim()}…` };
  }

  return { value: trimmed };
}

/**
 * Teminat Analizi / Mali Yeterlilik'in faktüel alt-alanları için kullanılır.
 * Bu alanlar artık LLM'den { deger, kaynak } NESNESİ olarak gelir (geriye
 * dönük uyumluluk için düz string de kabul edilir — bu durumda kaynak
 * boş kalır). Maliyet/fiyat/öneri filtresine TABİ DEĞİLDİR — şartnamede
 * açıkça yazan resmi verilerdir. Kaynak alanı UYDURULMAZ: LLM zaten
 * "${NOT_DETECTED}" yazdıysa veya kaynak boşsa, alan boş bırakılır.
 */
function sanitizeFactualFieldWithSource(raw: RawFaktuelAlan | undefined): LlmAnalysisField {
  // Geriye dönük uyumluluk: düz string gelirse eski davranış (kaynaksız).
  if (typeof raw === 'string') {
    return sanitizeFactualField(raw);
  }

  if (!raw || typeof raw !== 'object') {
    return { value: NOT_DETECTED };
  }

  const obj = raw as { deger?: unknown; kaynak?: unknown };
  const valueField = sanitizeFactualField(obj.deger);

  const kaynakRaw = typeof obj.kaynak === 'string' ? obj.kaynak.trim() : '';
  const kaynak =
    kaynakRaw && kaynakRaw !== NOT_DETECTED
      ? kaynakRaw.length > MAX_FIELD_LENGTH
        ? `${kaynakRaw.slice(0, MAX_FIELD_LENGTH).trim()}…`
        : kaynakRaw
      : undefined;

  return kaynak ? { ...valueField, kaynak } : valueField;
}

/**
 * Çelişkiler dizisi (celiskiler) — LLM'in dokümanları okurken fark ettiği,
 * önceden tanımlanmamış herhangi bir alandaki tutarsızlıklar. Boş/eksik
 * öğeler atlanır; en fazla 5 öğe kabul edilir (prompt kuralı ile uyumlu).
 */
function sanitizeCeliskiler(raw: unknown): LlmCeliski[] {
  if (!Array.isArray(raw)) return [];

  const result: LlmCeliski[] = [];
  for (const item of raw.slice(0, 5)) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as { alan?: unknown; idari_deger?: unknown; teknik_deger?: unknown; aciklama?: unknown };
    const alan = typeof obj.alan === 'string' ? obj.alan.trim() : '';
    if (!alan || alan === NOT_DETECTED) continue;

    result.push({
      alan: alan.length > 80 ? `${alan.slice(0, 80).trim()}…` : alan,
      idariDeger: sanitizeFactualField(obj.idari_deger),
      teknikDeger: sanitizeFactualField(obj.teknik_deger),
      aciklama: sanitizeField(obj.aciklama)
    });
  }
  return result;
}

/**
 * Birim Fiyat Cetveli satırları (birim_fiyat_cetveli) — LLM'in semantik
 * okuması. Her satırın kalem_adi'nin dolu olması ZORUNLUDUR (boş/"tespit_
 * edilemedi" kalem adı olan satır anlamsızdır, atlanır); diğer tüm
 * hücreler eksik/belirsiz olabilir ve "tespit_edilemedi" olarak kalabilir
 * — bu UYDURMA değil, dürüst bir eksiklik beyanıdır. En fazla 30 satır
 * kabul edilir (prompt kuralıyla uyumlu).
 */
function sanitizeBoqKalemleri(raw: unknown): LlmBoqKalemi[] {
  if (!Array.isArray(raw)) return [];

  const GUVEN_SEVIYELERI = ['düşük', 'orta', 'yüksek'] as const;
  const result: LlmBoqKalemi[] = [];

  for (const item of raw.slice(0, 30)) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as {
      sira_no?: unknown;
      kalem_adi?: unknown;
      birim?: unknown;
      miktar?: unknown;
      birim_fiyat?: unknown;
      kdv_orani?: unknown;
      toplam_tutar?: unknown;
      kaynak?: unknown;
      guven_seviyesi?: unknown;
    };

    const kalemAdi = typeof obj.kalem_adi === 'string' ? obj.kalem_adi.trim() : '';
    if (!kalemAdi || kalemAdi === NOT_DETECTED) continue;

    const guven = GUVEN_SEVIYELERI.includes(obj.guven_seviyesi as (typeof GUVEN_SEVIYELERI)[number])
      ? (obj.guven_seviyesi as (typeof GUVEN_SEVIYELERI)[number])
      : 'düşük'; // Belirtilmemişse güvenli tarafta kal — "yüksek" varsayma.

    result.push({
      siraNo: sanitizeFactualField(obj.sira_no),
      kalemAdi: kalemAdi.length > 120 ? `${kalemAdi.slice(0, 120).trim()}…` : kalemAdi,
      birim: sanitizeFactualField(obj.birim),
      miktar: sanitizeFactualField(obj.miktar),
      birimFiyat: sanitizeFactualField(obj.birim_fiyat),
      kdvOrani: sanitizeFactualField(obj.kdv_orani),
      toplamTutar: sanitizeFactualField(obj.toplam_tutar),
      kaynak: sanitizeFactualField(obj.kaynak),
      guvenSeviyesi: guven
    });
  }
  return result;
}

/**
 * BFC Uyarıları (bfc_uyarilari) — LLM'in kendi cetvel okuması ile
 * kendisine bağlam olarak verilen parser/regex cetvel okuması arasında
 * fark ettiği tutarsızlıklar. En fazla 5 öğe kabul edilir.
 */
function sanitizeBfcUyarilari(raw: unknown): LlmBfcUyarisi[] {
  if (!Array.isArray(raw)) return [];

  const result: LlmBfcUyarisi[] = [];
  for (const item of raw.slice(0, 5)) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as { kalem_adi?: unknown; parser_degeri?: unknown; ai_degeri?: unknown; aciklama?: unknown };
    const kalemAdi = typeof obj.kalem_adi === 'string' ? obj.kalem_adi.trim() : '';
    if (!kalemAdi || kalemAdi === NOT_DETECTED) continue;

    result.push({
      kalemAdi: kalemAdi.length > 120 ? `${kalemAdi.slice(0, 120).trim()}…` : kalemAdi,
      parserDegeri: sanitizeFactualField(obj.parser_degeri),
      aiDegeri: sanitizeFactualField(obj.ai_degeri),
      aciklama: sanitizeField(obj.aciklama)
    });
  }
  return result;
}

/**
 * Zeyilname/Düzeltme İlanı Değişiklikleri (zeyilname_degisiklikleri) —
 * LLM'in zeyilname içeriğini orijinal metinle karşılaştırarak tespit
 * ettiği değişiklikler. En fazla 5 öğe kabul edilir. "durum" alanı
 * geçersiz/eksikse güvenli tarafta kalınır ("degistirildi" varsayılır —
 * "iptal_edildi" UYDURULMAZ, sadece LLM açıkça belirttiyse kullanılır).
 */
function sanitizeZeyilnameDegisiklikleri(raw: unknown): LlmZeyilnameDegisikligi[] {
  if (!Array.isArray(raw)) return [];

  const result: LlmZeyilnameDegisikligi[] = [];
  for (const item of raw.slice(0, 5)) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as {
      alan?: unknown;
      orijinal_deger?: unknown;
      guncel_deger?: unknown;
      zeyilname_kaynagi?: unknown;
      durum?: unknown;
    };
    const alan = typeof obj.alan === 'string' ? obj.alan.trim() : '';
    if (!alan || alan === NOT_DETECTED) continue;

    result.push({
      alan: alan.length > 80 ? `${alan.slice(0, 80).trim()}…` : alan,
      orijinalDeger: sanitizeFactualField(obj.orijinal_deger),
      guncelDeger: sanitizeFactualField(obj.guncel_deger),
      zeyilnameKaynagi: sanitizeFactualField(obj.zeyilname_kaynagi),
      durum: obj.durum === 'iptal_edildi' ? 'iptal_edildi' : 'degistirildi'
    });
  }
  return result;
}

/**
 * Özel Gereklilik Kartları (ozel_gereklilikler) — sabit kategori listesi
 * YOKTUR, LLM'in dokümana özgü serbestçe ürettiği kartlar. "Teslim",
 * "Diğer", "Genel" gibi çöp başlıklar burada da güvenlik amaçlı
 * ELENİR (prompt talimatına rağmen model yine de üretirse). En fazla
 * 10 kart kabul edilir.
 */
const GENERIC_TITLE_BLOCKLIST = new Set([
  'teslim',
  'diğer',
  'diger',
  'genel',
  'diğer hususlar',
  'diger hususlar',
  'genel hususlar'
]);

function sanitizeOzelGereklilikler(raw: unknown): LlmOzelGereklilik[] {
  if (!Array.isArray(raw)) return [];

  const ONEM_DERECELERI = ['kritik', 'orta', 'dusuk'] as const;
  const result: LlmOzelGereklilik[] = [];

  for (const item of raw.slice(0, 15)) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as {
      baslik?: unknown;
      kategori_tipi?: unknown;
      onem_derecesi?: unknown;
      aciklama?: unknown;
      teklif_etkisi?: unknown;
      maliyet_etkisi?: unknown;
      operasyon_etkisi?: unknown;
      gerekli_belgeler?: unknown;
      ilgili_kalemler?: unknown;
      kaynak?: unknown;
      kullanici_aksiyonu?: unknown;
      kaynak_madde?: unknown;
      konu_etiketi?: unknown;
    };

    const baslikRaw = typeof obj.baslik === 'string' ? obj.baslik.trim() : '';
    if (!baslikRaw || baslikRaw === NOT_DETECTED) continue;
    if (GENERIC_TITLE_BLOCKLIST.has(baslikRaw.toLocaleLowerCase('tr-TR'))) continue;

    const kategoriTipiRaw = typeof obj.kategori_tipi === 'string' ? obj.kategori_tipi.trim() : '';

    const onemDerecesi = ONEM_DERECELERI.includes(obj.onem_derecesi as (typeof ONEM_DERECELERI)[number])
      ? (obj.onem_derecesi as (typeof ONEM_DERECELERI)[number])
      : 'orta'; // Belirtilmemiş/geçersizse güvenli/nötr varsayılan — 'kritik' asla otomatik verilmez.

    result.push({
      baslik: baslikRaw.length > 80 ? `${baslikRaw.slice(0, 80).trim()}…` : baslikRaw,
      kategoriTipi: kategoriTipiRaw ? (kategoriTipiRaw.length > 60 ? `${kategoriTipiRaw.slice(0, 60).trim()}…` : kategoriTipiRaw) : 'Genel',
      onemDerecesi,
      aciklama: sanitizeFactualField(obj.aciklama),
      teklifEtkisi: sanitizeFactualField(obj.teklif_etkisi),
      maliyetEtkisi: sanitizeFactualField(obj.maliyet_etkisi),
      operasyonEtkisi: sanitizeFactualField(obj.operasyon_etkisi),
      gerekliBelgeler: sanitizeStringArray(obj.gerekli_belgeler, 6),
      ilgiliKalemler: sanitizeStringArray(obj.ilgili_kalemler, 5),
      kaynak: sanitizeFactualField(obj.kaynak),
      kullaniciAksiyonu: sanitizeFactualField(obj.kullanici_aksiyonu),
      kaynakMadde: sanitizeDedupKey(obj.kaynak_madde),
      konuEtiketi: sanitizeDedupKey(obj.konu_etiketi)
    });
  }
  return result;
}

function sanitizeKatilimKriteri(raw: RawKatilimKriteri | undefined): {
  sonuc: LlmAnalysisField;
  kaynak: LlmAnalysisField;
} {
  return {
    sonuc: sanitizeField(raw?.sonuc),
    kaynak: sanitizeFactualField(raw?.kaynak)
  };
}

function sanitizeTeknikKategoriler(raw: unknown): Array<{ baslik: string; maddeler: string[]; kaynak?: string | null }> {
  if (!Array.isArray(raw)) return [];

  const result: Array<{ baslik: string; maddeler: string[]; kaynak?: string | null }> = [];
  for (const item of raw.slice(0, 12)) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as { baslik?: unknown; maddeler?: unknown; kaynak?: unknown };
    const baslik = typeof obj.baslik === 'string' ? obj.baslik.trim() : '';
    if (!baslik || baslik === NOT_DETECTED || baslik.length > 80) continue;
    const maddeler = sanitizeStringArray(obj.maddeler, 6);
    if (maddeler.length === 0) continue;
    const kaynak = typeof obj.kaynak === 'string' && obj.kaynak.trim() && obj.kaynak.trim() !== NOT_DETECTED
      ? obj.kaynak.trim().slice(0, 80)
      : null;
    result.push({ baslik, maddeler, kaynak });
  }

  return result;
}

function sanitizeStringArray(raw: unknown, maxItems = 5): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .filter((item) => item.trim() !== NOT_DETECTED)
    .slice(0, maxItems)
    .map((item) => {
      const trimmed = item.trim();
      if (checkForbidden(trimmed)) return SECURITY_HIDDEN_MESSAGE;
      return trimmed.length > MAX_FIELD_LENGTH ? `${trimmed.slice(0, MAX_FIELD_LENGTH).trim()}…` : trimmed;
    });
}

const VALID_RISK_LEVELS = new Set(['düşük', 'orta', 'yüksek']);

/**
 * SPRINT NOTU (Aşama A — dedup altyapısı): `kaynak_madde` / `konu_etiketi`
 * gibi teknik altyapı alanlarını sanitize eder. Bunlar UI'da GÖSTERİLMEZ,
 * SADECE chunk'lar arası tekrar tespiti (dedup/merge) için kullanılır —
 * bu yüzden genel güvenlik filtresine (checkForbidden/sanitizeField) TABİ
 * DEĞİLDİR, sadece tip/uzunluk güvenliği uygulanır. Boş/"tespit_edilemedi"
 * ise undefined döner (dedup fonksiyonları bunu "yok" olarak ele alır).
 */
function sanitizeDedupKey(raw: unknown, maxLen = 40): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === NOT_DETECTED) return undefined;
  return trimmed.slice(0, maxLen);
}

/**
 * Risk skorunu güvenli bir şekilde 0-100 aralığına sıkıştırır. Geçersiz
 * (sayı olmayan, NaN, aralık dışı) bir değer gelirse undefined döner —
 * sahte/icat bir varsayılan ATANMAZ, UI bu durumda skor satırını
 * basitçe göstermez (mevcut seviye rozeti çalışmaya devam eder).
 */
function sanitizeRiskScore(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;
  const rounded = Math.round(raw);
  if (rounded < 0 || rounded > 100) return Math.max(0, Math.min(100, rounded));
  return rounded;
}

function sanitizeRiskLevelField(raw: unknown): 'düşük' | 'orta' | 'yüksek' | undefined {
  return typeof raw === 'string' && VALID_RISK_LEVELS.has(raw) ? (raw as 'düşük' | 'orta' | 'yüksek') : undefined;
}

function sanitizeRiskler(raw: unknown): LlmRiskOgesi[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((item): item is RawRiskOgesi => typeof item === 'object' && item !== null)
    .slice(0, 5) // prompt kuralı: "her array en fazla 5 item" — token tüketimini de sınırlar
    .map((item) => {
      const baslik =
        typeof item.baslik === 'string' && item.baslik.trim().length > 0
          ? item.baslik.trim().slice(0, 100)
          : 'Belirtilmemiş Risk';
      const seviye = VALID_RISK_LEVELS.has(item.seviye) ? item.seviye : 'orta';

      return {
        baslik,
        seviye,
        aciklama: sanitizeField(item.aciklama),
        kaynak: sanitizeFactualField(item.kaynak),
        riskSkoru: sanitizeRiskScore(item.risk_skoru),
        etki: sanitizeRiskLevelField(item.etki),
        olasilik: sanitizeRiskLevelField(item.olasilik),
        kaynakMadde: sanitizeDedupKey(item.kaynak_madde),
        konuEtiketi: sanitizeDedupKey(item.konu_etiketi)
      };
    });
}

function sanitizeGerekliBelgeler(raw: unknown): LlmGerekliBelge[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((item): item is RawGerekliBelge => typeof item === 'object' && item !== null)
    .slice(0, 5) // prompt kuralı: "her array en fazla 5 item"
    .map((item) => ({
      belgeAdi:
        typeof item.belge_adi === 'string' && item.belge_adi.trim().length > 0
          ? item.belge_adi.trim().slice(0, 120)
          : 'Belirtilmemiş Belge',
      durum: sanitizeField(item.durum),
      kaynak: sanitizeFactualField(item.kaynak),
      kaynakMadde: sanitizeDedupKey(item.kaynak_madde),
      konuEtiketi: sanitizeDedupKey(item.konu_etiketi)
    }));
}

const VALID_KATILIM_DURUMU = new Set(['uygun', 'sartli', 'uygun_degil']);

/**
 * Faz 4.5 — AI Değerlendirmesi (executive_summary) için güvenlik/
 * doğrulama katmanı. genel_ozet SERBEST METİNDİR ve sanitizeField'in
 * (forbidden-pattern taraması dahil) tam güvenlik filtresinden geçer —
 * tıpkı riskler/teknik yükümlülükler gibi. Sayısal/enum alanlar (skor,
 * seviye, katılım durumu) geçersizse undefined/varsayılan değere düşer,
 * hiçbir zaman icat edilmiş bir değer üretilmez. Ham veri tamamen eksik
 * veya bozuksa (örn. provider bu alanı hiç döndürmediyse) undefined
 * döner — bu, llmAnalysis section'ının data.executiveSummary'sinin
 * optional olmasının nedenidir (geriye dönük uyumluluk).
 */
function sanitizeExecutiveSummary(raw: LLMAnalysisRawJson['executive_summary']): LlmExecutiveSummary | undefined {
  if (!raw || typeof raw !== 'object') return undefined;

  const genelOzet = sanitizeField(raw.genel_ozet, MAX_EXECUTIVE_SUMMARY_LENGTH);
  const genelRiskSkoru = sanitizeRiskScore(raw.genel_risk_skoru);
  const riskSeviyesi = sanitizeRiskLevelField(raw.risk_seviyesi);
  const katilimDurumu =
    typeof raw.katilim_durumu === 'string' && VALID_KATILIM_DURUMU.has(raw.katilim_durumu)
      ? (raw.katilim_durumu as 'uygun' | 'sartli' | 'uygun_degil')
      : undefined;

  // Skorsuz veya kritik alanları eksik bir "yönetici özeti" anlamsızdır —
  // bu durumda hiç göstermemek (undefined dönmek), sahte/varsayılan bir
  // skor icat etmekten daha güvenlidir. Ancak genel özet tek başına güvenlik
  // filtresine takılırsa kartı tamamen bozuk göstermeyelim; görünür, güvenli
  // ve fiyat/teklif yönlendirmesi içermeyen kısa bir fallback yazalım.
  if (genelRiskSkoru === undefined || !riskSeviyesi || !katilimDurumu) {
    return undefined;
  }

  const safeGenelOzet = genelOzet.flagged
    ? { value: 'Bu ihale; dokümanda belirtilen program, hizmet veya teslimat kapsamının yüklenici tarafından sağlanmasını konu alır. Program/iş kapsamı, yüklenen şartname içeriğine göre analiz edilmelidir.' }
    : genelOzet;

  if (safeGenelOzet.value === NOT_DETECTED) {
    return undefined;
  }

  return {
    genelOzet: safeGenelOzet,
    genelRiskSkoru,
    riskSeviyesi,
    katilimDurumu,
    onerilenOdaklar: sanitizeStringArray(raw.onerilen_odaklar)
  };
}

/**
 * LLM'den dönen ham JSON metnini güvenli bir şekilde parse eder.
 * Bazı modeller markdown kod bloğu (```json ... ```) ile sarabilir —
 * bu durumu da tolere eder.
 */
/**
 * Kullanıcı talebi #7: Güvenli JSON extractor. Model JSON'un dışına
 * istemeden bir önsöz/sonsöz eklerse (örn. "İşte analiz: {...}" veya
 * "{...} Umarım yardımcı olur."), ilk '{' ve son '}' arasını alarak bunu
 * tolere eder. AMA bu, YARIM/TRUNCATED bir JSON'u (örn. modelin
 * max_tokens'a çarpıp ortasında kesildiği bir yanıtı) SESSİZCE
 * "düzeltilmiş" gibi göstermez — extraction sonrası metin hâlâ
 * JSON.parse'dan geçmek ZORUNDADIR; geçemezse hata olduğu gibi yukarı
 * fırlatılır (bkz. parseRawJson). Yani bu fonksiyon SADECE gürültüyü
 * temizler, asla geçersiz/eksik JSON'u "tamir etmeye" çalışmaz.
 */
function extractJsonObject(text: string): string {
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    // Hiç '{' veya '}' yok, veya sıralama anlamsız (ör. '}' önce geliyor)
    // — bu, extraction'ın kurtaramayacağı bir durumdur, metni olduğu gibi
    // bırak ki JSON.parse kendi açıklayıcı hatasını versin.
    return text;
  }

  return text.slice(firstBrace, lastBrace + 1);
}

export function parseRawJson(rawText: string): LLMAnalysisRawJson {
  const cleaned = rawText
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/```\s*$/, '')
    .trim();

  const extracted = extractJsonObject(cleaned);

  let parsed: unknown;
  try {
    parsed = JSON.parse(extracted);
  } catch (err) {
    // Kullanıcı talebi #7: yarım/truncated JSON SESSİZCE yutulmaz —
    // hata mesajı, bunun bir "kesilme" belirtisi olabileceğini açıkça
    // belirtir. NOT: kesilme kontrolü extraction ÖNCESİ temizlenmiş ham
    // metne bakar (extracted substring'e değil) — kesik bir yanıtın
    // içinde tesadüfen bir '}' karakteri olabilir ve bu, extraction'ın
    // "son karakter" sandığı yanlış noktayı doğru gibi gösterebilir.
    const looksTruncated = !cleaned.endsWith('}') && !cleaned.endsWith(']');
    const hint = looksTruncated
      ? ' (Yanıt "}" ile bitmiyor — bu genellikle yanıtın token limitine çarpıp YARIDA KESİLDİĞİNİ gösterir.)'
      : '';
    throw new Error(
      `LLM çıktısı geçerli JSON değil: ${err instanceof Error ? err.message : 'bilinmeyen hata'}${hint}`
    );
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('LLM çıktısı bir JSON nesnesi değil.');
  }

  return parsed as LLMAnalysisRawJson;
}

/**
 * Token kullanımına dayalı tahmini maliyet (USD). Sadece geliştirici/
 * debug görünürlüğü içindir, kesin bir faturalama değeri değildir.
 */
function estimateCostUsd(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * PRICE_PER_MILLION_INPUT_TOKENS_USD;
  const outputCost = (outputTokens / 1_000_000) * PRICE_PER_MILLION_OUTPUT_TOKENS_USD;
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
}

/**
 * Tek bir LLM çağrısı yapar (chunk'lı olsun ya da olmasın — chunk'lı bir
 * çağrıda `request.chunkInfo` dolu gelir, provider bunu prompt'a
 * yansıtır). Provider'ı çağırır, çıktıyı parse eder, her alanı uygun
 * güvenlik filtresinden (katman 3) geçirir ve tek-parçalık yapılandırılmış
 * sonucu döner. Hata durumunda (API hatası, geçersiz JSON, vb.) exception
 * fırlatır.
 */
async function runSingleAnalysisCall(
  provider: LLMProvider,
  request: LLMAnalysisRequest
): Promise<{ data: SingleAnalysisResult; usage?: LlmUsageMetadata }> {
  const { rawJson, usage } = await provider.generateAnalysis(request);

  const generatedAt = new Date().toISOString();

  let usageMetadata: LlmUsageMetadata | undefined;
  if (usage) {
    const estimatedCostUsd = estimateCostUsd(usage.inputTokens, usage.outputTokens);
    usageMetadata = {
      provider: provider.name,
      model: usage.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      estimatedCostUsd,
      createdAt: generatedAt
    };

    // Geliştirici/debug görünürlüğü — kullanıcı talebi: "Firestore'da veya
    // console log'da görülebilir" (UI'da gösterilmesi zorunlu değil).
    const chunkLabel = request.chunkInfo ? ` chunk=${request.chunkInfo.chunkIndex}/${request.chunkInfo.totalChunks}` : '';
    console.log(
      `[llm] Faz 4 analiz maliyeti${chunkLabel} — provider=${provider.name} model=${usage.model} inputTokens=${usage.inputTokens} outputTokens=${usage.outputTokens} estimatedCostUsd=${estimatedCostUsd}`
    );
  }

  const data: SingleAnalysisResult = {
    hizliBakis: {
      isTuru: sanitizeField(rawJson.hizli_bakis?.is_turu),
      katilimDurumu: sanitizeField(rawJson.hizli_bakis?.katilim_durumu),
      oneCikanRisk: sanitizeField(rawJson.hizli_bakis?.one_cikan_risk),
      kritikUyari: sanitizeField(rawJson.hizli_bakis?.kritik_uyari)
    },
    isOzeti: {
      buIsNe: sanitizeField(rawJson.is_ozeti?.bu_is_ne),
      neredeNeZaman: sanitizeField(rawJson.is_ozeti?.nerede_ne_zaman),
      yukleniciNeSaglayacak: sanitizeField(rawJson.is_ozeti?.yuklenici_ne_saglayacak)
    },
    katilimUygunlugu: {
      yerliIstekliSarti: {
        kriter: 'Yerli İstekli Şartı',
        ...sanitizeKatilimKriteri(rawJson.katilim_uygunlugu?.yerli_istekli_sarti)
      },
      konsorsiyum: {
        kriter: 'Konsorsiyum',
        ...sanitizeKatilimKriteri(rawJson.katilim_uygunlugu?.konsorsiyum)
      },
      altYuklenici: {
        kriter: 'Alt Yüklenici',
        ...sanitizeKatilimKriteri(rawJson.katilim_uygunlugu?.alt_yuklenici)
      },
      kismiTeklif: {
        kriter: 'Kısmi Teklif',
        ...sanitizeKatilimKriteri(rawJson.katilim_uygunlugu?.kismi_teklif)
      },
      elektronikEksiltme: {
        kriter: 'Elektronik Eksiltme',
        ...sanitizeKatilimKriteri(rawJson.katilim_uygunlugu?.elektronik_eksiltme)
      },
      isDeneyimi: {
        kriter: 'İş Deneyimi',
        ...sanitizeKatilimKriteri(rawJson.katilim_uygunlugu?.is_deneyimi)
      }
    },
    maliYeterlilik: {
      isDeneyimiOrani: sanitizeFactualFieldWithSource(rawJson.mali_yeterlilik?.is_deneyimi_orani),
      ciroYeterliligiOrani: sanitizeFactualFieldWithSource(rawJson.mali_yeterlilik?.ciro_yeterliligi_orani),
      bilancoSarti: sanitizeFactualFieldWithSource(rawJson.mali_yeterlilik?.bilanco_sarti),
      gelirTablosuSarti: sanitizeFactualFieldWithSource(rawJson.mali_yeterlilik?.gelir_tablosu_sarti),
      bankaReferansSarti: sanitizeFactualFieldWithSource(rawJson.mali_yeterlilik?.banka_referans_sarti)
    },
    // Teminat Analizi: BİLİNÇLİ OLARAK sanitizeFactualFieldWithSource
    // kullanılır (sanitizeField DEĞİL) — bu alanlar maliyet/fiyat
    // filtresine tabi değildir, şartnamede açıkça yazan resmi verilerdir.
    // Artık her alan {deger, kaynak} nesnesi olarak gelir.
    teminatAnalizi: {
      geciciTeminatOrani: sanitizeFactualFieldWithSource(rawJson.teminat_analizi?.gecici_teminat_orani),
      kesinTeminatOrani: sanitizeFactualFieldWithSource(rawJson.teminat_analizi?.kesin_teminat_orani),
      teminatGecerlilikTarihi: sanitizeFactualFieldWithSource(rawJson.teminat_analizi?.teminat_gecerlilik_tarihi),
      nakitTeminatIban: sanitizeFactualFieldWithSource(rawJson.teminat_analizi?.nakit_teminat_iban),
      aliciAdi: sanitizeFactualFieldWithSource(rawJson.teminat_analizi?.alici_adi),
      kabulEdilenTeminatTurleri: sanitizeFactualFieldWithSource(rawJson.teminat_analizi?.kabul_edilen_teminat_turleri),
      cezaOranlari: sanitizeFactualFieldWithSource(rawJson.teminat_analizi?.ceza_oranlari)
    },
    riskler: sanitizeRiskler(rawJson.riskler),
    teknikYukumlulukler: {
      kategoriler: sanitizeTeknikKategoriler(rawJson.teknik_yukumluluk?.kategoriler),
      ulasim: sanitizeStringArray(rawJson.teknik_yukumluluk?.ulasim),
      konaklama: sanitizeStringArray(rawJson.teknik_yukumluluk?.konaklama),
      yemek: sanitizeStringArray(rawJson.teknik_yukumluluk?.yemek),
      rehberlik: sanitizeStringArray(rawJson.teknik_yukumluluk?.rehberlik),
      sigorta: sanitizeStringArray(rawJson.teknik_yukumluluk?.sigorta),
      baskiGorunurluk: sanitizeStringArray(rawJson.teknik_yukumluluk?.baski_gorunurluk),
      hediyelikIkram: sanitizeStringArray(rawJson.teknik_yukumluluk?.hediyelik_ikram)
    },
    gerekliBelgeler: sanitizeGerekliBelgeler(rawJson.gerekli_belgeler),
    celiskiler: sanitizeCeliskiler(rawJson.celiskiler),
    birimFiyatCetveli: sanitizeBoqKalemleri(rawJson.birim_fiyat_cetveli),
    bfcUyarilari: sanitizeBfcUyarilari(rawJson.bfc_uyarilari),
    zeyilnameDegisiklikleri: sanitizeZeyilnameDegisiklikleri(rawJson.zeyilname_degisiklikleri),
    ozelGereklilikler: sanitizeOzelGereklilikler(rawJson.ozel_gereklilikler),
    executiveSummary: sanitizeExecutiveSummary(rawJson.executive_summary),
    provider: provider.name,
    generatedAt,
    usage: usageMetadata
  };

  return { data, usage: usageMetadata };
}

/**
 * Bir dokümanın (veya birden fazla dokümanın) sayfa görüntülerini,
 * en fazla CHUNK_PAGE_SIZE sayfa içeren ARDIŞIK parçalara böler. Sayfa
 * sırası korunur; bir chunk birden fazla dokümandan sayfa içerebilir
 * (ör. idari şartname 2 sayfa + teknik şartnamenin ilk 13 sayfası).
 *
 * KÖK NEDEN DÜZELTMESİ (mimari bug fix): Önceden sistem sadece İLK
 * CHUNK_PAGE_SIZE sayfayı gönderip GERİ KALANINI TAMAMEN ATIYORDU. Artık
 * hiçbir sayfa atlanmaz — sadece AYRI ÇAĞRILARA bölünür.
 */
function splitDocumentImagesIntoChunks(
  documentImages: NonNullable<LLMAnalysisRequest['documentImages']>,
  chunkSize: number
): Array<NonNullable<LLMAnalysisRequest['documentImages']>> {
  type FlatPage = {
    fileName: string;
    documentType: string;
    totalPdfPages?: number;
    page: NonNullable<LLMAnalysisRequest['documentImages']>[number]['pages'][number];
  };

  const flat: FlatPage[] = [];
  for (const doc of documentImages) {
    for (const page of doc.pages) {
      flat.push({ fileName: doc.fileName, documentType: doc.documentType, totalPdfPages: doc.totalPdfPages, page });
    }
  }

  const chunks: Array<NonNullable<LLMAnalysisRequest['documentImages']>> = [];
  for (let i = 0; i < flat.length; i += chunkSize) {
    const slice = flat.slice(i, i + chunkSize);
    // Bu chunk'taki sayfaları, ORİJİNAL doküman gruplamasını koruyarak
    // yeniden `documentImages` şekline sokar (bir chunk'ta birden fazla
    // doküman varsa her biri kendi bloğunda kalır).
    const byDoc = new Map<string, NonNullable<LLMAnalysisRequest['documentImages']>[number]>();
    for (const item of slice) {
      const key = `${item.fileName}::${item.documentType}`;
      const existing = byDoc.get(key);
      if (existing) {
        existing.pages.push(item.page);
      } else {
        byDoc.set(key, {
          fileName: item.fileName,
          documentType: item.documentType,
          totalPdfPages: item.totalPdfPages,
          pages: [item.page]
        });
      }
    }
    chunks.push([...byDoc.values()]);
  }
  return chunks;
}

/** Bir chunk grubunun okunabilir sayfa aralığı etiketini üretir, ör. "Sayfa 16-30". */
function describeChunkPageRange(chunkDocs: NonNullable<LLMAnalysisRequest['documentImages']>): string {
  const labels: string[] = [];
  for (const doc of chunkDocs) {
    const pageNumbers = doc.pages.map((p) => p.pageNumber);
    const min = Math.min(...pageNumbers);
    const max = Math.max(...pageNumbers);
    labels.push(doc.pages.length > 1 ? `${doc.fileName} — Sayfa ${min}-${max}` : `${doc.fileName} — Sayfa ${min}`);
  }
  return labels.join('; ');
}

/**
 * Aynı alana ait birden fazla chunk sonucunu DETERMİNİSTİK olarak
 * birleştirir (LLM'e SORULMAZ — programatik bir kural). İlk chunk'tan
 * itibaren "tespit_edilemedi" OLMAYAN ilk değeri esas alır; sonraki bir
 * chunk FARKLI bir değer bulduysa bunu UYDURMA/GÖRMEZDEN GELME yerine
 * `conflicts` dizisine bir çelişki kaydı olarak ekler (kullanıcı talebi
 * madde 6: "Tekil alanlarda çelişki varsa celiskiler alanına düşür").
 */
function mergeScalarField(fieldLabel: string, perChunkValues: LlmAnalysisField[], conflicts: LlmCeliski[]): LlmAnalysisField {
  const nonEmpty = perChunkValues.filter((f) => f && f.value && f.value !== NOT_DETECTED);
  if (nonEmpty.length === 0) return { value: NOT_DETECTED };

  const primary = nonEmpty[0];
  for (const other of nonEmpty.slice(1)) {
    if (other.value !== primary.value) {
      conflicts.push({
        alan: fieldLabel,
        idariDeger: primary,
        teknikDeger: other,
        aciklama: {
          value: 'Dokümanın farklı parçalarında (chunk) bu alan farklı okundu; parçalar birleştirilirken tespit edildi, elle kontrol edin.'
        }
      });
    }
  }
  return primary;
}

/**
 * SPRINT NOTU (tekrar eden kart sorunu — gerçek testte bulundu): Her
 * chunk BİRBİRİNDEN HABERSİZ çalıştığı için, aynı konuyu (ör. sağlık
 * hizmeti) farklı chunk'lar hafifçe farklı başlıklarla üretebiliyor
 * ("Sağlık Hizmeti" vs "Sağlık Hizmetleri", "Çevre Bakımı ve Düzenleme
 * Hizmeti" vs "Çevre Bakımı ve Düzenleme Hizmetleri"). Önceki TAM EŞLEŞME
 * (exact-match) birleştirme bu varyasyonları YAKALAYAMIYORDU — Trabzon
 * testinde aynı kategori 3 farklı isimle 3 kez göründü. Bu yardımcılar,
 * başlıkları Türkçe çoğul/iyelik eklerinden arındırıp KELİME KÜMESİ
 * benzerliğine (Jaccard) göre karşılaştırarak bu varyasyonları da
 * yakalar. Tam bir dilbilgisi çözümleyicisi DEĞİLDİR — sadece en sık
 * görülen ek kalıplarını (leri/ları/si/sı/i/ı vb.) kaba şekilde keser.
 */
function normalizeTrSuffix(word: string): string {
  const suffixes = ['leri', 'ları', 'sinin', 'sının', 'nin', 'nın', 'nun', 'nün', 'si', 'sı', 'su', 'sü', 'i', 'ı', 'u', 'ü'];
  for (const suf of suffixes) {
    if (word.length - suf.length >= 3 && word.endsWith(suf)) {
      return word.slice(0, -suf.length);
    }
  }
  return word;
}

const TR_STOPWORDS = new Set(['ve', 'ile', 'için', 'bir', 'bu']);

function titleToTokenSet(title: string): Set<string> {
  const words = title
    .toLocaleLowerCase('tr-TR')
    .replace(/[^a-zçğıöşü0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !TR_STOPWORDS.has(w))
    .map(normalizeTrSuffix);
  return new Set(words);
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** İki başlığın "aynı konu" sayılması için gereken minimum kelime-kümesi benzerliği (SADECE yapısal alan yoksa fallback olarak kullanılır — bkz. aşağıdaki not). */
const FUZZY_MATCH_THRESHOLD = 0.5;

/**
 * SPRINT NOTU (Aşama A — dedup mantığını daha güvenli alanlara bağlama):
 * Bir kaydın (risk/gerekli belge/özel gereklilik) chunk'lar arası
 * eşleştirmede kullanılabilecek YAPISAL (LLM'in serbest başlık metninden
 * DAHA GÜVENİLİR) kimlik alanları. `kaynakMadde`/`konuEtiketi` teknik
 * altyapı alanlarıdır (bkz. types/tender.ts) — UI'da gösterilmez.
 */
interface DedupStructuredKeys {
  kaynakMadde?: string;
  konuEtiketi?: string;
  kategoriTipi?: string;
  ilgiliKalemler?: string[];
}

/** Yapısal dedup anahtarlarını normalize eder (boşluk/noktalama/case farklarını eler). Boş/"tespit_edilemedi" ise null döner. */
function normalizeDedupKey(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLocaleLowerCase('tr-TR');
  if (!trimmed || trimmed === NOT_DETECTED) return null;
  const stripped = trimmed.replace(/^madde\s*/, '').replace(/^md\.?\s*/, '').replace(/[^\p{L}\p{N}]/gu, '');
  return stripped || null;
}

/**
 * mergeAndDedupeArrays'in BULANIK (fuzzy) sürümü. ÖNCE, verilirse,
 * `structuredKeyFn`'in döndürdüğü GÜVENLİ alanlara (kaynak madde no,
 * normalize konu etiketi, kategori tipi + ilgili kalemler kesişimi) göre
 * eşleştirme yapar — bu alanlar LLM'in serbest başlık metninden daha az
 * "kelime oyunu" riski taşır (ör. "Sağlık Hizmeti" vs "Sağlık Hizmetleri"
 * farklı kelime kümesi üretir ama AYNI konu_etiketi'ni paylaşabilir).
 * Bir kayıt için yapısal alan HİÇ verilmemişse (geriye dönük uyumluluk —
 * eski/uyumsuz LLM yanıtları), SADECE o zaman başlık kelime-kümesi
 * (Jaccard) benzerliğine düşülür. Konu-benzeri serbest metin başlıkları
 * için (riskler, özel gereklilikler, gerekli belgeler) kullanılır. Tablo
 * satırları (BFC vb.) gibi kesin eşleşme gerektiren alanlar için HÂLÂ
 * `mergeAndDedupeArrays` (tam eşleşme) kullanılmaya devam eder.
 */
function mergeAndDedupeArraysFuzzy<T>(
  perChunkArrays: T[][],
  keyFn: (item: T) => string,
  maxItems: number,
  label: string,
  structuredKeyFn?: (item: T) => DedupStructuredKeys
): T[] {
  const totalBeforeMerge = perChunkArrays.reduce((sum, arr) => sum + arr.length, 0);
  const merged: Array<{ item: T; tokens: Set<string>; keys: DedupStructuredKeys }> = [];
  let structuredMatchCount = 0;

  for (const arr of perChunkArrays) {
    for (const item of arr) {
      const key = keyFn(item)?.trim();
      if (!key) continue;
      const keys: DedupStructuredKeys = structuredKeyFn ? structuredKeyFn(item) : {};
      const normKaynak = normalizeDedupKey(keys.kaynakMadde);
      const normKonu = normalizeDedupKey(keys.konuEtiketi);
      const normKategori = normalizeDedupKey(keys.kategoriTipi);

      const structuredExisting = merged.find((m) => {
        if (normKaynak && normalizeDedupKey(m.keys.kaynakMadde) === normKaynak) return true;
        if (normKonu && normalizeDedupKey(m.keys.konuEtiketi) === normKonu) return true;
        if (
          normKategori &&
          normalizeDedupKey(m.keys.kategoriTipi) === normKategori &&
          keys.ilgiliKalemler?.length &&
          m.keys.ilgiliKalemler?.some((x) => keys.ilgiliKalemler!.includes(x))
        ) {
          return true;
        }
        return false;
      });

      if (structuredExisting) {
        structuredMatchCount += 1;
        continue;
      }

      const tokens = titleToTokenSet(key);
      // Yapısal alan HİÇ verilmemişse (bu kayıt için kaynak_madde/
      // konu_etiketi ikisi de boş), geriye dönük uyumluluk için başlık
      // benzerliğine (Jaccard) düş. Yapısal alanı OLAN ama eşleşme
      // BULUNAMAYAN bir kayıt için jaccard'a düşülmez — bu, "farklı
      // konu ama tesadüfen benzer kelimeler" yanlış-birleştirmesini
      // önler (dedup'ı başlık benzerliğinden çıkarma amacının özü).
      const hasAnyStructuredKey = !!(normKaynak || normKonu);
      const fallbackExisting = !hasAnyStructuredKey
        ? merged.find((m) => jaccardSimilarity(m.tokens, tokens) >= FUZZY_MATCH_THRESHOLD)
        : undefined;
      if (fallbackExisting) continue;

      merged.push({ item, tokens, keys });
    }
  }

  const result = merged.slice(0, maxItems).map((m) => m.item);
  const duplicatesRemoved = totalBeforeMerge - merged.length;
  const truncated = merged.length - result.length;
  devLog(
    `Reduce [${label}] (yapısal + bulanık eşleştirme): ${totalBeforeMerge} kayıt (chunk'lardan toplam) -> ${merged.length} benzersiz (${duplicatesRemoved} tekrar/benzer kayıt birleştirildi, ${structuredMatchCount} tanesi kaynak madde/konu etiketiyle yakalandı)` +
      (truncated > 0 ? ` -> ${result.length} kayıt kaldı (üst sınır ${maxItems} nedeniyle ${truncated} kayıt daha kırpıldı)` : ` -> ${result.length} kayıt son JSON'da`)
  );
  return result;
}

/**
 * Nesne dizilerini (riskler, gerekli belgeler, özel gereklilikler vb.)
 * chunk'lar arasında birleştirip normalize edilmiş anahtara göre
 * TEKRARLARI TEMİZLER (kullanıcı talebi madde 7). Aynı anahtarla ilk
 * karşılaşılan öğe korunur.
 *
 * `label` SADECE development log'ları için kullanılır (ör. "riskler",
 * "özel gereklilikler") — çıktıya hiçbir etkisi yoktur.
 */
function mergeAndDedupeArrays<T>(perChunkArrays: T[][], keyFn: (item: T) => string, maxItems: number, label: string): T[] {
  const byKey = new Map<string, T>();
  const totalBeforeMerge = perChunkArrays.reduce((sum, arr) => sum + arr.length, 0);
  for (const arr of perChunkArrays) {
    for (const item of arr) {
      const key = keyFn(item).toLocaleLowerCase('tr-TR').trim();
      if (!key) continue;
      if (!byKey.has(key)) byKey.set(key, item);
    }
  }
  const merged = [...byKey.values()].slice(0, maxItems);
  const duplicatesRemoved = totalBeforeMerge - byKey.size;
  const truncated = byKey.size - merged.length;
  devLog(
    `Reduce [${label}]: ${totalBeforeMerge} kayıt (chunk'lardan toplam) -> ${byKey.size} benzersiz (${duplicatesRemoved} tekrar silindi)` +
      (truncated > 0 ? ` -> ${merged.length} kayıt kaldı (üst sınır ${maxItems} nedeniyle ${truncated} kayıt daha kırpıldı)` : ` -> ${merged.length} kayıt son JSON'da`)
  );
  return merged;
}

/**
 * teknikYukumlulukler.kategoriler için özel birleştirme: aynı başlık
 * birden fazla chunk'ta çıkarsa (ör. "Yemek Hizmetleri" kategorisi hem
 * chunk 1 hem chunk 2'de bahsi geçiyorsa), maddeler dizileri BİRLEŞTİRİLİR
 * (union + dedupe) — sadece ilk chunk'ınki tutulup diğerleri atılmaz.
 */
function mergeTeknikKategoriler(
  perChunkCategories: Array<Array<{ baslik: string; maddeler: string[]; kaynak?: string | null }>>,
  maxCategories: number
): Array<{ baslik: string; maddeler: string[]; kaynak?: string | null }> {
  const totalBeforeMerge = perChunkCategories.reduce((sum, arr) => sum + arr.length, 0);
  const merged: Array<{ cat: { baslik: string; maddeler: string[]; kaynak?: string | null }; tokens: Set<string> }> = [];

  for (const categories of perChunkCategories) {
    for (const cat of categories) {
      const baslik = cat.baslik?.trim();
      if (!baslik) continue;
      const tokens = titleToTokenSet(baslik);
      const existing = merged.find((m) => jaccardSimilarity(m.tokens, tokens) >= FUZZY_MATCH_THRESHOLD);

      if (!existing) {
        merged.push({ cat: { ...cat, maddeler: [...cat.maddeler] }, tokens });
        continue;
      }

      // Maddeler dizisini birleştir + normalize edilmiş metne göre dedupe et.
      const seen = new Set(existing.cat.maddeler.map((m) => m.toLocaleLowerCase('tr-TR').trim()));
      for (const madde of cat.maddeler) {
        const normalized = madde.toLocaleLowerCase('tr-TR').trim();
        if (!seen.has(normalized)) {
          existing.cat.maddeler.push(madde);
          seen.add(normalized);
        }
      }
      existing.cat.maddeler = existing.cat.maddeler.slice(0, 12); // tek kategori için makul üst sınır
      if (!existing.cat.kaynak && cat.kaynak) existing.cat.kaynak = cat.kaynak;
    }
  }

  const result = merged.slice(0, maxCategories).map((m) => m.cat);
  const duplicatesRemoved = totalBeforeMerge - merged.length;
  const truncated = merged.length - result.length;
  devLog(
    `Reduce [teknik kategoriler] (bulanık eşleştirme): ${totalBeforeMerge} kayıt (chunk'lardan toplam) -> ${merged.length} benzersiz başlık (${duplicatesRemoved} tekrar/benzer başlık birleştirildi, maddeler union'landı)` +
      (truncated > 0 ? ` -> ${result.length} kategori kaldı (üst sınır ${maxCategories} nedeniyle ${truncated} kategori kırpıldı)` : ` -> ${result.length} kategori son JSON'da`)
  );
  return result;
}

/**
 * Çok-parçalı (chunk'lı) analizde her chunk'ın kendi `genelRiskSkoru`
 * SADECE o parçada gördüğü sayfalara dayanır. Birleştirmede ORTALAMA
 * alınır (basit, deterministik, her parçayı eşit ağırlıklandırır).
 */
function mergeRiskScore(scores: number[]): number {
  const valid = scores.filter((s) => Number.isFinite(s));
  if (valid.length === 0) return 0;
  return Math.round(valid.reduce((sum, s) => sum + s, 0) / valid.length);
}

const RISK_SEVERITY_ORDER = { 'düşük': 0, orta: 1, yüksek: 2 } as const;
/** En kötümser (en yüksek) risk seviyesini seçer — bir chunk yüksek risk bulduysa bu asla gizlenmez. */
function mergeMostSevere<T extends 'düşük' | 'orta' | 'yüksek'>(values: T[], fallback: T): T {
  if (values.length === 0) return fallback;
  return values.reduce((worst, v) => (RISK_SEVERITY_ORDER[v] > RISK_SEVERITY_ORDER[worst] ? v : worst), values[0]);
}

const KATILIM_DURUMU_ORDER = { uygun: 0, sartli: 1, uygun_degil: 2 } as const;
/** En kısıtlayıcı katılım durumunu seçer — bir chunk "uygun_değil" bulduysa bu asla gizlenmez. */
function mergeMostRestrictiveKatilimDurumu(values: Array<'uygun' | 'sartli' | 'uygun_degil'>): 'uygun' | 'sartli' | 'uygun_degil' {
  if (values.length === 0) return 'uygun';
  return values.reduce((worst, v) => (KATILIM_DURUMU_ORDER[v] > KATILIM_DURUMU_ORDER[worst] ? v : worst), values[0]);
}

/**
 * Birden fazla chunk'ın tam sonucunu (her biri SingleAnalysisResult) TEK
 * bir yapılandırılmış sonuca DETERMİNİSTİK olarak birleştirir. Bu adım
 * LLM ÇAĞRISI GEREKTİRMEZ — programatik bir kural motorudur, bu yüzden
 * halüsinasyon riski taşımaz.
 */
function mergeChunkedResults(chunkResults: SingleAnalysisResult[], providerName: string): SingleAnalysisResult {
  const conflicts: LlmCeliski[] = [];
  devLog(`Reduce aşaması başlıyor — ${chunkResults.length} chunk sonucu birleştiriliyor.`);

  const merged: SingleAnalysisResult = {
    hizliBakis: {
      isTuru: mergeScalarField('İş Türü', chunkResults.map((r) => r.hizliBakis.isTuru), conflicts),
      katilimDurumu: mergeScalarField('Katılım Durumu (Hızlı Bakış)', chunkResults.map((r) => r.hizliBakis.katilimDurumu), conflicts),
      oneCikanRisk: mergeScalarField('Öne Çıkan Risk', chunkResults.map((r) => r.hizliBakis.oneCikanRisk), conflicts),
      kritikUyari: mergeScalarField('Kritik Uyarı', chunkResults.map((r) => r.hizliBakis.kritikUyari), conflicts)
    },
    isOzeti: {
      buIsNe: mergeScalarField('Bu İş Ne', chunkResults.map((r) => r.isOzeti.buIsNe), conflicts),
      neredeNeZaman: mergeScalarField('Nerede/Ne Zaman', chunkResults.map((r) => r.isOzeti.neredeNeZaman), conflicts),
      yukleniciNeSaglayacak: mergeScalarField('Yüklenici Ne Sağlayacak', chunkResults.map((r) => r.isOzeti.yukleniciNeSaglayacak), conflicts)
    },
    katilimUygunlugu: {
      yerliIstekliSarti: {
        kriter: 'Yerli İstekli Şartı',
        sonuc: mergeScalarField('Yerli İstekli Şartı', chunkResults.map((r) => r.katilimUygunlugu.yerliIstekliSarti.sonuc), conflicts),
        kaynak: mergeScalarField('Yerli İstekli Şartı Kaynağı', chunkResults.map((r) => r.katilimUygunlugu.yerliIstekliSarti.kaynak), conflicts)
      },
      konsorsiyum: {
        kriter: 'Konsorsiyum',
        sonuc: mergeScalarField('Konsorsiyum', chunkResults.map((r) => r.katilimUygunlugu.konsorsiyum.sonuc), conflicts),
        kaynak: mergeScalarField('Konsorsiyum Kaynağı', chunkResults.map((r) => r.katilimUygunlugu.konsorsiyum.kaynak), conflicts)
      },
      altYuklenici: {
        kriter: 'Alt Yüklenici',
        sonuc: mergeScalarField('Alt Yüklenici', chunkResults.map((r) => r.katilimUygunlugu.altYuklenici.sonuc), conflicts),
        kaynak: mergeScalarField('Alt Yüklenici Kaynağı', chunkResults.map((r) => r.katilimUygunlugu.altYuklenici.kaynak), conflicts)
      },
      kismiTeklif: {
        kriter: 'Kısmi Teklif',
        sonuc: mergeScalarField('Kısmi Teklif', chunkResults.map((r) => r.katilimUygunlugu.kismiTeklif.sonuc), conflicts),
        kaynak: mergeScalarField('Kısmi Teklif Kaynağı', chunkResults.map((r) => r.katilimUygunlugu.kismiTeklif.kaynak), conflicts)
      },
      elektronikEksiltme: {
        kriter: 'Elektronik Eksiltme',
        sonuc: mergeScalarField('Elektronik Eksiltme', chunkResults.map((r) => r.katilimUygunlugu.elektronikEksiltme.sonuc), conflicts),
        kaynak: mergeScalarField('Elektronik Eksiltme Kaynağı', chunkResults.map((r) => r.katilimUygunlugu.elektronikEksiltme.kaynak), conflicts)
      },
      isDeneyimi: {
        kriter: 'İş Deneyimi',
        sonuc: mergeScalarField('İş Deneyimi (Katılım)', chunkResults.map((r) => r.katilimUygunlugu.isDeneyimi.sonuc), conflicts),
        kaynak: mergeScalarField('İş Deneyimi Kaynağı (Katılım)', chunkResults.map((r) => r.katilimUygunlugu.isDeneyimi.kaynak), conflicts)
      }
    },
    maliYeterlilik: {
      isDeneyimiOrani: mergeScalarField('İş Deneyimi Oranı', chunkResults.map((r) => r.maliYeterlilik?.isDeneyimiOrani ?? { value: NOT_DETECTED }), conflicts),
      ciroYeterliligiOrani: mergeScalarField('Ciro Yeterliliği Oranı', chunkResults.map((r) => r.maliYeterlilik?.ciroYeterliligiOrani ?? { value: NOT_DETECTED }), conflicts),
      bilancoSarti: mergeScalarField('Bilanço Şartı', chunkResults.map((r) => r.maliYeterlilik?.bilancoSarti ?? { value: NOT_DETECTED }), conflicts),
      gelirTablosuSarti: mergeScalarField('Gelir Tablosu Şartı', chunkResults.map((r) => r.maliYeterlilik?.gelirTablosuSarti ?? { value: NOT_DETECTED }), conflicts),
      bankaReferansSarti: mergeScalarField('Banka Referans Şartı', chunkResults.map((r) => r.maliYeterlilik?.bankaReferansSarti ?? { value: NOT_DETECTED }), conflicts)
    },
    teminatAnalizi: {
      geciciTeminatOrani: mergeScalarField('Geçici Teminat Oranı', chunkResults.map((r) => r.teminatAnalizi.geciciTeminatOrani), conflicts),
      kesinTeminatOrani: mergeScalarField('Kesin Teminat Oranı', chunkResults.map((r) => r.teminatAnalizi.kesinTeminatOrani), conflicts),
      teminatGecerlilikTarihi: mergeScalarField('Teminat Geçerlilik Tarihi', chunkResults.map((r) => r.teminatAnalizi.teminatGecerlilikTarihi), conflicts),
      nakitTeminatIban: mergeScalarField('Nakit Teminat IBAN', chunkResults.map((r) => r.teminatAnalizi.nakitTeminatIban), conflicts),
      aliciAdi: mergeScalarField('Alıcı Adı', chunkResults.map((r) => r.teminatAnalizi.aliciAdi), conflicts),
      kabulEdilenTeminatTurleri: mergeScalarField('Kabul Edilen Teminat Türleri', chunkResults.map((r) => r.teminatAnalizi.kabulEdilenTeminatTurleri), conflicts),
      cezaOranlari: mergeScalarField('Ceza Oranları', chunkResults.map((r) => r.teminatAnalizi.cezaOranlari), conflicts)
    },
    riskler: mergeAndDedupeArraysFuzzy(
      chunkResults.map((r) => r.riskler),
      (r) => r.baslik,
      15,
      'riskler',
      (r) => ({ kaynakMadde: r.kaynakMadde, konuEtiketi: r.konuEtiketi })
    ),
    teknikYukumlulukler: {
      kategoriler: mergeTeknikKategoriler(chunkResults.map((r) => r.teknikYukumlulukler.kategoriler ?? []), 20),
      ulasim: [],
      konaklama: [],
      yemek: [],
      rehberlik: [],
      sigorta: [],
      baskiGorunurluk: [],
      hediyelikIkram: []
    },
    gerekliBelgeler: mergeAndDedupeArraysFuzzy(
      chunkResults.map((r) => r.gerekliBelgeler),
      (b) => b.belgeAdi,
      15,
      'gerekli belgeler',
      (b) => ({ kaynakMadde: b.kaynakMadde, konuEtiketi: b.konuEtiketi })
    ),
    celiskiler: [
      ...mergeAndDedupeArrays(chunkResults.map((r) => r.celiskiler ?? []), (c) => c.alan, 15, 'çelişkiler (LLM tespitli)'),
      ...conflicts
    ],
    birimFiyatCetveli: mergeAndDedupeArrays(chunkResults.map((r) => r.birimFiyatCetveli ?? []), (k) => `${k.siraNo.value}-${k.kalemAdi}`, 60, 'BFC satırları'),
    bfcUyarilari: mergeAndDedupeArrays(chunkResults.map((r) => r.bfcUyarilari ?? []), (u) => u.kalemAdi, 10, 'BFC uyarıları'),
    zeyilnameDegisiklikleri: mergeAndDedupeArrays(chunkResults.map((r) => r.zeyilnameDegisiklikleri ?? []), (z) => z.alan, 10, 'zeyilname değişiklikleri'),
    ozelGereklilikler: mergeAndDedupeArraysFuzzy(
      chunkResults.map((r) => r.ozelGereklilikler ?? []),
      (o) => o.baslik,
      20,
      'özel gereklilikler',
      (o) => ({ kaynakMadde: o.kaynakMadde, konuEtiketi: o.konuEtiketi, kategoriTipi: o.kategoriTipi, ilgiliKalemler: o.ilgiliKalemler })
    ),
    executiveSummary: {
      genelOzet: mergeScalarField('Genel Özet', chunkResults.map((r) => r.executiveSummary?.genelOzet ?? { value: NOT_DETECTED }), conflicts),
      genelRiskSkoru: mergeRiskScore(chunkResults.map((r) => r.executiveSummary?.genelRiskSkoru ?? 0)),
      riskSeviyesi: mergeMostSevere(chunkResults.map((r) => r.executiveSummary?.riskSeviyesi).filter((v): v is 'düşük' | 'orta' | 'yüksek' => !!v), 'orta'),
      katilimDurumu: mergeMostRestrictiveKatilimDurumu(
        chunkResults.map((r) => r.executiveSummary?.katilimDurumu).filter((v): v is 'uygun' | 'sartli' | 'uygun_degil' => !!v)
      ),
      onerilenOdaklar: mergeAndDedupeArrays(
        chunkResults.map((r) => r.executiveSummary?.onerilenOdaklar?.map((o) => ({ o })) ?? []),
        (x) => x.o,
        6,
        'önerilen odaklar'
      ).map((x) => x.o)
    },
    provider: providerName,
    generatedAt: new Date().toISOString(),
    usage: undefined // runLlmAnalysis çağıran kod tarafından toplam kullanım ile DOLDURULUR.
  };

  devLog(
    `Reduce aşaması tamamlandı — tekil alan çelişkileri: ${conflicts.length} | ` +
      `son JSON: riskler=${merged.riskler.length}, gerekliBelgeler=${merged.gerekliBelgeler.length}, ` +
      `ozelGereklilikler=${merged.ozelGereklilikler?.length ?? 0}, birimFiyatCetveli=${merged.birimFiyatCetveli?.length ?? 0}, ` +
      `celiskiler=${merged.celiskiler?.length ?? 0}, teknikKategoriler=${merged.teknikYukumlulukler.kategoriler?.length ?? 0}`
  );

  return merged;
}

/**
 * Ana orkestrasyon fonksiyonu: provider'ı çağırır, çıktıyı parse eder,
 * her alanı uygun güvenlik filtresinden (katman 3) geçirir ve son
 * yapılandırılmış sonucu döner. Hata durumunda (API hatası, geçersiz
 * JSON, vb.) exception fırlatır — çağıran kod (analysis/run/route.ts)
 * bu durumda llmAnalysis section'ını yazmaz, Faz 3.5 sonuçlarını
 * ETKİLEMEZ.
 *
 * KÖK NEDEN DÜZELTMESİ (mimari bug fix — chunk'lama): Önceden, taranmış/
 * görsel bir dokümanın CHUNK_PAGE_SIZE'ı (15) aşan sayfaları SESSİZCE
 * atlanıyordu (bkz. pdfToImages.ts eski davranışı). Artık:
 *   - Toplam sayfa sayısı CHUNK_PAGE_SIZE'ı aşmıyorsa: TEK çağrı (eski
 *     davranış, regresyon riski yok).
 *   - Aşıyorsa: doküman ARDIŞIK PARÇALARA bölünür, HER PARÇA için AYRI
 *     bir LLM çağrısı yapılır (her birine "sen X/Y parçasını görüyorsun"
 *     bilgisi verilir — bkz. providers/anthropic.ts), sonuçlar
 *     DETERMİNİSTİK olarak birleştirilir (bkz. mergeChunkedResults) ve
 *     kullanıcıya "kaç sayfanın analiz edildiği" bilgisi eklenir
 *     (analizKapsami — bkz. types/tender.ts LlmAnalizKapsami).
 */
export async function runLlmAnalysis(
  provider: LLMProvider,
  request: LLMAnalysisRequest
): Promise<TenderAnalysisLlmAnalysis['data']> {
  const documentImages = request.documentImages ?? [];
  const totalSentPages = documentImages.reduce((sum, doc) => sum + doc.pages.length, 0);
  const totalRealPages = documentImages.reduce((sum, doc) => sum + (doc.totalPdfPages ?? doc.pages.length), 0);

  // KOŞULSUZ log (chunk'lama tetiklensin ya da tetiklenmesin HER ZAMAN
  // yazılır — production'da da). Amaç: "chunk'lama neden tetiklenmedi"
  // sorusuna her zaman kesin bir cevap olsun (ör. documentImages hiç
  // dolu gelmediyse, ya da toplam sayfa zaten CHUNK_PAGE_SIZE'ın altındaysa).
  console.log(
    `[llm] runLlmAnalysis çağrıldı — dokümanSayısı=${documentImages.length}, gönderilenSayfa=${totalSentPages}, gerçekToplamSayfa=${totalRealPages}, CHUNK_PAGE_SIZE=${CHUNK_PAGE_SIZE}, chunkGerekiyorMu=${totalSentPages > CHUNK_PAGE_SIZE}`
  );

  // --- Tek çağrı yeterli (chunk gerekmiyor) ---
  if (totalSentPages <= CHUNK_PAGE_SIZE) {
    const { data, usage } = await runSingleAnalysisCall(provider, request);

    // KÖK NEDEN DÜZELTMESİ (Aşama A — tek chunk'ta da dedup): Önceden
    // dedup/reduce mantığı (mergeChunkedResults) SADECE doküman birden
    // fazla parçaya (chunk) bölündüğünde çalışıyordu. Ama tek bir LLM
    // çağrısının KENDİ yanıtı içinde de aynı konu birden fazla kez
    // üretilebilir (ör. iki ayrı risk maddesi olarak "Sağlık Hizmeti" ve
    // "Sağlık Hizmetleri"). Artık tek çağrılı sonuçlar da AYNI
    // deterministik reduce/dedup fonksiyonundan geçirilir — "1 elemanlı
    // bir chunk listesi" gibi ele alınır. Bu, chunk sayısı 1 de olsa 6 da
    // olsa dedup davranışının TUTARLI olmasını sağlar.
    const merged = mergeChunkedResults([data], provider.name);
    if (usage) {
      merged.usage = usage;
    }
    if (documentImages.length > 0) {
      const kapsam: LlmAnalizKapsami = {
        toplamSayfa: totalRealPages,
        analizEdilenSayfa: totalSentPages,
        parcaSayisi: 1,
        tamamiOkundu: totalSentPages >= totalRealPages
      };
      merged.analizKapsami = kapsam;
    }
    return merged;
  }

  // --- Chunk'lama gerekiyor: dokümanı parçalara böl, her parça için ayrı çağrı yap ---
  const chunks = splitDocumentImagesIntoChunks(documentImages, CHUNK_PAGE_SIZE);
  const totalChunks = chunks.length;

  console.log(
    `[llm] Doküman ${totalSentPages} sayfa (${totalRealPages} toplam) — CHUNK_PAGE_SIZE=${CHUNK_PAGE_SIZE} aşıldığı için ${totalChunks} parçaya bölündü.`
  );

  const chunkRequests: Array<{ chunkDocs: NonNullable<LLMAnalysisRequest['documentImages']>; pageRangeLabel: string; index: number }> = chunks.map(
    (chunkDocs, i) => ({ chunkDocs, pageRangeLabel: describeChunkPageRange(chunkDocs), index: i })
  );

  // KÖK NEDEN DÜZELTMESİ (kritik bug — "Failed to fetch"): Önceden chunk'lar
  // SIRALI (bir bitmeden diğeri başlamadan) işleniyordu. Gerçek test
  // (Trabzon dokümanı, 6 chunk) bunun tek bir chunk'ın ~190 saniye
  // sürdüğünü, 6 chunk'ın SIRALI toplamda 15-19 DAKİKAYA çıktığını
  // gösterdi — bu da Node.js'in varsayılan HTTP istek zaman aşımını
  // (Node 18+'ta 5 dakika) aşıp bağlantının zorla kapatılmasına, tarayıcı
  // tarafında "Failed to fetch" hatasına yol açıyordu. Artık chunk'lar
  // PARALEL çalıştırılıyor — toplam süre tek bir chunk'ın süresine yakın
  // bir değere iniyor (6 kata kadar hızlanma). Bilinçli ödün: eğer
  // Anthropic API hesabınızın eşzamanlı istek/rate-limit sınırı düşükse,
  // 6 paralel Vision isteği 429 (rate limit) hatasına yol açabilir — bu,
  // 15-19 dakika sürüp KESİN başarısız olmaktan daha iyi bir risktir
  // (en azından anlamlı bir hata mesajı alınır). Bir chunk başarısız
  // olursa YİNE tüm analiz İPTAL edilir (Promise.all ilk hatada reddeder)
  // — kısmi/tutarsız bir sonuç sessizce kullanıcıya sunulmaz.
  //
  // SPRINT NOTU (Aşama A — Prompt Cache, DÜZELTİLMİŞ akış): İlk versiyon
  // ilk chunk'ın TAMAMEN bitmesini (~190sn) bekleyip ANCAK ONDAN SONRA
  // kalan chunk'ları ateşliyordu — bu, chunk sayısı arttıkça toplam süreyi
  // ciddi şekilde uzatıyordu (ör. 2 chunk'ta ~190sn yerine ~380sn) ve
  // `maxDuration=300`'ü (bkz. from-documents/route.ts) aşma riski
  // taşıyordu; yani "Failed to fetch" riskini azaltmak için eklenen cache
  // ısıtması, AYNI riski geri getiriyordu. Bu KABUL EDİLMEDİ.
  //
  // Düzeltilmiş akış: İlk chunk isteği ATEŞLENİR ama TAMAMLANMASI
  // BEKLENMEZ; sadece KISA, SABİT bir gecikme (CACHE_WARMUP_DELAY_MS)
  // sonra kalan TÜM chunk'lar paralel ateşlenir, ardından TÜMÜ birlikte
  // beklenir. Böylece:
  //   - Toplam süre ≈ tek bir chunk'ın süresine yakın kalır (chunk sayısı
  //     arttıkça büyümez) — paralelleştirmenin süre avantajı KORUNUR.
  //   - Cache'in "ısınması" için ilk isteğe küçük bir baş payı verilir
  //     (Anthropic'in prompt işleme/prefill aşaması, ~dakikalar süren
  //     çıktı üretiminden çok daha hızlıdır — birkaç saniyelik bir baş
  //     payı çoğu durumda yeterli olmalıdır) — ama bu bir GARANTİ DEĞİLDİR;
  //     cache ıskalanırsa (ör. gecikme yetersiz kalırsa) sonuç YİNE DOĞRU
  //     olur, sadece o çağrı için maliyet avantajı gerçekleşmez. Yani bu
  //     yaklaşım "iyimser/best-effort" bir optimizasyondur, doğruluğu
  //     ASLA cache hit'ine bağımlı değildir.
  const CACHE_WARMUP_DELAY_MS = Number(process.env.LLM_CACHE_WARMUP_DELAY_MS || '2500');
  const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

  const runOneChunk = async ({
    chunkDocs,
    pageRangeLabel,
    index
  }: {
    chunkDocs: NonNullable<LLMAnalysisRequest['documentImages']>;
    pageRangeLabel: string;
    index: number;
  }): Promise<{ data: SingleAnalysisResult; usage?: LlmUsageMetadata }> => {
    const chunkRequest: LLMAnalysisRequest = {
      ...request,
      documentImages: chunkDocs,
      chunkInfo: {
        chunkIndex: index + 1,
        totalChunks,
        pageRangeLabel
      }
    };

    devLog(`Chunk ${index + 1}/${totalChunks} başlıyor — sayfalar: ${pageRangeLabel}`);
    const { data, usage } = await runSingleAnalysisCall(provider, chunkRequest);
    devLog(
      `Chunk ${index + 1}/${totalChunks} tamamlandı — sayfalar: ${pageRangeLabel} | ` +
        `riskler=${data.riskler.length} | ` +
        `gerekliBelgeler=${data.gerekliBelgeler.length} | ` +
        `ozelGereklilikler=${data.ozelGereklilikler?.length ?? 0} | ` +
        `birimFiyatCetveli=${data.birimFiyatCetveli?.length ?? 0} | ` +
        `celiskiler=${data.celiskiler?.length ?? 0} | ` +
        `teknikKategoriler=${data.teknikYukumlulukler.kategoriler?.length ?? 0}` +
        (usage ? ` | inputTokens=${usage.inputTokens} outputTokens=${usage.outputTokens}` : '')
    );
    return { data, usage };
  };

  devLog(
    `${totalChunks} chunk başlatılıyor — 1. chunk HEMEN ateşleniyor (tamamlanması BEKLENMİYOR), ` +
      `kalan ${totalChunks - 1} chunk ${CACHE_WARMUP_DELAY_MS}ms sonra paralel ateşlenecek...`
  );

  const [firstChunkRequest, ...restChunkRequests] = chunkRequests;
  // Chunk 1'i BAŞLAT ama await ETME — isteği hemen ağa gönderir, tamamlanmasını
  // beklemeden aşağıdaki Promise.all'a kadar arka planda devam eder.
  const firstChunkPromise = runOneChunk(firstChunkRequest);
  const restPromise: Promise<Array<{ data: SingleAnalysisResult; usage?: LlmUsageMetadata }>> =
    restChunkRequests.length > 0
      ? sleep(CACHE_WARMUP_DELAY_MS).then(() => Promise.all(restChunkRequests.map(runOneChunk)))
      : Promise.resolve([]);

  // İkisi de (chunk 1 + kalanlar) ARTIK GERÇEKTEN PARALEL çalışıyor — tek
  // fark, kalanların ateşlenmesi CACHE_WARMUP_DELAY_MS kadar geriden
  // başlıyor, chunk 1'in TAMAMLANMASI değil. Bir chunk başarısız olursa
  // (önceki davranışla aynı) tüm analiz İPTAL edilir.
  const [firstOutcome, restOutcomes] = await Promise.all([firstChunkPromise, restPromise]);
  const chunkOutcomes = [firstOutcome, ...restOutcomes];

  const chunkResults: SingleAnalysisResult[] = chunkOutcomes.map((o) => o.data);
  const usageList: LlmUsageMetadata[] = chunkOutcomes.map((o) => o.usage).filter((u): u is LlmUsageMetadata => !!u);


  const merged = mergeChunkedResults(chunkResults, provider.name);

  // Token/maliyet toplamı — tüm chunk çağrılarının toplamı.
  if (usageList.length > 0) {
    const totalInputTokens = usageList.reduce((sum, u) => sum + u.inputTokens, 0);
    const totalOutputTokens = usageList.reduce((sum, u) => sum + u.outputTokens, 0);
    merged.usage = {
      provider: provider.name,
      model: usageList[0].model,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      estimatedCostUsd: estimateCostUsd(totalInputTokens, totalOutputTokens),
      createdAt: new Date().toISOString()
    };
    console.log(
      `[llm] Chunk'lı analiz toplam maliyeti — ${totalChunks} parça, toplam inputTokens=${totalInputTokens} outputTokens=${totalOutputTokens} estimatedCostUsd=${merged.usage.estimatedCostUsd}`
    );
  }

  merged.analizKapsami = {
    toplamSayfa: totalRealPages,
    analizEdilenSayfa: totalSentPages,
    parcaSayisi: totalChunks,
    tamamiOkundu: totalSentPages >= totalRealPages
  } satisfies LlmAnalizKapsami;

  return merged;
}
