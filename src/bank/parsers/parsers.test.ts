import ExcelJS from 'exceljs';
import { describe, expect, test } from 'vitest';
import { ACC_UZS, CO, formatARows } from '../testkit';
import { parseStatement } from './detect';
import { currencyOf, parseFormatA } from './formatA';
import { readWorkbookRows } from './rows';

const rows = () =>
  formatARows(ACC_UZS, '0.00', '1 234 567.89', [
    ['16.03.2026 16:57:19', '10111000600000000001/201000001/Ali Valiyev', '000309', '03', '00999', 0, 1500000, 'Ustav fondini shakllantirish uchun_x000D_\nqo‘shimcha'],
    ['17.03.2026 09:56:22', '22613000900000000001//ООО "NAMUNA SAVDO"', '18', '', '', '265332.11', 0, '00611~Перечисление для покупки иностранной валюты'],
    ['18.03.2026 10:00:00', 'TR6000062000/ /NAMUNA A/S / Istanbul', '7', '', '', 0, '0', 'bad row'],
  ]);

describe('parseFormatA', () => {
  test('reads header: bank, MFO, period, account, company, INN, balances', () => {
    const r = rows();
    r.splice(7, 1); // drop the invalid row
    r[r.length - 1] = ['Итоговый оборот за период', null, null, null, null, 265332.11, 1500000];
    const s = parseFormatA(r, 'a.xlsx');
    expect(s.account).toMatchObject({
      number: ACC_UZS, balanceAcc: '20208', currency: 'UZS', company: CO.name, inn: CO.inn,
      mfo: '00999', bankName: 'ТОШКЕНТ Ш., "NAMUNA BANK" АТ БОШ ОФИСИ',
      periodFrom: '2026-01-01', periodTo: '2026-10-31', openingBalance: 0, closingBalanceBank: 123456789,
      totalDebitBank: 26533211, totalCreditBank: 150000000,
    });
    expect(s.operations).toHaveLength(2);
  });

  test('splits korr account/INN/name on the first two slashes and keeps times', () => {
    const r = rows();
    r.splice(7, 1);
    const [a, b] = parseFormatA(r, 'a.xlsx').operations;
    expect(a).toMatchObject({ datetime: '2026-03-16T16:57:19', korrAccount: '10111000600000000001', korrInn: '201000001', korrName: 'Ali Valiyev', docNo: '000309', opCode: '03', korrMfo: '00999', debit: 0, credit: 150000000 });
    expect(a.purpose).toBe('Ustav fondini shakllantirish uchun qo‘shimcha');
    expect(b).toMatchObject({ korrInn: '', korrName: 'ООО "NAMUNA SAVDO"', debit: 26533211, credit: 0 });
  });

  test('rejects an operation without exactly one of debit/credit, naming the row', () => {
    expect(() => parseFormatA(rows(), 'a.xlsx')).toThrow(/8-qator/);
  });

  test('an empty statement gives no operations', () => {
    const s = parseFormatA(formatARows(ACC_UZS, '0.00', '0.00', []), 'e.xlsx');
    expect(s.operations).toEqual([]);
    expect(s.account.totalDebitBank).toBe(0);
  });
});

describe('detect and read', () => {
  test('currency comes from digits 6–8 of the account', () => {
    expect(currencyOf('20208840900000000001')).toBe('USD');
    expect(currencyOf('20208978900000000001')).toBe('EUR');
    expect(currencyOf('20208643900000000001')).toBe('RUB');
    expect(currencyOf('20208000900000000001')).toBe('UZS');
  });

  test('unknown layouts get a clear message', () => {
    expect(() => parseStatement([[['hello']]], 'x.xlsx')).toThrow(/formati tanilmadi/);
  });

  test('reads an xlsx file and parses it end to end, keeping long numbers as text', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Отчет');
    const r = rows();
    r.splice(7, 1);
    r[r.length - 1] = ['Итоговый оборот за период', null, null, null, null, 265332.11, 1500000];
    r.forEach((row) => ws.addRow(row));
    const buf = await wb.xlsx.writeBuffer();
    const sheets = await readWorkbookRows(buf as ArrayBuffer);
    const s = parseStatement(sheets, 'f.xlsx');
    expect(s.format).toBe('A');
    expect(s.operations[0].korrAccount).toBe('10111000600000000001');
  });
});

test('rows with empty leading cells come back dense (no array holes)', async () => {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet('S').getCell('C2').value = 'x';
  const [rows] = await readWorkbookRows((await wb.xlsx.writeBuffer()) as ArrayBuffer);
  expect(Object.keys(rows[1])).toEqual(['0', '1', '2']);
  expect(rows[1].findIndex((c) => c === 'x')).toBe(2);
});
