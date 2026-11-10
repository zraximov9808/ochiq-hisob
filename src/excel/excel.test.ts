import { describe, expect, test } from 'vitest';
import { runChecks } from '../engine/checks';
import { M, referenceDoc } from '../engine/testDoc';
import { parseJournalRows, parseOpeningRows } from './parse';
import { buildFormWorkbook } from './workbooks';

describe('parseJournalRows', () => {
  test('finds the header row and reads dates, accounts and amounts', () => {
    const rows = [
      ['Jurnal 2026'],
      ['Sana', 'Mazmun', 'Debet', 'Kredit', 'Summa'],
      ['05.01.2026', 'Tovar sotildi', 4010, '9020', '180 000 000'],
      [new Date(Date.UTC(2026, 0, 10)), 'Xizmat', '4010', 9030, 40000000.5],
      [46037, 'Excel sanasi', '9420', '6710', 1000],
    ];
    const r = parseJournalRows(rows);
    expect(r.errors).toEqual([]);
    expect(r.entries.map((e) => [e.date, e.debit, e.credit, e.amount])).toEqual([
      ['2026-01-05', '4010', '9020', 180 * M],
      ['2026-01-10', '4010', '9030', 4000000050],
      ['2026-01-15', '9420', '6710', 100000],
    ]);
  });

  test('reports rows it cannot read with their row number', () => {
    const r = parseJournalRows([
      ['Sana', 'Dt', 'Kt', 'Summa'],
      ['bad', '4010', '9020', 5],
    ]);
    expect(r.entries).toEqual([]);
    expect(r.errors[0]).toMatch(/2-qator/);
  });

  test('fails clearly without a recognisable header', () => {
    expect(parseJournalRows([['a', 'b']]).errors[0]).toMatch(/sarlavha/);
  });
});

describe('parseOpeningRows', () => {
  test('reads account, debit and credit balances', () => {
    const r = parseOpeningRows([
      ['Hisobvaraq', 'Debet qoldiq', 'Kredit qoldiq'],
      ['0130', 50000000, null],
      [6010, '', '40 000 000'],
    ]);
    expect(r.errors).toEqual([]);
    expect(r.opening).toEqual([
      { account: '0130', debit: 50 * 1_000_000 * 100, credit: 0 },
      { account: '6010', debit: 0, credit: 40 * 1_000_000 * 100 },
    ]);
  });
});

describe('buildFormWorkbook', () => {
  test('balance form puts line 400 in ming so‘m', async () => {
    const doc = referenceDoc();
    const wb = await buildFormWorkbook('balance', doc, 1, runChecks(doc, 1), (s) => s);
    const ws = wb.worksheets[0];
    let found: unknown[] | undefined;
    ws.eachRow((row) => {
      if (row.getCell(2).value === '400') found = [row.getCell(3).value, row.getCell(4).value];
    });
    expect(found).toEqual([250000, 250000]);
  });
});

test('excel balance totals add up from rounded lines', async () => {
  const doc = referenceDoc();
  doc.opening.push({ account: '5010', debit: 60000, credit: 0 }, { account: '5210', debit: 60000, credit: 0 }, { account: '8410', debit: 0, credit: 120000 });
  const wb = await buildFormWorkbook('balance', doc, 1, runChecks(doc, 1), (s) => s);
  const v: Record<string, unknown> = {};
  wb.worksheets[0].eachRow((row) => {
    v[String(row.getCell(2).value)] = row.getCell(3).value;
  });
  expect(v['320']).toBe(60002);
  expect(v['400']).toBe(250002);
});
