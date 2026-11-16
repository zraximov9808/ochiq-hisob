import ExcelJS from 'exceljs';
import { expect, test } from 'vitest';
import { readWorkbookRows } from '../bank/parsers/rows';
import { isGtdSheet, parseGtd } from './gtd';
import { buildGtdTemplate } from './template';

const roundTrip = async (wb: ExcelJS.Workbook) => readWorkbookRows((await wb.xlsx.writeBuffer()) as ArrayBuffer);

test('the empty template is recognised as a GTD report and imports nothing', async () => {
  const wb = await buildGtdTemplate();
  expect(wb.worksheets.map((w) => w.name)).toEqual(['GTD', 'Yo‘riqnoma']);
  const sheets = await roundTrip(wb);
  expect(isGtdSheet(sheets[0])).toBe(true);
  expect(parseGtd(sheets[0], 't.xlsx')).toEqual([]);
  expect(isGtdSheet(sheets[1])).toBe(false);
});

test('a filled-in template row is read back with date, number, name, unit and quantity', async () => {
  const wb = await buildGtdTemplate();
  const ws = wb.getWorksheet('GTD')!;
  ws.getRow(3).values = ['ИМ 40', '15.06.2026', '0000123', 'SUPPLIER CO., LTD', 1, '6910900000', 'Унитаз керамический / Ceramic toilet', '06910001001000000', 12, 'шт', 335];
  const [rows] = await roundTrip(wb);
  expect(parseGtd(rows, 't.xlsx')).toEqual([
    expect.objectContaining({ date: '2026-06-15', gtdNo: '0000123', itemNo: '1', regime: 'ИМ 40', name: 'Унитаз керамический / Ceramic toilet', unit: 'шт', qty: 335, places: 12 }),
  ]);
});

test('optional value columns of the template are read back', async () => {
  const wb = await buildGtdTemplate();
  const ws = wb.getWorksheet('GTD')!;
  ws.getRow(3).values = ['ИМ 40', '15.06.2026', '0000123', 'SUPPLIER CO., LTD', 1, '6910900000', 'Унитаз', '06910001001000000', 12, 'шт', 335, '840', 12000, 1000, 50000, 150000, 120000];
  const [rows] = await roundTrip(wb);
  expect(parseGtd(rows, 't.xlsx')[0]).toMatchObject({ currency: '840', rate: 12000, invoiceValue: 100000, fees: 5000000, duty: 15000000, importVat: 12000000 });
});
