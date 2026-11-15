import ExcelJS from 'exceljs';
import { expect, test } from 'vitest';
import { buildStockWorkbook } from './exportStock';
import type { StockResult } from './stock';

const result: StockResult = {
  unknownQty: [],
  rows: [
    {
      key: 'унитаз', name: 'Унитаз', unit: 'шт', opening: 10, qtyIn: 420, qtyOut: 5, balance: 425, negative: false,
      moves: [
        { id: 'a', date: '2026-07-06', key: 'унитаз', name: 'Унитаз', dir: 'in', qty: 420, unit: 'шт', source: 'gtd', doc: 'GTD № 1', party: 'SUPPLIER', balance: 430 },
        { id: 'b', date: '2026-07-21', key: 'унитаз', name: 'Унитаз', dir: 'out', qty: 5, unit: 'шт', source: 'invoice', doc: 'Faktura № 2', party: 'BETA', balance: 425 },
      ],
    },
  ],
};

test('stock workbook: balance is a formula over opening, in and out; movements listed', async () => {
  const wb = await buildStockWorkbook(result, { from: '2026-07-01', to: '2026-07-31', company: 'NAMUNA' });
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(await wb.xlsx.writeBuffer());
  expect(back.worksheets.map((w) => w.name)).toEqual(['Ombor', 'Harakatlar']);
  const ws = back.getWorksheet('Ombor')!;
  let row: ExcelJS.Row | undefined;
  ws.eachRow((r) => {
    if (r.getCell(2).value === 'Унитаз') row = r;
  });
  const n = row!.number;
  expect(row!.getCell(4).value).toBe(10);
  expect(row!.getCell(7).value).toEqual({ formula: `D${n}+E${n}-F${n}`, result: 425 });
  expect(back.getWorksheet('Harakatlar')!.rowCount).toBe(3);
});
