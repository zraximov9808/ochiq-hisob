import { expect, test } from 'vitest';
import { fmtMoney } from './format';

test('bank money format: spaces, comma decimals, brackets for negatives, dash for zero', () => {
  expect(fmtMoney(123456789)).toBe('1 234 567,89');
  expect(fmtMoney(-100000)).toBe('(1 000,00)');
  expect(fmtMoney(0)).toBe('–');
  expect(fmtMoney(35)).toBe('0,35');
});
