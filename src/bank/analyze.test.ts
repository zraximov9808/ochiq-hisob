import { describe, expect, test } from 'vitest';
import { accountSummaries, correspondents, fxSummary, monthly, typeSummary } from './aggregates';
import { analyze, isVague } from './analyze';
import { parseFormatA } from './parsers/formatA';
import { DEFAULT_RULES } from './rules/defaultRules';
import { ACC_BUY, ACC_FX, ACC_UZS, CO, formatARows, type OpRow } from './testkit';

const TAX = '23402000300100001010/201122919/Gaznachilik';
const BANKFEE = `16401000500000000002/${CO.inn}/"Namuna Bank"`;

const uzsOps: OpRow[] = [
  ['16.03.2026 10:00:00', '10111000600000000001/201000001/Ali Valiyev', '1', '03', '00999', 0, 600000000, 'Ali Valiyev nomidan ustav fondini shakllantirish uchun'],
  ['20.03.2026 11:00:00', '20208000100000000009/300000001/MIJOZ MCHJ', '2', '01', '00999', 0, 300000000, '00098~00098 04.09.2026-санадаги №12-шартномага асосан тулов утказилди.'],
  ['21.03.2026 12:00:00', `${ACC_BUY}//${CO.name}`, '18', '', '', 241400000, 0, '00611~Перечисление согласно заявке № 18 для покупки иностранной валюты'],
  ['21.03.2026 12:00:05', BANKFEE, '3', '06', '00999', 75000, 0, 'Комиссия за операцию "Перевод средств по системе ДБО ЮЛ"'],
  ['21.05.2026 09:00:00', TAX, '4', '11', '00014', 175500, 0, '08102~1~ЗАДОЛЖЕННОСТЬ ПО НАЛОГ НА ДОХОДЫ С ФИЗИЧЕСКИХ ЛИЦ ВТЧ ПЕНЯ: 0'],
  ['22.06.2026 10:00:00', '20208000900000000777/300000002/NAMUNA MEBEL', '5', '01', '00999', 12000000, 0, '00098~П/О, № 22/06 ШАРТНОМАГА АСОСАН МЕБЕЛЬ АССОРТИМЕНТЕ УЧУН ТУЛОВ'],
  ['27.10.2026 10:00:00', `23510000500000000101/${CO.inn}/${CO.name}`, '6', '01', '00999', 0, 998, '00634~Возмещение клиенту по покупкам ТСП Устр-во POS № 1'],
  ['23.10.2026 10:00:00', '20214000800000000016/300000003/Ali Valiyev', '7', '01', '00999', 0, 18000000, 'tasischidan ustav fondini shakllantirish uchun tolov'],
];
const buyOps: OpRow[] = [
  ['21.03.2026 12:00:00', '17101000900000000601/200000009/СПОТ USD', '18', '', '', 241400000, 0, 'Продажа иностранной валюты согласно заявке N 18 по курсу 12070'],
  ['21.03.2026 12:00:00', `${ACC_UZS}//${CO.name}`, '18', '', '', 0, 241400000, 'Перечисление согласно заявке № 18 для покупки иностранной валюты'],
];
const fxOps: OpRow[] = [
  ['21.03.2026 12:30:00', '17101840900000000006/200000009/СПОТ USD', '18', '', '', 0, 20000, 'Продажа иностранной валюты согласно заявке N 18 по курсу 12070'],
  ['22.03.2026 10:00:00', '33070010200000000550//SUPPLIER LTD', '21', '', '', 20000, 0, 'CONTRACT NUMBER 1 FOR THE PURCHASE OF CERAMIC GOODS'],
];

const closing = (ops: OpRow[]) => {
  const v = ops.reduce((s, o) => s - Number(o[5]) + Number(o[6]), 0);
  return v.toFixed(2);
};
const st = (acc: string, ops: OpRow[], from?: string, to?: string) => parseFormatA(formatARows(acc, '0.00', closing(ops), ops, from, to), `${acc}.xlsx`);
const build = () => analyze([st(ACC_UZS, uzsOps), st(ACC_BUY, buyOps), st(ACC_FX, fxOps)], DEFAULT_RULES);

describe('analyze', () => {
  test('orders accounts: foreign currency first, then UZS by number', () => {
    expect(build().accounts.map((a) => a.number)).toEqual([ACC_FX, ACC_UZS, ACC_BUY]);
  });

  test('balances reconcile with the bank and running balance never goes negative in the transit account', () => {
    const a = build();
    expect(a.checks.every((c) => c.diff === 0 && c.totalsOk !== false)).toBe(true);
    const buy = a.operations.filter((o) => o.account === ACC_BUY);
    expect(buy.map((o) => o.credit > 0)).toEqual([true, false]);
    expect(buy.every((o) => o.runningBalance >= 0)).toBe(true);
  });

  test('marks internal transfers between loaded accounts and own unloaded ones', () => {
    const a = build();
    const internal = a.operations.filter((o) => o.internal).map((o) => `${o.account.slice(0, 5)}:${o.docNo}`);
    expect(internal.sort()).toEqual(['20208:18', '20208:6', '22613:18'].sort());
  });

  test('merging overlapping files drops duplicates and reports how many', () => {
    const a = analyze([st(ACC_UZS, uzsOps.slice(0, 3)), st(ACC_UZS, uzsOps)], DEFAULT_RULES);
    expect(a.duplicates).toBe(3);
    expect(a.operations).toHaveLength(uzsOps.length);
  });

  test('manual overrides replace the rule result', () => {
    const first = build().operations.find((o) => o.docNo === '2')!;
    const a = analyze([st(ACC_UZS, uzsOps)], DEFAULT_RULES, { [first.id]: { group: 'Kirim', type: 'Berilgan qarz qaytarilishi' } });
    expect(a.operations.find((o) => o.docNo === '2')).toMatchObject({ type: 'Berilgan qarz qaytarilishi', manual: true });
  });

  test('flags the cases the accountant must look at', () => {
    const a = build();
    const f = (doc: string, acc = ACC_UZS) => a.operations.find((o) => o.docNo === doc && o.account === acc)!.flags;
    expect(f('2')).toEqual(expect.arrayContaining(['UNCLASSIFIED', 'VAGUE_PURPOSE']));
    expect(f('4')).toContain('TAX_ENFORCED');
    expect(f('4')).not.toContain('PENALTY');
    expect(f('5')).toContain('POSSIBLE_FIXED_ASSET');
    expect(f('6')).toContain('MISSING_STATEMENT');
    expect(f('7')).toContain('FOUNDER_PAYER_MISMATCH');
    expect(f('1')).toEqual(expect.arrayContaining(['LARGE_ROUND_CASH']));
    expect(f('1')).not.toContain('FOUNDER_PAYER_MISMATCH');
    expect(f('3')).toEqual([]);
  });
});

describe('isVague', () => {
  test('purposes without goods or service names are vague when short', () => {
    expect(isVague('00098~00098 04.09.2026-санадаги №12-шартномага асосан тулов утказилди.', 60)).toBe(true);
    expect(isVague('00111~00111 Перечислить к договору №17 за унитазы и раковины', 60)).toBe(false);
    expect(isVague('Оплата по договору', 60)).toBe(true);
  });
});

describe('aggregates', () => {
  test('summaries, types, correspondents and months add up to the account totals', () => {
    const a = build();
    const ops = a.operations.filter((o) => o.account === ACC_UZS);
    const sum = accountSummaries(a, false).find((s) => s.account.number === ACC_UZS)!;
    const types = typeSummary(ops);
    const corr = correspondents(ops, false);
    const months = monthly(a.accounts.find((x) => x.number === ACC_UZS)!, ops);
    const total = (xs: Array<{ debit: number; credit: number }>) => xs.reduce((s, x) => [s[0] + x.debit, s[1] + x.credit], [0, 0]);
    expect(total(types.flatMap((g) => g.rows))).toEqual([sum.debit, sum.credit]);
    expect(total(corr)).toEqual([sum.debit, sum.credit]);
    expect(total(months)).toEqual([sum.debit, sum.credit]);
    expect(months.map((m) => m.month)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(months.at(-1)!.closing).toBe(sum.closing);
  });

  test('without internal transfers the turnover excludes own-account movements', () => {
    const a = build();
    const all = accountSummaries(a, false).find((s) => s.account.number === ACC_UZS)!;
    const ext = accountSummaries(a, true).find((s) => s.account.number === ACC_UZS)!;
    expect(all.debit - ext.debit).toBe(24140000000);
  });

  test('currency purchases are paired into conversions with a rate', () => {
    const fx = fxSummary(build());
    expect(fx.modes).toContain('import');
    expect(fx.conversions).toEqual([expect.objectContaining({ currency: 'USD', fx: 2000000, uzs: 24140000000, rate: 12070 })]);
  });
});
