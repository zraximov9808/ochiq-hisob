import type { GtdItem } from '../stock/gtd';
import type { RateBook, RateNeed } from './types';

const ALPHA: Record<string, string> = { '840': 'USD', '978': 'EUR', '643': 'RUB', '156': 'CNY', '398': 'KZT', '826': 'GBP', '392': 'JPY', '756': 'CHF', '000': 'UZS', '860': 'UZS' };

/** ISO numeric currency code → letters; letter codes are returned as they are. */
export function ccyAlpha(code: string): string {
  const c = code.trim().toUpperCase();
  return ALPHA[c] ?? c;
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Rate on a date, else on the nearest earlier date up to 7 days back (weekends, holidays); null if none. */
export function rateOn(book: RateBook, ccy: string, date: string): number | null {
  const c = ccyAlpha(ccy);
  if (c === 'UZS') return 1;
  for (let i = 0; i <= 7; i++) {
    const r = book[`${c}:${addDays(date, -i)}`];
    if (r) return r;
  }
  return null;
}

/** Contract rates printed on customs declarations (CBU rate of the registration day). */
export function ratesFromGtd(items: GtdItem[]): RateBook {
  const out: RateBook = {};
  for (const g of items) if (g.rate && g.currency && g.date) out[`${ccyAlpha(g.currency)}:${g.date}`] = g.rate;
  return out;
}

/** Currency amount in cents → so‘m in tiyin. */
export const toTiyin = (minor: number, rate: number) => Math.round(minor * rate);

/** Official rates from cbu.uz; only the currency code and date leave the browser. Failed requests are skipped. */
export async function fetchCbuRates(needs: RateNeed[], fetchImpl: typeof fetch = fetch): Promise<RateBook> {
  const out: RateBook = {};
  for (const n of needs) {
    const ccy = ccyAlpha(n.ccy);
    try {
      const res = await fetchImpl(`https://cbu.uz/uz/arkhiv-kursov-valyut/json/${ccy}/${n.date}/`);
      if (!res.ok) continue;
      const [row] = (await res.json()) as Array<{ Rate: string; Nominal: string }>;
      const rate = Number(row?.Rate) / (Number(row?.Nominal) || 1);
      if (rate > 0) out[`${ccy}:${n.date}`] = rate;
    } catch {
      /* offline or blocked: the rate stays missing */
    }
  }
  return out;
}
