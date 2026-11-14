import { describe, expect, test } from 'vitest';
import { companyInnOf, isInvoiceSheet, parseInvoices } from './invoices';
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
