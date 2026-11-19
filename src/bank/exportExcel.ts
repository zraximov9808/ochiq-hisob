import ExcelJS from 'exceljs';
import { correspondents, fxSummary, monthly, typeSummary, GROUPS } from './aggregates';
import type { Analysis } from './analyze';
import { companySlug } from './names';
import { FLAG_TEXT } from './flagsText';
import type { BankAccount, Operation } from './model';
import { DEFAULT_RULES } from './rules/defaultRules';

const MONEY = '#,##0.00;(#,##0.00);"-"';
const HEAD_FILL = 'FF1F4E78';
const TOTAL_FILL = 'FFD9E1F2';
const ACCOUNT_FILL = 'FFB4C6E7';
const BLUE = { argb: 'FF0000FF' };
const GREEN = { argb: 'FF008000' };

const so = (tiyin: number) => Math.round(tiyin) / 100;
const dayDate = (iso: string) => new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))));
const ddmmyyyy = (iso: string) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');
const f = (formula: string, result: ExcelJS.CellValue | number | string | Date | null) => ({ formula, result } as ExcelJS.CellFormulaValue);
const ref = (sheet: string, cell: string) => `'${sheet.replace(/'/g, "''")}'!${cell}`;

/** "ООО "NAMUNA SAVDO"" → "NAMUNA_SAVDO_bank_2026.xlsx". */
export function bankFileName(a: Analysis): string {
  return `${companySlug(a.company.name)}_bank_${(a.company.periodTo || new Date().toISOString()).slice(0, 4)}.xlsx`;
}

function headerRow(ws: ExcelJS.Worksheet, rowNo: number, titles: string[]) {
  const row = ws.getRow(rowNo);
  titles.forEach((t, i) => {
    const c = row.getCell(i + 1);
    c.value = t;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_FILL } };
    c.alignment = { vertical: 'middle', wrapText: true };
  });
  row.height = 30;
}

function fillRow(row: ExcelJS.Row, cols: number, argb: string) {
  for (let i = 1; i <= cols; i++) {
    const c = row.getCell(i);
    c.font = { ...(c.font ?? {}), bold: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
  }
}

const text = (c: ExcelJS.Cell, v: string) => {
  c.value = v;
  c.numFmt = '@';
};

interface SheetInfo {
  account: BankAccount;
  name: string;
  korrName: string;
  ops: Operation[];
  first: number;
  last: number;
  jamiRow: number;
}

function sheetNames(accounts: BankAccount[], ops: Operation[]): SheetInfo[] {
  const used = new Set<string>();
  const out: SheetInfo[] = [];
  for (const account of accounts) {
    const list = ops.filter((o) => o.account === account.number);
    if (!list.length) continue;
    let name = `${account.currency} ${account.balanceAcc}`;
    for (let i = 2; used.has(name); i++) name = `${account.currency} ${account.balanceAcc} (${i})`;
    used.add(name);
    out.push({ account, name, korrName: `Korr ${name}`, ops: list, first: 5, last: 4 + list.length, jamiRow: 5 + list.length });
  }
  return out;
}

const TYPE_OF = Object.fromEntries(DEFAULT_RULES.map((r) => [r.id, r.type]));

/** Builds the formula-driven workbook described in the spec (section 9). */
export async function buildBankWorkbook(a: Analysis): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Ochiq Hisob';
  wb.created = new Date();
  const sheets = sheetNames(a.accounts, a.operations);
  const byAccount = new Map(sheets.map((s) => [s.account.number, s]));
  const period = `${ddmmyyyy(a.company.periodFrom)}–${ddmmyyyy(a.company.periodTo)}`;
  const year = a.company.periodTo.slice(0, 4);

  // Batafsil rows are referenced from other sheets, so their order is fixed first.
  const detail = sheets.flatMap((s) => s.ops);
  const detailLast = detail.length + 1;
  const D = (col: string) => `Batafsil!$${col}$2:$${col}$${detailLast}`;

  const svod = wb.addWorksheet('Svod');
  const types = wb.addWorksheet('Turlar svodi');
  for (const s of sheets) wb.addWorksheet(s.name);
  for (const s of sheets) wb.addWorksheet(s.korrName);
  const det = wb.addWorksheet('Batafsil');
  const diq = wb.addWorksheet('Diqqat');

  // ---- Svod, block 1: turnover and balances ----
  svod.columns = [8, 24, 9, 22, 18, 18, 18, 18, 20, 12, 14].map((width) => ({ width }));
  svod.getCell('A1').value = `Bank hisob raqamlari bo'yicha oborot-saldo vedomosti, ${year} yil – ${a.company.name}`;
  svod.getCell('A1').font = { bold: true, size: 13 };
  svod.getCell('A2').value = `Manba: ${a.company.bankName} (MFO ${a.company.mfo}), davr ${period}`;
  headerRow(svod, 4, ['№', 'Hisob raqami', 'Valyuta', 'Vipiska davri', 'Davr boshiga qoldiq', 'Debet oboroti', 'Kredit oboroti', 'Davr oxiriga qoldiq', "Bank bo'yicha qoldiq (tekshiruv)", 'Farq', 'Oxirgi provodka']);
  const openingCell = new Map<string, string>();
  let r = 5;
  a.accounts.forEach((acc, i) => {
    const s = byAccount.get(acc.number);
    const check = a.checks.find((c) => c.account === acc.number)!;
    const row = svod.getRow(r);
    row.getCell(1).value = i + 1;
    text(row.getCell(2), acc.number);
    row.getCell(3).value = acc.currency;
    row.getCell(4).value = `${ddmmyyyy(acc.periodFrom)}–${ddmmyyyy(acc.periodTo)}`;
    row.getCell(5).value = so(acc.openingBalance);
    row.getCell(5).font = { color: BLUE };
    if (s) {
      row.getCell(6).value = f(ref(s.name, `H${s.jamiRow}`), so(check.debit));
      row.getCell(7).value = f(ref(s.name, `I${s.jamiRow}`), so(check.credit));
      row.getCell(6).font = { color: GREEN };
      row.getCell(7).font = { color: GREEN };
      row.getCell(11).value = f(ref(s.name, `B${s.last}`), dayDate(s.ops.at(-1)!.datetime));
      row.getCell(11).numFmt = 'dd.mm.yyyy';
    } else {
      row.getCell(6).value = 0;
      row.getCell(7).value = 0;
      row.getCell(11).value = "harakat yo'q";
    }
    row.getCell(8).value = f(`E${r}-F${r}+G${r}`, so(check.closing));
    row.getCell(9).value = so(acc.closingBalanceBank);
    row.getCell(9).font = { color: BLUE };
    row.getCell(10).value = f(`ROUND(H${r}-I${r},2)`, so(check.diff));
    for (const c of [5, 6, 7, 8, 9, 10]) row.getCell(c).numFmt = MONEY;
    openingCell.set(acc.number, `E${r}`);
    r++;
  });

  // ---- Svod, block 2: foreign currency by month ----
  const fx = fxSummary(a);
  const fxCurrencies = [...new Set(a.accounts.filter((x) => x.currency !== 'UZS').map((x) => x.currency))];
  const months = [...new Set(a.operations.map((o) => o.datetime.slice(0, 7)))].sort();
  const sumifs = (sumCol: string, type: string, cur: string, monthCell: string) =>
    `SUMIFS(${D(sumCol)},${D('D')},"${type.replace(/"/g, '""')}",${D('B')},"${cur}",${D('E')},">="&${monthCell},${D('E')},"<"&EDATE(${monthCell},1))`;
  const monthOps = (m: string, cur: string, ids: string[], k: 'debit' | 'credit') =>
    so(a.operations.filter((o) => o.datetime.startsWith(m) && a.accounts.find((x) => x.number === o.account)!.currency === cur && ids.some((id) => o.ruleId === id || o.type === TYPE_OF[id])).reduce((s, o) => s + o[k], 0));
  for (const mode of fx.modes) {
    for (const cur of fxCurrencies) {
      r += 2;
      svod.getCell(`A${r}`).value = mode === 'import' ? `Valyuta (import), ${cur}: sotib olish va xorijga to'lov` : `Valyuta (eksport), ${cur}: tushum va sotish`;
      svod.getCell(`A${r}`).font = { bold: true };
      r++;
      headerRow(
        svod,
        r,
        mode === 'import'
          ? ['Oy', 'Valyuta', "Ta'sischidan valyuta tushumi", 'Sotib olingan valyuta (22614)', "Xaridga to'langan so'm (22613)", "Kurs (so'm/valyuta)", "Xorijga to'langan valyuta", 'Izoh']
          : ['Oy', 'Valyuta', 'Valyuta tushumi', 'Sotish uchun rezerv', "So'm ekvivalenti", "Kurs (so'm/valyuta)", 'Izoh'],
      );
      const firstRow = r + 1;
      for (const m of months) {
        r++;
        const row = svod.getRow(r);
        row.getCell(1).value = dayDate(`${m}-01`);
        row.getCell(1).numFmt = 'mm.yyyy';
        row.getCell(2).value = cur;
        const A = `A${r}`;
        if (mode === 'import') {
          const c = monthOps(m, cur, ['charter'], 'credit');
          const d = monthOps(m, cur, ['fx-spot-in'], 'credit');
          const e = monthOps(m, 'UZS', ['fx-spot-pay'], 'debit');
          const g = monthOps(m, cur, ['import'], 'debit') + monthOps(m, cur, ['import-transport'], 'debit');
          row.getCell(3).value = f(sumifs('K', TYPE_OF['charter'], cur, A), c);
          row.getCell(4).value = f(sumifs('K', TYPE_OF['fx-spot-in'], cur, A), d);
          row.getCell(5).value = f(sumifs('J', TYPE_OF['fx-spot-pay'], 'UZS', A), e);
          row.getCell(6).value = f(`IF(OR(D${r}=0,E${r}=0),"",E${r}/D${r})`, d && e ? Math.round((e / d) * 100) / 100 : '');
          row.getCell(7).value = f(`${sumifs('J', TYPE_OF['import'], cur, A)}+${sumifs('J', TYPE_OF['import-transport'], cur, A)}`, g);
          const conv = fx.conversions.filter((x) => x.currency === cur && x.date.startsWith(m));
          row.getCell(8).value = conv.map((x) => `zayavka ${x.request ?? '?'}: kurs ${x.rate}`).join('; ');
          for (const col of [3, 4, 5, 7]) row.getCell(col).numFmt = MONEY;
        } else {
          const c = monthOps(m, cur, ['export-swift'], 'credit');
          const d = monthOps(m, cur, ['fx-reserve'], 'debit');
          const e = monthOps(m, 'UZS', ['fx-sale-uzs'], 'credit');
          row.getCell(3).value = f(sumifs('K', TYPE_OF['export-swift'], cur, A), c);
          row.getCell(4).value = f(sumifs('J', TYPE_OF['fx-reserve'], cur, A), d);
          row.getCell(5).value = f(sumifs('K', TYPE_OF['fx-sale-uzs'], 'UZS', A), e);
          row.getCell(6).value = f(`IF(OR(D${r}=0,E${r}=0),"",E${r}/D${r})`, d && e ? Math.round((e / d) * 100) / 100 : '');
          for (const col of [3, 4, 5]) row.getCell(col).numFmt = MONEY;
        }
        row.getCell(6).numFmt = '#,##0.00';
      }
      r++;
      const tot = svod.getRow(r);
      tot.getCell(1).value = 'JAMI';
      const cols = mode === 'import' ? [3, 4, 5, 7] : [3, 4, 5];
      for (const col of cols) {
        const L = String.fromCharCode(64 + col);
        let v = 0;
        for (let k = firstRow; k < r; k++) v += Number((svod.getCell(`${L}${k}`).value as ExcelJS.CellFormulaValue).result ?? 0);
        tot.getCell(col).value = f(`SUM(${L}${firstRow}:${L}${r - 1})`, Math.round(v * 100) / 100);
        tot.getCell(col).numFmt = MONEY;
      }
      const dT = Number((tot.getCell(4).value as ExcelJS.CellFormulaValue).result ?? 0);
      const eT = Number((tot.getCell(5).value as ExcelJS.CellFormulaValue).result ?? 0);
      tot.getCell(6).value = f(`IF(OR(D${r}=0,E${r}=0),"",E${r}/D${r})`, dT && eT ? Math.round((eT / dT) * 100) / 100 : '');
      tot.getCell(6).numFmt = '#,##0.00';
      fillRow(tot, mode === 'import' ? 8 : 7, TOTAL_FILL);
    }
  }

  // ---- Svod, block 3: months per account ----
  r += 2;
  svod.getCell(`A${r}`).value = 'Oylar kesimida';
  svod.getCell(`A${r}`).font = { bold: true };
  r++;
  headerRow(svod, r, ['№', 'Hisob raqami', 'Valyuta', 'Oy', 'Oy boshiga qoldiq', 'Debet', 'Kredit', 'Oy oxiriga qoldiq']);
  let n = 1;
  for (const s of sheets) {
    const rows = monthly(s.account, s.ops);
    const first = r + 1;
    rows.forEach((m, i) => {
      r++;
      const row = svod.getRow(r);
      row.getCell(1).value = n++;
      text(row.getCell(2), s.account.number);
      row.getCell(3).value = s.account.currency;
      row.getCell(4).value = dayDate(`${m.month}-01`);
      row.getCell(4).numFmt = 'mm.yyyy';
      row.getCell(5).value = i === 0 ? f(openingCell.get(s.account.number)!, so(m.opening)) : f(`H${r - 1}`, so(m.opening));
      const range = (col: string) => ref(s.name, `$${col}$${s.first}:$${col}$${s.last}`);
      const cond = `${range('B')},">="&$D${r},${range('B')},"<"&EDATE($D${r},1)`;
      row.getCell(6).value = f(`SUMIFS(${range('H')},${cond})`, so(m.debit));
      row.getCell(7).value = f(`SUMIFS(${range('I')},${cond})`, so(m.credit));
      row.getCell(8).value = f(`E${r}-F${r}+G${r}`, so(m.closing));
      for (const c of [5, 6, 7, 8]) row.getCell(c).numFmt = MONEY;
    });
    r++;
    const tot = svod.getRow(r);
    tot.getCell(2).value = `JAMI ${s.account.number}`;
    tot.getCell(3).value = s.account.currency;
    tot.getCell(6).value = f(`SUM(F${first}:F${r - 1})`, so(rows.reduce((t, m) => t + m.debit, 0)));
    tot.getCell(7).value = f(`SUM(G${first}:G${r - 1})`, so(rows.reduce((t, m) => t + m.credit, 0)));
    tot.getCell(8).value = f(`H${r - 1}`, so(rows.at(-1)?.closing ?? s.account.openingBalance));
    for (const c of [6, 7, 8]) tot.getCell(c).numFmt = MONEY;
    fillRow(tot, 8, ACCOUNT_FILL);
  }
  svod.views = [{ state: 'frozen', ySplit: 4 }];

  // ---- Turlar svodi ----
  types.columns = [24, 9, 11, 46, 9, 18, 18, 11].map((width) => ({ width }));
  types.getCell('A1').value = "Operatsiya turlari bo'yicha guruhlash";
  types.getCell('A1').font = { bold: true, size: 13 };
  types.getCell('A2').value = 'Guruhlar: Kirim (kredit), Chiqim (debet), Soliqlar (debet). Summalar Batafsil varag‘idan formula bilan olinadi.';
  headerRow(types, 4, ['Hisob raqami', 'Valyuta', 'Guruh', 'Operatsiya turi', 'Soni', 'Debet (chiqim)', 'Kredit (kirim)', 'Ulushi, %']);
  r = 5;
  for (const s of sheets) {
    const groups = typeSummary(s.ops);
    const typeRows = groups.reduce((t, g) => t + g.rows.length + 1, 0);
    const accTotalRow = r + typeRows;
    const totalDebit = groups.reduce((t, g) => t + g.total.debit, 0);
    const totalCredit = groups.reduce((t, g) => t + g.total.credit, 0);
    const groupTotalRows: number[] = [];
    for (const g of GROUPS) {
      const grp = groups.find((x) => x.group === g);
      if (!grp) continue;
      const first = r;
      for (const t of grp.rows) {
        const row = types.getRow(r);
        text(row.getCell(1), s.account.number);
        row.getCell(2).value = s.account.currency;
        row.getCell(3).value = g;
        row.getCell(4).value = t.type;
        const cond = `(${D('A')}=$A${r})*(${D('C')}=$C${r})*(${D('D')}=$D${r})`;
        row.getCell(5).value = f(`SUMPRODUCT(${cond})`, t.count);
        row.getCell(6).value = f(`SUMPRODUCT(${cond}*${D('J')})`, so(t.debit));
        row.getCell(7).value = f(`SUMPRODUCT(${cond}*${D('K')})`, so(t.credit));
        row.getCell(8).value =
          g === 'Kirim' ? f(`IF($G$${accTotalRow}=0,0,G${r}/$G$${accTotalRow})`, totalCredit ? t.credit / totalCredit : 0) : f(`IF($F$${accTotalRow}=0,0,F${r}/$F$${accTotalRow})`, totalDebit ? t.debit / totalDebit : 0);
        row.getCell(6).numFmt = MONEY;
        row.getCell(7).numFmt = MONEY;
        row.getCell(8).numFmt = '0.0%';
        r++;
      }
      const row = types.getRow(r);
      text(row.getCell(1), s.account.number);
      row.getCell(2).value = s.account.currency;
      row.getCell(3).value = g;
      row.getCell(4).value = `${g} jami`;
      row.getCell(5).value = f(`SUM(E${first}:E${r - 1})`, grp.total.count);
      row.getCell(6).value = f(`SUM(F${first}:F${r - 1})`, so(grp.total.debit));
      row.getCell(7).value = f(`SUM(G${first}:G${r - 1})`, so(grp.total.credit));
      row.getCell(8).value =
        g === 'Kirim' ? f(`IF($G$${accTotalRow}=0,0,G${r}/$G$${accTotalRow})`, totalCredit ? grp.total.credit / totalCredit : 0) : f(`IF($F$${accTotalRow}=0,0,F${r}/$F$${accTotalRow})`, totalDebit ? grp.total.debit / totalDebit : 0);
      row.getCell(6).numFmt = MONEY;
      row.getCell(7).numFmt = MONEY;
      row.getCell(8).numFmt = '0.0%';
      fillRow(row, 8, TOTAL_FILL);
      groupTotalRows.push(r);
      r++;
    }
    const row = types.getRow(r);
    text(row.getCell(1), s.account.number);
    row.getCell(2).value = s.account.currency;
    row.getCell(4).value = `HISOB BO'YICHA JAMI (${ddmmyyyy(s.account.periodFrom)}–${ddmmyyyy(s.account.periodTo)})`;
    const plus = (L: string) => groupTotalRows.map((x) => `${L}${x}`).join('+');
    row.getCell(5).value = f(plus('E'), s.ops.length);
    row.getCell(6).value = f(plus('F'), so(totalDebit));
    row.getCell(7).value = f(plus('G'), so(totalCredit));
    row.getCell(6).numFmt = MONEY;
    row.getCell(7).numFmt = MONEY;
    fillRow(row, 8, ACCOUNT_FILL);
    r += 2;
  }
  types.views = [{ state: 'frozen', ySplit: 4 }];

  // ---- account sheets ----
  for (const s of sheets) {
    const ws = wb.getWorksheet(s.name)!;
    ws.columns = [6, 11, 12, 24, 34, 12, 60, 17, 17, 18, 40].map((width) => ({ width }));
    ws.getCell('A1').value = `Hisob ${s.account.number} (${s.account.currency}) – operatsiyalar, sana bo'yicha`;
    ws.getCell('A1').font = { bold: true, size: 13 };
    ws.getCell('A2').value = `Davr boshiga qoldiq (${ddmmyyyy(s.account.periodFrom)}):`;
    ws.getCell('E2').value = f(`Svod!${openingCell.get(s.account.number)}`, so(s.account.openingBalance));
    ws.getCell('E2').numFmt = MONEY;
    ws.getCell('E2').font = { color: GREEN, bold: true };
    headerRow(ws, 4, ['№', 'Sana', 'Hujjat №', 'Korr. hisob', 'Korrespondent nomi', 'INN', "To'lov maqsadi", 'Debet', 'Kredit', 'Qoldiq', 'Operatsiya turi']);
    s.ops.forEach((o, i) => {
      const n = s.first + i;
      const row = ws.getRow(n);
      row.getCell(1).value = i + 1;
      row.getCell(2).value = dayDate(o.datetime);
      row.getCell(2).numFmt = 'dd.mm.yyyy';
      text(row.getCell(3), o.docNo);
      text(row.getCell(4), o.korrAccount);
      row.getCell(5).value = o.korrName;
      text(row.getCell(6), o.korrInn);
      row.getCell(7).value = o.purpose;
      row.getCell(8).value = o.debit ? so(o.debit) : null;
      row.getCell(9).value = o.credit ? so(o.credit) : null;
      row.getCell(10).value = f(i === 0 ? `$E$2-H${n}+I${n}` : `J${n - 1}-H${n}+I${n}`, so(o.runningBalance));
      row.getCell(11).value = o.type;
      for (const c of [8, 9, 10]) row.getCell(c).numFmt = MONEY;
    });
    const jami = ws.getRow(s.jamiRow);
    jami.getCell(2).value = 'JAMI';
    jami.getCell(8).value = f(`SUM(H${s.first}:H${s.last})`, so(s.ops.reduce((t, o) => t + o.debit, 0)));
    jami.getCell(9).value = f(`SUM(I${s.first}:I${s.last})`, so(s.ops.reduce((t, o) => t + o.credit, 0)));
    jami.getCell(10).value = f(`J${s.last}`, so(s.ops.at(-1)!.runningBalance));
    for (const c of [8, 9, 10]) jami.getCell(c).numFmt = MONEY;
    fillRow(jami, 11, TOTAL_FILL);
    ws.views = [{ state: 'frozen', ySplit: 4, topLeftCell: 'A5' }];
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: s.last, column: 11 } };
  }

  // ---- correspondent sheets ----
  for (const s of sheets) {
    const ws = wb.getWorksheet(s.korrName)!;
    ws.columns = [6, 26, 44, 13, 12, 18, 18, 18].map((width) => ({ width }));
    ws.getCell('A1').value = `Hisob ${s.account.number} (${s.account.currency}) – korrespondent hisoblar bo'yicha oborot`;
    ws.getCell('A1').font = { bold: true, size: 13 };
    ws.getCell('A2').value = "Saralash: umumiy oborot (Debet+Kredit) bo'yicha kamayish tartibida";
    headerRow(ws, 4, ['№', 'Korr. hisob', 'Korrespondent nomi', 'INN', 'Operatsiyalar soni', 'Debet oboroti', 'Kredit oboroti', 'Saldo (Kredit − Debet)']);
    const rows = correspondents(s.ops, false);
    const range = (col: string) => ref(s.name, `$${col}$${s.first}:$${col}$${s.last}`);
    rows.forEach((c, i) => {
      const n = 5 + i;
      const row = ws.getRow(n);
      row.getCell(1).value = i + 1;
      text(row.getCell(2), c.key);
      row.getCell(3).value = c.name;
      text(row.getCell(4), c.inn);
      row.getCell(5).value = f(`SUMPRODUCT((${range('D')}=B${n})*1)`, c.count);
      row.getCell(6).value = f(`SUMPRODUCT((${range('D')}=B${n})*${range('H')})`, so(c.debit));
      row.getCell(7).value = f(`SUMPRODUCT((${range('D')}=B${n})*${range('I')})`, so(c.credit));
      row.getCell(8).value = f(`G${n}-F${n}`, so(c.saldo));
      for (const col of [6, 7, 8]) row.getCell(col).numFmt = MONEY;
    });
    const n = 5 + rows.length;
    const jami = ws.getRow(n);
    jami.getCell(2).value = 'JAMI';
    jami.getCell(5).value = f(`SUM(E5:E${n - 1})`, s.ops.length);
    const d = s.ops.reduce((t, o) => t + o.debit, 0);
    const c = s.ops.reduce((t, o) => t + o.credit, 0);
    jami.getCell(6).value = f(`SUM(F5:F${n - 1})`, so(d));
    jami.getCell(7).value = f(`SUM(G5:G${n - 1})`, so(c));
    jami.getCell(8).value = f(`G${n}-F${n}`, so(c - d));
    for (const col of [6, 7, 8]) jami.getCell(col).numFmt = MONEY;
    fillRow(jami, 8, TOTAL_FILL);
    ws.views = [{ state: 'frozen', ySplit: 4 }];
  }

  // ---- Batafsil ----
  det.columns = [24, 9, 11, 40, 11, 12, 24, 34, 60, 17, 17].map((width) => ({ width }));
  headerRow(det, 1, ['Hisob raqami', 'Valyuta', 'Guruh', 'Operatsiya turi', 'Sana', 'Hujjat №', 'Korr. hisob', 'Korrespondent nomi', "To'lov maqsadi", 'Debet', 'Kredit']);
  const cur = new Map(a.accounts.map((x) => [x.number, x.currency]));
  detail.forEach((o, i) => {
    const row = det.getRow(i + 2);
    text(row.getCell(1), o.account);
    row.getCell(2).value = cur.get(o.account)!;
    row.getCell(3).value = o.group;
    row.getCell(4).value = o.type;
    row.getCell(5).value = dayDate(o.datetime);
    row.getCell(5).numFmt = 'dd.mm.yyyy';
    text(row.getCell(6), o.docNo);
    text(row.getCell(7), o.korrAccount);
    row.getCell(8).value = o.korrName;
    row.getCell(9).value = o.purpose;
    row.getCell(10).value = o.debit ? so(o.debit) : null;
    row.getCell(11).value = o.credit ? so(o.credit) : null;
    row.getCell(10).numFmt = MONEY;
    row.getCell(11).numFmt = MONEY;
  });
  det.views = [{ state: 'frozen', ySplit: 1 }];
  det.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(2, detailLast), column: 11 } };

  // ---- Diqqat ----
  diq.columns = [11, 24, 9, 17, 34, 60, 46].map((width) => ({ width }));
  headerRow(diq, 1, ['Sana', 'Hisob', 'Valyuta', 'Summa', 'Korrespondent', "To'lov maqsadi", 'Sabab']);
  let k = 2;
  for (const o of a.operations)
    for (const code of o.flags) {
      const row = diq.getRow(k++);
      row.getCell(1).value = dayDate(o.datetime);
      row.getCell(1).numFmt = 'dd.mm.yyyy';
      text(row.getCell(2), o.account);
      row.getCell(3).value = cur.get(o.account)!;
      row.getCell(4).value = so(o.debit ? -o.debit : o.credit);
      row.getCell(4).numFmt = MONEY;
      row.getCell(5).value = o.korrName;
      row.getCell(6).value = o.purpose;
      row.getCell(7).value = FLAG_TEXT[code];
    }

  for (const ws of wb.worksheets) ws.eachRow((row) => row.eachCell((c) => (c.font = { name: 'Calibri', size: 11, ...(c.font ?? {}) })));
  return wb;
}
