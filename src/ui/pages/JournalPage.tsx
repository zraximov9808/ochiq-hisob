import { useMemo, useRef, useState } from 'react';
import { editedEntry, removeEntry } from '../../auto/apply';
import { findAccount, isKnownAccount, synthetic } from '../../engine/accounts';
import { balanceLineFor } from '../../engine/balanceSheet';
import { incomeLineFor } from '../../engine/incomeStatement';
import { formatAmount } from '../../engine/money';
import { formatDate, parseDate } from '../../engine/period';
import { sampleDoc } from '../../engine/sample';
import { TAX_LINES, TAX_LINE_BY_ID } from '../../engine/taxLines';
import { effectiveTax, suggestTax } from '../../engine/taxSuggest';
import type { Entry, TaxTag } from '../../engine/types';
import { uid } from '../../engine/uid';
import { useT } from '../../i18n/useT';
import { actions, getState, useApp } from '../../store/store';
import { AccountInput, AmountInput, Modal, PageHead, toast } from '../components/common';

interface Draft {
  date: string;
  text: string;
  debit: string;
  credit: string;
  amount: number;
}

/** Where an account lands in the reports, for the live hint. */
function placement(code: string, side: 'dt' | 'kt'): string {
  const syn = synthetic(code);
  if (syn.length === 3) return 'balansdan tashqari';
  const pl = incomeLineFor(code);
  if (pl) return `2-shakl ${pl.code}`;
  if (syn.startsWith('99')) return 'yakuniy natija';
  if (syn.startsWith('92')) return 'oraliq hisobvaraq';
  const line = balanceLineFor(code, side === 'dt' ? 1 : -1);
  return line ? `balans ${line}` : '';
}

function defaultDate(year: number): string {
  const today = new Date();
  const iso = today.toISOString().slice(0, 10);
  return iso.startsWith(String(year)) ? iso : `${year}-01-01`;
}

export function JournalPage() {
  const t = useT();
  const { h } = useApp();
  const doc = h.doc;
  const blank = (): Draft => ({ date: lastDate.current ?? defaultDate(doc.year), text: '', debit: '', credit: '', amount: 0 });
  const lastDate = useRef<string | null>(null);
  const [draft, setDraft] = useState<Draft>(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(300);
  const [showTemplates, setShowTemplates] = useState(false);
  const [dateText, setDateText] = useState(formatDate(draft.date));
  const firstInput = useRef<HTMLInputElement>(null);

  const setDraftDate = (iso: string) => {
    setDraft((d) => ({ ...d, date: iso }));
    setDateText(formatDate(iso));
  };

  const submit = () => {
    const date = parseDate(dateText);
    const subs = getState().h.doc.subaccounts;
    if (!date) return setError('Sana noto‘g‘ri. Masalan: 20.03.' + doc.year);
    if (!date.startsWith(String(doc.year))) return setError(`Sana ${doc.year}-yil ichida bo‘lishi kerak.`);
    if (!isKnownAccount(draft.debit, subs)) return setError(`Debet hisobvarag‘i topilmadi: ${draft.debit || '(bo‘sh)'}`);
    if (!isKnownAccount(draft.credit, subs)) return setError(`Kredit hisobvarag‘i topilmadi: ${draft.credit || '(bo‘sh)'}`);
    if (draft.debit.trim() === draft.credit.trim()) return setError('Debet va kredit bir xil bo‘lmasligi kerak.');
    if (draft.amount <= 0) return setError('Summani kiriting.');
    const entry: Entry = { id: editing ?? uid(), date, text: draft.text.trim(), debit: draft.debit.trim(), credit: draft.credit.trim(), amount: draft.amount };
    actions.update((d) => {
      if (editing) {
        const i = d.entries.findIndex((e) => e.id === editing);
        if (i >= 0) {
          const old = d.entries[i];
          const keepTax = old.tax?.manual && old.debit === entry.debit && old.credit === entry.credit;
          d.entries[i] = editedEntry(old, { ...entry, tax: keepTax ? old.tax : undefined });
        }
      } else d.entries.push(entry);
    });
    lastDate.current = date;
    setError('');
    setEditing(null);
    setDraft({ date, text: '', debit: '', credit: '', amount: 0 });
    setDateText(formatDate(date));
    firstInput.current?.focus();
  };

  const startEdit = (e: Entry) => {
    setEditing(e.id);
    setDraft({ date: e.date, text: e.text, debit: e.debit, credit: e.credit, amount: e.amount });
    setDateText(formatDate(e.date));
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const cancelEdit = () => {
    setEditing(null);
    setDraft(blank());
    setDateText(formatDate(blank().date));
    setError('');
  };

  const hint = useMemo(() => {
    if (!draft.debit && !draft.credit) return null;
    const subs = doc.subaccounts;
    const dAcc = findAccount(draft.debit, subs);
    const cAcc = findAccount(draft.credit, subs);
    const tag = suggestTax({ debit: draft.debit, credit: draft.credit, text: draft.text });
    const parts = [
      draft.debit && dAcc ? `→ Dt ${draft.debit}: ${placement(draft.debit, 'dt')}` : '',
      draft.credit && cAcc ? `Kt ${draft.credit}: ${placement(draft.credit, 'kt')}` : '',
    ].filter(Boolean);
    const taxLine = tag.line ? TAX_LINE_BY_ID.get(tag.line) : null;
    return { dAcc, cAcc, parts, taxLine, nonDed: tag.nonDeductible };
  }, [draft.debit, draft.credit, draft.text, doc.subaccounts]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\s/g, '');
    const list = doc.entries
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => {
        if (!q) return true;
        return (
          e.text.toLowerCase().includes(q) ||
          e.debit.startsWith(q) ||
          e.credit.startsWith(q) ||
          (digits !== '' && /^\d+$/.test(digits) && String(Math.round(e.amount / 100)).includes(digits)) ||
          formatDate(e.date).includes(q)
        );
      })
      .sort((a, b) => a.e.date.localeCompare(b.e.date) || a.i - b.i);
    return list.map((x) => x.e);
  }, [doc.entries, query]);

  const setTax = (id: string, tag: TaxTag | undefined) =>
    actions.update((d) => {
      const i = d.entries.findIndex((x) => x.id === id);
      if (i >= 0) d.entries[i] = editedEntry(d.entries[i], { ...d.entries[i], tax: tag });
    });

  const loadSample = () => {
    if (doc.entries.length && !confirm(t('Joriy ma’lumotlar namunaviy ma’lumotlar bilan almashtiriladi. Davom etasizmi?'))) return;
    const sample = sampleDoc(doc.year);
    actions.update((d) => {
      d.company = sample.company;
      d.opening = sample.opening;
      d.entries = sample.entries;
      d.subaccounts = sample.subaccounts;
      d.templates = sample.templates;
    });
    toast('Namuna ma’lumotlar yuklandi');
  };
  const clearJournal = () => {
    if (!doc.entries.length || !confirm(t(`Jurnaldagi ${doc.entries.length} ta provodka o‘chiriladi. Ctrl+Z bilan qaytarish mumkin. Davom etasizmi?`))) return;
    actions.update((d) => {
      d.entries = [];
    });
  };

  return (
    <div className="page">
      <PageHead title="Provodkalar jurnali">
        {t('Sana, mazmun, debet, kredit va summani kiriting — balans, 2-shakl va foyda solig‘i hisoboti bir vaqtda yangilanadi. Har bir provodkaning foyda solig‘i hisobotidagi satri avtomatik tanlanadi, kerak bo‘lsa o‘zgartiring.')}
      </PageHead>

      <div className="card card-pad">
        <div className="entry-form">
          <div className="field">
            <label htmlFor="f-date">{t('Sana')}</label>
            <input
              id="f-date"
              ref={firstInput}
              className="input"
              value={dateText}
              placeholder="kk.oo.yyyy"
              onChange={(e) => setDateText(e.target.value)}
              onBlur={() => {
                const iso = parseDate(dateText);
                if (iso) setDraftDate(iso);
              }}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>
          <div className="field">
            <label htmlFor="f-text">{t('Provodka mazmuni')}</label>
            <input
              id="f-text"
              className="input"
              value={draft.text}
              placeholder={t('Masalan: Reklama xizmati uchun')}
              onChange={(e) => setDraft({ ...draft, text: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>
          <div className="field">
            <label htmlFor="f-dt">{t('Debet')}</label>
            <AccountInput id="f-dt" side="dt" value={draft.debit} placeholder="9410" onChange={(v) => setDraft({ ...draft, debit: v })} onEnter={submit} />
          </div>
          <div className="field">
            <label htmlFor="f-kt">{t('Kredit')}</label>
            <AccountInput id="f-kt" side="kt" value={draft.credit} placeholder="6010" onChange={(v) => setDraft({ ...draft, credit: v })} onEnter={submit} />
          </div>
          <div className="field">
            <label htmlFor="f-sum">{t('Summa, so‘m')}</label>
            <AmountInput id="f-sum" value={draft.amount} onChange={(v) => setDraft((d) => ({ ...d, amount: v }))} onEnter={submit} />
          </div>
          <div className="toolbar">
            <button className="btn primary" onClick={submit}>
              {editing ? t('Saqlash') : t('Qo‘shish')}
            </button>
            {editing && (
              <button className="btn" onClick={cancelEdit}>
                {t('Bekor')}
              </button>
            )}
          </div>
        </div>
        {hint ? (
          <div className="hint">
            {draft.debit && (
              <>
                <b className="dt">Dt {draft.debit}</b> {hint.dAcc ? (draft.debit.includes('.') ? hint.dAcc.name : t(hint.dAcc.name)) : <span className="err-text">{t('topilmadi')}</span>}
              </>
            )}
            {draft.debit && draft.credit && ' · '}
            {draft.credit && (
              <>
                <b className="kt">Kt {draft.credit}</b> {hint.cAcc ? (draft.credit.includes('.') ? hint.cAcc.name : t(hint.cAcc.name)) : <span className="err-text">{t('topilmadi')}</span>}
              </>
            )}
            {hint.parts.length > 0 && <div className="muted">{t(hint.parts.join('; '))}</div>}
            <div className="muted">
              {t('Foyda solig‘i:')}{' '}
              {hint.taxLine ? (
                <b>{t(`${hint.taxLine.annex}-ilova ${hint.taxLine.code} ${hint.taxLine.label}`)}</b>
              ) : (
                t('hisobotga kirmaydi')
              )}
              {hint.nonDed && <span className="tag warn"> {t('chegirilmaydi')}</span>}
            </div>
          </div>
        ) : (
          <div className="muted small" style={{ marginTop: 8 }}>
            {t('Enter — qo‘shish. Hisobvaraq kodini yozsangiz, nomi va hisobotdagi joyi shu yerda chiqadi. Subschyot uchun 6010.05 ko‘rinishida yozing.')}
          </div>
        )}
        {error && (
          <div className="err-text small" style={{ marginTop: 8 }} role="alert">
            {t(error)}
          </div>
        )}
      </div>

      <div className="toolbar">
        <input className="input" style={{ maxWidth: 320 }} placeholder={t('Qidirish: mazmun, hisobvaraq, summa')} value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="btn" onClick={() => setShowTemplates(true)}>
          ⟳ {t('Takroriy provodkalar')}
        </button>
        <button className="btn" onClick={loadSample}>
          {t('Namuna ma’lumotlar')}
        </button>
        <button className="btn ghost danger" onClick={clearJournal}>
          {t('Jurnalni tozalash')}
        </button>
        <span className="muted small">
          {rows.length} / {doc.entries.length}
        </span>
      </div>

      <div className="card table-wrap">
        {doc.entries.length === 0 ? (
          <div className="empty">
            {t('Hali provodka yo‘q. Yuqoridagi formadan kiriting yoki tanishish uchun')}{' '}
            <button className="btn small" onClick={loadSample}>
              {t('Namuna ma’lumotlar')}
            </button>{' '}
            {t('ni yuklang.')}
          </div>
        ) : (
          <table className="grid">
            <thead>
              <tr>
                <th>{t('Sana')}</th>
                <th>{t('Mazmun')}</th>
                <th>{t('Debet')}</th>
                <th>{t('Kredit')}</th>
                <th className="r">{t('Summa')}</th>
                <th>{t('Foyda solig‘i hisobotida')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((e) => (
                <JournalRow key={e.id} e={e} editing={editing === e.id} year={doc.year} onEdit={() => startEdit(e)} onTax={(tag) => setTax(e.id, tag)} />
              ))}
            </tbody>
          </table>
        )}
        {rows.length > limit && (
          <div className="empty">
            <button className="btn" onClick={() => setLimit(limit + 500)}>
              {t('Yana ko‘rsatish')} ({rows.length - limit})
            </button>
          </div>
        )}
      </div>
      {showTemplates && <TemplatesModal onClose={() => setShowTemplates(false)} />}
    </div>
  );
}

function JournalRow({ e, editing, year, onEdit, onTax }: { e: Entry; editing: boolean; year: number; onEdit: () => void; onTax: (tag: TaxTag | undefined) => void }) {
  const t = useT();
  const tag = effectiveTax(e);
  const def = tag.line ? TAX_LINE_BY_ID.get(tag.line) : undefined;
  const outside = !e.date.startsWith(String(year));
  const touchesPL = [e.debit, e.credit].some((c) => synthetic(c).startsWith('9'));
  const sub = def
    ? `${def.annex === 1 ? 'Kt' : 'Dt'} ${def.annex === 1 ? e.credit : e.debit} → ${def.annex}-ilova ${def.code}`
    : e.closing
      ? 'yil yakuni yopish provodkasi'
      : touchesPL
        ? 'hisobotga kirmaydi'
        : 'moliyaviy natijaga ta’sir qilmaydi';
  const stop = (ev: React.SyntheticEvent) => ev.stopPropagation();
  return (
    <tr className={`clickable ${editing ? 'editing' : ''}`} onClick={onEdit} title={t('Tahrirlash uchun bosing')}>
      <td className={outside ? 'err-text' : 'muted'}>{formatDate(e.date)}</td>
      <td>{e.text}</td>
      <td className="dt-code">{e.debit}</td>
      <td className="kt-code">{e.credit}</td>
      <td className="r">
        <b>{formatAmount(e.amount, 'som')}</b>
      </td>
      <td className="tax-cell" onClick={stop}>
        <select
          className={def ? (def.annex === 1 ? 'inc' : 'exp') : 'none'}
          value={tag.line ?? ''}
          onChange={(ev) => onTax({ line: ev.target.value || null, manual: true, nonDeductible: tag.nonDeductible && ev.target.value.startsWith('e') })}
        >
          <option value="">{t('— Hisobotga kirmaydi')}</option>
          <optgroup label={t('1-ilova: daromadlar')}>
            {TAX_LINES.filter((l) => l.annex === 1).map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} {t(l.label)}
              </option>
            ))}
          </optgroup>
          <optgroup label={t('2-ilova: xarajatlar')}>
            {TAX_LINES.filter((l) => l.annex === 2).map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} {t(l.label)}
              </option>
            ))}
          </optgroup>
        </select>
        <div className="sub">
          <span>{t(sub)}</span>
          {def?.annex === 2 && (
            <label style={{ display: 'inline-flex', gap: 4, alignItems: 'center', color: tag.nonDeductible ? 'var(--warn)' : undefined }}>
              <input type="checkbox" checked={!!tag.nonDeductible} onChange={(ev) => onTax({ line: tag.line, manual: true, nonDeductible: ev.target.checked })} />
              {t('chegirilmaydi')}
            </label>
          )}
          {e.tax?.manual && !e.closing && (
            <button className="link-num" style={{ fontWeight: 400 }} onClick={() => onTax(undefined)} title={t('Avtomatik tanlovga qaytarish')}>
              {t('avto')}
            </button>
          )}
        </div>
      </td>
      <td onClick={stop}>
        <button
          className="icon-btn"
          aria-label={t('O‘chirish')}
          onClick={() =>
            actions.update((d) => {
              removeEntry(d, e.id);
            })
          }
        >
          ×
        </button>
      </td>
    </tr>
  );
}

function TemplatesModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { h } = useApp();
  const doc = h.doc;
  const [tpl, setTpl] = useState({ text: '', debit: '', credit: '', amount: 0, day: 25 });
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const addTemplate = () => {
    if (!tpl.text || !isKnownAccount(tpl.debit, doc.subaccounts) || !isKnownAccount(tpl.credit, doc.subaccounts) || tpl.amount <= 0) {
      toast('Mazmun, hisobvaraqlar va summani to‘g‘ri kiriting');
      return;
    }
    actions.update((d) => {
      d.templates.push({ id: uid('t'), ...tpl, day: Math.min(31, Math.max(1, tpl.day)) });
    });
    setTpl({ text: '', debit: '', credit: '', amount: 0, day: tpl.day });
  };
  const generate = () => {
    const last = new Date(Date.UTC(doc.year, month, 0)).getUTCDate();
    let added = 0;
    actions.update((d) => {
      for (const p of d.templates) {
        const date = `${doc.year}-${String(month).padStart(2, '0')}-${String(Math.min(p.day, last)).padStart(2, '0')}`;
        const exists = d.entries.some((e) => e.date === date && e.text === p.text && e.debit === p.debit && e.credit === p.credit && e.amount === p.amount);
        if (exists) continue;
        d.entries.push({ id: uid(), date, text: p.text, debit: p.debit, credit: p.credit, amount: p.amount });
        added++;
      }
    });
    toast(added ? `${added} ta provodka yaratildi` : 'Bu oy uchun provodkalar allaqachon bor');
  };
  return (
    <Modal
      title={t('Takroriy provodkalar')}
      onClose={onClose}
      wide
      footer={
        <>
          <select className="input" style={{ width: 160 }} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {doc.year}, {i + 1}-{t('oy')}
              </option>
            ))}
          </select>
          <button className="btn primary" disabled={!doc.templates.length} onClick={generate}>
            {t('Tanlangan oy uchun yaratish')}
          </button>
          <button className="btn" onClick={onClose}>
            {t('Yopish')}
          </button>
        </>
      }
    >
      <p className="muted small">{t('Har oy takrorlanadigan provodkalarni (ijara, ish haqi, amortizatsiya) bir marta shablon qilib saqlang va kerakli oy uchun bitta tugma bilan yarating. Bir oyda ikki marta yaratilmaydi.')}</p>
      <table className="grid">
        <thead>
          <tr>
            <th>{t('Mazmun')}</th>
            <th>{t('Debet')}</th>
            <th>{t('Kredit')}</th>
            <th className="r">{t('Summa')}</th>
            <th className="c">{t('Kun')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {doc.templates.map((p) => (
            <tr key={p.id}>
              <td>{p.text}</td>
              <td className="dt-code">{p.debit}</td>
              <td className="kt-code">{p.credit}</td>
              <td className="r">{formatAmount(p.amount, 'som')}</td>
              <td className="c">{p.day}</td>
              <td>
                <button
                  className="icon-btn"
                  aria-label={t('O‘chirish')}
                  onClick={() =>
                    actions.update((d) => {
                      d.templates = d.templates.filter((x) => x.id !== p.id);
                    })
                  }
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
          <tr>
            <td>
              <input className="input" placeholder={t('Mazmun')} value={tpl.text} onChange={(e) => setTpl({ ...tpl, text: e.target.value })} />
            </td>
            <td style={{ width: 110 }}>
              <AccountInput side="dt" value={tpl.debit} onChange={(v) => setTpl({ ...tpl, debit: v })} />
            </td>
            <td style={{ width: 110 }}>
              <AccountInput side="kt" value={tpl.credit} onChange={(v) => setTpl({ ...tpl, credit: v })} />
            </td>
            <td style={{ width: 160 }}>
              <AmountInput value={tpl.amount} onChange={(v) => setTpl((s) => ({ ...s, amount: v }))} />
            </td>
            <td style={{ width: 70 }}>
              <input className="input" type="number" min={1} max={31} value={tpl.day} onChange={(e) => setTpl({ ...tpl, day: Number(e.target.value) })} />
            </td>
            <td>
              <button className="btn small" onClick={addTemplate}>
                +
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </Modal>
  );
}
