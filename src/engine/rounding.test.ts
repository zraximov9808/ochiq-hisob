import { expect, test } from 'vitest';
import { buildBalance } from './balanceSheet';
import { buildIncome } from './incomeStatement';
import { roundBalance, roundIncome } from './rounding';
import { entry, open, referenceDoc } from './testDoc';

const MING = 100_000; // 1 000 so‘m in tiyin

test('balance totals in ming so‘m are the sum of the rounded lines', () => {
  const doc = referenceDoc();
  doc.opening.push(open('5010', 0.0006), open('5210', 0.0006), open('8410', 0, 0.0012));
  const r = roundBalance(buildBalance(doc, 1));
  expect(r['330'].start).toBe(MING);
  expect(r['350'].start).toBe(MING);
  expect(r['320'].start).toBe(r['330'].start + r['340'].start + r['350'].start + r['360'].start);
});

test('income totals in ming so‘m are the sum of the rounded lines', () => {
  const doc = referenceDoc([entry('2026-01-05', '4010', '9020', 0.0006), entry('2026-01-05', '9120', '2910', 0.0004)]);
  const r = roundIncome(buildIncome(doc, 1));
  expect(r.cur['010']).toBe(MING);
  expect(r.cur['020']).toBe(0);
  expect(r.cur['030']).toBe(MING);
});
