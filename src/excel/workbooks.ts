import ExcelJS from 'exceljs';
import { accountName } from '../engine/accounts';
import type { Report } from '../engine/checks';
import { formatDate, type Quarter } from '../engine/period';
import type { Reconciliation } from '../engine/reconciliation';
import { buildTrialBalance } from '../engine/trialBalance';
import type { Doc } from '../engine/types';
import { buildFormsWorkbook } from './formWorkbook';

export type Tr = (s: string) => string;
export type FormKind = 'balance' | 'income' | 'tax';

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

function newBook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Ochiq Hisob';
  wb.created = new Date();
  return wb;
}

/** One official form with its annexes, each on its own sheet (see formWorkbook.ts). */
export async function buildFormWorkbook(kind: FormKind, doc: Doc, quarter: Quarter, r: Report, tr: Tr): Promise<ExcelJS.Workbook> {
  return buildFormsWorkbook(kind, doc, quarter, r, tr, newBook());
}

export async function buildAllWorkbook(doc: Doc, quarter: Quarter, r: Report, tr: Tr): Promise<ExcelJS.Workbook> {
  const wb = newBook();
  for (const group of ['balance', 'income', 'tax'] as const) await buildFormsWorkbook(group, doc, quarter, r, tr, wb);

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
