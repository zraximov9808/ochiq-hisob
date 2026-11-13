import type { FlagCode } from './model';

/** Texts shown for each automatic flag (spec section 7). */
export const FLAG_TEXT: Record<FlagCode, string> = {
  UNCLASSIFIED: 'Tur aniqlanmadi — tekshiring',
  FOUNDER_SALES_CASH: 'Savdo tushumi ta’sischi orqali kelgan — kassa orqali o‘tishi kerak edi',
  FOUNDER_PAYER_MISMATCH: 'Ustav fondi boshqa shaxs hisobidan kelgan',
  TAX_ENFORCED: 'Soliq qarzi soliq organi tomonidan undirilgan',
  PENALTY: 'Penya yoki jarima to‘langan',
  POSSIBLE_FIXED_ASSET: 'Asosiy vosita bo‘lishi mumkin',
  VAGUE_PURPOSE: 'To‘lov maqsadi aniq emas',
  MISSING_STATEMENT: 'Bu hisobning vipiskasi yuklanmagan',
  NEGATIVE_BALANCE: 'Qoldiq manfiyga tushgan (saralash yoki yetishmayotgan operatsiya)',
  LARGE_ROUND_CASH: 'Katta yaxlit summa — asos hujjatini tekshiring',
  FX_FEE_UZS: 'Korrespondent bank xarajati so‘mda yechilgan',
};
