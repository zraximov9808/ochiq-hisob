import type { Doc, Entry } from './types';

export interface LedgerRow {
  /** Net balance (debit − credit) at the start of the period. */
  open: number;
  dr: number;
  cr: number;
  /** Net balance (debit − credit) at the end of the period. */
  close: number;
}

export type Ledger = Map<string, LedgerRow>;

export function inYear(e: Entry, year: number): boolean {
  return e.date >= `${year}-01-01` && e.date <= `${year}-12-31`;
}

/** Entries of the document year up to `to`. */
export function yearEntries(doc: Doc, to = `${doc.year}-12-31`): Entry[] {
  return doc.entries.filter((e) => inYear(e, doc.year) && e.date <= to);
}

export function buildLedger(doc: Doc, from: string, to: string): Ledger {
  const ledger: Ledger = new Map();
  const row = (code: string) => {
    let r = ledger.get(code);
    if (!r) {
      r = { open: 0, dr: 0, cr: 0, close: 0 };
      ledger.set(code, r);
    }
    return r;
  };
  for (const o of doc.opening) row(o.account.trim()).open += o.debit - o.credit;
  for (const e of yearEntries(doc, to)) {
    const d = row(e.debit.trim());
    const c = row(e.credit.trim());
    if (e.date < from) {
      d.open += e.amount;
      c.open -= e.amount;
    } else {
      d.dr += e.amount;
      c.cr += e.amount;
    }
  }
  for (const r of ledger.values()) r.close = r.open + r.dr - r.cr;
  return ledger;
}
