import { describe, expect, test } from 'vitest';
import { buildIncome } from './incomeStatement';
import { M, entry, referenceDoc } from './testDoc';

const base = () => [
  entry('2026-01-05', '4010', '9020', 180),
  entry('2026-01-05', '9120', '2910', 120),
  entry('2026-01-31', '9420', '6710', 30),
  entry('2026-03-31', '9810', '6410', 4.5),
];

describe('buildIncome', () => {
  test('computes gross profit, operating profit and net profit', () => {
    const f = buildIncome(referenceDoc(base()), 1);
    expect(f.byCode['010']).toBe(180 * M);
    expect(f.byCode['020']).toBe(120 * M);
    expect(f.byCode['030']).toBe(60 * M);
    expect(f.byCode['040']).toBe(30 * M);
    expect(f.byCode['060']).toBe(30 * M);
    expect(f.byCode['100']).toBe(30 * M);
    expect(f.byCode['240']).toBe(30 * M);
    expect(f.byCode['250']).toBe(4.5 * M);
    expect(f.byCode['270']).toBe(25.5 * M);
  });

  test('closing entries through 9910 are not counted twice', () => {
    const closing = [
      entry('2026-03-31', '9020', '9910', 180),
      entry('2026-03-31', '9910', '9120', 120),
      entry('2026-03-31', '9910', '9420', 30),
      entry('2026-03-31', '9910', '9810', 4.5),
      entry('2026-03-31', '9910', '8710', 25.5),
    ];
    const f = buildIncome(referenceDoc([...base(), ...closing]), 1);
    expect(f.byCode['010']).toBe(180 * M);
    expect(f.byCode['270']).toBe(25.5 * M);
  });

  test('sales returns (9040) reduce net revenue', () => {
    const f = buildIncome(referenceDoc([...base(), entry('2026-02-01', '9040', '4010', 10)]), 1);
    expect(f.byCode['010']).toBe(170 * M);
  });

  test('a loss is negative in result lines', () => {
    const f = buildIncome(referenceDoc([entry('2026-02-01', '9420', '5110', 7)]), 1);
    expect(f.byCode['270']).toBe(-7 * M);
  });

  test('entries after the quarter end are excluded', () => {
    const f = buildIncome(referenceDoc([...base(), entry('2026-05-01', '4010', '9030', 50)]), 1);
    expect(f.byCode['010']).toBe(180 * M);
  });

  test('prior-year column comes from doc.prevYear', () => {
    const doc = { ...referenceDoc(base()), prevYear: { '010': 99 * M } };
    expect(buildIncome(doc, 1).prev['010']).toBe(99 * M);
  });

  test('turnover left in transit accounts (9200) is reported', () => {
    const f = buildIncome(referenceDoc([entry('2026-02-01', '9210', '0130', 5)]), 1);
    expect(f.unmapped).toEqual(['9210']);
  });

  test('contributions list accounts behind a line', () => {
    const f = buildIncome(referenceDoc(base()), 1);
    expect(f.contrib['060']).toEqual([{ account: '9420', amount: 30 * M }]);
  });
});
