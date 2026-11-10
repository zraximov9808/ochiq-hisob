import { produce, type Draft } from 'immer';
import type { Doc } from '../engine/types';

export interface History {
  doc: Doc;
  past: Doc[];
  future: Doc[];
  /** The document as it was last saved to a file (or opened/created). */
  saved: Doc;
}

const LIMIT = 200;

export function initHistory(doc: Doc): History {
  return { doc, past: [], future: [], saved: doc };
}

export function applyUpdate(h: History, recipe: (d: Draft<Doc>) => void): History {
  const next = produce(h.doc, recipe);
  if (next === h.doc) return h;
  return { ...h, doc: next, past: [...h.past, h.doc].slice(-LIMIT), future: [] };
}

export function undo(h: History): History {
  if (!h.past.length) return h;
  return { ...h, doc: h.past[h.past.length - 1], past: h.past.slice(0, -1), future: [h.doc, ...h.future] };
}

export function redo(h: History): History {
  if (!h.future.length) return h;
  return { ...h, doc: h.future[0], past: [...h.past, h.doc], future: h.future.slice(1) };
}

export function isDirty(h: History): boolean {
  return h.doc !== h.saved;
}

export function markSaved(h: History): History {
  return { ...h, saved: h.doc };
}
