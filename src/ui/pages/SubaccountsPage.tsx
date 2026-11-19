import { useMemo, useState } from 'react';
import { findAccount, synthetic } from '../../engine/accounts';
import { buildLedger } from '../../engine/ledger';
import { formatAmount } from '../../engine/money';
import { formatDate, periodRange } from '../../engine/period';
import { buildReconciliation } from '../../engine/reconciliation';
import { groupSubaccounts, nextSubCode, unusedSubaccounts } from '../../engine/subaccounts';
import { useT } from '../../i18n/useT';
import { actions, useApp } from '../../store/store';
import { AccountInput, Modal, Num, PageHead, toast } from '../components/common';

type Filter = 'all' | 'settle' | 'tax' | 'stock' | 'other';
const FILTERS: Array<[Filter, string]> = [
  ['all', 'Hammasi'],
  ['settle', 'Hisob-kitoblar (40–69)'],
  ['tax', 'Soliqlar (64xx, 65xx, 44xx)'],
  ['stock', 'Zaxiralar va tovarlar (10–29)'],
  ['other', 'Boshqalar'],
];

function inFilter(parent: string, f: Filter): boolean {
  const n = Number(parent);
  const isTax = /^(64|65|44)/.test(parent);
  const isSettle = n >= 4000 && n < 7000;
  const isStock = n >= 1000 && n < 3000;
  if (f === 'all') return true;
  if (f === 'tax') return isTax;
  if (f === 'settle') return isSettle;
  if (f === 'stock') return isStock;
  return !isSettle && !isStock && !isTax;
}

function statusText(code: string, net: number): string {
  if (net === 0) return 'yopilgan';
  const n = Number(synthetic(code));
  const settle = (n >= 4000 && n < 5000) || (n >= 6000 && n < 8000);
  if (!settle) return net > 0 ? 'debet qoldiq' : 'kredit qoldiq';
  return net > 0 ? 'bizga qarzdor' : 'bizning qarzimiz';
}

export function SubaccountsPage() {
  const t = useT();
  const { h, ui } = useApp();
  const doc = h.doc;
  const [form, setForm] = useState({ parent: '', number: '', name: '', stir: '' });
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [merge, setMerge] = useState(false);
  const [recon, setRecon] = useState<{ name: string; stir?: string; codes: string[] } | null>(null);
  const { from, to } = periodRange(doc.year, ui.quarter);
  const ledger = useMemo(() => buildLedger(doc, from, to), [doc, from, to]);

  const create = () => {
    const parent = form.parent.trim();
    const acc = findAccount(parent);
    if (!acc || parent.includes('.') || acc.group || acc.offBalance) return toast('Asosiy hisobvaraqni to‘g‘ri kiriting (masalan, 6010)');
    if (!form.name.trim()) return toast('Subschyot nomini kiriting');
    const code = form.number.trim() ? `${parent}.${form.number.trim().padStart(2, '0')}` : nextSubCode(parent, form.name, form.stir.trim(), doc.subaccounts);
    if (doc.subaccounts.some((s) => s.code === code)) return toast(`${code} allaqachon mavjud`);
    actions.update((d) => {
      d.subaccounts.push({ code, parent, name: form.name.trim(), stir: form.stir.trim() || undefined });
    });
    toast(`Subschyot ochildi: ${code}`);
    setForm({ parent, number: '', name: '', stir: '' });
  };

  const used = useMemo(() => {
    const s = new Set<string>();
    for (const e of doc.entries) s.add(e.debit).add(e.credit);
    for (const o of doc.opening) s.add(o.account);
    return s;
  }, [doc.entries, doc.opening]);

  const q = query.trim().toLowerCase();
  const subs = doc.subaccounts.filter(
    (s) => inFilter(s.parent, filter) && (!q || s.name.toLowerCase().includes(q) || s.code.includes(q) || (s.stir ?? '').includes(q)),
  );
  const groups = groupSubaccounts(subs, merge);
  const sum = (codes: string[]) =>
    codes.reduce(
      (acc, c) => {
        const r = ledger.get(c);
        return r ? { open: acc.open + r.open, dr: acc.dr + r.dr, cr: acc.cr + r.cr, close: acc.close + r.close } : acc;
      },
      { open: 0, dr: 0, cr: 0, close: 0 },
    );
  const parents = [...new Set(subs.map((s) => s.parent))].sort();
  const dc = (net: number) => (net === 0 ? '0' : net > 0 ? `Dt ${formatAmount(net, ui.unit)}` : `Kt ${formatAmount(-net, ui.unit)}`);

  const rowFor = (g: { key: string; name: string; stir?: string; codes: string[] }) => {
    const v = sum(g.codes);
    const removable = g.codes.length === 1 && !used.has(g.codes[0]);
    return (
      <tr key={g.key} className="sub">
        <td className="code">{g.codes.join(', ')}</td>
        <td>
          {g.name}
          {g.stir && <div className="muted small">STIR {g.stir}</div>}
        </td>
        <td className="r">{dc(v.open)}</td>
        <td className="r">
          <Num v={v.dr} />
        </td>
        <td className="r">
          <Num v={v.cr} />
        </td>
        <td className="r">
          <b>{dc(v.close)}</b>
        </td>
        <td className="muted small">{t(statusText(g.codes[0], v.close))}</td>
        <td className="r" style={{ whiteSpace: 'nowrap' }}>
          <button className="btn small" onClick={() => setRecon(g)}>
            {t('Dalolatnoma')}
          </button>
          {removable && (
            <button
              className="icon-btn"
              aria-label={t('O‘chirish')}
              onClick={() =>
                actions.update((d) => {
                  d.subaccounts = d.subaccounts.filter((s) => s.code !== g.codes[0]);
                })
              }
            >
              ×
            </button>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="page">
      <PageHead title="Subschyotlar">
        {t('Subschyot — hisobvaraq ichidagi mayda, aniq hisob: kontragentlar (6010.05 — “Alfa” MChJ), soliq turlari (6410.01 — QQS), tovar va material turlari (2910.01 — Oziq-ovqat). Summalar asosiy hisobvaraq tarkibida hisoblanadi, rasmiy shakllar o‘zgarmaydi. Balansda har bir subschyot qoldig‘i alohida ko‘riladi — bir ta’minotchiga qarz passivda, boshqasiga berilgan bo‘nak aktivda.')}
      </PageHead>
      <div className="card card-pad">
        <div className="form-grid">
          <div className="field">
            <label>{t('Asosiy hisobvaraq')}</label>
            <AccountInput value={form.parent} placeholder="6010" onChange={(v) => setForm({ ...form, parent: v.split('.')[0] })} />
          </div>
          <div className="field">
            <label>{t('Raqami')}</label>
            <input className="input" placeholder={t('avtomatik')} value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
          </div>
          <div className="field">
            <label>{t('Nomi')}</label>
            <input className="input" placeholder={t('“Alfa” MChJ yoki QQS yoki Oziq-ovqat')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label>{t('STIR (kontragent bo‘lsa)')}</label>
            <input className="input" placeholder={t('ixtiyoriy')} value={form.stir} onChange={(e) => setForm({ ...form, stir: e.target.value.replace(/\D/g, '').slice(0, 14) })} />
          </div>
        </div>
        <div className="toolbar" style={{ marginTop: 10 }}>
          <button className="btn primary" onClick={create}>
            {t('Subschyot ochish')}
          </button>
          <span className="muted small">{t('Raqam bo‘sh qolsa, keyingi bo‘sh raqam beriladi. Shu kontragent boshqa hisobvaraqda ochilgan bo‘lsa, o‘sha raqam tanlanadi (6010.05 va 4310.05).')}</span>
        </div>
      </div>

      <div className="toolbar">
        <input className="input" style={{ maxWidth: 260 }} placeholder={t('Qidirish: nom, STIR, kod')} value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="chips">
          {FILTERS.map(([f, label]) => (
            <button key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
              {t(label)}
            </button>
          ))}
        </div>
        <button
          className="btn ghost danger"
          onClick={() => {
            const unused = unusedSubaccounts(doc);
            if (!unused.length) return toast('Hamma subschyotlar provodka yoki qoldiqlarda ishlatilgan');
            if (!confirm(t(`Provodka va qoldiqlarda ishlatilmagan ${unused.length} ta subschyot o‘chiriladi. Ishlatilganlari qoladi. Davom etasizmi?`))) return;
            const gone = new Set(unused);
            actions.update((d) => {
              d.subaccounts = d.subaccounts.filter((s) => !gone.has(s.code));
            });
            toast(`${unused.length} ta subschyot o‘chirildi`);
          }}
        >
          {t('Ishlatilmaganlarini o‘chirish')}
        </button>
        <label className="small" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={merge} onChange={(e) => setMerge(e.target.checked)} />
          {t('Bir xil nomli yoki STIRli subschyotlarni birlashtirish')}
        </label>
      </div>

      <div className="card table-wrap">
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <b>
            {t('Subschyotlar bo‘yicha qoldiqlar')} ({formatDate(to)} {t('holatiga')}, {t(ui.unit === 'ming' ? 'ming so‘m' : 'so‘m')})
          </b>
        </div>
        {doc.subaccounts.length === 0 ? (
          <div className="empty">{t('Hali subschyot ochilmagan.')}</div>
        ) : (
          <table className="grid">
            <thead>
              <tr>
                <th>{t('Subschyot')}</th>
                <th>{t('Nomi')}</th>
                <th className="r">{t('Boshlang‘ich qoldiq')}</th>
                <th className="r">{t('Debet aylanma')}</th>
                <th className="r">{t('Kredit aylanma')}</th>
                <th className="r">{t('Oxirgi qoldiq')}</th>
                <th>{t('Holat')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {merge
                ? groups.map(rowFor)
                : parents.map((p) => {
                    const children = groups.filter((g) => synthetic(g.codes[0]) === p);
                    const total = sum(children.flatMap((g) => g.codes));
                    return [
                      <tr key={p} className="total">
                        <td>{p}</td>
                        <td>{t(findAccount(p)?.name ?? '')}</td>
                        <td className="r">{dc(total.open)}</td>
                        <td className="r">
                          <Num v={total.dr} />
                        </td>
                        <td className="r">
                          <Num v={total.cr} />
                        </td>
                        <td className="r">{dc(total.close)}</td>
                        <td />
                        <td />
                      </tr>,
                      ...children.map(rowFor),
                    ];
                  })}
            </tbody>
          </table>
        )}
      </div>
      {recon && <ReconModal group={recon} onClose={() => setRecon(null)} />}
    </div>
  );
}

function ReconModal({ group, onClose }: { group: { name: string; stir?: string; codes: string[] }; onClose: () => void }) {
  const t = useT();
  const { h, ui } = useApp();
  const doc = h.doc;
  const r = buildReconciliation(doc, group.codes, ui.quarter);
  const bal = (net: number) => (net === 0 ? '0' : net > 0 ? `Dt ${formatAmount(net, 'som')}` : `Kt ${formatAmount(-net, 'som')}`);
  const company = doc.company.name || 'Korxona';
  const summary =
    r.closing === 0
      ? 'Davr oxirida o‘zaro qarz yo‘q.'
      : r.closing < 0
        ? `${company}ning ${group.name}ga qarzi (yoki olingan bo‘nak): ${formatAmount(-r.closing, 'som')} so‘m.`
        : `${group.name}ning ${company}ga qarzi (yoki berilgan bo‘nak): ${formatAmount(r.closing, 'som')} so‘m.`;
  const exportXlsx = async () => {
    const { exportReconciliation } = await import('../../excel/exportForms');
    await exportReconciliation(doc, group, r);
  };
  return (
    <Modal
      title={`${t('Solishtirish dalolatnomasi')}: ${group.name}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn primary" onClick={exportXlsx}>
            {t('Excelga yuklab olish')}
          </button>
          <button className="btn" onClick={onClose}>
            {t('Yopish')}
          </button>
        </>
      }
    >
      <p className="muted small">
        {formatDate(r.period.from)} – {formatDate(r.period.to)} · {company}
        {group.stir ? ` · ${t('kontragent STIR')} ${group.stir}` : ''} · {t('subschyotlar')}: {group.codes.join(', ')}
      </p>
      <table className="grid">
        <thead>
          <tr>
            <th>{t('Sana')}</th>
            <th>{t('Mazmun')}</th>
            <th>{t('Hisobvaraqlar')}</th>
            <th className="r">{t('Debet')}</th>
            <th className="r">{t('Kredit')}</th>
            <th className="r">{t('Qoldiq')}</th>
          </tr>
        </thead>
        <tbody>
          <tr className="header">
            <td />
            <td>{t('Davr boshiga qoldiq')}</td>
            <td />
            <td />
            <td />
            <td className="r">{bal(r.opening)}</td>
          </tr>
          {r.rows.map((x, i) => (
            <tr key={i}>
              <td>{formatDate(x.date)}</td>
              <td>{x.text}</td>
              <td className="muted">{x.accounts}</td>
              <td className="r">{x.dr ? formatAmount(x.dr, 'som') : ''}</td>
              <td className="r">{x.cr ? formatAmount(x.cr, 'som') : ''}</td>
              <td className="r">{bal(x.balance)}</td>
            </tr>
          ))}
          <tr className="total">
            <td />
            <td>{t('Aylanma')}</td>
            <td />
            <td className="r">{formatAmount(r.turnoverDr, 'som')}</td>
            <td className="r">{formatAmount(r.turnoverCr, 'som')}</td>
            <td />
          </tr>
          <tr className="total">
            <td />
            <td>{t('Davr oxiriga qoldiq')}</td>
            <td />
            <td />
            <td />
            <td className="r">{bal(r.closing)}</td>
          </tr>
        </tbody>
      </table>
      <p>{t(summary)}</p>
    </Modal>
  );
}
