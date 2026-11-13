import type { Cell } from './model';

/** Fake company used in public tests (all identifiers are fictional). */
export const CO = { name: 'ООО "NAMUNA SAVDO"', inn: '999000111' };
export const ACC_UZS = '20208000900000000001';
export const ACC_USD = '20208840900000000001';
export const ACC_BUY = '22613000900000000001';
export const ACC_FX = '22614840900000000001';

export type OpRow = [datetime: string, korr: string, doc: string, op: string, mfo: string, debit: number | string, credit: number | string, purpose: string];

/** Builds the rows of a Format A ("Сведения о работе счета") export. */
export function formatARows(account: string, opening: string, closing: string, ops: OpRow[], from = '01.01.2026', to = '31.10.2026'): Cell[][] {
  const sum = (i: 5 | 6) => ops.reduce((s, o) => s + Number(String(o[i]).replace(/\s/g, '').replace(',', '.') || 0), 0);
  return [
    ['00999 / ТОШКЕНТ Ш., "NAMUNA BANK" АТ БОШ ОФИСИ', '03.11.2026'],
    [`Сведения о работе счета с ${from} по ${to}`, `Сведения о работе счета с ${from} по ${to}`],
    [`Счет: ${account}   ${CO.name}   ИНН: ${CO.inn}`],
    [`Остаток на начало периода: ${opening}`, `Остаток на конец периода: ${closing}`],
    ['Дата', 'Счет/ИНН', '№ док-та', 'Оп', 'МФО', 'Оборот Дебет', 'Оборот Кредит', 'Назначение платежа'],
    ...ops.map((o) => [...o] as Cell[]),
    ['Итоговый оборот за период', null, null, null, null, Math.round(sum(5) * 100) / 100, Math.round(sum(6) * 100) / 100],
  ];
}
