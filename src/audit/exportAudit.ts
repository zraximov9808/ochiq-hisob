import ExcelJS from 'exceljs';
import { KIND_LABEL, type AuditResult, type CounterpartyRow } from './settlement';

const MONEY = '#,##0.00;(#,##0.00);"-"';
const HEAD = 'FF1F4E78';
const TOTAL = 'FFD9E1F2';
const so = (tiyin: number) => Math.round(tiyin) / 100;
const day = (iso: string) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');
const f = (formula: string, result: number) => ({ formula, result } as ExcelJS.CellFormulaValue);

const FLAG_LABEL = { NO_INVOICE: 'Pul bor, faktura yo‘q', NO_PAYMENT: 'Faktura bor, pul yo‘q' } as const;

function head(ws: ExcelJS.Worksheet, row: number, titles: string[]) {
  const r = ws.getRow(row);
  titles.forEach((t, i) => {
    const c = r.getCell(i + 1);
    c.value = t;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD } };
    c.alignment = { vertical: 'middle', wrapText: true };
  });
  r.height = 30;
}

function bold(r: ExcelJS.Row, cols: number) {
  for (let i = 1; i <= cols; i++) {
    r.getCell(i).font = { bold: true };
    r.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL } };
  }
}

function titleBlock(ws: ExcelJS.Worksheet, a: AuditResult, title: string) {
  ws.getCell('A1').value = title;
  ws.getCell('A1').font = { bold: true, size: 13 };
  ws.getCell('A2').value = `${a.companyName} (STIR ${a.companyInn}), davr ${day(a.period.from) || '…'} – ${day(a.period.to) || '…'}`;
}

/** Ekspres audit workbook: counterparties, all movements, and what was left out. */
export async function buildAuditWorkbook(a: AuditResult): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Ochiq Hisob';
  const ws = wb.addWorksheet('Ekspres audit');
  ws.columns = [6, 16, 40, 18, 18, 18, 18, 18, 18, 18, 26].map((width) => ({ width }));
  titleBlock(ws, a, 'Ekspres audit: kontragentlar bilan o‘zaro hisob-kitob (debitor / kreditor)');
  ws.getCell('A3').value = 'Saldo = chiqqan faktura + chiqqan pul − kirgan pul − kirgan faktura. Musbat — debitor (bizga qarz), manfiy — kreditor (bizning qarzimiz). Boshlang‘ich qoldiq hisobga olinmagan.';
  head(ws, 5, ['№', 'STIR', 'Kontragent', 'Kirgan pul', 'Chiqqan pul', 'Kirgan faktura', 'Chiqqan faktura', 'Saldo', 'Debitor', 'Kreditor', 'Izoh']);
  let r = 6;
  a.rows.forEach((x, i) => {
    const row = ws.getRow(r);
    row.getCell(1).value = i + 1;
    row.getCell(2).value = x.inn;
    row.getCell(2).numFmt = '@';
    row.getCell(3).value = x.name;
    row.getCell(4).value = so(x.moneyIn);
    row.getCell(5).value = so(x.moneyOut);
    row.getCell(6).value = so(x.invIn);
    row.getCell(7).value = so(x.invOut);
    row.getCell(8).value = f(`G${r}+E${r}-D${r}-F${r}`, so(x.saldo));
    row.getCell(9).value = f(`MAX(H${r},0)`, so(Math.max(0, x.saldo)));
    row.getCell(10).value = f(`MAX(-H${r},0)`, so(Math.max(0, -x.saldo)));
    row.getCell(11).value = x.flags.map((fl) => FLAG_LABEL[fl]).join('; ');
    for (let c = 4; c <= 10; c++) row.getCell(c).numFmt = MONEY;
    r++;
  });
  const t = ws.getRow(r);
  t.getCell(3).value = 'JAMI';
  const sums: Record<number, number> = {
    4: a.totals.moneyIn, 5: a.totals.moneyOut, 6: a.totals.invIn, 7: a.totals.invOut,
    8: a.totals.debitor - a.totals.kreditor, 9: a.totals.debitor, 10: a.totals.kreditor,
  };
  for (let c = 4; c <= 10; c++) {
    const L = String.fromCharCode(64 + c);
    t.getCell(c).value = f(`SUM(${L}6:${L}${r - 1})`, so(sums[c]));
    t.getCell(c).numFmt = MONEY;
  }
  bold(t, 11);
  ws.views = [{ state: 'frozen', ySplit: 5 }];
  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: Math.max(6, r - 1), column: 11 } };

  const mv = wb.addWorksheet('Harakatlar');
  mv.columns = [16, 36, 12, 16, 14, 60, 18, 18, 18].map((width) => ({ width }));
  head(mv, 1, ['STIR', 'Kontragent', 'Sana', 'Turi', 'Hujjat', 'Mazmun', 'Debet (qarz oshdi)', 'Kredit (qarz kamaydi)', 'Qoldiq']);
  let k = 2;
  for (const x of a.rows)
    for (const m of x.movements) {
      const row = mv.getRow(k++);
      row.getCell(1).value = x.inn;
      row.getCell(1).numFmt = '@';
      row.getCell(2).value = x.name;
      row.getCell(3).value = day(m.date);
      row.getCell(4).value = KIND_LABEL[m.kind];
      row.getCell(5).value = m.doc;
      row.getCell(5).numFmt = '@';
      row.getCell(6).value = m.text;
      const dr = m.kind === 'invOut' || m.kind === 'moneyOut';
      row.getCell(7).value = dr ? so(m.amount) : null;
      row.getCell(8).value = dr ? null : so(m.amount);
      row.getCell(9).value = so(m.balance);
      for (const c of [7, 8, 9]) row.getCell(c).numFmt = MONEY;
    }
  mv.views = [{ state: 'frozen', ySplit: 1 }];
  mv.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(2, k - 1), column: 9 } };

  const ex = wb.addWorksheet('Hisobga olinmagan');
  ex.columns = [44, 12, 20, 20].map((width) => ({ width }));
  head(ex, 1, ['Bank operatsiyalari (sabab)', 'Soni', 'Debet', 'Kredit']);
  a.excluded.forEach((e, i) => {
    const row = ex.getRow(i + 2);
    row.values = [e.reason, e.count, so(e.debit), so(e.credit)];
    row.getCell(3).numFmt = MONEY;
    row.getCell(4).numFmt = MONEY;
  });
  let e = a.excluded.length + 4;
  head(ex, e++, ['Hisob-fakturalar (holati)', 'Soni', 'Summa', '']);
  for (const s of a.skippedInvoices) {
    const row = ex.getRow(e++);
    row.values = [s.reason, s.count, so(s.total)];
    row.getCell(3).numFmt = MONEY;
  }
  if (a.outsidePeriod) ex.getRow(e++).values = ['Davrdan tashqari sanali fakturalar', a.outsidePeriod];
  if (a.foreignInvoices) ex.getRow(e++).values = ['Korxona ishtirok etmagan fakturalar', a.foreignInvoices];
  return wb;
}

/** Reconciliation act (solishtirish dalolatnomasi) with one counterparty. */
export async function buildActWorkbook(a: AuditResult, x: CounterpartyRow): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Ochiq Hisob';
  const ws = wb.addWorksheet('Dalolatnoma');
  ws.columns = [12, 14, 60, 16, 18, 18, 18].map((width) => ({ width }));
  ws.getCell('A1').value = `Solishtirish dalolatnomasi: ${x.name}${x.inn ? ` (STIR ${x.inn})` : ''}`;
  ws.getCell('A1').font = { bold: true, size: 13 };
  ws.getCell('A2').value = `${a.companyName} (STIR ${a.companyInn}), davr ${day(a.period.from) || '…'} – ${day(a.period.to) || '…'}. Boshlang‘ich qoldiq hisobga olinmagan.`;
  head(ws, 4, ['Sana', 'Hujjat', 'Mazmun', 'Turi', 'Debet', 'Kredit', 'Qoldiq']);
  let r = 5;
  for (const m of x.movements) {
    const row = ws.getRow(r);
    const dr = m.kind === 'invOut' || m.kind === 'moneyOut';
    row.getCell(1).value = day(m.date);
    row.getCell(2).value = m.doc;
    row.getCell(2).numFmt = '@';
    row.getCell(3).value = m.text;
    row.getCell(4).value = KIND_LABEL[m.kind];
    row.getCell(5).value = dr ? so(m.amount) : null;
    row.getCell(6).value = dr ? null : so(m.amount);
    row.getCell(7).value = f(r === 5 ? `E${r}-F${r}` : `G${r - 1}+E${r}-F${r}`, so(m.balance));
    for (const c of [5, 6, 7]) row.getCell(c).numFmt = MONEY;
    r++;
  }
  const t = ws.getRow(r);
  t.getCell(3).value = 'Aylanma va yakuniy qoldiq';
  const d = x.invOut + x.moneyOut;
  const c = x.moneyIn + x.invIn;
  t.getCell(5).value = f(`SUM(E5:E${r - 1})`, so(d));
  t.getCell(6).value = f(`SUM(F5:F${r - 1})`, so(c));
  t.getCell(7).value = f(`E${r}-F${r}`, so(d - c));
  for (const col of [5, 6, 7]) t.getCell(col).numFmt = MONEY;
  bold(t, 7);
  const who = x.saldo > 0 ? `${x.name}ning ${a.companyName}ga qarzi` : x.saldo < 0 ? `${a.companyName}ning ${x.name}ga qarzi` : 'O‘zaro qarz yo‘q';
  ws.getCell(`A${r + 2}`).value = `${who}${x.saldo ? `: ${so(Math.abs(x.saldo)).toLocaleString('ru-RU')} so‘m` : ''}.`;
  ws.getCell(`A${r + 4}`).value = `${a.companyName}: ____________`;
  ws.getCell(`E${r + 4}`).value = `${x.name}: ____________`;
  return wb;
}
