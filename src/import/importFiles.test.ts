import ExcelJS from 'exceljs';
import { beforeEach, expect, test } from 'vitest';
import { ACC_UZS, formatARows } from '../bank/testkit';
import { buildGtdTemplate } from '../stock/template';
import { bankActions, getBank } from '../ui/bank/bankStore';
import { importFiles } from './importFiles';

const xlsxFile = async (name: string, rows: unknown[][]) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('S');
  rows.forEach((r, i) => (ws.getRow(i + 1).values = r as ExcelJS.CellValue[]));
  return new File([(await wb.xlsx.writeBuffer()) as ArrayBuffer], name);
};
const CSV = [
  '№;ID;СТАТУС;СЧЁТ-ФАКТУРА;ТИП ЭСФ;ДОГОВОР;ПРОДАВЕЦ (ИНН ИЛИ ПИНФЛ);ПРОДАВЕЦ (НАИМЕНОВАНИЕ);ПРОДАВЕЦ (КОД ФИЛИАЛА);ПРОДАВЕЦ (НАЗВАНИЕ ФИЛИАЛА);ПОКУПАТЕЛЬ (ИНН ИЛИ ПИНФЛ);ПОКУПАТЕЛЬ (НАИМЕНОВАНИЕ);ПОКУПАТЕЛЬ (КОД ФИЛИАЛА);ПОКУПАТЕЛЬ (НАЗВАНИЕ ФИЛИАЛА);СУММА К ОПЛАТЕ;ПРИМЕЧАНИЕ',
  '1;id1;Подтверждён;20 от 31.10.2026;Стандартный;20 от 09.10.2026;999000111;"""NAMUNA"" MCHJ";;;300000001;"""ALFA"" MCHJ";;;112000,0;',
].join('\r\n');

beforeEach(async () => {
  await bankActions.wipe();
});

test('one drop takes statements, invoice registries and GTD reports; unknown files are reported', async () => {
  const statement = await xlsxFile('bank.xlsx', formatARows(ACC_UZS, '0,00', '100,00', [['05.07.2026 10:00:00', '20208000100000000002//ALFA', '1', '01', '00001', 0, '100,00', 'Оплата за товар']]));
  const template = await buildGtdTemplate();
  template.getWorksheet('GTD')!.getRow(3).values = ['ИМ 40', '15.06.2026', '0000123', 'SUPPLIER', 1, '6910900000', 'Унитаз', '', 12, 'шт', 335];
  const gtd = new File([(await template.xlsx.writeBuffer()) as ArrayBuffer], 'gtd.xlsx');
  const registry = new File([new TextEncoder().encode(CSV)], 'chiquvchi.csv');
  const junk = await xlsxFile('boshqa.xlsx', [['Hech narsa']]);
  const pdf = new File(['x'], 'scan.pdf');

  const r = await importFiles([statement, gtd, registry, junk, pdf]);
  expect(r).toMatchObject({ statements: 1, invoices: 1, gtd: 1 });
  expect(r.errors.map((e) => e.file)).toEqual(['boshqa.xlsx', 'scan.pdf']);
  const bank = getBank();
  expect(bank.statements).toHaveLength(1);
  expect(bank.invoices[0]).toMatchObject({ id: 'id1', brief: true });
  expect(bank.gtd[0]).toMatchObject({ gtdNo: '0000123', qty: 335 });
  expect(bank.files.map((f) => f.file)).toEqual(['bank.xlsx']);
});
