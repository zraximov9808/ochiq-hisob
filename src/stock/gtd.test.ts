import { describe, expect, test } from 'vitest';
import { parseGtd } from './gtd';

/** A GTD report row built from column → value pairs; the header has the real report's column names. */
function report(cols: Array<[string, unknown]>, rows: unknown[][]): unknown[][] {
  return [['Отчет о таможенном оформлении товаров'], cols.map(([h]) => h), ...rows];
}

const BASE: Array<[string, unknown]> = [
  ['гр.1 Tип pежима', 'ИМ 40'],
  ['гр.7 Дата регистрации ГТД', '06.07.2026'],
  ['гр.7 Справочный номер ГТД', '0000101'],
  ['гр.2 Отправитель', 'SUPPLIER CO., LTD'],
  ['гр.32 № товара 2', 1],
  ['гр.31 Наименования товара4', 'Унитаз керамический'],
];
const VALUES: Array<[string, unknown]> = [
  ['гр.22 Валюта контракта', '840'],
  ['гр.23 Курс валюты контракта', 11973.9],
  ['гр.42 Фактурная стоимость товара', 13440],
  ['гр.45 Таможенная стоимость товара', 18156.6],
  ['гр. 47-1 Сбор (10) Ставка (%)', '2.5UZS'],
  ['гр. 47-1 Сбор (10) Сумма', 1030000],
  ['гр.47-1 Досмотр (12) Ставка (%)', ''],
  ['гр.47-1 Досмотр (12) Сумма', 110000],
  ['гр.47-1 Пошлина (20) Ставка (%)', '15 (0.3USD)'],
  ['гр.47-1 Пошлина (20) Сумма', 61246498.5],
  ['гр.47-1 Доп. пошлина (20) Сумма', ''],
  ['гр. 47-1 Акциз (27) Сумма', 1000],
  ['гр. 47-1 НДС (29) Ставка (%)', 12],
  ['гр. 47-1 НДС (29) Сумма', 33438217.35],
  ['гр. 47-1 Иные платежи  Сумма', 500],
  ['гр. 47-2 Пошлина (20) Сумма', 999999],
  ['гр. 47-2 НДС (29) Сумма', 999999],
];

describe('GTD value and payment columns', () => {
  test('reads contract currency, rate, invoice value and 47-1 payments', () => {
    const cols = [...BASE, ...VALUES];
    const [g] = parseGtd(report(cols, [cols.map(([, v]) => v)]) as never, 'g.xlsx');
    expect(g).toMatchObject({
      currency: '840',
      rate: 11973.9,
      invoiceValue: 1344000,
      fees: 103000000 + 11000000,
      duty: 6124649850 + 100000 + 50000,
      importVat: 3343821735,
    });
  });

  test('an old report without value columns gives empty values', () => {
    const [g] = parseGtd(report(BASE, [BASE.map(([, v]) => v)]) as never, 'g.xlsx');
    expect(g).toMatchObject({ currency: '', rate: null, invoiceValue: null, fees: 0, duty: 0, importVat: 0 });
  });
});
