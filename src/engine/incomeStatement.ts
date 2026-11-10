import { normalizeUz, synthetic } from './accounts';
import { yearEntries } from './ledger';
import { periodRange, type Quarter } from './period';
import type { Doc, Entry } from './types';

/**
 * 2-shakl "Moliyaviy natijalar to‘g‘risida hisobot".
 * col: 'inc' lines are income (credit − debit), 'exp' lines are expenses (debit − credit),
 * 'res' lines are results: positive = profit (income column), negative = loss (expense column).
 */
export interface IncomeLineDef {
  code: string;
  label: string;
  col: 'inc' | 'exp' | 'res';
  total?: boolean;
  range?: [number, number];
  formula?: Array<[1 | -1, string]>;
}

const RAW: IncomeLineDef[] = [
  { code: '010', label: "Mahsulot (tovar, ish va xizmat)larni sotishdan sof tushum", col: 'inc', range: [9000, 9099] },
  { code: '020', label: "Sotilgan mahsulot (tovar, ish va xizmat)larning tannarxi", col: 'exp', range: [9100, 9199] },
  { code: '030', label: "Mahsulot (tovar, ish va xizmat)larni sotishning yalpi foydasi (zarari) (satr. 010-020)", col: 'res', total: true, formula: [[1, '010'], [-1, '020']] },
  { code: '040', label: "Davr xarajatlari, jami (satr. 050+060+070+080), shu jumladan:", col: 'exp', total: true, formula: [[1, '050'], [1, '060'], [1, '070'], [1, '080']] },
  { code: '050', label: 'Sotish xarajatlari', col: 'exp', range: [9410, 9419] },
  { code: '060', label: "Ma'muriy xarajatlar", col: 'exp', range: [9420, 9429] },
  { code: '070', label: 'Boshqa operatsion xarajatlar', col: 'exp', range: [9430, 9439] },
  { code: '080', label: "Hisobot davrining soliq solinadigan foydadan kelgusida chegiriladigan xarajatlari", col: 'exp', range: [9440, 9499] },
  { code: '090', label: 'Asosiy faoliyatning boshqa daromadlari', col: 'inc', range: [9300, 9399] },
  { code: '100', label: "Asosiy faoliyatning foydasi (zarari) (satr. 030-040+090)", col: 'res', total: true, formula: [[1, '030'], [-1, '040'], [1, '090']] },
  { code: '110', label: "Moliyaviy faoliyatning daromadlari, jami (satr. 120+130+140+150+160), shu jumladan:", col: 'inc', total: true, formula: [[1, '120'], [1, '130'], [1, '140'], [1, '150'], [1, '160']] },
  { code: '120', label: 'Dividendlar shaklidagi daromadlar', col: 'inc', range: [9510, 9519] },
  { code: '130', label: 'Foizlar shaklidagi daromadlar', col: 'inc', range: [9520, 9529] },
  { code: '140', label: "Uzoq muddatli ijara (lizing)dan daromadlar", col: 'inc', range: [9530, 9539] },
  { code: '150', label: 'Valyuta kursi farqidan daromadlar', col: 'inc', range: [9540, 9549] },
  { code: '160', label: 'Moliyaviy faoliyatning boshqa daromadlari', col: 'inc', range: [9550, 9599] },
  { code: '170', label: "Moliyaviy faoliyat bo'yicha xarajatlar (satr. 180+190+200+210), shu jumladan:", col: 'exp', total: true, formula: [[1, '180'], [1, '190'], [1, '200'], [1, '210']] },
  { code: '180', label: 'Foizlar shaklidagi xarajatlar', col: 'exp', range: [9610, 9619] },
  { code: '190', label: "Uzoq muddatli ijara (lizing) bo'yicha foizlar shaklidagi xarajatlar", col: 'exp' },
  { code: '200', label: 'Valyuta kursi farqidan zararlar', col: 'exp', range: [9620, 9629] },
  { code: '210', label: "Moliyaviy faoliyat bo'yicha boshqa xarajatlar", col: 'exp', range: [9630, 9699] },
  { code: '220', label: "Umumxo'jalik faoliyatining foydasi (zarari) (satr. 100+110-170)", col: 'res', total: true, formula: [[1, '100'], [1, '110'], [-1, '170']] },
  { code: '230', label: 'Favqulodda foyda va zararlar', col: 'res', range: [9700, 9799] },
  { code: '240', label: "Foyda solig'ini to'lagunga qadar foyda (zarar) (satr. 220+/-230)", col: 'res', total: true, formula: [[1, '220'], [1, '230']] },
  { code: '250', label: "Foyda solig'i", col: 'exp', range: [9810, 9819] },
  { code: '260', label: "Foydadan boshqa soliqlar va yig'imlar", col: 'exp', range: [9820, 9899] },
  { code: '270', label: "Hisobot davrining sof foydasi (zarari) (satr. 240-250-260)", col: 'res', total: true, formula: [[1, '240'], [-1, '250'], [-1, '260']] },
];

export const INCOME_LINES: IncomeLineDef[] = RAW.map((l) => ({ ...l, label: normalizeUz(l.label) }));

export interface IncomeForm {
  lines: IncomeLineDef[];
  /** Current period values: income/expense lines positive, result lines signed. */
  byCode: Record<string, number>;
  prev: Record<string, number>;
  contrib: Record<string, Array<{ account: string; amount: number }>>;
  /** P&L accounts with turnover that no 2-shakl line takes (e.g. transit 9200). */
  unmapped: string[];
  period: { from: string; to: string };
}

const isClosingAccount = (code: string) => synthetic(code).startsWith('99');

/** Entries that form the period result: in the period and not closing entries through 99xx. */
export function resultEntries(doc: Doc, from: string, to: string): Entry[] {
  return yearEntries(doc, to).filter(
    (e) => e.date >= from && !isClosingAccount(e.debit) && !isClosingAccount(e.credit),
  );
}

export function incomeLineFor(code: string): IncomeLineDef | undefined {
  const syn = synthetic(code);
  if (syn.length !== 4 || !syn.startsWith('9')) return undefined;
  const n = Number(syn);
  return INCOME_LINES.find((l) => l.range && n >= l.range[0] && n <= l.range[1]);
}

export function buildIncome(doc: Doc, quarter: Quarter): IncomeForm {
  const { from, to } = periodRange(doc.year, quarter);
  /** credit − debit turnover per P&L leaf account. */
  const net = new Map<string, number>();
  for (const e of resultEntries(doc, from, to)) {
    for (const [code, sign] of [[e.debit, -1], [e.credit, 1]] as const) {
      const syn = synthetic(code);
      if (!syn.startsWith('9') || syn.length !== 4) continue;
      net.set(code.trim(), (net.get(code.trim()) ?? 0) + sign * e.amount);
    }
  }

  const leaf: Record<string, number> = {};
  const contrib: IncomeForm['contrib'] = {};
  const unmapped: string[] = [];
  for (const [code, credMinusDeb] of net) {
    if (credMinusDeb === 0) continue;
    const line = incomeLineFor(code);
    if (!line) {
      unmapped.push(code);
      continue;
    }
    const value = line.col === 'exp' ? -credMinusDeb : credMinusDeb;
    leaf[line.code] = (leaf[line.code] ?? 0) + value;
    (contrib[line.code] ??= []).push({ account: code, amount: value });
  }

  const byCode: Record<string, number> = {};
  const defs = new Map(INCOME_LINES.map((l) => [l.code, l]));
  const valueOf = (code: string): number => {
    if (code in byCode) return byCode[code];
    const def = defs.get(code)!;
    const v = def.formula ? def.formula.reduce((s, [sign, ref]) => s + sign * valueOf(ref), 0) : leaf[code] ?? 0;
    return (byCode[code] = v);
  };
  for (const l of INCOME_LINES) valueOf(l.code);
  for (const list of Object.values(contrib)) list.sort((a, b) => a.account.localeCompare(b.account));

  return { lines: INCOME_LINES, byCode, prev: { ...doc.prevYear }, contrib, unmapped: unmapped.sort(), period: { from, to } };
}
