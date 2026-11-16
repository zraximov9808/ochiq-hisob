import { isServiceItem, type Invoice } from '../audit/invoices';
import type { GtdItem } from './gtd';
import { mergeSimilarKeys, productDisplay, productKey } from './names';

export interface StockMove {
  id: string;
  date: string;
  key: string;
  name: string;
  dir: 'in' | 'out';
  qty: number | null;
  unit: string;
  source: 'gtd' | 'invoice';
  doc: string;
  party: string;
  /** Quantity typed in by hand for a GTD line that does not state one. */
  manual?: boolean;
}

export interface StockRow {
  key: string;
  name: string;
  unit: string;
  /** Balance before the start of the period. */
  opening: number;
  qtyIn: number;
  qtyOut: number;
  /** Balance at the end of the period. */
  balance: number;
  negative: boolean;
  moves: Array<StockMove & { balance: number }>;
}

export interface StockOptions {
  companyInn: string;
  includePending: boolean;
  /** Quantities typed by hand for GTD lines that do not state one, by move id. */
  qtyOverrides: Record<string, number>;
  from?: string;
  to?: string;
}

export interface StockResult {
  rows: StockRow[];
  /** GTD lines (up to the end date) whose quantity is still unknown. */
  unknownQty: StockMove[];
}

/** Goods that were sold but whose receipt (customs declaration or purchase invoice) is missing in whole or in part. */
export function needsGtd(row: StockRow): boolean {
  return row.qtyOut > 0 && (row.opening + row.qtyIn === 0 || row.negative);
}

/** Goods lines of signed invoices: sales are outgoing, purchases incoming; services are skipped. */
export function invoiceMoves(invoices: Invoice[], companyInn: string, includePending: boolean): StockMove[] {
  const allowed = new Set(['Подписан', ...(includePending ? ['Ожидает'] : [])]);
  const out: StockMove[] = [];
  for (const inv of invoices) {
    if (!allowed.has(inv.status)) continue;
    const outgoing = inv.sellerInn === companyInn;
    const incoming = inv.buyerInn === companyInn;
    if (outgoing === incoming) continue;
    (inv.items ?? []).forEach((it, i) => {
      if (!it.name || it.qty === null || isServiceItem(it)) return;
      out.push({
        id: `${inv.id}:${i}`,
        date: inv.date,
        key: productKey(it.name),
        name: productDisplay(it.name),
        dir: outgoing ? 'out' : 'in',
        qty: it.qty,
        unit: it.unit,
        source: 'invoice',
        doc: `Faktura № ${inv.docNo}`,
        party: outgoing ? inv.buyerName : inv.sellerName,
      });
    });
  }
  return out;
}

/** Customs lines: import regimes bring goods in, export ("ЭК") takes them out. */
export function gtdMoves(items: GtdItem[], overrides: Record<string, number>): StockMove[] {
  return items.map((g) => ({
    id: g.id,
    date: g.date,
    key: productKey(g.name),
    name: productDisplay(g.name),
    dir: /^\s*ЭК/i.test(g.regime) ? 'out' : 'in',
    qty: overrides[g.id] ?? g.qty,
    manual: g.id in overrides ? true : undefined,
    unit: g.unit,
    source: 'gtd',
    doc: `GTD № ${g.gtdNo}, ${g.itemNo}-tovar`,
    party: g.sender,
  }));
}

const mostCommon = (xs: string[]) => {
  const c = new Map<string, number>();
  for (const x of xs) if (x) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0]?.[0] ?? '';
};

export function buildStock(invoices: Invoice[], gtd: GtdItem[], opts: StockOptions): StockResult {
  const moves = [...gtdMoves(gtd, opts.qtyOverrides), ...invoiceMoves(invoices, opts.companyInn, opts.includePending)];
  const counts = new Map<string, number>();
  for (const m of moves) counts.set(m.key, (counts.get(m.key) ?? 0) + 1);
  const canon = mergeSimilarKeys(counts);
  for (const m of moves) m.key = canon.get(m.key) ?? m.key;

  const to = opts.to ?? '9999-12-31';
  const from = opts.from ?? '';
  // Same day: receipts before issues; otherwise keep document order (the sort is stable).
  const dirRank = (m: StockMove) => (m.dir === 'in' ? 0 : 1);
  const inRange = moves.filter((m) => m.date <= to).sort((a, b) => a.date.localeCompare(b.date) || dirRank(a) - dirRank(b));
  const byKey = new Map<string, StockMove[]>();
  for (const m of inRange) byKey.set(m.key, [...(byKey.get(m.key) ?? []), m]);

  const rows: StockRow[] = [];
  for (const [key, list] of byKey) {
    const qty = (m: StockMove) => (m.qty ?? 0) * (m.dir === 'in' ? 1 : -1);
    const before = list.filter((m) => m.date < from);
    const during = list.filter((m) => m.date >= from);
    const opening = before.reduce((s, m) => s + qty(m), 0);
    if (!during.length && opening === 0) continue;
    let bal = opening;
    const withBalance = during.map((m) => ({ ...m, balance: (bal += qty(m)) }));
    const qtyIn = during.filter((m) => m.dir === 'in').reduce((s, m) => s + (m.qty ?? 0), 0);
    const qtyOut = during.filter((m) => m.dir === 'out').reduce((s, m) => s + (m.qty ?? 0), 0);
    rows.push({
      key,
      name: mostCommon(list.map((m) => m.name)),
      unit: mostCommon(list.map((m) => m.unit)),
      opening,
      qtyIn,
      qtyOut,
      balance: opening + qtyIn - qtyOut,
      negative: opening + qtyIn - qtyOut < 0,
      moves: withBalance,
    });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  return { rows, unknownQty: inRange.filter((m) => m.source === 'gtd' && m.qty === null) };
}
