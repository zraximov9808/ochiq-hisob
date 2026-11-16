import type { Invoice, InvoiceItem } from '../audit/invoices';
import type { Analysis } from '../bank/analyze';
import type { BankAccount, Operation } from '../bank/model';
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

export const bankAcc = (number: string, currency = 'UZS'): BankAccount => ({
  number, balanceAcc: number.slice(0, 5), currency, company: 'NAMUNA', inn: ME, bankName: 'B', mfo: '00001',
  periodFrom: '2026-01-01', periodTo: '2026-12-31', openingBalance: 0, closingBalanceBank: 0, sourceFiles: ['f.xlsx'],
});
export const MAIN_ACC = bankAcc('20208000100000000001');
export const USD_ACC = bankAcc('20208840100000000001', 'USD');
export const SPECIAL_ACC = bankAcc('22613000100000000001');

let seq = 0;
export const bankOp = (o: Partial<Operation>): Operation => ({
  id: `op${++seq}`, account: MAIN_ACC.number, datetime: '2026-07-06T10:00:00', docNo: '1', korrAccount: '', korrInn: '', korrName: '', korrMfo: '',
  purpose: '', debit: 0, credit: 0, group: 'Kirim', type: '', ruleId: 'r', internal: false, runningBalance: 0, flags: [], ...o,
});

export const analysisOf = (operations: Operation[], accounts = [MAIN_ACC, USD_ACC, SPECIAL_ACC]): Analysis => ({
  accounts, operations, duplicates: 0, checks: [], company: { name: 'NAMUNA', inn: ME, bankName: 'B', mfo: '', periodFrom: '', periodTo: '' },
});
