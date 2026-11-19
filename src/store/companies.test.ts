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

describe('store: opening a saved file', () => {
  afterEach(() => {
    delete (globalThis as { localStorage?: KV }).localStorage;
  });

  test('an opened file goes to the company with its STIR, or becomes a new company', async () => {
    const kv = legacyKV();
    (globalThis as { localStorage?: KV }).localStorage = kv;
    vi.resetModules();
    const { actions, getState, openTarget } = await import('./store');
    const first = getState().co.list[0];
    const other = emptyDoc(2026);
    other.company = { ...other.company, name: 'Boshqa MChJ', stir: '309999999' };

    expect(openTarget(other)).toBe('new');
    expect(actions.openDoc(other, 'boshqa.ohisob')).toBe('new');
    expect(getState().co.list).toHaveLength(2);
    expect(getState().h.doc.company.name).toBe('Boshqa MChJ');

    const again = emptyDoc(2026);
    again.company = { ...again.company, name: '"Eski" MChJ', stir: '301234567' };
    again.entries.push({ id: 'x', date: '2026-02-01', text: 'Fayldan', debit: '5110', credit: '4010', amount: 5 });
    expect(openTarget(again)).toBe('other');
    expect(actions.openDoc(again, 'eski.ohisob')).toBe('other');
    expect(getState().co.currentId).toBe(first.id);
    expect(getState().h.doc.entries).toHaveLength(1);
    expect(getState().co.list).toHaveLength(2);

    const noStir = emptyDoc(2026);
    expect(openTarget(noStir)).toBe('current');
  });
});

test('on a fresh start the first opened file fills the empty company instead of adding one', async () => {
  (globalThis as { localStorage?: KV }).localStorage = memoryKV();
  vi.resetModules();
  const { actions, getState, openTarget } = await import('./store');
  const doc = emptyDoc(2026);
  doc.company = { ...doc.company, name: 'Birinchi MChJ', stir: '305555555' };
  expect(openTarget(doc)).toBe('current');
  actions.openDoc(doc, 'birinchi.ohisob');
  expect(getState().co.list).toEqual([expect.objectContaining({ name: 'Birinchi MChJ', stir: '305555555' })]);
  delete (globalThis as { localStorage?: KV }).localStorage;
});

describe('store: review fixes', () => {
  afterEach(() => {
    delete (globalThis as { localStorage?: KV }).localStorage;
  });
  const boot = async (kv: KV) => {
    (globalThis as { localStorage?: KV }).localStorage = kv;
    vi.resetModules();
    return import('./store');
  };

  test('renaming a company that is not open survives switching to it', async () => {
    const { actions, getState } = await boot(legacyKV());
    const first = getState().co.list[0];
    const b = actions.addCompany('B MChJ', '302222222');
    actions.update((d) => {
      d.company.address = 'x';
    });
    actions.switchCompany(first.id);
    actions.renameCompany(b.id, 'B renamed', '302222223');
    actions.switchCompany(b.id);
    expect(getState().h.doc.company).toMatchObject({ name: 'B renamed', stir: '302222223' });
    expect(getState().co.list.find((c) => c.id === b.id)).toMatchObject({ name: 'B renamed', stir: '302222223' });
  });

  test('a switch is refused when the current document cannot be saved', async () => {
    const kv = legacyKV();
    const { actions, getState } = await boot(kv);
    const first = getState().co.list[0];
    const b = actions.addCompany('B MChJ', '');
    actions.switchCompany(first.id);
    actions.update((d) => {
      d.entries.push({ id: 'u1', date: '2026-01-05', text: 'Saqlanmagan', debit: '5110', credit: '4010', amount: 100 });
    });
    const setItem = kv.setItem;
    kv.setItem = (k, v) => {
      if (k === first.docKey) throw new Error('QuotaExceededError');
      setItem(k, v);
    };
    expect(() => actions.switchCompany(b.id)).toThrow(/saqlanmadi/);
    expect(getState().co.currentId).toBe(first.id);
    expect(getState().h.doc.entries).toHaveLength(1);
  });

  test('opening a file of another company with unsaved work is flagged before anything is replaced', async () => {
    const { actions, getState, unsavedWork } = await boot(legacyKV());
    const first = getState().co.list[0];
    actions.addCompany('B MChJ', '302222222');
    actions.update((d) => {
      d.entries.push({ id: 'b1', date: '2026-01-05', text: 'Faqat brauzerda', debit: '5110', credit: '4010', amount: 100 });
    });
    actions.switchCompany(first.id);
    const old = emptyDoc(2026);
    old.company = { ...old.company, name: 'B MChJ', stir: '302222222' };
    expect(unsavedWork(old)).toEqual({ company: 'B MChJ' });
    const fresh = emptyDoc(2026);
    fresh.company = { ...fresh.company, name: 'Yangi', stir: '309999999' };
    expect(unsavedWork(fresh)).toBeNull();
  });
});
