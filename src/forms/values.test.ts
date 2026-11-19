import { describe, expect, test } from 'vitest';
import { emptyDoc } from '../engine/types';
import { parseDocFile, serializeDoc } from '../store/docFile';
import { FORMS, FORM_IDS } from './defs';
import { evaluate, evaluateAll, formKey, manualValues, parseFormula, setFormName, setFormValue } from './values';

const SOM = 100;

describe('form values', () => {
  test('manual value wins over auto and is marked overridden', () => {
    const v = evaluate(FORMS.b1, { '010': { '4': 1000 * SOM }, '011': { '4': 300 * SOM } }, { '010': { '4': 1500 * SOM } });
    expect(v['010']['4']).toEqual({ v: 1500 * SOM, auto: false, overridden: true });
    expect(v['011']['4']).toEqual({ v: 300 * SOM, auto: true });
    expect(v['012']['4']).toMatchObject({ v: 1200 * SOM, computed: true });
  });

  test('totals follow formulas', () => {
    const v = evaluate(FORMS['tax-2'], { '030': { '3': 200 * SOM } }, { '020': { '3': 500 * SOM } });
    expect(v['010']['3'].v).toBe(700 * SOM);
    expect(v['010']['4'].v).toBe(0);
  });

  test('closed cells hold nothing, empty input cells are null', () => {
    const v = evaluate(FORMS['tax-6'], {}, {});
    expect(v['020']['4']).toEqual({ v: null, auto: false, closed: true });
    expect(v['051']['3']).toEqual({ v: null, auto: false });
  });

  test('the main tax sheet adds up its annexes at the rate given', () => {
    const all = evaluateAll({ tax: { '070': { '3': 15 * SOM } } }, { 'tax-1': { '021': { '3': 10_000 * SOM } }, 'tax-2': { '020': { '3': 4_000 * SOM } } });
    expect(all['tax-1']['010']['3'].v).toBe(10_000 * SOM);
    expect(all.tax['010']['3'].v).toBe(10_000 * SOM);
    expect(all.tax['020']['3'].v).toBe(4_000 * SOM);
    expect(all.tax['030']['3'].v).toBe(6_000 * SOM);
    expect(all.tax['070']['3'].v).toBe(15 * SOM);
    expect(all.tax['080']['3'].v).toBe(900 * SOM);
    expect(all.tax['150']['3'].v).toBe(900 * SOM);
  });

  test('a loss gives no tax and moves to annex 8', () => {
    const all = evaluateAll({ tax: { '070': { '3': 15 * SOM } } }, { 'tax-1': { '021': { '3': 1_000 * SOM } }, 'tax-2': { '020': { '3': 4_000 * SOM } } });
    expect(all.tax['060']['3'].v).toBe(0);
    expect(all.tax['080']['3'].v).toBe(0);
    expect(all['tax-8']['020']['4'].v).toBe(3_000 * SOM);
  });

  test('shares are percent of the total', () => {
    const all = evaluateAll({}, { 'tax-1': { '021': { '3': 1_000 * SOM } }, 'tax-6': { '011': { '3': 250 * SOM } } });
    expect(all['tax-6']['010']['3'].v).toBe(1_000 * SOM);
    expect(all['tax-6']['011']['4'].v).toBe(25 * SOM);
    expect(all['tax-6']['010']['4'].v).toBe(100 * SOM);
  });

  test('column formulas fill the calculated columns of a line (4-ilova)', () => {
    const v = evaluate(FORMS['tax-4'], {}, { '021': { '3': 100 * SOM, '4': 20 * SOM, '10': 5 * SOM, '13': 30 * SOM } });
    expect(v['021']['11'].v).toBe(115 * SOM);
    expect(v['021']['12'].v).toBe(30 * SOM);
    expect(v['021']['27'].v).toBe(70 * SOM);
    expect(v['010']['11'].v).toBe(115 * SOM);
  });

  test('overdue annex: sections add up their named rows', () => {
    const v = evaluate(FORMS['b1-overdue'], {}, { 'd-in.1': { '3': 10 * SOM }, 'd-in.2': { '3': 5 * SOM }, 'd-dep.1': { '3': 2 * SOM }, 'd-out.1': { '3': 1 * SOM } });
    expect(v['d-in']['3'].v).toBe(17 * SOM);
    expect(v.d['3'].v).toBe(18 * SOM);
    expect(v.c['3'].v).toBe(0);
    expect(v['d-in.2']['3']).toEqual({ v: 5 * SOM, auto: false });
  });

  test('every formula parses and all forms evaluate on an empty document', () => {
    for (const id of FORM_IDS)
      for (const l of FORMS[id].lines)
        for (const f of typeof l.formula === 'string' ? [l.formula] : Object.values(l.formula ?? {})) expect(() => parseFormula(f), `${id}:${l.code} ${f}`).not.toThrow();
    const all = evaluateAll({}, {});
    expect(Object.keys(all)).toEqual(FORM_IDS);
  });

  test('a value for Q2 does not show in Q3', () => {
    const doc = emptyDoc(2026);
    setFormValue(doc, 'tax-2', 2, '020', '3', 500 * SOM);
    expect(formKey('tax-2', 2)).toBe('tax-2:2');
    expect(manualValues(doc, 'tax-2', 2)).toEqual({ '020': { '3': 500 * SOM } });
    expect(manualValues(doc, 'tax-2', 3)).toEqual({});
    setFormValue(doc, 'tax-2', 2, '020', '3', null);
    expect(doc.forms).toEqual({});
  });

  test('named rows keep their names per quarter', () => {
    const doc = emptyDoc(2026);
    setFormName(doc, 'b1-overdue', 4, 'd-in.1', 'Mijoz MChJ');
    expect(doc.formNames).toEqual({ 'b1-overdue:4': { 'd-in.1': 'Mijoz MChJ' } });
    setFormName(doc, 'b1-overdue', 4, 'd-in.1', '');
    expect(doc.formNames).toEqual({});
  });

  test('old files without forms open, and forms survive a save', () => {
    const old = JSON.parse(serializeDoc(emptyDoc(2025)));
    delete old.forms;
    delete old.company.codes;
    const doc = parseDocFile(JSON.stringify(old));
    expect(manualValues(doc, 'tax', 4)).toEqual({});
    expect(doc.company.codes).toEqual({});
    setFormValue(doc, 'tax', 4, '090', '3', 7 * SOM);
    doc.company.region = 'Toshkent sh.';
    const back = parseDocFile(serializeDoc(doc));
    expect(manualValues(back, 'tax', 4)).toEqual({ '090': { '3': 7 * SOM } });
    expect(back.company.region).toBe('Toshkent sh.');
  });
});
