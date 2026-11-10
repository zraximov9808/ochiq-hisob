import type { Cell } from './parse';

/** ExcelJS cell values can be rich text, formulas or hyperlinks; reduce them to plain values. */
function plain(v: unknown): Cell {
  if (v && typeof v === 'object' && !(v instanceof Date)) {
    const o = v as { result?: unknown; richText?: Array<{ text: string }>; text?: string };
    if ('result' in o) return o.result as Cell;
    if (o.richText) return o.richText.map((r) => r.text).join('');
    if (typeof o.text === 'string') return o.text;
  }
  return v as Cell;
}

function parseCsv(text: string): Cell[][] {
  const sep = (text.split('\n')[0].match(/;/g)?.length ?? 0) > (text.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  return text
    .split(/\r?\n/)
    .map((line) => line.split(sep).map((c) => c.replace(/^"|"$/g, '').trim()));
}

/** Rows of the first worksheet of an .xlsx file (or a .csv file). */
export async function readSheetRows(file: File): Promise<Cell[][]> {
  if (/\.csv$/i.test(file.name)) return parseCsv(await file.text());
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: Cell[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    rows[n - 1] = (row.values as unknown[]).slice(1).map(plain);
  });
  for (let i = 0; i < rows.length; i++) rows[i] ??= [];
  return rows;
}
