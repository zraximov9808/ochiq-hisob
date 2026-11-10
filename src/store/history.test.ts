import { describe, expect, test } from 'vitest';
import { emptyDoc } from '../engine/types';
import { applyUpdate, initHistory, isDirty, markSaved, redo, undo } from './history';
import { parseDocFile, serializeDoc } from './docFile';

describe('history', () => {
  test('update pushes the previous doc and undo/redo walk the stack', () => {
    let h = initHistory(emptyDoc(2026));
    h = applyUpdate(h, (d) => {
      d.company.name = 'A';
    });
    h = applyUpdate(h, (d) => {
      d.company.name = 'B';
    });
    expect(h.doc.company.name).toBe('B');
    h = undo(h);
    expect(h.doc.company.name).toBe('A');
    h = redo(h);
    expect(h.doc.company.name).toBe('B');
  });

  test('a new update clears the redo stack', () => {
    let h = initHistory(emptyDoc(2026));
    h = applyUpdate(h, (d) => void (d.taxRate = 10));
    h = undo(h);
    h = applyUpdate(h, (d) => void (d.taxRate = 20));
    expect(redo(h).doc.taxRate).toBe(20);
  });

  test('a no-op recipe does not create a history step', () => {
    const h = initHistory(emptyDoc(2026));
    expect(applyUpdate(h, () => {}).past.length).toBe(0);
  });

  test('dirty tracks changes since the last save', () => {
    let h = initHistory(emptyDoc(2026));
    expect(isDirty(h)).toBe(false);
    h = applyUpdate(h, (d) => void (d.taxRate = 12));
    expect(isDirty(h)).toBe(true);
    h = markSaved(h);
    expect(isDirty(h)).toBe(false);
  });
});

describe('doc file', () => {
  test('round-trips a document', () => {
    const doc = emptyDoc(2026);
    doc.company.name = 'Namuna';
    expect(parseDocFile(serializeDoc(doc))).toEqual(doc);
  });

  test('rejects foreign JSON with a readable message', () => {
    expect(() => parseDocFile('{"hello":1}')).toThrow(/Ochiq Hisob fayli emas/);
    expect(() => parseDocFile('not json')).toThrow(/o‘qib bo‘lmadi/);
  });

  test('fills fields missing in older files', () => {
    const doc = parseDocFile(JSON.stringify({ app: 'ochiq-hisob', version: 1, year: 2025, entries: [] }));
    expect(doc.opening).toEqual([]);
    expect(doc.taxRate).toBe(15);
    expect(doc.year).toBe(2025);
  });
});
