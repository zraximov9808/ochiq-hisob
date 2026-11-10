import type { SubAccount } from './types';

const suffix = (code: string) => code.split('.')[1] ?? '';

/**
 * Number for a new subaccount of `parent`. A counterparty already registered under another account
 * (same STIR, or same name) keeps its number when it is free here (6010.05 → 4310.05);
 * otherwise the next free number is used.
 */
export function nextSubCode(parent: string, name: string, stir: string, subs: SubAccount[]): string {
  const taken = new Set(subs.filter((s) => s.parent === parent).map((s) => suffix(s.code)));
  const same = subs.find(
    (s) => s.parent !== parent && ((stir && s.stir === stir) || s.name.trim().toLowerCase() === name.trim().toLowerCase()),
  );
  if (same && !taken.has(suffix(same.code))) return `${parent}.${suffix(same.code)}`;
  const max = [...taken].reduce((m, s) => Math.max(m, Number(s) || 0), 0);
  return `${parent}.${String(max + 1).padStart(2, '0')}`;
}

/** Groups subaccounts by counterparty (STIR, else name) when `merge` is on; one group per subaccount otherwise. */
export function groupSubaccounts(subs: SubAccount[], merge: boolean) {
  const groups = new Map<string, { key: string; name: string; stir?: string; codes: string[] }>();
  for (const s of subs) {
    const key = merge ? (s.stir ? `stir:${s.stir}` : `name:${s.name.trim().toLowerCase()}`) : s.code;
    const g = groups.get(key) ?? { key, name: s.name, stir: s.stir, codes: [] };
    g.codes.push(s.code);
    groups.set(key, g);
  }
  return [...groups.values()];
}
