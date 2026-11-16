import type { Analysis } from '../bank/analyze';
import type { BankAccount } from '../bank/model';
import {
  DEFAULT_TYPE_ACCOUNTS, FOREIGN_BASE, FOREIGN_POOL, INTERNAL_FX, INTERNAL_UZS, NON_DEDUCTIBLE_TYPES, PAIRED_TRANSITS,
} from './defaults';
import { rateOn, toTiyin } from './rates';
import type { AccountRef, AutoDraft, AutoSettings, AutoWarning, Gen, RateBook, RateNeed } from './types';

const CAPITAL_TYPE = "Ustav fondiga hissa (ta'sischidan)";
const UNKNOWN_IN = '6990[Aniqlanmagan tushumlar]';
const UNKNOWN_OUT = '4890[Aniqlanmagan to‘lovlar]';

/** Default ledger account of a bank account: 5110 (settlement, so‘m), 5210 per currency account, 5530 for other so‘m accounts. */
export function defaultAccountExpr(acc: BankAccount, all: BankAccount[]): string {
  if (acc.currency !== 'UZS') return `5210[${acc.currency} ${acc.number}]`;
  if (!acc.balanceAcc.startsWith('202')) return `5530[${acc.number}]`;
  const settlement = all.filter((a) => a.currency === 'UZS' && a.balanceAcc.startsWith('202'));
  return settlement.length > 1 ? `5110[UZS ${acc.number}]` : '5110';
}

const realInn = (inn: string) => /^\d{9}$|^\d{14}$/.test(inn.trim()) && !/^0+$/.test(inn.trim());

/** Pairs the so‘m and currency legs of each paired transit and closes the difference to 9430 (loss) / 9390 (gain). */
function pairTransits(drafts: AutoDraft[]): AutoDraft[] {
  const out: AutoDraft[] = [];
  const byDate = (a: AutoDraft, b: AutoDraft) => a.date.localeCompare(b.date) || a.src.localeCompare(b.src);
  for (const t of PAIRED_TRANSITS) {
    const dr = drafts.filter((d) => d.debit.expr === t).sort(byDate);
    const cr = drafts.filter((d) => d.credit.expr === t).sort(byDate);
    for (let i = 0; i < Math.min(dr.length, cr.length); i++) {
      const diff = dr[i].amount - cr[i].amount;
      if (!diff) continue;
      const later = byDate(dr[i], cr[i]) > 0 ? dr[i] : cr[i];
      const base = { src: `pair:${later.src.replace(/^bank:/, '')}`, date: later.date, amount: Math.abs(diff) };
      out.push(
        diff > 0
          ? { ...base, text: 'Valyuta operatsiyasi bo‘yicha farq (zarar)', debit: { expr: '9430' }, credit: { expr: t } }
          : { ...base, text: 'Valyuta operatsiyasi bo‘yicha farq (foyda)', debit: { expr: t }, credit: { expr: '9390' } },
      );
    }
  }
  return out;
}

/** Draft entries for every bank operation: the bank account on one side, the type's account on the other. */
export function bankEntries(a: Analysis, s: AutoSettings, rates: RateBook): Gen {
  const drafts: AutoDraft[] = [];
  const warnings: AutoWarning[] = [];
  const need = new Map<string, RateNeed>();
  const table = { ...DEFAULT_TYPE_ACCOUNTS, ...s.types };
  const accounts = new Map(a.accounts.map((acc) => [acc.number, acc]));
  let unclassified = 0;
  let unclassifiedSum = 0;
  let capital = 0;

  for (const o of a.operations) {
    const acc = accounts.get(o.account);
    if (!acc) continue;
    const date = o.datetime.slice(0, 10);
    const isIn = o.credit > 0;
    const minor = isIn ? o.credit : o.debit;
    if (!minor) continue;
    const fxAcc = acc.currency !== 'UZS';
    let amount = minor;
    if (fxAcc) {
      const rate = rateOn(rates, acc.currency, date);
      if (rate === null) {
        const key = `${acc.currency}:${date}`;
        if (!need.has(key)) {
          need.set(key, { ccy: acc.currency, date });
          warnings.push({ kind: 'rate-missing', text: `${acc.currency} kursi ${date} uchun topilmadi — valyuta operatsiyasi provodkasiz qoldi`, ref: key });
        }
        continue;
      }
      amount = toTiyin(minor, rate);
    }

    const bankRef: AccountRef = { expr: s.accounts[acc.number] ?? defaultAccountExpr(acc, a.accounts), ...(fxAcc ? { fx: true } : {}) };
    const party = { inn: o.korrInn, name: o.korrName };
    let other: AccountRef;
    if (o.internal) {
      other = fxAcc ? { expr: INTERNAL_FX, fx: true } : { expr: INTERNAL_UZS };
    } else {
      const known = o.type in table;
      const isUnclassified = !o.manual && (o.ruleId === null || !known);
      let expr = known ? table[o.type] : isIn ? '4010.*' : '6010.*';
      if (isUnclassified) {
        unclassified++;
        unclassifiedSum += amount;
        if (!realInn(o.korrInn)) expr = isIn ? UNKNOWN_IN : UNKNOWN_OUT;
      }
      if (expr === FOREIGN_BASE) other = { expr: FOREIGN_POOL(acc.currency), ...(fxAcc ? { fx: true } : {}) };
      else other = { expr, party };
    }

    const d: AutoDraft = {
      src: `bank:${o.id}`,
      date,
      text: `${o.type} — ${o.korrName || o.purpose.slice(0, 60)}`,
      debit: isIn ? bankRef : other,
      credit: isIn ? other : bankRef,
      amount,
      ...(fxAcc ? { fx: { ccy: acc.currency, amount: minor } } : {}),
      ...(NON_DEDUCTIBLE_TYPES.has(o.type) ? { nonDeductible: true } : {}),
    };
    drafts.push(d);

    if (o.type === CAPITAL_TYPE && s.declareCapital && other.expr === '4610.*') {
      capital += amount;
      drafts.push({ src: `bank:${o.id}:capital`, date, text: `Ustav kapitaliga ulush (e’lon) — ${o.korrName}`, debit: { expr: '4610.*', party }, credit: { expr: '8330' }, amount });
    }
  }

  drafts.push(...pairTransits(drafts));
  if (unclassified)
    warnings.push({ kind: 'unclassified', text: `${unclassified} ta bank operatsiyasi qoidaga tushmadi — kontragent bo‘yicha 4010/6010 ga (STIR yo‘q bo‘lsa 6990/4890 ga) yozildi; “Bank vipiska” bo‘limida turini tekshiring`, amount: unclassifiedSum });
  if (capital)
    warnings.push({ kind: 'capital', text: 'Ustav kapitali ta’sischilar kiritgan ulushlar summasida e’lon qilingan deb olindi (Dt 4610 Kt 8330). E’lon qilingan summa boshqacha bo‘lsa, boshlang‘ich qoldiqqa 8330 ni kiriting.', amount: capital });
  return { drafts, warnings, needRates: [...need.values()] };
}
