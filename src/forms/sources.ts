import { synthetic } from '../engine/accounts';
import { BALANCE_LINES } from '../engine/balanceForm';
import type { Report } from '../engine/checks';
import { INCOME_LINES } from '../engine/incomeStatement';
import { buildLedger, yearEntries } from '../engine/ledger';
import { periodRange, type Quarter } from '../engine/period';
import { TAX_LINE_BY_ID } from '../engine/taxLines';
import { effectiveTax, taxSign } from '../engine/taxSuggest';
import type { Doc, Entry } from '../engine/types';
import { FORMS, FORM_IDS } from './defs';
import type { FormId } from './types';
import { evaluateAll, manualValues, roundToMing, type FormValues, type Grid } from './values';

/**
 * Values the books give the official forms (tiyin; rates ×100). Typed-in values win over these, and the
 * forms' formulas work out every total, so only leaf lines are filled here.
 */
export function autoValues(id: FormId, doc: Doc, quarter: Quarter, report: Report): Grid {
  switch (id) {
    case 'b1':
      return balanceValues(report);
    case 'b1-offbal':
      return offBalanceValues(doc, quarter);
    case 'f2':
      return incomeValues(report);
    case 'f2-budget':
      return budgetValues(doc, quarter);
    case 'tax':
      return { '070': { '3': Math.round(doc.taxRate * 100) } };
    case 'tax-1':
      return taxAnnexValues(doc, quarter).income;
    case 'tax-2':
      return taxAnnexValues(doc, quarter).expenses;
    default:
      return {};
  }
}

/** The books' values of the given forms (all by default); annexes 1 and 2 share one pass over the journal. */
export function autoAll(doc: Doc, quarter: Quarter, report: Report, ids: FormId[] = FORM_IDS): Partial<Record<FormId, Grid>> {
  let annexes: ReturnType<typeof taxAnnexValues> | undefined;
  const annex = () => (annexes ??= taxAnnexValues(doc, quarter));
  return Object.fromEntries(
    ids.map((id) => [id, id === 'tax-1' ? annex().income : id === 'tax-2' ? annex().expenses : autoValues(id, doc, quarter, report)]),
  );
}

/**
 * Every form as shown and filed: the books' values with what was typed in for the quarter. 1- and 2-shakl
 * in ming so'm round each line before the totals, as on the printed form; the tax forms stay in so'm.
 */
export function formSet(doc: Doc, quarter: Quarter, report: Report, unit: 'som' | 'ming', ids: FormId[] = FORM_IDS): Record<FormId, FormValues> {
  // forms refer only to forms of their own group (balance, 2-shakl, profit tax), so a group can be worked out alone
  const auto = autoAll(doc, quarter, report, ids);
  const manual: Partial<Record<FormId, Grid>> = {};
  for (const f of ids) {
    manual[f] = manualValues(doc, f, quarter);
    if (unit === 'ming' && FORMS[f].group !== 'tax') {
      auto[f] = roundToMing(f, auto[f] ?? {});
      manual[f] = roundToMing(f, manual[f]!);
    }
  }
  return evaluateAll(auto, manual, ids);
}

// ---- helpers ------------------------------------------------------------------------------------

const add = (g: Grid, line: string, col: string, v: number) => {
  if (!v) return;
  const row = (g[line] ??= {});
  row[col] = (row[col] ?? 0) + v;
};

const num4 = (code: string) => {
  const s = synthetic(code);
  return /^\d{4}$/.test(s) ? Number(s) : -1;
};

const under = (code: string, base: string) => {
  const c = code.trim();
  return c === base || c.startsWith(`${base}.`);
};

/** Entries of the period (from the start of the year) that are not year-end closing. */
function periodEntries(doc: Doc, quarter: Quarter): Entry[] {
  const { from, to } = periodRange(doc.year, quarter);
  return yearEntries(doc, to).filter(
    (e) => e.date >= from && !e.closing && !synthetic(e.debit).startsWith('99') && !synthetic(e.credit).startsWith('99'),
  );
}

const PENALTY = /jarima|penya|neustoyka|пеня|пени|штраф|неусто/i;
/** A penalty owed to the state, not to a counterparty. */
const TO_BUDGET = /soliq|byudjet|bojxona|inps|davlat|налог|бюджет|тамож/i;
const CHARITY = /xayriya|homiylik|благотвор|спонсор/i;
const GIFT = /sovg|подар/i;

// ---- 1-shakl and 2-shakl ------------------------------------------------------------------------

function balanceValues(report: Report): Grid {
  const g: Grid = {};
  for (const l of BALANCE_LINES) {
    // "of which overdue" lines are typed in (or come from the overdue annex)
    if (!l.code || l.manual) continue;
    const p = report.balance.byCode[l.code];
    if (p) g[l.code] = { '3': p.start, '4': p.end };
  }
  return g;
}

/** 2-shakl: columns 3/4 last year's income/expenses, 5/6 this period's; results come from the form's formulas. */
function incomeValues(report: Report): Grid {
  const g: Grid = {};
  const { byCode, prev } = report.income;
  for (const l of INCOME_LINES) {
    if (l.total) continue;
    const cur = byCode[l.code] ?? 0;
    const old = prev[l.code] ?? 0;
    if (l.col === 'inc') g[l.code] = { '3': old, '5': cur };
    else if (l.col === 'exp') g[l.code] = { '4': old, '6': cur };
    else g[l.code] = { '3': Math.max(0, old), '4': Math.max(0, -old), '5': Math.max(0, cur), '6': Math.max(0, -cur) };
  }
  return g;
}

/** Off-balance accounts 001–014 on lines 790–920, start and end of the period. */
function offBalanceValues(doc: Doc, quarter: Quarter): Grid {
  const { from, to } = periodRange(doc.year, quarter);
  const g: Grid = {};
  for (const [code, row] of buildLedger(doc, from, to)) {
    const base = synthetic(code);
    if (!/^0\d\d$/.test(base)) continue;
    const n = Number(base);
    if (n < 1 || n > 14) continue;
    const line = String(780 + n * 10);
    const r = (g[line] ??= { '3': 0, '4': 0 });
    r['3'] += row.open;
    r['4'] += row.close;
  }
  for (const [line, r] of Object.entries(g)) {
    if (!r['3'] && !r['4']) delete g[line];
    else g[line] = { '3': Math.abs(r['3']), '4': Math.abs(r['4']) };
  }
  return g;
}

// ---- budget payments (2-shakl annex, lines 280–480) ---------------------------------------------

/** Budget lines of a tax or fund account; INPS is part of personal income tax (290) and shown on its own in 291. */
function budgetLines(code: string, text: string): string[] {
  // turnover tax shares 6430 with profit tax; on the form it is the single tax payment
  if (under(code, '6430')) return /aylanma|оборот/i.test(text) ? ['370'] : ['280'];
  if (under(code, '6530.1')) return ['290', '291'];
  if (under(code, '6420')) return ['290'];
  if (under(code, '6410')) return ['310'];
  if (under(code, '6440')) return ['320'];
  if (under(code, '6450')) return ['350'];
  if (under(code, '6460')) return ['360'];
  if (under(code, '6490')) return ['400'];
  if (under(code, '6510') || under(code, '6520')) return ['440'];
  return [];
}

const isCash = (code: string) => num4(code) >= 5000 && num4(code) <= 5599;
/** Advance payments to the budget (44xx), but not input VAT (4410.1–4410.9). */
const isAdvance = (code: string) => num4(code) >= 4400 && num4(code) <= 4499 && (synthetic(code) !== '4410' || code.trim() === '4410.10');
const isBudget = (code: string) => /^6[45]\d\d$/.test(synthetic(code));
const isExpense = (code: string) => num4(code) >= 9100 && num4(code) <= 9799;

/**
 * Column 3 — due for the period: credits to the account less debits that are not payments (reversals, input VAT).
 * Column 4 — paid: debits against cash, bank or an advance already paid. Fines go to 470 whatever the account.
 */
function budgetValues(doc: Doc, quarter: Quarter): Grid {
  const g: Grid = {};
  let customsDue = 0;
  let customsPaid = 0;
  for (const e of periodEntries(doc, quarter)) {
    const paidFrom = isCash(e.credit) || isAdvance(e.credit);
    if (PENALTY.test(e.text)) {
      if (isExpense(e.debit) && isBudget(e.credit)) add(g, '470', '3', e.amount);
      // a tax penalty paid straight from the bank is due and paid at once
      if (isExpense(e.debit) && isCash(e.credit) && TO_BUDGET.test(e.text)) {
        add(g, '470', '3', e.amount);
        add(g, '470', '4', e.amount);
        continue;
      }
      if (isBudget(e.debit) && paidFrom) add(g, '470', '4', e.amount);
      if (isBudget(e.debit) || isBudget(e.credit)) continue;
    }
    for (const line of budgetLines(e.credit, e.text)) add(g, line, '3', e.amount);
    for (const line of budgetLines(e.debit, e.text)) add(g, line, paidFrom ? '4' : '3', paidFrom ? e.amount : -e.amount);
    // customs duty: charged from the customs advance into the goods' cost; paid from the bank to customs
    if (under(e.credit, '4490') && synthetic(e.debit) !== '4410' && !isCash(e.debit)) customsDue += e.amount;
    if (under(e.debit, '4490') && isCash(e.credit)) customsPaid += e.amount;
  }
  // the bank pays customs VAT and duty together: count as paid only what was charged as duty
  if (customsDue) g['450'] = { '3': customsDue, '4': Math.min(customsDue, customsPaid) };
  return g;
}

// ---- profit tax annexes 1 and 2 -----------------------------------------------------------------

function incomeLine(code: string): string {
  const n = num4(code);
  if (n >= 9000 && n <= 9099) return '021';
  if (n === 9530) return '050';
  if (n === 9310 || n === 9320) return '070';
  if (n === 9380 || n === 9382) return '090';
  if (n === 9360) return '110';
  if (n === 9520) return '120';
  if (n === 9540 || n === 9541) return '130';
  if (n === 9330) return '180';
  return '281';
}

/** Annex 2 detail line of an expense; non-deductible kinds (0119–0132) repeat in column 4 by formula. */
function expenseLine(e: Entry, account: string, nonDeductible: boolean): string {
  const other = account === e.debit ? e.credit : e.debit;
  if (nonDeductible) {
    if (PENALTY.test(e.text)) return isBudget(other) ? '0129' : '0132';
    if (CHARITY.test(e.text)) return '0122';
    if (GIFT.test(e.text)) return '0130';
    return '0128';
  }
  const n = num4(account);
  const o = synthetic(other);
  if (n >= 9120 && n <= 9129) return '0107';
  if (['6710', '6715', '6510', '6520'].includes(o)) return '0105';
  if (/^0[25]\d\d$/.test(o)) return '0106';
  if (under(account, '9431.4') || /ijara|аренд/i.test(e.text)) return '0111';
  if (n === 9610) return '0113';
  if (n === 9620 || n === 9621) return '0114';
  return '01371';
}

/** Entries tagged for profit tax (the journal's tax column), spread over the lines of annexes 1 and 2. */
function taxAnnexValues(doc: Doc, quarter: Quarter): { income: Grid; expenses: Grid } {
  const income: Grid = {};
  const expenses: Grid = {};
  for (const e of periodEntries(doc, quarter)) {
    const tag = effectiveTax(e);
    const def = tag.line ? TAX_LINE_BY_ID.get(tag.line) : undefined;
    if (!def) continue;
    const amount = taxSign(e, def.id) * e.amount;
    if (def.annex === 1) {
      add(income, incomeLine(synthetic(e.credit).startsWith('9') ? e.credit : e.debit), '3', amount);
      continue;
    }
    const account = synthetic(e.debit).startsWith('9') ? e.debit : e.credit;
    const main = num4(account) >= 9100 && num4(account) <= 9199 ? '020' : '030';
    add(expenses, main, '3', amount);
    if (tag.nonDeductible) add(expenses, main, '4', amount);
    add(expenses, expenseLine(e, account, !!tag.nonDeductible), '3', amount);
  }
  return { income, expenses };
}
