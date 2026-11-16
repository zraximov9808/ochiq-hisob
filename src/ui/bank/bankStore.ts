import { createStore, del, get, set } from 'idb-keyval';
import { useSyncExternalStore } from 'react';
import { DEFAULT_SETTINGS, type Override, type Settings } from '../../bank/analyze';
import type { Invoice } from '../../audit/invoices';
import type { RateBook } from '../../auto/types';
import type { GtdItem } from '../../stock/gtd';
import type { Rule } from '../../bank/classify';
import type { ParsedStatement } from '../../bank/model';
import { DEFAULT_RULES } from '../../bank/rules/defaultRules';

export interface FileResult {
  file: string;
  ok: boolean;
  error?: string;
  accounts: Array<{ number: string; currency: string; from: string; to: string; count: number }>;
}

export interface BankState {
  loaded: boolean;
  statements: ParsedStatement[];
  files: FileResult[];
  /** null = built-in rules. */
  rules: Rule[] | null;
  overrides: Record<string, Override>;
  /** "<operation id>:<flag code>" of flags marked as reviewed. */
  reviewed: string[];
  settings: Settings;
  /** Ekspres audit: e-invoices and the files they came from. */
  invoices: Invoice[];
  invoiceFiles: Array<{ file: string; ok: boolean; error?: string; count: number }>;
  /** Ombor: customs declaration lines, their files, and quantities typed in by hand. */
  gtd: GtdItem[];
  gtdFiles: Array<{ file: string; ok: boolean; error?: string; count: number }>;
  stockQty: Record<string, number>;
  /** Exchange rates fetched from cbu.uz (cache), `${CCY}:${date}` → so‘m. */
  rates: RateBook;
}

const db = typeof indexedDB === 'undefined' ? undefined : createStore('ochiq-hisob-bank', 'kv');
const KEYS = ['statements', 'files', 'rules', 'overrides', 'reviewed', 'settings', 'invoices', 'invoiceFiles', 'gtd', 'gtdFiles', 'stockQty', 'rates'] as const;

const EMPTY: Omit<BankState, 'loaded'> = { statements: [], files: [], rules: null, overrides: {}, reviewed: [], settings: DEFAULT_SETTINGS, invoices: [], invoiceFiles: [], gtd: [], gtdFiles: [], stockQty: {}, rates: {} };
let state: BankState = { loaded: false, ...EMPTY };
const listeners = new Set<() => void>();

function emit(next: BankState, persist: Array<(typeof KEYS)[number]> = []) {
  state = next;
  listeners.forEach((l) => l());
  if (db) for (const k of persist) void set(k, state[k], db);
}

/** An invoice saved by an older version (no goods lines) gets the fields this version expects. */
export const normalizeInvoice = (i: Invoice): Invoice => ({ ...i, items: Array.isArray(i.items) ? i.items : [] });

/** A GTD line saved before value columns were read gets empty values. */
export const normalizeGtd = (g: GtdItem): GtdItem => ({
  ...g,
  currency: g.currency ?? '',
  rate: g.rate ?? null,
  invoiceValue: g.invoiceValue ?? null,
  fees: g.fees ?? 0,
  duty: g.duty ?? 0,
  importVat: g.importVat ?? 0,
});

let loading: Promise<void> | null = null;
export function loadBank(): Promise<void> {
  if (!db || state.loaded) {
    if (!state.loaded) emit({ ...state, loaded: true });
    return Promise.resolve();
  }
  loading ??= Promise.all(KEYS.map((k) => get(k, db))).then((vals) => {
    const v = Object.fromEntries(KEYS.map((k, i) => [k, vals[i]]));
    emit({
      loaded: true,
      statements: (v.statements as ParsedStatement[]) ?? [],
      files: (v.files as FileResult[]) ?? [],
      rules: (v.rules as Rule[] | null) ?? null,
      overrides: (v.overrides as Record<string, Override>) ?? {},
      reviewed: (v.reviewed as string[]) ?? [],
      settings: { ...DEFAULT_SETTINGS, ...((v.settings as Settings) ?? {}) },
      invoices: ((v.invoices as Invoice[]) ?? []).map(normalizeInvoice),
      invoiceFiles: (v.invoiceFiles as BankState['invoiceFiles']) ?? [],
      gtd: ((v.gtd as GtdItem[]) ?? []).map(normalizeGtd),
      gtdFiles: (v.gtdFiles as BankState['gtdFiles']) ?? [],
      stockQty: (v.stockQty as Record<string, number>) ?? {},
      rates: (v.rates as RateBook) ?? {},
    });
  });
  return loading;
}

/** A file uploaded again replaces its earlier entry in the list of loaded files. */
const replaceByName = <T extends { file: string }>(old: T[], added: T[]) => [...old.filter((f) => !added.some((a) => a.file === f.file)), ...added];

export const bankActions = {
  addStatements(statements: ParsedStatement[], files: FileResult[]) {
    emit({ ...state, statements: [...state.statements, ...statements], files: [...state.files, ...files] }, ['statements', 'files']);
  },
  newAnalysis() {
    emit({ ...state, statements: [], files: [], overrides: {}, reviewed: [] }, ['statements', 'files', 'overrides', 'reviewed']);
  },
  addInvoices(invoices: Invoice[], files: BankState['invoiceFiles']) {
    // A newer upload of the same invoice replaces the stored one (older versions kept no goods lines),
    // except that a header-only copy (soliq.uz CSV) never replaces one with goods lines.
    const kept = new Map(state.invoices.map((i) => [i.id, i]));
    for (const i of invoices) {
      const old = kept.get(i.id);
      if (!(i.brief && old && !old.brief)) kept.set(i.id, i);
    }
    emit({ ...state, invoices: [...kept.values()], invoiceFiles: replaceByName(state.invoiceFiles, files) }, ['invoices', 'invoiceFiles']);
  },
  addGtd(items: GtdItem[], files: BankState['gtdFiles']) {
    const fresh = new Set(items.map((g) => g.id));
    emit({ ...state, gtd: [...state.gtd.filter((g) => !fresh.has(g.id)), ...items], gtdFiles: replaceByName(state.gtdFiles, files) }, ['gtd', 'gtdFiles']);
  },
  clearGtd() {
    emit({ ...state, gtd: [], gtdFiles: [], stockQty: {} }, ['gtd', 'gtdFiles', 'stockQty']);
  },
  setStockQty(id: string, qty: number | null) {
    const stockQty = { ...state.stockQty };
    if (qty === null) delete stockQty[id];
    else stockQty[id] = qty;
    emit({ ...state, stockQty }, ['stockQty']);
  },
  addRates(book: RateBook) {
    emit({ ...state, rates: { ...state.rates, ...book } }, ['rates']);
  },
  clearInvoices() {
    emit({ ...state, invoices: [], invoiceFiles: [] }, ['invoices', 'invoiceFiles']);
  },
  setRules(rules: Rule[] | null) {
    emit({ ...state, rules }, ['rules']);
  },
  setOverride(id: string, o: Override | null) {
    const overrides = { ...state.overrides };
    if (o) overrides[id] = o;
    else delete overrides[id];
    emit({ ...state, overrides }, ['overrides']);
  },
  toggleReviewed(key: string) {
    const has = state.reviewed.includes(key);
    emit({ ...state, reviewed: has ? state.reviewed.filter((k) => k !== key) : [...state.reviewed, key] }, ['reviewed']);
  },
  setSettings(settings: Settings) {
    emit({ ...state, settings }, ['settings']);
  },
  /** Deletes everything this section stored in the browser. */
  async wipe() {
    if (db) await Promise.all(KEYS.map((k) => del(k, db)));
    emit({ loaded: true, ...EMPTY });
  },
};

export const rulesOf = (s: BankState): Rule[] => s.rules ?? DEFAULT_RULES;

export const getBank = (): BankState => state;

export function useBank(): BankState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}
