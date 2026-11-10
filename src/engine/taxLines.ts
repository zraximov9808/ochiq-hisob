import { normalizeUz } from './accounts';

/**
 * Lines of the profit tax calculation ("Foyda solig‘i hisob-kitobi") that journal entries feed.
 * Annex 1 = income, annex 2 = expenses (part I groups). `verified: false` marks lines whose exact
 * wording or split should be checked against the current official form before filing.
 */
export interface TaxLineDef {
  id: string;
  annex: 1 | 2;
  code: string;
  label: string;
  verified: boolean;
}

const RAW: TaxLineDef[] = [
  { id: 'i021', annex: 1, code: '021', label: 'Ishlab chiqarilgan mahsulotni sotishdan daromad', verified: false },
  { id: 'i022', annex: 1, code: '022', label: 'Tovarlarni sotishdan daromad', verified: true },
  { id: 'i023', annex: 1, code: '023', label: "Ish bajarish va xizmat ko'rsatishdan daromad", verified: true },
  { id: 'i024', annex: 1, code: '024', label: "Boshqa faoliyat turi bo'yicha sotishdan daromad", verified: false },
  { id: 'i030', annex: 1, code: '030', label: 'Boshqa daromadlar (030–140-satrlar)', verified: false },
  { id: 'i180', annex: 1, code: '180', label: "Boshqa satrlarda ko'rsatilmagan daromadlar", verified: false },
  { id: 'e020', annex: 2, code: '020', label: 'Realizatsiya qilingan mahsulot (tovar, xizmat) tannarxi', verified: true },
  { id: 'e030', annex: 2, code: '030', label: "Realizatsiya qilish bo'yicha xarajatlar", verified: true },
  { id: 'e040', annex: 2, code: '040', label: "Ma'muriy xarajatlar", verified: true },
  { id: 'e050', annex: 2, code: '050', label: "Moliyaviy faoliyat bo'yicha xarajatlar", verified: true },
  { id: 'e060', annex: 2, code: '060', label: 'Boshqa xarajatlar (zararlar)', verified: true },
];

export const TAX_LINES: TaxLineDef[] = RAW.map((l) => ({ ...l, label: normalizeUz(l.label) }));

export const TAX_LINE_BY_ID = new Map(TAX_LINES.map((l) => [l.id, l]));

export function taxLineTitle(id: string | null): string {
  if (!id) return '— Hisobotga kirmaydi';
  const l = TAX_LINE_BY_ID.get(id);
  return l ? `${l.annex}-ilova ${l.code} ${l.label}` : id;
}

/** Main form lines (asosiy shakl). Rates (070–072) are percents, everything else is money. */
export const TAX_MAIN_LINES: Array<{ code: string; label: string; bold?: boolean; rate?: boolean }> = [
  { code: '010', label: 'Jami daromadlar (Hisob-kitobning 1-ilovasi 010-satri – 052-satri – 060-satri – 120-satri – 131-satri)' },
  { code: '020', label: 'Chegiriladigan xarajatlar (Hisob-kitobning 2-ilovasi 010-satri 3-ustun — 4-ustun yoki 2.1-ilovasi 010-satri 3-ustun — 4-ustun)' },
  { code: '030', label: 'Soliq solinadigan foyda (010-satr — 020-satr)', bold: true },
  { code: '040', label: 'Imtiyozlar — jami (Hisob-kitobning 6-ilovasi 030-satri)' },
  { code: '050', label: "Nol stavka qo'llaniladigan soliq to'lovchilar foydasi (Hisob-kitobning 7-ilovasi 030-satri)" },
  { code: '060', label: 'Soliq bazasi (030-satr - 040-satr — 050-satr), biroq "0" dan kam emas', bold: true },
  { code: '061', label: 'Tezlashtirilgan amortizatsiya summasi (Hisob-kitobning 4-ilovasi 010-satri 19-ustun - 22-ustun)' },
  { code: '062', label: 'Yakuniy soliq bazasi (060-satr - 061-satr)', bold: true },
  { code: '063', label: 'Joylashgan hududga nisbatan pasaytirilgan soliq stavkalari bo‘yicha soliq solinadigan foyda' },
  { code: '070', label: "Foyda solig'ining belgilangan stavkasi, foizda", rate: true },
  { code: '071', label: 'Pasaytirilgan soliq stavkasi', rate: true },
  { code: '072', label: 'Nogironligi bo‘lgan shaxslar mehnatidan foydalanayotgan yuridik shaxslar uchun tuzatilgan soliq stavkasi', rate: true },
  { code: '080', label: "Foyda solig'i summasi – jami", bold: true },
  { code: '090', label: "Ushbu hisobot davrida hisoblangan jami oylik bo'nak to'lovlari" },
  { code: '100', label: 'Onlayn nazorat-kassa mashinalari va virtual kassa bilan bog‘liq qurilmalarni sotib olish xarajatlari summasi' },
  { code: '110', label: 'Doimiy muassasa sifatida hisobga qo‘yilgunga qadar to‘lov manbaida ushlab qolingan foyda solig‘i summasi' },
  { code: '120', label: 'Doimiy muassasaning hisobot davridagi sof foydasi' },
  { code: '130', label: 'Doimiy muassasaning sof foydasidan olinadigan soliq stavkasi', rate: true },
  { code: '140', label: 'Doimiy muassasaning sof foydasidan olinadigan soliq summasi (120-satr x 130-satr)' },
  { code: '150', label: "Foyda solig'ining byudjetga to'lanishi lozim bo'lgan jami summasi (080 – 100 – 110 + 140 – 10-ilova 090 + 11-ilova 060)", bold: true },
].map((l) => ({ ...l, label: normalizeUz(l.label) }));
