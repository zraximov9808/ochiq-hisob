import { expect, test } from 'vitest';
import { toCyrillic } from './translit';

test('converts oʻ and gʻ in all apostrophe forms', () => {
  expect(toCyrillic('Oʻzgarish yoʻq')).toBe('Ўзгариш йўқ');
  expect(toCyrillic("bog'liqligi")).toBe('боғлиқлиги');
  expect(toCyrillic('O‘tgan yil')).toBe('Ўтган йил');
});

test('converts digraphs sh, ch and h', () => {
  expect(toCyrillic('shahar')).toBe('шаҳар');
  expect(toCyrillic('Chegirma')).toBe('Чегирма');
});

test('word-initial e becomes э, inner e stays е', () => {
  expect(toCyrillic('Ekspert')).toBe('Эксперт');
  expect(toCyrillic('Debet')).toBe('Дебет');
});

test('tutuq belgisi becomes ъ and digits stay', () => {
  expect(toCyrillic('Ma’muriy 9420')).toBe('Маъмурий 9420');
});

test('yo, yu, ya become single letters', () => {
  expect(toCyrillic('Yangi yozuv')).toBe('Янги ёзув');
});

test('loanword suffixes -tsiya/-tsion use ц', () => {
  expect(toCyrillic('amortizatsiya')).toBe('амортизация');
  expect(toCyrillic('Investitsiyalar')).toBe('Инвестициялар');
  expect(toCyrillic('operatsion')).toBe('операцион');
  expect(toCyrillic('ketsa')).toBe('кетса');
});

test('keeps Roman numerals, shortcuts and product names', () => {
  expect(toCyrillic('I chorak')).toBe('I чорак');
  expect(toCyrillic('II boʻlim')).toBe('II бўлим');
  expect(toCyrillic('Orqaga (Ctrl+Z)')).toBe('Орқага (Ctrl+Z)');
  expect(toCyrillic('Exceldan import')).toBe('Excelдан импорт');
});
