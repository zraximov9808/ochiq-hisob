import { useState } from 'react';
import { makeClosingEntries } from '../../engine/closing';
import type { Quarter } from '../../engine/period';
import { emptyDoc } from '../../engine/types';
import { uid } from '../../engine/uid';
import { useT } from '../../i18n/useT';
import { forgetFileHandle, openDocFile, saveDocToFile } from '../../store/fileIO';
import { actions, getState, isDirty, useApp, type PageId } from '../../store/store';
import { useReport } from '../report';
import { Modal, Num, toast } from './common';

const NAV: Array<{ group?: string; id: PageId; num?: string; label: string }> = [
  { group: 'Kiritish', id: 'opening', num: '1', label: 'Yil boshidagi qoldiqlar' },
  { id: 'journal', num: '2', label: 'Provodkalar jurnali' },
  { id: 'auto', num: 'H', label: 'Hujjatlardan provodka' },
  { id: 'subaccounts', num: 'S', label: 'Subschyotlar' },
  { group: 'Hisobotlar', id: 'balance', num: '3', label: 'Balans (1-shakl)' },
  { id: 'income', num: '4', label: 'Moliyaviy natijalar (2-shakl)' },
  { id: 'tax', num: '5', label: 'Foyda solig‘i' },
  { id: 'trial', num: 'A', label: 'Aylanma-saldo' },
  { group: 'Bank', id: 'bank', num: 'B', label: 'Bank vipiska' },
  { id: 'audit', num: 'E', label: 'Ekspres audit' },
  { id: 'ombor', num: 'O', label: 'Ombor' },
  { group: 'Boshqa', id: 'settings', num: '⚙', label: 'Sozlamalar' },
  { id: 'help', num: '?', label: 'Yo‘riqnoma' },
];

export function SideNav() {
  const t = useT();
  const { ui, h } = useApp();
  return (
    <aside className="side">
      <div className="brand">
        <div className="brand-mark">OH</div>
        <div>
          <div className="brand-name">Ochiq Hisob</div>
          <div className="brand-sub">{t('provodkadan hisobotgacha')}</div>
        </div>
      </div>
      <nav className="nav">
        {NAV.map((n) => (
          <div key={n.id} style={{ display: 'contents' }}>
            {n.group && <div className="nav-group">{t(n.group)}</div>}
            <button className={ui.page === n.id ? 'active' : ''} onClick={() => actions.setUi({ page: n.id })}>
              <span className="num">{n.num}</span>
              {t(n.label)}
            </button>
          </div>
        ))}
      </nav>
      <div className="side-foot">
        <div>{h.doc.company.name || t('Korxona nomi kiritilmagan')}</div>
        <div>
          {h.doc.year}-{t('yil')} · {t('bepul va ochiq')}
        </div>
      </div>
    </aside>
  );
}

const QUARTERS: Array<[Quarter, string]> = [
  [1, 'I chorak'],
  [2, 'Yarim yil'],
  [3, '9 oy'],
  [4, 'Yillik'],
];

export function TopBar({ onExcel }: { onExcel: (kind: 'all' | 'forms' | 'import') => void }) {
  const t = useT();
  const { ui, h } = useApp();
  const [newOpen, setNewOpen] = useState(false);
  const dirty = isDirty();

  const save = async (saveAs = false) => {
    try {
      const name = await saveDocToFile(getState().h.doc, saveAs);
      if (name) {
        actions.markSaved(name);
        toast(`Saqlandi: ${name}`);
      }
    } catch (e) {
      toast(`Saqlab bo‘lmadi: ${(e as Error).message}`);
    }
  };
  const open = async () => {
    if (isDirty() && !confirm(t('Saqlanmagan o‘zgarishlar yo‘qoladi. Davom etasizmi?'))) return;
    try {
      const r = await openDocFile();
      if (r) {
        actions.replaceDoc(r.doc, r.name);
        toast(`Ochildi: ${r.name}`);
      }
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <header className="topbar">
      <div className="group">
        <b>{h.doc.year}</b>
        <div className="seg" role="group" aria-label={t('Davr')}>
          {QUARTERS.map(([q, label]) => (
            <button key={q} className={ui.quarter === q ? 'on' : ''} onClick={() => actions.setUi({ quarter: q })}>
              {t(label)}
            </button>
          ))}
        </div>
      </div>
      <div className="seg" role="group" aria-label={t('Birlik')}>
        <button className={ui.unit === 'ming' ? 'on' : ''} onClick={() => actions.setUi({ unit: 'ming' })}>
          {t('ming so‘m')}
        </button>
        <button className={ui.unit === 'som' ? 'on' : ''} onClick={() => actions.setUi({ unit: 'som' })}>
          {t('so‘m')}
        </button>
      </div>
      <div className="seg" role="group" aria-label="Alifbo">
        <button className={ui.script === 'lat' ? 'on' : ''} onClick={() => actions.setUi({ script: 'lat' })}>
          Lotin
        </button>
        <button className={ui.script === 'cyr' ? 'on' : ''} onClick={() => actions.setUi({ script: 'cyr' })}>
          Кирилл
        </button>
      </div>
      <div className="group">
        <button className="btn small" title={t('Orqaga (Ctrl+Z)')} disabled={!h.past.length} onClick={actions.undo}>
          ↶
        </button>
        <button className="btn small" title={t('Qaytarish (Ctrl+Y)')} disabled={!h.future.length} onClick={actions.redo}>
          ↷
        </button>
      </div>
      <div className="group">
        <button className="btn small" onClick={() => setNewOpen(true)}>
          {t('Yangi')}
        </button>
        <button className="btn small" onClick={open}>
          {t('Ochish')}
        </button>
        <button className="btn small" onClick={() => save(false)} title={ui.fileName ?? ''}>
          {t('Saqlash')}
        </button>
        {dirty ? <span className="dirty">{t('Faylga saqlanmagan')}</span> : ui.fileName ? <span className="saved-ok">✓ {ui.fileName}</span> : null}
      </div>
      <div className="spacer" />
      <div className="group">
        <button className="btn small" onClick={() => onExcel('import')}>
          {t('Exceldan import')}
        </button>
        <button className="btn small" onClick={() => onExcel('all')}>
          {t('Barcha hisobotlar (Excel)')}
        </button>
        <button className="btn small primary" onClick={() => onExcel('forms')}>
          {t('Rasmiy shakllar (3 ta Excel)')}
        </button>
      </div>
      {newOpen && <NewDocModal onClose={() => setNewOpen(false)} />}
    </header>
  );
}

function NewDocModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { h } = useApp();
  const [year, setYear] = useState(new Date().getFullYear());
  const [name, setName] = useState('');
  const create = () => {
    if (isDirty() && !confirm(t('Saqlanmagan o‘zgarishlar yo‘qoladi. Davom etasizmi?'))) return;
    const doc = emptyDoc(year);
    doc.company = { ...h.doc.company, name: name || h.doc.company.name };
    forgetFileHandle();
    actions.replaceDoc(doc, null);
    actions.setUi({ page: 'opening' });
    onClose();
  };
  return (
    <Modal
      title={t('Yangi fayl')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('Bekor qilish')}
          </button>
          <button className="btn primary" onClick={create}>
            {t('Yaratish')}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <label>{t('Hisobot yili')}</label>
          <input className="input" type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || year)} />
        </div>
        <div className="field">
          <label>{t('Korxona nomi')}</label>
          <input className="input" value={name} placeholder={h.doc.company.name} onChange={(e) => setName(e.target.value)} />
        </div>
      </div>
      <p className="muted small">{t('Korxona rekvizitlari saqlanadi, qoldiqlar va provodkalar bo‘sh holda boshlanadi.')}</p>
    </Modal>
  );
}

export function ChecksPanel() {
  const t = useT();
  const { h } = useApp();
  const r = useReport();
  const applyFix = (entry: NonNullable<(typeof r.checks)[number]['fix']>['entry']) => {
    actions.update((d) => {
      d.entries.push({ id: uid(), ...entry });
    });
    toast('Provodka qo‘shildi');
  };
  const closeYear = () => {
    const entries = makeClosingEntries(getState().h.doc);
    if (!entries.length) return;
    actions.update((d) => {
      d.entries.push(...entries);
    });
    toast(`${entries.length} ta yopish provodkasi qo‘shildi`);
  };
  const allOk = r.checks.every((c) => c.ok);
  return (
    <aside className="panel">
      <div className="card">
        <h3>
          {t('Hisobotlar bog‘liqligi')}{' '}
          <span className={`status-pill ${allOk ? 'ok' : 'bad'}`}>{allOk ? t('hammasi mos') : t('tekshiring')}</span>
        </h3>
        {r.checks.map((c) => (
          <div key={c.id} className={`check ${c.ok ? 'ok' : 'bad'}`}>
            <span className="mark">{c.ok ? '✓' : '!'}</span>
            <div>
              <div className="title">{t(c.title)}</div>
              <div className="detail">{t(c.detail)}</div>
              {!c.ok && c.fix && (
                <button className="btn small" onClick={() => applyFix(c.fix!.entry)}>
                  {t(c.fix.label)}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="card figures">
        <div>
          <span className="code">400</span>
          <span>{t('Balans aktivi')}</span>
          <b>
            <Num v={r.balance.byCode['400'].end} />
          </b>
        </div>
        <div>
          <span className="code">010</span>
          <span>{t('Sof tushum')}</span>
          <b>
            <Num v={r.income.byCode['010']} />
          </b>
        </div>
        <div>
          <span className="code">270</span>
          <span>{t('Sof foyda (zarar)')}</span>
          <b>
            <Num v={r.income.byCode['270']} />
          </b>
        </div>
        <div>
          <span className="code">150</span>
          <span>{t('Foyda solig‘i, so‘m')}</span>
          <b>
            <Num v={r.tax.main['150']} unit="som" />
          </b>
        </div>
        <div>
          <span />
          <span>{t('Provodkalar')}</span>
          <b>{h.doc.entries.length}</b>
        </div>
      </div>
      {r.warnings.length > 0 && (
        <div className="card">
          <h3>{t('Eslatmalar')}</h3>
          <ul className="notes">
            {r.warnings.map((w) => (
              <li key={w.id} className={w.level}>
                {w.level === 'info' ? '✓ ' : ''}
                {t(w.text)}
                {w.action === 'close-year' && (
                  <div style={{ marginTop: 6 }}>
                    <button className="btn small" onClick={closeYear}>
                      {t('Yil yakuni yopish provodkalarini yaratish')}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
