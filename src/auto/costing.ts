import { isServiceItem, type Invoice } from '../audit/invoices';
import type { GtdItem } from '../stock/gtd';
import { mergeSimilarKeys, productDisplay, productKey } from '../stock/names';
import { rateOn, toTiyin } from './rates';
import type { AutoWarning, RateBook } from './types';

export interface CostOptions {
  companyInn: string;
  includePending: boolean;
  /** Quantities typed in by hand for GTD lines that do not state one (Ombor). */
  qtyOverrides: Record<string, number>;
  rates: RateBook;
}

export interface SaleCost {
  cost: number;
  /** Units sold beyond what was received: no cost known for them. */
  missingQty: number;
  name: string;
}

interface Event {
  date: string;
  key: string;
  dir: 'in' | 'out';
  qty: number;
  cost: number;
  ref: string;
  name: string;
}

/** Cost of every goods line of our sales invoices (key `${invoiceId}:${itemIndex}`), weighted average by date. */
export function buildCosts(gtd: GtdItem[], invoices: Invoice[], o: CostOptions): { cogs: Map<string, SaleCost>; warnings: AutoWarning[] } {
  const warnings: AutoWarning[] = [];
  const events: Event[] = [];
  const once = new Set<string>();
  const warnOnce = (w: AutoWarning) => {
    const k = `${w.kind}:${w.ref}`;
    if (!once.has(k)) {
      once.add(k);
      warnings.push(w);
    }
  };

  // Customs declarations: fees are charged once per declaration and shared by invoice value.
  const valueByGtd = new Map<string, number>();
  const feesByGtd = new Map<string, number>();
  for (const g of gtd) {
    valueByGtd.set(g.gtdNo, (valueByGtd.get(g.gtdNo) ?? 0) + (g.invoiceValue ?? 0));
    feesByGtd.set(g.gtdNo, (feesByGtd.get(g.gtdNo) ?? 0) + g.fees);
  }
  for (const g of gtd) {
    if (/^\s*ЭК/i.test(g.regime)) {
      warnOnce({ kind: 'export-gtd', text: `GTD № ${g.gtdNo} — eksport (ЭК): tannarx va provodka avtomatik tuzilmaydi`, ref: g.gtdNo });
      continue;
    }
    const qty = g.qty ?? o.qtyOverrides[g.id] ?? null;
    const rate = g.rate ?? rateOn(o.rates, g.currency, g.date);
    if (g.invoiceValue === null || rate === null) {
      warnOnce({ kind: 'gtd-no-value', text: `GTD № ${g.gtdNo}: fakturaviy qiymat yoki kurs yo‘q — import tannarxi hisoblanmadi`, ref: g.gtdNo });
      continue;
    }
    if (!qty) {
      warnOnce({ kind: 'gtd-no-qty', text: `GTD № ${g.gtdNo}: ayrim tovarlar soni ko‘rsatilmagan — Ombor bo‘limida sonini kiriting`, ref: g.gtdNo });
      continue;
    }
    const totalValue = valueByGtd.get(g.gtdNo) || 1;
    const feeShare = Math.round(((feesByGtd.get(g.gtdNo) ?? 0) * g.invoiceValue) / totalValue);
    events.push({ date: g.date, key: productKey(g.name), dir: 'in', qty, cost: toTiyin(g.invoiceValue, rate) + g.duty + feeShare, ref: g.id, name: productDisplay(g.name) });
  }

  const allowed = new Set(['Подписан', ...(o.includePending ? ['Ожидает'] : [])]);
  for (const inv of invoices) {
    if (inv.brief || !allowed.has(inv.status)) continue;
    const sale = inv.sellerInn === o.companyInn;
    const purchase = inv.buyerInn === o.companyInn;
    if (sale === purchase) continue;
    inv.items.forEach((it, i) => {
      if (!it.name || !it.qty || it.qty <= 0 || isServiceItem(it)) return;
      events.push({ date: inv.date, key: productKey(it.name), dir: sale ? 'out' : 'in', qty: it.qty, cost: it.amount, ref: `${inv.id}:${i}`, name: productDisplay(it.name) });
    });
  }

  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.key, (counts.get(e.key) ?? 0) + 1);
  const canon = mergeSimilarKeys(counts);
  for (const e of events) e.key = canon.get(e.key) ?? e.key;
  // Same day: receipts before issues; otherwise document order (the sort is stable).
  events.sort((a, b) => a.date.localeCompare(b.date) || (a.dir === 'in' ? 0 : 1) - (b.dir === 'in' ? 0 : 1));

  const stock = new Map<string, { qty: number; cost: number }>();
  const cogs = new Map<string, SaleCost>();
  const missing = new Map<string, { qty: number; name: string }>();
  for (const e of events) {
    const s = stock.get(e.key) ?? { qty: 0, cost: 0 };
    stock.set(e.key, s);
    if (e.dir === 'in') {
      s.qty += e.qty;
      s.cost += e.cost;
      continue;
    }
    const take = Math.min(e.qty, Math.max(s.qty, 0));
    const cost = take > 0 ? Math.round((s.cost * take) / s.qty) : 0;
    s.qty -= take;
    s.cost -= cost;
    if (s.qty <= 0) s.qty = s.cost = 0;
    const lack = e.qty - take;
    cogs.set(e.ref, { cost, missingQty: lack, name: e.name });
    if (lack > 0) {
      const m = missing.get(e.key) ?? { qty: 0, name: e.name };
      m.qty += lack;
      missing.set(e.key, m);
    }
  }
  for (const [key, m] of missing)
    warnings.push({
      kind: 'no-cost',
      text: `“${m.name}”: ${m.qty} dona sotilgan, lekin kirimi (GTD yoki kirim fakturasi) topilmadi — tannarx hisoblanmadi. Import tovar bo‘lsa, GTD hisobotini (shablon) yuklang.`,
      ref: key,
      amount: m.qty,
    });
  return { cogs, warnings };
}
