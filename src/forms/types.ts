export type FormId =
  | 'b1'
  | 'b1-offbal'
  | 'b1-overdue'
  | 'f2'
  | 'f2-budget'
  | 'tax'
  | 'tax-1'
  | 'tax-2'
  | 'tax-2.1'
  | 'tax-2.1a'
  | 'tax-2.1b'
  | 'tax-3'
  | 'tax-4'
  | 'tax-5'
  | 'tax-6'
  | 'tax-7'
  | 'tax-8'
  | 'tax-9'
  | 'tax-10'
  | 'tax-11';

export type FormGroup = 'balance' | 'income' | 'tax';

/** x — closed cell, calc — calculated (formula or automatic), input — typed in. */
export type CellKind = 'x' | 'calc' | 'input';

export interface ColumnDef {
  /** Column number of the official form ("3"). */
  id: string;
  num: string;
  label: string;
  /** The column holds a rate or share in percent, not money. */
  rate?: boolean;
}

/**
 * Formula language: same-form line `010` (same column), line in another column `020:3`, another form
 * `{tax-1:010}` (its first column) or `{tax-4:010:19}`, numbers `#15` (so'm, or percent on rate cells),
 * `+`, `-`, parentheses and functions `max0(x)`, `min(a, b)`, `max(a, b)`, `or(a, b)` (a unless it is zero),
 * `pct(amount, rate)` (amount × rate %), `ratio(a, b)` (a / b in percent).
 * A string formula fills every calculated cell of the line; a record gives one formula per column.
 */
export interface LineDef {
  code?: string;
  label: string;
  kind: 'header' | 'line';
  formula?: string | Record<string, string>;
  cells?: Record<string, CellKind>;
  /** A rate in percent, not a sum of money. */
  rate?: boolean;
}

export interface RawFormDef {
  id: string;
  group: FormGroup;
  title: string;
  columns: ColumnDef[];
  /** Column formulas within a line, from the number row ("11" = "3 + 4 + 8 + 9 - 10"). */
  colFormulas: Record<string, string>;
  lines: LineDef[];
}

/** Section of the overdue-debts annex: a total over rows the user names. */
export interface OverdueSection {
  id: string;
  num: string;
  label: string;
  /** Sections whose totals add up to this one. */
  sum?: string[];
  /** Rows named by the user live in this section. */
  rows?: boolean;
}

export interface FormDef extends RawFormDef {
  id: FormId;
  /** Name in the form selector. */
  short: string;
  sections?: OverdueSection[];
}
