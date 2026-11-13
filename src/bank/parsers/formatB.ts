import type { BankAccount, Cell, ParsedStatement, RawOperation } from '../model';
import { cleanPurpose, currencyOf, splitKorr } from './formatA';
import { cellText, dateTimeCell, moneyCell } from './rows';

/**
 * Format B: 1C / bank-client "Выписка лицевых счетов". Several accounts per sheet, each with
 * "Остаток: Начало"/"Конец" lines, daily "Итого" lines and repeated page headers.
 * Written from the spec without a real sample: columns are found by their header names.
 */
export function isFormatB(rows: Cell[][]): boolean {
  return rows.slice(0, 40).some((r) => r.some((c) => /Выписка лицевых сч|Остаток:\s*Начало/i.test(cellText(c))));
}

const ACCOUNT_RE = /(?:лицевой\s+)?сч[её]т[^0-9]{0,12}(\d{20})/i;
const lastMoney = (row: Cell[]) => {
  for (let i = row.length - 1; i >= 0; i--) {
    if (cellText(row[i]) === '') continue;
    const v = moneyCell(row[i]);
    if (v !== null) return v;
  }
  return 0;
};

export function parseFormatB(rows: Cell[][], file: string): ParsedStatement[] {
  const all = rows.map((r) => r.map(cellText).join(' '));
  const period = all.map((t) => /с\s+(\d{2}\.\d{2}\.\d{4})\s+по\s+(\d{2}\.\d{2}\.\d{4})/i.exec(t)).find(Boolean);
  const innM = all.map((t) => /ИНН[:\s]*(\d{9})/i.exec(t)).find(Boolean);
  const company = all.map((t) => /(?:Клиент|Наименование|Организация)[:\s]+(.+?)(?:\s+ИНН|$)/i.exec(t)).find(Boolean)?.[1].trim() ?? '';
  const iso = (d: string) => d.split('.').reverse().join('-');

  const out: ParsedStatement[] = [];
  let cur: ParsedStatement | null = null;
  let C: Record<string, number> | null = null;
  let lastDay = '';

  const start = (number: string) => {
    const account: BankAccount = {
      number,
      balanceAcc: number.slice(0, 5),
      currency: currencyOf(number),
      company,
      inn: innM?.[1] ?? '',
      bankName: '',
      mfo: '',
      periodFrom: period ? iso(period[1]) : '',
      periodTo: period ? iso(period[2]) : '',
      openingBalance: 0,
      closingBalanceBank: 0,
      dailyBalances: {},
      sourceFiles: [file],
    };
    cur = { format: 'B', file, account, operations: [] };
    out.push(cur);
  };

  rows.forEach((row, r) => {
    const line = all[r];
    const accM = ACCOUNT_RE.exec(line);
    if (accM && (!cur || cur.account.number !== accM[1])) start(accM[1]);
    if (/Дата/i.test(line) && /Дебет/i.test(line) && /Кредит/i.test(line)) {
      const col = (re: RegExp) => row.findIndex((c) => re.test(cellText(c)));
      C = {
        date: col(/^Дата/i), doc: col(/док/i), korr: col(/сч[её]т|корр/i), name: col(/наименование|корреспондент/i),
        inn: col(/ИНН/i), purpose: col(/назначение/i), debit: col(/дебет/i), credit: col(/кредит/i),
      };
      return;
    }
    if (!cur) return;
    const s: ParsedStatement = cur;
    if (/Остаток:?\s*Начало|Входящий остаток|Остаток на начало/i.test(line)) {
      s.account.openingBalance = lastMoney(row);
      return;
    }
    if (/Остаток:?\s*Конец|Исходящий остаток|Остаток на конец/i.test(line)) {
      s.account.closingBalanceBank = lastMoney(row);
      return;
    }
    if (/^\s*Итого/i.test(cellText(row[0])) || /^\s*Итого/i.test(line)) {
      if (lastDay && C) {
        const after = row.slice(Math.max(C.debit, C.credit) + 1);
        if (after.some((c) => cellText(c) !== '')) s.account.dailyBalances![lastDay] = lastMoney(row);
      }
      return;
    }
    if (!C) return;
    const datetime = dateTimeCell(row[C.date]);
    const debit = moneyCell(row[C.debit]);
    const credit = moneyCell(row[C.credit]);
    if (!datetime || debit === null || credit === null || (!debit && !credit)) return;
    if (debit > 0 && credit > 0) throw new Error(`${file}: ${r + 1}-qatorda debet ham, kredit ham bor.`);
    const [korrAccount, innFromKorr, nameFromKorr] = splitKorr(cellText(row[C.korr]));
    lastDay = datetime.slice(0, 10);
    const op: RawOperation = {
      account: s.account.number,
      datetime,
      docNo: C.doc >= 0 ? cellText(row[C.doc]) : '',
      korrAccount,
      korrInn: C.inn >= 0 && C.inn !== C.korr ? cellText(row[C.inn]) : innFromKorr,
      korrName: C.name >= 0 && C.name !== C.korr ? cellText(row[C.name]) : nameFromKorr,
      korrMfo: '',
      purpose: C.purpose >= 0 ? cleanPurpose(row[C.purpose]) : '',
      debit,
      credit,
    };
    s.operations.push(op);
  });
  return out;
}
