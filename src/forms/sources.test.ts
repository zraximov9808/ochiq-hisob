import { describe, expect, test } from 'vitest';
import { runChecks } from '../engine/checks';
import { M, entry, open, referenceDoc } from '../engine/testDoc';
import type { Doc } from '../engine/types';
import { autoAll, autoValues } from './sources';
import { evaluateAll } from './values';
import type { FormId } from './types';

/** Millions of so'm in tiyin, rounded like entry() rounds. */
const m = (x: number) => Math.round(x * M);
const auto = (id: FormId, doc: Doc) => autoValues(id, doc, 4, runChecks(doc, 4));

describe('automatic form values', () => {
  test('off-balance line 820 from account 004', () => {
    const doc = referenceDoc([entry('2026-02-10', '004.01', '0000', 5, 'Komissiyaga qabul qilingan tovar')]);
    doc.opening.push(open('001', 2));
    const v = auto('b1-offbal', doc);
    expect(v['820']).toEqual({ '3': 0, '4': m(5) });
    expect(v['790']).toEqual({ '3': m(2), '4': m(2) });
    expect(v['800']).toBeUndefined();
  });

  test('budget payments: accrued vs paid for JShDS', () => {
    const doc = referenceDoc([
      entry('2026-01-31', '9420', '6710', 10, 'Ish haqi'),
      entry('2026-01-31', '6710', '6420.1', 1.19, 'JShDS'),
      entry('2026-01-31', '6710', '6530.1', 0.01, 'INPS'),
      entry('2026-02-05', '6420.1', '5110', 1, 'JShDS to‘lovi'),
      entry('2026-02-05', '6530.1', '5110', 0.01, 'INPS to‘lovi'),
    ]);
    const v = auto('f2-budget', doc);
    expect(v['290']).toEqual({ '3': m(1.2), '4': m(1.01) });
    expect(v['291']).toEqual({ '3': m(0.01), '4': m(0.01) });
  });

  test('budget payments: VAT is due net of input VAT, penalties go to 470 not 400', () => {
    const doc = referenceDoc([
      entry('2026-03-01', '4010', '6410.1', 3, 'Sotuv QQS'),
      entry('2026-03-31', '6410.1', '4410.3', 1, 'QQS hisobga olish'),
      entry('2026-04-15', '6410.1', '5110', 1.5, 'QQS to‘lovi'),
      entry('2026-05-01', '9431.7', '6490', 0.2, 'Soliq penyasi'),
      entry('2026-05-02', '6490', '5110', 0.2, 'Penya to‘lovi'),
    ]);
    const v = auto('f2-budget', doc);
    expect(v['310']).toEqual({ '3': m(2), '4': m(1.5) });
    expect(v['470']).toEqual({ '3': m(0.2), '4': m(0.2) });
    expect(v['400']).toBeUndefined();
  });

  test('budget payments: a tax penalty paid straight from the bank is due and paid in 470', () => {
    const doc = referenceDoc([
      entry('2026-05-01', '9431.7', '5110', 0.3, 'Penya (INPS / soliqlar bo‘yicha) to‘landi'),
      entry('2026-05-02', '9431.7', '5110', 0.4, 'Yetkazib beruvchiga shartnoma bo‘yicha jarima'),
    ]);
    expect(auto('f2-budget', doc)['470']).toEqual({ '3': m(0.3), '4': m(0.3) });
  });

  test('budget payments: turnover tax on 6430 is the single tax payment (370), not profit tax', () => {
    const doc = referenceDoc([
      entry('2026-03-31', '9820', '6430', 2, 'Aylanmadan olinadigan soliq hisoblandi'),
      entry('2026-04-15', '6430', '5110', 2, 'Aylanmadan olinadigan soliq to‘landi'),
      entry('2026-12-31', '9810', '6430', 5, 'Foyda solig‘i hisoblandi'),
    ]);
    const v = auto('f2-budget', doc);
    expect(v['370']).toEqual({ '3': m(2), '4': m(2) });
    expect(v['280']).toEqual({ '3': m(5) });
  });

  test('annex 2 splits expenses into 0105, 0113, 0137', () => {
    const doc = referenceDoc([
      entry('2026-01-31', '9420', '6710', 10, 'Ish haqi'),
      entry('2026-01-31', '9420', '6510.1', 1.2, 'Ijtimoiy soliq'),
      entry('2026-02-28', '9610', '6820', 2, 'Kredit foizi'),
      entry('2026-03-10', '9431.7', '6990', 3, 'Bank xizmati'),
      entry('2026-03-20', '9120.1', '2910', 20, 'Sotilgan tovar tannarxi'),
      entry('2026-03-25', '9431.7', '6490', 0.5, 'Soliq jarimasi'),
    ]);
    const v = auto('tax-2', doc);
    expect(v['020']).toEqual({ '3': m(20) });
    expect(v['030']).toEqual({ '3': m(16.7), '4': m(0.5) });
    expect(v['0105']).toEqual({ '3': m(11.2) });
    expect(v['0107']).toEqual({ '3': m(20) });
    expect(v['0113']).toEqual({ '3': m(2) });
    expect(v['0129']).toEqual({ '3': m(0.5) });
    expect(v['01371']).toEqual({ '3': m(3) });
    const all = evaluateAll({ 'tax-2': v }, {});
    expect(all['tax-2']['010']['3'].v).toBe(m(36.7));
    expect(all['tax-2']['010']['4'].v).toBe(m(0.5));
    expect(all['tax-2']['0129']['4'].v).toBe(m(0.5));
  });

  test('annex 1 puts FX gains in 130', () => {
    const doc = referenceDoc([
      entry('2026-01-20', '4010', '9020.1', 50, 'Sotuv'),
      entry('2026-02-20', '5210', '9540', 4, 'Kurs farqi'),
      entry('2026-03-20', '5110', '9530', 1, 'Depozit foizi'),
      entry('2026-03-21', '6010', '9360', 0.7, 'Kreditorlik qarzi hisobdan chiqarildi'),
      entry('2026-03-22', '5110', '9390', 0.3, 'Boshqa daromad'),
    ]);
    const v = auto('tax-1', doc);
    expect(v['021']).toEqual({ '3': m(50) });
    expect(v['130']).toEqual({ '3': m(4) });
    expect(v['050']).toEqual({ '3': m(1) });
    expect(v['110']).toEqual({ '3': m(0.7) });
    expect(v['281']).toEqual({ '3': m(0.3) });
    expect(evaluateAll({ 'tax-1': v }, {})['tax-1']['010']['3'].v).toBe(m(56));
  });

  test('2-shakl: income and expense columns, a loss lands in the expense column', () => {
    const doc = referenceDoc([entry('2026-01-20', '4010', '9020.1', 50, 'Sotuv'), entry('2026-01-21', '9120.1', '2910', 60, 'Tannarx')]);
    doc.prevYear = { '010': m(30) };
    const v = auto('f2', doc);
    expect(v['010']).toEqual({ '3': m(30), '5': m(50) });
    expect(v['020']).toEqual({ '4': 0, '6': m(60) });
    const f2 = evaluateAll({ f2: v }, {}).f2;
    expect(f2['030']['5'].v).toBe(0);
    expect(f2['030']['6'].v).toBe(m(10));
    expect(f2['030']['3'].v).toBe(m(30));
  });

  test('balance from the books, tax rate from the settings', () => {
    const doc = referenceDoc();
    doc.taxRate = 12;
    const all = autoAll(doc, 4, runChecks(doc, 4));
    expect(all.b1!['010']).toEqual({ '3': m(50), '4': m(50) });
    expect(all.tax!['070']).toEqual({ '3': 1200 });
    expect(all.b1!['211']).toBeUndefined();
  });

  test('the whole set adds up: profit tax on the main sheet from the books', () => {
    const doc = referenceDoc([entry('2026-01-20', '4010', '9020.1', 100, 'Sotuv'), entry('2026-01-21', '9120.1', '2910', 60, 'Tannarx')]);
    const values = evaluateAll(autoAll(doc, 4, runChecks(doc, 4)), {});
    expect(values.tax['030']['3'].v).toBe(m(40));
    expect(values.tax['080']['3'].v).toBe(m(6));
    expect(values.f2['270']['5'].v).toBe(m(40));
  });
});
