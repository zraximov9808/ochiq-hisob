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

/** What an uploaded file held. */
export type UploadKind = 'statement' | 'invoice' | 'gtd';

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

const openDb = (name: string) => (typeof indexedDB === 'undefined' ? undefined : createStore(name, 'kv'));
/** Each company has its own database of uploads; the first one keeps the original name. */
let dbName = 'ochiq-hisob-bank';
/** Opened on first use: opening a company's database creates it, which a removed company must not get back. */
let db: ReturnType<typeof openDb> | null = null;
const store = () => (db ??= openDb(dbName)) ?? undefined;
const KEYS = ['statements', 'files', 'rules', 'overrides', 'reviewed', 'settings', 'invoices', 'invoiceFiles', 'gtd', 'gtdFiles', 'stockQty', 'rates'] as const;

const EMPTY: Omit<BankState, 'loaded'> = { statements: [], files: [], rules: null, overrides: {}, reviewed: [], settings: DEFAULT_SETTINGS, invoices: [], invoiceFiles: [], gtd: [], gtdFiles: [], stockQty: {}, rates: {} };
let state: BankState = { loaded: false, ...EMPTY };
const listeners = new Set<() => void>();

function emit(next: BankState, persist: Array<(typeof KEYS)[number]> = []) {
  state = next;
  listeners.forEach((l) => l());
  // before the stored data is read, a write would replace it with a partial list
  const d = state.loaded ? store() : undefined;
  if (d) for (const k of persist) void set(k, state[k], d);
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
  const from = store();
  if (!from || state.loaded) {
    if (!state.loaded) emit({ ...state, loaded: true });
    return Promise.resolve();
  }
  loading ??= Promise.all(KEYS.map((k) => get(k, from))).then((vals) => {
    // the company was switched while this was loading: its data belongs to the other company
    if (from !== store()) return;
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
  /** Deletes one uploaded file and what was read from it; the other files stay. */
  removeFile(kind: UploadKind, file: string) {
    if (kind === 'statement')
      emit({ ...state, statements: state.statements.filter((s) => s.file !== file), files: state.files.filter((f) => f.file !== file) }, ['statements', 'files']);
    else if (kind === 'invoice')
      emit({ ...state, invoices: state.invoices.filter((i) => i.file !== file), invoiceFiles: state.invoiceFiles.filter((f) => f.file !== file) }, ['invoices', 'invoiceFiles']);
    else {
      const gone = new Set(state.gtd.filter((g) => g.file === file).map((g) => g.id));
      const stockQty = Object.fromEntries(Object.entries(state.stockQty).filter(([id]) => !gone.has(id)));
      emit({ ...state, gtd: state.gtd.filter((g) => g.file !== file), gtdFiles: state.gtdFiles.filter((f) => f.file !== file), stockQty }, ['gtd', 'gtdFiles', 'stockQty']);
    }
  },
  /** Deletes every uploaded file (statements, invoices, GTD) and what was typed about them; rules and settings stay. */
  clearUploads() {
    emit(
      { ...state, statements: [], files: [], overrides: {}, reviewed: [], invoices: [], invoiceFiles: [], gtd: [], gtdFiles: [], stockQty: {} },
      ['statements', 'files', 'overrides', 'reviewed', 'invoices', 'invoiceFiles', 'gtd', 'gtdFiles', 'stockQty'],
    );
  },
  /** Deletes everything this section stored in the browser. */
  async wipe() {
    const d = store();
    if (d) await Promise.all(KEYS.map((k) => del(k, d)));
    emit({ loaded: true, ...EMPTY });
  },
};

/** Switches to another company's uploads: the current ones are dropped from memory and the other database is read. */
export function switchBankDb(name: string): void {
  if (name === dbName) return;
  const wasLoaded = state.loaded || loading !== null;
  // close the old connection, or deleting that company's database later stays blocked
  void db?.('readonly', (s) => s.transaction.db.close()).catch(() => undefined);
  dbName = name;
  db = null;
  loading = null;
  emit({ loaded: false, ...EMPTY });
  if (wasLoaded) void loadBank();
}

/**
 * Runs an upload and stores its result into the company it was started for: dropped (null) if the user switched
 * company while the files were being read; stored only after that company's uploads are loaded, so nothing is replaced.
 */
export async function storeUpload<T>(work: () => Promise<T>, save: (result: T) => void): Promise<T | null> {
  const stillHere = beginUpload();
  const result = await work();
  if (!(await stillHere())) return null;
  save(result);
  return result;
}

/** Call when an upload starts; await the returned check right before storing (false: the company was switched). */
export function beginUpload(): () => Promise<boolean> {
  const target = dbName;
  return async () => {
    if (dbName !== target) return false;
    await loadBank();
    return dbName === target;
  };
}

/** Which company's uploads are open (their database name). */
export const bankTarget = () => dbName;

/** Deletes a removed company's uploads database. */
export function deleteBankDb(name: string): void {
  if (typeof indexedDB !== 'undefined' && name !== dbName) indexedDB.deleteDatabase(name);
}

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
