import { yearEntries } from './ledger';
import { periodRange, type Quarter } from './period';
import { TAX_LINE_BY_ID } from './taxLines';
import { effectiveTax, taxSign } from './taxSuggest';
import type { Doc, Entry } from './types';

export interface ProfitTax {
  /** Main form money lines in tiyin; rate lines (070–072, 130) in percent. */
  main: Record<string, number>;
  /** Annex 1 by line code; '010' total, '020' = 021…026. */
  annex1: Record<string, number>;
  /** Annex 2 by line code: column 3 (total) and column 4 (non-deductible); '010' is the sum. */
  annex2: Record<string, { total: number; nonDeductible: number }>;
  /** Entries behind each tax line id, for drill-down. */
  sources: Record<string, Entry[]>;
  nonDeductibleTotal: number;
  period: { from: string; to: string };
}

export function buildProfitTax(doc: Doc, quarter: Quarter): ProfitTax {
  const { from, to } = periodRange(doc.year, quarter);
  const annex1: Record<string, number> = {};
  const annex2: ProfitTax['annex2'] = {};
  const sources: Record<string, Entry[]> = {};
  let nonDeductibleTotal = 0;

  for (const e of yearEntries(doc, to)) {
    if (e.date < from || e.closing) continue;
    const tag = effectiveTax(e);
    if (!tag.line) continue;
    const def = TAX_LINE_BY_ID.get(tag.line);
    if (!def) continue;
    const amount = taxSign(e, tag.line) * e.amount;
    (sources[tag.line] ??= []).push(e);
    if (def.annex === 1) {
      annex1[def.code] = (annex1[def.code] ?? 0) + amount;
    } else {
      const cell = (annex2[def.code] ??= { total: 0, nonDeductible: 0 });
      cell.total += amount;
      if (tag.nonDeductible) {
        cell.nonDeductible += amount;
        nonDeductibleTotal += amount;
      }
    }
  }

  const sales = ['021', '022', '023', '024', '025', '026'].reduce((s, c) => s + (annex1[c] ?? 0), 0);
  if (sales) annex1['020'] = sales;
  annex1['010'] = Object.entries(annex1)
    .filter(([code]) => code !== '010' && code !== '020')
    .reduce((s, [, v]) => s + v, 0);
  const sum2 = Object.values(annex2).reduce(
    (s, c) => ({ total: s.total + c.total, nonDeductible: s.nonDeductible + c.nonDeductible }),
    { total: 0, nonDeductible: 0 },
  );
  annex2['010'] = sum2;

  const rate = doc.taxRate;
  const m: Record<string, number> = {};
  m['010'] = annex1['010'];
  m['020'] = sum2.total - sum2.nonDeductible;
  m['030'] = m['010'] - m['020'];
  m['040'] = 0;
  m['050'] = 0;
  m['060'] = Math.max(0, m['030'] - m['040'] - m['050']);
  m['061'] = 0;
  m['062'] = m['060'] - m['061'];
  m['063'] = 0;
  m['070'] = rate;
  m['071'] = 0;
  m['072'] = rate;
  m['080'] = Math.round(((m['062'] - m['063']) * rate) / 100) + Math.round((m['063'] * m['071']) / 100);
  for (const c of ['090', '100', '110', '120', '140']) m[c] = 0;
  m['130'] = 0;
  m['150'] = m['080'] - m['100'] - m['110'] + m['140'];

  return { main: m, annex1, annex2, sources, nonDeductibleTotal, period: { from, to } };
}
