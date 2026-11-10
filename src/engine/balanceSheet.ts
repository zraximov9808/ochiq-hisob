import { synthetic } from './accounts';
import { BALANCE_LINES, BALANCE_RULES, type BalanceLineDef } from './balanceForm';
import { buildLedger } from './ledger';
import { periodRange, type Quarter } from './period';
import type { Doc } from './types';

export interface Pair {
  start: number;
  end: number;
}

export interface BalanceContribution extends Pair {
  account: string;
}

export interface BalanceForm {
  lines: Array<BalanceLineDef & Partial<Pair>>;
  byCode: Record<string, Pair>;
  contrib: Record<string, BalanceContribution[]>;
  /** Leaf accounts with a balance that no balance line takes. */
  unmapped: string[];
  date: { start: string; end: string };
}

const NATURE = new Map(BALANCE_LINES.filter((l) => l.nature).map((l) => [l.code, l.nature!]));

/** Balance line for a leaf account with net balance `net` (debit − credit), or null when unmapped. */
export function balanceLineFor(code: string, net: number): string | null {
  const syn = synthetic(code);
  if (syn.length !== 4) return null;
  const n = Number(syn);
  const rule = BALANCE_RULES.find(([from, to]) => n >= from && n <= to);
  if (!rule) return null;
  return net >= 0 ? rule[2] : rule[3];
}

export function isOffBalance(code: string): boolean {
  return synthetic(code).length === 3;
}

export function buildBalance(doc: Doc, quarter: Quarter): BalanceForm {
  const { from, to } = periodRange(doc.year, quarter);
  const ledger = buildLedger(doc, from, to);
  const leaf: Record<string, Pair> = {};
  const contrib: Record<string, BalanceContribution[]> = {};
  const unmapped = new Set<string>();

  const add = (code: string, net: number, which: keyof Pair) => {
    if (net === 0 || isOffBalance(code)) return;
    const line = balanceLineFor(code, net);
    if (!line) {
      unmapped.add(code);
      return;
    }
    const value = NATURE.get(line) === 'dr' ? net : -net;
    (leaf[line] ??= { start: 0, end: 0 })[which] += value;
    const list = (contrib[line] ??= []);
    let c = list.find((x) => x.account === code);
    if (!c) list.push((c = { account: code, start: 0, end: 0 }));
    c[which] += value;
  };

  // `from` is always 1 January, so `open` is the balance at the start of the year.
  for (const [code, row] of ledger) {
    add(code, row.open, 'start');
    add(code, row.close, 'end');
  }

  const byCode: Record<string, Pair> = {};
  const defs = new Map(BALANCE_LINES.filter((l) => l.code).map((l) => [l.code, l]));
  const valueOf = (code: string): Pair => {
    if (byCode[code]) return byCode[code];
    const def = defs.get(code)!;
    let v: Pair = { start: 0, end: 0 };
    if (def.formula) {
      for (const [sign, ref] of def.formula) {
        const r = valueOf(ref);
        v = { start: v.start + sign * r.start, end: v.end + sign * r.end };
      }
    } else if (leaf[code]) v = { ...leaf[code] };
    return (byCode[code] = v);
  };
  for (const code of defs.keys()) valueOf(code);
  for (const list of Object.values(contrib)) list.sort((a, b) => a.account.localeCompare(b.account));

  return {
    lines: BALANCE_LINES.map((l) => (l.code ? { ...l, ...byCode[l.code] } : l)),
    byCode,
    contrib,
    unmapped: [...unmapped].sort(),
    date: { start: from, end: to },
  };
}
