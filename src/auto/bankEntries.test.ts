import { describe, expect, test } from 'vitest';
import type { Analysis } from '../bank/analyze';
import { FALLBACK_DEBIT } from '../bank/classify';
import type { BankAccount, Operation } from '../bank/model';
import { bankEntries, defaultAccountExpr } from './bankEntries';
import { DEFAULT_AUTO } from './defaults';

const acc = (number: string, currency = 'UZS'): BankAccount => ({
  number, balanceAcc: number.slice(0, 5), currency, company: 'NAMUNA', inn: '999000111', bankName: 'B', mfo: '00001',
  periodFrom: '2026-01-01', periodTo: '2026-12-31', openingBalance: 0, closingBalanceBank: 0, sourceFiles: ['f.xlsx'],
});
const MAIN = acc('20208000100000000001');
const USD = acc('20208840100000000001', 'USD');
const SPECIAL = acc('22613000100000000001');
let seq = 0;
const op = (o: Partial<Operation>): Operation => ({
  id: `op${++seq}`, account: MAIN.number, datetime: '2026-07-06T10:00:00', docNo: '1', korrAccount: '', korrInn: '', korrName: '', korrMfo: '',
  purpose: '', debit: 0, credit: 0, group: 'Kirim', type: '', ruleId: 'r', internal: false, runningBalance: 0, flags: [], ...o,
});
const analysis = (operations: Operation[], accounts = [MAIN, USD, SPECIAL]): Analysis => ({
  accounts, operations, duplicates: 0, checks: [], company: { name: 'NAMUNA', inn: '999000111', bankName: 'B', mfo: '', periodFrom: '', periodTo: '' },
});
const rates = { 'USD:2026-07-06': 12000 };

test('bank accounts map to 5110, 5210 per currency account and 5530 for special accounts', () => {
  expect(defaultAccountExpr(MAIN, [MAIN, USD, SPECIAL])).toBe('5110');
  expect(defaultAccountExpr(USD, [MAIN, USD])).toBe('5210[USD 20208840100000000001]');
  expect(defaultAccountExpr(SPECIAL, [MAIN, SPECIAL])).toBe('5530[22613000100000000001]');
  expect(defaultAccountExpr(MAIN, [MAIN, acc('20208000200000000002')])).toBe('5110[UZS 20208000100000000001]');
});

describe('bankEntries', () => {
  test('customer receipt: Dt 5110 Kt 4010.* with the payer as party', () => {
    const g = bankEntries(analysis([op({ type: 'Mijozdan tushum (tovar/xizmat)', credit: 500000, korrInn: '300000001', korrName: 'ALFA' })]), DEFAULT_AUTO, rates);
    expect(g.drafts).toEqual([
      expect.objectContaining({ date: '2026-07-06', amount: 500000, debit: { expr: '5110' }, credit: { expr: '4010.*', party: { inn: '300000001', name: 'ALFA' } } }),
    ]);
    expect(g.drafts[0].src).toMatch(/^bank:op\d+$/);
  });

  test('bank fee goes to 9690', () => {
    const g = bankEntries(analysis([op({ group: 'Chiqim', type: "Bank komissiyasi (to'lov o'tkazish)", debit: 1500 })]), DEFAULT_AUTO, rates);
    expect(g.drafts[0]).toMatchObject({ debit: { expr: '9690' }, credit: { expr: '5110' }, amount: 1500 });
  });

  test('internal UZS transfer both legs through 5710', () => {
    const g = bankEntries(
      analysis([
        op({ group: 'Chiqim', type: "Valyuta xaridi uchun o'tkazma (22613 ga)", debit: 7000, internal: true }),
        op({ account: SPECIAL.number, type: "Valyuta xaridi uchun mablag' (asosiy hisobdan)", credit: 7000, internal: true }),
      ]),
      DEFAULT_AUTO,
      rates,
    );
    expect(g.drafts.map((d) => [d.debit.expr, d.credit.expr])).toEqual([['5710', '5110'], ['5530[22613000100000000001]', '5710']]);
  });

  test('USD payment to foreign supplier converts at the CBU rate and tags fx', () => {
    const g = bankEntries(analysis([op({ account: USD.number, group: 'Chiqim', type: "Xorijiy yetkazib beruvchiga to'lov (import)", debit: 15000, korrName: 'SUPPLIER LTD' })]), DEFAULT_AUTO, rates);
    expect(g.drafts[0]).toMatchObject({
      amount: 180000000,
      fx: { ccy: 'USD', amount: 15000 },
      debit: { expr: '6010[Xorijiy yetkazib beruvchilar (USD)]', fx: true },
      credit: { expr: '5210[USD 20208840100000000001]', fx: true },
    });
  });

  test('no rate → no draft, rate-missing and needRates', () => {
    const g = bankEntries(analysis([op({ account: USD.number, datetime: '2026-03-01T09:00:00', type: 'Mijozdan tushum (tovar/xizmat)', credit: 100 })]), DEFAULT_AUTO, rates);
    expect(g.drafts).toEqual([]);
    expect(g.warnings.map((w) => w.kind)).toEqual(['rate-missing']);
    expect(g.needRates).toEqual([{ ccy: 'USD', date: '2026-03-01' }]);
  });

  test('charter contribution adds 4610/8330 declaration', () => {
    const g = bankEntries(analysis([op({ type: "Ustav fondiga hissa (ta'sischidan)", credit: 900, korrName: 'ISMOILOV A.' })]), DEFAULT_AUTO, rates);
    expect(g.drafts.map((d) => [d.debit.expr, d.credit.expr, d.amount])).toEqual([['5110', '4610.*', 900], ['4610.*', '8330', 900]]);
    expect(g.drafts[1].src).toMatch(/:capital$/);
    expect(g.warnings.map((w) => w.kind)).toEqual(['capital']);
    expect(bankEntries(analysis([op({ type: "Ustav fondiga hissa (ta'sischidan)", credit: 900 })]), { ...DEFAULT_AUTO, declareCapital: false }, rates).drafts).toHaveLength(1);
  });

  test('SPOT pair difference closes 5720[Valyuta xaridi] to 9430', () => {
    const g = bankEntries(
      analysis([
        op({ account: SPECIAL.number, group: 'Chiqim', type: "Valyuta xaridiga to'lov (SPOT, so'mda)", debit: 1210000000 }),
        op({ account: USD.number, type: 'Sotib olingan valyuta tushumi (SPOT)', credit: 100000 }),
      ]),
      DEFAULT_AUTO,
      rates,
    );
    const pair = g.drafts.find((d) => d.src.startsWith('pair:'))!;
    expect(pair).toMatchObject({ debit: { expr: '9430' }, credit: { expr: '5720[Valyuta xaridi]' }, amount: 10000000 });
  });

  test('unclassified outflow without INN → 4890[Aniqlanmagan to‘lovlar] + warning', () => {
    const g = bankEntries(analysis([op({ group: 'Chiqim', type: FALLBACK_DEBIT, ruleId: null, debit: 300, flags: ['UNCLASSIFIED'] })]), DEFAULT_AUTO, rates);
    expect(g.drafts[0]).toMatchObject({ debit: { expr: '4890[Aniqlanmagan to‘lovlar]' }, credit: { expr: '5110' } });
    expect(g.warnings.map((w) => w.kind)).toEqual(['unclassified']);
  });

  test('a penalty is marked non-deductible', () => {
    const g = bankEntries(analysis([op({ group: 'Soliqlar', type: "Penya (INPS / soliqlar bo'yicha)", debit: 50 })]), DEFAULT_AUTO, rates);
    expect(g.drafts[0]).toMatchObject({ debit: { expr: '9430' }, nonDeductible: true });
  });
});
