import { isChartCode, synthetic } from './accounts';
import type { Doc, Entry } from './types';

/**
 * Documents written before the 1C chart (no `chart` mark) used codes whose meaning has since changed.
 * Everything else that changed stays on the same balance or 2-shakl line; these do not:
 * - 95xx financial income moved one place: old 9510 dividends, 9520 interest, 9530 leasing, 9550 revaluation,
 *   9560 other → new 9520, 9530, 9550, 9560, 9590;
 * - old 6410 held every tax; new 6410 is VAT only, so entries whose wording names another tax go to that tax's
 *   account (same balance line). Unclear ones stay: guessing would split one tax's payable from its payment.
 */
const SHIFT_95: Record<string, string> = { '9510': '9520', '9520': '9530', '9530': '9550', '9550': '9560', '9560': '9590' };

const VAT = /qqs|ндс|\bnds\b|qo.?shilgan qiymat/i;
const TAXES: Array<[RegExp, string]> = [
  [/jshds|ндфл|inps|jismoniy shaxs|daromad solig/i, '6420.1'],
  [/foyda solig|прибыл|aylanma|оборот/i, '6430'],
  [/mol-?mulk|имуществ/i, '6450'],
  [/yer solig|земел/i, '6460'],
];

/** What the old codes meant, for the prompt. */
export const OLD_MEANING: Record<string, string> = {
  '9510': 'dividendlar',
  '9520': 'foizlar',
  '9530': 'uzoq muddatli ijara (lizing)',
  '9550': 'qimmatli qog‘ozlarni qayta baholash',
  '9560': 'moliyaviy faoliyatning boshqa daromadlari',
  '6410': 'byudjetga barcha soliqlar',
};

export interface ChartRemap {
  from: string;
  to: string;
  count: number;
}

/** Entries the user wrote (automatic ones are rebuilt from the documents instead). */
const own = (e: Entry) => !e.auto || e.auto.edited;

/** The new code for one side of an old entry, or null when it keeps its code. */
function newCode(code: string, e: Entry, doc: Doc): string | null {
  const c = code.trim();
  const base = synthetic(c);
  if (SHIFT_95[base]) return SHIFT_95[base] + c.slice(base.length);
  if (c === '6410' || (base === '6410' && !isChartCode(c))) {
    const what = `${e.text} ${doc.subaccounts.find((s) => s.code === c)?.name ?? ''}`;
    if (VAT.test(what)) return null;
    return TAXES.find(([re]) => re.test(what))?.[1] ?? null;
  }
  return null;
}

/**
 * Written on the 1C chart although not marked (documents from before the mark existed): the user's own entries
 * use dotted 1C codes (9020.1, 6410.1), which the previous chart did not have.
 */
const onNewChart = (doc: Doc) => doc.entries.some((e) => own(e) && [e.debit, e.credit].some((c) => c.includes('.') && isChartCode(c.trim())));

/** What moving an old document to the 1C chart would change: entries per old → new code. Empty for new documents. */
export function planChartMigration(doc: Doc): ChartRemap[] {
  if (doc.chart === '1c' || onNewChart(doc)) return [];
  const counts = new Map<string, ChartRemap>();
  for (const e of doc.entries) {
    if (!own(e)) continue;
    const seen = new Set<string>();
    for (const side of [e.debit, e.credit]) {
      const to = newCode(side, e, doc);
      if (!to) continue;
      const from = synthetic(side);
      const key = `${from}>${to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const r = counts.get(key) ?? { from, to, count: 0 };
      r.count++;
      counts.set(key, r);
    }
  }
  return [...counts.values()].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
}

/** Moves an old document to the 1C chart in place (use inside actions.update: one undo step). */
export function applyChartMigration(d: Doc): void {
  if (d.chart === '1c') return;
  if (onNewChart(d)) {
    d.chart = '1c';
    return;
  }
  const snapshot = { ...d, entries: d.entries.map((e) => ({ ...e })), subaccounts: d.subaccounts.map((s) => ({ ...s })) } as Doc;
  d.entries.forEach((e, i) => {
    const orig = snapshot.entries[i];
    if (!own(orig)) return;
    e.debit = newCode(orig.debit, orig, snapshot) ?? e.debit;
    e.credit = newCode(orig.credit, orig, snapshot) ?? e.credit;
  });
  for (const s of d.subaccounts) {
    const to = SHIFT_95[s.parent];
    if (to) {
      s.code = to + s.code.slice(s.parent.length);
      s.parent = to;
    }
  }
  // automatic entries still carry old codes: an empty fingerprint makes the next sync rebuild them on the new chart
  if (d.auto) d.auto.inputHash = '';
  d.chart = '1c';
}
