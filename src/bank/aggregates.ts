import type { Analysis } from './analyze';
import type { BankAccount, Group, Operation } from './model';
import { DEFAULT_RULES } from './rules/defaultRules';

export interface AccountSummary {
  account: BankAccount;
  opening: number;
  debit: number;
  credit: number;
  closing: number;
  bank: number;
  diff: number;
  count: number;
  lastDate: string | null;
  inactive: boolean;
}

/** Turnover per account; with `excludeInternal` own-account transfers are left out of debit/credit. */
export function accountSummaries(a: Analysis, excludeInternal: boolean): AccountSummary[] {
  return a.accounts.map((acc) => {
    const ops = a.operations.filter((o) => o.account === acc.number);
    const counted = excludeInternal ? ops.filter((o) => !o.internal) : ops;
    const check = a.checks.find((c) => c.account === acc.number)!;
    return {
      account: acc,
      opening: acc.openingBalance,
      debit: counted.reduce((s, o) => s + o.debit, 0),
      credit: counted.reduce((s, o) => s + o.credit, 0),
      closing: check.closing,
      bank: check.bank,
      diff: check.diff,
      count: ops.length,
      lastDate: ops.at(-1)?.datetime ?? null,
      inactive: ops.length === 0,
    };
  });
}

export interface TypeRow {
  type: string;
  count: number;
  debit: number;
  credit: number;
  share: number;
}

export interface TypeGroup {
  group: Group;
  rows: TypeRow[];
  total: TypeRow;
}

export const GROUPS: Group[] = ['Kirim', 'Chiqim', 'Soliqlar'];

/** Groups → types with count, sums and share (income of total credit, expenses/taxes of total debit). */
export function typeSummary(ops: Operation[]): TypeGroup[] {
  const totalDebit = ops.reduce((s, o) => s + o.debit, 0);
  const totalCredit = ops.reduce((s, o) => s + o.credit, 0);
  const share = (g: Group, r: { debit: number; credit: number }) =>
    g === 'Kirim' ? (totalCredit ? r.credit / totalCredit : 0) : totalDebit ? r.debit / totalDebit : 0;
  return GROUPS.map((group) => {
    const map = new Map<string, TypeRow>();
    for (const o of ops.filter((x) => x.group === group)) {
      const r = map.get(o.type) ?? { type: o.type, count: 0, debit: 0, credit: 0, share: 0 };
      r.count++;
      r.debit += o.debit;
      r.credit += o.credit;
      map.set(o.type, r);
    }
    const rows = [...map.values()].sort((a, b) => b.debit + b.credit - (a.debit + a.credit));
    rows.forEach((r) => (r.share = share(group, r)));
    const total = rows.reduce((t, r) => ({ ...t, count: t.count + r.count, debit: t.debit + r.debit, credit: t.credit + r.credit }), {
      type: `${group} jami`, count: 0, debit: 0, credit: 0, share: 0,
    });
    total.share = share(group, total);
    return { group, rows, total };
  }).filter((g) => g.rows.length);
}

export interface CorrRow {
  key: string;
  accounts: string[];
  name: string;
  inn: string;
  count: number;
  debit: number;
  credit: number;
  saldo: number;
}

/** Correspondents by account (or by INN), largest total turnover first. */
export function correspondents(ops: Operation[], byInn: boolean): CorrRow[] {
  const map = new Map<string, CorrRow & { names: Map<string, number> }>();
  for (const o of ops) {
    const key = byInn && o.korrInn ? `inn:${o.korrInn}` : o.korrAccount;
    const r = map.get(key) ?? { key, accounts: [] as string[], name: '', inn: o.korrInn, count: 0, debit: 0, credit: 0, saldo: 0, names: new Map<string, number>() };
    if (!r.accounts.includes(o.korrAccount)) r.accounts.push(o.korrAccount);
    r.names.set(o.korrName, (r.names.get(o.korrName) ?? 0) + 1);
    r.count++;
    r.debit += o.debit;
    r.credit += o.credit;
    if (!r.inn) r.inn = o.korrInn;
    map.set(key, r);
  }
  return [...map.values()]
    .map(({ names, ...r }) => ({ ...r, name: [...names].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '', saldo: r.credit - r.debit }))
    .sort((a, b) => b.debit + b.credit - (a.debit + a.credit));
}

export interface MonthRow {
  month: string;
  opening: number;
  debit: number;
  credit: number;
  closing: number;
}

const monthsBetween = (from: string, to: string): string[] => {
  const out: string[] = [];
  let [y, m] = from.slice(0, 7).split('-').map(Number);
  const [ty, tm] = to.slice(0, 7).split('-').map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
};

/** Every month of the statement period, including months without movement. */
export function monthly(acc: BankAccount, ops: Operation[]): MonthRow[] {
  const from = acc.periodFrom || ops[0]?.datetime || '';
  const to = acc.periodTo || ops.at(-1)?.datetime || from;
  if (!from) return [];
  let bal = acc.openingBalance;
  return monthsBetween(from, to).map((month) => {
    const inMonth = ops.filter((o) => o.datetime.startsWith(month));
    const debit = inMonth.reduce((s, o) => s + o.debit, 0);
    const credit = inMonth.reduce((s, o) => s + o.credit, 0);
    const row = { month, opening: bal, debit, credit, closing: bal - debit + credit };
    bal = row.closing;
    return row;
  });
}

/** End-of-day balances for the balance chart, starting at the opening balance. */
export function dailyBalances(acc: BankAccount, ops: Operation[]): Array<{ date: string; balance: number }> {
  const out: Array<{ date: string; balance: number }> = [{ date: acc.periodFrom, balance: acc.openingBalance }];
  for (const o of ops) {
    const date = o.datetime.slice(0, 10);
    if (out.at(-1)!.date === date) out.at(-1)!.balance = o.runningBalance;
    else out.push({ date, balance: o.runningBalance });
  }
  return out;
}

const TYPE_OF = Object.fromEntries(DEFAULT_RULES.map((r) => [r.id, r.type]));
const is = (o: Operation, ...ids: string[]) => ids.some((id) => o.ruleId === id || o.type === TYPE_OF[id]);
const requestNo = (purpose: string) => /ЗАЯВК\S*\s*(?:№|N)?\s*(\d+)/i.exec(purpose)?.[1] ?? null;

export interface Conversion {
  date: string;
  currency: string;
  request: string | null;
  fx: number;
  uzs: number;
  rate: number;
}

export interface FxImportRow {
  currency: string;
  month: string;
  founderFx: number;
  boughtFx: number;
  paidUzs: number;
  rate: number | null;
  paidAbroad: number;
}

export interface FxExportRow {
  currency: string;
  month: string;
  receivedFx: number;
  reservedFx: number;
  uzs: number;
  rate: number | null;
}

/** Foreign-currency view: conversions and monthly import/export rows, mode detected from operation types. */
export function fxSummary(a: Analysis) {
  const cur = new Map(a.accounts.map((x) => [x.number, x.currency]));
  const ops = a.operations;
  const modes: Array<'import' | 'export'> = [];
  if (ops.some((o) => is(o, 'fx-spot-in', 'import', 'import-transport'))) modes.push('import');
  if (ops.some((o) => is(o, 'export-swift', 'fx-reserve', 'fx-sale-uzs'))) modes.push('export');

  const pays = ops.filter((o) => is(o, 'fx-spot-pay'));
  const used = new Set<string>();
  const conversions: Conversion[] = ops
    .filter((o) => is(o, 'fx-spot-in'))
    .map((o) => {
      const req = requestNo(o.purpose);
      const pay =
        pays.find((p) => !used.has(p.id) && req !== null && requestNo(p.purpose) === req) ??
        pays.find((p) => !used.has(p.id) && p.datetime.slice(0, 10) === o.datetime.slice(0, 10));
      if (pay) used.add(pay.id);
      const uzs = pay?.debit ?? 0;
      return { date: o.datetime.slice(0, 10), currency: cur.get(o.account)!, request: req, fx: o.credit, uzs, rate: uzs ? Math.round((uzs / o.credit) * 100) / 100 : 0 };
    });

  const fxCurrencies = [...new Set(a.accounts.filter((x) => x.currency !== 'UZS').map((x) => x.currency))];
  const months = [...new Set(ops.map((o) => o.datetime.slice(0, 7)))].sort();
  const sum = (list: Operation[], k: 'debit' | 'credit') => list.reduce((s, o) => s + o[k], 0);
  const importRows: FxImportRow[] = [];
  const exportRows: FxExportRow[] = [];
  for (const currency of fxCurrencies) {
    for (const month of months) {
      const m = ops.filter((o) => o.datetime.startsWith(month));
      const onFx = m.filter((o) => cur.get(o.account) === currency);
      const conv = conversions.filter((c) => c.currency === currency && c.date.startsWith(month));
      if (modes.includes('import')) {
        const row: FxImportRow = {
          currency, month,
          founderFx: sum(onFx.filter((o) => is(o, 'charter')), 'credit'),
          boughtFx: sum(onFx.filter((o) => is(o, 'fx-spot-in')), 'credit'),
          paidUzs: conv.reduce((s, c) => s + c.uzs, 0),
          rate: null,
          paidAbroad: sum(onFx.filter((o) => is(o, 'import', 'import-transport')), 'debit'),
        };
        row.rate = row.boughtFx && row.paidUzs ? Math.round((row.paidUzs / row.boughtFx) * 100) / 100 : null;
        if (row.founderFx || row.boughtFx || row.paidUzs || row.paidAbroad) importRows.push(row);
      }
      if (modes.includes('export')) {
        const row: FxExportRow = {
          currency, month,
          receivedFx: sum(onFx.filter((o) => is(o, 'export-swift')), 'credit'),
          reservedFx: sum(onFx.filter((o) => is(o, 'fx-reserve')), 'debit'),
          uzs: sum(m.filter((o) => cur.get(o.account) === 'UZS' && is(o, 'fx-sale-uzs')), 'credit'),
          rate: null,
        };
        row.rate = row.reservedFx && row.uzs ? Math.round((row.uzs / row.reservedFx) * 100) / 100 : null;
        if (row.receivedFx || row.reservedFx || row.uzs) exportRows.push(row);
      }
    }
  }
  return { modes, conversions, importRows, exportRows };
}
