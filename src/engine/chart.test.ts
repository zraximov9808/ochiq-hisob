import { expect, test } from 'vitest';
import { CHART, findAccount } from './accounts';

test('chart has the 1C accounts with kinds and currency flags', () => {
  expect(CHART).toHaveLength(758);
  expect(findAccount('4410.3')).toMatchObject({ kind: 'A', name: expect.stringMatching(/QQS/) });
  expect(findAccount('6015')?.currency).toBe(true);
  expect(findAccount('003.10')?.offBalance).toBe(true);
  expect(findAccount('9910')?.kind).toBe('T');
  expect(findAccount('0191')?.kind).toBe('KA');
});

test('no Cyrillic letters in Uzbek names', () => {
  expect(CHART.filter((a) => /[а-яё]/i.test(a.name)).map((a) => a.code)).toEqual([]);
});

test('Russian name kept', () => {
  expect(findAccount('6010')?.nameRu).toBe('Расчеты с поставщиками и подрядчиками');
});
