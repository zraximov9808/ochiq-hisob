import { useEffect, useState, type ReactNode } from 'react';
import { CHART, findAccount, isChartCode, isKnownAccount } from '../../engine/accounts';
import { formatAmount, parseAmount, type Unit } from '../../engine/money';
import type { SubAccount } from '../../engine/types';
import { useT } from '../../i18n/useT';
import { useApp } from '../../store/store';

/** Money cell: tiyin → text in the chosen unit; negatives in red. */
export function Num({ v, unit, blankZero }: { v: number | undefined; unit?: Unit; blankZero?: boolean }) {
  const { ui } = useApp();
  if (v === undefined || (blankZero && v === 0)) return null;
  const text = formatAmount(v, unit ?? ui.unit);
  return <span className={v < 0 ? 'neg' : undefined}>{text}</span>;
}

/** Text input for money: accepts "5 000 000,50", shows grouped digits after editing. */
export function AmountInput(props: {
  value: number;
  onChange: (tiyin: number) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
  className?: string;
  id?: string;
  /** Report the value only on blur/Enter (one undo step per edit instead of per keystroke). */
  lazy?: boolean;
}) {
  const [text, setText] = useState(props.value ? formatAmount(props.value, 'som') : '');
  const commit = () => {
    const v = parseAmount(text);
    if (v !== null) {
      setText(v ? formatAmount(v, 'som') : '');
      if (props.lazy && v !== props.value) props.onChange(v);
    } else if (props.lazy && text.trim() === '' && props.value !== 0) props.onChange(0);
  };
  useEffect(() => {
    const parsed = parseAmount(text);
    if ((parsed ?? 0) !== props.value) setText(props.value ? formatAmount(props.value, 'som') : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.value]);
  const bad = text.trim() !== '' && parseAmount(text) === null;
  return (
    <input
      id={props.id}
      className={`input num ${bad ? 'bad' : ''} ${props.className ?? ''}`}
      inputMode="decimal"
      value={text}
      placeholder={props.placeholder ?? '0'}
      autoFocus={props.autoFocus}
      onChange={(e) => {
        setText(e.target.value);
        if (!props.lazy) props.onChange(parseAmount(e.target.value) ?? 0);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit();
          props.onEnter?.();
        }
      }}
    />
  );
}

/** One <datalist> for all account inputs: chart accounts and subaccounts. */
export function AccountDatalist({ subaccounts }: { subaccounts: SubAccount[] }) {
  const t = useT();
  return (
    <datalist id="accounts-list">
      {subaccounts.map((s) => (
        <option key={s.code} value={s.code}>
          {s.name}
        </option>
      ))}
      {CHART.filter((a) => !a.group).map((a) => (
        <option key={a.code} value={a.code}>
          {`${t(a.name)} · ${a.nameRu}`}
        </option>
      ))}
    </datalist>
  );
}

export function AccountInput(props: {
  value: string;
  onChange: (code: string) => void;
  side?: 'dt' | 'kt';
  placeholder?: string;
  onEnter?: () => void;
  id?: string;
}) {
  const { h } = useApp();
  const bad = props.value.trim() !== '' && !isKnownAccount(props.value, h.doc.subaccounts);
  return (
    <input
      id={props.id}
      className={`input ${props.side ?? ''} ${bad ? 'bad' : ''}`}
      list="accounts-list"
      value={props.value}
      placeholder={props.placeholder}
      onChange={(e) => props.onChange(e.target.value.replace(/[^\d.]/g, ''))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') props.onEnter?.();
      }}
    />
  );
}

export function AccountLabel({ code }: { code: string }) {
  const t = useT();
  const { h } = useApp();
  const acc = findAccount(code, h.doc.subaccounts);
  if (!code.trim()) return null;
  if (!acc) return <span className="err-text">{t('Bunday hisobvaraq yo‘q')}</span>;
  return <>{isChartCode(code) ? t(acc.name) : acc.name}</>;
}

export function Modal(props: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={props.title} style={props.wide ? { width: 'min(1100px, 100%)' } : undefined}>
        <div className="modal-head">
          <h2>{props.title}</h2>
        </div>
        <div className="modal-body">{props.children}</div>
        <div className="modal-foot">{props.footer}</div>
      </div>
    </div>
  );
}

let toastSetter: ((msg: string | null) => void) | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function toast(msg: string) {
  toastSetter?.(msg);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastSetter?.(null), 3200);
}

export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  const t = useT();
  useEffect(() => {
    toastSetter = setMsg;
    return () => {
      toastSetter = null;
    };
  }, []);
  return msg ? (
    <div className="toast" role="status">
      {t(msg)}
    </div>
  ) : null;
}

export function PageHead({ title, children }: { title: string; children?: ReactNode }) {
  const t = useT();
  return (
    <div className="page-head">
      <h1>{t(title)}</h1>
      {children && <p>{children}</p>}
    </div>
  );
}
