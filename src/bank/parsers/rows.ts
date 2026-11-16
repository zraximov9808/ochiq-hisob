import type { Cell } from '../model';

/** ExcelJS cell values can be rich text, formulas or hyperlinks; reduce them to plain values. */
export function plainCell(v: unknown): Cell {
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const o = v as { result?: unknown; richText?: Array<{ text: string }>; text?: string; error?: string };
    if ('result' in o) return o.result as Cell;
    if (o.richText) return o.richText.map((r) => r.text).join('');
    if (typeof o.text === 'string') return o.text;
    if (o.error) return null;
  }
  return v as Cell;
}

/** Text of a CSV export: UTF-8 when it decodes cleanly, otherwise Windows-1251 (soliq.uz). */
function decodeText(data: ArrayBuffer): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    text = new TextDecoder('windows-1251').decode(data);
  }
  return text.replace(/^﻿/, '');
}

/** Delimited text → rows; the delimiter is the first of ';', ',', tab found in the first line. */
export function parseCsv(text: string): Cell[][] {
  const first = text.split(/\r?\n/, 1)[0];
  const sep = [';', ',', '\t'].find((d) => first.includes(d)) ?? ';';
  const rows: Cell[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const isZip = (data: ArrayBuffer) => {
  const b = new Uint8Array(data, 0, Math.min(2, data.byteLength));
  return b[0] === 0x50 && b[1] === 0x4b;
};

/** All worksheets of an .xlsx file as arrays of rows (row 1 → index 0); a CSV export is read as one sheet. */
export async function readWorkbookRows(data: ArrayBuffer): Promise<Cell[][][]> {
  if (!isZip(data)) return [parseCsv(decodeText(data))];
  // Loaded on demand: the helpers below are used by the always-loaded auto entries, ExcelJS is large.
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  return wb.worksheets.map((ws) => {
    const rows: Cell[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, n) => {
      // row.values is sparse when leading cells are empty; Array.from fills the holes so .map/.findIndex see every column.
      rows[n - 1] = Array.from(row.values as unknown[]).slice(1).map(plainCell);
    });
    for (let i = 0; i < rows.length; i++) rows[i] ??= [];
    return rows;
  });
}

export const cellText = (v: Cell): string => (v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v)).trim();

/** Bank amounts: numbers, or text with spaces/nbsp and '.' or ',' as decimal separator → tiyin. */
export function moneyCell(v: Cell): number | null {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Math.round(v * 100);
  const t = String(v).replace(/[\s  ]/g, '').replace(',', '.');
  if (t === '' || t === '-') return 0;
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

/** 'dd.mm.yyyy[ HH:MM[:SS]]' → ISO; Date objects and Excel serials also accepted. */
export function dateTimeCell(v: Cell): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 19);
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(v * 86400) * 1000).toISOString().slice(0, 19);
  const m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(cellText(v));
  if (!m) return null;
  const p = (s: string | undefined, n = 2) => (s ?? '0').padStart(n, '0');
  return `${m[3]}-${p(m[2])}-${p(m[1])}T${p(m[4])}:${p(m[5])}:${p(m[6])}`;
}
