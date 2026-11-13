import ExcelJS from 'exceljs';
import { describe, expect, test } from 'vitest';
import { analyze } from './analyze';
import { bankFileName, buildBankWorkbook } from './exportExcel';
import { parseFormatA } from './parsers/formatA';
import { DEFAULT_RULES } from './rules/defaultRules';
import { ACC_BUY, ACC_FX, ACC_UZS, CO, formatARows, type OpRow } from './testkit';

const uzs: OpRow[] = [
  ['16.03.2026 10:00:00', '10111000600000000001/201000001/Ali Valiyev', '1', '03', '00999', 0, 500000000, 'ustav fondini shakllantirish uchun'],
  ['20.03.2026 11:00:00', `${ACC_BUY}//${CO.name}`, '18', '', '', 241400000, 0, 'Перечисление для покупки иностранной валюты'],
  ['21.04.2026 12:00:00', '16401000500000000002/999000111/Bank', '3', '06', '00999', 75000.5, 0, 'Комиссия за операцию "Перевод"'],
];
const buy: OpRow[] = [
  ['20.03.2026 11:00:00', `${ACC_UZS}//${CO.name}`, '18', '', '', 0, 241400000, 'для покупки иностранной валюты'],
  ['20.03.2026 11:00:00', '17101000900000000601/200000009/СПОТ USD', '18', '', '', 241400000, 0, 'Продажа иностранной валюты согласно заявке N 18'],
];
const fx: OpRow[] = [
  ['20.03.2026 12:00:00', '17101840900000000006/200000009/СПОТ USD', '18', '', '', 0, 20000, 'Продажа иностранной валюты согласно заявке N 18'],
  ['22.03.2026 10:00:00', '33070010200000000550//SUPPLIER LTD', '21', '', '', 20000, 0, 'CONTRACT NUMBER 1 PURCHASE'],
];
const close = (ops: OpRow[]) => ops.reduce((s, o) => s - Number(o[5]) + Number(o[6]), 0).toFixed(2);
const st = (acc: string, ops: OpRow[]) => parseFormatA(formatARows(acc, '0.00', close(ops), ops), `${acc}.xlsx`);
const idle = parseFormatA(formatARows('20208978900000000001', '0.00', '0.00', []), 'eur.xlsx');

async function roundTrip() {
  const a = analyze([st(ACC_UZS, uzs), st(ACC_BUY, buy), st(ACC_FX, fx), idle], DEFAULT_RULES);
  const buf = await (await buildBankWorkbook(a)).xlsx.writeBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return { a, wb };
}
const res = (c: ExcelJS.Cell) =>
  c.value && typeof c.value === 'object' && 'formula' in c.value ? (c.value as { result?: unknown }).result : c.value;
const formula = (c: ExcelJS.Cell) => (c.value as { formula?: string }).formula ?? '';
const rowWith = (ws: ExcelJS.Worksheet, col: number, text: string) => {
  let found: ExcelJS.Row | undefined;
  ws.eachRow((r) => {
    if (!found && String(res(r.getCell(col))) === text) found = r;
  });
  return found!;
};

describe('bank Excel export', () => {
  test('file name and sheet order', async () => {
    const { a, wb } = await roundTrip();
    expect(bankFileName(a)).toBe('NAMUNA_SAVDO_bank_2026.xlsx');
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Svod', 'Turlar svodi', 'USD 22614', 'UZS 20208', 'UZS 22613', 'Korr USD 22614', 'Korr UZS 20208', 'Korr UZS 22613', 'Batafsil', 'Diqqat',
    ]);
  });

  test('account sheet: running balance formulas and a JAMI row with computed results', async () => {
    const { wb } = await roundTrip();
    const ws = wb.getWorksheet('UZS 20208')!;
    expect(formula(ws.getCell('J5'))).toBe('$E$2-H5+I5');
    expect(formula(ws.getCell('J6'))).toBe('J5-H6+I6');
    expect(ws.getCell('D5').value).toBe('10111000600000000001');
    expect(ws.getCell('D5').numFmt).toBe('@');
    const jami = rowWith(ws, 2, 'JAMI');
    expect(formula(jami.getCell(8))).toBe('SUM(H5:H7)');
    expect(res(jami.getCell(8))).toBe(241475000.5);
    expect(res(jami.getCell(10))).toBe(258524999.5);
  });

  test('Svod links to the account sheets, shows bank balance and zero difference; idle accounts are listed', async () => {
    const { wb } = await roundTrip();
    const ws = wb.getWorksheet('Svod')!;
    const r = rowWith(ws, 2, ACC_UZS);
    expect(formula(r.getCell(6))).toBe("'UZS 20208'!H8");
    expect(res(r.getCell(8))).toBe(258524999.5);
    expect(r.getCell(9).value).toBe(258524999.5);
    expect(formula(r.getCell(10))).toMatch(/^ROUND\(H\d+-I\d+,2\)$/);
    // ExcelJS writes <v>0</v> but its reader drops a zero cached result, so missing means 0 here.
    expect(res(r.getCell(10)) ?? 0).toBe(0);
    expect(r.getCell(5).font?.color?.argb).toBe('FF0000FF');
    const idleRow = rowWith(ws, 2, '20208978900000000001');
    expect(idleRow.getCell(11).value).toBe("harakat yo'q");
  });

  test('types sheet counts through SUMPRODUCT on Batafsil with account, group and type', async () => {
    const { wb } = await roundTrip();
    const ws = wb.getWorksheet('Turlar svodi')!;
    const r = rowWith(ws, 4, "Ustav fondiga hissa (ta'sischidan)");
    expect(formula(r.getCell(5))).toMatch(/SUMPRODUCT\(\(Batafsil!\$A\$2:\$A\$8=\$A\d+\)\*\(Batafsil!\$C\$2:\$C\$8=\$C\d+\)\*\(Batafsil!\$D\$2:\$D\$8=\$D\d+\)\)/);
    expect(res(r.getCell(5))).toBe(1);
    expect(res(r.getCell(7))).toBe(500000000);
    expect(r.getCell(8).numFmt).toBe('0.0%');
  });

  test('correspondents and details tables', async () => {
    const { a, wb } = await roundTrip();
    const korr = wb.getWorksheet('Korr UZS 20208')!;
    const jami = rowWith(korr, 2, 'JAMI');
    expect(res(jami.getCell(5))).toBe(3);
    expect(formula(korr.getCell('E5'))).toMatch(/^SUMPRODUCT\(\('UZS 20208'!\$D\$5:\$D\$7=B5\)\*1\)$/);
    expect(wb.getWorksheet('Batafsil')!.rowCount).toBe(a.operations.length + 1);
    expect(wb.getWorksheet('Svod')!.getCell('A1').value).toMatch(/oborot-saldo/);
  });
});
