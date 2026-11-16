import { expect, test } from 'vitest';
import { DEFAULT_AUTO } from '../../auto/defaults';
import { gtdItem, invoice, item } from '../../auto/testkit';
import { emptyDoc, type Doc } from '../../engine/types';
import type { BankState } from '../bank/bankStore';
import { autoInputOf } from './useAutoSync';

const bank = (over: Partial<BankState> = {}): BankState => ({
  loaded: true, statements: [], files: [], rules: null, overrides: {}, reviewed: [], settings: { largeRoundCash: 1, roundUnit: 1, vagueLength: 60 },
  invoices: [invoice('s1', '2026-07-03', true, [item('Унитаз', 1, 100)])], invoiceFiles: [], gtd: [gtdItem('0001', '1', 'Раковина', { duty: 100 })], gtdFiles: [], stockQty: {}, rates: {}, ...over,
});
const doc = (over: Partial<Doc> = {}): Doc => ({ ...emptyDoc(2026), auto: { ...DEFAULT_AUTO }, ...over });

test('deleting an auto entry changes the fingerprint (month-end follows the journal); inputHash and enabled do not', () => {
  const a = autoInputOf(bank(), doc(), null).hash;
  expect(autoInputOf(bank(), doc({ auto: { ...DEFAULT_AUTO, skip: ['inv:s1:goods'] } }), null).hash).not.toBe(a);
  expect(autoInputOf(bank(), doc({ auto: { ...DEFAULT_AUTO, inputHash: 'zzz' } }), null).hash).toBe(a);
});

test('GTD payments and invoice line contents change the input fingerprint', () => {
  const a = autoInputOf(bank(), doc(), null).hash;
  expect(autoInputOf(bank({ gtd: [gtdItem('0001', '1', 'Раковина', { duty: 200 })] }), doc(), null).hash).not.toBe(a);
  expect(autoInputOf(bank({ invoices: [invoice('s1', '2026-07-03', true, [item('Биде', 1, 100)])] }), doc(), null).hash).not.toBe(a);
});

test('the document STIR and its hand-edited auto entries are passed to the build', () => {
  const edited = { id: 'a:x', date: '2026-07-01', text: '', debit: '5110', credit: '4010', amount: 1, auto: { src: 'x', edited: true } };
  const { input } = autoInputOf(bank(), doc({ company: { ...emptyDoc(2026).company, stir: '111111111' }, entries: [edited] }), null);
  expect(input.docCompanyInn).toBe('111111111');
  expect(input.editedEntries).toEqual([edited]);
});
