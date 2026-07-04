// ============================================================
// Parser — Ortak Tipler
// ============================================================

/**
 * Bir alanın çıkarım güvenilirliği.
 * - 'found': Regex/kural eşleşmesi ile bulundu
 * - 'not_found': Aranan ifade metinde bulunamadı (null değer ile birlikte kullanılır)
 * - 'explicit_empty': "Bu madde boş bırakılmıştır" gibi açık bir "yok" ifadesi tespit edildi
 */
export type ExtractionConfidence = 'found' | 'not_found' | 'explicit_empty';

/**
 * Tek bir extractor fonksiyonunun çıktısı.
 * `data` Firestore'a yazılacak bölüme özel veri yapısıdır.
 * `confidence` bölümün genel olarak ne kadar güvenilir bulunduğunu özetler —
 * UI'da "Bilgi tespit edilemedi" rozeti göstermek için kullanılabilir.
 */
export interface ExtractionResult<T> {
  data: T;
  confidence: ExtractionConfidence;
}

/**
 * Bir değerin hangi şartname belgesinden geldiğini belirtir.
 * 'merged' — liste tipi alanlarda her iki kaynaktan birleştirilmiş anlamına gelir.
 */
export type DocumentSource = 'administrative' | 'technical' | 'merged';

/**
 * Merge motorunun ürettiği, kaynak takibi ve çelişki bilgisi içeren alan zarfı.
 * UI bu zarftan değeri, kaynağını ve (varsa) çelişen değeri okuyabilir.
 *
 * NOT: Bu tip, hem parser/merge katmanında hem de @/types/tender.ts içindeki
 * TenderAnalysis* arayüzlerinde kullanılır. Tek bir kaynaktan tanımlanır
 * (burada) ve tender.ts tarafından re-export edilir — bkz. types/tender.ts
 * en üstteki import.
 */
export interface MergedField<T> {
  value: T;
  source: DocumentSource | null;
  hasConflict: boolean;
  /** Çelişki varsa, kullanılmayan (idari önceliğine göre elenen) değer */
  conflictingValue?: T;
  /** Çelişen değerin kaynağı (genellikle 'technical', idari öncelikli olduğundan) */
  conflictingSource?: DocumentSource;
}
