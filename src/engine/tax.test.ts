import { describe, expect, test } from 'vitest';
import { buildProfitTax } from './profitTax';
import { suggestTax } from './taxSuggest';
import { M, entry, referenceDoc } from './testDoc';

describe('suggestTax', () => {
  test('sales credits map to annex 1 lines by activity', () => {
    expect(suggestTax(entry('2026-01-05', '4010', '9020', 1)).line).toBe('i022');
    expect(suggestTax(entry('2026-01-05', '4010', '9030', 1)).line).toBe('i023');
    expect(suggestTax(entry('2026-01-05', '4010', '9010', 1)).line).toBe('i021');
  });
  test('expense debits map to annex 2 groups', () => {
    expect(suggestTax(entry('2026-01-05', '9120', '2910', 1)).line).toBe('e020');
    expect(suggestTax(entry('2026-01-05', '9410', '6010', 1)).line).toBe('e030');
    expect(suggestTax(entry('2026-01-05', '9420', '6710', 1)).line).toBe('e040');
    expect(suggestTax(entry('2026-01-05', '9610', '6920', 1)).line).toBe('e050');
    expect(suggestTax(entry('2026-01-05', '9430', '5110', 1)).line).toBe('e060');
  });
  test('fines and charity are flagged non-deductible', () => {
    const t = suggestTax(entry('2026-01-05', '9430', '5110', 1, "Jarima to'landi"));
    expect(t).toEqual({ line: 'e060', nonDeductible: true });
  });
  test('balance-only entries, profit tax and closing entries stay out of the report', () => {
    expect(suggestTax(entry('2026-01-05', '2910', '6010', 1)).line).toBeNull();
    expect(suggestTax(entry('2026-01-05', '9810', '6410', 1)).line).toBeNull();
    expect(suggestTax(entry('2026-12-31', '9020', '9910', 1)).line).toBeNull();
  });
});

describe('buildProfitTax', () => {
  const entries = () => [
    entry('2026-01-05', '4010', '9020', 180),
    entry('2026-01-10', '4010', '9030', 40),
    entry('2026-01-05', '9120', '2910', 120),
    entry('2026-01-31', '9420', '6710', 30),
    entry('2026-02-15', '9410', '6010', 23.2),
  ];

  test('main form: taxable profit and tax at 15%', () => {
    const t = buildProfitTax(referenceDoc(entries()), 1);
    expect(t.main['010']).toBe(220 * M);
    expect(t.main['020']).toBe(173.2 * M);
    expect(t.main['030']).toBe(46.8 * M);
    expect(t.main['060']).toBe(46.8 * M);
    expect(t.main['080']).toBe(7.02 * M);
    expect(t.main['150']).toBe(7.02 * M);
    expect(t.annex1['020']).toBe(220 * M);
  });

  test('non-deductible expenses are in column 3 and 4 and do not reduce the base', () => {
    const doc = referenceDoc([...entries(), entry('2026-02-20', '9430', '5110', 4.1, 'Soliq jarimasi')]);
    const t = buildProfitTax(doc, 1);
    expect(t.annex2['060']).toEqual({ total: Math.round(4.1 * M), nonDeductible: Math.round(4.1 * M) });
    expect(t.annex2['010']).toEqual({ total: Math.round(177.3 * M), nonDeductible: Math.round(4.1 * M) });
    expect(t.main['020']).toBe(173.2 * M);
    expect(t.nonDeductibleTotal).toBe(Math.round(4.1 * M));
  });

  test('a manual tag overrides the suggestion', () => {
    const e = entry('2026-02-20', '9430', '5110', 2);
    e.tax = { line: 'e040', manual: true };
    const t = buildProfitTax(referenceDoc([e]), 1);
    expect(t.annex2['040'].total).toBe(2 * M);
    expect(t.annex2['060']).toBeUndefined();
  });

  test('tax base is never negative', () => {
    const t = buildProfitTax(referenceDoc([entry('2026-01-31', '9420', '6710', 30)]), 1);
    expect(t.main['030']).toBe(-30 * M);
    expect(t.main['060']).toBe(0);
    expect(t.main['150']).toBe(0);
  });

  test('sources list the entries behind each line', () => {
    const t = buildProfitTax(referenceDoc(entries()), 1);
    expect(t.sources['i022'].map((e) => e.amount)).toEqual([180 * M]);
  });
});
