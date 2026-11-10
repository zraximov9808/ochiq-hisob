import { parseAmount } from '../engine/money';
import { parseDate } from '../engine/period';
import type { Opening } from '../engine/types';

export type Cell = unknown;

export interface ParsedEntry {
  date: string;
  text: string;
  debit: string;
  credit: string;
  amount: number;
}

const norm = (v: Cell) => String(v ?? '').trim().toLowerCase();

function findHeader(rows: Cell[][], need: Record<string, RegExp>, optional: Record<string, RegExp> = {}) {
  for (let r = 0; r < Math.min(rows.length, 25); r++) {
    const cols: Record<string, number> = {};
    rows[r].forEach((cell, c) => {
      const s = norm(cell);
      for (const [k, re] of Object.entries({ ...need, ...optional })) if (cols[k] === undefined && re.test(s)) cols[k] = c;
    });
    if (Object.keys(need).every((k) => cols[k] !== undefined)) return { row: r, cols };
  }
  return null;
}

function cellDate(v: Cell): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const ms = Date.UTC(1899, 11, 30) + Math.round(v) * 86400000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  return typeof v === 'string' ? parseDate(v) : null;
}

function cellAmount(v: Cell): number | null {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Math.round(v * 100);
  return parseAmount(String(v));
}

function cellCode(v: Cell): string {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v).padStart(4, '0') : v.toFixed(2);
  return String(v ?? '').trim().replace(/\s/g, '');
}

const JOURNAL = {
  date: /^(sana|сана|дата)/,
  debit: /^(debet|dt|дебет|дт)/,
  credit: /^(kredit|kt|кредит|кт)/,
  amount: /^(summa|сумма|сумма|miqdor)/,
};

export function parseJournalRows(rows: Cell[][]): { entries: ParsedEntry[]; errors: string[] } {
  const head = findHeader(rows, JOURNAL, { text: /(mazmun|мазмун|izoh|tavsif|содержание|описание)/ });
  if (!head) return { entries: [], errors: ['Ustun sarlavhalari topilmadi: Sana, Debet, Kredit, Summa (va ixtiyoriy Mazmun).'] };
  const entries: ParsedEntry[] = [];
  const errors: string[] = [];
  for (let r = head.row + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((c) => norm(c) === '')) continue;
    const date = cellDate(row[head.cols.date]);
    const debit = cellCode(row[head.cols.debit]);
    const credit = cellCode(row[head.cols.credit]);
    const amount = cellAmount(row[head.cols.amount]);
    if (!date || !debit || !credit || !amount || amount <= 0) {
      errors.push(`${r + 1}-qator o‘qilmadi (sana, hisobvaraq yoki summa noto‘g‘ri).`);
      continue;
    }
    const text = head.cols.text !== undefined ? String(row[head.cols.text] ?? '').trim() : '';
    entries.push({ date, text, debit, credit, amount });
  }
  return { entries, errors };
}

export function parseOpeningRows(rows: Cell[][]): { opening: Opening[]; errors: string[] } {
  const head = findHeader(rows, {
    account: /^(hisobvaraq|schyot|счет|счёт|ҳисобварақ|kod|код|hisob)/,
    debit: /^(debet|dt|дебет|дт)/,
    credit: /^(kredit|kt|кредит|кт)/,
  });
  if (!head) return { opening: [], errors: ['Ustun sarlavhalari topilmadi: Hisobvaraq, Debet qoldiq, Kredit qoldiq.'] };
  const opening: Opening[] = [];
  const errors: string[] = [];
  for (let r = head.row + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((c) => norm(c) === '')) continue;
    const account = cellCode(row[head.cols.account]);
    const debit = cellAmount(row[head.cols.debit]);
    const credit = cellAmount(row[head.cols.credit]);
    if (!/^\d{3,4}(\.\d+)?$/.test(account) || debit === null || credit === null) {
      errors.push(`${r + 1}-qator o‘qilmadi (hisobvaraq yoki summa noto‘g‘ri).`);
      continue;
    }
    if (debit || credit) opening.push({ account, debit, credit });
  }
  return { opening, errors };
}
