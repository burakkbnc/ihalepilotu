import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * DataTable primitive ailesi — shadcn/ui Table kompozisyon deseni.
 * Tüm tablo yüzeyleri (Birim Fiyat Cetveli, Analiz Geçmişi) bu
 * primitive'lerden kompoze edilir. Hücre metinleri TRUNCATE EDİLMEZ —
 * uzun değerler (örn. uzun iş kalemi açıklamaları) doğal olarak sarılır,
 * tablo satırı buna göre büyür.
 *
 * Kullanım:
 * <Table>
 *   <TableHeader><TableRow><TableHead>...</TableHead></TableRow></TableHeader>
 *   <TableBody><TableRow><TableCell>...</TableCell></TableRow></TableBody>
 *   <TableFooter>...</TableFooter>
 * </Table>
 */
export function Table({ className, children, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-card">
      <table className={cn('w-full text-left text-sm', className)} {...props}>
        {children}
      </table>
    </div>
  );
}

export function TableHeader({ className, children, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={cn('border-b border-border bg-surface-muted text-xs font-medium uppercase tracking-wide text-muted-foreground', className)} {...props}>
      {children}
    </thead>
  );
}

export function TableBody({ className, children, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={cn('divide-y divide-border', className)} {...props}>
      {children}
    </tbody>
  );
}

export function TableFooter({ className, children, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tfoot className={cn('border-t border-border bg-surface-muted', className)} {...props}>
      {children}
    </tfoot>
  );
}

export function TableRow({ className, children, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn('transition hover:bg-surface-muted/60', className)} {...props}>
      {children}
    </tr>
  );
}

export function TableHead({ className, children, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={cn('px-4 py-2.5 font-medium', className)} {...props}>
      {children}
    </th>
  );
}

/** `whitespace-normal` ile hücre içeriği TRUNCATE EDİLMEZ — gerekirse doğal olarak sarılır. */
export function TableCell({ className, children, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('whitespace-normal px-4 py-2.5 align-top text-slate-700', className)} {...props}>
      {children}
    </td>
  );
}
