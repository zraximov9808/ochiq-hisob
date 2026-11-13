import { currencyOf } from './parsers/formatA';
import type { Group, RawOperation } from './model';

/**
 * A classification rule. Every condition that is set must hold; inside a list any one item is enough.
 * `purposeAll` items must all be present; an item may hold alternatives separated by "|".
 */
export interface Rule {
  id: string;
  group: Group;
  type: string;
  direction: 'debit' | 'credit' | 'any';
  currency?: string;
  currencyNot?: string;
  /** Prefix of the statement's own account (e.g. "22613", "235"). */
  accountPrefix?: string[];
  korrAccountPrefix?: string[];
  korrNameIncludes?: string[];
  purposeIncludes?: string[];
  purposeAll?: string[];
  priority: number;
  disabled?: boolean;
}

export interface Classification {
  group: Group;
  type: string;
  ruleId: string | null;
}

export const FALLBACK_CREDIT = 'Mijozdan tushum (tovar/xizmat)';
export const FALLBACK_DEBIT = "Yetkazib beruvchiga to'lov (tovar/xizmat)";

/** Upper case, ё→е, Uzbek Cyrillic letters folded (Қ→К, Ғ→Г, Ў→У, Ҳ→Х), all apostrophes → '. */
export function normalizeText(s: string): string {
  return s
    .toUpperCase()
    .replace(/Ё/g, 'Е')
    .replace(/Қ/g, 'К')
    .replace(/Ғ/g, 'Г')
    .replace(/Ў/g, 'У')
    .replace(/Ҳ/g, 'Х')
    .replace(/[‘’ʻʼ`´]/g, "'");
}

interface Compiled {
  rule: Rule;
  purposeIncludes?: string[];
  purposeAll?: string[][];
  korrNameIncludes?: string[];
}

const cache = new WeakMap<Rule[], Compiled[]>();

function compile(rules: Rule[]): Compiled[] {
  let c = cache.get(rules);
  if (!c) {
    const norm = (xs?: string[]) => xs?.filter(Boolean).map(normalizeText);
    c = rules
      .map((rule, i) => ({ rule, i }))
      .filter(({ rule }) => !rule.disabled)
      .sort((a, b) => b.rule.priority - a.rule.priority || a.i - b.i)
      .map(({ rule }) => ({
        rule,
        purposeIncludes: norm(rule.purposeIncludes),
        purposeAll: rule.purposeAll?.map((x) => x.split('|').map(normalizeText)),
        korrNameIncludes: norm(rule.korrNameIncludes),
      }));
    cache.set(rules, c);
  }
  return c;
}

const anyPrefix = (s: string, list?: string[]) => !list?.length || list.some((p) => s.startsWith(p));
const anyIn = (s: string, list?: string[]) => !list?.length || list.some((p) => s.includes(p));

export function matches(c: Compiled, op: RawOperation, purpose: string, korrName: string, currency: string): boolean {
  const r = c.rule;
  if (r.direction === 'debit' && !(op.debit > 0)) return false;
  if (r.direction === 'credit' && !(op.credit > 0)) return false;
  if (r.currency && currency !== r.currency) return false;
  if (r.currencyNot && currency === r.currencyNot) return false;
  if (!anyPrefix(op.account, r.accountPrefix)) return false;
  if (!anyPrefix(op.korrAccount, r.korrAccountPrefix)) return false;
  if (!anyIn(korrName, c.korrNameIncludes)) return false;
  if (!anyIn(purpose, c.purposeIncludes)) return false;
  if (c.purposeAll && !c.purposeAll.every((alts) => alts.some((a) => purpose.includes(a)))) return false;
  return true;
}

/** The first matching rule by priority; otherwise the fallback type for the direction. */
export function classify(op: RawOperation, rules: Rule[]): Classification {
  const purpose = normalizeText(op.purpose);
  const korrName = normalizeText(op.korrName);
  const currency = currencyOf(op.account);
  for (const c of compile(rules)) {
    if (matches(c, op, purpose, korrName, currency)) return { group: c.rule.group, type: c.rule.type, ruleId: c.rule.id };
  }
  return op.credit > 0
    ? { group: 'Kirim', type: FALLBACK_CREDIT, ruleId: null }
    : { group: 'Chiqim', type: FALLBACK_DEBIT, ruleId: null };
}
