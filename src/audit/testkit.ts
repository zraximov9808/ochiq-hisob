import type { Cell } from '../bank/model';

/** Column headers of the e-invoice registry export (my.soliq / Didox), in file order from column B. */
export const INVOICE_HEADERS = [
  '№', 'ID', 'Вид документ', 'ТИП документ', 'СТАТУС', 'Номер документ', 'Дата документ', 'Договор номер', 'Договор дата', 'Дата отправки',
  'Продавец (ИНН или ПИНФЛ)', 'Продавец (наименование)', 'Продавец (расчётный счёт)', 'Продавец (МФО банка)', 'Продавец (код филиала)', 'Продавец (название филиала)',
  'Покупатель (ИНН или ПИНФЛ)', 'Покупатель (наименование)', 'Покупатель (расчётный счёт)', 'Покупатель (МФО банка)', 'Покупатель (код филиала)', 'Покупатель (название филиала)',
  'ПРИМЕЧАНИЕ', '№', 'Примечание к товару (работе, услуге)', 'Идентификационный код', 'Единица измерения', 'Маркировка', 'Количество', 'Цена',
  'Ставка акциз', 'Сумма акциз', 'Стоимость поставки', 'НДС ставка', 'НДС сумма', 'Стоимость поставки с учётом НДС', 'Происхождение товара',
];

export interface FakeInvoice {
  no: string;
  date: string; // dd-mm-yyyy
  status?: string;
  seller: [inn: string, name: string];
  buyer: [inn: string, name: string];
  /** One or more lines: [name, amount without VAT, VAT, origin (default "Перепродажа")]. */
  lines: Array<[string, number, number, string?]>;
}

/** Rows of a registry export: an empty first row, the header row, then per invoice a header row and item rows. */
export function invoiceRows(invoices: FakeInvoice[]): Cell[][] {
  const rows: Cell[][] = [[], [null, ...INVOICE_HEADERS]];
  invoices.forEach((inv, i) => {
    const base: Cell[] = [null, i + 1, `id${i + 1}`, 'Счет-фактура', 'Стандартный', inv.status ?? 'Подписан', inv.no, inv.date, '1', inv.date, `${inv.date} 10:00:00`,
      inv.seller[0], inv.seller[1], '', '', '', '', inv.buyer[0], inv.buyer[1], '', '', '', '', ''];
    const line = (n: Cell, name: string, sum: number, vat: number, origin = 'Перепродажа'): Cell[] => [n, name, '', 'шт.', '', 1, sum, 0, 0, sum, vat ? 12 : 0, vat, sum + vat, origin];
    if (inv.lines.length === 1) {
      const [name, sum, vat, origin] = inv.lines[0];
      rows.push([...base, ...line(1, name, sum, vat, origin)]);
    } else {
      const sum = inv.lines.reduce((s, l) => s + l[1], 0);
      const vat = inv.lines.reduce((s, l) => s + l[2], 0);
      rows.push([...base, ...line('Общ.', '', sum, vat, '')]);
      inv.lines.forEach(([name, s, v, o], k) => rows.push([...Array(24).fill(null), ...line(k + 1, name, s, v, o)]));
    }
  });
  return rows;
}
