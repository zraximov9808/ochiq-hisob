import { createStore, del, get, set } from 'idb-keyval';
import { useSyncExternalStore } from 'react';
import { DEFAULT_SETTINGS, type Override, type Settings } from '../../bank/analyze';
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
}

const db = typeof indexedDB === 'undefined' ? undefined : createStore('ochiq-hisob-bank', 'kv');
const KEYS = ['statements', 'files', 'rules', 'overrides', 'reviewed', 'settings'] as const;

let state: BankState = { loaded: false, statements: [], files: [], rules: null, overrides: {}, reviewed: [], settings: DEFAULT_SETTINGS };
const listeners = new Set<() => void>();

function emit(next: BankState, persist: Array<(typeof KEYS)[number]> = []) {
  state = next;
  listeners.forEach((l) => l());
  if (db) for (const k of persist) void set(k, state[k], db);
}

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
    });
  });
  return loading;
}

export const bankActions = {
  addStatements(statements: ParsedStatement[], files: FileResult[]) {
    emit({ ...state, statements: [...state.statements, ...statements], files: [...state.files, ...files] }, ['statements', 'files']);
  },
  newAnalysis() {
    emit({ ...state, statements: [], files: [], overrides: {}, reviewed: [] }, ['statements', 'files', 'overrides', 'reviewed']);
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
    emit({ loaded: true, statements: [], files: [], rules: null, overrides: {}, reviewed: [], settings: DEFAULT_SETTINGS });
  },
};

export const rulesOf = (s: BankState): Rule[] => s.rules ?? DEFAULT_RULES;

export function useBank(): BankState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}
