import ExcelJS from 'exceljs';
import type { Report } from '../engine/checks';
import { toMing } from '../engine/money';
import { formatDate, periodRange, type Quarter } from '../engine/period';
import type { Doc } from '../engine/types';
import { FORMS, FORM_IDS } from '../forms/defs';
import { headerRows } from '../forms/layout';
import { formSet } from '../forms/sources';
import type { FormDef, FormGroup, FormId } from '../forms/types';
import { formNames, isRateCell, type Cell, type FormValues } from '../forms/values';

export type Tr = (s: string) => string;

/** Sheet names (Excel allows 31 characters). */
const SHEET: Record<FormId, string> = {
  b1: '1-shakl',
  'b1-offbal': '1-shakl balansdan tashqari',
  'b1-overdue': '1-shakl muddati o‘tgan qarzlar',
  f2: '2-shakl',
  'f2-budget': '2-shakl byudjet',
  tax: 'Foyda solig‘i',
  'tax-1': '1-ilova',
  'tax-2': '2-ilova',
  'tax-2.1': '2.1-ilova',
  'tax-2.1a': '2.1(a)-ilova',
  'tax-2.1b': '2.1(b)-ilova',
  'tax-3': '3-ilova',
  'tax-4': '4-ilova',
  'tax-5': '5-ilova',
  'tax-6': '6-ilova',
  'tax-7': '7-ilova',
  'tax-8': '8-ilova',
  'tax-9': '9-ilova',
  'tax-10': '10-ilova',
  'tax-11': '11-ilova',
};

const PERIOD: Record<Quarter, string> = { 1: 'I chorak', 2: 'yarim yil', 3: '9 oy', 4: 'yillik' };
const thin = { style: 'thin' as const, color: { argb: 'FF8A97A3' } };
const border = { top: thin, left: thin, bottom: thin, right: thin };
const HEAD_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFEEF2F5' } };
const CALC_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF4F7F9' } };
const X_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE6EAEE' } };

/** A cell as printed: money in the form's unit, rates in percent, "x" for closed cells; untouched empty cells stay blank. */
function printed(cell: Cell | undefined, rate: boolean, ming: boolean): string | number | null {
  if (!cell || cell.v === null) return cell?.closed ? 'x' : null;
  if (!cell.computed && cell.v === 0) return null;
  if (rate) return cell.v / 100;
  return ming ? toMing(cell.v) : Math.round(cell.v) / 100;
}

function companyBlock(ws: ExcelJS.Worksheet, def: FormDef, doc: Doc, tr: Tr): number {
  const c = doc.company;
  const codes = c.codes ?? {};
  const rows: Array<[string, string | undefined]> =
    def.id === 'b1' || def.id === 'f2'
      ? [
          ['Korxona, tashkilot', c.name],
          ['STIR', c.stir],
          ['Faoliyat turi', c.industry],
          ['Tashkiliy-huquqiy shakli', c.legalForm],
          ['Mulkchilik shakli', c.ownership],
          ['Vazirlik, idora, xo‘jalik birlashmasi', c.ministry],
          ['Hudud', c.region],
          ['Manzil', c.address],
          ['KTUT', codes.ktut],
          ['IFUT', codes.ifut],
          ['TXSHT', codes.txsht],
          ['MShT', codes.msht],
          ['DBIBT', codes.dbibt],
          ['MHOBT', codes.mxobt],
        ]
      : [
          ['Korxona, tashkilot', c.name],
          ['STIR', c.stir],
        ];
  rows.forEach(([k, v], i) => {
    const row = ws.getRow(i + 1);
    row.getCell(1).value = tr(k);
    row.getCell(1).font = { color: { argb: 'FF5D6B79' } };
    row.getCell(2).value = v ?? '';
    row.getCell(2).font = { bold: true };
  });
  return rows.length + 2;
}

function addFormSheet(wb: ExcelJS.Workbook, def: FormDef, values: FormValues, doc: Doc, quarter: Quarter, tr: Tr) {
  const ming = def.group !== 'tax';
  const ws = wb.addWorksheet(tr(SHEET[def.id]).slice(0, 31));
  const width = def.columns.length + 2;
  ws.columns = [{ width: def.sections ? 8 : 60 }, { width: def.sections ? 50 : 9 }, ...def.columns.map(() => ({ width: def.columns.length > 8 ? 14 : 18 }))];

  let n = companyBlock(ws, def, doc, tr);
  ws.mergeCells(n, 1, n, width);
  const title = ws.getCell(n, 1);
  title.value = tr(def.title);
  title.font = { bold: true, size: 12 };
  title.alignment = { horizontal: 'center', wrapText: true };
  ws.getRow(n).height = 32;
  n++;
  ws.mergeCells(n, 1, n, width);
  const { to } = periodRange(doc.year, quarter);
  const period = def.group === 'balance' ? `${formatDate(to)} ${tr('holatiga')}` : `${doc.year}-${tr('yil')}, ${tr(PERIOD[quarter])}`;
  ws.getCell(n, 1).value = `${period} · ${tr('O‘lchov birligi')}: ${tr(ming ? 'ming so‘m' : 'so‘m')}`;
  ws.getCell(n, 1).alignment = { horizontal: 'center' };
  n += 2;

  // header rows: merged as on the template, then the number row
  const head = headerRows(def.columns);
  const top = n;
  const style = (cell: ExcelJS.Cell) => {
    cell.font = { bold: true, size: 9 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = border;
    cell.fill = HEAD_FILL;
  };
  const firstTwo = def.sections ? ['№', 'Muddati o‘tgan qarzdorlikka ega bo‘lgan debitor va kreditorlar ro‘yxati'] : ['Ko‘rsatkichlar nomi', 'Satr kodi'];
  firstTwo.forEach((text, i) => {
    // a one-row header needs no merge: Excel treats a single-cell merge as damage
    if (head.length > 1) ws.mergeCells(top, i + 1, top + head.length - 1, i + 1);
    ws.getCell(top, i + 1).value = tr(text);
  });
  const taken = new Set<string>();
  head.forEach((row, k) => {
    let col = 3;
    for (const h of row) {
      while (taken.has(`${k}:${col}`)) col++;
      if (h.colSpan > 1 || h.rowSpan > 1) ws.mergeCells(top + k, col, top + k + h.rowSpan - 1, col + h.colSpan - 1);
      ws.getCell(top + k, col).value = tr(h.text);
      for (let r = k; r < k + h.rowSpan; r++) for (let c = col; c < col + h.colSpan; c++) taken.add(`${r}:${c}`);
      col += h.colSpan;
    }
  });
  for (let r = top; r < top + head.length; r++) for (let c = 1; c <= width; c++) style(ws.getCell(r, c));
  n = top + head.length;
  const nums = ws.getRow(n);
  nums.values = ['1', '2', ...def.columns.map((c) => (def.colFormulas[c.id] ? `${c.num}=${def.colFormulas[c.id].replace(/\s+/g, '')}` : c.num))];
  for (let c = 1; c <= width; c++) style(ws.getCell(n, c));
  n++;

  const put = (label: string, code: string, key: string, bold: boolean) => {
    const row = ws.getRow(n++);
    row.getCell(1).value = label;
    row.getCell(2).value = code;
    def.columns.forEach((c, i) => {
      const cell = row.getCell(i + 3);
      const v = values[key]?.[c.id];
      const rate = isRateCell(def.id, key, c.id);
      cell.value = printed(v, rate, ming);
      cell.numFmt = rate ? '0.##' : ming ? '#,##0' : '#,##0.00';
      cell.alignment = { horizontal: v?.closed ? 'center' : 'right' };
      if (v?.computed) cell.fill = CALC_FILL;
      if (v?.closed) cell.fill = X_FILL;
    });
    for (let c = 1; c <= width; c++) row.getCell(c).border = border;
    row.getCell(1).alignment = { wrapText: true, vertical: 'middle' };
    row.getCell(2).alignment = def.sections ? { wrapText: true, vertical: 'middle' } : { horizontal: 'center', vertical: 'middle' };
    if (bold) row.font = { bold: true };
  };
  const names = formNames(doc, def.id, quarter);

  if (def.sections) {
    def.sections.forEach((s, i) => {
      if (i === 0 || def.sections![i - 1].id[0] !== s.id[0]) {
        const row = ws.getRow(n++);
        ws.mergeCells(row.number, 1, row.number, width);
        row.getCell(1).value = tr(def.lines[s.id.startsWith('d') ? 0 : 1]?.label ?? '');
        row.getCell(1).font = { bold: true };
      }
      // the overdue annex puts the number first and the name second
      put(s.num, tr(s.label), s.id, true);
      // rows with numbers, and rows the filer only named so far
      const rows = [...new Set([...Object.keys(values), ...Object.keys(names)])]
        .filter((k) => k.startsWith(`${s.id}.`))
        .sort((a, b) => Number(a.slice(s.id.length + 1)) - Number(b.slice(s.id.length + 1)));
      rows.forEach((key, k) => put(`${s.num}.${k + 1}`, names[key] ?? '', key, false));
    });
  } else {
    for (const l of def.lines) {
      if (!l.code) {
        const row = ws.getRow(n++);
        ws.mergeCells(row.number, 1, row.number, width);
        row.getCell(1).value = tr(l.label);
        row.getCell(1).font = { bold: true };
        continue;
      }
      const cells = def.columns.map((c) => values[l.code!]?.[c.id]);
      const total = cells.some((c) => c?.computed) && cells.every((c) => c?.computed || c?.closed);
      put(l.label ? tr(l.label) : names[l.code] ?? '', l.code, l.code, total);
    }
  }
  n++;
  ws.getCell(n, 1).value = `${tr('Rahbar')}: ____________ ${doc.company.director}`;
  ws.getCell(n + 1, 1).value = `${tr('Bosh buxgalter')}: ____________ ${doc.company.accountant}`;
  ws.views = [{ state: 'frozen', ySplit: top + head.length, xSplit: 2 }];
}

/** One workbook per group: every form and annex on its own sheet, laid out as the official form. */
export async function buildFormsWorkbook(group: FormGroup, doc: Doc, quarter: Quarter, report: Report, tr: Tr, into?: ExcelJS.Workbook): Promise<ExcelJS.Workbook> {
  const wb = into ?? new ExcelJS.Workbook();
  if (!into) {
    wb.creator = 'Ochiq Hisob';
    wb.created = new Date();
  }
  const values = formSet(doc, quarter, report, 'ming');
  for (const id of FORM_IDS) if (FORMS[id].group === group) addFormSheet(wb, FORMS[id], values[id], doc, quarter, tr);
  return wb;
}
