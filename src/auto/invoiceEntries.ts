import { isServiceItem, type Invoice } from '../audit/invoices';
import { VAT_IN, VAT_OUT } from './defaults';
import type { AutoDraft, AutoSettings, AutoWarning, Gen, Party } from './types';

export interface InvoiceEntryOptions {
  companyInn: string;
  s: AutoSettings;
  /** Cost of sold goods lines, key `${invoiceId}:${itemIndex}`. */
  cogs: Map<string, { cost: number }>;
}

interface Split {
  goods: number;
  services: number;
  vat: number;
}

/** Goods, services and VAT of an invoice with goods lines (or with totals only, from older saved data). */
function splitDetailed(inv: Invoice): Split {
  if (!inv.items.length) return { goods: inv.amount, services: 0, vat: inv.vat };
  const s: Split = { goods: 0, services: 0, vat: 0 };
  for (const it of inv.items) {
    if (isServiceItem(it)) s.services += it.amount;
    else s.goods += it.amount;
    s.vat += it.vat;
  }
  return s;
}

/** Entries of signed e-invoices: sales to 4010 per buyer, purchases to 6010 per seller, VAT, cost of sales. */
export function invoiceEntries(invoices: Invoice[], o: InvoiceEntryOptions): Gen {
  const allowed = new Set(['Подписан', ...(o.s.includePending ? ['Ожидает'] : [])]);
  const drafts: AutoDraft[] = [];
  const warnings: AutoWarning[] = [];
  const mine = invoices.filter((i) => allowed.has(i.status) && (i.sellerInn === o.companyInn) !== (i.buyerInn === o.companyInn));
  const detailed = mine.filter((i) => !i.brief);

  // How a header-only invoice is split: sales by our VAT status, purchases by the supplier's other invoices.
  const salesWithVat = detailed.filter((i) => i.sellerInn === o.companyInn);
  const vatPayer = !salesWithVat.length || salesWithVat.some((i) => splitDetailed(i).vat > 0);
  const profile = new Map<string, Split>();
  for (const i of detailed.filter((x) => x.buyerInn === o.companyInn)) {
    const p = profile.get(i.sellerInn) ?? { goods: 0, services: 0, vat: 0 };
    const s = splitDetailed(i);
    p.goods += s.goods;
    p.services += s.services;
    p.vat += s.vat;
    profile.set(i.sellerInn, p);
  }

  const brief = { sale: { n: 0, sum: 0 }, purchase: { n: 0, sum: 0 } };
  for (const inv of mine) {
    const sale = inv.sellerInn === o.companyInn;
    const party: Party = sale ? { inn: inv.buyerInn, name: inv.buyerName } : { inn: inv.sellerInn, name: inv.sellerName };
    let s: Split;
    if (!inv.brief) s = splitDetailed(inv);
    else if (sale) {
      const vat = vatPayer ? Math.round((inv.total * 12) / 112) : 0;
      s = { goods: inv.total - vat, services: 0, vat };
    } else {
      const p = profile.get(inv.sellerInn);
      const net0 = p ? p.goods + p.services : 0;
      if (!p || !net0) s = { goods: 0, services: inv.total, vat: 0 };
      else {
        const net = Math.round((inv.total * net0) / (net0 + p.vat));
        const goods = Math.round((net * p.goods) / net0);
        s = { goods, services: net - goods, vat: inv.total - net };
      }
    }
    if (inv.brief) {
      const b = sale ? brief.sale : brief.purchase;
      b.n++;
      b.sum += inv.total;
    }

    const counter = { expr: sale ? '4010.*' : '6010.*', party };
    const base = { date: inv.date, text: `Faktura № ${inv.docNo} — ${party.name}` };
    const add = (part: string, amount: number, debit: AutoDraft['debit'], credit: AutoDraft['credit']) => {
      if (amount > 0) drafts.push({ ...base, src: `inv:${inv.id}:${part}`, debit, credit, amount });
    };
    if (sale) {
      add('goods', s.goods, counter, { expr: '9020' });
      add('services', s.services, counter, { expr: '9030' });
      add('vat', s.vat, counter, { expr: VAT_OUT });
      const cost = inv.items.reduce((sum, _it, i) => sum + (o.cogs.get(`${inv.id}:${i}`)?.cost ?? 0), 0);
      add('cogs', cost, { expr: '9120' }, { expr: '2910' });
    } else {
      add('goods', s.goods, { expr: '2910' }, counter);
      add('services', s.services, { expr: o.s.services[inv.sellerInn] ?? o.s.serviceDefault }, counter);
      add('vat', s.vat, { expr: VAT_IN }, counter);
    }
  }

  if (brief.sale.n)
    warnings.push({ kind: 'brief-invoice', text: `${brief.sale.n} ta sotuv fakturasi tarkibisiz (soliq.uz CSV): QQS 12/112 deb olindi, hammasi tovar; tannarx hisoblanmadi. Batafsil reyestrni (Didox / my.soliq .xlsx) yuklang.`, amount: brief.sale.sum });
  if (brief.purchase.n)
    warnings.push({ kind: 'brief-invoice', text: `${brief.purchase.n} ta xarid fakturasi tarkibisiz (soliq.uz CSV): tovar/xizmat ulushi va QQS shu sotuvchining boshqa fakturalaridan olindi (bo‘lmasa — xizmat, QQSsiz).`, amount: brief.purchase.sum });
  return { drafts, warnings, needRates: [] };
}
