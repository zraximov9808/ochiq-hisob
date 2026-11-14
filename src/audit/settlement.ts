import type { Analysis } from '../bank/analyze';
import type { Operation } from '../bank/model';
import { DEFAULT_RULES } from '../bank/rules/defaultRules';
import { companyInnOf, type Invoice } from './invoices';

export interface AuditOptions {
  /** Count invoices still waiting for signature ("Ожидает"). */
  includePending: boolean;
  from?: string;
  to?: string;
}

export type MovementKind = 'moneyIn' | 'moneyOut' | 'invIn' | 'invOut';

export const KIND_LABEL: Record<MovementKind, string> = {
  moneyIn: 'Kirgan pul',
  moneyOut: 'Chiqqan pul',
  invIn: 'Kirgan faktura',
  invOut: 'Chiqqan faktura',
};

export interface Movement {
  date: string;
  kind: MovementKind;
  amount: number;
  doc: string;
  text: string;
  /** Running balance after this movement: + the counterparty owes us, − we owe them. */
  balance: number;
}

export interface CounterpartyRow {
  key: string;
  inn: string;
  name: string;
  /** Money received from them (bank credit). */
  moneyIn: number;
  /** Money paid to them (bank debit). */
  moneyOut: number;
  /** Invoices they issued to us (we bought). */
  invIn: number;
  /** Invoices we issued to them (we sold). */
  invOut: number;
  /** invOut + moneyOut − moneyIn − invIn: positive = debitor (they owe us), negative = kreditor. */
  saldo: number;
  side: 'debitor' | 'kreditor' | 'yopiq';
  /** As a customer: our invoices − their payments. */
  customerBalance: number;
  /** As a supplier: their invoices − our payments. */
  supplierBalance: number;
  movements: Movement[];
  flags: Array<'NO_INVOICE' | 'NO_PAYMENT'>;
}

export interface AuditResult {
  companyInn: string;
  companyName: string;
  period: { from: string; to: string };
  rows: CounterpartyRow[];
  totals: { moneyIn: number; moneyOut: number; invIn: number; invOut: number; debitor: number; kreditor: number };
  /** Bank operations left out of the settlement, grouped by reason. */
  excluded: Array<{ reason: string; count: number; debit: number; credit: number }>;
  /** Invoices left out because of their status. */
  skippedInvoices: Array<{ reason: string; count: number; total: number }>;
  outsidePeriod: number;
  /** Invoices where the company is neither seller nor buyer. */
  foreignInvoices: number;
}

const SIGNED = 'Подписан';
const PENDING = 'Ожидает';

const TYPE_OF = Object.fromEntries(DEFAULT_RULES.map((r) => [r.id, r.type]));
const REASONS: Array<[string, string[]]> = [
  ['Bank komissiyalari', ['fee-tif', 'fee-swift', 'fee-swift-korr', 'fee-qr', 'fee-transfer', 'fee-text']],
  ['Valyuta konvertatsiyasi', ['fx-transfer-out', 'fx-transfer-in', 'fx-spot-in', 'fx-spot-pay', 'fx-reserve', 'fx-sale-uzs']],
  ['Ta’sischi bilan operatsiyalar', ['charter', 'founder-sales']],
  ['Ish haqi va jismoniy shaxslarga yordam', ['salary', 'aid']],
  ['Terminal (QR/POS) tushumlari', ['qr-pos', 'qr-to-main']],
];

/** Why a bank operation is not a trade settlement with a counterparty, or null when it is one. */
export function exclusionReason(o: Operation, currency: string): string | null {
  if (currency !== 'UZS') return 'Valyuta hisoblaridagi operatsiyalar';
  if (o.internal) return 'Ichki o‘tkazmalar (o‘z hisoblari)';
  if (o.group === 'Soliqlar') return 'Soliq va byudjet to‘lovlari';
  for (const [reason, ids] of REASONS) if (ids.some((id) => o.ruleId === id || o.type === TYPE_OF[id])) return reason;
  if (!o.korrInn && !o.korrName) return 'Kontragenti ko‘rsatilmagan';
  return null;
}

/** Name key for matching a bank counterparty without INN to invoices: no quotes, no legal form. */
export function nameKey(name: string): string {
  return name
    .toUpperCase()
    .replace(/[«»"'`’‘ʻ“”]/g, ' ')
    .replace(/(?<!\p{L})(MCHJ|МЧЖ|ООО|OOO|LLC|XK|ХК|OK|ОК|AJ|АЖ|АО|СП|SP|QK|ҚК|YATT|ЯТТ|ЧП|ИП)(?!\p{L})/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const within = (d: string, from?: string, to?: string) => (!from || d >= from) && (!to || d <= to);

export function buildAudit(analysis: Analysis | null, invoices: Invoice[], opts: AuditOptions): AuditResult {
  const companyInn = analysis?.company.inn || companyInnOf(invoices);
  const from = opts.from ?? analysis?.company.periodFrom ?? '';
  const to = opts.to ?? analysis?.company.periodTo ?? '';
  const currency = new Map(analysis?.accounts.map((a) => [a.number, a.currency]) ?? []);

  const rows = new Map<string, CounterpartyRow>();
  const byName = new Map<string, string>();
  /** Key of an already known counterparty with this name: exact, or one name a prefix of the other (bank names are often cut short). */
  const findByName = (nk: string) => {
    if (!nk) return undefined;
    if (byName.has(nk)) return byName.get(nk);
    for (const [k, key] of byName) if (Math.min(k.length, nk.length) >= 12 && (k.startsWith(nk) || nk.startsWith(k))) return key;
    return undefined;
  };
  const get = (rawInn: string, name: string) => {
    // Banks print "000000000" when an entrepreneur's INN is unknown; treat it as missing.
    const inn = /^0*$/.test(rawInn) ? '' : rawInn;
    const nk = nameKey(name);
    const key = inn ? `inn:${inn}` : findByName(nk) ?? `name:${nk}`;
    let r = rows.get(key);
    if (!r) {
      r = { key, inn, name, moneyIn: 0, moneyOut: 0, invIn: 0, invOut: 0, saldo: 0, side: 'yopiq', customerBalance: 0, supplierBalance: 0, movements: [], flags: [] };
      rows.set(key, r);
    }
    if (inn && nk && !byName.has(nk)) byName.set(nk, key);
    if (!r.name && name) r.name = name;
    return r;
  };

  // Invoices first, so bank lines without INN can find their counterparty by name.
  const skipped = new Map<string, { reason: string; count: number; total: number }>();
  let outsidePeriod = 0;
  let foreignInvoices = 0;
  const allowed = new Set([SIGNED, ...(opts.includePending ? [PENDING] : [])]);
  for (const inv of invoices) {
    if (!allowed.has(inv.status)) {
      const s = skipped.get(inv.status) ?? { reason: inv.status || '(holatsiz)', count: 0, total: 0 };
      s.count++;
      s.total += inv.total;
      skipped.set(inv.status, s);
      continue;
    }
    if (!within(inv.date, from, to)) {
      outsidePeriod++;
      continue;
    }
    const outgoing = inv.sellerInn === companyInn;
    const incoming = inv.buyerInn === companyInn;
    if (outgoing === incoming) {
      foreignInvoices++;
      continue;
    }
    const r = outgoing ? get(inv.buyerInn, inv.buyerName) : get(inv.sellerInn, inv.sellerName);
    if (outgoing) r.invOut += inv.total;
    else r.invIn += inv.total;
    r.movements.push({ date: inv.date, kind: outgoing ? 'invOut' : 'invIn', amount: inv.total, doc: inv.docNo, text: `Hisob-faktura № ${inv.docNo}${inv.contractNo ? `, shartnoma ${inv.contractNo}` : ''}`, balance: 0 });
  }

  const excluded = new Map<string, { reason: string; count: number; debit: number; credit: number }>();
  // Operations with an INN first, so later lines without one can join the same counterparty by name.
  const bankOps = [...(analysis?.operations ?? [])].sort((a, b) => Number(!a.korrInn) - Number(!b.korrInn));
  for (const o of bankOps) {
    const day = o.datetime.slice(0, 10);
    if (!within(day, from, to)) continue;
    const reason = exclusionReason(o, currency.get(o.account) ?? 'UZS');
    if (reason) {
      const e = excluded.get(reason) ?? { reason, count: 0, debit: 0, credit: 0 };
      e.count++;
      e.debit += o.debit;
      e.credit += o.credit;
      excluded.set(reason, e);
      continue;
    }
    const r = get(o.korrInn, o.korrName);
    if (o.credit) r.moneyIn += o.credit;
    if (o.debit) r.moneyOut += o.debit;
    r.movements.push({ date: day, kind: o.credit ? 'moneyIn' : 'moneyOut', amount: o.credit || o.debit, doc: o.docNo, text: o.purpose, balance: 0 });
  }

  const order: Record<MovementKind, number> = { invOut: 0, moneyOut: 1, moneyIn: 2, invIn: 3 };
  const list = [...rows.values()].map((r) => {
    r.saldo = r.invOut + r.moneyOut - r.moneyIn - r.invIn;
    r.side = r.saldo > 0 ? 'debitor' : r.saldo < 0 ? 'kreditor' : 'yopiq';
    r.customerBalance = r.invOut - r.moneyIn;
    r.supplierBalance = r.invIn - r.moneyOut;
    r.movements.sort((a, b) => a.date.localeCompare(b.date) || order[a.kind] - order[b.kind]);
    let bal = 0;
    for (const m of r.movements) {
      bal += m.kind === 'invOut' || m.kind === 'moneyOut' ? m.amount : -m.amount;
      m.balance = bal;
    }
    const money = r.moneyIn + r.moneyOut;
    const inv = r.invIn + r.invOut;
    if (money && !inv) r.flags.push('NO_INVOICE');
    if (inv && !money) r.flags.push('NO_PAYMENT');
    return r;
  });
  list.sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo) || b.moneyIn + b.moneyOut + b.invIn + b.invOut - (a.moneyIn + a.moneyOut + a.invIn + a.invOut));

  const sum = (k: 'moneyIn' | 'moneyOut' | 'invIn' | 'invOut') => list.reduce((s, r) => s + r[k], 0);
  const companyName =
    analysis?.company.name || invoices.find((i) => i.sellerInn === companyInn)?.sellerName || invoices.find((i) => i.buyerInn === companyInn)?.buyerName || '';
  return {
    companyInn,
    companyName,
    period: { from, to },
    rows: list,
    totals: {
      moneyIn: sum('moneyIn'),
      moneyOut: sum('moneyOut'),
      invIn: sum('invIn'),
      invOut: sum('invOut'),
      debitor: list.reduce((s, r) => s + Math.max(0, r.saldo), 0),
      kreditor: list.reduce((s, r) => s + Math.max(0, -r.saldo), 0),
    },
    excluded: [...excluded.values()].sort((a, b) => b.debit + b.credit - (a.debit + a.credit)),
    skippedInvoices: [...skipped.values()],
    outsidePeriod,
    foreignInvoices,
  };
}
