import { FALLBACK_CREDIT, FALLBACK_DEBIT } from '../bank/classify';
import type { AutoSettings } from './types';

export const DEFAULT_AUTO: AutoSettings = {
  enabled: true,
  inputHash: '',
  skip: [],
  accounts: {},
  types: {},
  services: {},
  serviceDefault: '9420',
  includePending: false,
  declareCapital: true,
  rates: {},
};

export const INTERNAL_UZS = '5710';
export const INTERNAL_FX = '5715';
export const SPOT_BUY = '5730';
export const SPOT_SELL = '5740';
/** Transits whose two legs (so‘m and currency) are paired and the difference closed to OTHER_EXPENSE / 9390. */
export const PAIRED_TRANSITS = [SPOT_BUY, SPOT_SELL];
export const FOREIGN_BASE = '6015[Xorijiy yetkazib beruvchilar]';
/** Foreign suppliers are one pool per contract currency, followed in that currency. */
export const FOREIGN_POOL = (ccy: string) => `6015[Xorijiy yetkazib beruvchilar (${ccy})]`;
/** Input VAT by what was bought (1C chart): goods, services, imports. */
export const VAT_IN_GOODS = '4410.3';
export const VAT_IN_SERVICES = '4410.4';
export const VAT_IN_IMPORT = '4410.5';
export const VAT_INPUTS = [VAT_IN_GOODS, VAT_IN_SERVICES, VAT_IN_IMPORT];
export const VAT_OUT = '6410.1';
export const CUSTOMS_ADVANCE = '4490';
export const RETAIL = '4090';
export const SALES_GOODS = '9020.1';
export const SALES_SERVICES = '9030.1';
export const COST_OF_GOODS = '9120.1';
/** Other operating expenses (the leaf of 9430 in the 1C chart). */
export const OTHER_EXPENSE = '9431.7';
export const PROFIT_TAX = '6430';
export const PROPERTY_TAX = '6450';

/** Bank operation type (classification rules) → the account on the other side of the bank. */
export const DEFAULT_TYPE_ACCOUNTS: Record<string, string> = {
  [FALLBACK_CREDIT]: '4010.*',
  'Eksport xizmatlari uchun tushum (xorijiy mijoz)': '4010.*',
  'Terminal (QR/POS) orqali savdo tushumi': RETAIL,
  "Ta'sischidan tushum («savdo puli»)": RETAIL,
  "Ustav fondiga hissa (ta'sischidan)": '4610.*',
  'Berilgan qarz qaytarilishi': '5820.*',
  'Sotib olingan valyuta tushumi (SPOT)': SPOT_BUY,
  "Valyuta sotuvidan tushum (so'm ekvivalenti)": SPOT_SELL,
  "Valyuta xaridi uchun mablag' (asosiy hisobdan)": INTERNAL_UZS,

  [FALLBACK_DEBIT]: '6010.*',
  "Ijara to'lovi (bino)": '6010.*',
  'Deklarantlik (bojxona broker) xizmati': '6010.*',
  'Sertifikatlash xizmati': '6010.*',
  'Elektron hujjat aylanishi / ERI': '6010.*',
  'Internet / aloqa xizmatlari': '6010.*',
  'Kommunal xizmatlar': '6010.*',
  'IT Park ajratmasi': '6010.*',
  "Xorijiy yetkazib beruvchiga to'lov (import)": FOREIGN_BASE,
  "Xorijiy transport xizmati uchun to'lov": FOREIGN_BASE,
  'Ish haqi': '6710',
  'Bank komissiyasi (QR ekvayring)': '9690',
  'Bank komissiyasi (TIF kontraktiga xizmat)': '9690',
  "Bank komissiyasi (to'lov o'tkazish)": '9690',
  "Bank komissiyasi (xorijiy o'tkazma, SWIFT)": '9690',
  'Berilgan moliyaviy qarz': '5820.*',
  'Moliyaviy yordam (jismoniy shaxsga)': OTHER_EXPENSE,
  "Valyuta xaridi uchun o'tkazma (22613 ga)": INTERNAL_UZS,
  "Valyuta xaridiga to'lov (SPOT, so'mda)": SPOT_BUY,
  'Valyutani sotish uchun rezervlash': SPOT_SELL,
  "Asosiy hisobga o'tkazma (QR tushumi)": INTERNAL_UZS,

  "Bojxona to'lovlari (BYuD rasmiylashtirish)": CUSTOMS_ADVANCE,
  'JShDS (ish haqidan)': '6420.1',
  'INPS ajratmasi': '6530.1',
  'Ijtimoiy soliq': '6510.1',
  'Aylanmadan olinadigan soliq': PROFIT_TAX,
  "QQS / Foyda solig'i / Mol-mulk solig'i": '6490',
  'Boshqa byudjet to‘lovlari': OTHER_EXPENSE,
  "Boshqa byudjet to'lovlari": OTHER_EXPENSE,
  'Ekologik / davlat to‘lovlari': OTHER_EXPENSE,
  "Ekologik / davlat to'lovlari": OTHER_EXPENSE,
  "Penya (INPS / soliqlar bo'yicha)": OTHER_EXPENSE,
};

/** Types whose expense is not deductible for profit tax. */
export const NON_DEDUCTIBLE_TYPES = new Set(["Penya (INPS / soliqlar bo'yicha)", 'Moliyaviy yordam (jismoniy shaxsga)']);
