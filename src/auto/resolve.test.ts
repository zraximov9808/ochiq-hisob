import { describe, expect, test } from 'vitest';
import type { SubAccount } from '../engine/types';
import { parseExpr, resolveDrafts } from './resolve';
import type { AutoDraft } from './types';

const draft = (src: string, debit: AutoDraft['debit'], credit: AutoDraft['credit'], amount = 1000, extra: Partial<AutoDraft> = {}): AutoDraft => ({
  src, date: '2026-07-01', text: src, debit, credit, amount, ...extra,
});
const ALFA = { inn: '300000001', name: '"ALFA" MCHJ' };

describe('parseExpr', () => {
  test('recognises the four forms on chart accounts', () => {
    expect(parseExpr('9690')).toEqual({ base: '9690', kind: 'plain' });
    expect(parseExpr('6010.*')).toEqual({ base: '6010', kind: 'party' });
    expect(parseExpr('4410[QQS]')).toEqual({ base: '4410', kind: 'named', name: 'QQS' });
    expect(parseExpr('6010.05')).toEqual({ base: '6010', kind: 'sub' });
  });
  test('rejects malformed codes and codes outside the chart', () => {
    expect(parseExpr('99x')).toBeNull();
    expect(parseExpr('1234')).toBeNull();
    expect(parseExpr('6000')).toBeNull();
  });
});

describe('resolveDrafts', () => {
  test('per-party expr opens one subaccount per INN and reuses it', () => {
    const r = resolveDrafts(
      [draft('a', { expr: '6010.*', party: ALFA }, { expr: '5110' }), draft('b', { expr: '6010.*', party: { ...ALFA, name: 'Alfa' } }, { expr: '5110' })],
      [],
    );
    expect(r.added).toEqual([{ code: '6010.01', parent: '6010', name: '"ALFA" MCHJ', stir: '300000001' }]);
    expect(r.entries.map((e) => e.debit)).toEqual(['6010.01', '6010.01']);
    expect(r.entries[0]).toMatchObject({ id: 'a:a', credit: '5110', amount: 1000, auto: { src: 'a' } });
  });

  test('named expr finds an existing subaccount by name', () => {
    const subs: SubAccount[] = [{ code: '4410.03', parent: '4410', name: 'QQS' }];
    const r = resolveDrafts([draft('v', { expr: '4410[QQS]' }, { expr: '6010.*', party: ALFA })], subs);
    expect(r.entries[0].debit).toBe('4410.03');
    expect(r.added.map((s) => s.code)).toEqual(['6010.01']);
    expect(r.codeOf('4410[QQS]')).toBe('4410.03');
    expect(r.codeOf('6410[QQS]')).toBeUndefined();
  });

  test('placeholder INN 000000000 matches by name', () => {
    const subs: SubAccount[] = [{ code: '4010.07', parent: '4010', name: 'BETA MCHJ', stir: '300000002' }];
    const r = resolveDrafts([draft('p', { expr: '5110' }, { expr: '4010.*', party: { inn: '000000000', name: 'beta mchj' } })], subs);
    expect(r.entries[0].credit).toBe('4010.07');
    expect(r.added).toEqual([]);
  });

  test('bad expression is skipped with a warning', () => {
    const r = resolveDrafts([draft('x', { expr: '99x' }, { expr: '5110' }), draft('y', { expr: '1234' }, { expr: '5110' })], []);
    expect(r.entries).toEqual([]);
    expect(r.warnings.map((w) => w.kind)).toEqual(['bad-expr', 'bad-expr']);
  });

  test('penalty draft gets a non-deductible manual tax tag', () => {
    const r = resolveDrafts([draft('pen', { expr: '9430' }, { expr: '5110' }, 500, { nonDeductible: true })], []);
    expect(r.entries[0].tax).toMatchObject({ nonDeductible: true, manual: true });
  });

  test('fx sides are carried to the entry', () => {
    const r = resolveDrafts([draft('f', { expr: '6010[Xorijiy yetkazib beruvchilar (USD)]', fx: true }, { expr: '5210[USD 1]', fx: true }, 12000, { fx: { ccy: 'USD', amount: 100 } })], []);
    expect(r.entries[0]).toMatchObject({ fx: { ccy: 'USD', amount: 100 }, fxDebit: true, fxCredit: true });
  });
});
