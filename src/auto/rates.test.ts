import { describe, expect, test } from 'vitest';
import type { GtdItem } from '../stock/gtd';
import { ccyAlpha, fetchCbuRates, rateOn, ratesFromGtd, toTiyin } from './rates';

const book = { 'USD:2026-07-06': 11973.9, 'USD:2026-07-10': 12000 };

describe('rateOn', () => {
  test('exact date', () => expect(rateOn(book, 'USD', '2026-07-06')).toBe(11973.9));
  test('nearest earlier date within 7 days', () => expect(rateOn(book, 'USD', '2026-07-09')).toBe(11973.9));
  test('nothing within 7 days', () => expect(rateOn(book, 'USD', '2026-07-05')).toBeNull());
  test('more than 7 days back is too old', () => expect(rateOn({ 'USD:2026-07-01': 1 }, 'USD', '2026-07-09')).toBeNull());
  test('so‘m is always 1', () => expect(rateOn({}, 'UZS', '2026-07-09')).toBe(1));
});

test('numeric currency codes become letters', () => {
  expect(ccyAlpha('840')).toBe('USD');
  expect(ccyAlpha('156')).toBe('CNY');
  expect(ccyAlpha('EUR')).toBe('EUR');
});

test('GTD rows give rates on their dates', () => {
  const g = { currency: '840', rate: 11973.9, date: '2026-07-06' } as GtdItem;
  expect(ratesFromGtd([g, { ...g, rate: null }])).toEqual({ 'USD:2026-07-06': 11973.9 });
});

test('so‘m amount of a currency amount in cents', () => {
  expect(toTiyin(15000, 12000)).toBe(180000000);
  expect(toTiyin(1, 11973.9)).toBe(11974);
});

test('CBU rates are fetched per currency and date; failed requests are skipped', async () => {
  const urls: string[] = [];
  const fake = (async (url: string) => {
    urls.push(url);
    if (url.includes('EUR')) return { ok: false, status: 500, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => [{ Rate: '11973.90', Nominal: '1' }] };
  }) as unknown as typeof fetch;
  const got = await fetchCbuRates([{ ccy: 'USD', date: '2026-07-06' }, { ccy: 'EUR', date: '2026-07-06' }], fake);
  expect(urls[0]).toBe('https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD/2026-07-06/');
  expect(got).toEqual({ 'USD:2026-07-06': 11973.9 });
});
