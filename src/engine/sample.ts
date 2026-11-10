import { normalizeUz } from './accounts';
import { emptyDoc, type Doc, type Entry } from './types';

const M = 100_000_000;

/** Demo company for the "Namuna ma’lumotlar" button. All names and STIRs are fictional. */
export function sampleDoc(year: number): Doc {
  const doc = emptyDoc(year);
  doc.company = {
    name: '"Namuna Savdo" MChJ',
    stir: '999999901',
    address: 'Toshkent sh.',
    director: 'Direktor F.I.Sh.',
    accountant: 'Bosh buxgalter F.I.Sh.',
    taxOffice: 'Toshkent sh. soliq boshqarmasi',
  };
  doc.opening = [
    { account: '0130', debit: 50 * M, credit: 0 },
    { account: '0230', debit: 0, credit: 10 * M },
    { account: '2910.01', debit: 150 * M, credit: 0 },
    { account: '5110', debit: 60 * M, credit: 0 },
    { account: '6010.01', debit: 0, credit: 40 * M },
    { account: '8330', debit: 0, credit: 100 * M },
    { account: '8720', debit: 0, credit: 110 * M },
  ];
  doc.subaccounts = [
    { code: '2910.01', parent: '2910', name: 'Oziq-ovqat mahsulotlari' },
    { code: '4010.01', parent: '4010', name: '"Mehnat Market" XK', stir: '999999903' },
    { code: '6010.01', parent: '6010', name: '"Barakali Ta\'minot" MChJ', stir: '999999902' },
    { code: '6010.02', parent: '6010', name: '"Reklama Plus" MChJ', stir: '999999904' },
    { code: '6010.03', parent: '6010', name: '"Biznes Markaz" MChJ (ofis ijarasi)', stir: '999999905' },
  ].map((s) => ({ ...s, name: normalizeUz(s.name) }));

  const rows: Array<[string, string, string, string, number]> = [
    ['01-04', 'Tovar xarid qilindi', '2910.01', '6010.01', 100],
    ['01-05', 'Tovar sotildi (QQSsiz)', '4010.01', '9020', 180],
    ['01-05', "Sotuv bo'yicha QQS", '4010.01', '6410', 21.6],
    ['01-05', 'Sotilgan tovar tannarxi', '9120', '2910.01', 120],
    ['01-10', "Xizmat ko'rsatildi", '4010.01', '9030', 40],
    ['01-15', 'Xaridordan pul tushdi', '5110', '4010.01', 150],
    ['01-20', "Ta'minotchiga to'landi", '6010.01', '5110', 80],
    ['01-31', 'Ish haqi hisoblandi — boshqaruv', '9420', '6710', 30],
    ['01-31', 'Ish haqidan JShDS ushlandi', '6710', '6410', 3.6],
    ['01-31', 'Ijtimoiy soliq hisoblandi', '9420', '6520', 3.6],
    ['02-05', "Ish haqi to'landi", '6710', '5110', 26.4],
    ['02-10', 'Reklama xizmati uchun', '9410', '6010.02', 5],
    ['02-15', 'Asosiy vosita eskirishi', '9420', '0230', 2.8],
    ['02-20', 'Ofis ijarasi', '9420', '6010.03', 6],
    ['02-28', 'Bank xizmati haqi', '9430', '5110', 0.5],
    ['03-01', "Jarima to'landi", '9430', '5110', 0.2],
    ['03-10', 'Yetkazib berish xarajati', '9410', '6010.02', 2.5],
    ['03-15', 'Bank qoldig‘iga foiz daromadi', '5110', '9520', 1.5],
    ['03-20', "QQS byudjetga to'landi", '6410', '5110', 15],
    ['03-25', "Dividend e'lon qilindi", '8720', '6610', 10],
  ];
  doc.entries = rows.map(
    ([md, text, debit, credit, millions], i): Entry => ({
      id: `s${i + 1}`,
      date: `${year}-${md}`,
      text: normalizeUz(text),
      debit,
      credit,
      amount: Math.round(millions * M),
    }),
  );
  doc.templates = [
    { id: 't1', text: 'Ofis ijarasi', debit: '9420', credit: '6010.03', amount: 6 * M, day: 20 },
    { id: 't2', text: 'Ish haqi hisoblandi — boshqaruv', debit: '9420', credit: '6710', amount: 30 * M, day: 31 },
  ];
  return doc;
}
