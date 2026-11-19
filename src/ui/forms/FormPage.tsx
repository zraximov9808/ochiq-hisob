import { useMemo, useState } from 'react';
import type { Unit } from '../../engine/money';
import { formatDate, periodRange, type Quarter } from '../../engine/period';
import { TAX_LINES } from '../../engine/taxLines';
import type { Doc } from '../../engine/types';
import { FORMS, FORM_IDS } from '../../forms/defs';
import { autoAll } from '../../forms/sources';
import type { FormDef, FormGroup, FormId } from '../../forms/types';
import { evaluateAll, formKey, formNames, isRateCell, manualValues, roundToMing, setFormName, setFormValue, type Grid } from '../../forms/values';
import { useT } from '../../i18n/useT';
import { actions, useApp } from '../../store/store';
import { PageHead, toast } from '../components/common';
import { AccountsDrill, DrillModal, EntriesDrill, type Drill } from '../components/drills';
import { useReport } from '../report';
import { FormView, OverdueView } from './FormView';

const PERIOD: Record<Quarter, string> = { 1: 'I chorak', 2: 'yarim yil', 3: '9 oy', 4: 'yillik' };

const TITLES: Record<FormGroup, { title: string; note: string; excel: 'balance' | 'income' | 'tax'; excelLabel: string }> = {
  balance: {
    title: 'Buxgalteriya balansi (1-shakl) va ilovalari',
    note: 'Qiymatlar provodkalar va qoldiqlardan avtomatik to‘ladi; oq kataklarga qo‘lda yozish mumkin, jami satrlar formula bo‘yicha. Satr nomini bossangiz, qaysi hisobvaraqlardan tuzilgani ko‘rinadi.',
    excel: 'balance',
    excelLabel: '1-shaklni yuklab olish (.xlsx)',
  },
  income: {
    title: 'Moliyaviy natijalar to‘g‘risida hisobot (2-shakl) va ilovasi',
    note: 'Daromad va xarajatlar davr aylanmalaridan, byudjetga to‘lovlar soliq hisobvaraqlaridan (hisoblangan — kredit, to‘langan — bank orqali debet) olinadi. Foyda daromad ustuniga, zarar xarajat ustuniga tushadi.',
    excel: 'income',
    excelLabel: '2-shaklni yuklab olish (.xlsx)',
  },
  tax: {
    title: 'Foyda solig‘i hisob-kitobi va ilovalari',
    note: 'So‘mda, o‘sib boruvchi tartibda. 1- va 2-ilovalar jurnaldagi soliq belgilaridan to‘ladi, asosiy shakl ilovalardan formula bo‘yicha hisoblanadi; 3–11-ilovalarni qo‘lda to‘ldiring.',
    excel: 'tax',
    excelLabel: 'Hisob-kitobni yuklab olish (.xlsx)',
  },
};

/** The form header from the company card; empty fields stay empty, as the user asked. */
function FormHeader({ def, doc, quarter, unit }: { def: FormDef; doc: Doc; quarter: Quarter; unit: Unit }) {
  const t = useT();
  const c = doc.company;
  const codes = c.codes ?? {};
  const full = def.id === 'b1' || def.id === 'f2';
  const { to } = periodRange(doc.year, quarter);
  const card: Array<[string, string | undefined]> = [
    ['Korxona, tashkilot', c.name],
    ['Faoliyat turi', c.industry],
    ['Tashkiliy-huquqiy shakli', c.legalForm],
    ['Mulkchilik shakli', c.ownership],
    ['Vazirlik, idora, xo‘jalik birlashmasi', c.ministry],
    ['Hudud', c.region],
    ['Manzil', c.address],
  ];
  const codeRow: Array<[string, string | undefined]> = [
    ['STIR', c.stir],
    ['KTUT', codes.ktut],
    ['IFUT', codes.ifut],
    ['TXSHT', codes.txsht],
    ['MShT', codes.msht],
    ['DBIBT', codes.dbibt],
    ['MHOBT', codes.mxobt],
  ];
  return (
    <div className="form-head">
      {full ? (
        <div className="form-card-wrap">
          <table className="form-card">
            <tbody>
              {card.map(([k, v]) => (
                <tr key={k}>
                  <td>{t(k)}</td>
                  <td>{v || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="form-card codes">
            <tbody>
              {codeRow.map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td>{v || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="form-unit">
          {c.name && <b>{c.name}</b>} {t('STIR')}: {c.stir || '—'}
        </div>
      )}
      <div className="form-title">{t(def.title)}</div>
      <div className="form-unit">
        {def.group === 'balance' ? `${formatDate(to)} ${t('holatiga')}` : `${doc.year}-${t('yil')}, ${t(PERIOD[quarter])}`} · {t('O‘lchov birligi')}: {t(unit === 'ming' ? 'ming so‘m' : 'so‘m')}
      </div>
    </div>
  );
}

function ExportButton({ kind, label }: { kind: 'balance' | 'income' | 'tax'; label: string }) {
  const t = useT();
  const { h, ui } = useApp();
  const r = useReport();
  const run = async () => {
    try {
      const x = await import('../../excel/exportForms');
      await x.exportForm(kind, h.doc, ui.quarter, r);
    } catch (e) {
      toast(`Excel yaratilmadi: ${(e as Error).message}`);
    }
  };
  return (
    <button className="btn primary" onClick={run}>
      {t(label)}
    </button>
  );
}

/** Balance, 2-shakl or profit tax with their annexes, laid out as the official forms. */
export function FormPage({ group }: { group: FormGroup }) {
  const t = useT();
  const { h, ui } = useApp();
  const report = useReport();
  const doc = h.doc;
  const ids = useMemo(() => FORM_IDS.filter((id) => FORMS[id].group === group), [group]);
  const [id, setId] = useState<FormId>(ids[0]);
  const [drill, setDrill] = useState<Drill>(null);
  const def = FORMS[id];
  const unit: Unit = group === 'tax' ? 'som' : ui.unit;

  const all = useMemo(() => {
    const auto = autoAll(doc, ui.quarter, report);
    const manual: Partial<Record<FormId, Grid>> = {};
    for (const f of FORM_IDS) {
      manual[f] = manualValues(doc, f, ui.quarter);
      // forms 1 and 2 are filed in ming so'm: lines are rounded first, totals add the rounded lines
      if (ui.unit === 'ming' && FORMS[f].group !== 'tax') {
        auto[f] = roundToMing(f, auto[f] ?? {});
        manual[f] = roundToMing(f, manual[f]!);
      }
    }
    return evaluateAll(auto, manual);
  }, [doc, ui.quarter, ui.unit, report]);

  const manual = manualValues(doc, id, ui.quarter);
  const names = formNames(doc, id, ui.quarter);
  const typed = (f: FormId) => Object.keys(manualValues(doc, f, ui.quarter)).length + Object.keys(formNames(doc, f, ui.quarter)).length;

  const onValue = (line: string, col: string, v: number | null) => {
    if (v === null && manual[line]?.[col] === undefined) return;
    actions.update((d) => setFormValue(d, id, ui.quarter, line, col, v));
  };
  const onName = (line: string, name: string) => {
    if ((names[line] ?? '') === name.trim()) return;
    actions.update((d) => setFormName(d, id, ui.quarter, line, name));
  };
  const onAddRow = (section: string) => {
    const used = [...Object.keys(manual), ...Object.keys(names)].filter((k) => k.startsWith(`${section}.`)).map((k) => Number(k.slice(section.length + 1)));
    const row = `${section}.${Math.max(0, ...used) + 1}`;
    actions.update((d) => setFormValue(d, id, ui.quarter, row, '3', 0));
  };
  const onRemoveRow = (row: string) =>
    actions.update((d) => {
      for (const c of def.columns) setFormValue(d, id, ui.quarter, row, c.id, null);
      setFormName(d, id, ui.quarter, row, '');
    });
  const clearTyped = () => {
    if (!confirm(t('Bu shaklga shu davr uchun qo‘lda kiritilgan barcha qiymatlar o‘chiriladi. Davom etasizmi?'))) return;
    actions.update((d) => {
      delete d.forms?.[formKey(id, ui.quarter)];
      delete d.formNames?.[formKey(id, ui.quarter)];
    });
  };

  const incomeIds = TAX_LINES.filter((l) => l.annex === 1).map((l) => l.id);
  const expenseIds = TAX_LINES.filter((l) => l.annex === 2).map((l) => l.id);
  const entriesOf = (lineIds: string[]) => lineIds.filter((x) => report.tax.sources[x]?.length);
  const canDrill = (line: string) => {
    if (id === 'b1') return !!report.balance.contrib[line]?.length;
    if (id === 'f2') return !!report.income.contrib[line]?.length;
    if (id === 'tax-1' && line === '010') return entriesOf(incomeIds).length > 0;
    if (id === 'tax-2' && line === '010') return entriesOf(expenseIds).length > 0;
    return false;
  };
  const onDrill = (line: string) => {
    const label = t(def.lines.find((l) => l.code === line)?.label ?? '');
    if (id === 'b1' || id === 'f2') {
      const rows = id === 'b1' ? report.balance.contrib[line] : report.income.contrib[line];
      setDrill({ title: `${line}: ${label}`, body: <AccountsDrill rows={rows ?? []} unit={unit} /> });
      return;
    }
    const lineIds = entriesOf(id === 'tax-1' ? incomeIds : expenseIds);
    setDrill({
      title: `${line}: ${label}`,
      body: (
        <>
          {lineIds.map((x) => (
            <div key={x} style={{ marginBottom: 14 }}>
              <b>{t(TAX_LINES.find((l) => l.id === x)!.label)}</b>
              <EntriesDrill entries={report.tax.sources[x]} lineId={x} />
            </div>
          ))}
        </>
      ),
    });
  };

  const meta = TITLES[group];
  const viewProps = {
    def,
    values: all[id],
    unit,
    names,
    onValue,
    onName,
    onDrill,
    canDrill,
    isRate: (line: string, col: string) => isRateCell(id, line, col),
  };
  return (
    <div className="page">
      <PageHead title={meta.title}>{t(meta.note)}</PageHead>
      <div className="toolbar">
        <ExportButton kind={meta.excel} label={meta.excelLabel} />
        {typed(id) > 0 && (
          <button className="btn" onClick={clearTyped}>
            {t('Qo‘lda kiritilganlarni tozalash')}
          </button>
        )}
      </div>
      <div className="form-layout">
        <nav className="form-list card" aria-label={t('Shakl va ilovalar')}>
          {ids.map((f) => (
            <button key={f} className={f === id ? 'on' : ''} onClick={() => setId(f)}>
              <span>{t(FORMS[f].short)}</span>
              {typed(f) > 0 && <span className="has" title={t('Qo‘lda kiritilgan qiymatlar bor')} />}
            </button>
          ))}
        </nav>
        <div className="form-sheet card">
          <FormHeader def={def} doc={doc} quarter={ui.quarter} unit={unit} />
          <div className="table-wrap">{def.sections ? <OverdueView {...viewProps} onAddRow={onAddRow} onRemoveRow={onRemoveRow} /> : <FormView {...viewProps} />}</div>
          <div className="form-legend">
            <span>
              <i className="lg auto" />
              {t('hisobdan avtomatik')}
            </span>
            <span>
              <i className="lg manual" />
              {t('qo‘lda kiritilgan')}
            </span>
            <span>
              <i className="lg over" />
              {t('avtomatik qiymat o‘zgartirilgan (↺ — qaytarish)')}
            </span>
            <span>
              <i className="lg calc" />
              {t('formula bo‘yicha')}
            </span>
            <span>
              <i className="lg x" />
              {t('x — to‘ldirilmaydi')}
            </span>
          </div>
        </div>
      </div>
      {drill && <DrillModal drill={drill} onClose={() => setDrill(null)} />}
    </div>
  );
}
