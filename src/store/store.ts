import type { Draft } from 'immer';
import { useSyncExternalStore } from 'react';
import type { Unit } from '../engine/money';
import type { Quarter } from '../engine/period';
import { emptyDoc, type Doc } from '../engine/types';
import { parseDocFile, serializeDoc } from './docFile';
import * as H from './history';

export type PageId = 'opening' | 'journal' | 'subaccounts' | 'balance' | 'income' | 'tax' | 'trial' | 'settings' | 'help' | 'bank' | 'audit' | 'ombor' | 'auto';

export interface Ui {
  page: PageId;
  quarter: Quarter;
  unit: Unit;
  script: 'lat' | 'cyr';
  fileName: string | null;
}

export interface AppState {
  h: H.History;
  ui: Ui;
}

const DOC_KEY = 'ochiq-hisob:doc';
const UI_KEY = 'ochiq-hisob:ui';
const DIRTY_KEY = 'ochiq-hisob:dirty';

function currentQuarter(year: number): Quarter {
  const now = new Date();
  if (now.getFullYear() !== year) return 4;
  return (Math.floor(now.getMonth() / 3) + 1) as Quarter;
}

function load(): AppState {
  let doc: Doc | null = null;
  let dirty = false;
  try {
    const text = localStorage.getItem(DOC_KEY);
    if (text) doc = parseDocFile(text);
    dirty = localStorage.getItem(DIRTY_KEY) === '1';
  } catch {
    doc = null;
  }
  const d = doc ?? emptyDoc(new Date().getFullYear());
  let ui: Ui = { page: doc ? 'journal' : 'help', quarter: currentQuarter(d.year), unit: 'ming', script: 'lat', fileName: null };
  try {
    ui = { ...ui, ...JSON.parse(localStorage.getItem(UI_KEY) ?? '{}') };
  } catch {
    /* keep defaults */
  }
  const h = H.initHistory(d);
  return { h: dirty ? { ...h, saved: emptyDoc(d.year) } : h, ui };
}

let state: AppState = load();
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(DOC_KEY, serializeDoc(state.h.doc));
      localStorage.setItem(DIRTY_KEY, H.isDirty(state.h) ? '1' : '0');
      localStorage.setItem(UI_KEY, JSON.stringify(state.ui));
    } catch {
      /* storage full or blocked: the file save still works */
    }
  }, 300);
}

function set(next: AppState) {
  state = next;
  persist();
  listeners.forEach((l) => l());
}

export const actions = {
  update(recipe: (d: Draft<Doc>) => void) {
    set({ ...state, h: H.applyUpdate(state.h, recipe) });
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
      h: clean ? h : { ...h, saved: emptyDoc(doc.year) },
      ui: { ...state.ui, fileName, quarter: currentQuarter(doc.year) },
    });
  },
  markSaved(fileName: string) {
    set({ h: H.markSaved(state.h), ui: { ...state.ui, fileName } });
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
