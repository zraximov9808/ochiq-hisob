// Regression tests for the findings of the final review (C = critical, I = important).
import { describe, expect, test } from 'vitest';
import { emptyDoc, type Entry } from '../engine/types';
import type { GtdItem } from '../stock/gtd';
import { autoSettings } from './apply';
import { bankEntries } from './bankEntries';
import { buildAuto, shouldApply, tryBuildAuto, type AutoInput } from './build';
import { DEFAULT_AUTO, FOREIGN_BASE } from './defaults';
import { gtdEntries } from './gtdEntries';
import { invoiceEntries } from './invoiceEntries';
import { rateOn } from './rates';
import { resolveDrafts } from './resolve';
import { analysisOf, bankAcc, bankOp, gtdItem, invoice, item, ME, SPECIAL_ACC, USD_ACC, MAIN_ACC } from './testkit';

const input = (over: Partial<AutoInput> = {}): AutoInput => ({
  analysis: null, invoices: [], gtd: [], stockQty: {}, rates: {}, settings: DEFAULT_AUTO, companyInn: ME, opening: [], manualEntries: [], year: 2026, company: null, ...over,
});

describe('C1 old stored data does not crash the build', () => {
  test('a GTD row saved before value columns existed', () => {
    const old = { ...gtdItem('0001', '1', 'X', { qty: 2 }) } as Partial<GtdItem>;
    delete old.currency;
    delete old.rate;
    expect(() => rateOn({}, undefined as unknown as string, '2026-07-01')).not.toThrow();
    expect(() => tryBuildAuto(input({ gtd: [{ ...old, invoiceValue: 100 } as GtdItem] }), [])).not.toThrow();
  });
  test('an unexpected error becomes a warning instead of a crash', () => {
    const bad = invoice('s1', '2026-07-03', true, [item('X', 1, 100)]);
    (bad as { items: unknown }).items = 'oops';
    const b = tryBuildAuto(input({ invoices: [bad] }), []);
    expect(b.entries).toEqual([]);
    expect(b.warnings.map((w) => w.kind)).toEqual(['error']);
  });
});

describe('C2 bad dates', () => {
  test('a draft without a valid date is dropped with a warning', () => {
    const r = resolveDrafts([{ src: 'x', date: '', text: 'GTD № 1', debit: { expr: '2910' }, credit: { expr: '6010' }, amount: 10 }], []);
    expect(r.entries).toEqual([]);
    expect(r.warnings.map((w) => w.kind)).toEqual(['bad-date']);
  });
  test('a GTD row with a value but no date builds without throwing', () => {
    const g = gtdItem('0002', '1', 'X', { date: '', invoiceValue: 100, qty: 1 });
    const b = buildAuto(input({ gtd: [g] }), []);
    expect(b.warnings.map((w) => w.kind)).toContain('bad-date');
  });
  test('rateOn with an empty date is null, not an exception', () => {
    expect(rateOn({ 'USD:2026-07-01': 1 }, 'USD', '')).toBeNull();
  });
});

describe('C3 documents and data that do not belong together', () => {
  test('data of another company is not applied', () => {
    const inv = invoice('s1', '2026-07-03', true, [item('X', 1, 100)]);
    const b = buildAuto(input({ invoices: [inv], docCompanyInn: '111111111' }), []);
    expect(b.entries).toEqual([]);
    expect(b.warnings.map((w) => w.kind)).toEqual(['company']);
  });
  test('apply only when there is data, it belongs to the document and something changed', () => {
    const base = { enabled: true, hasData: true, hash: 'b', inputHash: 'a', company: false };
    expect(shouldApply(base)).toBe(true);
    expect(shouldApply({ ...base, hasData: false })).toBe(false);
    expect(shouldApply({ ...base, company: true })).toBe(false);
    expect(shouldApply({ ...base, enabled: false })).toBe(false);
    expect(shouldApply({ ...base, hash: 'a' })).toBe(false);
  });
  test('a document saved before this version is not filled automatically unless it is empty', () => {
    const manual: Entry = { id: 'm', date: '2026-01-02', text: '', debit: '5110', credit: '8330', amount: 1 };
    expect(autoSettings({ ...emptyDoc(2026), entries: [manual] }).enabled).toBe(false);
    expect(autoSettings(emptyDoc(2026)).enabled).toBe(true);
  });
});

test('C4 a currency leg skipped for a missing rate does not shift SPOT pairing', () => {
  const g = bankEntries(
    analysisOf([
      bankOp({ account: SPECIAL_ACC.number, group: 'Chiqim', type: "Valyuta xaridiga to'lov (SPOT, so'mda)", debit: 1_210_000_000, datetime: '2026-03-01T09:00:00' }),
      bankOp({ account: USD_ACC.number, type: 'Sotib olingan valyuta tushumi (SPOT)', credit: 100_000, datetime: '2026-03-01T10:00:00' }),
      bankOp({ account: SPECIAL_ACC.number, group: 'Chiqim', type: "Valyuta xaridiga to'lov (SPOT, so'mda)", debit: 60_500_000 }),
      bankOp({ account: USD_ACC.number, type: 'Sotib olingan valyuta tushumi (SPOT)', credit: 5_000 }),
    ]),
    DEFAULT_AUTO,
    { 'USD:2026-07-06': 12000 },
  );
  expect(g.drafts.filter((d) => d.src.startsWith('pair:'))).toEqual([]);
});

describe('I3 month-end works on what is actually in the journal', () => {
  const invs = [
    invoice('p1', '2026-07-05', false, [item('X', 1, 2500, 300)]),
    invoice('s1', '2026-07-10', true, [item('Y', 1, 4000, 500)]),
    invoice('s2', '2026-08-02', true, [item('Z', 1, 10)]),
  ];
  const offset = (b: ReturnType<typeof buildAuto>) => b.entries.find((e) => e.auto!.src === 'vat:2026-07')?.amount ?? 0;
  test('a deleted purchase VAT entry is not offset', () => {
    expect(offset(buildAuto(input({ invoices: invs }), []))).toBe(300);
    expect(offset(buildAuto(input({ invoices: invs, settings: { ...DEFAULT_AUTO, skip: ['inv:p1:vat'] } }), []))).toBe(0);
  });
  test('a hand-edited VAT entry is offset with its edited amount', () => {
    const edited: Entry = { id: 'a:inv:p1:vat', date: '2026-07-05', text: '', debit: '4410.01', credit: '6010.01', amount: 100, auto: { src: 'inv:p1:vat', edited: true } };
    const subs = [{ code: '4410.01', parent: '4410', name: 'QQS' }, { code: '6010.01', parent: '6010', name: '"ALFA" MCHJ', stir: '300000001' }];
    expect(offset(buildAuto(input({ invoices: invs, editedEntries: [edited] }), subs))).toBe(100);
  });
});

test('I4 a rate from an earlier day is used but the exact day is requested and reported', () => {
  const g = bankEntries(analysisOf([bankOp({ account: USD_ACC.number, type: 'Mijozdan tushum (tovar/xizmat)', credit: 100, korrInn: '300000001' })]), DEFAULT_AUTO, { 'USD:2026-07-03': 12000 });
  expect(g.drafts[0].amount).toBe(1_200_000);
  expect(g.needRates).toEqual([{ ccy: 'USD', date: '2026-07-06' }]);
  expect(g.warnings.map((w) => w.kind)).toEqual(['rate-approx']);
});

test('I5 a GTD without currency is not treated as USD', () => {
  const g = gtdEntries([gtdItem('0003', '1', 'X', { currency: '', invoiceValue: 1000, rate: 150 })], {});
  const value = g.drafts.find((d) => d.src === 'gtd:0003:value')!;
  expect(value).toMatchObject({ amount: 150_000, credit: { expr: FOREIGN_BASE } });
  expect(value.fx).toBeUndefined();
  expect(value.credit.fx).toBeUndefined();
  expect(g.warnings.map((w) => w.kind)).toEqual(['gtd-no-currency']);
});

test('I7 counterparties with the same name but different INNs get separate subaccounts', () => {
  const d = (src: string, inn: string) => ({ src, date: '2026-07-01', text: '', debit: { expr: '5110' }, credit: { expr: '4010.*', party: { inn, name: 'ISMOILOV A.' } }, amount: 1 });
  const r = resolveDrafts([d('a', '300000001'), d('b', '300000002')], []);
  expect(r.entries.map((e) => e.credit)).toEqual(['4010.01', '4010.02']);
});

test('I8 combined tax payments are split by purpose so VAT meets VAT', () => {
  const type = "QQS / Foyda solig'i / Mol-mulk solig'i";
  const g = bankEntries(
    analysisOf([
      bankOp({ group: 'Soliqlar', type, debit: 1, purpose: 'Налог на добавленную стоимость (НДС) за июль' }),
      bankOp({ group: 'Soliqlar', type, debit: 1, purpose: 'Налог на прибыль юридических лиц' }),
      bankOp({ group: 'Soliqlar', type, debit: 1, purpose: 'Налог на имущество' }),
    ]),
    DEFAULT_AUTO,
    {},
  );
  expect(g.drafts.map((x) => x.debit.expr)).toEqual(['6410[QQS]', '6410[Foyda solig‘i]', '6410[Mol-mulk solig‘i]']);
});

test('I9 a currency account with an opening balance is reported', () => {
  const usd = { ...bankAcc('20208840100000000009', 'USD'), openingBalance: 500 };
  const b = buildAuto(input({ analysis: analysisOf([], [MAIN_ACC, usd]) }), []);
  expect(b.warnings.map((w) => w.kind)).toContain('fx-opening');
});

test('I10 a negative (correcting) invoice is reported, not silently dropped', () => {
  const g = invoiceEntries([invoice('c1', '2026-07-03', true, [item('X', 1, -500, -60)])], { companyInn: ME, s: DEFAULT_AUTO, cogs: new Map() });
  expect(g.drafts).toEqual([]);
  expect(g.warnings.map((w) => w.kind)).toEqual(['negative']);
});
