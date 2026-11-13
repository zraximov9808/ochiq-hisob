/**
 * Bank statement model. Money is integer tiyin (cents); account, INN and document numbers are text.
 * Dates are ISO strings: 'yyyy-mm-dd' for days, 'yyyy-mm-ddTHH:MM:SS' for operation times.
 */
export type Cell = unknown;
export type Currency = string;
export type Group = 'Kirim' | 'Chiqim' | 'Soliqlar';

export type FlagCode =
  | 'UNCLASSIFIED'
  | 'FOUNDER_SALES_CASH'
  | 'FOUNDER_PAYER_MISMATCH'
  | 'TAX_ENFORCED'
  | 'PENALTY'
  | 'POSSIBLE_FIXED_ASSET'
  | 'VAGUE_PURPOSE'
  | 'MISSING_STATEMENT'
  | 'NEGATIVE_BALANCE'
  | 'LARGE_ROUND_CASH'
  | 'FX_FEE_UZS';

export interface BankAccount {
  number: string;
  balanceAcc: string;
  currency: Currency;
  company: string;
  inn: string;
  bankName: string;
  mfo: string;
  periodFrom: string;
  periodTo: string;
  openingBalance: number;
  closingBalanceBank: number;
  totalDebitBank?: number;
  totalCreditBank?: number;
  /** Format B: bank's balance at the end of each day ("Итого"), for the daily check. */
  dailyBalances?: Record<string, number>;
  sourceFiles: string[];
}

export interface RawOperation {
  account: string;
  datetime: string;
  docNo: string;
  korrAccount: string;
  korrInn: string;
  korrName: string;
  korrMfo: string;
  opCode?: string;
  purpose: string;
  debit: number;
  credit: number;
}

export interface Operation extends RawOperation {
  id: string;
  group: Group;
  type: string;
  ruleId: string | null;
  manual?: boolean;
  internal: boolean;
  runningBalance: number;
  flags: FlagCode[];
}

export interface ParsedStatement {
  format: 'A' | 'B';
  file: string;
  account: BankAccount;
  operations: RawOperation[];
}
