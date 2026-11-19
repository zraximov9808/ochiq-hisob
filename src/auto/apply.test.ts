import { produce } from 'immer';
import { describe, expect, test } from 'vitest';
import { emptyDoc, type Doc, type Entry } from '../engine/types';
import { parseDocFile, serializeDoc } from '../store/docFile';
import { applyAuto, autoSettings, editedEntry, removeEntries, removeEntry, resetAuto } from './apply';
import type { BuiltAuto } from './build';
import type { ResolvedEntry } from './resolve';

const auto = (src: string, amount = 100, date = '2026-07-01'): ResolvedEntry => ({
  id: `a:${src}`, date, text: src, debit: '5110', credit: '4010.01', amount, auto: { src }, fx: { ccy: 'USD', amount: 1 }, fxDebit: true,
});
const built = (entries: ResolvedEntry[], company: BuiltAuto['company'] = null): BuiltAuto => ({
  entries, added: [{ code: '4010.01', parent: '4010', name: 'ALFA', stir: '300000001' }], warnings: [], needRates: [], company,
});
const manual: Entry = { id: 'm1', date: '2026-07-02', text: 'qo‘lda', debit: '9420', credit: '6710', amount: 50 };
const doc = (entries: Entry[] = [manual]): Doc => ({ ...emptyDoc(2026), entries });
const apply = (d: Doc, b: BuiltAuto, hash = 'h') => produce(d, (x) => applyAuto(x as Doc, b, hash));
const srcs = (d: Doc) => d.entries.map((e) => e.auto?.src ?? e.id);

describe('applyAuto', () => {
  test('apply replaces old auto entries and keeps manual ones', () => {
    const d1 = apply(doc(), built([auto('a'), auto('b')]));
    const d2 = apply(d1, built([auto('b', 200), auto('c')]), 'h2');
    expect(srcs(d2)).toEqual(['m1', 'b', 'c']);
    expect(d2.entries.find((e) => e.auto?.src === 'b')!.amount).toBe(200);
    expect(d2.entries[1]).not.toHaveProperty('fx');
    expect(d2.subaccounts.map((s) => s.code)).toEqual(['4010.01']);
    expect(autoSettings(d2).inputHash).toBe('h2');
  });

  test('edited auto entry survives re-apply and its fresh copy is not added', () => {
    const d1 = apply(doc(), built([auto('a')]));
    const d2 = produce(d1, (x) => {
      const i = x.entries.findIndex((e) => e.auto?.src === 'a');
      x.entries[i] = editedEntry(x.entries[i], { ...x.entries[i], amount: 999 });
    });
    const d3 = apply(d2, built([auto('a', 100)]));
    expect(d3.entries.filter((e) => e.auto?.src === 'a')).toEqual([expect.objectContaining({ amount: 999, auto: { src: 'a', edited: true } })]);
  });

  test('deleted (skipped) source does not come back', () => {
    const d1 = apply(doc(), built([auto('a'), auto('b')]));
    const d2 = produce(d1, (x) => removeEntry(x as Doc, 'a:a'));
    expect(autoSettings(d2).skip).toEqual(['a']);
    expect(srcs(apply(d2, built([auto('a'), auto('b')])))).toEqual(['m1', 'b']);
  });

  test('deleting a manual entry records nothing', () => {
    const d2 = produce(doc(), (x) => removeEntry(x as Doc, 'm1'));
    expect(d2.entries).toEqual([]);
    expect(autoSettings(d2).skip).toEqual([]);
  });

  test('empty document takes year and company from the data', () => {
    const d = apply({ ...emptyDoc(2030), entries: [] }, built([auto('a', 1, '2026-03-01'), auto('b', 1, '2026-04-01'), auto('c', 1, '2025-12-31')], { name: 'NAMUNA MCHJ', inn: '999000111' }));
    expect(d.year).toBe(2026);
    expect(d.company).toMatchObject({ name: 'NAMUNA MCHJ', stir: '999000111' });
    const kept = apply(doc(), built([auto('a', 1, '2025-03-01')], { name: 'X', inn: '1' }));
    expect(kept.year).toBe(2026);
  });

  test('reset brings back skipped and edited sources', () => {
    const d1 = apply(doc(), built([auto('a'), auto('b')]));
    const d2 = produce(d1, (x) => {
      removeEntry(x as Doc, 'a:a');
      const i = x.entries.findIndex((e) => e.auto?.src === 'b');
      x.entries[i] = editedEntry(x.entries[i], { ...x.entries[i], amount: 5 });
    });
    const d3 = produce(d2, (x) => resetAuto(x as Doc));
    expect(srcs(d3)).toEqual(['m1']);
    expect(autoSettings(d3)).toMatchObject({ skip: [], inputHash: '' });
    expect(srcs(apply(d3, built([auto('a'), auto('b')])))).toEqual(['m1', 'a', 'b']);
  });
});

test('documents saved without auto settings still open; saved settings keep their values', () => {
  const old = parseDocFile(serializeDoc(emptyDoc(2026)));
  expect(old.auto).toBeUndefined();
  expect(autoSettings(old).enabled).toBe(true);
  const saved = parseDocFile(JSON.stringify({ ...emptyDoc(2026), auto: { enabled: false, skip: ['x'] } }));
  expect(saved.auto).toMatchObject({ enabled: false, skip: ['x'], serviceDefault: '9420' });
});

describe('auto entries saved under the previous source keys', () => {
  const hand = (src: string, debit: string, deleted = false): Doc =>
    deleted
      ? { ...doc([]), auto: { ...autoSettings(doc([])), skip: [src] } }
      : doc([{ id: 'h', date: '2026-07-31', text: 'qo‘lda tuzatilgan', debit, credit: '4410.01', amount: 7, auto: { src, edited: true } }]);

  test('a hand-edited monthly VAT offset (vat:<month>) keeps out the new per-account offsets', () => {
    const d = apply(hand('vat:2026-07', '6410.01'), built([auto('vat:2026-07:4410.3'), auto('vat:2026-07:4410.4'), auto('vat:2026-08:4410.3')]));
    expect(srcs(d)).toEqual(['vat:2026-07', 'vat:2026-08:4410.3']);
  });

  test('a deleted monthly VAT offset stays deleted', () => {
    const d = apply(hand('vat:2026-07', '', true), built([auto('vat:2026-07:4410.3')]));
    expect(srcs(d)).toEqual([]);
  });

  test('an old invoice VAT entry edited by hand also covers the new services VAT; a new-chart one does not', () => {
    const old = apply(hand('inv:p1:vat', '4410.01'), built([auto('inv:p1:vat'), auto('inv:p1:vat-s')]));
    expect(srcs(old)).toEqual(['inv:p1:vat']);
    const fresh = apply(hand('inv:p1:vat', '4410.3'), built([auto('inv:p1:vat'), auto('inv:p1:vat-s')]));
    expect(srcs(fresh)).toEqual(['inv:p1:vat', 'inv:p1:vat-s']);
  });
});

describe('deleting several entries at once', () => {
  test('removes the chosen entries; deleted auto entries do not come back on the next build', () => {
    const d1 = apply(doc(), built([auto('a'), auto('b'), auto('c')]));
    const ids = d1.entries.filter((e) => e.auto?.src !== 'c').map((e) => e.id);
    const d2 = produce(d1, (x) => removeEntries(x as Doc, ids));
    expect(srcs(d2)).toEqual(['c']);
    expect(autoSettings(d2).skip).toEqual(['a', 'b']);
    expect(srcs(apply(d2, built([auto('a'), auto('b'), auto('c')]), 'h2'))).toEqual(['c']);
  });
});
