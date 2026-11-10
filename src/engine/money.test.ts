import { describe, expect, test } from 'vitest';
import { formatAmount, parseAmount } from './money';

describe('parseAmount', () => {
  test('parses spaces and comma decimals to tiyin', () => {
    expect(parseAmount('5 000 000,50')).toBe(500000050);
  });
  test('parses dot decimals and plain integers', () => {
    expect(parseAmount('1234.5')).toBe(123450);
    expect(parseAmount('100000000')).toBe(10000000000);
  });
  test('rejects garbage and empty', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('12a')).toBeNull();
  });
  test('accepts negative numbers', () => {
    expect(parseAmount('-2 500')).toBe(-250000);
  });
});

describe('formatAmount', () => {
  test('formats ming so‘m with grouping, rounding half away from zero', () => {
    expect(formatAmount(500000000, 'ming')).toBe('5 000');
    expect(formatAmount(50000, 'ming')).toBe('1');
    expect(formatAmount(-1234500000, 'ming')).toBe('-12 345');
  });
  test('formats so‘m without tiyin when whole, with tiyin otherwise', () => {
    expect(formatAmount(10000000000, 'som')).toBe('100 000 000');
    expect(formatAmount(500000050, 'som')).toBe('5 000 000,50');
  });
  test('zero formats as 0', () => {
    expect(formatAmount(0, 'som')).toBe('0');
  });
});
