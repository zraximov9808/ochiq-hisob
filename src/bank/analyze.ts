import { classify, normalizeText, type Rule } from './classify';
import type { BankAccount, FlagCode, Group, Operation, ParsedStatement, RawOperation } from './model';

export interface Settings {
  /** LARGE_ROUND_CASH threshold, tiyin (default 100 mln so‘m). */
  largeRoundCash: number;
  /** "Round" means divisible by this many tiyin (default 100 000 so‘m). */
  roundUnit: number;
  /** VAGUE_PURPOSE: purposes shorter than this many characters are checked. */
  vagueLength: number;
}

export const DEFAULT_SETTINGS: Settings = { largeRoundCash: 100_000_000_00, roundUnit: 100_000_00, vagueLength: 60 };

export interface Override {
  group: Group;
  type: string;
}

export interface AccountCheck {
  account: string;
  currency: string;
  opening: number;
  debit: number;
  credit: number;
  closing: number;
  bank: number;
  /** closing − bank balance, tiyin. */
  diff: number;
  /** Turnovers equal the bank's "Итоговый оборот"; null when the file has no totals. */
  totalsOk: boolean | null;
  debitBank?: number;
  creditBank?: number;
  /** Format B: days where the computed balance differs from the bank's daily total. */
  dailyMismatches: string[];
  count: number;
}

export interface Analysis {
  accounts: BankAccount[];
  operations: Operation[];
  duplicates: number;
  checks: AccountCheck[];
  company: { name: string; inn: string; bankName: string; mfo: string; periodFrom: string; periodTo: string };
}

/** FNV-1a, 52 bits, base36 — a short stable id for an operation. */
function hash(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ c, 2246822519);
  }
  return ((h1 >>> 0) * 0x100000 + ((h2 >>> 0) & 0xfffff)).toString(36);
}

export const opKey = (o: RawOperation) => [o.account, o.datetime, o.docNo, o.debit, o.credit, o.korrAccount].join('|');

const LEGAL_PREFIXES = ['20208', '20210', '20212', '20214', '20216'];
const PERSON_PREFIXES = ['101', '20206', '22616', '22618'];
const isPerson = (korr: string) => PERSON_PREFIXES.some((p) => korr.startsWith(p));

/** Merges statements of the same account, dropping operations already seen in another file. */
function merge(statements: ParsedStatement[]) {
  const groups = new Map<string, ParsedStatement[]>();
  for (const s of statements) groups.set(s.account.number, [...(groups.get(s.account.number) ?? []), s]);
  let duplicates = 0;
  const accounts: BankAccount[] = [];
  const raw: Array<RawOperation & { id: string; seq: number }> = [];
  let seq = 0;
  for (const list of groups.values()) {
    const sorted = [...list].sort((a, b) => a.account.periodFrom.localeCompare(b.account.periodFrom) || a.operations.length - b.operations.length);
    const first = sorted[0].account;
    const last = [...sorted].sort((a, b) => a.account.periodTo.localeCompare(b.account.periodTo) || a.operations.length - b.operations.length).at(-1)!.account;
    const overlap = sorted.some((s, i) => i > 0 && s.account.periodFrom <= sorted[i - 1].account.periodTo);
    const sumTotal = (k: 'totalDebitBank' | 'totalCreditBank') =>
      overlap || sorted.some((s) => s.account[k] === undefined) ? undefined : sorted.reduce((t, s) => t + (s.account[k] ?? 0), 0);
    accounts.push({
      ...first,
      periodTo: last.periodTo,
      closingBalanceBank: last.closingBalanceBank,
      totalDebitBank: sorted.length === 1 ? first.totalDebitBank : sumTotal('totalDebitBank'),
      totalCreditBank: sorted.length === 1 ? first.totalCreditBank : sumTotal('totalCreditBank'),
      dailyBalances: Object.assign({}, ...sorted.map((s) => s.account.dailyBalances ?? {})),
      sourceFiles: sorted.flatMap((s) => s.account.sourceFiles),
    });
    // Identical operations inside one file are kept (numbered ~2, ~3); an id already taken by an
    // earlier file of the same account is a duplicate from overlapping periods and is dropped.
    const seen = new Set<string>();
    for (const s of sorted) {
      const counts = new Map<string, number>();
      const ids: string[] = [];
      for (const o of s.operations) {
        const key = opKey(o);
        const n = (counts.get(key) ?? 0) + 1;
        counts.set(key, n);
        const id = hash(key) + (n > 1 ? `~${n}` : '');
        if (seen.has(id)) {
          duplicates++;
          continue;
        }
        ids.push(id);
        raw.push({ ...o, id, seq: seq++ });
      }
      ids.forEach((id) => seen.add(id));
    }
  }
  return { accounts, raw, duplicates };
}

/** Foreign-currency accounts first (USD, EUR, RUB, then others), UZS last. */
const currencyRank = (c: string) => ({ USD: 0, EUR: 1, RUB: 2, UZS: 9 } as Record<string, number>)[c] ?? 3;

export function isVague(purpose: string, maxLen: number): boolean {
  let p = normalizeText(purpose)
    .replace(/^(\s*\d{5}~)+/, '')
    .replace(/^\s*\d{5}(?=[\s\d])/, '')
    .replace(/^\s*П\/О,?/, '')
    .replace(/\(№[^)]*ОБЩ\. СУММА[^)]*\)?\.?\s*$/, '')
    .trim();
  if (p.length >= maxLen) return false;
  p = p.replace(/\d+/g, ' ');
  const FILLER =
    /^(ШАРТНОМ[A-ZА-Я']*|SHARTNOM[A-ZА-Я']*|ДОГОВОР[A-ZА-Я']*|DOGOVOR[A-ZА-Я']*|СОГЛАСНО|СОГ|АСОСАН|АСАСОН|ASOSAN|ТУЛОВ[A-ZА-Я']*|ТОЛОВ[A-ZА-Я']*|TOLOV[A-ZА-Я']*|TULOV[A-ZА-Я']*|TO'LOV[A-ZА-Я']*|УТКАЗИЛ[A-ZА-Я']*|UTKAZIL[A-ZА-Я']*|OTKAZIL[A-ZА-Я']*|ОПЛАТ[A-ZА-Я']*|ПЕРЕЧИСЛ[A-ZА-Я']*|САНА[A-ZА-Я']*|SANA[A-ZА-Я']*|ЙИЛ[A-ZА-Я']*|YIL[A-ZА-Я']*|СОНЛИ|SONLI|КУНГИ|KUNGI|ГОДА|ГОД|УЧУН|UCHUN|ОЛДИНДАН|OLDINDAN|ПРЕДОПЛАТ[A-ZА-Я']*|СУММА|ОБЩ|ДАГИ|ДАН|ДЛЯ|БЕЗ|НДС|QQS|ККС|ВКЛЮЧАЯ|ПО|ЗА|ОТ|ГА|НА|ВА|VA|ИЗ)$/;
  const words = p.split(/[^A-ZА-Я']+/).filter((w) => w.length >= 3 && !FILLER.test(w));
  return words.length === 0;
}

const FIXED_ASSET = /МЕБЕЛ|КОМПЬЮТЕР|ОБОРУДОВАН|АВТОМОБИЛ|КОНДИЦИОНЕР|MEBEL|KOMPYUTER|KOMPUTER|AVTOMOBIL|KONDITSIONER|USKUNA|УСКУНА/;
const PENALTY = /ПЕНЯ(?!\s*:\s*0\b)|PENYA|ШТРАФ|ЖАРИМА|JARIMA/;
const SALES_CASH = /SAVDO PULI|САВДО ПУЛИ|ВЫРУЧК/;

function flagAll(ops: Operation[], accounts: BankAccount[], settings: Settings) {
  const loaded = new Set(accounts.map((a) => a.number));
  const acc = new Map(accounts.map((a) => [a.number, a]));
  const charterInns = new Set<string>();
  const byTime = [...ops].sort((a, b) => a.datetime.localeCompare(b.datetime));
  for (const o of byTime) {
    const a = acc.get(o.account)!;
    const p = normalizeText(o.purpose);
    const f = new Set<FlagCode>();
    if (o.ruleId === null && !o.manual) f.add('UNCLASSIFIED');
    if (o.credit > 0 && (o.ruleId === 'founder-sales' || (SALES_CASH.test(p) && isPerson(o.korrAccount)))) f.add('FOUNDER_SALES_CASH');
    if (o.credit > 0 && (o.ruleId === 'charter' || /^Ustav fondiga/.test(o.type))) {
      const legal = LEGAL_PREFIXES.some((x) => o.korrAccount.startsWith(x));
      if (legal || (charterInns.size > 0 && o.korrInn && !charterInns.has(o.korrInn))) f.add('FOUNDER_PAYER_MISMATCH');
      if (o.korrInn) charterInns.add(o.korrInn);
    }
    if (o.group === 'Soliqlar' && (/ЗАДОЛЖЕННОСТ/.test(p) || o.opCode === '11')) f.add('TAX_ENFORCED');
    if (o.debit > 0 && (o.ruleId === 'tax-penalty' || PENALTY.test(p))) f.add('PENALTY');
    if (o.debit > 0 && o.group === 'Chiqim' && !o.internal && FIXED_ASSET.test(p)) f.add('POSSIBLE_FIXED_ASSET');
    if (!o.internal && o.ruleId === null && !o.manual && isVague(o.purpose, settings.vagueLength)) f.add('VAGUE_PURPOSE');
    if (o.korrInn && o.korrInn === a.inn && o.korrAccount.startsWith('2') && o.korrAccount.length === 20 && !loaded.has(o.korrAccount)) f.add('MISSING_STATEMENT');
    if (o.runningBalance < 0) f.add('NEGATIVE_BALANCE');
    const founderish = isPerson(o.korrAccount) || o.ruleId === 'charter' || o.ruleId === 'founder-sales';
    if (a.currency === 'UZS' && o.credit >= settings.largeRoundCash && o.credit % settings.roundUnit === 0 && founderish) f.add('LARGE_ROUND_CASH');
    if (a.currency === 'UZS' && o.debit > 0 && o.korrAccount.startsWith('19925840')) f.add('FX_FEE_UZS');
    o.flags = [...f];
  }
}

/** Builds the full analysis from parsed statements, classification rules and manual overrides. */
export function analyze(
  statements: ParsedStatement[],
  rules: Rule[],
  overrides: Record<string, Override> = {},
  settings: Settings = DEFAULT_SETTINGS,
): Analysis {
  const { accounts, raw, duplicates } = merge(statements);
  accounts.sort((a, b) => currencyRank(a.currency) - currencyRank(b.currency) || a.number.localeCompare(b.number));
  const loaded = new Set(accounts.map((a) => a.number));
  const order = new Map(accounts.map((a, i) => [a.number, i]));
  const inn = new Map(accounts.map((a) => [a.number, a.inn]));

  raw.sort(
    (a, b) =>
      order.get(a.account)! - order.get(b.account)! ||
      a.datetime.localeCompare(b.datetime) ||
      Number(a.debit > 0) - Number(b.debit > 0) ||
      a.seq - b.seq,
  );

  const balance = new Map(accounts.map((a) => [a.number, a.openingBalance]));
  const operations: Operation[] = raw.map(({ seq: _seq, ...o }) => {
    const ov = overrides[o.id];
    const c = ov ? { group: ov.group, type: ov.type, ruleId: null } : classify(o, rules);
    const bal = balance.get(o.account)! - o.debit + o.credit;
    balance.set(o.account, bal);
    const internal = loaded.has(o.korrAccount) || (!!o.korrInn && o.korrInn === inn.get(o.account) && o.korrAccount.startsWith('2'));
    return { ...o, ...c, manual: ov ? true : undefined, internal, runningBalance: bal, flags: [] };
  });
  flagAll(operations, accounts, settings);

  const checks: AccountCheck[] = accounts.map((a) => {
    const ops = operations.filter((o) => o.account === a.number);
    const debit = ops.reduce((s, o) => s + o.debit, 0);
    const credit = ops.reduce((s, o) => s + o.credit, 0);
    const closing = a.openingBalance - debit + credit;
    const totalsOk = a.totalDebitBank === undefined || a.totalCreditBank === undefined ? null : a.totalDebitBank === debit && a.totalCreditBank === credit;
    const dailyMismatches: string[] = [];
    if (a.dailyBalances && Object.keys(a.dailyBalances).length) {
      const endOfDay = new Map<string, number>();
      for (const o of ops) endOfDay.set(o.datetime.slice(0, 10), o.runningBalance);
      for (const [day, bank] of Object.entries(a.dailyBalances)) if (endOfDay.has(day) && endOfDay.get(day) !== bank) dailyMismatches.push(day);
    }
    return {
      account: a.number, currency: a.currency, opening: a.openingBalance, debit, credit, closing, bank: a.closingBalanceBank,
      diff: closing - a.closingBalanceBank, totalsOk, debitBank: a.totalDebitBank, creditBank: a.totalCreditBank, dailyMismatches, count: ops.length,
    };
  });

  const first = accounts[0];
  return {
    accounts,
    operations,
    duplicates,
    checks,
    company: {
      name: first?.company ?? '',
      inn: first?.inn ?? '',
      bankName: first?.bankName ?? '',
      mfo: first?.mfo ?? '',
      periodFrom: accounts.reduce((m, a) => (!m || a.periodFrom < m ? a.periodFrom : m), ''),
      periodTo: accounts.reduce((m, a) => (a.periodTo > m ? a.periodTo : m), ''),
    },
  };
}
