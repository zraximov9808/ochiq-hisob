import ExcelJS from 'exceljs';
import type { StockResult } from './stock';

const QTY = '#,##0.###;[Red]-#,##0.###;"-"';
const day = (iso: string) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');

function head(ws: ExcelJS.Worksheet, row: number, titles: string[]) {
  const r = ws.getRow(row);
  titles.forEach((t, i) => {
    const c = r.getCell(i + 1);
    c.value = t;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    c.alignment = { vertical: 'middle', wrapText: true };
  });
  r.height = 28;
}

/** Ombor workbook: per product opening, in, out and balance (formula), plus every movement. */
export async function buildStockWorkbook(s: StockResult, meta: { from?: string; to?: string; company: string }): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Ochiq Hisob';
  const ws = wb.addWorksheet('Ombor');
  ws.columns = [6, 60, 12, 16, 16, 16, 16].map((width) => ({ width }));
  ws.getCell('A1').value = `Ombor: tovarlar kirim-chiqimi va qoldig‘i — ${meta.company}`;
  ws.getCell('A1').font = { bold: true, size: 13 };
  ws.getCell('A2').value = `Davr: ${day(meta.from ?? '') || 'boshidan'} – ${day(meta.to ?? '') || 'oxirigacha'}. Manba: GTD (import) va hisob-fakturalar.`;
  head(ws, 4, ['№', 'Tovar nomi', 'Birlik', 'Davr boshiga', 'Kirim soni', 'Chiqim soni', 'Qoldiq']);
  s.rows.forEach((r, i) => {
    const n = 5 + i;
    const row = ws.getRow(n);
    row.values = [i + 1, r.name, r.unit, r.opening, r.qtyIn, r.qtyOut];
    row.getCell(7).value = { formula: `D${n}+E${n}-F${n}`, result: r.balance };
    for (const c of [4, 5, 6, 7]) row.getCell(c).numFmt = QTY;
    if (r.negative) row.getCell(7).font = { bold: true, color: { argb: 'FFC0392B' } };
  });
  ws.views = [{ state: 'frozen', ySplit: 4 }];
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: Math.max(5, 4 + s.rows.length), column: 7 } };

  const mv = wb.addWorksheet('Harakatlar');
  mv.columns = [12, 60, 22, 36, 12, 12, 12].map((width) => ({ width }));
  head(mv, 1, ['Sana', 'Tovar', 'Hujjat', 'Kontragent', 'Kirim', 'Chiqim', 'Qoldiq']);
  let k = 2;
  for (const r of s.rows)
    for (const m of r.moves) {
      const row = mv.getRow(k++);
      row.values = [day(m.date), r.name, m.doc, m.party, m.dir === 'in' ? m.qty : null, m.dir === 'out' ? m.qty : null, m.balance];
      for (const c of [5, 6, 7]) row.getCell(c).numFmt = QTY;
    }
  mv.views = [{ state: 'frozen', ySplit: 1 }];
  return wb;
}
