import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * className birleştirme yardımcısı (shadcn/ui standart deseni).
 *
 * clsx koşullu sınıfları birleştirir, tailwind-merge ise ÇAKIŞAN Tailwind
 * utility sınıflarını doğru çözer — örn. bir component `p-4` varsayılanı
 * tanımlarken, onu kullanan kod `className="p-6"` geçerse, twMerge bunun
 * `p-4 p-6` olarak ikisinin de uygulanmasını DEĞİL, `p-6`'nın kazanmasını
 * sağlar. Bu, tüm yeni primitive component'lerin (Card, Badge, Button vb.)
 * `className` prop'u kabul edip güvenle override edilebilmesinin temelidir.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
