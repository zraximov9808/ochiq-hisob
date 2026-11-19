import { describe, expect, test } from 'vitest';
import { runChecks } from '../engine/checks';
import { M, entry, referenceDoc } from '../engine/testDoc';
import { setFormValue } from '../forms/values';
import { toCyrillic } from '../i18n/translit';
import { buildFormsWorkbook } from './formWorkbook';
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

describe('buildFormsWorkbook', () => {
  const codesOf = (ws: import('exceljs').Worksheet) => {
    const v: Record<string, unknown[]> = {};
    ws.eachRow((row) => {
      const code = row.getCell(2).value;
      if (typeof code === 'string' && /^\d{3,5}$/.test(code)) v[code] = Array.from({ length: ws.columnCount - 2 }, (_, i) => row.getCell(i + 3).value ?? null);
    });
    return v;
  };

  test('tax workbook has the main form and 14 annex sheets with codes', async () => {
    const doc = referenceDoc([entry('2026-01-20', '4010', '9020.1', 100, 'Sotuv'), entry('2026-01-21', '9120.1', '2910', 60, 'Tannarx')]);
    const wb = await buildFormsWorkbook('tax', doc, 4, runChecks(doc, 4), (s) => s);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Foyda solig‘i', '1-ilova', '2-ilova', '2.1-ilova', '2.1(a)-ilova', '2.1(b)-ilova', '3-ilova', '4-ilova', '5-ilova', '6-ilova', '7-ilova', '8-ilova', '9-ilova', '10-ilova', '11-ilova',
    ]);
    const main = codesOf(wb.worksheets[0]);
    expect(main['030']).toEqual([40_000_000]);
    expect(main['080']).toEqual([6_000_000]);
    expect(main['070']).toEqual([15]);
    expect(Object.keys(codesOf(wb.worksheets[2]))).toEqual(expect.arrayContaining(['0101', '0137', '01378']));
    expect(codesOf(wb.worksheets[6])['020']).toEqual([null]);
  });

  test('balance workbook has 3 sheets and 400 = 780', async () => {
    const doc = referenceDoc();
    const wb = await buildFormsWorkbook('balance', doc, 1, runChecks(doc, 1), (s) => s);
    expect(wb.worksheets).toHaveLength(3);
    const b1 = codesOf(wb.worksheets[0]);
    expect(b1['400']).toEqual([250_000, 250_000]);
    expect(b1['780']).toEqual(b1['400']);
    expect(codesOf(wb.worksheets[1])['790']).toEqual([null, null]);
  });

  test('closed cells print x, typed values show, Cyrillic sheet names', async () => {
    const doc = referenceDoc();
    setFormValue(doc, 'f2-budget', 1, '280', '3', 5 * M);
    const wb = await buildFormsWorkbook('income', doc, 1, runChecks(doc, 1), (s) => toCyrillic(s));
    expect(wb.worksheets.map((w) => w.name)).toEqual(['2-шакл', '2-шакл бюджет']);
    expect(codesOf(wb.worksheets[0])['010']).toEqual([null, 'x', null, 'x']);
    expect(codesOf(wb.worksheets[1])['280']).toEqual([5_000, null]);
  });
});
