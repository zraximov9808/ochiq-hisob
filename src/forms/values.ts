import { toMing } from '../engine/money';
import type { Quarter } from '../engine/period';
import type { Doc } from '../engine/types';
import { FORMS, FORM_IDS } from './defs';
import type { FormDef, FormId, LineDef } from './types';

/** line → column → value (tiyin; rates in percent ×100). */
export type Grid = Record<string, Record<string, number>>;

export interface Cell {
  v: number | null;
  /** The value came from the books (journal, bank, invoices), not typed in. */
  auto: boolean;
  /** Typed in over a value the books gave. */
  overridden?: boolean;
  /** Worked out by the form's formula; cannot be typed in. */
  computed?: boolean;
  /** Closed ("x") on the official form. */
  closed?: boolean;
}

export type FormValues = Record<string, Record<string, Cell>>;

// ---- stored values ------------------------------------------------------------------------------

export const formKey = (id: FormId, quarter: Quarter) => `${id}:${quarter}`;

export function manualValues(doc: Doc, id: FormId, quarter: Quarter): Grid {
  return doc.forms?.[formKey(id, quarter)] ?? {};
}

export function formNames(doc: Doc, id: FormId, quarter: Quarter): Record<string, string> {
  return doc.formNames?.[formKey(id, quarter)] ?? {};
}

/** Types a value into a form cell for one quarter; null clears it. Mutates the draft. */
export function setFormValue(d: Doc, id: FormId, quarter: Quarter, line: string, col: string, v: number | null): void {
  const key = formKey(id, quarter);
  d.forms ??= {};
  if (v === null) {
    const form = d.forms[key];
    if (!form?.[line]) return;
    delete form[line][col];
    if (!Object.keys(form[line]).length) delete form[line];
    if (!Object.keys(form).length) delete d.forms[key];
    return;
  }
  ((d.forms[key] ??= {})[line] ??= {})[col] = v;
}

/** Names a row the filer names (an overdue debtor, a benefit, an activity); an empty name clears it. */
export function setFormName(d: Doc, id: FormId, quarter: Quarter, line: string, name: string): void {
  const key = formKey(id, quarter);
  d.formNames ??= {};
  const text = name.trim();
  if (!text) {
    const names = d.formNames[key];
    if (!names) return;
    delete names[line];
    if (!Object.keys(names).length) delete d.formNames[key];
    return;
  }
  (d.formNames[key] ??= {})[line] = text;
}

// ---- formula language (see LineDef) -------------------------------------------------------------

export type Node =
  | { t: 'num'; v: number }
  | { t: 'ref'; form?: string; line: string; col?: string }
  | { t: 'neg'; a: Node }
  | { t: 'bin'; op: '+' | '-'; a: Node; b: Node }
  | { t: 'fn'; name: string; args: Node[] };

const ARITY: Record<string, number> = { max0: 1, min: 2, max: 2, or: 2, pct: 2, ratio: 2 };
const TOKEN = /\s*(?:\{([\w.-]+):(\d+)(?::(\d+))?\}|#(-?\d+(?:\.\d+)?)|(\d+)(?::(\d+))?|([a-z]\w*)|([-+(),]))/y;
const parsed = new Map<string, Node>();

export function parseFormula(src: string): Node {
  const hit = parsed.get(src);
  if (hit) return hit;
  type Tok = { k: 'node'; n: Node } | { k: 'fn'; name: string } | { k: 'p'; c: string };
  const toks: Tok[] = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < src.length) {
    if (!src.slice(TOKEN.lastIndex).trim()) break;
    const at = TOKEN.lastIndex;
    const m = TOKEN.exec(src);
    if (!m) throw new Error(`Formula "${src}": cannot read at ${at}`);
    if (m[1]) toks.push({ k: 'node', n: { t: 'ref', form: m[1], line: m[2], col: m[3] } });
    else if (m[4]) toks.push({ k: 'node', n: { t: 'num', v: Math.round(Number(m[4]) * 100) } });
    else if (m[5]) toks.push({ k: 'node', n: { t: 'ref', line: m[5], col: m[6] } });
    else if (m[7]) {
      if (!(m[7] in ARITY)) throw new Error(`Formula "${src}": unknown function ${m[7]}`);
      toks.push({ k: 'fn', name: m[7] });
    } else toks.push({ k: 'p', c: m[8] });
  }
  let i = 0;
  const isP = (c: string) => toks[i]?.k === 'p' && (toks[i] as { c: string }).c === c;
  const expect = (c: string) => {
    if (!isP(c)) throw new Error(`Formula "${src}": expected "${c}"`);
    i++;
  };
  const atom = (): Node => {
    const tok = toks[i];
    if (!tok) throw new Error(`Formula "${src}": ends too early`);
    if (isP('-')) {
      i++;
      return { t: 'neg', a: atom() };
    }
    if (isP('(')) {
      i++;
      const e = expr();
      expect(')');
      return e;
    }
    if (tok.k === 'node') {
      i++;
      return tok.n;
    }
    if (tok.k === 'fn') {
      i++;
      expect('(');
      const args = [expr()];
      while (isP(',')) {
        i++;
        args.push(expr());
      }
      expect(')');
      if (args.length !== ARITY[tok.name]) throw new Error(`Formula "${src}": ${tok.name} takes ${ARITY[tok.name]} arguments`);
      return { t: 'fn', name: tok.name, args };
    }
    throw new Error(`Formula "${src}": unexpected "${tok.c}"`);
  };
  const expr = (): Node => {
    let a = atom();
    while (isP('+') || isP('-')) {
      const op = (toks[i] as { c: '+' | '-' }).c;
      i++;
      a = { t: 'bin', op, a, b: atom() };
    }
    return a;
  };
  const node = expr();
  if (i < toks.length) throw new Error(`Formula "${src}": unexpected text after the end`);
  parsed.set(src, node);
  return node;
}

/** The formula that fills a cell, if any: a per-column record applies to its columns, a string to calculated cells. */
function cellFormula(def: FormDef, line: LineDef, col: string): string | undefined {
  const kind = line.cells?.[col];
  if (!kind || kind === 'x') return undefined;
  if (line.formula && typeof line.formula === 'object') {
    if (line.formula[col]) return line.formula[col];
  } else if (line.formula && kind === 'calc') return line.formula;
  // column formula of the number row ("11=3+4+8+9-10"): columns of the same line
  const cf = kind === 'calc' ? def.colFormulas[col] : undefined;
  return cf ? cf.replace(/\d+/g, (c) => `${line.code}:${c}`) : undefined;
}

// ---- evaluation ---------------------------------------------------------------------------------

const lineIndex = new Map<FormId, Map<string, LineDef>>();
function lineOf(id: FormId, code: string): LineDef | undefined {
  let idx = lineIndex.get(id);
  if (!idx) {
    idx = new Map(FORMS[id].lines.filter((l) => l.code).map((l) => [l.code!, l]));
    lineIndex.set(id, idx);
  }
  return idx.get(code);
}

const EMPTY: Cell = { v: null, auto: false };

/**
 * Every cell of the given forms. Typed-in values win over the books' values; formulas fill totals and may read
 * any other form (a reference to a form outside `ids` still evaluates it).
 */
export function evaluateAll(
  auto: Partial<Record<FormId, Grid>>,
  manual: Partial<Record<FormId, Grid>>,
  ids: FormId[] = FORM_IDS,
): Record<FormId, FormValues> {
  const memo = new Map<string, Cell>();
  const busy = new Set<string>();

  const rowsOf = (id: FormId, section: string) => Object.keys(manual[id] ?? {}).filter((k) => k.startsWith(`${section}.`));

  const sectionCell = (id: FormId, line: string, col: string): Cell | undefined => {
    const def = FORMS[id];
    if (!def.sections) return undefined;
    const sec = def.sections.find((s) => s.id === line);
    if (sec) {
      let v = 0;
      if (sec.rows) for (const r of rowsOf(id, sec.id)) v += manual[id]?.[r]?.[col] ?? 0;
      for (const s of sec.sum ?? []) v += num(id, s, col);
      return { v, auto: false, computed: true };
    }
    const m = manual[id]?.[line]?.[col];
    return m === undefined ? EMPTY : { v: m, auto: false };
  };

  const cell = (id: FormId, line: string, col: string): Cell => {
    const key = `${id}|${line}|${col}`;
    const hit = memo.get(key);
    if (hit) return hit;
    if (busy.has(key)) throw new Error(`Formula cycle at ${id} ${line}:${col}`);
    busy.add(key);
    try {
      const out = compute(id, line, col);
      memo.set(key, out);
      return out;
    } finally {
      busy.delete(key);
    }
  };

  const compute = (id: FormId, line: string, col: string): Cell => {
    const def = FORMS[id];
    if (!def) return EMPTY;
    const sc = sectionCell(id, line, col);
    if (sc) return sc;
    const l = lineOf(id, line);
    const kind = l?.cells?.[col];
    if (!l || !kind) return EMPTY;
    if (kind === 'x') return { v: null, auto: false, closed: true };
    const f = cellFormula(def, l, col);
    if (f) return { v: run(parseFormula(f), id, col), auto: false, computed: true };
    const m = manual[id]?.[line]?.[col];
    const a = auto[id]?.[line]?.[col];
    if (m !== undefined) return a !== undefined ? { v: m, auto: false, overridden: true } : { v: m, auto: false };
    if (a !== undefined) return { v: a, auto: true };
    return EMPTY;
  };

  const num = (id: FormId, line: string, col: string) => cell(id, line, col).v ?? 0;

  const run = (n: Node, id: FormId, col: string): number => {
    switch (n.t) {
      case 'num':
        return n.v;
      case 'ref': {
        const form = (n.form ?? id) as FormId;
        if (!FORMS[form]) throw new Error(`Unknown form ${n.form}`);
        return num(form, n.line, n.col ?? (n.form ? FORMS[form].columns[0].id : col));
      }
      case 'neg':
        return -run(n.a, id, col);
      case 'bin':
        return n.op === '+' ? run(n.a, id, col) + run(n.b, id, col) : run(n.a, id, col) - run(n.b, id, col);
      case 'fn': {
        const [a, b] = n.args.map((x) => run(x, id, col));
        switch (n.name) {
          case 'max0':
            return Math.max(0, a);
          case 'min':
            return Math.min(a, b);
          case 'max':
            return Math.max(a, b);
          case 'or':
            return a !== 0 ? a : b;
          case 'pct':
            return Math.round((a * b) / 10000);
          default: // ratio
            return b === 0 ? 0 : Math.round((a / b) * 10000);
        }
      }
    }
  };

  const out = {} as Record<FormId, FormValues>;
  for (const id of ids) {
    const def = FORMS[id];
    const values: FormValues = {};
    const lines = [
      ...def.lines.filter((l) => l.code).map((l) => l.code!),
      ...(def.sections ?? []).flatMap((s) => [s.id, ...(s.rows ? rowsOf(id, s.id) : [])]),
    ];
    for (const line of lines) {
      values[line] = {};
      for (const c of def.columns) values[line][c.id] = cell(id, line, c.id);
    }
    out[id] = values;
  }
  return out;
}

/** A rate or share in percent (the line's or the column's), not money. */
export function isRateCell(id: FormId, line: string, col: string): boolean {
  return !!(lineOf(id, line)?.rate || FORMS[id].columns.find((c) => c.id === col)?.rate);
}

/**
 * Forms filed in ming so'm: every typed or booked line is rounded on its own, so totals add up the rounded
 * lines as on the printed form. Rates are left as they are.
 */
export function roundToMing(id: FormId, grid: Grid): Grid {
  const out: Grid = {};
  for (const [line, cols] of Object.entries(grid)) {
    out[line] = {};
    for (const [col, v] of Object.entries(cols)) out[line][col] = isRateCell(id, line, col) ? v : toMing(v) * 100_000;
  }
  return out;
}

/** One form on its own; references to other forms read them with no values. */
export function evaluate(def: FormDef, auto: Grid, manual: Grid): FormValues {
  return evaluateAll({ [def.id]: auto }, { [def.id]: manual }, [def.id])[def.id];
}
