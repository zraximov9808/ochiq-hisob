import { describe, expect, test } from 'vitest';
import { classify, normalizeText, type Rule } from './classify';
import type { RawOperation } from './model';
import { DEFAULT_RULES } from './rules/defaultRules';
import { ACC_BUY, ACC_FX, ACC_USD, ACC_UZS } from './testkit';

const op = (p: Partial<RawOperation>): RawOperation => ({
  account: ACC_UZS, datetime: '2026-05-12T10:00:00', docNo: '1', korrAccount: '20208000100000000009', korrInn: '300000001',
  korrName: 'MIJOZ MCHJ', korrMfo: '00999', purpose: '', debit: 0, credit: 0, ...p,
});
const type = (p: Partial<RawOperation>, rules: Rule[] = DEFAULT_RULES) => classify(op(p), rules).type;

describe('normalizeText', () => {
  test('upper-cases, folds ё and Uzbek letters and unifies apostrophes', () => {
    expect(normalizeText("o‘g‘li Ёлка ҚҒЎҲ`ʻ’")).toBe("O'G'LI ЕЛКА КГУХ'''");
  });
});

describe('default rules', () => {
  const TAX = '23402000300100001010';
  test('taxes by budget code and wording', () => {
    expect(type({ debit: 1, korrAccount: TAX, purpose: '09570~402~П/О, БОЖХОНА ЮК ДЕКЛАРАЦИЯ' })).toBe('Bojxona to\'lovlari (BYuD rasmiylashtirish)');
    expect(type({ debit: 1, korrAccount: TAX, purpose: '08102~1~308681477~46 ЖИСМОНИЙ ШАХСЛАР ДАРОМАДИДАН ОЛИНАДИГАН СОЛИҚ' })).toBe('JShDS (ish haqidan)');
    expect(type({ debit: 1, korrAccount: TAX, purpose: 'ЗАДОЛЖЕННОСТЬ ПО СОЦИАЛЬНЫЙ НАЛОГ ВТЧ ПЕНЯ: 0' })).toBe('Ijtimoiy soliq');
    expect(type({ debit: 1, korrAccount: TAX, purpose: '308681477~191 ИНПС ПЕНЯ УЧУН ОЛДИНДАН ТЎЛОВ' })).toBe('Penya (INPS / soliqlar bo\'yicha)');
    expect(type({ debit: 1, korrAccount: '22628000000011323999', purpose: '101 ФУҚАРОЛАРНИНГ ЖАМҒАРИБ БОРИЛАДИГАН ПЕНСИЯ БАДАЛИГА' })).toBe('INPS ajratmasi');
    expect(type({ debit: 1, korrAccount: TAX, purpose: '~100 АЙЛАНМАДАН ОЛИНАДИГАН СОЛИҚ' })).toBe('Aylanmadan olinadigan soliq');
    expect(type({ debit: 1, korrAccount: '20816000600000000001', purpose: 'за усл.единго окно' })).toBe('Ekologik / davlat to\'lovlari');
    expect(type({ debit: 1, korrAccount: TAX, purpose: 'nimadir' })).toBe('Boshqa byudjet to\'lovlari');
  });

  test('bank fees split into foreign trade contracts, SWIFT and transfers', () => {
    const BANK = '16401000500000000002';
    expect(type({ debit: 1, korrAccount: BANK, purpose: 'Комиссия за операцию "Обслуживание внешнеторговых контрактов"' })).toBe('Bank komissiyasi (TIF kontraktiga xizmat)');
    expect(type({ debit: 1, korrAccount: BANK, purpose: 'Юр Перевод средств за пределы страны (SWIFT)' })).toBe('Bank komissiyasi (xorijiy o\'tkazma, SWIFT)');
    expect(type({ debit: 1, korrAccount: BANK, purpose: 'Комиссия за операцию "Перевод средств по системе ДБО"' })).toBe('Bank komissiyasi (to\'lov o\'tkazish)');
    expect(type({ debit: 1, korrAccount: '29896000300010725812', purpose: 'Оплата по QR Коду' })).toBe('Bank komissiyasi (QR ekvayring)');
  });

  test('currency purchase chain', () => {
    expect(type({ debit: 1, korrAccount: ACC_BUY, purpose: '00611~Перечисление для покупки иностранной валюты' })).toBe('Valyuta xaridi uchun o\'tkazma (22613 ga)');
    expect(type({ account: ACC_BUY, credit: 1, korrAccount: ACC_UZS, purpose: 'Перечисление для покупки иностранной валюты' })).toBe('Valyuta xaridi uchun mablag\' (asosiy hisobdan)');
    expect(type({ account: ACC_BUY, debit: 1, purpose: 'Продажа иностранной валюты согласно заявке N 18 по курсу 12070' })).toBe('Valyuta xaridiga to\'lov (SPOT, so\'mda)');
    expect(type({ account: ACC_FX, credit: 1, purpose: 'Продажа иностранной валюты согласно заявке N 18 по курсу 12070' })).toBe('Sotib olingan valyuta tushumi (SPOT)');
    expect(type({ account: ACC_USD, debit: 1, purpose: 'CONTRACT NUMBER 1 FOR THE PURCHASE OF CERAMIC GOODS' })).toBe('Xorijiy yetkazib beruvchiga to\'lov (import)');
    expect(type({ account: ACC_FX, debit: 1, purpose: 'PREPAYMENT BASED ON THE TRANSPORT SERVICE CONTRACT' })).toBe('Xorijiy transport xizmati uchun to\'lov');
  });

  test('incoming money', () => {
    expect(type({ credit: 1, purpose: 'Ali Valiyev nomidan ustav fondini shakllantirish uchun' })).toBe('Ustav fondiga hissa (ta\'sischidan)');
    expect(type({ credit: 1, purpose: 'savdo puli 370000,00' })).toBe('Ta\'sischidan tushum («savdo puli»)');
    expect(type({ credit: 1, purpose: 'Оплата по QR Коду за товар' })).toBe('Terminal (QR/POS) orqali savdo tushumi');
    expect(type({ credit: 1, purpose: 'for the purpose of payment' })).toBe('Mijozdan tushum (tovar/xizmat)');
  });

  test('payments to service providers by name or wording', () => {
    expect(type({ debit: 1, korrName: '"NAMUNA BROKER" XK', purpose: 'П/О, шартнома' })).toBe('Deklarantlik (bojxona broker) xizmati');
    expect(type({ debit: 1, purpose: 'ИМПОРТ ТОВАРЛАРНИ СЕРТИФИКАТЛАШ ХИЗМАТИ' })).toBe('Sertifikatlash xizmati');
    expect(type({ debit: 1, purpose: 'БИНО ИЖАРАСИ ИЮН ОЙИ УЧУН' })).toBe('Ijara to\'lovi (bino)');
    expect(type({ debit: 1, purpose: 'ЭДО ХИЗМАТЛАРИ УЧУН' })).toBe('Elektron hujjat aylanishi / ERI');
    expect(type({ debit: 1, purpose: 'ЗАВОДА маҳсулотлари учун' })).toBe('Yetkazib beruvchiga to\'lov (tovar/xizmat)');
  });

  test('fallbacks carry no rule id; matched rules report theirs', () => {
    expect(classify(op({ debit: 1, purpose: 'xyz' }), DEFAULT_RULES)).toMatchObject({ group: 'Chiqim', ruleId: null });
    expect(classify(op({ credit: 1, purpose: 'Ustav fondi' }), DEFAULT_RULES).ruleId).toBe('charter');
  });

  test('higher priority wins and a custom rule can override defaults', () => {
    const custom: Rule = { id: 'my', group: 'Chiqim', type: 'Mening turim', direction: 'debit', korrNameIncludes: ['BROKER'], priority: 5000 };
    expect(type({ debit: 1, korrName: 'NAMUNA BROKER' }, [...DEFAULT_RULES, custom])).toBe('Mening turim');
  });
});
