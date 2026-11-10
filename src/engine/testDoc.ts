import type { Doc, Entry, Opening } from './types';
import { emptyDoc } from './types';

const M = 100_000_000; // 1 million so‘m in tiyin

let seq = 0;
export function entry(date: string, debit: string, credit: string, millions: number, text = ''): Entry {
  return { id: `t${++seq}`, date, text, debit, credit, amount: Math.round(millions * M) };
}

export function open(account: string, debitMillions: number, creditMillions = 0): Opening {
  return { account, debit: Math.round(debitMillions * M), credit: Math.round(creditMillions * M) };
}

/** Opening balances of the reference example: 260M = 260M. */
export function referenceDoc(entries: Entry[] = []): Doc {
  return {
    ...emptyDoc(2026),
    opening: [
      open('0130', 50), open('0230', 0, 10), open('2910', 150), open('5110', 60),
      open('6010', 0, 40), open('8330', 0, 100), open('8720', 0, 110),
    ],
    entries,
  };
}

export { M };
