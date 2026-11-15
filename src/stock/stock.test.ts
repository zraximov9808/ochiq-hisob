import { describe, expect, test } from 'vitest';
import { parseInvoices } from '../audit/invoices';
import { invoiceRows } from '../audit/testkit';
import { isGtdSheet, parseGtd } from './gtd';
import { productKey } from './names';
import { buildStock, invoiceMoves } from './stock';

const GTD_HEAD = [
  'гр.1 Tип pежима', 'гр.7 Дата регистрации ГТД', 'гр.7 Справочный номер ГТД', 'гр.7 Код таможенного органа', 'гр.2 Отправитель', 'гр.8 Получатель',
  'гр.44 п. 3 Контракт', 'гр.22 Валюта контракта', 'гр.23 Курс валюты контракта', 'гр. 20 Условия поставки', 'гр.32 № товара 2', 'гр.33 Код товара3',
  'гр.31 Наименования товара4', 'гр.34 Код страны происхождения', 'гр.35 Вес брутто (кг)', 'гр.38 Вес нетто (кг)', 'гр.44 п.2 Инвойс', 'гр.44 п.2 Накладная',
  'гр.44 п.875 ИКПУ', 'гр.22 Общая стоимость товаров', 'гр.42 Фактурная стоимость товара', 'гр.45 Таможенная стоимость товара', 'гр.6 Кол-во мест', 'ед. изм.', 'кол-во',
];
const gtdRow = (date: string, no: string, n: number, name: string, places: number | null, unit: string | null, qty: unknown) =>
  ['ИМ 40', date, no, '14010', 'SUPPLIER CO., LTD', 'ООО NAMUNA', 'КНТ № 1', '840', '12000', '04 FOB', n, '6910900000', name, '156', 100, 90, 'ИНВ № 1', 'СМР № 1',
    '06910001001000000', 1000, 900, 950, places, unit, qty];
const gtdRows = () => [
  ['Отчет о таможенном оформлении товаров и уплаченных таможенных платежей'],
  GTD_HEAD,
  gtdRow('06.07.2026', '0000101', 1, 'Унитаз керамический в одном корпусе с бачком / A ceramic toilet bowl - кол. 420 шт, вес: 17050 кг', 420, 'шт', 420),
  gtdRow('06.07.2026', '0000101', 2, 'Ceramic sink with a leg. / Раковина керамическая с ножкой. Кол-во 170 шт. Изг.: "SUPPLIER" / Китай - кол. 170 шт, вес: 5240 кг', 170, 'шт', 170),
  gtdRow('15.09.2026', '0000202', 1, 'Зеркала стеклянные в рамах / Glass mirrors in frames - кол. 8690 штук, вес: 7817 кг', 535, 'штук', '.'),
  gtdRow('23.07.2026', '0000303', 1, 'Скрытый сливной бачок для унитаза в комплекте / CONCEALED TOILET CISTERN - вес: 2538,3 кг', 200, 'мест', '.'),
];

describe('productKey', () => {
  test('takes the Russian part and drops quantity, maker and weight notes', () => {
    expect(productKey('Унитаз керамический в одном корпусе с бачком / A ceramic toilet bowl - кол. 420 шт')).toBe('унитаз керамический в одном корпусе с бачком');
    expect(productKey('Ceramic sink with a leg. / Раковина керамическая с ножкой. Кол-во 170 шт. Изг.: "X" / Китай - кол. 170 шт')).toBe('раковина керамическая с ножкой');
    expect(productKey('Набор мебели для ванной: тумба из ПВХ (составляют 1 комплект).. Кол-во 165')).toBe('набор мебели для ванной: тумба из пвх (составляют 1 комплект)');
    expect(productKey('Санитарно-технические изделия из керамики, Биде, в комплекте.')).toBe('санитарно-технические изделия из керамики, биде, в комплекте');
    expect(productKey('Раковина керамическая для тахарата / Ceramic sink for washing. Про: SUPPLIER CO., LTD - кол. 50 шт')).toBe('раковина керамическая для тахарата');
  });
});

describe('parseGtd', () => {
  test('recognises the customs report template and reads one line per good', () => {
    expect(isGtdSheet(gtdRows())).toBe(true);
    const g = parseGtd(gtdRows(), 'gtd.xlsx');
    expect(g).toHaveLength(4);
    expect(g[0]).toMatchObject({ date: '2026-07-06', gtdNo: '0000101', itemNo: '1', regime: 'ИМ 40', qty: 420, unit: 'шт', places: 420, ikpu: '06910001001000000', file: 'gtd.xlsx' });
  });
  test('quantity falls back to the last "кол." in the description, else stays unknown', () => {
    const g = parseGtd(gtdRows(), 'gtd.xlsx');
    expect(g[2].qty).toBe(8690);
    expect(g[3].qty).toBeNull();
  });
});

const ME: [string, string] = ['999000111', '"NAMUNA SAVDO" MCHJ'];
const invoices = () =>
  parseInvoices(
    invoiceRows([
      { no: '1', date: '21-07-2026', seller: ME, buyer: ['300000003', '"BETA" MCHJ'], lines: [['Унитаз керамический в одном корпусе с бачком', 100, 12], ['Раковина керамическая с ножкой', 50, 6]] },
      { no: '2', date: '10-09-2026', seller: ME, buyer: ['300000004', '"GAMMA" MCHJ'], lines: [['ланг для душа гибкий из нержавеющей стали с фитингами', 10, 0]] },
      { no: '3', date: '13-08-2026', seller: ['300000005', '"DELTA" MCHJ'], buyer: ME, lines: [['Шланг для душа гибкий из нержавеющей стали с фитингами', 30, 0], ['Бино ижараси', 1, 0, 'Оказание услуг']] },
      { no: '4', date: '14-08-2026', status: 'Отказ', seller: ME, buyer: ['300000004', '"GAMMA" MCHJ'], lines: [['Раковина керамическая с ножкой', 5, 0]] },
    ]),
    'f.xlsx',
  );

describe('invoice items', () => {
  test('every line of an invoice is kept with name, unit and quantity', () => {
    const inv = invoices();
    expect(inv[0].items.map((i) => [i.name, i.qty, i.unit])).toEqual([
      ['Унитаз керамический в одном корпусе с бачком', 1, 'шт.'],
      ['Раковина керамическая с ножкой', 1, 'шт.'],
    ]);
  });
});

describe('buildStock', () => {
  const moves = () => [...invoiceMoves(invoices(), '999000111', false), ...parseGtd(gtdRows(), 'gtd.xlsx').map((g) => ({ ...g }))];

  test('incoming from GTD and purchase invoices, outgoing from sales invoices, balance per product', () => {
    const s = buildStock(invoices(), parseGtd(gtdRows(), 'gtd.xlsx'), { companyInn: '999000111', includePending: false, qtyOverrides: {} });
    const row = (k: string) => s.rows.find((r) => r.key === k)!;
    expect(row('унитаз керамический в одном корпусе с бачком')).toMatchObject({ qtyIn: 420, qtyOut: 1, balance: 419 });
    expect(row('раковина керамическая с ножкой')).toMatchObject({ qtyIn: 170, qtyOut: 1, balance: 169 });
    expect(row('зеркала стеклянные в рамах')).toMatchObject({ qtyIn: 8690, qtyOut: 0, balance: 8690 });
    expect(moves().length).toBeGreaterThan(0);
  });

  test('a one-letter typo in a name joins the same product', () => {
    const s = buildStock(invoices(), [], { companyInn: '999000111', includePending: false, qtyOverrides: {} });
    const hose = s.rows.filter((r) => r.key.includes('для душа гибкий'));
    expect(hose).toHaveLength(1);
    expect(hose[0]).toMatchObject({ qtyIn: 1, qtyOut: 1, balance: 0 });
  });

  test('services and rejected invoices are not stock movements', () => {
    const s = buildStock(invoices(), [], { companyInn: '999000111', includePending: false, qtyOverrides: {} });
    expect(s.rows.some((r) => r.key.includes('ижараси'))).toBe(false);
    expect(s.rows.find((r) => r.key === 'раковина керамическая с ножкой')!.qtyOut).toBe(1);
  });

  test('unknown GTD quantities are listed and can be filled in by hand', () => {
    const gtd = parseGtd(gtdRows(), 'gtd.xlsx');
    const s = buildStock([], gtd, { companyInn: '999000111', includePending: false, qtyOverrides: {} });
    expect(s.unknownQty.map((m) => m.id)).toEqual([gtd[3].id]);
    const filled = buildStock([], gtd, { companyInn: '999000111', includePending: false, qtyOverrides: { [gtd[3].id]: 200 } });
    expect(filled.rows.find((r) => r.key.startsWith('скрытый сливной бачок'))!.qtyIn).toBe(200);
    expect(filled.unknownQty).toEqual([]);
  });

  test('date filter: movements in the period, opening balance from earlier ones, closing at the end date', () => {
    const s = buildStock(invoices(), parseGtd(gtdRows(), 'gtd.xlsx'), { companyInn: '999000111', includePending: false, qtyOverrides: {}, from: '2026-07-10', to: '2026-08-31' });
    const r = s.rows.find((x) => x.key === 'унитаз керамический в одном корпусе с бачком')!;
    expect(r).toMatchObject({ opening: 420, qtyIn: 0, qtyOut: 1, balance: 419 });
    expect(s.rows.find((x) => x.key === 'зеркала стеклянные в рамах')).toBeUndefined();
  });

  test('a product sold beyond what came in is flagged', () => {
    const s = buildStock(invoices(), [], { companyInn: '999000111', includePending: false, qtyOverrides: {} });
    expect(s.rows.find((r) => r.key === 'раковина керамическая с ножкой')).toMatchObject({ balance: -1, negative: true });
  });
});

test('lines on the same day keep their document order', () => {
  const rows = gtdRows();
  rows.push(gtdRow('23.07.2026', '0000303', 2, 'Панель смыва из пластмассы / PLASTIC FLUSH PLATE - вес: 66 кг', 4, 'мест', '.'));
  rows.push(gtdRow('23.07.2026', '0000303', 3, 'Монтажная рама для биде / STEEL FRAME - вес: 350 кг', 50, 'мест', '.'));
  const gtd = parseGtd(rows, 'gtd.xlsx');
  const s = buildStock([], gtd, { companyInn: '999000111', includePending: false, qtyOverrides: {} });
  expect(s.unknownQty.map((m) => m.id)).toEqual(['gtd:0000303:1', 'gtd:0000303:2', 'gtd:0000303:3']);
});

test('hand-typed GTD quantities are marked as manual and can be changed', () => {
  const gtd = parseGtd(gtdRows(), 'gtd.xlsx');
  const id = gtd[3].id;
  const first = buildStock([], gtd, { companyInn: '999000111', includePending: false, qtyOverrides: { [id]: 200 } });
  const move = first.rows.flatMap((r) => r.moves).find((m) => m.id === id)!;
  expect(move).toMatchObject({ qty: 200, manual: true });
  expect(first.rows.flatMap((r) => r.moves).find((m) => m.id === gtd[0].id)!.manual).toBeFalsy();
  const changed = buildStock([], gtd, { companyInn: '999000111', includePending: false, qtyOverrides: { [id]: 180 } });
  expect(changed.rows.find((r) => r.key.startsWith('скрытый сливной бачок'))!.qtyIn).toBe(180);
});
