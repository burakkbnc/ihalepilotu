'use client';

import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Check } from 'lucide-react';
import { formatCurrency } from '@/lib/tenders/format';
import {
  Card,
  CardHeader,
  SectionHeader,
  Button,
  ButtonLink,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell
} from '@/components/ui';
import type { TenderItem, UpsertTenderItemInput } from '@/types/tender';

const EMPTY_FORM: UpsertTenderItemInput = {
  orderNo: 1,
  description: '',
  unit: '',
  quantity: 1,
  unitPrice: 0,
  vatRate: 20
};

const VAT_RATE_OPTIONS = [0, 1, 10, 20];

/** quantity * unitPrice = Ara Toplam (KDV hariç); KDV Tutarı ve Genel Toplam (KDV dahil) buradan hesaplanır. */
/**
 * Faz 3.5 öncesi oluşturulmuş eski TenderItem belgelerinde vatRate/total/
 * vatAmount/grandTotal alanları hiç yazılmamış olabilir (undefined), çünkü
 * bu alanlar Faz 3.5'te eklendi ve eski veriler otomatik migrate edilmedi.
 * Bu yardımcı, undefined/null/NaN gelen her durumda güvenli bir varsayılan
 * (0, veya belirtilen fallback) döner — hesaplama pipeline'ının HİÇBİR
 * noktasında undefined ileri taşınmaz.
 */
function safeNumber(value: number | null | undefined, fallback = 0): number {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback;
  return value;
}

/** quantity * unitPrice = Ara Toplam (KDV hariç); KDV Tutarı ve Genel Toplam buradan hesaplanır. */
function calcAmounts(quantity: number, unitPrice: number, vatRate: number) {
  const total = Math.round(safeNumber(quantity) * safeNumber(unitPrice) * 100) / 100;
  const vatAmount = Math.round(total * (safeNumber(vatRate, 20) / 100) * 100) / 100;
  const grandTotal = Math.round((total + vatAmount) * 100) / 100;
  return { total, vatAmount, grandTotal };
}

/**
 * Kullanıcı TL alanına 12500, 12.500, 12.500,50 veya 12500.50 yazabilir.
 * Firestore'a yalnızca blur/Enter anında normalize edilmiş number gider.
 */
function parseMoneyInput(value: string): number | null {
  const cleaned = value
    .replace(/₺/g, '')
    .replace(/TL/gi, '')
    .replace(/\s/g, '')
    .trim();

  if (!cleaned) return 0;

  const hasComma = cleaned.includes(',');
  const normalized = hasComma
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned.replace(/,/g, '');

  const num = Number(normalized);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100) / 100;
}

function formatPlainNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return String(Math.round(value * 100) / 100);
}

export default function TenderItemsPanel({
  tenderId,
  items: itemsProp,
  editable
}: {
  tenderId: string;
  items: TenderItem[];
  editable: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(itemsProp);
  const [form, setForm] = useState<UpsertTenderItemInput>({
    ...EMPTY_FORM,
    orderNo: itemsProp.length + 1
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [priceOriginals, setPriceOriginals] = useState<Record<string, number>>({});
  const [focusedPriceId, setFocusedPriceId] = useState<string | null>(null);

  // [UX DÜZELTMESİ] Analiz tamamlandığında üst component (AnalysisTab,
  // `itemsProp`'u günceller (resmi cetvel satırları artık Firestore'da
  // mevcuttur). Bu effect, dış kaynaklı bu güncellemeyi iç state'e
  // yansıtır — kullanıcının panel içinde yaptığı YEREL değişiklikler
  // (henüz kaydedilmemiş input girdileri) ise zaten kendi state
  // güncellemeleriyle yönetilir, bu effect SADECE dıştan gelen referans
  // değişikliğinde tetiklenir.
  useEffect(() => {
    setItems(itemsProp);
  }, [itemsProp]);

  const totals = useMemo(() => {
    // Faz 3.5 öncesi oluşturulmuş eski TenderItem belgelerinde vatRate/
    // vatAmount/grandTotal alanları hiç yazılmamış olabilir (undefined).
    // Her alan için undefined/null/NaN -> 0 fallback'i uygulanır, aksi
    // halde bir tek eski satır "sum + undefined = NaN" ile TÜM toplamı
    // bozar ve ekran formatCurrency içinde patlar.
    const subtotal = items.reduce((sum, item) => sum + safeNumber(item.total), 0);
    const vat = items.reduce((sum, item) => sum + safeNumber(item.vatAmount), 0);
    const grandTotal = items.reduce((sum, item) => sum + safeNumber(item.grandTotal), 0);
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      vat: Math.round(vat * 100) / 100,
      grandTotal: Math.round(grandTotal * 100) / 100
    };
  }, [items]);

  /**
   * Birim fiyat değişiminde Firestore'a her tuşta kayıt atılmaz.
   * Kullanıcı yazarken yalnızca UI/local state güncellenir; kayıt blur veya Enter ile yapılır.
   */
  const updateLocalItem = (itemId: string, field: 'unitPrice' | 'vatRate', numericValue: number) => {
    setSavedIds((prev) => {
      if (!prev.has(itemId)) return prev;
      const next = new Set(prev);
      next.delete(itemId);
      return next;
    });

    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const unitPrice = field === 'unitPrice' ? numericValue : safeNumber(item.unitPrice);
        const vatRate = field === 'vatRate' ? numericValue : safeNumber(item.vatRate, 20);
        const amounts = calcAmounts(safeNumber(item.quantity), unitPrice, vatRate);
        return { ...item, unitPrice, vatRate, ...amounts };
      })
    );
  };

  const handlePriceDraftChange = (itemId: string, rawValue: string) => {
    setPriceDrafts((prev) => ({ ...prev, [itemId]: rawValue }));

    const numericValue = parseMoneyInput(rawValue);
    if (numericValue === null) return;
    updateLocalItem(itemId, 'unitPrice', numericValue);
  };

  const commitPrice = async (itemId: string) => {
    const draft = priceDrafts[itemId];
    const currentItem = items.find((item) => item.id === itemId);
    const numericValue = draft === undefined ? safeNumber(currentItem?.unitPrice) : parseMoneyInput(draft);

    if (numericValue === null) {
      setError('Birim fiyat geçerli bir TL tutarı olmalıdır.');
      return;
    }

    updateLocalItem(itemId, 'unitPrice', numericValue);
    setPriceDrafts((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });

    const originalValue = priceOriginals[itemId];
    setPriceOriginals((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });

    if (originalValue !== undefined && Math.round(originalValue * 100) === Math.round(numericValue * 100)) {
      return;
    }

    await saveField(itemId, 'unitPrice', numericValue);
  };

  const handlePriceKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    e.currentTarget.blur();
  };

  const handleVatRateChange = (itemId: string, rawValue: string) => {
    const numericValue = Number(rawValue);
    if (!Number.isFinite(numericValue) || numericValue < 0) return;
    updateLocalItem(itemId, 'vatRate', numericValue);
    saveField(itemId, 'vatRate', numericValue);
  };

  const saveField = async (itemId: string, field: 'unitPrice' | 'vatRate', value: number) => {
    setSavingIds((prev) => new Set(prev).add(itemId));
    try {
      const res = await fetch(`/api/tenders/${tenderId}/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || 'Değişiklik kaydedilemedi.');

      const updatedItem = body.data.item as TenderItem;
      setItems((prev) => prev.map((item) => (item.id === itemId ? updatedItem : item)));
      setSavedIds((prev) => new Set(prev).add(itemId));
    } catch (err: any) {
      setError(err?.message || 'Değişiklik kaydedilemedi.');
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const description = form.description.trim();
    const unit = form.unit.trim();

    if (!description) {
      setError('İş kalemi açıklaması zorunludur.');
      return;
    }
    if (!unit) {
      setError('Birim zorunludur.');
      return;
    }
    if (form.quantity < 0 || form.unitPrice < 0) {
      setError('Miktar ve birim fiyat 0 veya üzeri olmalıdır.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, description, unit })
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || 'Satır eklenemedi.');

      const newItem = body.data.item as TenderItem;
      setItems((prev) => [...prev, newItem].sort((a, b) => a.orderNo - b.orderNo));
      setForm({ ...EMPTY_FORM, orderNo: items.length + 2 });
      router.refresh();
    } catch (err: any) {
      setError(err?.message || 'Satır eklenemedi.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (itemId: string) => {
    if (!confirm('Bu satırı silmek istediğinize emin misiniz?')) return;
    try {
      const res = await fetch(`/api/tenders/${tenderId}/items/${itemId}`, { method: 'DELETE' });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message || 'Satır silinemedi.');
      setItems((prev) => prev.filter((item) => item.id !== itemId));
      router.refresh();
    } catch (err: any) {
      setError(err?.message || 'Satır silinemedi.');
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <SectionHeader
          title="Birim Fiyat Cetveli"
          description="EK'teki resmi cetvel satırları analiz çalıştırıldığında doğrudan burada görünür — kullanıcı birim fiyatı ve KDV oranını girdiği anda satır toplamı, KDV tutarı ve genel toplam otomatik hesaplanır."
        />
        {items.length > 0 && (
          <ButtonLink href={`/api/tenders/${tenderId}/items/export`} variant="outline" size="sm">
            Excel İndir
          </ButtonLink>
        )}
      </CardHeader>

      {error && <p className="border-b border-danger-100 bg-danger-50 px-5 py-2.5 text-sm text-danger-700">{error}</p>}

      {items.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">
          Henüz satır yok. Analizi çalıştırdığınızda resmi cetvel satırları burada otomatik görünecek, veya aşağıdan
          manuel satır ekleyebilirsiniz.
        </p>
      ) : (
        <div className="overflow-x-auto border-t border-border">
          {/* NOT: Burada üst-seviye <Table> primitive'i değil, alt
              primitive'ler (TableHeader/TableBody/TableFooter/TableRow/
              TableHead/TableCell) doğrudan kullanılır — <Table> kendi
              border/shadow kabuğunu ekler, bu da burada (zaten bu
              component'in kendi <Card>'ı içindeyiz) çift kart görünümü
              yaratırdı. */}
          <table className="w-full text-sm">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Sıra No</TableHead>
                <TableHead>İş Kalemi</TableHead>
                <TableHead>Birim</TableHead>
                <TableHead>Miktar</TableHead>
                <TableHead>Birim Fiyat</TableHead>
                <TableHead>KDV Oranı</TableHead>
                <TableHead>Ara Toplam</TableHead>
                <TableHead>KDV Tutarı</TableHead>
                <TableHead>Genel Toplam</TableHead>
                {editable && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-muted-foreground">{item.orderNo}</TableCell>
                  <TableCell>
                    <p className="font-medium leading-snug text-slate-800">{item.description}</p>
                  </TableCell>
                  <TableCell className="text-slate-600">{item.unit}</TableCell>
                  <TableCell className="text-slate-600">{safeNumber(item.quantity)}</TableCell>
                  <TableCell>
                    {editable ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={
                            focusedPriceId === item.id
                              ? priceDrafts[item.id] ?? formatPlainNumber(safeNumber(item.unitPrice))
                              : formatCurrency(item.unitPrice)
                          }
                          onFocus={() => {
                            setFocusedPriceId(item.id);
                            setPriceOriginals((prev) => ({ ...prev, [item.id]: safeNumber(item.unitPrice) }));
                            setPriceDrafts((prev) => ({ ...prev, [item.id]: formatPlainNumber(safeNumber(item.unitPrice)) }));
                          }}
                          onChange={(e) => handlePriceDraftChange(item.id, e.target.value)}
                          onBlur={() => {
                            setFocusedPriceId(null);
                            commitPrice(item.id);
                          }}
                          onKeyDown={handlePriceKeyDown}
                          className="w-32 rounded-lg border border-border-strong bg-surface px-2.5 py-1.5 text-sm transition focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                        />
                        {savedIds.has(item.id) && !savingIds.has(item.id) && (
                          <Check size={13} strokeWidth={2.5} className="text-success-600" aria-hidden />
                        )}
                      </div>
                    ) : (
                      formatCurrency(item.unitPrice)
                    )}
                  </TableCell>
                  <TableCell>
                    {editable ? (
                      <select
                        value={safeNumber(item.vatRate, 20)}
                        onChange={(e) => handleVatRateChange(item.id, e.target.value)}
                        className="rounded-lg border border-border-strong bg-surface px-2.5 py-1.5 text-sm transition focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                      >
                        {VAT_RATE_OPTIONS.map((rate) => (
                          <option key={rate} value={rate}>
                            %{rate}
                          </option>
                        ))}
                      </select>
                    ) : (
                      `%${safeNumber(item.vatRate, 20)}`
                    )}
                  </TableCell>
                  <TableCell className="text-slate-700">{formatCurrency(item.total)}</TableCell>
                  <TableCell className="text-slate-700">{formatCurrency(item.vatAmount)}</TableCell>
                  <TableCell className="font-semibold text-slate-900">{formatCurrency(item.grandTotal)}</TableCell>
                  {editable && (
                    <TableCell className="text-right">
                      <button onClick={() => handleDelete(item.id)} className="text-xs font-medium text-danger-600 hover:underline">
                        Sil
                      </button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="text-right font-medium text-muted-foreground">
                  Ara Toplam
                </TableCell>
                <TableCell colSpan={editable ? 3 : 2} className="font-semibold text-slate-800">
                  {formatCurrency(totals.subtotal)}
                </TableCell>
              </TableRow>
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="text-right font-medium text-muted-foreground">
                  KDV Toplamı
                </TableCell>
                <TableCell colSpan={editable ? 3 : 2} className="font-semibold text-slate-800">
                  {formatCurrency(totals.vat)}
                </TableCell>
              </TableRow>
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="text-right font-semibold text-slate-800">
                  Genel Toplam
                </TableCell>
                <TableCell colSpan={editable ? 3 : 2} className="text-base font-bold text-brand-700">
                  {formatCurrency(totals.grandTotal)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </table>
        </div>
      )}

      {editable && (
        <form onSubmit={handleAdd} className="grid grid-cols-1 gap-3 border-t border-border bg-surface-muted/40 p-5 sm:grid-cols-6">
          <div className="sm:col-span-1">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Sıra No</label>
            <input
              type="number"
              min={0}
              value={form.orderNo}
              onChange={(e) => setForm((f) => ({ ...f, orderNo: Number(e.target.value) }))}
              className="w-full rounded-lg border border-border-strong bg-surface px-2.5 py-2 text-sm transition focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">İş Kalemi</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Örn: Profesyonel ses sistemi kiralama"
              className="w-full rounded-lg border border-border-strong bg-surface px-2.5 py-2 text-sm transition focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
            />
          </div>
          <div className="sm:col-span-1">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Birim</label>
            <input
              type="text"
              value={form.unit}
              onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
              placeholder="adet, gün, m²"
              className="w-full rounded-lg border border-border-strong bg-surface px-2.5 py-2 text-sm transition focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
            />
          </div>
          <div className="sm:col-span-1">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Miktar</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.quantity}
              onChange={(e) => setForm((f) => ({ ...f, quantity: Number(e.target.value) }))}
              className="w-full rounded-lg border border-border-strong bg-surface px-2.5 py-2 text-sm transition focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
            />
          </div>
          <div className="sm:col-span-1">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Birim Fiyat (TL)</label>
            <input
              type="text"
              inputMode="decimal"
              value={formatPlainNumber(form.unitPrice)}
              onChange={(e) => {
                const value = parseMoneyInput(e.target.value);
                if (value !== null) setForm((f) => ({ ...f, unitPrice: value }));
              }}
              onBlur={(e) => {
                const value = parseMoneyInput(e.target.value);
                if (value !== null) setForm((f) => ({ ...f, unitPrice: value }));
              }}
              className="w-full rounded-lg border border-border-strong bg-surface px-2.5 py-2 text-sm transition focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
            />
          </div>
          <div className="sm:col-span-1">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">KDV Oranı</label>
            <select
              value={form.vatRate}
              onChange={(e) => setForm((f) => ({ ...f, vatRate: Number(e.target.value) }))}
              className="w-full rounded-lg border border-border-strong bg-surface px-2.5 py-2 text-sm transition focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
            >
              {VAT_RATE_OPTIONS.map((rate) => (
                <option key={rate} value={rate}>
                  %{rate}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-6">
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Ekleniyor…' : 'Satır Ekle'}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
