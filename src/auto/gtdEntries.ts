import type { GtdItem } from '../stock/gtd';
import { CUSTOMS_ADVANCE, FOREIGN_BASE, FOREIGN_POOL, VAT_IN } from './defaults';
import { ccyAlpha, rateInfo, toTiyin } from './rates';
import type { AutoDraft, AutoWarning, Gen, RateBook, RateNeed } from './types';

/** Import declarations: goods at contract value to the foreign suppliers' pool, customs charges into cost, import VAT to 4410. */
export function gtdEntries(gtd: GtdItem[], rates: RateBook): Gen {
  const drafts: AutoDraft[] = [];
  const warnings: AutoWarning[] = [];
  const needRates: RateNeed[] = [];
  const groups = new Map<string, GtdItem[]>();
  for (const g of gtd) if (!/^\s*ЭК/i.test(g.regime ?? '')) groups.set(g.gtdNo, [...(groups.get(g.gtdNo) ?? []), g]);

  for (const [no, items] of groups) {
    const first = items[0];
    const base = { date: first.date, text: `GTD № ${no} — ${first.sender}` };
    const value = items.reduce((s, g) => s + (g.invoiceValue ?? 0), 0);
    const ccy = first.currency ? ccyAlpha(first.currency) : '';
    if (!items.some((g) => g.invoiceValue !== null && g.invoiceValue !== undefined)) {
      warnings.push({ kind: 'gtd-no-value', text: `GTD № ${no}: fakturaviy qiymat yoki kurs yo‘q — import tannarxi hisoblanmadi`, ref: no });
    } else {
      const found = first.rate ? { rate: first.rate, exact: true } : ccy ? rateInfo(rates, ccy, first.date) : null;
      if (ccy && (!found || !found.exact)) needRates.push({ ccy, date: first.date });
      if (!found) {
        warnings.push(
          ccy
            ? { kind: 'rate-missing', text: `${ccy} kursi ${first.date} uchun topilmadi — GTD № ${no} provodkasiz qoldi`, ref: `${ccy}:${first.date}` }
            : { kind: 'gtd-no-value', text: `GTD № ${no}: valyuta va kurs ko‘rsatilmagan — import tannarxi hisoblanmadi`, ref: no },
        );
      } else if (value > 0) {
        const amount = toTiyin(value, found.rate);
        if (ccy) drafts.push({ ...base, src: `gtd:${no}:value`, debit: { expr: '2910' }, credit: { expr: FOREIGN_POOL(ccy), fx: true }, amount, fx: { ccy, amount: value } });
        else {
          // Without the currency the debt cannot be followed in it: posted in so‘m only, not revalued.
          drafts.push({ ...base, src: `gtd:${no}:value`, debit: { expr: '2910' }, credit: { expr: FOREIGN_BASE }, amount });
          warnings.push({ kind: 'gtd-no-currency', text: `GTD № ${no}: kontrakt valyutasi (гр.22) ko‘rsatilmagan — qarz faqat so‘mda yozildi, qayta baholanmaydi`, ref: no });
        }
      }
    }
    const charges = items.reduce((s, g) => s + (g.fees ?? 0) + (g.duty ?? 0), 0);
    const vat = items.reduce((s, g) => s + (g.importVat ?? 0), 0);
    if (charges > 0) drafts.push({ ...base, src: `gtd:${no}:duty`, debit: { expr: '2910' }, credit: { expr: CUSTOMS_ADVANCE }, amount: charges });
    if (vat > 0) drafts.push({ ...base, src: `gtd:${no}:vat`, debit: { expr: VAT_IN }, credit: { expr: CUSTOMS_ADVANCE }, amount: vat });
  }
  return { drafts, warnings, needRates };
}
