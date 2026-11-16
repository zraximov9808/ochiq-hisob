import { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n/useT';

/** Excel-style filter on product names: search, "all" and a tick per product. `null` means every product. */
export function ProductFilter({
  options,
  selected,
  onChange,
}: {
  options: Array<{ key: string; name: string }>;
  selected: Set<string> | null;
  onChange: (sel: Set<string> | null) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const shown = options.filter((o) => o.name.toLowerCase().includes(q.trim().toLowerCase()));
  const isOn = (k: string) => !selected || selected.has(k);
  const commit = (next: Set<string>) => onChange(next.size === options.length ? null : next);
  const toggle = (k: string) => {
    const next = new Set(selected ?? options.map((o) => o.key));
    if (next.has(k)) next.delete(k);
    else next.add(k);
    commit(next);
  };
  const allShownOn = shown.length > 0 && shown.every((o) => isOn(o.key));
  const toggleShown = () => {
    const next = new Set(selected ?? options.map((o) => o.key));
    for (const o of shown) {
      if (allShownOn) next.delete(o.key);
      else next.add(o.key);
    }
    commit(next);
  };

  return (
    <div className="pfilter" ref={box}>
      <button className={`btn ${selected ? 'primary' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open}>
        {t('Tovar nomi')} ▾ ({selected ? selected.size : options.length}/{options.length})
      </button>
      {open && (
        <div className="pfilter-pop card">
          <input className="input" autoFocus placeholder={t('Qidirish: tovar nomi')} value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="pfilter-item">
            <input type="checkbox" checked={allShownOn} onChange={toggleShown} /> <b>{q ? t('Topilganlarning hammasi') : t('Hammasi')}</b>
          </label>
          <div className="pfilter-list">
            {shown.map((o) => (
              <label key={o.key} className="pfilter-item">
                <input type="checkbox" checked={isOn(o.key)} onChange={() => toggle(o.key)} /> {o.name}
              </label>
            ))}
            {!shown.length && <div className="muted small">{t('Topilmadi')}</div>}
          </div>
          <div className="toolbar">
            <button className="btn small" onClick={() => onChange(null)}>
              {t('Filtrni tozalash')}
            </button>
            <button className="btn small primary" onClick={() => setOpen(false)}>
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
