import { isKnownAccount, synthetic } from './accounts';
import { buildBalance, type BalanceForm } from './balanceSheet';
import { buildIncome, type IncomeForm } from './incomeStatement';
import { buildLedger } from './ledger';
import { formatAmount } from './money';
import { periodRange, type Quarter } from './period';
import { buildProfitTax, type ProfitTax } from './profitTax';
import { formSet } from '../forms/sources';
import { planChartMigration } from './migrate';
import type { FormId } from '../forms/types';
import type { FormValues } from '../forms/values';
import type { Doc, Entry } from './types';

export interface Check {
  id: string;
  ok: boolean;
  title: string;
  detail: string;
  fix?: { label: string; entry: Omit<Entry, 'id'> };
}

export interface Warning {
  id: string;
  level: 'warn' | 'info';
  text: string;
  action?: 'close-year' | 'migrate-chart';
}

export interface Report {
  checks: Check[];
  warnings: Warning[];
  balance: BalanceForm;
  income: IncomeForm;
  tax: ProfitTax;
  /** The official forms as filed (so'm): the books' values with what was typed in. */
  forms: Record<FormId, FormValues>;
}

const som = (v: number) => formatAmount(v, 'som');
const ming = (v: number) => formatAmount(v, 'ming');
const is87 = (code: string) => synthetic(code).startsWith('87');
const isPLorRE = (code: string) => synthetic(code).startsWith('9') || is87(code);

/** Builds all reports for the period and checks how they tie together. */
export function runChecks(doc: Doc, quarter: Quarter): Report {
  const { from, to } = periodRange(doc.year, quarter);
  const balance = buildBalance(doc, quarter);
  const income = buildIncome(doc, quarter);
  const tax = buildProfitTax(doc, quarter);
  const forms = formSet(doc, quarter, { checks: [], warnings: [], balance, income, tax } as unknown as Report, 'som');
  const fv = (id: FormId, line: string, col = '3') => forms[id][line]?.[col]?.v ?? 0;
  const checks: Check[] = [];
  const b = (code: string) => balance.byCode[code];

  const dr = doc.opening.reduce((s, o) => s + o.debit, 0);
  const cr = doc.opening.reduce((s, o) => s + o.credit, 0);
  checks.push({ id: 'opening', ok: dr === cr, title: 'Yil boshidagi qoldiqlar: Debet = Kredit', detail: `${som(dr)} = ${som(cr)}` });

  checks.push({
    id: 'bal-start',
    ok: b('400').start === b('780').start,
    title: 'Balans yil boshiga: aktiv (400) = passiv (780)',
    detail: `${ming(b('400').start)} = ${ming(b('780').start)} ming so'm`,
  });
  checks.push({
    id: 'bal-end',
    ok: b('400').end === b('780').end,
    title: 'Balans davr oxiriga: aktiv (400) = passiv (780)',
    detail: `${ming(b('400').end)} = ${ming(b('780').end)} ming so'm`,
  });

  // the filed form: typed values and the template's own totals (it leaves 230, 510, 620 out of 210, 490, 600)
  checks.push({
    id: 'form-bal',
    ok: fv('b1', '400', '3') === fv('b1', '780', '3') && fv('b1', '400', '4') === fv('b1', '780', '4'),
    title: 'Rasmiy 1-shakl (qo‘lda kiritilganlar bilan): aktiv (400) = passiv (780)',
    detail: `${ming(fv('b1', '400', '4'))} = ${ming(fv('b1', '780', '4'))} ming so'm`,
  });

  let distributed = 0;
  for (const e of doc.entries) {
    if (e.date < from || e.date > to || e.closing) continue;
    const d87 = is87(e.debit) && !isPLorRE(e.credit);
    const c87 = is87(e.credit) && !isPLorRE(e.debit);
    if (d87) distributed += e.amount;
    if (c87) distributed -= e.amount;
  }
  const net = income.byCode['270'];
  const expected450 = b('450').start + net - distributed;
  checks.push({
    id: 'profit-450',
    ok: expected450 === b('450').end,
    title: "2-shakl sof foydasi (270) balansdagi taqsimlanmagan foydaga (450) o'tgan",
    detail:
      `450 yil boshi ${ming(b('450').start)} + sof foyda ${ming(net)} − taqsimot ${ming(distributed)}` +
      ` = ${ming(expected450)}; balansda 450 oxiri ${ming(b('450').end)}`,
  });

  // what the filed calculation says, with its annexes and typed values
  const tax150 = fv('tax', '150');
  const booked = income.byCode['250'];
  const diff = tax150 - booked;
  checks.push({
    id: 'tax-9810',
    ok: diff === 0,
    title: "Foyda solig'i: hisob-kitob (150) = 2-shakl 250 (Dt 9810)",
    detail: `Hisob-kitob ${som(tax150)}, jurnalda ${som(booked)} so'm`,
    fix:
      diff === 0
        ? undefined
        : {
            label: diff > 0 ? `Dt 9810 Kt 6430 ${som(diff)} qo'shish` : `Dt 6430 Kt 9810 ${som(-diff)} qo'shish`,
            entry: {
              date: to,
              text: diff > 0 ? "Foyda solig'i hisoblandi" : "Foyda solig'i tuzatildi",
              debit: diff > 0 ? '9810' : '6430',
              credit: diff > 0 ? '6430' : '9810',
              amount: Math.abs(diff),
              tax: { line: null, manual: true },
            },
          },
  });

  const rev2 = income.byCode['010'];
  const revTax = fv('tax-1', '020');
  checks.push({
    id: 'revenue',
    ok: rev2 === revTax,
    title: "Sof tushum: 2-shakl 010 = foyda solig'i 1-ilova 020",
    detail: rev2 === revTax ? `${som(rev2)} so'm` : `2-shakl ${som(rev2)}, 1-ilova ${som(revTax)} so'm`,
  });

  return { checks, warnings: buildWarnings(doc, quarter, balance, income, tax), balance, income, tax, forms };
}

function buildWarnings(doc: Doc, quarter: Quarter, balance: BalanceForm, income: IncomeForm, tax: ProfitTax): Warning[] {
  const w: Warning[] = [];
  const remap = planChartMigration(doc);
  if (remap.length)
    w.push({
      id: 'old-chart',
      level: 'warn',
      text: `Hujjat oldingi hisobvaraqlar rejasida yozilgan, yangi rejada bu kodlarning ma'nosi boshqa: ${remap.map((r) => `${r.from} → ${r.to} (${r.count} ta)`).join(', ')}. Hisobotlar to'g'ri chiqishi uchun hujjatni yangi rejaga o'tkazing.`,
      action: 'migrate-chart',
    });
  const y = doc.year;
  const before = doc.entries.filter((e) => e.date < `${y}-01-01`).length;
  const after = doc.entries.filter((e) => e.date > `${y}-12-31`).length;
  if (before)
    w.push({ id: 'before-year', level: 'warn', text: `${before} ta provodka ${y}-yil boshidan oldin — ular yil boshidagi qoldiqlarda bo'lishi kerak, hisobga olinmaydi.` });
  if (after) w.push({ id: 'after-year', level: 'warn', text: `${after} ta provodka ${y}-yildan keyin — keyingi yil faylida kiritilishi kerak, hisobga olinmaydi.` });

  const unknown = new Set<string>();
  for (const e of doc.entries) for (const c of [e.debit, e.credit]) if (!isKnownAccount(c, doc.subaccounts)) unknown.add(c.trim() || '(bo‘sh)');
  for (const o of doc.opening) if (!isKnownAccount(o.account, doc.subaccounts)) unknown.add(o.account.trim() || '(bo‘sh)');
  if (unknown.size)
    w.push({ id: 'unknown-accounts', level: 'warn', text: `Hisobvaraqlar rejasida yo'q kodlar: ${[...unknown].sort().join(', ')}. Kodni tekshiring yoki subschyot oching.` });

  if (balance.unmapped.length)
    w.push({ id: 'unmapped', level: 'warn', text: `Balansning hech bir satriga tushmaydigan qoldiqlar: ${balance.unmapped.join(', ')}.` });
  if (income.unmapped.length)
    w.push({ id: 'pl-unmapped', level: 'warn', text: `2-shaklga kirmaydigan oraliq hisobvaraqlarda aylanma qolgan: ${income.unmapped.join(', ')} — ular yopilishi kerak.` });

  if (quarter === 4) {
    const ledger = buildLedger(doc, `${y}-01-01`, `${y}-12-31`);
    const open = [...ledger.entries()].filter(([c, r]) => {
      const s = synthetic(c);
      return s.startsWith('9') && !s.startsWith('99') && r.close !== 0;
    }).length;
    if (open)
      w.push({
        id: 'unclosed-pl',
        level: 'warn',
        text: `${open} ta daromad/xarajat hisobvarag'i yil oxirida yopilmagan. Balansda natija 450-satrga avtomatik qo'shiladi; yopish provodkalarini yaratish tavsiya etiladi.`,
        action: 'close-year',
      });
  }

  if (tax.nonDeductibleTotal > 0)
    w.push({ id: 'non-deductible', level: 'info', text: `${som(tax.nonDeductibleTotal)} so'm chegirilmaydigan xarajat aniqlandi va soliq bazasiga qaytarildi.` });

  const cashNeg = Object.values(balance.contrib)
    .flat()
    .filter((c) => /^5[0-2]/.test(c.account) && c.end < 0)
    .map((c) => c.account);
  if (cashNeg.length) w.push({ id: 'negative-cash', level: 'warn', text: `Pul mablag'i manfiy qoldiqda: ${cashNeg.join(', ')}. Provodkalarni tekshiring.` });

  const self = doc.entries.filter((e) => e.debit.trim() === e.credit.trim()).length;
  if (self) w.push({ id: 'same-account', level: 'warn', text: `${self} ta provodkada debet va kredit bir xil.` });
  const zero = doc.entries.filter((e) => e.amount <= 0).length;
  if (zero) w.push({ id: 'nonpositive', level: 'warn', text: `${zero} ta provodkada summa nol yoki manfiy.` });
  return w;
}
