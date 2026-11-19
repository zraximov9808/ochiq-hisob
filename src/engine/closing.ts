import { synthetic } from './accounts';
import { buildIncome } from './incomeStatement';
import { buildLedger } from './ledger';
import type { Doc, Entry, Opening } from './types';
import { uid } from './uid';

const isPL = (code: string) => {
  const s = synthetic(code);
  return s.length === 4 && s.startsWith('9') && !s.startsWith('99');
};

/** Year-end entries closing every income/expense account to 9910 and 9910 to 8710. */
export function makeClosingEntries(doc: Doc): Entry[] {
  const yearEnd = `${doc.year}-12-31`;
  const ledger = buildLedger(doc, `${doc.year}-01-01`, yearEnd);
  const make = (debit: string, credit: string, amount: number, text: string): Entry => ({
    id: uid('c'),
    date: yearEnd,
    text,
    debit,
    credit,
    amount,
    closing: true,
    tax: { line: null, manual: true },
  });
  const out: Entry[] = [];
  let net9910 = ledger.get('9910')?.close ?? 0;
  for (const code of [...ledger.keys()].filter(isPL).sort()) {
    const close = ledger.get(code)!.close;
    if (close === 0) continue;
    if (close < 0) out.push(make(code, '9910', -close, `Yil yakuni: ${code} yopildi`));
    else out.push(make('9910', code, close, `Yil yakuni: ${code} yopildi`));
    net9910 += close;
  }
  if (net9910 < 0) out.push(make('9910', '8710', -net9910, 'Yil yakuni: sof foyda 8710 ga'));
  if (net9910 > 0) out.push(make('8710', '9910', net9910, 'Yil yakuni: zarar 8710 ga'));
  return out;
}

/** Closes the year and returns the next year's document with carried-over balances. */
export function rollToNextYear(doc: Doc): Doc {
  const full: Doc = { ...doc, entries: [...doc.entries, ...makeClosingEntries(doc)] };
  const ledger = buildLedger(full, `${doc.year}-01-01`, `${doc.year}-12-31`);
  const opening: Opening[] = [];
  for (const code of [...ledger.keys()].sort()) {
    const close = ledger.get(code)!.close;
    if (close === 0 || synthetic(code).startsWith('9')) continue;
    opening.push({ account: code, debit: close > 0 ? close : 0, credit: close < 0 ? -close : 0 });
  }
  const income = buildIncome(full, 4).byCode;
  const prevYear = Object.fromEntries(Object.entries(income).filter(([, v]) => v !== 0));
  // values typed into this year's forms belong to this year only
  const { forms: _forms, formNames: _names, ...rest } = doc;
  return { ...rest, year: doc.year + 1, opening, entries: [], prevYear };
}
