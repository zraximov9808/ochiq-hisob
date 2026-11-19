import { VAT_INPUTS, VAT_OUT } from './defaults';
import { rateInfo, toTiyin } from './rates';
import type { ResolvedEntry } from './resolve';
import type { AutoDraft, AutoWarning, Gen, RateBook, RateNeed } from './types';

const lastDay = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
const nextMonth = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};

/**
 * Month-end entries for every month the entries cover: VAT offset (6410.1 against 4410.3/.4/.5) and revaluation
 * of accounts followed in foreign currency (gain 9540, loss 9620). The last month closes on the last entry date.
 */
export function monthEndDrafts(entries: ResolvedEntry[], rates: RateBook, codeOf: (expr: string) => string | undefined): Gen {
  const drafts: AutoDraft[] = [];
  const warnings: AutoWarning[] = [];
  const need = new Map<string, RateNeed>();
  const missing = new Set<string>();
  if (!entries.length) return { drafts, warnings, needRates: [] };

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const maxDate = sorted[sorted.length - 1].date;
  const net = new Map<string, number>();
  const fx = new Map<string, { code: string; ccy: string; bal: number }>();
  const add = (code: string, v: number) => net.set(code, (net.get(code) ?? 0) + v);
  const addFx = (code: string, ccy: string, v: number) => {
    const k = `${code}|${ccy}`;
    const r = fx.get(k) ?? { code, ccy, bal: 0 };
    r.bal += v;
    fx.set(k, r);
  };
  const vins = VAT_INPUTS.map(codeOf).filter((c): c is string => !!c);
  const vout = codeOf(VAT_OUT);

  let i = 0;
  for (let ym = sorted[0].date.slice(0, 7); ym <= maxDate.slice(0, 7); ym = nextMonth(ym)) {
    const end = lastDay(ym) < maxDate ? lastDay(ym) : maxDate;
    for (; i < sorted.length && sorted[i].date <= end; i++) {
      const e = sorted[i];
      add(e.debit, e.amount);
      add(e.credit, -e.amount);
      if (e.fx && e.fxDebit) addFx(e.debit, e.fx.ccy, e.fx.amount);
      if (e.fx && e.fxCredit) addFx(e.credit, e.fx.ccy, -e.fx.amount);
    }

    // Output VAT is offset by input VAT account by account (goods, services, imports) while there is VAT to pay.
    if (vout)
      for (const vin of vins) {
        const off = Math.min(net.get(vin) ?? 0, -(net.get(vout) ?? 0));
        if (off <= 0) continue;
        drafts.push({ src: `vat:${ym}:${vin}`, date: end, text: `QQS hisobga olindi (${ym})`, debit: { expr: vout }, credit: { expr: vin }, amount: off });
        add(vin, -off);
        add(vout, off);
      }

    for (const r of fx.values()) {
      const found = rateInfo(rates, r.ccy, end);
      const key = `${r.ccy}:${end}`;
      if (!found || !found.exact) need.set(key, { ccy: r.ccy, date: end });
      if (!found) {
        if (!missing.has(key)) {
          missing.add(key);
          warnings.push({ kind: 'rate-missing', text: `${r.ccy} kursi ${end} uchun topilmadi — oy oxiri qayta baholanmadi`, ref: key });
        }
        continue;
      }
      const rate = found.rate;
      const d = toTiyin(r.bal, rate) - (net.get(r.code) ?? 0);
      if (Math.abs(d) < 100) continue;
      const base = { src: `reval:${r.code}:${r.ccy}:${ym}`, date: end, text: `Valyuta qayta baholandi: ${r.code} (${r.ccy}, ${ym})`, amount: Math.abs(d) };
      drafts.push(d > 0 ? { ...base, debit: { expr: r.code }, credit: { expr: '9540' } } : { ...base, debit: { expr: '9620' }, credit: { expr: r.code } });
      add(r.code, d);
    }
  }
  return { drafts, warnings, needRates: [...need.values()] };
}
