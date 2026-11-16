import type { Invoice, InvoiceItem } from '../audit/invoices';
import type { GtdItem } from '../stock/gtd';

export const ME = '999000111';

export const item = (name: string, qty: number | null, amount: number, vat = 0, origin = 'Перепродажа', unit = 'dona'): InvoiceItem => ({
  name, code: '', unit, qty, amount, vat, total: amount + vat, origin,
});

/** An invoice of the test company: `sale` = we sell to `party`, otherwise we buy from it. */
export function invoice(id: string, date: string, sale: boolean, items: InvoiceItem[], over: Partial<Invoice> = {}): Invoice {
  const party = ['300000001', '"ALFA" MCHJ'];
  const amount = items.reduce((s, i) => s + i.amount, 0);
  const vat = items.reduce((s, i) => s + i.vat, 0);
  return {
    id, docNo: id, date, kind: 'Счет-фактура', docType: 'Стандартный', status: 'Подписан', contractNo: '', contractDate: '',
    sellerInn: sale ? ME : party[0], sellerName: sale ? 'NAMUNA' : party[1], buyerInn: sale ? party[0] : ME, buyerName: sale ? party[1] : 'NAMUNA',
    amount, vat, total: amount + vat, lines: items.length, items, file: 'f.xlsx', ...over,
  };
}

export function gtdItem(gtdNo: string, itemNo: string, name: string, over: Partial<GtdItem> = {}): GtdItem {
  return {
    id: `gtd:${gtdNo}:${itemNo}`, date: '2026-07-06', gtdNo, itemNo, regime: 'ИМ 40', sender: 'SUPPLIER LTD', name, hsCode: '', ikpu: '', unit: 'шт',
    qty: null, places: null, currency: '840', rate: 12000, invoiceValue: null, fees: 0, duty: 0, importVat: 0, file: 'g.xlsx', ...over,
  };
}
