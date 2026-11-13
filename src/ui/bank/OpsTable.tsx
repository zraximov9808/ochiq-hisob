import { useMemo, useState } from 'react';
import type { Rule } from '../../bank/classify';
import { normalizeText } from '../../bank/classify';
import { FLAG_TEXT } from '../../bank/flagsText';
import type { Group, Operation } from '../../bank/model';
import { useT } from '../../i18n/useT';
import { toast } from '../components/common';
import { bankActions, rulesOf, useBank } from './bankStore';
import { Money, fmtDay, fmtTime } from './format';

export interface OpsFilter {
  from: string;
  to: string;
  group: '' | Group;
  type: string;
  korr: string;
  min: string;
  max: string;
  q: string;
}

export const EMPTY_FILTER: OpsFilter = { from: '', to: '', group: '', type: '', korr: '', min: '', max: '', q: '' };

type SortKey = 'datetime' | 'debit' | 'credit' | 'korrName' | 'type';

const num = (s: string) => {
  const v = Number(s.replace(/\s/g, '').replace(',', '.'));
  return s.trim() === '' || isNaN(v) ? null : Math.round(v * 100);
};

export function applyFilter(ops: Operation[], f: OpsFilter): Operation[] {
  const q = normalizeText(f.q.trim());
  const korr = normalizeText(f.korr.trim());
  const min = num(f.min);
  const max = num(f.max);
  return ops.filter((o) => {
    const day = o.datetime.slice(0, 10);
    const amount = o.debit || o.credit;
    return (
      (!f.from || day >= f.from) &&
      (!f.to || day <= f.to) &&
      (!f.group || o.group === f.group) &&
      (!f.type || o.type === f.type) &&
      (!korr || normalizeText(o.korrName).includes(korr) || o.korrAccount.includes(f.korr.trim()) || o.korrInn === f.korr.trim()) &&
      (min === null || amount >= min) &&
      (max === null || amount <= max) &&
      (!q || normalizeText(o.purpose).includes(q) || o.docNo.includes(f.q.trim()))
    );
  });
}

/** All types known to the current rules plus the fallbacks, per group. */
export function typeOptions(rules: Rule[]): Record<Group, string[]> {
  const out: Record<Group, Set<string>> = { Kirim: new Set(['Mijozdan tushum (tovar/xizmat)']), Chiqim: new Set(["Yetkazib beruvchiga to'lov (tovar/xizmat)"]), Soliqlar: new Set() };
  for (const r of rules) out[r.group].add(r.type);
  return { Kirim: [...out.Kirim], Chiqim: [...out.Chiqim], Soliqlar: [...out.Soliqlar] };
}

export function OpsTable({ ops, currency, filter, setFilter }: { ops: Operation[]; currency: string; filter: OpsFilter; setFilter: (f: OpsFilter) => void }) {
  const t = useT();
  const bank = useBank();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'datetime', dir: 1 });
  const [limit, setLimit] = useState(200);
  const [open, setOpen] = useState<string | null>(null);
  const opts = useMemo(() => typeOptions(rulesOf(bank)), [bank]);
  const types = useMemo(() => [...new Set(ops.map((o) => o.type))].sort(), [ops]);

  const rows = useMemo(() => {
    const list = applyFilter(ops, filter);
    if (sort.key === 'datetime' && sort.dir === 1) return list;
    return [...list].sort((a, b) => {
      const va = a[sort.key];
      const vb = b[sort.key];
      return (typeof va === 'number' ? va - (vb as number) : String(va).localeCompare(String(vb))) * sort.dir;
    });
  }, [ops, filter, sort]);
  const totalD = rows.reduce((s, o) => s + o.debit, 0);
  const totalC = rows.reduce((s, o) => s + o.credit, 0);

  const th = (key: SortKey, label: string, cls = '') => (
    <th className={`${cls} clickable`} onClick={() => setSort({ key, dir: sort.key === key ? (-sort.dir as 1 | -1) : 1 })} style={{ cursor: 'pointer' }}>
      {t(label)} {sort.key === key ? (sort.dir === 1 ? '▲' : '▼') : ''}
    </th>
  );

  const changeType = (o: Operation, value: string) => {
    if (!value) return bankActions.setOverride(o.id, null);
    const [group, type] = value.split('|') as [Group, string];
    bankActions.setOverride(o.id, { group, type });
  };
  const applyToKorr = (o: Operation) => {
    const rules = [...rulesOf(bank)];
    const id = `user-${Date.now().toString(36)}`;
    rules.push({ id, group: o.group, type: o.type, direction: o.debit > 0 ? 'debit' : 'credit', korrAccountPrefix: [o.korrAccount], priority: 2000 });
    bankActions.setRules(rules);
    toast(`Yangi qoida: ${o.korrName || o.korrAccount} → ${o.type}`);
  };

  const set = (patch: Partial<OpsFilter>) => {
    setFilter({ ...filter, ...patch });
    setLimit(200);
  };

  return (
    <div className="card table-wrap">
      <div className="card-pad toolbar" style={{ alignItems: 'flex-end' }}>
        <div className="field">
          <label>{t('Sana (dan)')}</label>
          <input className="input" type="date" value={filter.from} onChange={(e) => set({ from: e.target.value })} />
        </div>
        <div className="field">
          <label>{t('Sana (gacha)')}</label>
          <input className="input" type="date" value={filter.to} onChange={(e) => set({ to: e.target.value })} />
        </div>
        <div className="field">
          <label>{t('Guruh')}</label>
          <select className="input" value={filter.group} onChange={(e) => set({ group: e.target.value as OpsFilter['group'] })}>
            <option value="">{t('Hammasi')}</option>
            <option value="Kirim">Kirim</option>
            <option value="Chiqim">Chiqim</option>
            <option value="Soliqlar">Soliqlar</option>
          </select>
        </div>
        <div className="field" style={{ minWidth: 200 }}>
          <label>{t('Tur')}</label>
          <select className="input" value={filter.type} onChange={(e) => set({ type: e.target.value })}>
            <option value="">{t('Hammasi')}</option>
            {types.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>{t('Korrespondent / INN')}</label>
          <input className="input" value={filter.korr} onChange={(e) => set({ korr: e.target.value })} />
        </div>
        <div className="field" style={{ width: 120 }}>
          <label>{t('Summa (dan)')}</label>
          <input className="input num" value={filter.min} onChange={(e) => set({ min: e.target.value })} />
        </div>
        <div className="field" style={{ width: 120 }}>
          <label>{t('Summa (gacha)')}</label>
          <input className="input num" value={filter.max} onChange={(e) => set({ max: e.target.value })} />
        </div>
        <div className="field" style={{ flex: 1, minWidth: 180 }}>
          <label>{t('To‘lov maqsadi bo‘yicha qidirish')}</label>
          <input className="input" value={filter.q} onChange={(e) => set({ q: e.target.value })} />
        </div>
        <button className="btn ghost" onClick={() => setFilter(EMPTY_FILTER)}>
          {t('Tozalash')}
        </button>
      </div>
      <table className="grid">
        <thead>
          <tr>
            <th>№</th>
            {th('datetime', 'Sana')}
            <th>{t('Hujjat №')}</th>
            <th>{t('Korr. hisob')}</th>
            {th('korrName', 'Korrespondent')}
            <th>INN</th>
            <th>{t('To‘lov maqsadi')}</th>
            {th('debit', 'Debet', 'r')}
            {th('credit', 'Kredit', 'r')}
            <th className="r">{t('Qoldiq')}</th>
            {th('type', 'Guruh / tur')}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, limit).map((o, i) => (
            <tr key={o.id} className={o.flags.length ? 'flagged' : undefined}>
              <td className="muted">{i + 1}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                {fmtDay(o.datetime)}
                <div className="muted small">{fmtTime(o.datetime)}</div>
              </td>
              <td className="code">{o.docNo}</td>
              <td className="small" style={{ fontFamily: 'ui-monospace, monospace' }}>
                {o.korrAccount}
                {o.internal && <div className="tag">{t('ichki')}</div>}
              </td>
              <td className="small">{o.korrName}</td>
              <td className="small">{o.korrInn}</td>
              <td className="small" style={{ maxWidth: 360, cursor: 'pointer' }} title={o.purpose} onClick={() => setOpen(open === o.id ? null : o.id)}>
                {open === o.id || o.purpose.length <= 90 ? o.purpose : o.purpose.slice(0, 90) + '…'}
                {o.flags.length > 0 && <div className="warn-text small">⚑ {o.flags.map((f) => t(FLAG_TEXT[f])).join('; ')}</div>}
              </td>
              <td className="r">{o.debit ? <Money v={o.debit} /> : ''}</td>
              <td className="r">{o.credit ? <Money v={o.credit} /> : ''}</td>
              <td className="r">
                <Money v={o.runningBalance} />
              </td>
              <td className="tax-cell">
                <select
                  className={o.group === 'Kirim' ? 'inc' : o.group === 'Soliqlar' ? 'exp' : 'none'}
                  value={o.manual ? `${o.group}|${o.type}` : ''}
                  onChange={(e) => changeType(o, e.target.value)}
                >
                  <option value="">
                    {o.manual ? '↺ ' + t('Qoida bo‘yicha') : `${o.group}: ${o.type}`}
                  </option>
                  {(['Kirim', 'Chiqim', 'Soliqlar'] as Group[]).map((g) => (
                    <optgroup key={g} label={g}>
                      {opts[g].map((x) => (
                        <option key={x} value={`${g}|${x}`}>
                          {x}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <div className="sub">
                  <span>{o.manual ? t('qo‘lda') : o.ruleId ? `${t('qoida')}: ${o.ruleId}` : t('qoida topilmadi')}</span>
                  {o.manual && (
                    <button className="link-num" style={{ fontWeight: 400 }} onClick={() => applyToKorr(o)}>
                      {t('shu korrespondentga qo‘llash')}
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={7}>
              {t('JAMI')} ({rows.length} {t('ta')}, {currency})
            </td>
            <td className="r">
              <Money v={totalD} />
            </td>
            <td className="r">
              <Money v={totalC} />
            </td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
      {rows.length > limit && (
        <div className="empty">
          <button className="btn" onClick={() => setLimit(limit + 500)}>
            {t('Yana ko‘rsatish')} ({rows.length - limit})
          </button>
        </div>
      )}
    </div>
  );
}
