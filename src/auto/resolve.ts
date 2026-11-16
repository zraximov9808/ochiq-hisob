import { CHART } from '../engine/accounts';
import { nextSubCode } from '../engine/subaccounts';
import { suggestTax } from '../engine/taxSuggest';
import type { Entry, SubAccount } from '../engine/types';
import type { AccountRef, AutoDraft, AutoWarning, Party } from './types';

/** An auto entry plus what month-end revaluation needs to know about its currency sides. */
export type ResolvedEntry = Entry & { fx?: { ccy: string; amount: number }; fxDebit?: boolean; fxCredit?: boolean };

const POSTABLE = new Set(CHART.filter((a) => !a.group && !a.offBalance).map((a) => a.code));

export function parseExpr(expr: string): { base: string; kind: 'plain' | 'party' | 'named' | 'sub'; name?: string } | null {
  const e = expr.trim();
  const m = /^(\d{4})(?:(\.\*)|\[(.+)\]|\.(\d+))?$/.exec(e);
  if (!m || !POSTABLE.has(m[1])) return null;
  if (m[2]) return { base: m[1], kind: 'party' };
  if (m[3] !== undefined) return { base: m[1], kind: 'named', name: m[3].trim() };
  if (m[4] !== undefined) return { base: m[1], kind: 'sub' };
  return { base: m[1], kind: 'plain' };
}

/** A real INN: 9 or 14 digits and not a placeholder of zeros. */
const realInn = (inn: string) => (/^\d{9}$|^\d{14}$/.test(inn.trim()) && !/^0+$/.test(inn.trim()) ? inn.trim() : '');
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function resolveDrafts(
  drafts: AutoDraft[],
  subs: SubAccount[],
): { entries: ResolvedEntry[]; added: SubAccount[]; codeOf: (expr: string) => string | undefined; warnings: AutoWarning[] } {
  const all = [...subs];
  const added: SubAccount[] = [];
  const warnings: AutoWarning[] = [];

  const open = (base: string, name: string, stir: string): string => {
    const code = nextSubCode(base, name, stir, all);
    const sub: SubAccount = stir ? { code, parent: base, name, stir } : { code, parent: base, name };
    all.push(sub);
    added.push(sub);
    return code;
  };

  const lookup = (expr: string): string | undefined => {
    const p = parseExpr(expr);
    if (!p) return undefined;
    if (p.kind === 'plain') return p.base;
    if (p.kind === 'sub') return all.some((s) => s.code === expr.trim()) ? expr.trim() : undefined;
    if (p.kind === 'named') return all.find((s) => s.parent === p.base && sameName(s.name, p.name!))?.code;
    return undefined;
  };

  const resolve = (ref: AccountRef): string | undefined => {
    const p = parseExpr(ref.expr);
    if (!p) return undefined;
    if (p.kind === 'named') return lookup(ref.expr) ?? open(p.base, p.name!, '');
    if (p.kind !== 'party') return lookup(ref.expr);
    const party: Party = ref.party ?? { inn: '', name: '' };
    const inn = realInn(party.inn);
    const name = party.name.trim();
    if (!inn && !name) return p.base;
    const found = all.find((s) => s.parent === p.base && ((inn && s.stir === inn) || (name && sameName(s.name, name))));
    return found?.code ?? open(p.base, name || inn, inn);
  };

  const entries: ResolvedEntry[] = [];
  for (const d of drafts) {
    if (!(d.amount > 0)) continue;
    const debit = resolve(d.debit);
    const credit = resolve(d.credit);
    if (!debit || !credit) {
      const bad = !debit ? d.debit.expr : d.credit.expr;
      warnings.push({ kind: 'bad-expr', text: `Hisobvaraq noto‘g‘ri yoki rejada yo‘q: “${bad}” (${d.text})`, ref: d.src, amount: d.amount });
      continue;
    }
    const e: ResolvedEntry = { id: `a:${d.src}`, date: d.date, text: d.text, debit, credit, amount: d.amount, auto: { src: d.src } };
    if (d.nonDeductible) e.tax = { ...suggestTax(e), nonDeductible: true, manual: true };
    if (d.fx) {
      e.fx = d.fx;
      if (d.debit.fx) e.fxDebit = true;
      if (d.credit.fx) e.fxCredit = true;
    }
    entries.push(e);
  }
  return { entries, added, codeOf: lookup, warnings };
}
