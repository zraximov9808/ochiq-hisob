import type { Analysis } from '../bank/analyze';
import type { Invoice } from '../audit/invoices';
import { synthetic } from '../engine/accounts';
import type { Entry, Opening, SubAccount } from '../engine/types';
import type { GtdItem } from '../stock/gtd';
import { bankEntries } from './bankEntries';
import { buildCosts } from './costing';
import { gtdEntries } from './gtdEntries';
import { invoiceEntries } from './invoiceEntries';
import { monthEndDrafts } from './monthEnd';
import { resolveDrafts, type ResolvedEntry } from './resolve';
import type { AutoDraft, AutoSettings, AutoWarning, RateBook, RateNeed } from './types';

export interface AutoInput {
  analysis: Analysis | null;
  invoices: Invoice[];
  gtd: GtdItem[];
  stockQty: Record<string, number>;
  /** All known rates: GTD < CBU < typed in by hand. */
  rates: RateBook;
  settings: AutoSettings;
  companyInn: string;
  opening: Opening[];
  /** Entries the user keyed in (not auto), for the payroll and overlap checks. */
  manualEntries: Entry[];
  year: number;
  company: { name: string; inn: string } | null;
  /** STIR of the open document; data of another company is not applied to it. */
  docCompanyInn?: string;
  /** Auto entries the user changed by hand, as they are in the journal (for month-end). */
  editedEntries?: Entry[];
}

export interface BuiltAuto {
  entries: ResolvedEntry[];
  added: SubAccount[];
  warnings: AutoWarning[];
  needRates: RateNeed[];
  company: { name: string; inn: string } | null;
}

const fmt = (tiyin: number) => (tiyin / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
const realInn = (inn?: string) => !!inn && /^\d{9}$|^\d{14}$/.test(inn.trim()) && !/^0+$/.test(inn.trim());
const empty = (input: AutoInput, warning: AutoWarning): BuiltAuto => ({ entries: [], added: [], warnings: [warning], needRates: [], company: input.company });

/** Whether freshly built entries should be written: there is data, it is this document's company, and something changed. */
export function shouldApply(x: { enabled: boolean; hasData: boolean; hash: string; inputHash: string; company: boolean }): boolean {
  return x.enabled && x.hasData && !x.company && x.hash !== x.inputHash;
}

/** buildAuto that never throws: an unexpected error becomes a warning and no entries. */
export function tryBuildAuto(input: AutoInput, subs: SubAccount[]): BuiltAuto {
  try {
    return buildAuto(input, subs);
  } catch (e) {
    return empty(input, { kind: 'error', text: `Avto-provodkalarni tuzishda xato: ${(e as Error)?.message ?? e}. Fayllarni qayta yuklab ko‘ring.` });
  }
}

/** All auto entries from bank statements, e-invoices and customs declarations, plus month-end entries and checks. */
export function buildAuto(input: AutoInput, subs: SubAccount[]): BuiltAuto {
  if (realInn(input.docCompanyInn) && realInn(input.companyInn) && input.docCompanyInn!.trim() !== input.companyInn.trim())
    return empty(input, {
      kind: 'company',
      text: `Yuklangan ma’lumot boshqa korxonaniki (STIR ${input.companyInn}), ochiq hujjat esa STIR ${input.docCompanyInn} uchun — avto-provodkalar yozilmadi. Shu korxona hujjatini oching yoki yangi hujjat yarating.`,
    });
  const s = input.settings;
  const declared = input.opening.some((o) => synthetic(o.account) === '8330' && o.credit > 0);
  const settings = { ...s, declareCapital: s.declareCapital && !declared };

  const bank = input.analysis ? bankEntries(input.analysis, settings, input.rates) : { drafts: [], warnings: [], needRates: [] };
  const costs = buildCosts(input.gtd, input.invoices, { companyInn: input.companyInn, includePending: s.includePending, qtyOverrides: input.stockQty, rates: input.rates });
  const inv = invoiceEntries(input.invoices, { companyInn: input.companyInn, s: settings, cogs: costs.cogs });
  const gtd = gtdEntries(input.gtd, input.rates);

  const seen = new Set<string>();
  const drafts: AutoDraft[] = [];
  for (const d of [...bank.drafts, ...inv.drafts, ...gtd.drafts]) {
    if (seen.has(d.src)) continue;
    seen.add(d.src);
    drafts.push(d);
  }

  const r1 = resolveDrafts(drafts, subs);
  // Month-end works on what the journal will hold: deleted sources left out, hand-edited ones as edited.
  const skip = new Set(s.skip);
  const edited = new Map((input.editedEntries ?? []).filter((e) => e.auto).map((e) => [e.auto!.src, e]));
  const journal: ResolvedEntry[] = [...r1.entries.filter((e) => !skip.has(e.auto!.src) && !edited.has(e.auto!.src)), ...edited.values()];
  const month = monthEndDrafts(journal, input.rates, r1.codeOf);
  const r2 = resolveDrafts(month.drafts, [...subs, ...r1.added]);
  const entries = [...r1.entries, ...r2.entries];

  const warnings: AutoWarning[] = [...bank.warnings, ...costs.warnings, ...inv.warnings, ...gtd.warnings, ...r1.warnings, ...month.warnings, ...r2.warnings];

  // Currency accounts that start the period with money: that balance is not in the revaluation.
  for (const a of input.analysis?.accounts ?? [])
    if (a.currency !== 'UZS' && a.openingBalance)
      warnings.push({ kind: 'fx-opening', text: `${a.currency} hisobi …${a.number.slice(-6)} davr boshida qoldiq bilan boshlanadi — bu qoldiq oy oxiri qayta baholashiga kirmaydi; kerak bo‘lsa kurs farqini qo‘lda kiriting`, ref: a.number });

  // Payroll: taxes on salaries are paid but no salary was accrued.
  const payrollTax = entries.some((e) => ['6420', '6510', '6520', '6530'].includes(synthetic(e.debit)));
  const accrued = [...entries, ...input.manualEntries].some((e) => synthetic(e.credit) === '6710');
  if (payrollTax && !accrued)
    warnings.push({ kind: 'payroll', text: 'JShDS / ijtimoiy soliq to‘langan, lekin ish haqi hisoblanmagan (6710 krediti yo‘q). Ish haqi hisoblash provodkalarini jurnalga qo‘lda kiriting (masalan, Dt 9420 Kt 6710, Dt 6710 Kt 6410, Dt 9420 Kt 6520).' });

  // Transit accounts should come back to zero once both legs of every transfer are loaded.
  const net = new Map<string, number>();
  for (const e of entries) {
    net.set(e.debit, (net.get(e.debit) ?? 0) + e.amount);
    net.set(e.credit, (net.get(e.credit) ?? 0) - e.amount);
  }
  for (const [code, v] of net)
    if (['5710', '5720'].includes(synthetic(code)) && v !== 0)
      warnings.push({ kind: 'transit', text: `${code} qoldig‘i ${fmt(v)} so‘m — o‘tkazmaning ikkinchi tomoni (boshqa hisob vipiskasi) yuklanmagan bo‘lishi mumkin`, ref: code, amount: Math.abs(v) });

  const outside = entries.filter((e) => !e.date.startsWith(String(input.year)));
  if (outside.length)
    warnings.push({ kind: 'year', text: `${outside.length} ta avto-provodka ${input.year}-yildan tashqarida — hisobotlarga kirmaydi (hujjat yilini tekshiring)`, amount: outside.length });

  if (entries.length) {
    const dates = entries.map((e) => e.date).sort();
    const from = dates[0];
    const to = dates[dates.length - 1];
    const BANKISH = new Set(['5110', '5210', '4010', '6010']);
    const overlap = input.manualEntries.filter((e) => !e.closing && e.date >= from && e.date <= to && (BANKISH.has(synthetic(e.debit)) || BANKISH.has(synthetic(e.credit))));
    if (overlap.length)
      warnings.push({ kind: 'manual-overlap', text: `Jurnalda shu davrda bank/hisob-kitob hisobvaraqlariga qo‘lda kiritilgan ${overlap.length} ta provodka bor — avto-provodkalar bilan ikki marta hisoblanishi mumkin`, amount: overlap.length });
  }
  if (input.manualEntries.some((e) => e.closing))
    warnings.push({ kind: 'closed-year', text: 'Yil yopilgan (yopish provodkalari bor) — avto-provodkalar o‘zgargani uchun yilni qayta yoping' });

  const uniq = new Map<string, AutoWarning>();
  for (const w of warnings) uniq.set(`${w.kind}|${w.ref ?? ''}|${w.text}`, w);
  const needs = new Map<string, RateNeed>();
  for (const n of [...bank.needRates, ...gtd.needRates, ...month.needRates]) needs.set(`${n.ccy}:${n.date}`, n);

  return { entries, added: [...r1.added, ...r2.added], warnings: [...uniq.values()], needRates: [...needs.values()], company: input.company };
}
