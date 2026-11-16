import { describe, expect, test } from 'vitest';
import { companyInnOf, isInvoiceSheet, isServiceItem, normalizeStatus, parseInvoices } from './invoices';
import { invoiceRows } from './testkit';

const ME: [string, string] = ['999000111', '"NAMUNA SAVDO" MCHJ'];
const rows = () =>
  invoiceRows([
    { no: '189', date: '02-11-2026', seller: ['300000002', '"ALFA" MCHJ'], buyer: ME, lines: [['Radiator', 7893810, 947257.2], ['Mufta', 212577.14, 25509.26]] },
    { no: '8', date: '09-09-2026', seller: ME, buyer: ['300000003', '"BETA" MCHJ'], lines: [['Unitaz', 68953571.43, 8274428.57]] },
    { no: '1', date: '04-08-2026', status: 'Отменен', seller: ['61710025960016', 'ISMOILOV A.'], buyer: ME, lines: [['x', 4, 0]] },
  ]);

describe('parseInvoices', () => {
  test('recognises the registry export', () => {
    expect(isInvoiceSheet(rows())).toBe(true);
    expect(isInvoiceSheet([['Сведения о работе счета']])).toBe(false);
  });

  test('reads one record per invoice with totals in tiyin; multi-line invoices use the "Общ." row', () => {
    const inv = parseInvoices(rows(), 'f.xlsx');
    expect(inv).toHaveLength(3);
    expect(inv[0]).toMatchObject({
      docNo: '189', date: '2026-11-02', status: 'Подписан', sellerInn: '300000002', sellerName: '"ALFA" MCHJ',
      buyerInn: '999000111', amount: 810638714, vat: 97276646, total: 907915360, lines: 2, file: 'f.xlsx',
    });
    expect(inv[1]).toMatchObject({ docNo: '8', total: 7722800000, lines: 1 });
    expect(inv[2].status).toBe('Отменен');
  });

  test('the company is the INN present in every invoice', () => {
    expect(companyInnOf(parseInvoices(rows(), 'f.xlsx'))).toBe('999000111');
  });
});

const CSV_HEAD = ['№', 'ID', 'СТАТУС', 'СЧЁТ-ФАКТУРА', 'ТИП ЭСФ', 'ДОГОВОР', 'ПРОДАВЕЦ (ИНН ИЛИ ПИНФЛ)', 'ПРОДАВЕЦ (НАИМЕНОВАНИЕ)', 'ПРОДАВЕЦ (КОД ФИЛИАЛА)', 'ПРОДАВЕЦ (НАЗВАНИЕ ФИЛИАЛА)', 'ПОКУПАТЕЛЬ (ИНН ИЛИ ПИНФЛ)', 'ПОКУПАТЕЛЬ (НАИМЕНОВАНИЕ)', 'ПОКУПАТЕЛЬ (КОД ФИЛИАЛА)', 'ПОКУПАТЕЛЬ (НАЗВАНИЕ ФИЛИАЛА)', 'СУММА К ОПЛАТЕ', 'ПРИМЕЧАНИЕ'];

describe('soliq.uz CSV registry', () => {
  test('parses the soliq.uz CSV registry', () => {
    const rows = [CSV_HEAD, ['1', 'id1', 'Подтверждён', '20 от 31.10.2026', 'Стандартный', '20 от 09.10.2026', '111111111', '"SELLER" MCHJ', '', '', '222222222', '"BUYER" MCHJ', '', '', '6400000,0', '']];
    expect(isInvoiceSheet(rows)).toBe(true);
    const [inv] = parseInvoices(rows, 'r.csv');
    expect(inv).toMatchObject({
      id: 'id1', docNo: '20', date: '2026-10-31', status: 'Подписан', contractNo: '20', contractDate: '2026-10-09',
      sellerInn: '111111111', buyerInn: '222222222', total: 640000000, amount: 640000000, vat: 0, items: [], brief: true, file: 'r.csv',
    });
  });

  test('statuses of both registries share one spelling', () => {
    expect(normalizeStatus('Подтверждён')).toBe('Подписан');
    expect(normalizeStatus('Ожидает подписи партнёра')).toBe('Ожидает');
    expect(normalizeStatus('Отменено')).toBe('Отменен');
    expect(normalizeStatus('Отказано')).toBe('Отказ');
    expect(normalizeStatus('Подписан')).toBe('Подписан');
  });

  test('detailed registry invoices are not brief', () => {
    expect(parseInvoices(rows(), 'f.xlsx')[0].brief).toBeFalsy();
  });
});

describe('isServiceItem', () => {
  const item = (unit: string, origin: string) => ({ name: 'x', code: '', unit, qty: 1, amount: 1, vat: 0, total: 1, origin });
  test('services by origin or by unit', () => {
    expect(isServiceItem(item('шт.', 'Оказание услуг'))).toBe(true);
    expect(isServiceItem(item('oy', 'Перепродажа'))).toBe(true);
    expect(isServiceItem(item('kv. metr', ''))).toBe(true);
    expect(isServiceItem(item('dona', 'Перепродажа'))).toBe(false);
  });
});
