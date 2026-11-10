import { expect, test } from 'vitest';
import { formatDate, periodRange } from './period';

test('quarter periods are cumulative from 1 January', () => {
  expect(periodRange(2026, 1)).toEqual({ from: '2026-01-01', to: '2026-03-31' });
  expect(periodRange(2026, 2)).toEqual({ from: '2026-01-01', to: '2026-06-30' });
  expect(periodRange(2026, 4)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
});

test('formatDate renders dd.mm.yyyy', () => {
  expect(formatDate('2026-03-05')).toBe('05.03.2026');
});
