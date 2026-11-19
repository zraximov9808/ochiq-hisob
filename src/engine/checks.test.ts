import { describe, expect, test } from 'vitest';
import { runChecks } from './checks';
import { makeClosingEntries, rollToNextYear } from './closing';
import { buildIncome } from './incomeStatement';
import { buildReconciliation } from './reconciliation';
import { nextSubCode } from './subaccounts';
import { M, entry, open, referenceDoc } from './testDoc';
import { buildTrialBalance } from './trialBalance';

const sales = () => [
  entry('2026-01-05', '4010', '9020', 180),
  entry('2026-01-05', '9120', '2910', 120),
  entry('2026-01-31', '9420', '6710', 30),
];

const byId = (r: ReturnType<typeof runChecks>, id: string) => r.checks.find((c) => c.id === id)!;

describe('runChecks', () => {
  test('balanced reference data passes balance checks', () => {
    const r = runChecks(referenceDoc(sales()), 1);
    expect(byId(r, 'opening').ok).toBe(true);
    expect(byId(r, 'bal-start').ok).toBe(true);
    expect(byId(r, 'bal-end').ok).toBe(true);
    expect(byId(r, 'profit-450').ok).toBe(true);
    expect(byId(r, 'revenue').ok).toBe(true);
  });

  test('unbalanced opening balances fail the opening check', () => {
    const doc = referenceDoc();
    doc.opening.push(open('5010', 1));
    expect(byId(runChecks(doc, 1), 'opening').ok).toBe(false);
  });

  test('missing profit tax entry fails and offers Dt 9810 Kt 6430 fix', () => {
    const r = runChecks(referenceDoc(sales()), 1);
    const c = byId(r, 'tax-9810');
    expect(c.ok).toBe(false);
    expect(c.fix?.entry).toMatchObject({ debit: '9810', credit: '6430', amount: 4.5 * M, date: '2026-03-31' });
  });

  test('profit tax entry equal to the calculation passes', () => {
    const doc = referenceDoc([...sales(), entry('2026-03-31', '9810', '6410', 4.5)]);
    expect(byId(runChecks(doc, 1), 'tax-9810').ok).toBe(true);
  });

  test('revenue untagged from the tax report fails the revenue check', () => {
    const e = entry('2026-01-05', '4010', '9020', 10);
    e.tax = { line: null, manual: true };
    expect(byId(runChecks(referenceDoc([e]), 1), 'revenue').ok).toBe(false);
  });

  test('transit 9200 turnover breaks the 270 → 450 roll-forward', () => {
    const doc = referenceDoc([entry('2026-02-01', '9210', '0130', 5)]);
    expect(byId(runChecks(doc, 1), 'profit-450').ok).toBe(false);
  });

  test('warns about entries outside the year and unknown accounts', () => {
    const doc = referenceDoc([entry('2025-12-30', '2910', '6010', 1), entry('2026-02-01', '1234', '5110', 1)]);
    const ids = runChecks(doc, 1).warnings.map((w) => w.id);
    expect(ids).toContain('before-year');
    expect(ids).toContain('unknown-accounts');
  });

  test('warns at year end when P&L accounts are not closed', () => {
    const ids = runChecks(referenceDoc(sales()), 4).warnings.map((w) => w.id);
    expect(ids).toContain('unclosed-pl');
  });
});

describe('closing', () => {
  test('closing entries zero the P&L accounts and keep the net profit', () => {
    const doc = referenceDoc(sales());
    const closing = makeClosingEntries(doc);
    expect(closing.every((e) => e.closing && e.date === '2026-12-31')).toBe(true);
    const closed = { ...doc, entries: [...doc.entries, ...closing] };
    expect(buildIncome(closed, 4).byCode['270']).toBe(30 * M);
    expect(runChecks(closed, 4).warnings.map((w) => w.id)).not.toContain('unclosed-pl');
    expect(closing.at(-1)).toMatchObject({ debit: '9910', credit: '8710', amount: 30 * M });
  });

  test('rolling to the next year carries balances and prior-year figures', () => {
    const next = rollToNextYear(referenceDoc(sales()));
    expect(next.year).toBe(2027);
    expect(next.entries).toEqual([]);
    const dr = next.opening.reduce((s, o) => s + o.debit, 0);
    const cr = next.opening.reduce((s, o) => s + o.credit, 0);
    expect(dr).toBe(cr);
    expect(next.opening.some((o) => o.account.startsWith('9'))).toBe(false);
    expect(next.opening.find((o) => o.account === '8710')?.credit).toBe(30 * M);
    expect(next.prevYear['270']).toBe(30 * M);
  });

  test("values typed into last year's forms do not carry into the new year", () => {
    const doc = referenceDoc(sales());
    doc.forms = { 'tax:4': { '090': { '3': 5 * M } } };
    doc.formNames = { 'b1-overdue:4': { 'd-in.1': 'Mijoz' } };
    const next = rollToNextYear(doc);
    expect(next.forms).toBeUndefined();
    expect(next.formNames).toBeUndefined();
  });
});

describe('trial balance', () => {
  test('debit and credit totals agree for opening, turnover and closing', () => {
    const tb = buildTrialBalance(referenceDoc(sales()), 1);
    expect(tb.totals.openDr).toBe(tb.totals.openCr);
    expect(tb.totals.dr).toBe(tb.totals.cr);
    expect(tb.totals.closeDr).toBe(tb.totals.closeCr);
    expect(tb.totals.openDr).toBe(260 * M);
  });
});

describe('reconciliation act', () => {
  test('lists counterparty movements with a running balance', () => {
    const doc = referenceDoc([
      entry('2026-02-02', '2910.01', '6010.05', 60, 'Menatdan tovar'),
      entry('2026-02-10', '6010.05', '5110', 35, 'Menatga to‘lov'),
    ]);
    const r = buildReconciliation(doc, ['6010.05'], 1);
    expect(r.opening).toBe(0);
    expect(r.rows.map((x) => x.balance)).toEqual([-60 * M, -25 * M]);
    expect(r.turnoverDr).toBe(35 * M);
    expect(r.turnoverCr).toBe(60 * M);
    expect(r.closing).toBe(-25 * M);
  });
});

describe('nextSubCode', () => {
  const subs = [
    { code: '6010.01', parent: '6010', name: 'Alfa' },
    { code: '6010.05', parent: '6010', name: '“Menat” MChJ', stir: '301111111' },
  ];
  test('reuses the counterparty number from another account when free', () => {
    expect(nextSubCode('4310', '“Menat” MChJ', '301111111', subs)).toBe('4310.05');
  });
  test('otherwise takes the next free number', () => {
    expect(nextSubCode('6010', 'Beta', '', subs)).toBe('6010.06');
    expect(nextSubCode('2910', 'Oziq-ovqat', '', subs)).toBe('2910.01');
  });
});

describe('checks follow the forms being filed', () => {
  test('profit tax check and its fix use the form 150 (dividends are taxed at source, not in the base)', () => {
    const doc = referenceDoc([...sales(), entry('2026-02-01', '5110', '9520', 10, 'Dividend olindi')]);
    const r = runChecks(doc, 4);
    expect(r.forms.tax['150']['3'].v).toBe(4.5 * M);
    const c = r.checks.find((x) => x.id === 'tax-9810')!;
    expect(c.ok).toBe(false);
    expect(c.fix!.entry.amount).toBe(4.5 * M);
  });

  test('a typed value that unbalances the filed balance is flagged', () => {
    const doc = referenceDoc(sales());
    expect(runChecks(doc, 4).checks.find((x) => x.id === 'form-bal')!.ok).toBe(true);
    doc.forms = { 'b1:4': { '010': { '4': 999 * M } } };
    expect(runChecks(doc, 4).checks.find((x) => x.id === 'form-bal')!.ok).toBe(false);
  });
});
