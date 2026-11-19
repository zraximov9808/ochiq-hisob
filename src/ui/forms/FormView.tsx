import { useEffect, useState, type ReactNode } from 'react';
import { formatAmount, parseAmount, type Unit } from '../../engine/money';
import { headerRows } from '../../forms/layout';
import type { FormDef, LineDef } from '../../forms/types';
import type { Cell, FormValues } from '../../forms/values';
import { useT } from '../../i18n/useT';

export interface FormViewProps {
  def: FormDef;
  values: FormValues;
  /** Money unit the form is shown and typed in. */
  unit: Unit;
  names: Record<string, string>;
  onValue: (line: string, col: string, v: number | null) => void;
  onName: (line: string, name: string) => void;
  /** Lines whose label opens the accounts or entries behind them. */
  onDrill?: (line: string) => void;
  canDrill?: (line: string) => boolean;
  isRate: (line: string, col: string) => boolean;
}

const rateText = (v: number) => `${(v / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}`;

function show(v: number | null, rate: boolean, unit: Unit, blankZero: boolean): string {
  if (v === null || (blankZero && v === 0)) return '';
  return rate ? rateText(v) : formatAmount(v, unit);
}

/** A typed-in cell: shows the value in the form's unit; empty clears what was typed (the books' value comes back). */
function CellInput({ value, rate, unit, onCommit }: { value: number | null; rate: boolean; unit: Unit; onCommit: (v: number | null) => void }) {
  const shown = show(value, rate, unit, true);
  const [text, setText] = useState(shown);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(shown);
  }, [shown, editing]);
  const parsed = text.trim() === '' ? null : parseAmount(text.replace('%', '').trim());
  const bad = text.trim() !== '' && parsed === null;
  const commit = () => {
    setEditing(false);
    if (text.trim() === shown) return;
    if (text.trim() === '') return onCommit(null);
    if (parsed === null) return setText(shown);
    const v = rate ? parsed : unit === 'ming' ? parsed * 1000 : parsed;
    if (v !== value) onCommit(v);
  };
  return (
    <input
      className={`input num ${bad ? 'bad' : ''}`}
      inputMode="decimal"
      value={text}
      onFocus={() => setEditing(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setText(shown);
          setEditing(false);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

function NameInput({ value, placeholder, onCommit }: { value: string; placeholder: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return <input className="input" value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onBlur={() => text.trim() !== value && onCommit(text)} />;
}

export function FormCell({ cell, rate, unit, onChange }: { cell: Cell; rate: boolean; unit: Unit; onChange: (v: number | null) => void }) {
  const t = useT();
  if (cell.closed) return <td className="x">x</td>;
  if (cell.computed) return <td className={`calc ${cell.v ? '' : 'zero'}`}>{show(cell.v, rate, unit, false)}</td>;
  const kind = cell.overridden ? 'over' : cell.auto ? 'auto' : cell.v !== null ? 'manual' : '';
  const title = cell.overridden ? t('Qo‘lda o‘zgartirilgan') : cell.auto ? t('Hisobdan avtomatik') : undefined;
  return (
    <td className={`in ${kind}`} title={title}>
      <CellInput value={cell.v} rate={rate} unit={unit} onCommit={onChange} />
      {cell.overridden && (
        <button className="reset" title={t('↺ avtomatik qiymatga qaytarish')} onClick={() => onChange(null)}>
          ↺
        </button>
      )}
    </td>
  );
}

export function FormHead({ def, first, second }: { def: FormDef; first: string; second: string }) {
  const t = useT();
  const rows = headerRows(def.columns);
  return (
    <thead>
      {rows.map((row, k) => (
        <tr key={k}>
          {k === 0 && (
            <>
              <th rowSpan={rows.length}>{t(first)}</th>
              <th rowSpan={rows.length}>{t(second)}</th>
            </>
          )}
          {row.map((c) => (
            <th key={c.key} colSpan={c.colSpan} rowSpan={c.rowSpan}>
              {t(c.text)}
            </th>
          ))}
        </tr>
      ))}
      <tr className="nums">
        <th>1</th>
        <th>2</th>
        {def.columns.map((c) => (
          <th key={c.id}>{def.colFormulas[c.id] ? `${c.num}=${def.colFormulas[c.id].replace(/\s+/g, '')}` : c.num}</th>
        ))}
      </tr>
    </thead>
  );
}

/** "shu jumladan", "ulardan" and other lower-case labels sit under the line above. */
const isSub = (l: LineDef) => /^[a-zа-яёўқғҳ]/.test(l.label);

/** One official form (not the overdue-debts annex): label, line code and the form's columns. */
export function FormView(p: FormViewProps) {
  const t = useT();
  const { def, values } = p;
  const span = def.columns.length + 2;
  return (
    <table className="oform">
      <FormHead def={def} first="Ko‘rsatkichlar nomi" second="Satr kodi" />
      <tbody>
        {def.lines.map((l, i) => {
          if (!l.code)
            return (
              <tr key={`h${i}`} className="hdr">
                <td colSpan={span}>{t(l.label)}</td>
              </tr>
            );
          const code = l.code;
          const cells = def.columns.map((c) => values[code]?.[c.id] ?? { v: null, auto: false });
          const total = cells.some((c) => c.computed) && cells.every((c) => c.computed || c.closed);
          let label: ReactNode = t(l.label);
          if (!l.label) label = <NameInput value={p.names[code] ?? ''} placeholder={t('nomini yozing')} onCommit={(v) => p.onName(code, v)} />;
          else if (p.onDrill && p.canDrill?.(code))
            label = (
              <button className="link" onClick={() => p.onDrill!(code)} title={t('Qaysi hisobvaraq yoki provodkalardan tuzilganini ko‘rish')}>
                {t(l.label)}
              </button>
            );
          return (
            <tr key={code} className={`${total ? 'total' : ''} ${isSub(l) ? 'sub' : ''}`}>
              <td className="lbl">{label}</td>
              <td className="code">{code}</td>
              {def.columns.map((c, k) => (
                <FormCell key={c.id} cell={cells[k]} rate={p.isRate(code, c.id)} unit={p.unit} onChange={(v) => p.onValue(code, c.id, v)} />
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Overdue debts annex: debtor and creditor sections, each with rows the filer names. */
export function OverdueView(p: FormViewProps & { onAddRow: (section: string) => void; onRemoveRow: (row: string) => void }) {
  const t = useT();
  const { def, values } = p;
  const span = def.columns.length + 2;
  const rowsOf = (sid: string) =>
    [...new Set([...Object.keys(values), ...Object.keys(p.names)].filter((k) => k.startsWith(`${sid}.`)))].sort(
      (a, b) => Number(a.slice(sid.length + 1)) - Number(b.slice(sid.length + 1)),
    );
  const sections = def.sections ?? [];
  const out: ReactNode[] = [];
  sections.forEach((s, i) => {
    const debtor = s.id.startsWith('d');
    if (i === 0 || sections[i - 1].id[0] !== s.id[0])
      out.push(
        <tr key={`h-${s.id}`} className="hdr">
          <td colSpan={span}>{t(def.lines[debtor ? 0 : 1]?.label ?? '')}</td>
        </tr>,
      );
    out.push(
      <tr key={s.id} className="total">
        <td className="code">{s.num}</td>
        <td className="lbl">{t(s.label)}</td>
        {def.columns.map((c) => (
          <FormCell key={c.id} cell={values[s.id]?.[c.id] ?? { v: null, auto: false, computed: true }} rate={false} unit={p.unit} onChange={() => undefined} />
        ))}
      </tr>,
    );
    if (!s.rows) return;
    rowsOf(s.id).forEach((row, k) => {
      out.push(
        <tr key={row} className="sub">
          <td className="code">
            {s.num}.{k + 1}
          </td>
          <td className="lbl">
            <div className="name-row">
              <NameInput value={p.names[row] ?? ''} placeholder={t(debtor ? 'debitor nomi' : 'kreditor nomi')} onCommit={(v) => p.onName(row, v)} />
              <button className="btn ghost small" title={t('Qatorni o‘chirish')} onClick={() => p.onRemoveRow(row)}>
                ✕
              </button>
            </div>
          </td>
          {def.columns.map((c) => (
            <FormCell key={c.id} cell={values[row]?.[c.id] ?? { v: null, auto: false }} rate={false} unit={p.unit} onChange={(v) => p.onValue(row, c.id, v)} />
          ))}
        </tr>,
      );
    });
    out.push(
      <tr key={`add-${s.id}`} className="addrow">
        <td />
        <td colSpan={span - 1}>
          <button className="btn small" onClick={() => p.onAddRow(s.id)}>
            + {t(debtor ? 'debitor qo‘shish' : 'kreditor qo‘shish')}
          </button>
        </td>
      </tr>,
    );
  });
  return (
    <table className="oform">
      <FormHead def={def} first="№" second="Muddati o‘tgan qarzdorlikka ega bo‘lgan debitor va kreditorlar ro‘yxati" />
      <tbody>{out}</tbody>
    </table>
  );
}
