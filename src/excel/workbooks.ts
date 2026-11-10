import ExcelJS from 'exceljs';
import { accountName } from '../engine/accounts';
import type { Report } from '../engine/checks';
import { toMing } from '../engine/money';
import { formatDate, type Quarter } from '../engine/period';
import type { Reconciliation } from '../engine/reconciliation';
import { TAX_LINES, TAX_MAIN_LINES } from '../engine/taxLines';
import { buildTrialBalance } from '../engine/trialBalance';
import type { Doc } from '../engine/types';

export type Tr = (s: string) => string;
export type FormKind = 'balance' | 'income' | 'tax';

const QUARTER_LABEL: Record<Quarter, string> = { 1: 'I chorak', 2: 'Yarim yil (II chorak)', 3: '9 oy (III chorak)', 4: 'Yillik' };
const MING = '#,##0;-#,##0;""';
const SOM = '#,##0.00';
const thin = { style: 'thin' as const, color: { argb: 'FF9AA5B1' } };
const border = { top: thin, left: thin, bottom: thin, right: thin };
const so = (tiyin: number) => Math.round(tiyin) / 100;

function header(ws: ExcelJS.Worksheet, title: string, lines: Array<[string, string]>, width: number) {
  ws.mergeCells(1, 1, 1, width);
  const c = ws.getCell(1, 1);
  c.value = title;
  c.font = { bold: true, size: 13 };
  c.alignment = { horizontal: 'center' };
  lines.forEach(([k, v], i) => {
    const row = ws.getRow(i + 2);
    row.getCell(1).value = k;
    row.getCell(1).font = { color: { argb: 'FF5D6B79' } };
    row.getCell(2).value = v;
    row.getCell(2).font = { bold: true };
  });
  return lines.length + 3;
}

function tableHead(ws: ExcelJS.Worksheet, rowNo: number, titles: string[]) {
  const row = ws.getRow(rowNo);
  titles.forEach((t, i) => {
    const cell = row.getCell(i + 1);
    cell.value = t;
    cell.font = { bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = border;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3F0F2' } };
  });
  row.height = 32;
}

function signatures(ws: ExcelJS.Worksheet, rowNo: number, doc: Doc, tr: Tr) {
  ws.getCell(rowNo, 1).value = `${tr('Rahbar')}: ____________ ${doc.company.director}`;
  ws.getCell(rowNo + 1, 1).value = `${tr('Bosh buxgalter')}: ____________ ${doc.company.accountant}`;
}

function companyLines(doc: Doc, tr: Tr): Array<[string, string]> {
  return [
    [tr('Korxona'), doc.company.name],
    [tr('STIR'), doc.company.stir],
    [tr('Manzil'), doc.company.address],
  ];
}

function addBalance(wb: ExcelJS.Workbook, doc: Doc, r: Report, tr: Tr) {
  const ws = wb.addWorksheet(tr('1-shakl Balans'));
  ws.columns = [{ width: 70 }, { width: 10 }, { width: 20 }, { width: 20 }];
  let n = header(ws, tr('BUXGALTERIYA BALANSI (1-shakl)'), [
    [tr('Sana'), `${formatDate(r.balance.date.end)} ${tr('holatiga')}`],
    ...companyLines(doc, tr),
    [tr('O‘lchov birligi'), tr('ming so‘m')],
  ], 4);
  tableHead(ws, n++, [tr('Ko‘rsatkich nomi'), tr('Satr kodi'), tr('Hisobot davri boshiga'), tr('Hisobot davri oxiriga')]);
  for (const l of r.balance.lines) {
    const row = ws.getRow(n++);
    row.getCell(1).value = tr(l.label);
    if (l.code) {
      row.getCell(2).value = l.code;
      if (!l.manual) {
        row.getCell(3).value = toMing(l.start ?? 0);
        row.getCell(4).value = toMing(l.end ?? 0);
      }
    }
    row.getCell(3).numFmt = MING;
    row.getCell(4).numFmt = MING;
    const bold = l.kind !== 'line';
    for (let i = 1; i <= 4; i++) {
      row.getCell(i).border = border;
      if (bold) row.getCell(i).font = { bold: true };
    }
    row.getCell(1).alignment = { wrapText: true };
    row.getCell(2).alignment = { horizontal: 'center' };
  }
  signatures(ws, n + 1, doc, tr);
}

function addIncome(wb: ExcelJS.Workbook, doc: Doc, r: Report, tr: Tr) {
  const ws = wb.addWorksheet(tr('2-shakl Moliyaviy natijalar'));
  ws.columns = [{ width: 62 }, { width: 8 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }];
  let n = header(ws, tr('MOLIYAVIY NATIJALAR TO‘G‘RISIDA HISOBOT (2-shakl)'), [
    [tr('Davr'), `${formatDate(r.income.period.from)} – ${formatDate(r.income.period.to)}`],
    ...companyLines(doc, tr),
    [tr('O‘lchov birligi'), tr('ming so‘m')],
  ], 6);
  tableHead(ws, n++, [
    tr('Ko‘rsatkich nomi'), tr('Satr kodi'),
    tr('O‘tgan yilning shu davrida: daromadlar (foyda)'), tr('O‘tgan yilning shu davrida: xarajatlar (zararlar)'),
    tr('Hisobot davrida: daromadlar (foyda)'), tr('Hisobot davrida: xarajatlar (zararlar)'),
  ]);
  const put = (v: number | undefined, col: 'inc' | 'exp' | 'res', want: 'inc' | 'exp'): ExcelJS.CellValue => {
    if (col !== 'res' && col !== want) return 'x';
    if (v === undefined) return null;
    if (col !== 'res') return toMing(v);
    if (v > 0) return want === 'inc' ? toMing(v) : null;
    if (v < 0) return want === 'exp' ? toMing(-v) : null;
    return want === 'inc' ? 0 : null;
  };
  for (const l of r.income.lines) {
    const row = ws.getRow(n++);
    row.getCell(1).value = tr(l.label);
    row.getCell(2).value = l.code;
    row.getCell(3).value = put(r.income.prev[l.code], l.col, 'inc');
    row.getCell(4).value = put(r.income.prev[l.code], l.col, 'exp');
    row.getCell(5).value = put(r.income.byCode[l.code], l.col, 'inc');
    row.getCell(6).value = put(r.income.byCode[l.code], l.col, 'exp');
    for (let i = 1; i <= 6; i++) {
      const c = row.getCell(i);
      c.border = border;
      if (i >= 3) {
        c.numFmt = '#,##0;-#,##0;0';
        c.alignment = { horizontal: 'right' };
      }
      if (l.total) c.font = { bold: true };
    }
    row.getCell(1).alignment = { wrapText: true };
    row.getCell(2).alignment = { horizontal: 'center' };
  }
  signatures(ws, n + 1, doc, tr);
}

function addTax(wb: ExcelJS.Workbook, doc: Doc, r: Report, quarter: Quarter, tr: Tr) {
  const x = r.tax;
  const meta: Array<[string, string]> = [
    [tr('Hisobot davri'), tr(QUARTER_LABEL[quarter])],
    [tr('Soliq davri'), String(doc.year)],
    ...companyLines(doc, tr),
    [tr('Soliq organi'), doc.company.taxOffice],
    [tr('O‘lchov birligi'), tr('so‘m')],
  ];
  const main = wb.addWorksheet(tr('Asosiy shakl'));
  main.columns = [{ width: 90 }, { width: 10 }, { width: 22 }];
  let n = header(main, tr('FOYDA SOLIG‘I HISOB-KITOBI'), meta, 3);
  tableHead(main, n++, [tr('Ko‘rsatkichlar (o‘sib boruvchi tartibda)'), tr('Satr kodi'), tr('Summa')]);
  for (const l of TAX_MAIN_LINES) {
    const row = main.getRow(n++);
    row.getCell(1).value = tr(l.label);
    row.getCell(2).value = l.code;
    const v = x.main[l.code] ?? 0;
    row.getCell(3).value = l.rate ? v : so(v);
    row.getCell(3).numFmt = l.rate ? '0.00' : SOM;
    for (let i = 1; i <= 3; i++) {
      row.getCell(i).border = border;
      if (l.bold) row.getCell(i).font = { bold: true };
    }
    row.getCell(1).alignment = { wrapText: true };
    row.getCell(2).alignment = { horizontal: 'center' };
  }
  signatures(main, n + 1, doc, tr);

  const a1 = wb.addWorksheet(tr('1-ilova'));
  a1.columns = [{ width: 80 }, { width: 10 }, { width: 22 }];
  n = header(a1, tr('1-ilova. Jami daromadlar'), meta.slice(0, 4), 3);
  tableHead(a1, n++, [tr('Ko‘rsatkich'), tr('Satr kodi'), tr('Summa')]);
  const a1rows: Array<[string, string, number, boolean]> = [
    [tr('Jami daromadlar'), '010', x.annex1['010'] ?? 0, true],
    [tr('Tovar (ish, xizmat)larni realizatsiya qilishdan daromadlar — jami (021–026)'), '020', x.annex1['020'] ?? 0, true],
    ...TAX_LINES.filter((l) => l.annex === 1).map((l): [string, string, number, boolean] => [tr(l.label), l.code, x.annex1[l.code] ?? 0, false]),
  ];
  for (const [label, code, v, bold] of a1rows) {
    const row = a1.getRow(n++);
    row.values = [label, code, so(v)];
    row.getCell(3).numFmt = SOM;
    for (let i = 1; i <= 3; i++) {
      row.getCell(i).border = border;
      if (bold) row.getCell(i).font = { bold: true };
    }
  }

  const a2 = wb.addWorksheet(tr('2-ilova'));
  a2.columns = [{ width: 70 }, { width: 10 }, { width: 22 }, { width: 22 }];
  n = header(a2, tr('2-ilova. Xarajatlar'), meta.slice(0, 4), 4);
  tableHead(a2, n++, [tr('Ko‘rsatkich'), tr('Satr kodi'), tr('Jami xarajatlar (3-ustun)'), tr('Shundan chegirilmaydigan (4-ustun)')]);
  const a2rows: Array<[string, string, { total: number; nonDeductible: number }, boolean]> = [
    [tr('Jami xarajatlar'), '010', x.annex2['010'], true],
    ...TAX_LINES.filter((l) => l.annex === 2).map((l): [string, string, { total: number; nonDeductible: number }, boolean] => [
      tr(l.label), l.code, x.annex2[l.code] ?? { total: 0, nonDeductible: 0 }, false,
    ]),
  ];
  for (const [label, code, v, bold] of a2rows) {
    const row = a2.getRow(n++);
    row.values = [label, code, so(v.total), so(v.nonDeductible)];
    row.getCell(3).numFmt = SOM;
    row.getCell(4).numFmt = SOM;
    for (let i = 1; i <= 4; i++) {
      row.getCell(i).border = border;
      if (bold) row.getCell(i).font = { bold: true };
    }
  }
  a2.getCell(n + 1, 1).value = tr('2-ilova II bo‘limi (0101–0137) va 3–11-ilovalar soliq hisobotida qo‘lda to‘ldiriladi.');
}

function newBook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Ochiq Hisob';
  wb.created = new Date();
  return wb;
}

export async function buildFormWorkbook(kind: FormKind, doc: Doc, quarter: Quarter, r: Report, tr: Tr): Promise<ExcelJS.Workbook> {
  const wb = newBook();
  if (kind === 'balance') addBalance(wb, doc, r, tr);
  if (kind === 'income') addIncome(wb, doc, r, tr);
  if (kind === 'tax') addTax(wb, doc, r, quarter, tr);
  return wb;
}

export async function buildAllWorkbook(doc: Doc, quarter: Quarter, r: Report, tr: Tr): Promise<ExcelJS.Workbook> {
  const wb = newBook();
  addBalance(wb, doc, r, tr);
  addIncome(wb, doc, r, tr);
  addTax(wb, doc, r, quarter, tr);

  const tb = buildTrialBalance(doc, quarter);
  const ws = wb.addWorksheet(tr('Aylanma-saldo'));
  ws.columns = [{ width: 12 }, { width: 50 }, ...Array.from({ length: 6 }, () => ({ width: 18 }))];
  let n = header(ws, tr('AYLANMA-SALDO QAYDNOMASI'), [[tr('Davr'), `${formatDate(tb.period.from)} – ${formatDate(tb.period.to)}`], [tr('O‘lchov birligi'), tr('so‘m')]], 8);
  tableHead(ws, n++, [tr('Hisobvaraq'), tr('Nomi'), tr('Boshlang‘ich Dt'), tr('Boshlang‘ich Kt'), tr('Aylanma Dt'), tr('Aylanma Kt'), tr('Oxirgi Dt'), tr('Oxirgi Kt')]);
  for (const row of tb.rows) {
    const r2 = ws.getRow(n++);
    r2.values = [row.code, row.level === 'sub' ? row.name : tr(row.name), so(row.openDr), so(row.openCr), so(row.dr), so(row.cr), so(row.closeDr), so(row.closeCr)];
    for (let i = 3; i <= 8; i++) r2.getCell(i).numFmt = '#,##0.00;-#,##0.00;""';
    if (row.level === 'syn') r2.font = { bold: true };
  }
  const tot = ws.getRow(n);
  tot.values = ['', tr('Jami'), so(tb.totals.openDr), so(tb.totals.openCr), so(tb.totals.dr), so(tb.totals.cr), so(tb.totals.closeDr), so(tb.totals.closeCr)];
  tot.font = { bold: true };
  for (let i = 3; i <= 8; i++) tot.getCell(i).numFmt = SOM;

  const j = wb.addWorksheet(tr('Jurnal'));
  j.columns = [{ header: tr('Sana'), width: 12 }, { header: tr('Mazmun'), width: 50 }, { header: tr('Debet'), width: 10 }, { header: tr('Kredit'), width: 10 }, { header: tr('Summa'), width: 20 }];
  j.getRow(1).font = { bold: true };
  for (const e of [...doc.entries].sort((a, b) => a.date.localeCompare(b.date))) {
    const row = j.addRow([formatDate(e.date), e.text, e.debit, e.credit, so(e.amount)]);
    row.getCell(5).numFmt = SOM;
  }

  const o = wb.addWorksheet(tr('Yil boshi qoldiqlari'));
  o.columns = [{ header: tr('Hisobvaraq'), width: 12 }, { header: tr('Nomi'), width: 50 }, { header: tr('Debet qoldiq'), width: 20 }, { header: tr('Kredit qoldiq'), width: 20 }];
  o.getRow(1).font = { bold: true };
  for (const x of doc.opening) {
    const row = o.addRow([x.account, tr(accountName(x.account, doc.subaccounts)), so(x.debit), so(x.credit)]);
    row.getCell(3).numFmt = SOM;
    row.getCell(4).numFmt = SOM;
  }
  return wb;
}

export async function buildReconWorkbook(doc: Doc, group: { name: string; stir?: string; codes: string[] }, r: Reconciliation, tr: Tr): Promise<ExcelJS.Workbook> {
  const wb = newBook();
  const ws = wb.addWorksheet(tr('Dalolatnoma'));
  ws.columns = [{ width: 12 }, { width: 44 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 20 }];
  let n = header(ws, `${tr('SOLISHTIRISH DALOLATNOMASI')}: ${group.name}`, [
    [tr('Davr'), `${formatDate(r.period.from)} – ${formatDate(r.period.to)}`],
    [tr('Korxona'), `${doc.company.name}${doc.company.stir ? `, STIR ${doc.company.stir}` : ''}`],
    [tr('Kontragent'), `${group.name}${group.stir ? `, STIR ${group.stir}` : ''}`],
    [tr('Subschyotlar'), group.codes.join(', ')],
  ], 6);
  tableHead(ws, n++, [tr('Sana'), tr('Mazmun'), tr('Hisobvaraqlar'), tr('Debet'), tr('Kredit'), tr('Qoldiq')]);
  const bal = (v: number) => (v === 0 ? '0' : v > 0 ? `Dt ${so(v).toLocaleString('ru-RU')}` : `Kt ${so(-v).toLocaleString('ru-RU')}`);
  const add = (vals: ExcelJS.CellValue[], bold = false) => {
    const row = ws.getRow(n++);
    row.values = vals;
    row.getCell(4).numFmt = '#,##0.00;-#,##0.00;""';
    row.getCell(5).numFmt = '#,##0.00;-#,##0.00;""';
    for (let i = 1; i <= 6; i++) row.getCell(i).border = border;
    if (bold) row.font = { bold: true };
  };
  add(['', tr('Davr boshiga qoldiq'), '', null, null, bal(r.opening)], true);
  for (const x of r.rows) add([formatDate(x.date), x.text, x.accounts, x.dr ? so(x.dr) : null, x.cr ? so(x.cr) : null, bal(x.balance)]);
  add(['', tr('Aylanma'), '', so(r.turnoverDr), so(r.turnoverCr), ''], true);
  add(['', tr('Davr oxiriga qoldiq'), '', null, null, bal(r.closing)], true);
  ws.getCell(n + 1, 1).value = `${doc.company.name}: ____________`;
  ws.getCell(n + 1, 4).value = `${group.name}: ____________`;
  return wb;
}
