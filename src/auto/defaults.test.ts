import { expect, test } from 'vitest';
import { FALLBACK_CREDIT, FALLBACK_DEBIT } from '../bank/classify';
import { DEFAULT_RULES } from '../bank/rules/defaultRules';
import { DEFAULT_TYPE_ACCOUNTS, FOREIGN_POOL } from './defaults';
import { parseExpr } from './resolve';

test('every built-in bank operation type has a default account', () => {
  const types = new Set([...DEFAULT_RULES.map((r) => r.type), FALLBACK_CREDIT, FALLBACK_DEBIT]);
  const missing = [...types].filter((t) => !(t in DEFAULT_TYPE_ACCOUNTS));
  expect(missing).toEqual([]);
});

test('every default account expression is valid', () => {
  const bad = Object.values(DEFAULT_TYPE_ACCOUNTS).filter((e) => !parseExpr(e));
  expect(bad).toEqual([]);
  expect(parseExpr(FOREIGN_POOL('USD'))).toMatchObject({ base: '6015', kind: 'named' });
});
