import type { BankAccount, Cell, ParsedStatement, RawOperation } from '../model';
import { cellText, dateTimeCell, moneyCell } from './rows';

const CURRENCIES: Record<string, string> = {
  '000': 'UZS', '840': 'USD', '978': 'EUR', '643': 'RUB', '156': 'CNY', '398': 'KZT', '826': 'GBP', '756': 'CHF', '392': 'JPY', '417': 'KGS', '762': 'TJS', '949': 'TRY', '784': 'AED',
};

/** Currency from digits 6–8 of a 20-digit account number. */
export function currencyOf(account: string): string {
  const code = account.slice(5, 8);
  return CURRENCIES[code] ?? code;
}

/** Removes the `_x000D_` artefact and line breaks; keeps everything else as written. */
export function cleanPurpose(v: Cell): string {
  return cellText(v).replace(/_x000D_/g, '').replace(/\r?\n|\r/g, ' ').trim();
}

const isoDay = (ddmmyyyy: string) => {
  const [d, m, y] = ddmmyyyy.split('.');
  return `${y}-${m}-${d}`;
};

export function isFormatA(rows: Cell[][]): boolean {
  return rows.slice(0, 6).some((r) => r.some((c) => /Сведения о работе счета/i.test(cellText(c))));
}

/** Format A: "Сведения о работе счета" (bank-client export, one account per sheet). */
export function parseFormatA(rows: Cell[][], file: string): ParsedStatement {
  const text = (r: number) => rows[r]?.map(cellText).join('   ') ?? '';
  const head = rows.slice(0, 8).map((_, i) => text(i));
  const find = (re: RegExp) => head.map((h) => re.exec(h)).find(Boolean) ?? null;

  const bank = /^(\d{5})\s*\/\s*(.+?)(?:\s{3}|$)/.exec(cellText(rows[0]?.[0]));
  const period = find(/с\s+(\d{2}\.\d{2}\.\d{4})\s+по\s+(\d{2}\.\d{2}\.\d{4})/i);
  const acc = find(/Сч[её]т:\s*(\S+)\s+(.*?)\s+ИНН:\s*(\d*)/i);
  if (!acc || !period) throw new Error(`${file}: hisob raqami yoki davr topilmadi.`);
  const balance = (label: RegExp) => {
    for (const row of rows.slice(0, 8))
      for (const c of row) {
        const m = label.exec(cellText(c));
        if (m) return moneyCell(m[1]) ?? 0;
      }
    return 0;
  };

  const headerRow = rows.findIndex((r) => r.some((c) => /^Дата$/i.test(cellText(c))) && r.some((c) => /Назначение/i.test(cellText(c))));
  if (headerRow < 0) throw new Error(`${file}: operatsiyalar jadvali sarlavhasi topilmadi.`);
  const col = (re: RegExp) => rows[headerRow].findIndex((c) => re.test(cellText(c)));
  const C = {
    date: col(/^Дата/i), korr: col(/Сч[её]т\/ИНН/i), doc: col(/док/i), op: col(/^Оп$/i), mfo: col(/МФО/i),
    debit: col(/Дебет/i), credit: col(/Кредит/i), purpose: col(/Назначение/i),
  };

  const number = acc[1];
  const account: BankAccount = {
    number,
    balanceAcc: number.slice(0, 5),
    currency: currencyOf(number),
    company: acc[2].trim(),
    inn: acc[3],
    bankName: bank?.[2].trim() ?? '',
    mfo: bank?.[1] ?? '',
    periodFrom: isoDay(period[1]),
    periodTo: isoDay(period[2]),
    openingBalance: balance(/Остаток на начало периода:\s*([-\d\s .,]+)/i),
    closingBalanceBank: balance(/Остаток на конец периода:\s*([-\d\s .,]+)/i),
    sourceFiles: [file],
  };

  const operations: RawOperation[] = [];
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const first = cellText(row[0]);
    if (/^Итоговый оборот/i.test(first)) {
      account.totalDebitBank = moneyCell(row[C.debit]) ?? 0;
      account.totalCreditBank = moneyCell(row[C.credit]) ?? 0;
      break;
    }
    if (row.every((c) => cellText(c) === '')) continue;
    const datetime = dateTimeCell(row[C.date]);
    const debit = moneyCell(row[C.debit]);
    const credit = moneyCell(row[C.credit]);
    if (!datetime || debit === null || credit === null || (debit > 0) === (credit > 0) || debit < 0 || credit < 0)
      throw new Error(`${file}: ${r + 1}-qator o‘qilmadi — sana yoki debet/kredit noto‘g‘ri (bittasi musbat bo‘lishi kerak).`);
    const [korrAccount = '', korrInn = '', korrName = ''] = splitKorr(cellText(row[C.korr]));
    operations.push({
      account: number,
      datetime,
      docNo: cellText(row[C.doc]),
      korrAccount,
      korrInn,
      korrName,
      korrMfo: C.mfo >= 0 ? cellText(row[C.mfo]) : '',
      opCode: C.op >= 0 ? cellText(row[C.op]) || undefined : undefined,
      purpose: cleanPurpose(row[C.purpose]),
      debit,
      credit,
    });
  }
  return { format: 'A', file, account, operations };
}

/** "account/INN/name" — only the first two slashes split; the name may contain more. */
export function splitKorr(s: string): [string, string, string] {
  const a = s.indexOf('/');
  if (a < 0) return [s.trim(), '', ''];
  const b = s.indexOf('/', a + 1);
  if (b < 0) return [s.slice(0, a).trim(), s.slice(a + 1).trim(), ''];
  return [s.slice(0, a).trim(), s.slice(a + 1, b).trim(), s.slice(b + 1).trim()];
}
