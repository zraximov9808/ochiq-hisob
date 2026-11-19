import { describe, expect, test } from 'vitest';
import type { Entry } from '../engine/types';
import { buildAuto, type AutoInput } from './build';
import { DEFAULT_AUTO } from './defaults';
import { autoInputHash } from './hash';
import { monthEndDrafts } from './monthEnd';
import type { ResolvedEntry } from './resolve';
import { analysisOf, bankOp, invoice, item, ME } from './testkit';

const e = (date: string, debit: string, credit: string, amount: number, extra: Partial<ResolvedEntry> = {}): ResolvedEntry => ({
  id: `a:${date}:${debit}:${credit}`, date, text: '', debit, credit, amount, auto: { src: `${date}${debit}${credit}` }, ...extra,
});
const codeOf = (x: string) => x;

describe('monthEndDrafts', () => {
  test('month-end VAT offset takes the smaller balance', () => {
    const g = monthEndDrafts([e('2026-07-05', '4410.3', '6010.01', 200), e('2026-07-06', '4410.4', '6010.01', 100), e('2026-07-10', '4010.01', '6410.1', 250), e('2026-08-02', '5110', '4010.01', 1)], {}, codeOf);
    expect(g.drafts).toEqual([
      expect.objectContaining({ src: 'vat:2026-07:4410.3', date: '2026-07-31', debit: { expr: '6410.1' }, credit: { expr: '4410.3' }, amount: 200 }),
      expect.objectContaining({ src: 'vat:2026-07:4410.4', debit: { expr: '6410.1' }, credit: { expr: '4410.4' }, amount: 50 }),
    ]);
  });

  test('revaluation posts 9540 gain on a USD account when the rate rises', () => {
    const rates = { 'USD:2026-07-31': 12100, 'USD:2026-08-05': 12100 };
    const g = monthEndDrafts(
      [e('2026-07-06', '5210.01', '4610.01', 120_000_000, { fx: { ccy: 'USD', amount: 10_000 }, fxDebit: true }), e('2026-08-05', '5110', '4010.01', 1)],
      rates,
      codeOf,
    );
    expect(g.drafts).toEqual([expect.objectContaining({ src: 'reval:5210.01:USD:2026-07', date: '2026-07-31', debit: { expr: '5210.01' }, credit: { expr: '9540' }, amount: 1_000_000 })]);
  });

  test('a missing month-end rate asks for it instead of guessing', () => {
    const g = monthEndDrafts([e('2026-07-06', '5210.01', '4610.01', 120_000_000, { fx: { ccy: 'USD', amount: 10_000 }, fxDebit: true })], {}, codeOf);
    expect(g.drafts).toEqual([]);
    expect(g.needRates).toEqual([{ ccy: 'USD', date: '2026-07-06' }]);
  });
});

const input = (over: Partial<AutoInput> = {}): AutoInput => ({
  analysis: null, invoices: [], gtd: [], stockQty: {}, rates: {}, settings: DEFAULT_AUTO, companyInn: ME, opening: [], manualEntries: [], year: 2026, company: null, ...over,
});

describe('buildAuto', () => {
  test('same invoice once even if passed twice', () => {
    const inv = invoice('s1', '2026-07-03', true, [item('Унитаз', 1, 1000, 120)]);
    const b = buildAuto(input({ invoices: [inv, inv] }), []);
    const srcs = b.entries.map((x) => x.auto!.src);
    expect(srcs.filter((s) => s.startsWith('inv:'))).toEqual(['inv:s1:goods', 'inv:s1:vat']);
  });

  test('payroll warning when JShDS is paid without 6710 accrual', () => {
    const a = analysisOf([bankOp({ group: 'Soliqlar', type: 'JShDS (ish haqidan)', debit: 1200 })]);
    expect(buildAuto(input({ analysis: a }), []).warnings.map((w) => w.kind)).toContain('payroll');
    const accrued: Entry = { id: 'm1', date: '2026-07-01', text: 'Ish haqi', debit: '9420', credit: '6710', amount: 10000 };
    expect(buildAuto(input({ analysis: a, manualEntries: [accrued] }), []).warnings.map((w) => w.kind)).not.toContain('payroll');
  });

  test('declareCapital off when opening has 8330', () => {
    const a = analysisOf([bankOp({ type: "Ustav fondiga hissa (ta'sischidan)", credit: 900, korrName: 'ISMOILOV A.' })]);
    expect(buildAuto(input({ analysis: a }), []).entries.some((x) => x.credit === '8330')).toBe(true);
    expect(buildAuto(input({ analysis: a, opening: [{ account: '8330', debit: 0, credit: 900 }] }), []).entries.some((x) => x.credit === '8330')).toBe(false);
  });

  test('manual entries on bank accounts in the same period give a manual-overlap warning', () => {
    const a = analysisOf([bankOp({ type: 'Mijozdan tushum (tovar/xizmat)', credit: 500, korrInn: '300000001', korrName: 'ALFA' })]);
    const manual: Entry = { id: 'm1', date: '2026-07-06', text: 'Tushum', debit: '5110', credit: '4010', amount: 500 };
    expect(buildAuto(input({ analysis: a, manualEntries: [manual] }), []).warnings.map((w) => w.kind)).toContain('manual-overlap');
  });

  test('entries outside the document year are reported', () => {
    const inv = invoice('s1', '2025-12-30', true, [item('Унитаз', 1, 1000)]);
    expect(buildAuto(input({ invoices: [inv] }), []).warnings.map((w) => w.kind)).toContain('year');
  });

  test('an unpaired internal transfer leaves 5710 open and is reported', () => {
    const a = analysisOf([bankOp({ group: 'Chiqim', type: "Valyuta xaridi uchun o'tkazma (22613 ga)", debit: 7000, internal: true })]);
    const b = buildAuto(input({ analysis: a }), []);
    expect(b.warnings).toContainEqual(expect.objectContaining({ kind: 'transit', amount: 7000 }));
  });
});

test('input hash is stable and changes with the input', () => {
  expect(autoInputHash({ a: 1 })).toBe(autoInputHash({ a: 1 }));
  expect(autoInputHash({ a: 1 })).not.toBe(autoInputHash({ a: 2 }));
});
