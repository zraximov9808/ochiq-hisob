import { describe, expect, test } from 'vitest';
import { findAccount, isKnownAccount } from './accounts';
import { buildLedger } from './ledger';
import { M, entry, referenceDoc } from './testDoc';

describe('findAccount', () => {
  test('finds a synthetic account by code', () => {
    expect(findAccount('5110')?.name).toBe('Hisob-kitob hisobvaragʻi');
  });
  test('resolves a subaccount code to the subaccount with its parent', () => {
    const subs = [{ code: '6010.05', parent: '6010', name: '“Menat” MChJ', stir: '301111111' }];
    const acc = findAccount('6010.05', subs);
    expect(acc?.name).toBe('“Menat” MChJ');
    expect(acc?.parent).toBe('6010');
  });
  test('unknown subaccount suffix falls back to the parent name but is not "known"', () => {
    expect(findAccount('6010.99')?.parent).toBe('6010');
    expect(isKnownAccount('6010.99', [])).toBe(false);
    expect(isKnownAccount('1234', [])).toBe(false);
    expect(isKnownAccount('6010', [])).toBe(true);
  });
});

describe('buildLedger', () => {
  test('carries opening balance and turnovers to closing net balance', () => {
    const doc = referenceDoc([entry('2026-01-20', '6010', '5110', 80)]);
    const l = buildLedger(doc, '2026-01-01', '2026-03-31');
    expect(l.get('5110')).toEqual({ open: 60 * M, dr: 0, cr: 80 * M, close: -20 * M });
    expect(l.get('6010')?.close).toBe(40 * M);
  });
  test('entries before the period start roll into the opening balance', () => {
    const doc = referenceDoc([entry('2026-02-10', '6010', '5110', 10), entry('2026-05-10', '6010', '5110', 5)]);
    const l = buildLedger(doc, '2026-04-01', '2026-06-30');
    expect(l.get('5110')).toEqual({ open: 50 * M, dr: 0, cr: 5 * M, close: 45 * M });
  });
  test('entries outside the document year are ignored', () => {
    const doc = referenceDoc([entry('2025-12-31', '6010', '5110', 10), entry('2027-01-01', '6010', '5110', 10)]);
    const l = buildLedger(doc, '2026-01-01', '2026-12-31');
    expect(l.get('5110')?.close).toBe(60 * M);
  });
  test('subaccounts keep their own leaf rows', () => {
    const doc = referenceDoc([entry('2026-02-02', '2910', '6010.05', 60)]);
    const l = buildLedger(doc, '2026-01-01', '2026-12-31');
    expect(l.get('6010.05')?.close).toBe(-60 * M);
    expect(l.get('6010')?.close).toBe(-40 * M);
  });
});
