import { synthetic } from './accounts';
import { TAX_LINE_BY_ID } from './taxLines';
import type { Entry, TaxTag } from './types';

type EntryLike = Pick<Entry, 'debit' | 'credit' | 'text'> & { tax?: TaxTag };

const num = (code: string) => {
  const s = synthetic(code);
  return s.length === 4 ? Number(s) : -1;
};
const between = (n: number, a: number, b: number) => n >= a && n <= b;

/** Words that make an expense non-deductible for profit tax (fines, penalties, charity, gifts). */
const NON_DEDUCTIBLE = /jarima|penya|neustoyka|xayriya|homiylik|chegirilmaydi|sovg/i;

function incomeLine(n: number): string | null {
  if (n === 9010) return 'i021';
  if (n === 9030) return 'i023';
  if (between(n, 9000, 9099)) return 'i022';
  if (between(n, 9300, 9399) || between(n, 9500, 9599) || between(n, 9710, 9719)) return 'i030';
  return null;
}

function expenseLine(n: number): string | null {
  if (between(n, 9100, 9199)) return 'e020';
  if (between(n, 9410, 9419)) return 'e030';
  if (between(n, 9420, 9429)) return 'e040';
  if (between(n, 9430, 9499)) return 'e060';
  if (between(n, 9600, 9699)) return 'e050';
  if (between(n, 9720, 9799)) return 'e060';
  return null;
}

/** Proposes the profit-tax report line for a journal entry. */
export function suggestTax(e: EntryLike): TaxTag {
  const dr = num(e.debit);
  const cr = num(e.credit);
  if (between(dr, 9900, 9999) || between(cr, 9900, 9999)) return { line: null };
  const exp = expenseLine(dr);
  if (exp) return NON_DEDUCTIBLE.test(e.text) ? { line: exp, nonDeductible: true } : { line: exp };
  const inc = incomeLine(cr);
  if (inc) return { line: inc };
  // Sales returns and discounts (Dt 9040/9050) reduce income; expense reversals reduce expenses.
  const incRev = between(dr, 9000, 9099) ? incomeLine(dr) : null;
  if (incRev) return { line: incRev };
  const expRev = expenseLine(cr);
  if (expRev) return { line: expRev };
  return { line: null };
}

/** The tag in force: a manual tag wins, otherwise the suggestion. */
export function effectiveTax(e: EntryLike): TaxTag {
  return e.tax?.manual ? e.tax : suggestTax(e);
}

/**
 * Signed amount an entry adds to its tax line: income lines grow with credits to P&L accounts,
 * expense lines with debits; the reverse direction (returns, reversals) subtracts.
 */
export function taxSign(e: EntryLike, lineId: string): 1 | -1 {
  const annex = TAX_LINE_BY_ID.get(lineId)?.annex ?? 2;
  const drPL = synthetic(e.debit).startsWith('9');
  const crPL = synthetic(e.credit).startsWith('9');
  if (annex === 1) return drPL && !crPL ? -1 : 1;
  return crPL && !drPL ? -1 : 1;
}
