import { BALANCE_LINES } from './balanceForm';
import type { BalanceForm, Pair } from './balanceSheet';
import { INCOME_LINES, type IncomeForm } from './incomeStatement';
import { toMing } from './money';

/** Rounds tiyin to whole thousands of so‘m, still expressed in tiyin. */
const r = (tiyin: number) => toMing(tiyin) * 100_000;

/**
 * Forms 1 and 2 are filed in ming so‘m: every detail line is rounded on its own and
 * totals are added up from the rounded lines, so the printed form always adds up.
 */
export function roundBalance(f: BalanceForm): Record<string, Pair> {
  const out: Record<string, Pair> = {};
  const defs = new Map(BALANCE_LINES.filter((l) => l.code).map((l) => [l.code, l]));
  const valueOf = (code: string): Pair => {
    if (out[code]) return out[code];
    const def = defs.get(code)!;
    let v: Pair;
    if (def.formula) {
      v = { start: 0, end: 0 };
      for (const [sign, ref] of def.formula) {
        const x = valueOf(ref);
        v = { start: v.start + sign * x.start, end: v.end + sign * x.end };
      }
    } else {
      const raw = f.byCode[code] ?? { start: 0, end: 0 };
      v = { start: r(raw.start), end: r(raw.end) };
    }
    return (out[code] = v);
  };
  for (const code of defs.keys()) valueOf(code);
  return out;
}

export function roundIncome(f: IncomeForm): { cur: Record<string, number>; prev: Record<string, number> } {
  const round = (src: Record<string, number>) => {
    const out: Record<string, number> = {};
    const defs = new Map(INCOME_LINES.map((l) => [l.code, l]));
    const valueOf = (code: string): number => {
      if (code in out) return out[code];
      const def = defs.get(code)!;
      const v = def.formula ? def.formula.reduce((s, [sign, ref]) => s + sign * valueOf(ref), 0) : r(src[code] ?? 0);
      return (out[code] = v);
    };
    for (const l of INCOME_LINES) valueOf(l.code);
    return out;
  };
  const hasPrev = Object.keys(f.prev).length > 0;
  return { cur: round(f.byCode), prev: hasPrev ? round(f.prev) : {} };
}
