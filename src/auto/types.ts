/** Counterparty of an operation; INN may be empty. */
export interface Party {
  inn: string;
  name: string;
}

/**
 * One side of a draft entry. `expr` is an account expression:
 * `9690` (chart account), `6010.*` (subaccount per counterparty), `6010[Name]` (named subaccount), `6010.05` (existing subaccount).
 * `fx`: this side is followed in foreign currency (revalued at month end).
 */
export interface AccountRef {
  expr: string;
  party?: Party;
  fx?: boolean;
}

/** An entry before account expressions are turned into codes. Money in tiyin. */
export interface AutoDraft {
  /** Stable source key: the same operation always gives the same key. */
  src: string;
  date: string;
  text: string;
  debit: AccountRef;
  credit: AccountRef;
  amount: number;
  /** Amount in foreign currency (minor units) for the sides marked `fx`. */
  fx?: { ccy: string; amount: number };
  /** Not deductible for profit tax (penalties, gifts). */
  nonDeductible?: boolean;
}

export type WarningKind =
  | 'rate-missing'
  | 'no-cost'
  | 'gtd-no-qty'
  | 'gtd-no-value'
  | 'brief-invoice'
  | 'payroll'
  | 'unclassified'
  | 'transit'
  | 'year'
  | 'capital'
  | 'manual-overlap'
  | 'closed-year'
  | 'bad-expr'
  | 'export-gtd'
  | 'bad-date'
  | 'company'
  | 'rate-approx'
  | 'gtd-no-currency'
  | 'negative'
  | 'fx-opening'
  | 'error';

export interface AutoWarning {
  kind: WarningKind;
  text: string;
  ref?: string;
  amount?: number;
}

export interface RateNeed {
  ccy: string;
  date: string;
}

/** Output of one generator. */
export interface Gen {
  drafts: AutoDraft[];
  warnings: AutoWarning[];
  needRates: RateNeed[];
}

/** `${CCY}:${yyyy-mm-dd}` → so‘m per one unit. */
export type RateBook = Record<string, number>;

export interface AutoSettings {
  enabled: boolean;
  /** Hash of the inputs the auto entries were last built from. */
  inputHash: string;
  /** Sources whose entries the user deleted. */
  skip: string[];
  /** Bank account number → account expression. */
  accounts: Record<string, string>;
  /** Bank operation type → account expression. */
  types: Record<string, string>;
  /** Supplier INN → expense account for its services. */
  services: Record<string, string>;
  serviceDefault: string;
  includePending: boolean;
  declareCapital: boolean;
  /** Rates typed in by hand. */
  rates: RateBook;
}
