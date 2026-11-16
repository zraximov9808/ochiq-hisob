import type { GtdItem } from '../stock/gtd';
import { CUSTOMS_ADVANCE, FOREIGN_POOL, VAT_IN } from './defaults';
import { ccyAlpha, rateOn, toTiyin } from './rates';
import type { AutoDraft, AutoWarning, Gen, RateBook, RateNeed } from './types';

/** Import declarations: goods at contract value to the foreign suppliers' pool, customs charges into cost, import VAT to 4410. */
export function gtdEntries(gtd: GtdItem[], rates: RateBook): Gen {
  const drafts: AutoDraft[] = [];
  const warnings: AutoWarning[] = [];
  const needRates: RateNeed[] = [];
  const groups = new Map<string, GtdItem[]>();
  for (const g of gtd) if (!/^\s*ЭК/i.test(g.regime)) groups.set(g.gtdNo, [...(groups.get(g.gtdNo) ?? []), g]);

  for (const [no, items] of groups) {
    const first = items[0];
    const base = { date: first.date, text: `GTD № ${no} — ${first.sender}` };
    const value = items.reduce((s, g) => s + (g.invoiceValue ?? 0), 0);
    const ccy = ccyAlpha(first.currency || 'USD');
    if (!items.some((g) => g.invoiceValue !== null)) {
      warnings.push({ kind: 'gtd-no-value', text: `GTD № ${no}: fakturaviy qiymat yoki kurs yo‘q — import tannarxi hisoblanmadi`, ref: no });
    } else {
      const rate = first.rate ?? rateOn(rates, ccy, first.date);
      if (rate === null) {
        needRates.push({ ccy, date: first.date });
        warnings.push({ kind: 'rate-missing', text: `${ccy} kursi ${first.date} uchun topilmadi — GTD № ${no} provodkasiz qoldi`, ref: `${ccy}:${first.date}` });
      } else if (value > 0) {
        drafts.push({ ...base, src: `gtd:${no}:value`, debit: { expr: '2910' }, credit: { expr: FOREIGN_POOL(ccy), fx: true }, amount: toTiyin(value, rate), fx: { ccy, amount: value } });
      }
    }
    const charges = items.reduce((s, g) => s + g.fees + g.duty, 0);
    const vat = items.reduce((s, g) => s + g.importVat, 0);
    if (charges > 0) drafts.push({ ...base, src: `gtd:${no}:duty`, debit: { expr: '2910' }, credit: { expr: CUSTOMS_ADVANCE }, amount: charges });
    if (vat > 0) drafts.push({ ...base, src: `gtd:${no}:vat`, debit: { expr: VAT_IN }, credit: { expr: CUSTOMS_ADVANCE }, amount: vat });
  }
  return { drafts, warnings, needRates };
}
