import { describe, expect, test } from 'vitest';
import { buildBalance } from './balanceSheet';
import { M, entry, referenceDoc } from './testDoc';

const v = (form: ReturnType<typeof buildBalance>, code: string) => form.byCode[code];

describe('buildBalance', () => {
  test('reference opening balances give aktiv 400 = passiv 780 = 250 000 ming so‘m', () => {
    const f = buildBalance(referenceDoc(), 1);
    expect(v(f, '400').start).toBe(250 * M);
    expect(v(f, '780').start).toBe(250 * M);
    expect(v(f, '010').start).toBe(50 * M);
    expect(v(f, '011').start).toBe(10 * M);
    expect(v(f, '012').start).toBe(40 * M);
    expect(v(f, '180').start).toBe(150 * M);
    expect(v(f, '410').start).toBe(100 * M);
    expect(v(f, '450').start).toBe(110 * M);
    expect(v(f, '610').start).toBe(40 * M);
  });

  test('supplier paid more than owed moves to advances paid (260) and stays balanced', () => {
    const f = buildBalance(referenceDoc([entry('2026-01-20', '6010', '5110', 50)]), 1);
    expect(v(f, '260').end).toBe(10 * M);
    expect(v(f, '610').end).toBe(0);
    expect(v(f, '400').end).toBe(v(f, '780').end);
  });

  test('current-year profit in P&L accounts is shown in 450', () => {
    const doc = referenceDoc([
      entry('2026-02-01', '4010', '9020', 10),
      entry('2026-02-01', '9120', '2910', 6),
    ]);
    const f = buildBalance(doc, 1);
    expect(v(f, '450').end).toBe(114 * M);
    expect(v(f, '400').end).toBe(v(f, '780').end);
  });

  test('contra accounts reduce their asset line (2980 trade margin)', () => {
    const doc = referenceDoc([entry('2026-02-01', '2910', '2980', 5)]);
    const f = buildBalance(doc, 1);
    expect(v(f, '180').end).toBe(150 * M);
  });

  test('codes outside the chart are reported as unmapped', () => {
    const doc = referenceDoc([entry('2026-02-01', '8150', '5110', 1)]);
    const f = buildBalance(doc, 1);
    expect(f.unmapped).toEqual(['8150']);
  });

  test('contributions list which accounts formed a line', () => {
    const f = buildBalance(referenceDoc(), 1);
    expect(f.contrib['180']).toEqual([{ account: '2910', start: 150 * M, end: 150 * M }]);
  });
});
