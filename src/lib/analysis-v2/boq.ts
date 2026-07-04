// ============================================================
// Aşama A — BFC İçin Tek Kaynak (BOQ Motor Sadeleştirme)
//
// KÖK NEDEN DÜZELTMESİ: Bu dosya önceden İKİ BOQ motorundan biriydi —
// `extractBoqV2` adıyla, parser'ın (bkz. parser/extractors/
// officialBillOfQuantities.ts) çıkardığı satırlara EK OLARAK, aynı
// idari/teknik metni KENDİ regex kalıplarıyla TEKRAR tarıyordu. İki motor
// aynı anda çalıştığı için aralarında sessiz tutarsızlık riski vardı
// (kullanıcı kararı: "BFC için tek kaynak olsun. İki ayrı BOQ motoru
// kalmasın."). `extractBoqV2` ve SADECE onun kullandığı yardımcı
// fonksiyonlar (regex kalıpları, cleanName, normalizeUnit, dedupe)
// tamamen kaldırıldı.
//
// Artık BFC'nin METİNDEN okunan TEK kaynağı parser'dır. Bu dosyada SADECE
// `mergeBoqV2` kalır — parser'ın idari+teknik şartnameden ayrı ayrı
// çıkardığı satırları, aynı sıra no'da (orderNo) çakışma varsa daha
// güvenilir/uzun ada sahip olanı tutarak TEK bir listeye konsolide eder.
// Parser hiç satır bulamazsa (taranmış/görsel doküman) fallback LLM'in
// kendi okumasıdır — bu, route.ts seviyesinde ayrıca uygulanır.
// ============================================================
import type { OfficialBillItem } from '@/types/tender';

export function mergeBoqV2(...sets: OfficialBillItem[][]): OfficialBillItem[] {
  const all = sets.flat().filter(Boolean);
  const byOrder = new Map<number, OfficialBillItem>();
  for (const item of all) {
    const existing = byOrder.get(item.orderNo);
    if (!existing || item.confidence > existing.confidence || (item.name.length > existing.name.length && item.name.length < 180)) {
      byOrder.set(item.orderNo, item);
    }
  }
  return [...byOrder.values()].sort((a, b) => a.orderNo - b.orderNo);
}
