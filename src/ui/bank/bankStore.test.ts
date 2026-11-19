import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Invoice } from '../../audit/invoices';
import { bankActions, getBank, normalizeGtd, normalizeInvoice, storeUpload, switchBankDb } from './bankStore';

const inv = (over: Partial<Invoice>): Invoice => ({
  id: 'id1', docNo: '1', date: '2026-10-01', kind: '', docType: '', status: 'Подписан', contractNo: '', contractDate: '',
  sellerInn: '1', sellerName: 'S', buyerInn: '2', buyerName: 'B', amount: 100, vat: 0, total: 100, lines: 1,
  items: [{ name: 'x', code: '', unit: 'dona', qty: 1, amount: 100, vat: 0, total: 100, origin: 'Перепродажа' }], file: 'a.xlsx', ...over,
});
const brief = inv({ items: [], lines: 0, brief: true, file: 'b.csv' });
const files = (file: string) => [{ file, ok: true, count: 1 }];

beforeEach(async () => {
  await bankActions.wipe();
});

test('a brief copy does not replace the detailed invoice', () => {
  bankActions.addInvoices([inv({})], files('a.xlsx'));
  bankActions.addInvoices([brief], files('b.csv'));
  expect(getBank().invoices).toHaveLength(1);
  expect(getBank().invoices[0].items).toHaveLength(1);
});

test('a detailed copy replaces the brief invoice', () => {
  bankActions.addInvoices([brief], files('b.csv'));
  bankActions.addInvoices([inv({})], files('a.xlsx'));
  expect(getBank().invoices).toHaveLength(1);
  expect(getBank().invoices[0].brief).toBeFalsy();
});

test('records saved by older versions get the fields this version expects', () => {
  const old = { ...inv({}) } as Partial<Invoice>;
  delete old.items;
  expect(normalizeInvoice(old as Invoice).items).toEqual([]);
  const g = normalizeGtd({ id: 'gtd:1:1', date: '2026-07-06', gtdNo: '1', itemNo: '1', regime: 'ИМ 40', sender: '', name: 'X', hsCode: '', ikpu: '', unit: '', qty: 1, places: null, file: 'g' } as never);
  expect(g).toMatchObject({ currency: '', rate: null, invoiceValue: null, fees: 0, duty: 0, importVat: 0 });
});

describe('uploads and companies', () => {
  test('an upload finished after a company switch is not stored into the other company', async () => {
    switchBankDb('ochiq-hisob-bank-a');
    const save = vi.fn();
    const r = await storeUpload(async () => {
      switchBankDb('ochiq-hisob-bank-b');
      return 3;
    }, save);
    expect(r).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });

  test('an upload is stored once the company’s uploads are loaded', async () => {
    switchBankDb('ochiq-hisob-bank-c');
    const seen: boolean[] = [];
    const r = await storeUpload(async () => 5, () => seen.push(getBank().loaded));
    expect(r).toBe(5);
    expect(seen).toEqual([true]);
  });
});
