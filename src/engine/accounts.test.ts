import { describe, expect, test } from 'vitest';
import { findAccount, isChartCode, isKnownAccount, isOffBalance, searchAccounts } from './accounts';
import { balanceLineFor } from './balanceSheet';
import { nextSubCode } from './subaccounts';

describe('accounts on the 1C chart', () => {
  test('dotted chart codes are chart accounts, not subaccounts', () => {
    expect(findAccount('6410.1')).toMatchObject({ parent: '6410', nameRu: expect.stringContaining('добавленную') });
    expect(isKnownAccount('6410.1', [])).toBe(true);
    expect(isKnownAccount('6400', [])).toBe(false);
  });

  test('a counterparty subaccount never takes a chart code', () => {
    const code = nextSubCode('004', 'X', '', []);
    expect(code).not.toBe('004.01');
    expect(isChartCode(code)).toBe(false);
  });

  test('old document codes missing in the new chart stay usable', () => {
    expect(isKnownAccount('5720.01', [{ code: '5720.01', parent: '5720', name: 'X' }])).toBe(true);
    expect(balanceLineFor('5720.01', 100)).toBe('360');
    expect(balanceLineFor('6410', -100)).toBe('680');
  });

  test('search finds by code, Uzbek and Russian name', () => {
    expect(searchAccounts('поставщик', []).map((a) => a.code)).toContain('6010');
    expect(searchAccounts('4410', []).map((a) => a.code)).toContain('4410.5');
    expect(searchAccounts('kassa', []).map((a) => a.code)).toContain('5010');
    expect(searchAccounts('alfa', [{ code: '4010.01', parent: '4010', name: 'ALFA MCHJ' }]).map((a) => a.code)).toEqual(['4010.01']);
  });

  test('off-balance: 3-digit, dotted 3-digit and 1C service accounts', () => {
    expect(isOffBalance('003.10')).toBe(true);
    expect(isOffBalance('НЕ.01')).toBe(true);
    expect(isOffBalance('4410.3')).toBe(false);
  });
});
