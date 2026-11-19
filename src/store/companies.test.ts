import { afterEach, describe, expect, test, vi } from 'vitest';
import { emptyDoc } from '../engine/types';
import { addCompanyTo, loadCompanies, memoryKV, removeCompanyFrom, renameCompanyIn, type KV } from './companies';
import { serializeDoc } from './docFile';

const legacyKV = (): KV => {
  const kv = memoryKV();
  const doc = emptyDoc(2026);
  doc.company = { ...doc.company, name: '"Eski" MChJ', stir: '301234567' };
  kv.setItem('ochiq-hisob:doc', serializeDoc(doc));
  return kv;
};

describe('companies', () => {
  test('legacy single-company data becomes the first company without copying', () => {
    const kv = legacyKV();
    const before = kv.getItem('ochiq-hisob:doc');
    const { list, currentId } = loadCompanies(kv);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: '"Eski" MChJ', stir: '301234567', docKey: 'ochiq-hisob:doc', bankDb: 'ochiq-hisob-bank' });
    expect(currentId).toBe(list[0].id);
    expect(kv.getItem('ochiq-hisob:doc')).toBe(before);
    expect(loadCompanies(kv)).toEqual({ list, currentId });
  });

  test('a first visit with no data starts one empty company', () => {
    const { list } = loadCompanies(memoryKV());
    expect(list).toHaveLength(1);
    expect(list[0].docKey).toBe('ochiq-hisob:doc');
  });

  test('a new company gets its own document and bank keys', () => {
    const kv = legacyKV();
    const first = loadCompanies(kv).list[0];
    const b = addCompanyTo(kv, 'Ikkinchi MChJ', '302345678');
    expect(b.docKey).toBe(`ochiq-hisob:doc:${b.id}`);
    expect(b.bankDb).toBe(`ochiq-hisob-bank-${b.id}`);
    expect(b.id).not.toBe(first.id);
    expect(loadCompanies(kv).list.map((c) => c.name)).toEqual(['"Eski" MChJ', 'Ikkinchi MChJ']);
    renameCompanyIn(kv, b.id, 'Ikkinchi AJ', '302345678');
    expect(loadCompanies(kv).list[1].name).toBe('Ikkinchi AJ');
  });

  test('removing a company drops its document; the last company cannot be removed', () => {
    const kv = legacyKV();
    const first = loadCompanies(kv).list[0];
    const b = addCompanyTo(kv, 'Ikkinchi', '');
    kv.setItem(b.docKey, '{}');
    removeCompanyFrom(kv, b.id);
    expect(kv.getItem(b.docKey)).toBeNull();
    expect(loadCompanies(kv).list.map((c) => c.id)).toEqual([first.id]);
    expect(() => removeCompanyFrom(kv, first.id)).toThrow(/oxirgi/i);
  });
});

describe('store: switching companies', () => {
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as { localStorage?: KV }).localStorage;
  });

  test('switching saves the current document first', async () => {
    vi.useFakeTimers();
    const kv = legacyKV();
    (globalThis as { localStorage?: KV }).localStorage = kv;
    vi.resetModules();
    const { actions, getState } = await import('./store');
    const first = getState().co.list[0];
    actions.update((d) => {
      d.entries.push({ id: 'e1', date: '2026-01-05', text: 'Saqlanmagan', debit: '5110', credit: '4010', amount: 100 });
    });
    // the 300 ms save timer has not fired yet
    const b = actions.addCompany('Ikkinchi MChJ', '302345678');
    expect(JSON.parse(kv.getItem(first.docKey)!).entries).toHaveLength(1);
    expect(getState().co.currentId).toBe(b.id);
    expect(getState().h.doc.company.name).toBe('Ikkinchi MChJ');
    expect(getState().h.doc.entries).toEqual([]);

    actions.update((d) => {
      d.company.address = 'Samarqand';
    });
    actions.switchCompany(first.id);
    expect(JSON.parse(kv.getItem(b.docKey)!).company.address).toBe('Samarqand');
    expect(getState().h.doc.company.name).toBe('"Eski" MChJ');
    expect(getState().h.doc.entries).toHaveLength(1);
    expect(getState().h.past).toEqual([]);
  });

  test('a typed form value stays with its company', async () => {
    const kv = legacyKV();
    (globalThis as { localStorage?: KV }).localStorage = kv;
    vi.resetModules();
    const { actions, getState } = await import('./store');
    const { setFormValue, manualValues } = await import('../forms/values');
    const first = getState().co.list[0];
    actions.update((d) => setFormValue(d, 'tax', 4, '090', '3', 700));
    actions.addCompany('Ikkinchi', '');
    expect(manualValues(getState().h.doc, 'tax', 4)).toEqual({});
    actions.switchCompany(first.id);
    expect(manualValues(getState().h.doc, 'tax', 4)).toEqual({ '090': { '3': 700 } });
  });
});
