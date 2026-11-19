import { expect, test } from 'vitest';
import { DEFAULT_AUTO } from './defaults';
import { gtdEntries } from './gtdEntries';
import { invoiceEntries } from './invoiceEntries';
import { gtdItem, invoice, item, ME } from './testkit';

const ALFA = { inn: '300000001', name: '"ALFA" MCHJ' };
const run = (invoices: Parameters<typeof invoiceEntries>[0], s = DEFAULT_AUTO, cogs = new Map<string, { cost: number }>()) =>
  invoiceEntries(invoices, { companyInn: ME, s, cogs });
const sides = (g: ReturnType<typeof run>) => g.drafts.map((d) => [d.src, d.debit.expr, d.credit.expr, d.amount]);

test('sale with goods and VAT → 4010.*/9020.1 and 4010.*/6410.1 plus COGS', () => {
  const g = run([invoice('s1', '2026-07-03', true, [item('Унитаз', 5, 1000, 120), item('Монтаж', 1, 200, 24, 'Оказание услуг', 'услуга')])], DEFAULT_AUTO, new Map([['s1:0', { cost: 700 }]]));
  expect(sides(g)).toEqual([
    ['inv:s1:goods', '4010.*', '9020.1', 1000],
    ['inv:s1:services', '4010.*', '9030.1', 200],
    ['inv:s1:vat', '4010.*', '6410.1', 144],
    ['inv:s1:cogs', '9120.1', '2910', 700],
  ]);
  expect(g.drafts[0].debit.party).toEqual(ALFA);
  expect(g.drafts[0].text).toBe('Faktura № s1 — "ALFA" MCHJ');
});

test('purchase of services uses the per-supplier account', () => {
  const inv = invoice('p1', '2026-07-01', false, [item('Брокер', 1, 500, 60, 'Оказание услуг', 'услуга'), item('Раковина', 2, 300, 36)]);
  expect(sides(run([inv]))).toEqual([
    ['inv:p1:goods', '2910', '6010.*', 300],
    ['inv:p1:services', '9420', '6010.*', 500],
    ['inv:p1:vat', '4410.3', '6010.*', 36],
    ['inv:p1:vat-s', '4410.4', '6010.*', 60],
  ]);
  expect(sides(run([inv], { ...DEFAULT_AUTO, services: { '300000001': '2910' } }))[1]).toEqual(['inv:p1:services', '2910', '6010.*', 500]);
});

test('pending invoice ignored unless includePending', () => {
  const inv = invoice('s1', '2026-07-03', true, [item('Унитаз', 1, 100)], { status: 'Ожидает' });
  expect(run([inv]).drafts).toEqual([]);
  expect(run([inv], { ...DEFAULT_AUTO, includePending: true }).drafts).toHaveLength(1);
});

test('brief sale splits 12/112 VAT and warns', () => {
  const g = run([invoice('s9', '2026-11-01', true, [], { brief: true, amount: 112_000, vat: 0, total: 112_000 })]);
  expect(sides(g)).toEqual([
    ['inv:s9:goods', '4010.*', '9020.1', 100_000],
    ['inv:s9:vat', '4010.*', '6410.1', 12_000],
  ]);
  expect(g.warnings.map((w) => w.kind)).toEqual(['brief-invoice']);
});

test('brief purchase uses the supplier profile', () => {
  const detailed = invoice('p1', '2026-07-01', false, [item('Раковина', 1, 750, 90), item('Доставка', 1, 250, 30, 'Оказание услуг', 'услуга')]);
  const brief = invoice('p2', '2026-11-01', false, [], { brief: true, amount: 2240, vat: 0, total: 2240 });
  expect(sides(run([detailed, brief])).filter((r) => String(r[0]).startsWith('inv:p2'))).toEqual([
    ['inv:p2:goods', '2910', '6010.*', 1500],
    ['inv:p2:services', '9420', '6010.*', 500],
    ['inv:p2:vat', '4410.3', '6010.*', 180],
    ['inv:p2:vat-s', '4410.4', '6010.*', 60],
  ]);
  const unknown = run([invoice('p3', '2026-11-01', false, [], { brief: true, sellerInn: '300000009', amount: 50, total: 50 })]);
  expect(sides(unknown)).toEqual([['inv:p3:services', '9420', '6010.*', 50]]);
});

test('GTD value, duty and import VAT entries with fx on the foreign pool', () => {
  const g = gtdEntries(
    [
      gtdItem('0001', '1', 'Раковина', { invoiceValue: 1000, fees: 400, duty: 100, importVat: 50 }),
      gtdItem('0001', '2', 'Биде', { invoiceValue: 3000, duty: 300, importVat: 150 }),
    ],
    {},
  );
  expect(g.drafts.map((d) => [d.src, d.debit.expr, d.credit.expr, d.amount])).toEqual([
    ['gtd:0001:value', '2910', '6015[Xorijiy yetkazib beruvchilar (USD)]', 48_000_000],
    ['gtd:0001:duty', '2910', '4490', 800],
    ['gtd:0001:vat', '4410.5', '4490', 200],
  ]);
  expect(g.drafts[0]).toMatchObject({ fx: { ccy: 'USD', amount: 4000 }, credit: { fx: true }, date: '2026-07-06' });
});

test('GTD without value columns or rate gives a warning instead of entries', () => {
  expect(gtdEntries([gtdItem('0002', '1', 'X')], {}).warnings.map((w) => w.kind)).toEqual(['gtd-no-value']);
  const noRate = gtdEntries([gtdItem('0003', '1', 'X', { invoiceValue: 10, rate: null })], {});
  expect(noRate.drafts).toEqual([]);
  expect(noRate.needRates).toEqual([{ ccy: 'USD', date: '2026-07-06' }]);
});
