// ============================================================
// GET /api/tenders/[tenderId]/items/export
//
// Birim Fiyat Cetveli'ni 2 sayfalı bir Excel (.xlsx) dosyası olarak
// üretir ve indirilebilir hâlde döner:
//   1. Birim Fiyat Cetveli — tüm satırlar (Sıra No, İş Kalemi, Birim,
//      Miktar, Birim Fiyat, KDV Oranı, Ara Toplam, KDV Tutarı, Genel Toplam)
//   2. Teklif Toplamı — ara toplam + KDV toplamı + genel toplam (canlı formüllerle)
//
// Tutarlar Excel formülü olarak yazılır (miktar*birim fiyat, SUM, vb.),
// sabit değer olarak hardcode edilmez — kullanıcı birim fiyatı veya KDV
// oranını Excel üzerinde değiştirirse toplamlar otomatik güncellenir.
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { requireCompany, apiError, withApiErrorHandling } from '@/lib/api/guard';
import { getTenderOrThrow } from '@/lib/tenders/access';
import type { TenderItem } from '@/types/tender';

interface RouteParams {
  params: { tenderId: string };
}

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1F2937' }
};
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 11 };
const BODY_FONT: Partial<ExcelJS.Font> = { name: 'Calibri', size: 11 };
const CURRENCY_FORMAT = '#,##0.00 "TL"';

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
  });
  row.height = 20;
}

function addItemsSheet(workbook: ExcelJS.Workbook, items: TenderItem[]): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet('Birim Fiyat Cetveli');
  sheet.columns = [
    { header: 'Sıra No', key: 'orderNo', width: 10 },
    { header: 'İş Kalemi', key: 'description', width: 40 },
    { header: 'Birim', key: 'unit', width: 12 },
    { header: 'Miktar', key: 'quantity', width: 12 },
    { header: 'Birim Fiyat', key: 'unitPrice', width: 16 },
    { header: 'KDV Oranı', key: 'vatRate', width: 12 },
    { header: 'Ara Toplam', key: 'total', width: 16 },
    { header: 'KDV Tutarı', key: 'vatAmount', width: 16 },
    { header: 'Genel Toplam', key: 'grandTotal', width: 16 }
  ];
  styleHeaderRow(sheet.getRow(1));

  items.forEach((item, idx) => {
    const rowIndex = idx + 2;
    const row = sheet.addRow({
      orderNo: item.orderNo,
      description: item.description,
      unit: item.unit,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      vatRate: item.vatRate / 100,
      total: { formula: `D${rowIndex}*E${rowIndex}` },
      vatAmount: { formula: `G${rowIndex}*F${rowIndex}` },
      grandTotal: { formula: `G${rowIndex}+H${rowIndex}` }
    });
    row.font = BODY_FONT;
    row.getCell('unitPrice').numFmt = CURRENCY_FORMAT;
    row.getCell('unitPrice').font = { ...BODY_FONT, color: { argb: 'FF0000FF' } }; // mavi: kullanıcı girdisi
    row.getCell('vatRate').numFmt = '0%';
    row.getCell('vatRate').font = { ...BODY_FONT, color: { argb: 'FF0000FF' } }; // mavi: kullanıcı girdisi
    row.getCell('total').numFmt = CURRENCY_FORMAT;
    row.getCell('vatAmount').numFmt = CURRENCY_FORMAT;
    row.getCell('grandTotal').numFmt = CURRENCY_FORMAT;
  });

  if (items.length === 0) {
    sheet.addRow({ description: 'Bu ihale için birim fiyat cetveli satırı bulunmuyor.' }).font = {
      ...BODY_FONT,
      italic: true,
      color: { argb: 'FF94A3B8' }
    };
  }

  return sheet;
}

function addOfferTotalsSheet(workbook: ExcelJS.Workbook, itemCount: number, tenderTitle: string): void {
  const sheet = workbook.addWorksheet('Teklif Toplamı');
  sheet.columns = [
    { header: '', key: 'label', width: 32 },
    { header: '', key: 'value', width: 22 }
  ];

  sheet.mergeCells('A1:B1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = tenderTitle;
  titleCell.font = { bold: true, size: 14, name: 'Calibri' };
  titleCell.alignment = { horizontal: 'left' };

  sheet.addRow([]);

  const subtotalRange = itemCount > 0 ? `'Birim Fiyat Cetveli'!G2:G${itemCount + 1}` : null;
  const vatRange = itemCount > 0 ? `'Birim Fiyat Cetveli'!H2:H${itemCount + 1}` : null;

  const subtotalRow = sheet.rowCount + 1;
  sheet.addRow({
    label: 'Ara Toplam (KDV Hariç)',
    value: subtotalRange ? { formula: `SUM(${subtotalRange})` } : 0
  });
  sheet.getCell(`A${subtotalRow}`).font = { ...BODY_FONT, bold: true };
  sheet.getCell(`B${subtotalRow}`).font = { ...BODY_FONT, bold: true };
  sheet.getCell(`B${subtotalRow}`).numFmt = CURRENCY_FORMAT;

  const vatRow = sheet.rowCount + 1;
  sheet.addRow({
    label: 'KDV Toplamı',
    value: vatRange ? { formula: `SUM(${vatRange})` } : 0
  });
  sheet.getCell(`B${vatRow}`).numFmt = CURRENCY_FORMAT;
  sheet.getRow(vatRow).font = BODY_FONT;

  const grandTotalRow = sheet.rowCount + 1;
  sheet.addRow({ label: 'Genel Toplam', value: { formula: `B${subtotalRow}+B${vatRow}` } });
  sheet.getCell(`A${grandTotalRow}`).font = { ...BODY_FONT, bold: true, size: 12 };
  sheet.getCell(`B${grandTotalRow}`).font = { ...BODY_FONT, bold: true, size: 12, color: { argb: 'FF1D4ED8' } };
  sheet.getCell(`B${grandTotalRow}`).numFmt = CURRENCY_FORMAT;
}

export const GET = withApiErrorHandling(async (_req: NextRequest, { params }: RouteParams) => {
  const { companyId } = await requireCompany();
  const { ref, tender } = await getTenderOrThrow(companyId, params.tenderId);

  const snap = await ref.collection('items').orderBy('orderNo', 'asc').get();
  const items = snap.docs.map((d) => d.data() as TenderItem);

  if (items.length === 0) {
    return apiError(400, 'no_items', 'Excel dışa aktarmak için en az bir birim fiyat cetveli satırı olmalıdır.');
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'İhale Pilotu';
  workbook.created = new Date();

  addItemsSheet(workbook, items);
  addOfferTotalsSheet(workbook, items.length, tender.title);

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `${sanitizeFilename(tender.title)}-birim-fiyat-cetveli.xlsx`;

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  });
});

function sanitizeFilename(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9-_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'ihale'
  );
}
