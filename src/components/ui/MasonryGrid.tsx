import type { ReactNode } from 'react';

/**
 * Masonry grid — CSS multi-column ile gerçek masonry davranışı: her kart
 * kendi içeriğine göre boy alır, eşit yükseklik ZORLANMAZ (kullanıcı
 * talebi #7: "Eşit yükseklik zorlama. Kartlar içerik kadar büyüsün").
 * `columns-*` + `break-inside-avoid` kombinasyonu, CSS grid'in aksine
 * doğal masonry akışı sağlar.
 */
export default function MasonryGrid({ children }: { children: ReactNode }) {
  return <div className="columns-1 gap-3 md:columns-2 lg:columns-3 [&>*]:mb-3 [&>*]:break-inside-avoid">{children}</div>;
}
