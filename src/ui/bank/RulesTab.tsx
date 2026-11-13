import { useState } from 'react';
import type { Rule } from '../../bank/classify';
import type { Group } from '../../bank/model';
import { useT } from '../../i18n/useT';
import { downloadBlob, pickFile } from '../../store/fileIO';
import { Modal, toast } from '../components/common';
import { bankActions, rulesOf, useBank } from './bankStore';

const list = (xs?: string[]) => (xs ?? []).join(', ');
const parseList = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

function RuleForm({ rule, onSave, onClose }: { rule: Rule; onSave: (r: Rule) => void; onClose: () => void }) {
  const t = useT();
  const [r, setR] = useState(rule);
  const [lists, setLists] = useState({
    accountPrefix: list(rule.accountPrefix),
    korrAccountPrefix: list(rule.korrAccountPrefix),
    korrNameIncludes: list(rule.korrNameIncludes),
    purposeIncludes: list(rule.purposeIncludes),
    purposeAll: list(rule.purposeAll),
  });
  const save = () => {
    if (!r.id.trim() || !r.type.trim()) return toast('Qoida kodi va operatsiya turini kiriting');
    const out: Rule = { ...r };
    for (const k of Object.keys(lists) as Array<keyof typeof lists>) {
      const v = parseList(lists[k]);
      if (v.length) out[k] = v;
      else delete out[k];
    }
    if (!out.currency) delete out.currency;
    if (!out.currencyNot) delete out.currencyNot;
    onSave(out);
  };
  const field = (k: keyof typeof lists, label: string, hint: string) => (
    <div className="field">
      <label>{t(label)}</label>
      <input className="input" value={lists[k]} onChange={(e) => setLists({ ...lists, [k]: e.target.value })} placeholder={hint} />
    </div>
  );
  return (
    <Modal
      title={t('Qoida')}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('Bekor qilish')}
          </button>
          <button className="btn primary" onClick={save}>
            {t('Saqlash')}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <label>{t('Qoida kodi')}</label>
          <input className="input" value={r.id} onChange={(e) => setR({ ...r, id: e.target.value })} />
        </div>
        <div className="field">
          <label>{t('Guruh')}</label>
          <select className="input" value={r.group} onChange={(e) => setR({ ...r, group: e.target.value as Group })}>
            <option>Kirim</option>
            <option>Chiqim</option>
            <option>Soliqlar</option>
          </select>
        </div>
        <div className="field" style={{ gridColumn: 'span 2' }}>
          <label>{t('Operatsiya turi')}</label>
          <input className="input" value={r.type} onChange={(e) => setR({ ...r, type: e.target.value })} />
        </div>
        <div className="field">
          <label>{t('Yo‘nalish')}</label>
          <select className="input" value={r.direction} onChange={(e) => setR({ ...r, direction: e.target.value as Rule['direction'] })}>
            <option value="debit">{t('debet (chiqim)')}</option>
            <option value="credit">{t('kredit (kirim)')}</option>
            <option value="any">{t('ikkalasi')}</option>
          </select>
        </div>
        <div className="field">
          <label>{t('Ustuvorlik (katta — oldin)')}</label>
          <input className="input" type="number" value={r.priority} onChange={(e) => setR({ ...r, priority: Number(e.target.value) })} />
        </div>
        <div className="field">
          <label>{t('Hisob valyutasi')}</label>
          <input className="input" value={r.currency ?? ''} placeholder="UZS" onChange={(e) => setR({ ...r, currency: e.target.value.toUpperCase() })} />
        </div>
        <div className="field">
          <label>{t('Valyuta emas')}</label>
          <input className="input" value={r.currencyNot ?? ''} placeholder="UZS" onChange={(e) => setR({ ...r, currencyNot: e.target.value.toUpperCase() })} />
        </div>
        {field('accountPrefix', 'O‘z hisob boshlanishi', '22613, 235')}
        {field('korrAccountPrefix', 'Korr. hisob boshlanishi', '23402, 16401')}
        {field('korrNameIncludes', 'Korrespondent nomida', 'BROKER, БРОКЕР')}
        {field('purposeIncludes', 'Maqsadda (birortasi)', 'ИЖАРА, ijara')}
        {field('purposeAll', 'Maqsadda (hammasi; | — muqobil)', 'ПЕНЯ|PENYA')}
      </div>
      <p className="muted small">{t('Bir maydon ichidagi so‘zlarni vergul bilan ajrating. Katta-kichik harf, ё/е va o‘zbek apostroflari farq qilmaydi; lotin va kirill variantlarini ikkalasini yozing.')}</p>
    </Modal>
  );
}

export function RulesTab() {
  const t = useT();
  const bank = useBank();
  const rules = rulesOf(bank);
  const sorted = rules.map((r, i) => ({ r, i })).sort((a, b) => b.r.priority - a.r.priority || a.i - b.i);
  const [editing, setEditing] = useState<{ rule: Rule; index: number } | null>(null);
  const [s, setS] = useState(bank.settings);

  const save = (next: Rule[]) => bankActions.setRules(next);
  const move = (pos: number, dir: -1 | 1) => {
    const a = sorted[pos];
    const b = sorted[pos + dir];
    if (!a || !b) return;
    // Moving up means a higher priority than the neighbour: swap, or step past it when equal.
    const next = [...rules];
    if (a.r.priority === b.r.priority) next[a.i] = { ...a.r, priority: b.r.priority - dir };
    else {
      next[a.i] = { ...a.r, priority: b.r.priority };
      next[b.i] = { ...b.r, priority: a.r.priority };
    }
    save(next);
  };
  const exportJson = () => downloadBlob(new Blob([JSON.stringify(rules, null, 2)], { type: 'application/json' }), 'bank-qoidalari.json');
  const importJson = async () => {
    const f = await pickFile('.json');
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!Array.isArray(data) || !data.every((r) => r && typeof r.id === 'string' && typeof r.type === 'string' && typeof r.priority === 'number'))
        throw new Error('Fayl qoidalar ro‘yxati emas');
      save(data as Rule[]);
      toast(`${data.length} ta qoida yuklandi`);
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <>
      <div className="toolbar">
        <button className="btn primary" onClick={() => setEditing({ rule: { id: `user-${Date.now().toString(36)}`, group: 'Chiqim', type: '', direction: 'debit', priority: 1500 }, index: -1 })}>
          + {t('Qoida qo‘shish')}
        </button>
        <button className="btn" onClick={exportJson}>
          {t('JSON eksport')}
        </button>
        <button className="btn" onClick={importJson}>
          {t('JSON import')}
        </button>
        <button className="btn ghost" disabled={!bank.rules} onClick={() => confirm(t('Standart qoidalarga qaytarilsinmi?')) && bankActions.setRules(null)}>
          {t('Standart qoidalar')}
        </button>
        <span className="muted small">{t('Birinchi mos kelgan qoida (ustuvorlik bo‘yicha) ishlaydi. O‘zgarishdan keyin hamma operatsiyalar qayta tasniflanadi.')}</span>
      </div>
      <div className="card table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th className="r">{t('Ustuvorlik')}</th>
              <th>{t('Guruh / tur')}</th>
              <th>{t('Shartlar')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ r, i }, pos) => (
              <tr key={r.id + i} style={r.disabled ? { opacity: 0.5 } : undefined}>
                <td className="r code">{r.priority}</td>
                <td>
                  <span className="tag">{r.group}</span> {r.type}
                  <div className="muted small">{r.id}</div>
                </td>
                <td className="small">
                  {r.direction === 'debit' ? 'debet' : r.direction === 'credit' ? 'kredit' : 'har ikkisi'}
                  {r.currency && ` · ${r.currency}`}
                  {r.currencyNot && ` · ≠${r.currencyNot}`}
                  {r.accountPrefix && ` · o‘z hisob: ${list(r.accountPrefix)}`}
                  {r.korrAccountPrefix && ` · korr: ${list(r.korrAccountPrefix)}`}
                  {r.korrNameIncludes && ` · nomida: ${list(r.korrNameIncludes)}`}
                  {r.purposeIncludes && ` · maqsadda: ${list(r.purposeIncludes)}`}
                  {r.purposeAll && ` · hammasi: ${list(r.purposeAll)}`}
                </td>
                <td className="r" style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn small" onClick={() => move(pos, -1)} disabled={pos === 0} aria-label={t('Yuqoriga')}>
                    ↑
                  </button>
                  <button className="btn small" onClick={() => move(pos, 1)} disabled={pos === sorted.length - 1} aria-label={t('Pastga')}>
                    ↓
                  </button>
                  <button className="btn small" onClick={() => save(rules.map((x, k) => (k === i ? { ...x, disabled: !x.disabled } : x)))}>
                    {r.disabled ? t('Yoqish') : t('O‘chirib qo‘yish')}
                  </button>
                  <button className="btn small" onClick={() => setEditing({ rule: r, index: i })}>
                    {t('Tahrirlash')}
                  </button>
                  <button className="icon-btn" aria-label={t('O‘chirish')} onClick={() => confirm(t('Qoida o‘chirilsinmi?')) && save(rules.filter((_, k) => k !== i))}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card card-pad">
        <h3 style={{ marginBottom: 10 }}>{t('Belgilar chegaralari')}</h3>
        <div className="form-grid">
          <div className="field">
            <label>{t('Katta yaxlit summa, so‘m')}</label>
            <input className="input num" type="number" value={s.largeRoundCash / 100} onChange={(e) => setS({ ...s, largeRoundCash: Math.round(Number(e.target.value) * 100) })} />
          </div>
          <div className="field">
            <label>{t('“Yaxlit” birligi, so‘m')}</label>
            <input className="input num" type="number" value={s.roundUnit / 100} onChange={(e) => setS({ ...s, roundUnit: Math.max(100, Math.round(Number(e.target.value) * 100)) })} />
          </div>
          <div className="field">
            <label>{t('Aniq bo‘lmagan maqsad: belgidan qisqa')}</label>
            <input className="input num" type="number" value={s.vagueLength} onChange={(e) => setS({ ...s, vagueLength: Number(e.target.value) })} />
          </div>
        </div>
        <div className="toolbar" style={{ marginTop: 10 }}>
          <button className="btn" onClick={() => bankActions.setSettings(s)}>
            {t('Saqlash')}
          </button>
        </div>
      </div>

      <div className="card card-pad">
        <h3 style={{ marginBottom: 8 }}>{t('Ma’lumotlar')}</h3>
        <p className="muted small">{t('Vipiskalar, qoidalar va belgilar faqat shu brauzerning IndexedDB xotirasida saqlanadi.')}</p>
        <button
          className="btn danger"
          onClick={async () => {
            if (!confirm(t('Bank bo‘limidagi barcha ma’lumotlar (vipiskalar, qoidalar, belgilar) o‘chiriladi. Davom etasizmi?'))) return;
            await bankActions.wipe();
            toast('Hammasi o‘chirildi');
          }}
        >
          {t('Hammasini o‘chirish')}
        </button>
      </div>
      {editing && (
        <RuleForm
          rule={editing.rule}
          onClose={() => setEditing(null)}
          onSave={(r) => {
            save(editing.index < 0 ? [...rules, r] : rules.map((x, k) => (k === editing.index ? r : x)));
            setEditing(null);
          }}
        />
      )}
    </>
  );
}
