import { describe, expect, test } from 'vitest';
import { analyze } from '../bank/analyze';
import { parseFormatA } from '../bank/parsers/formatA';
import { DEFAULT_RULES } from '../bank/rules/defaultRules';
import { ACC_UZS, CO, formatARows, type OpRow } from '../bank/testkit';
import { parseInvoices } from './invoices';
import { buildAudit } from './settlement';
import { invoiceRows } from './testkit';

const ME: [string, string] = [CO.inn, '"NAMUNA SAVDO" MCHJ'];
const ALFA: [string, string] = ['300000002', '"ALFA" MCHJ'];
const BETA: [string, string] = ['300000003', '"BETA STROY" MCHJ'];
const GAMMA: [string, string] = ['300000004', '"GAMMA" XK'];

const ops: OpRow[] = [
  ['10.03.2026 10:00:00', '10111000600000000001/200000009/Ali Valiyev', '1', '03', '00999', 0, 100000000, 'ustav fondini shakllantirish uchun'],
  ['15.03.2026 10:00:00', `20208000100000000002/${ALFA[0]}/ALFA MCHJ`, '2', '01', '00999', 15000000, 0, 'Shartnoma 5 asosan radiatorlar uchun'],
  ['20.03.2026 10:00:00', `20208000100000000003/${BETA[0]}/BETA STROY MCHJ`, '3', '01', '00999', 0, 77228000, 'Unitaz va rakovina uchun'],
  ['21.03.2026 10:00:00', '20208000100000000004//"GAMMA" XK', '4', '01', '00999', 0, 5000000, 'Santexnika uchun oldindan tolov'],
  ['22.03.2026 10:00:00', '23402000300100001010/201122919/Gaznachilik', '5', '01', '00014', 180000, 0, '~36 ИЖТИМОИЙ СОЛИҚ УЧУН'],
  ['23.03.2026 10:00:00', '20218000900000000005/000000000/YATT KARIMOV ANVAR ALIEVICH', '7', '01', '00999', 0, 2456300, 'Unitaz uchun tolov'],
  ['22.03.2026 10:00:05', `16401000500000000002/${CO.inn}/Bank`, '6', '06', '00999', 1000, 0, 'Комиссия за операцию "Перевод"'],
];
const close = ops.reduce((s, o) => s - Number(o[5]) + Number(o[6]), 0).toFixed(2);
const bank = () => analyze([parseFormatA(formatARows(ACC_UZS, '0.00', close, ops, '01.01.2026', '31.03.2026'), 'b.xlsx')], DEFAULT_RULES);
const invoices = () =>
  parseInvoices(
    invoiceRows([
      { no: '189', date: '16-03-2026', seller: ALFA, buyer: ME, lines: [['Radiator', 7893810, 947257.2], ['Mufta', 212577.14, 25509.26]] },
      { no: '8', date: '20-03-2026', seller: ME, buyer: BETA, lines: [['Unitaz', 68953571.43, 8274428.57]] },
      { no: '9', date: '25-03-2026', seller: ME, buyer: GAMMA, lines: [['Smesitel', 10000000, 1200000]] },
      { no: '10', date: '28-03-2026', status: 'Ожидает', seller: ALFA, buyer: ME, lines: [['Fitting', 1000000, 0]] },
      { no: '1', date: '04-03-2026', status: 'Отменен', seller: ['61710025960016', 'ISMOILOV A.'], buyer: ME, lines: [['x', 4, 0]] },
      { no: '2', date: '02-04-2026', seller: ME, buyer: BETA, lines: [['Kech', 500000, 0]] },
      { no: '3', date: '23-03-2026', seller: ME, buyer: ['32310941930021', 'KARIMOV ANVAR ALIEVICH'], lines: [['Unitaz', 2193125, 263175]] },
    ]),
    'f.xlsx',
  );
const row = (a: ReturnType<typeof buildAudit>, inn: string) => a.rows.find((r) => r.inn === inn)!;

describe('buildAudit', () => {
  test('a placeholder INN (zeros) does not block matching an entrepreneur by name', () => {
    const a = buildAudit(bank(), invoices(), { includePending: false });
    const k = a.rows.filter((r) => r.name.includes('KARIMOV'));
    expect(k).toHaveLength(1);
    expect(k[0]).toMatchObject({ inn: '32310941930021', moneyIn: 245630000, invOut: 245630000, saldo: 0 });
  });

  test('per counterparty: money and invoices in both directions, net balance and side', () => {
    const a = buildAudit(bank(), invoices(), { includePending: false });
    expect(a.companyInn).toBe(CO.inn);
    expect(a.period).toEqual({ from: '2026-01-01', to: '2026-03-31' });
    expect(row(a, ALFA[0])).toMatchObject({ moneyIn: 0, moneyOut: 1500000000, invIn: 907915360, invOut: 0, saldo: 592084640, side: 'debitor' });
    expect(row(a, BETA[0])).toMatchObject({ moneyIn: 7722800000, invOut: 7722800000, saldo: 0, side: 'yopiq' });
  });

  test('a bank counterparty without INN is matched to its invoices by name', () => {
    const g = row(buildAudit(bank(), invoices(), { includePending: false }), GAMMA[0]);
    expect(g).toMatchObject({ moneyIn: 500000000, invOut: 1120000000, saldo: 620000000, side: 'debitor' });
  });

  test('pending invoices count only when asked; cancelled ones never; dates outside the period are left out', () => {
    const off = buildAudit(bank(), invoices(), { includePending: false });
    const on = buildAudit(bank(), invoices(), { includePending: true });
    expect(row(on, ALFA[0]).invIn - row(off, ALFA[0]).invIn).toBe(100000000);
    expect(off.skippedInvoices).toEqual(expect.arrayContaining([expect.objectContaining({ reason: 'Отменен', count: 1 })]));
    expect(off.outsidePeriod).toBe(1);
    expect(off.rows.some((r) => r.inn === '61710025960016')).toBe(false);
  });

  test('non-trade bank operations are excluded and summarised by reason', () => {
    const a = buildAudit(bank(), invoices(), { includePending: false });
    const reasons = Object.fromEntries(a.excluded.map((e) => [e.reason, e.count]));
    expect(reasons).toMatchObject({ 'Soliq va byudjet to‘lovlari': 1, 'Bank komissiyalari': 1, 'Ta’sischi bilan operatsiyalar': 1 });
    expect(a.rows.some((r) => r.name.includes('Ali'))).toBe(false);
  });

  test('totals and the reconciliation movements with a running balance', () => {
    const a = buildAudit(bank(), invoices(), { includePending: false });
    expect(a.totals).toMatchObject({ moneyIn: 8468430000, moneyOut: 1500000000, invIn: 907915360, invOut: 9088430000, debitor: 1212084640, kreditor: 0 });
    const alfa = row(a, ALFA[0]);
    expect(alfa.movements.map((m) => [m.date, m.kind, m.balance])).toEqual([
      ['2026-03-15', 'moneyOut', 1500000000],
      ['2026-03-16', 'invIn', 592084640],
    ]);
  });

  test('counterparties with money but no invoices (or the reverse) are flagged', () => {
    const inv = invoices().filter((i) => i.docNo !== '8');
    const a = buildAudit(bank(), inv, { includePending: false });
    expect(row(a, BETA[0]).flags).toContain('NO_INVOICE');
    const noBank = buildAudit(null, invoices(), { includePending: false });
    expect(row(noBank, BETA[0]).flags).toContain('NO_PAYMENT');
  });
});
