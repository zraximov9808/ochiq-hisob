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
export const INTERNAL_FX = '5720[Valyuta o‘tkazmalari]';
export const SPOT_BUY = '5720[Valyuta xaridi]';
export const SPOT_SELL = '5720[Valyuta sotuvi]';
/** Transits whose two legs (so‘m and currency) are paired and the difference closed to 9430 / 9390. */
export const PAIRED_TRANSITS = [SPOT_BUY, SPOT_SELL];
export const FOREIGN_BASE = '6010[Xorijiy yetkazib beruvchilar]';
/** Foreign suppliers are one pool per contract currency, followed in that currency. */
export const FOREIGN_POOL = (ccy: string) => `6010[Xorijiy yetkazib beruvchilar (${ccy})]`;
export const VAT_IN = '4410[QQS]';
export const VAT_OUT = '6410[QQS]';
export const CUSTOMS_ADVANCE = '4410[Bojxona to‘lovlari bo‘naki]';
export const RETAIL = '4010[Chakana savdo]';

/** Bank operation type (classification rules) → the account on the other side of the bank. */
export const DEFAULT_TYPE_ACCOUNTS: Record<string, string> = {
  [FALLBACK_CREDIT]: '4010.*',
  'Eksport xizmatlari uchun tushum (xorijiy mijoz)': '4010.*',
  'Terminal (QR/POS) orqali savdo tushumi': RETAIL,
  "Ta'sischidan tushum («savdo puli»)": RETAIL,
  "Ustav fondiga hissa (ta'sischidan)": '4610.*',
  'Berilgan qarz qaytarilishi': '5830.*',
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
  'Berilgan moliyaviy qarz': '5830.*',
  'Moliyaviy yordam (jismoniy shaxsga)': '9430',
  "Valyuta xaridi uchun o'tkazma (22613 ga)": INTERNAL_UZS,
  "Valyuta xaridiga to'lov (SPOT, so'mda)": SPOT_BUY,
  'Valyutani sotish uchun rezervlash': SPOT_SELL,
  "Asosiy hisobga o'tkazma (QR tushumi)": INTERNAL_UZS,

  "Bojxona to'lovlari (BYuD rasmiylashtirish)": CUSTOMS_ADVANCE,
  'JShDS (ish haqidan)': '6410[JShDS]',
  'INPS ajratmasi': '6410[JShDS]',
  'Ijtimoiy soliq': '6520',
  'Aylanmadan olinadigan soliq': '6410[Aylanmadan soliq]',
  "QQS / Foyda solig'i / Mol-mulk solig'i": '6410[Soliqlar]',
  'Boshqa byudjet to‘lovlari': '9430',
  "Boshqa byudjet to'lovlari": '9430',
  'Ekologik / davlat to‘lovlari': '9430',
  "Ekologik / davlat to'lovlari": '9430',
  "Penya (INPS / soliqlar bo'yicha)": '9430',
};

/** Types whose expense is not deductible for profit tax. */
export const NON_DEDUCTIBLE_TYPES = new Set(["Penya (INPS / soliqlar bo'yicha)", 'Moliyaviy yordam (jismoniy shaxsga)']);
