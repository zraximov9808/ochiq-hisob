import { CHART_SOURCE } from './chart';
import type { SubAccount } from './types';

export type AccountKind = 'A' | 'P' | 'T' | 'KA' | 'Z' | '';

export interface Account {
  code: string;
  name: string;
  /** Name in the 1C export (Russian); empty for counterparty subaccounts. */
  nameRu: string;
  kind: AccountKind;
  /** Kept in foreign currency. */
  currency: boolean;
  /** Parent: the code before the last dot for dotted codes, else the XX00 group. */
  parent?: string;
  /** Off-balance (001–017 and the non-numeric 1C service accounts). */
  offBalance: boolean;
  /** Group heading like 6000: not used in entries. */
  group: boolean;
}

/** Turns typewriter apostrophes into Uzbek Latin letters: oʻ, gʻ and tutuq ’. */
export function normalizeUz(s: string): string {
  return s.replace(/([OoGg])'/g, '$1ʻ').replace(/'/g, '’');
}

const KINDS = new Set<AccountKind>(['A', 'P', 'T', 'KA', 'Z', '']);

const rows = CHART_SOURCE.trim()
  .split('\n')
  .map((line) => {
    const [code, kind, cur, name, nameRu] = line.split('|');
    return { code, kind: (KINDS.has(kind as AccountKind) ? kind : '') as AccountKind, currency: cur === '+', name: normalizeUz(name), nameRu: nameRu ?? '' };
  });
const CODES = new Set(rows.map((r) => r.code));

const isGroup = (code: string) => /^\d{4}$/.test(code) && code.endsWith('00') && code !== '0000';
const isOffBalanceCode = (code: string, kind: AccountKind) => kind === 'Z' || /^\d{3}(\.|$)/.test(code) || !/^\d/.test(code);

function parentOf(code: string): string | undefined {
  const dot = code.lastIndexOf('.');
  if (dot > 0) return code.slice(0, dot);
  if (/^\d{4}$/.test(code) && !isGroup(code)) {
    const g = code.slice(0, 2) + '00';
    return CODES.has(g) ? g : undefined;
  }
  return undefined;
}

export const CHART: Account[] = rows.map((r) => ({
  ...r,
  offBalance: isOffBalanceCode(r.code, r.kind),
  group: isGroup(r.code),
  parent: parentOf(r.code),
}));

const BY_CODE = new Map(CHART.map((a) => [a.code, a]));

/** Synthetic account of a code: "6010.05" → "6010", "4410.3" → "4410". */
export function synthetic(code: string): string {
  return code.trim().split('.')[0];
}

/** A chart account (dotted chart codes included), else a registered subaccount, else the parent's name for an unknown subaccount. */
export function findAccount(code: string, subaccounts: SubAccount[] = []): Account | undefined {
  const c = code.trim();
  const chart = BY_CODE.get(c);
  if (chart) return chart;
  if (!c.includes('.')) return undefined;
  const sub = subaccounts.find((s) => s.code === c);
  const base = BY_CODE.get(sub?.parent ?? synthetic(c)) ?? BY_CODE.get(synthetic(c));
  if (!sub && !base) return undefined;
  return {
    code: c,
    name: sub?.name ?? base!.name,
    nameRu: '',
    kind: base?.kind ?? '',
    currency: base?.currency ?? false,
    parent: sub?.parent ?? base?.code,
    offBalance: base ? base.offBalance : isOffBalanceCode(c, ''),
    group: false,
  };
}

/** A code usable in entries: a chart account that is not a group heading, or a registered subaccount. */
export function isKnownAccount(code: string, subaccounts: SubAccount[]): boolean {
  const c = code.trim();
  const chart = BY_CODE.get(c);
  if (chart) return !chart.group;
  return c.includes('.') && subaccounts.some((s) => s.code === c);
}

export function accountName(code: string, subaccounts: SubAccount[] = []): string {
  return findAccount(code, subaccounts)?.name ?? '';
}
