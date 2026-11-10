import { CHART_SOURCE } from './chart';
import type { SubAccount } from './types';

export interface Account {
  code: string;
  name: string;
  /** Synthetic (4-digit) parent for subaccounts, or the group code for chart accounts. */
  parent?: string;
  /** true for off-balance accounts (001–011). */
  offBalance?: boolean;
  /** true for group headings like 6000. */
  group?: boolean;
}

/** Turns typewriter apostrophes into Uzbek Latin letters: oʻ, gʻ and tutuq ’. */
export function normalizeUz(s: string): string {
  return s.replace(/([OoGg])'/g, '$1ʻ').replace(/'/g, '’');
}

export const CHART: Account[] = CHART_SOURCE.trim()
  .split('\n')
  .map((line) => {
    const [code, name] = line.split('|');
    const offBalance = code.length === 3;
    const group = !offBalance && code.endsWith('00');
    return {
      code,
      name: normalizeUz(name),
      offBalance,
      group,
      parent: offBalance || group ? undefined : code.slice(0, 2) + '00',
    };
  });

const BY_CODE = new Map(CHART.map((a) => [a.code, a]));

/** Synthetic account of a code: "6010.05" → "6010". */
export function synthetic(code: string): string {
  return code.trim().split('.')[0];
}

export function findAccount(code: string, subaccounts: SubAccount[] = []): Account | undefined {
  const c = code.trim();
  if (c.includes('.')) {
    const sub = subaccounts.find((s) => s.code === c);
    const parent = BY_CODE.get(synthetic(c));
    if (sub) return { code: c, name: sub.name, parent: sub.parent };
    if (parent) return { code: c, name: parent.name, parent: parent.code };
    return undefined;
  }
  return BY_CODE.get(c);
}

/** A code usable in entries: a chart account or a registered subaccount. */
export function isKnownAccount(code: string, subaccounts: SubAccount[]): boolean {
  const c = code.trim();
  if (c.includes('.')) return subaccounts.some((s) => s.code === c);
  return BY_CODE.has(c);
}

export function accountName(code: string, subaccounts: SubAccount[] = []): string {
  return findAccount(code, subaccounts)?.name ?? '';
}
