import { expect, test } from 'vitest';
import { buildCosts } from './costing';
import { gtdItem, invoice, item, ME } from './testkit';

const opts = { companyInn: ME, includePending: false, qtyOverrides: {}, rates: {} };

test('average cost from two receipts', () => {
  const r = buildCosts([], [
    invoice('p1', '2026-07-01', false, [item('Унитаз', 10, 1_000_000)]),
    invoice('p2', '2026-07-02', false, [item('Унитаз', 10, 2_000_000)]),
    invoice('s1', '2026-07-03', true, [item('Унитаз', 5, 9_000_000)]),
  ], opts);
  expect(r.cogs.get('s1:0')).toEqual({ cost: 750_000, missingQty: 0, name: 'Унитаз' });
  expect(r.warnings).toEqual([]);
});

test('GTD line cost = value×rate + duty + fee share', () => {
  const g = [
    gtdItem('0001', '1', 'Раковина', { qty: 2, invoiceValue: 1000, duty: 100, fees: 400 }),
    gtdItem('0001', '2', 'Биде', { qty: 1, invoiceValue: 3000, duty: 300 }),
  ];
  const r = buildCosts(g, [invoice('s1', '2026-07-10', true, [item('Раковина', 1, 1), item('Биде', 1, 1)])], opts);
  expect(r.cogs.get('s1:0')!.cost).toBe(6_000_100); // (1000×12000 + 100 + 400×1/4) / 2
  expect(r.cogs.get('s1:1')!.cost).toBe(36_000_600); // 3000×12000 + 300 + 400×3/4
});

test('selling more than received → partial cost and no-cost warning', () => {
  const r = buildCosts([], [
    invoice('p1', '2026-07-01', false, [item('Унитаз', 2, 200)]),
    invoice('s1', '2026-07-03', true, [item('Унитаз', 5, 1)]),
  ], opts);
  expect(r.cogs.get('s1:0')).toEqual({ cost: 200, missingQty: 3, name: 'Унитаз' });
  expect(r.warnings).toEqual([expect.objectContaining({ kind: 'no-cost', ref: 'унитаз' })]);
});

test('sale of a product with no receipts → cost 0, missingQty = qty, no NaN', () => {
  const r = buildCosts([], [invoice('s1', '2026-07-03', true, [item('Шланг', 4, 1)])], opts);
  expect(r.cogs.get('s1:0')).toEqual({ cost: 0, missingQty: 4, name: 'Шланг' });
  expect(r.warnings.map((w) => w.kind)).toEqual(['no-cost']);
});

test('manual GTD quantity is used when the line has none', () => {
  const g = [gtdItem('0002', '1', 'Зеркало', { qty: null, invoiceValue: 100, rate: 10000 })];
  const none = buildCosts(g, [invoice('s1', '2026-07-10', true, [item('Зеркало', 1, 1)])], opts);
  expect(none.warnings.map((w) => w.kind).sort()).toEqual(['gtd-no-qty', 'no-cost']);
  const manual = buildCosts(g, [invoice('s1', '2026-07-10', true, [item('Зеркало', 1, 1)])], { ...opts, qtyOverrides: { 'gtd:0002:1': 4 } });
  expect(manual.cogs.get('s1:0')!.cost).toBe(250_000);
});

test('services and brief invoices are left out', () => {
  const r = buildCosts([], [
    invoice('s1', '2026-07-03', true, [item('Ijara', 1, 100, 0, 'Оказание услуг', 'oy')]),
    invoice('s2', '2026-07-03', true, [], { brief: true }),
  ], opts);
  expect(r.cogs.size).toBe(0);
});
