import { buildLedger, yearEntries } from './ledger';
import { periodRange, type Quarter } from './period';
import type { Doc } from './types';

export interface ReconRow {
  date: string;
  text: string;
  accounts: string;
  dr: number;
  cr: number;
  /** Running net balance (debit − credit) after this row. */
  balance: number;
}

export interface Reconciliation {
  opening: number;
  rows: ReconRow[];
  turnoverDr: number;
  turnoverCr: number;
  closing: number;
  period: { from: string; to: string };
}

/** Reconciliation act ("solishtirish dalolatnomasi") for one counterparty's leaf accounts. */
export function buildReconciliation(doc: Doc, codes: string[], quarter: Quarter): Reconciliation {
  const set = new Set(codes);
  const { from, to } = periodRange(doc.year, quarter);
  const ledger = buildLedger(doc, from, to);
  const opening = codes.reduce((s, c) => s + (ledger.get(c)?.open ?? 0), 0);
  let balance = opening;
  let turnoverDr = 0;
  let turnoverCr = 0;
  const rows: ReconRow[] = [];
  const entries = yearEntries(doc, to)
    .filter((e) => e.date >= from)
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const e of entries) {
    const d = set.has(e.debit.trim());
    const c = set.has(e.credit.trim());
    if (d === c) continue;
    const dr = d ? e.amount : 0;
    const cr = c ? e.amount : 0;
    balance += dr - cr;
    turnoverDr += dr;
    turnoverCr += cr;
    rows.push({ date: e.date, text: e.text, accounts: `${e.debit} / ${e.credit}`, dr, cr, balance });
  }
  return { opening, rows, turnoverDr, turnoverCr, closing: balance, period: { from, to } };
}
