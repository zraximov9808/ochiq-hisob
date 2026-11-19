import type { Draft } from 'immer';
import { useSyncExternalStore } from 'react';
import type { Unit } from '../engine/money';
import type { Quarter } from '../engine/period';
import { emptyDoc, type Doc } from '../engine/types';
import { deleteBankDb, switchBankDb } from '../ui/bank/bankStore';
import {
  addCompanyTo,
  dirtyKey,
  loadCompanies,
  memoryKV,
  removeCompanyFrom,
  renameCompanyIn,
  setCurrentCompany,
  type CompanyRef,
  type KV,
} from './companies';
import { parseDocFile, serializeDoc } from './docFile';
import { forgetFileHandle } from './fileIO';
import * as H from './history';

export type PageId = 'opening' | 'journal' | 'subaccounts' | 'balance' | 'income' | 'tax' | 'trial' | 'settings' | 'help' | 'bank' | 'audit' | 'ombor' | 'auto' | 'chart';

export interface Ui {
  page: PageId;
  quarter: Quarter;
  unit: Unit;
  script: 'lat' | 'cyr';
  fileName: string | null;
}

export interface Companies {
  list: CompanyRef[];
  currentId: string;
}

export interface AppState {
  h: H.History;
  ui: Ui;
  /** Companies of this browser; the document in `h` is the current one's. */
  co: Companies;
}

const UI_KEY = 'ochiq-hisob:ui';

/** localStorage, or memory where it is missing or blocked (the file save still works). */
function storage(): KV {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.getItem(UI_KEY);
      return localStorage;
    }
  } catch {
    /* blocked */
  }
  return memoryKV();
}
const kv = storage();

function currentQuarter(year: number): Quarter {
  const now = new Date();
  if (now.getFullYear() !== year) return 4;
  return (Math.floor(now.getMonth() / 3) + 1) as Quarter;
}

function readDoc(ref: CompanyRef): { doc: Doc | null; dirty: boolean } {
  try {
    const text = kv.getItem(ref.docKey);
    return { doc: text ? parseDocFile(text) : null, dirty: kv.getItem(dirtyKey(ref)) === '1' };
  } catch {
    return { doc: null, dirty: false };
  }
}

/** A company's document as stored, or a new one with its name and STIR. */
function docOf(ref: CompanyRef, year: number): { doc: Doc; dirty: boolean; stored: boolean } {
  const { doc, dirty } = readDoc(ref);
  if (doc) return { doc, dirty, stored: true };
  const d = emptyDoc(year);
  d.company = { ...d.company, name: ref.name, stir: ref.stir };
  return { doc: d, dirty: false, stored: false };
}

function load(): AppState {
  const co = loadCompanies(kv);
  const ref = co.list.find((c) => c.id === co.currentId)!;
  switchBankDb(ref.bankDb);
  const { doc: d, dirty, stored } = docOf(ref, new Date().getFullYear());
  const doc = stored ? d : null;
  let ui: Ui = { page: doc ? 'journal' : 'help', quarter: currentQuarter(d.year), unit: 'ming', script: 'lat', fileName: null };
  try {
    ui = { ...ui, ...JSON.parse(kv.getItem(UI_KEY) ?? '{}') };
  } catch {
    /* keep defaults */
  }
  const h = H.initHistory(d);
  return { h: dirty ? { ...h, saved: emptyDoc(d.year) } : h, ui, co };
}

let state: AppState = load();
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;

const currentRef = (s: AppState = state) => s.co.list.find((c) => c.id === s.co.currentId)!;

/** Writes the current company's document now (before a switch, or when the save timer fires). */
function flush() {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  const ref = currentRef();
  try {
    kv.setItem(ref.docKey, serializeDoc(state.h.doc));
    kv.setItem(dirtyKey(ref), H.isDirty(state.h) ? '1' : '0');
    kv.setItem(UI_KEY, JSON.stringify(state.ui));
  } catch {
    /* storage full or blocked: the file save still works */
  }
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 300);
}

function set(next: AppState) {
  // the company list follows the name and STIR typed in Settings
  const ref = currentRef(next);
  const { name, stir } = next.h.doc.company;
  if (ref && (ref.name !== name || ref.stir !== stir)) {
    renameCompanyIn(kv, ref.id, name, stir);
    next = { ...next, co: { ...next.co, list: next.co.list.map((c) => (c.id === ref.id ? { ...c, name, stir } : c)) } };
  }
  state = next;
  persist();
  listeners.forEach((l) => l());
}

export const actions = {
  update(recipe: (d: Draft<Doc>) => void) {
    set({ ...state, h: H.applyUpdate(state.h, recipe) });
  },
  /** Automatic follow-up change (auto entries): joins the user's last step, no separate undo step. */
  amend(recipe: (d: Draft<Doc>) => void) {
    set({ ...state, h: H.amendUpdate(state.h, recipe) });
  },
  undo() {
    set({ ...state, h: H.undo(state.h) });
  },
  redo() {
    set({ ...state, h: H.redo(state.h) });
  },
  setUi(patch: Partial<Ui>) {
    set({ ...state, ui: { ...state.ui, ...patch } });
  },
  /** Replaces the whole document (new, opened or rolled over); history starts fresh. */
  replaceDoc(doc: Doc, fileName: string | null, clean = true) {
    const h = H.initHistory(doc);
    set({
      ...state,
      h: clean ? h : { ...h, saved: emptyDoc(doc.year) },
      ui: { ...state.ui, fileName, quarter: currentQuarter(doc.year) },
    });
  },
  markSaved(fileName: string) {
    set({ ...state, h: H.markSaved(state.h), ui: { ...state.ui, fileName } });
  },
  /** Saves the current company's document, then opens the other company with its own uploads. */
  switchCompany(id: string) {
    const ref = state.co.list.find((c) => c.id === id);
    if (!ref || id === state.co.currentId) return;
    flush();
    setCurrentCompany(kv, id);
    const { doc, dirty } = docOf(ref, state.h.doc.year);
    const h = H.initHistory(doc);
    forgetFileHandle();
    switchBankDb(ref.bankDb);
    set({
      h: dirty ? { ...h, saved: emptyDoc(doc.year) } : h,
      ui: { ...state.ui, fileName: null, quarter: doc.year === state.h.doc.year ? state.ui.quarter : currentQuarter(doc.year) },
      co: { list: state.co.list, currentId: id },
    });
  },
  /** Adds a company and switches to it (an empty document with its name and STIR). */
  addCompany(name: string, stir: string): CompanyRef {
    const ref = addCompanyTo(kv, name, stir);
    state = { ...state, co: { ...state.co, list: loadCompanies(kv).list } };
    actions.switchCompany(ref.id);
    return ref;
  },
  renameCompany(id: string, name: string, stir: string) {
    if (id === state.co.currentId)
      actions.update((d) => {
        d.company.name = name.trim();
        d.company.stir = stir.trim();
      });
    else {
      renameCompanyIn(kv, id, name, stir);
      set({ ...state, co: { ...state.co, list: loadCompanies(kv).list } });
    }
  },
  /** Removes a company with its document and uploads; the last one cannot be removed. */
  removeCompany(id: string) {
    const ref = state.co.list.find((c) => c.id === id);
    if (!ref) return;
    if (state.co.list.length <= 1) throw new Error('Oxirgi korxonani o‘chirib bo‘lmaydi.');
    if (id === state.co.currentId) actions.switchCompany(state.co.list.find((c) => c.id !== id)!.id);
    removeCompanyFrom(kv, id);
    deleteBankDb(ref.bankDb);
    set({ ...state, co: loadCompanies(kv) });
  },
};

export function getState(): AppState {
  return state;
}

export function useApp(): AppState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export const isDirty = () => H.isDirty(state.h);
