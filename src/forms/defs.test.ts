import { describe, expect, test } from 'vitest';
import { BALANCE_LINES } from '../engine/balanceForm';
import { INCOME_LINES } from '../engine/incomeStatement';
import { toCyrillic } from '../i18n/translit';
import { FORMS, FORM_IDS } from './defs';

const codes = (id: keyof typeof FORMS) => FORMS[id].lines.filter((l) => l.code).map((l) => l.code!);

describe('form definitions', () => {
  test('balance form has the official line codes, all of which the report computes', () => {
    const engine = BALANCE_LINES.filter((l) => l.code).map((l) => l.code);
    expect(engine.filter((c) => codes('b1').includes(c))).toEqual(codes('b1'));
    // the template has no "of which overdue" lines 111 and 492: overdue debts go to their own annex
    expect(engine.filter((c) => !codes('b1').includes(c))).toEqual(['111', '492']);
  });

  test('2-shakl codes 010–270', () => {
    expect(codes('f2')).toEqual(INCOME_LINES.map((l) => l.code));
  });

  test('tax main has 010…150 incl. 061, 062, 063, 071, 072', () => {
    expect(codes('tax')).toEqual(expect.arrayContaining(['010', '020', '030', '040', '050', '060', '061', '062', '063', '070', '071', '072', '080', '090', '100', '110', '120', '130', '140', '150']));
  });

  test('annex 1 has 010…288, annex 2 has 0101…0137 and 01371…01378', () => {
    expect(codes('tax-1')).toEqual(expect.arrayContaining(['010', '020', '021', '026', '130', '280', '288']));
    expect(codes('tax-2')).toEqual(expect.arrayContaining(['010', '020', '030', '0101', '0137', '01371', '01378']));
  });

  test('off-balance 790…920 and budget payments 280…480', () => {
    expect(codes('b1-offbal')).toEqual(['790', '800', '810', '820', '830', '840', '850', '860', '870', '880', '890', '900', '910', '920']);
    expect(codes('f2-budget')).toEqual(expect.arrayContaining(['280', '290', '291', '310', '440', '450', '470', '480']));
  });

  test('every annex of the profit tax template is there', () => {
    expect(FORM_IDS.filter((id) => id.startsWith('tax'))).toEqual(['tax', 'tax-1', 'tax-2', 'tax-2.1', 'tax-2.1a', 'tax-2.1b', 'tax-3', 'tax-4', 'tax-5', 'tax-6', 'tax-7', 'tax-8', 'tax-9', 'tax-10', 'tax-11']);
    expect(FORMS['tax-4'].columns.length).toBeGreaterThan(20);
  });

  test('labels are Latin and carry no client data', () => {
    const texts = Object.values(FORMS).flatMap((f) => [f.title, ...f.lines.map((l) => l.label), ...f.columns.map((c) => c.label)]);
    expect(texts.filter((t) => /[а-яёўқғҳ]/i.test(t))).toEqual([]);
    expect(texts.filter((t) => /\b\d{9}\b/.test(t))).toEqual([]);
  });

  const line = (id: keyof typeof FORMS, code: string) => FORMS[id].lines.find((l) => l.code === code)!;

  test('annex totals have formulas', () => {
    expect(line('tax-1', '010').formula).toMatch(/^020 \+ 050 \+ 060 .* \+ 280$/);
    expect(line('tax-2', '010').formula).toBe('020 + 030');
    expect(line('b1', '400').formula).toBe('130 + 390');
    expect(line('f2-budget', '480').formula).not.toMatch(/291/);
  });

  test('the main sheet pulls from its annexes', () => {
    expect(line('tax', '010').formula).toBe('{tax-1:010} - {tax-1:052} - {tax-1:060} - {tax-1:120} - {tax-1:131}');
    expect(line('tax', '061').formula).toBe('{tax-4:010:19} - {tax-4:010:22}');
    expect(line('tax', '150').formula).toContain('{tax-10:090}');
    expect(line('tax', '070')).toMatchObject({ rate: true });
    expect(line('f2', '030').formula).toEqual({ '3': 'max0(010:3 - 020:4)', '4': 'max0(-(010:3 - 020:4))', '5': 'max0(010:5 - 020:6)', '6': 'max0(-(010:5 - 020:6))' });
  });

  test('a form refers only to forms of its own group, so a group can be worked out alone', () => {
    for (const id of FORM_IDS)
      for (const l of FORMS[id].lines)
        for (const f of typeof l.formula === 'string' ? [l.formula] : Object.values(l.formula ?? {}))
          for (const [, other] of f.matchAll(/\{([^:}]+):/g)) expect(FORMS[other as keyof typeof FORMS].group, `${id} → ${other}`).toBe(FORMS[id].group);
  });

  test('every cross-form reference names a form and line that exist', () => {
    const refs = Object.values(FORMS).flatMap((f) =>
      f.lines.flatMap((l) => (typeof l.formula === 'string' ? [l.formula] : Object.values(l.formula ?? {}))).flatMap((x) => [...x.matchAll(/\{([^:}]+):(\d+)(?::(\d+))?\}/g)]),
    );
    expect(refs.length).toBeGreaterThan(20);
    for (const [, form, code, col] of refs) {
      expect(FORM_IDS, form).toContain(form);
      expect(codes(form as keyof typeof FORMS), `${form}:${code}`).toContain(code);
      if (col) expect(FORMS[form as keyof typeof FORMS].columns.map((c) => c.id), `${form}:${code}:${col}`).toContain(col);
    }
  });

  test('share columns are rates, money columns are not', () => {
    expect(FORMS['tax-6'].columns.find((c) => c.id === '4')!.rate).toBe(true);
    expect(FORMS['tax-6'].columns.find((c) => c.id === '3')!.rate).toBeUndefined();
  });

  test('overdue debts annex: debtor and creditor sections with named rows', () => {
    const f = FORMS['b1-overdue'];
    expect(f.columns.map((c) => c.id)).toEqual(['3', '4', '5', '6', '7', '8']);
    expect(f.sections!.map((s) => s.num)).toEqual(['1', '2', '2.2', '3', '4', '5', '5.2', '6']);
    expect(f.sections!.find((s) => s.num === '1')!.sum).toEqual(['d-in', 'd-out']);
  });

  test('no Russian left from the templates, no doubled apostrophes', () => {
    const texts = Object.values(FORMS).flatMap((f) => f.lines.map((l) => l.label));
    expect(texts.filter((x) => /Dolgosroch|Nematerial|ʻ’|''/.test(x))).toEqual([]);
    expect(line('b1', '050').label).toMatch(/^Shoʻba/);
  });

  test('a number typed in the template name column is not kept as a line name', () => {
    expect(line('tax-1', '021')).toMatchObject({ label: '', cells: { '3': 'input' } });
  });

  test('the Cyrillic toggle reads the Latin labels back', () => {
    const l = FORMS['tax'].lines.find((x) => x.code === '030')!;
    expect(toCyrillic(l.label)).toMatch(/Солиқ солинадиган фойда/);
  });
});
