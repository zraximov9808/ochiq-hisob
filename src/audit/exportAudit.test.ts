import ExcelJS from 'exceljs';
import { expect, test } from 'vitest';
import { parseInvoices } from './invoices';
import { buildActWorkbook, buildAuditWorkbook } from './exportAudit';
import { buildAudit } from './settlement';
import { invoiceRows } from './testkit';

const ME: [string, string] = ['999000111', '"NAMUNA SAVDO" MCHJ'];
const audit = () =>
  buildAudit(
    null,
    parseInvoices(
      invoiceRows([
        { no: '1', date: '10-03-2026', seller: ME, buyer: ['300000003', '"BETA" MCHJ'], lines: [['Unitaz', 1000000, 120000]] },
        { no: '2', date: '12-03-2026', seller: ['300000002', '"ALFA" MCHJ'], buyer: ME, lines: [['Radiator', 500000, 60000]] },
      ]),
      'f.xlsx',
    ),
    { includePending: false },
  );

const reload = async (wb: ExcelJS.Workbook) => {
  const out = new ExcelJS.Workbook();
  await out.xlsx.load(await wb.xlsx.writeBuffer());
  return out;
};
const res = (c: ExcelJS.Cell) => (c.value && typeof c.value === 'object' && 'formula' in c.value ? (c.value as { result?: unknown }).result : c.value);

test('audit workbook: counterparty table with saldo formulas and totals', async () => {
  const wb = await reload(await buildAuditWorkbook(audit()));
  expect(wb.worksheets.map((w) => w.name)).toEqual(['Ekspres audit', 'Harakatlar', 'Hisobga olinmagan']);
  const ws = wb.getWorksheet('Ekspres audit')!;
  let beta: ExcelJS.Row | undefined;
  let total: ExcelJS.Row | undefined;
  ws.eachRow((r) => {
    if (r.getCell(2).value === '300000003') beta = r;
    if (r.getCell(3).value === 'JAMI') total = r;
  });
  expect((beta!.getCell(8).value as { formula: string }).formula).toBe(`G${beta!.number}+E${beta!.number}-D${beta!.number}-F${beta!.number}`);
  expect(res(beta!.getCell(8))).toBe(1120000);
  expect(res(beta!.getCell(9))).toBe(1120000);
  expect(beta!.getCell(2).numFmt).toBe('@');
  expect(res(total!.getCell(9))).toBe(1120000);
  expect(res(total!.getCell(10))).toBe(560000);
});

test('reconciliation act for one counterparty lists movements with a running balance', async () => {
  const a = audit();
  const wb = await reload(await buildActWorkbook(a, a.rows.find((r) => r.inn === '300000002')!));
  const ws = wb.worksheets[0];
  expect(String(ws.getCell('A1').value)).toMatch(/Solishtirish dalolatnomasi/);
  let last: unknown;
  ws.eachRow((r) => {
    if (r.getCell(1).value === '12.03.2026') last = res(r.getCell(7));
  });
  expect(last).toBe(-560000);
});
