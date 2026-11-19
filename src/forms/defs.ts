import { normalizeUz } from '../engine/accounts';
import { GENERATED } from './defs.generated';
import type { CellKind, FormDef, FormId, LineDef, OverdueSection, RawFormDef } from './types';

/** Order of the form selector: balance and its annexes, 2-shakl and its annex, profit tax and its annexes. */
export const FORM_IDS: FormId[] = [
  'b1',
  'b1-offbal',
  'b1-overdue',
  'f2',
  'f2-budget',
  'tax',
  'tax-1',
  'tax-2',
  'tax-2.1',
  'tax-2.1a',
  'tax-2.1b',
  'tax-3',
  'tax-4',
  'tax-5',
  'tax-6',
  'tax-7',
  'tax-8',
  'tax-9',
  'tax-10',
  'tax-11',
];

const SHORT: Record<FormId, string> = {
  b1: 'Balans (1-shakl)',
  'b1-offbal': 'Balansdan tashqari schyotlar',
  'b1-overdue': 'Muddati o‘tgan qarzlar',
  f2: 'Moliyaviy natijalar (2-shakl)',
  'f2-budget': 'Byudjetga to‘lovlar',
  tax: 'Foyda solig‘i hisob-kitobi',
  'tax-1': '1-ilova. Daromadlar',
  'tax-2': '2-ilova. Xarajatlar',
  'tax-2.1': '2.1-ilova. Xarajatlar (tannarx bilan)',
  'tax-2.1a': '2.1(a)-ilova. Tannarx (moddalar)',
  'tax-2.1b': '2.1(b)-ilova. Tannarx (summa)',
  'tax-3': '3-ilova. Investitsiyaviy chegirma',
  'tax-4': '4-ilova. Asosiy vositalar amortizatsiyasi',
  'tax-5': '5-ilova. Nomoddiy aktivlar amortizatsiyasi',
  'tax-6': '6-ilova. Imtiyozlar',
  'tax-7': '7-ilova. Nol stavka',
  'tax-8': '8-ilova. O‘tgan yillar zarari',
  'tax-9': '9-ilova. Ayrim operatsiyalar zarari',
  'tax-10': '10-ilova. Chet elda to‘langan soliq',
  'tax-11': '11-ilova. Chet el dividendlari',
};

/** Columns that hold a rate or share in percent rather than money. */
const RATE_COLUMNS: Partial<Record<FormId, string[]>> = { 'tax-2.1a': ['4'], 'tax-6': ['4'], 'tax-7': ['4'] };

const TITLE: Partial<Record<FormId, string>> = {
  b1: 'Buxgalteriya balansi — 1-sonli shakl',
  f2: 'Moliyaviy natijalar to‘g‘risida hisobot — 2-sonli shakl',
};

interface Patch {
  /** null removes a formula the extractor read wrongly. */
  formula?: string | Record<string, string> | null;
  label?: string;
  cells?: Record<string, CellKind>;
  rate?: boolean;
}

const sum = (...codes: string[]) => codes.join(' + ');
const own = (code: string) => ({ '4': `${code}:3` });
const range = (from: number, to: number, pad = 4) => Array.from({ length: to - from + 1 }, (_, i) => String(from + i).padStart(pad, '0'));
const each = (codes: string[], patch: (code: string) => Patch) => Object.fromEntries(codes.map((c) => [c, patch(c)]));
/** Share of a line in the 3rd column of a total, in percent (6- and 7-ilova, 4th column). */
const share = (codes: string[], total: string) => each(codes, (c) => ({ formula: { '4': `ratio(${c}:3, ${total}:3)` } }));
/**
 * 2-shakl result line: a profit goes to the income column, a loss to the expense column. `net` is written with
 * I and E for the income and expense columns (3/4 last year, 5/6 this period).
 */
const result = (net: string): Patch => ({
  formula: Object.fromEntries(
    [
      ['3', '4'],
      ['5', '6'],
    ].flatMap(([i, e]) => {
      const n = net.replace(/:I\b/g, `:${i}`).replace(/:E\b/g, `:${e}`);
      return [
        [i, `max0(${n})`],
        [e, `max0(-(${n}))`],
      ];
    }),
  ),
});
const cost21 = {
  '050': { formula: sum('0501', '0502') },
  '060': { formula: sum('0601', '0602') },
  '0701': { formula: sum('0501', '0601') },
  '0702': { formula: sum('0502', '0602') },
  '080': { formula: sum('0801', '0802') },
  '090': { formula: sum('0901', '0902', '0903') },
};

/**
 * What the template text says but the extractor cannot read: references to other annexes, products and rates,
 * "but not less than zero" and lines the filer names. Rates are typed in percent (15 = 15 %).
 */
const PATCHES: Partial<Record<FormId, Record<string, Patch>>> = {
  f2: {
    '030': result('010:I - 020:E'),
    '100': result('030:I - 030:E - 040:E + 090:I'),
    '220': result('100:I - 100:E + 110:I - 170:E'),
    '240': result('220:I - 220:E + 230:I - 230:E'),
    '270': result('240:I - 240:E - 250:E - 260:E'),
  },
  tax: {
    '010': { formula: '{tax-1:010} - {tax-1:052} - {tax-1:060} - {tax-1:120} - {tax-1:131}' },
    '020': { formula: '{tax-2:010:3} - {tax-2:010:4} + {tax-2.1:010:3} - {tax-2.1:010:4}' },
    '040': { formula: '{tax-6:030:3}' },
    '050': { formula: '{tax-7:030:3}' },
    '060': { formula: 'max0(030 - 040 - 050)' },
    '061': { formula: '{tax-4:010:19} - {tax-4:010:22}' },
    '062': { formula: 'max0(060 - 061)' },
    // the rate comes from the settings (sources.ts), 15 % unless changed
    '070': { rate: true },
    '071': { cells: { '3': 'input' }, rate: true },
    '072': { cells: { '3': 'input' }, rate: true },
    '080': { formula: 'pct(062 - 063, or(072, 070)) + pct(063, 071)' },
    '130': { rate: true },
    '140': { formula: 'pct(120, 130)' },
    '150': { formula: '080 - 100 - 110 + 140 - {tax-10:090} + {tax-11:060}' },
  },
  'tax-1': {
    '020': { formula: 'max(021 + 022 + 023 + 024 + 025 + 026, 030 - 040)' },
    '021': { cells: { '3': 'input' } },
    '260': { formula: ['3', '4', '5', '6', '7', '8'].map((c) => `{tax-9:070:${c}}`).join(' + ') },
  },
  'tax-2': each(range(119, 132), (c) => ({ formula: own(c) })),
  'tax-2.1': {
    '020': {
      formula: {
        '3': '{tax-2.1a:090:5} + {tax-2.1a:090:7} + {tax-2.1b:090:4} + {tax-2.1b:090:6}',
        '4': '{tax-2.1a:090:6} + {tax-2.1a:090:8} + {tax-2.1b:090:5} + {tax-2.1b:090:7}',
      },
    },
    ...each(range(318, 331), (c) => ({ formula: own(c) })),
  },
  'tax-2.1a': {
    ...cost21,
    '0301': { formula: sum('0101', '0201') },
    '0302': { formula: sum('0102', '0202') },
    '0303': { formula: sum('0103', '0203') },
    '0304': { formula: sum('0104', '0204') },
  },
  'tax-2.1b': {
    ...cost21,
    '0401': { formula: { '3': 'ratio(040:3, 030:3)' }, rate: true },
    '08011': { formula: { '3': 'ratio(0801:3, 0701:3)' }, rate: true },
    '08021': { formula: { '3': 'ratio(0802:3, 0702:3)' }, rate: true },
  },
  'tax-3': {
    '040': { formula: 'pct(020, #20)' },
    '050': { formula: 'pct(030, #10)' },
  },
  'tax-4': {
    '010': { formula: sum('020', '030', '040', '050', '060', '070') },
    '020': { formula: sum('021', '022') },
    '030': { formula: '031' },
    '040': { formula: '041' },
    '050': { formula: sum('051', '052') },
    '060': { formula: '061' },
    '070': { formula: '071' },
  },
  'tax-6': {
    '010': { formula: { '3': '{tax-1:020}', '4': '#100' } },
    ...share(range(11, 16, 3), '010'),
    '020': { formula: '{tax:030}' },
    '040': { formula: '{tax-8:050:3} + {tax-8:050:4}' },
    '060': { formula: { '3': sum(...range(61, 66, 3)), '4': '#100' } },
    ...share(range(61, 66, 3), '060'),
  },
  'tax-7': {
    '010': { formula: { '3': '{tax-1:010}', '4': '#100' } },
    ...share(['011', '012', '013', '016'], '010'),
    '020': { formula: '{tax:030}' },
    ...share(['031', '032'], '030'),
  },
  'tax-8': {
    '020': { formula: { '3': '#0', '4': 'max0({tax:020} - {tax:010})' } },
    '030': { formula: 'max0({tax:030})' },
    '040': { formula: { '3': 'pct(030:3, #50)' } },
    '050': { formula: { '3': 'min(010:3, 040:3)', '4': 'min(010:4, or(040:4, max0(030:4 - 050:3)))' } },
    '060': { formula: { '3': sum(...range(601, 605)), '4': '010:4 + 020:4 - 050:4' } },
  },
  'tax-9': {
    '050': { formula: 'max0(020 - 030 + 040)' },
    '060': { formula: 'max0(030 - 040 - 020)' },
    '070': { formula: 'max0(050 - 010)' },
  },
  'tax-10': {
    '030': { formula: '{tax:010}' },
    '040': { formula: 'ratio(010, 030)', rate: true },
    '050': { formula: '{tax:062}' },
    '060': { formula: 'pct(050, 040)' },
    '070': { formula: '{tax:070}', rate: true },
    '080': { formula: 'pct(060, 070)' },
    '090': { formula: 'min(020, 080)' },
  },
  'tax-11': {
    '030': { rate: true },
    '040': { formula: 'pct(010, 030)' },
    '041': { formula: 'pct(0111, 030)' },
    '042': { formula: 'pct(0121, 030)' },
    '043': { formula: 'pct(012, 030)' },
    '052': { formula: 'pct(0122, 030)' },
    '054': { formula: 'pct(022, 030)' },
  },
};

const DEBT_COLUMNS = [
  { id: '3', num: '3', label: "Muddati o'tgan umumiy qarz" },
  { id: '4', num: '4', label: "Tashkilotga bog'liq bo'lmagan sabablar bo'yicha vujudga kelgan muddati o'tgan qarzlar / Jami" },
  { id: '5', num: '5', label: "shu jumladan: hukumat qarorlariga asosan oldindan haq to'lamay jo'natilgan (olingan) mahsulotlar bo'yicha muddati o'tgan qarzlar" },
  {
    id: '6',
    num: '6',
    label: "shu jumladan: davlat resurslari va jamg'armalaridan jo'natish ko'zda tutilgan xom ashyo va materiallar bo'yicha o'tkazilgan bo'nak to'lovlari summasi",
  },
  { id: '7', num: '7', label: "shu jumladan: hukumat qarorlari bo'yicha kechiktirilgan qarzlar" },
  {
    id: '8',
    num: '8',
    label:
      "shu jumladan: qonunchilikka muvofiq da'volar bo'yicha sud jarayonida ko'rib chiqilayotgan yoki xo'jalik sudi tomonidan kreditorlardan undirish to'g'risida qaror chiqqan qarzlar summasi",
  },
];

const DEBT_SECTIONS: OverdueSection[] = [
  { id: 'd', num: '1', label: "Muddati o'tgan qarzdorlikka ega bo'lgan debitorlar, jami", sum: ['d-in', 'd-out'] },
  { id: 'd-in', num: '2', label: "Respublika ichidagi muddati o'tgan qarzlar, jami", rows: true, sum: ['d-dep'] },
  { id: 'd-dep', num: '2.2', label: "Ichki idoraviy muddati o'tgan qarzlar, jami", rows: true },
  { id: 'd-out', num: '3', label: "Respublikadan tashqaridagi muddati o'tgan qarzlar, jami", rows: true },
  { id: 'c', num: '4', label: "Muddati o'tgan qarzdorlikka ega bo'lgan kreditorlar, jami", sum: ['c-in', 'c-out'] },
  { id: 'c-in', num: '5', label: "Respublika ichidagi muddati o'tgan qarzlar, jami", rows: true, sum: ['c-dep'] },
  { id: 'c-dep', num: '5.2', label: "Ichki idoraviy muddati o'tgan qarzlar, jami", rows: true },
  { id: 'c-out', num: '6', label: "Respublikadan tashqaridagi muddati o'tgan qarzlar, jami", rows: true },
];

const OVERDUE: RawFormDef & { sections: OverdueSection[] } = {
  id: 'b1-overdue',
  group: 'balance',
  title: "Muddati o'tgan debitorlik va kreditorlik qarzlari rasshifrovkasi",
  columns: DEBT_COLUMNS,
  colFormulas: {},
  lines: [
    { kind: 'header', label: "Muddati o'tgan debitorlik qarzlari" },
    { kind: 'header', label: "Muddati o'tgan kreditorlik qarzlari" },
  ],
  sections: DEBT_SECTIONS,
};

function patchLine(line: LineDef, patch: Patch | undefined): LineDef {
  const out: LineDef = { ...line, label: normalizeUz(patch?.label ?? line.label) };
  if (!patch) return out;
  if (patch.formula === null) delete out.formula;
  else if (patch.formula !== undefined) out.formula = patch.formula;
  if (patch.cells) out.cells = { ...out.cells, ...patch.cells };
  if (patch.rate) out.rate = true;
  return out;
}

function build(id: FormId): FormDef {
  const raw: RawFormDef & { sections?: OverdueSection[] } = id === 'b1-overdue' ? OVERDUE : GENERATED[id];
  if (!raw) throw new Error(`No template for form ${id}`);
  const patches = PATCHES[id] ?? {};
  const codes = new Set(raw.lines.map((l) => l.code));
  const stray = Object.keys(patches).filter((code) => !codes.has(code));
  if (stray.length) throw new Error(`Form ${id} has no lines ${stray.join(', ')}`);
  const rateCols = RATE_COLUMNS[id] ?? [];
  return {
    ...raw,
    id,
    short: SHORT[id],
    title: normalizeUz(TITLE[id] ?? raw.title),
    columns: raw.columns.map((c) => ({ ...c, label: normalizeUz(c.label), ...(rateCols.includes(c.id) ? { rate: true } : {}) })),
    lines: raw.lines.map((l) => patchLine(l, l.code ? patches[l.code] : undefined)),
    sections: raw.sections?.map((s) => ({ ...s, label: normalizeUz(s.label) })),
  };
}

export const FORMS = Object.fromEntries(FORM_IDS.map((id) => [id, build(id)])) as Record<FormId, FormDef>;

/** Lines with a code, in form order. */
export const lineCodes = (id: FormId) => FORMS[id].lines.filter((l) => l.code).map((l) => l.code!);
