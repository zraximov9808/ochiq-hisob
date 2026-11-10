import { expect, test } from 'vitest';
import { isKnownAccount } from './accounts';
import { runChecks } from './checks';
import { sampleDoc } from './sample';

test('sample data uses only known accounts and ties out except the profit tax entry', () => {
  const doc = sampleDoc(2026);
  for (const e of doc.entries) {
    expect(isKnownAccount(e.debit, doc.subaccounts)).toBe(true);
    expect(isKnownAccount(e.credit, doc.subaccounts)).toBe(true);
  }
  const r = runChecks(doc, 1);
  const failing = r.checks.filter((c) => !c.ok).map((c) => c.id);
  expect(failing).toEqual(['tax-9810']);
  expect(r.warnings.map((w) => w.id)).toEqual(['non-deductible']);
});

test('applying the suggested tax fix makes every check pass', () => {
  const doc = sampleDoc(2026);
  const fix = runChecks(doc, 1).checks.find((c) => c.id === 'tax-9810')!.fix!;
  doc.entries.push({ id: 'fix', ...fix.entry });
  expect(runChecks(doc, 1).checks.every((c) => c.ok)).toBe(true);
});
