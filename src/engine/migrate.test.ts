import { produce } from 'immer';
import { describe, expect, test } from 'vitest';
import { runChecks } from './checks';
import { applyChartMigration, planChartMigration } from './migrate';
import { M, entry, referenceDoc } from './testDoc';
import { emptyDoc, type Doc } from './types';
import { parseDocFile, serializeDoc } from '../store/docFile';

/** A document written by the previous version: no chart mark. */
const oldDoc = (entries: Doc['entries']): Doc => {
  const d = referenceDoc(entries);
  delete d.chart;
  return d;
};

describe('documents from the previous chart', () => {
  test('new documents are marked as 1C-chart documents and keep the mark through a save', () => {
    expect(emptyDoc(2026).chart).toBe('1c');
    expect(parseDocFile(serializeDoc(emptyDoc(2026))).chart).toBe('1c');
    const old = JSON.parse(serializeDoc(emptyDoc(2026)));
    delete old.chart;
    expect(parseDocFile(JSON.stringify(old)).chart).toBeUndefined();
  });

  test('old interest on 9520 moves to 9530 and is interest again on the forms', () => {
    const doc = oldDoc([entry('2026-03-15', '5110', '9520', 1.5, 'Bank qoldig‘iga foiz daromadi')]);
    expect(planChartMigration(doc)).toEqual([{ from: '9520', to: '9530', count: 1 }]);
    expect(runChecks(doc, 4).forms['tax-1']['120']['3'].v).toBe(1.5 * M);
    const next = produce(doc, (d) => applyChartMigration(d));
    expect(next.entries[0].credit).toBe('9530');
    expect(next.chart).toBe('1c');
    const forms = runChecks(next, 4).forms;
    expect(forms['tax-1']['050']['3'].v).toBe(1.5 * M);
    expect(forms['tax-1']['120']['3'].v ?? 0).toBe(0);
  });

  test('the whole 95xx shift: dividends, leasing, revaluation, other financial income', () => {
    const doc = oldDoc([
      entry('2026-01-10', '5110', '9510', 1, 'Dividend'),
      entry('2026-01-11', '5110', '9530', 2, 'Lizing'),
      entry('2026-01-12', '5110', '9550', 3, 'Qayta baholash'),
      entry('2026-01-13', '5110', '9560', 4, 'Boshqa'),
    ]);
    const next = produce(doc, (d) => applyChartMigration(d));
    expect(next.entries.map((e) => e.credit)).toEqual(['9520', '9550', '9560', '9590']);
  });

  test('6410 entries move when their wording names another tax; VAT and unclear ones stay on 6410', () => {
    const doc = oldDoc([
      entry('2026-01-05', '4010', '6410', 21.6, "Sotuv bo'yicha QQS"),
      entry('2026-01-31', '6710', '6410', 3.6, 'Ish haqidan JShDS ushlandi'),
      entry('2026-03-31', '9810', '6410', 2, "Foyda solig'i hisoblandi"),
      entry('2026-04-10', '6410', '5110', 1, "Byudjetga to'landi"),
    ]);
    expect(planChartMigration(doc)).toEqual([
      { from: '6410', to: '6420.1', count: 1 },
      { from: '6410', to: '6430', count: 1 },
    ]);
    const next = produce(doc, (d) => applyChartMigration(d));
    expect(next.entries.map((e) => [e.debit, e.credit])).toEqual([
      ['4010', '6410'],
      ['6710', '6420.1'],
      ['9810', '6430'],
      ['6410', '5110'],
    ]);
    expect(runChecks(next, 4).balance.byCode['400'].end).toBe(runChecks(doc, 4).balance.byCode['400'].end);
  });

  test('automatic entries are rebuilt on the new chart instead of renamed', () => {
    const auto = { ...entry('2026-01-31', '6710', '6410.02', 1, 'JShDS'), auto: { src: 'bank:1' } };
    const doc = oldDoc([auto]);
    doc.auto = { enabled: true, inputHash: 'old' } as Doc['auto'];
    expect(planChartMigration(doc)).toEqual([]);
    const next = produce(doc, (d) => applyChartMigration(d));
    expect(next.entries[0].credit).toBe('6410.02');
    expect(next.auto!.inputHash).toBe('');
  });

  test('a document from the first days of the 1C chart (no mark yet, but new codes in its own entries) is not asked about', () => {
    const doc = oldDoc([entry('2026-01-20', '4010', '9020.1', 5, 'Sotuv'), entry('2026-03-15', '5110', '9530', 1, 'Depozit foizi')]);
    expect(planChartMigration(doc)).toEqual([]);
    const auto = { ...entry('2026-01-20', '4010', '9020.1', 5, 'Sotuv'), auto: { src: 'inv:1' } };
    expect(planChartMigration(oldDoc([auto, entry('2026-03-15', '5110', '9520', 1, 'Foiz')]))).toEqual([{ from: '9520', to: '9530', count: 1 }]);
  });

  test('a document already on the new chart is left alone', () => {
    const doc = referenceDoc([entry('2026-03-15', '5110', '9520', 1, 'Dividend')]);
    expect(doc.chart).toBe('1c');
    expect(planChartMigration(doc)).toEqual([]);
  });
});
