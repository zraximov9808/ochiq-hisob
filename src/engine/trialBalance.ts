import { accountName, synthetic } from './accounts';
import { isOffBalance } from './balanceSheet';
import { buildLedger } from './ledger';
import { periodRange, type Quarter } from './period';
import type { Doc } from './types';

export interface TBRow {
  code: string;
  name: string;
  level: 'syn' | 'sub';
  openDr: number;
  openCr: number;
  dr: number;
  cr: number;
  closeDr: number;
  closeCr: number;
}

export interface TrialBalance {
  rows: TBRow[];
  totals: Omit<TBRow, 'code' | 'name' | 'level'>;
  period: { from: string; to: string };
}

const split = (net: number) => (net >= 0 ? [net, 0] : [0, -net]);

/** Aylanma-saldo vedomosti: expanded balances per synthetic account with its subaccounts. */
export function buildTrialBalance(doc: Doc, quarter: Quarter): TrialBalance {
  const { from, to } = periodRange(doc.year, quarter);
  const ledger = buildLedger(doc, from, to);
  const bySyn = new Map<string, TBRow[]>();
  for (const [code, r] of ledger) {
    if (r.open === 0 && r.dr === 0 && r.cr === 0) continue;
    const [openDr, openCr] = split(r.open);
    const [closeDr, closeCr] = split(r.close);
    const row: TBRow = {
      code,
      name: accountName(code, doc.subaccounts),
      level: code.includes('.') ? 'sub' : 'syn',
      openDr, openCr, dr: r.dr, cr: r.cr, closeDr, closeCr,
    };
    const syn = synthetic(code);
    bySyn.set(syn, [...(bySyn.get(syn) ?? []), row]);
  }

  const rows: TBRow[] = [];
  const totals = { openDr: 0, openCr: 0, dr: 0, cr: 0, closeDr: 0, closeCr: 0 };
  const keys = ['openDr', 'openCr', 'dr', 'cr', 'closeDr', 'closeCr'] as const;
  for (const syn of [...bySyn.keys()].sort()) {
    const leaves = bySyn.get(syn)!.sort((a, b) => a.code.localeCompare(b.code));
    const subs = leaves.filter((l) => l.level === 'sub');
    const head: TBRow = { code: syn, name: accountName(syn), level: 'syn', openDr: 0, openCr: 0, dr: 0, cr: 0, closeDr: 0, closeCr: 0 };
    for (const l of leaves) for (const k of keys) head[k] += l[k];
    rows.push(head, ...subs);
    if (!isOffBalance(syn)) for (const k of keys) totals[k] += head[k];
  }
  return { rows, totals, period: { from, to } };
}
