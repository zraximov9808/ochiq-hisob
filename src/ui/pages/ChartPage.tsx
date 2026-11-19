import { useMemo, useState } from 'react';
import { CHART, searchAccounts, type Account, type AccountKind } from '../../engine/accounts';
import { useT } from '../../i18n/useT';
import { useApp } from '../../store/store';
import { PageHead } from '../components/common';

const KIND: Record<AccountKind, string> = { A: 'Aktiv', P: 'Passiv', T: 'Tranzit', KA: 'Kontr-aktiv', Z: 'Balansdan tashqari', '': '' };

/** The chart of accounts (1C, Uzbek names) with search by code, Uzbek or Russian name; counterparty subaccounts under their account. */
export function ChartPage() {
  const t = useT();
  const { h } = useApp();
  const subs = h.doc.subaccounts;
  const [q, setQ] = useState('');
  const [onlyUsed, setOnlyUsed] = useState(false);

  const used = useMemo(() => {
    const s = new Set<string>();
    for (const e of h.doc.entries) s.add(e.debit).add(e.credit);
    for (const o of h.doc.opening) s.add(o.account);
    return s;
  }, [h.doc.entries, h.doc.opening]);

  const rows = useMemo(() => {
    const list: Account[] = q.trim() ? searchAccounts(q, subs, 2000) : CHART;
    const filtered = onlyUsed ? list.filter((a) => a.group || [...used].some((c) => c === a.code || c.startsWith(a.code + '.'))) : list;
    // Counterparty subaccounts go right under their chart account.
    const out: Array<{ a: Account; sub?: boolean }> = [];
    for (const a of filtered) {
      if (!CHART.some((c) => c.code === a.code)) continue;
      out.push({ a });
      for (const s of subs.filter((x) => x.parent === a.code)) {
        if (!q.trim() || filtered.some((f) => f.code === s.code) || filtered.includes(a))
          out.push({ a: { code: s.code, name: s.stir ? `${s.name} (STIR ${s.stir})` : s.name, nameRu: '', kind: a.kind, currency: a.currency, parent: a.code, offBalance: a.offBalance, group: false }, sub: true });
      }
    }
    return out;
  }, [q, onlyUsed, subs, used]);

  return (
    <div className="page">
      <PageHead title="Hisobvaraqlar rejasi">
        {t('1C (O‘zbekiston) hisobvaraqlar rejasi: kod, o‘zbekcha nom, 1C dagi asl nom, turi va valyuta belgisi. Kontragent subschyotlari o‘z hisobvarag‘i ostida.')}
      </PageHead>
      <div className="toolbar">
        <input className="input" style={{ maxWidth: 360 }} placeholder={t('Qidirish: kod yoki nom (o‘zbekcha yoki ruscha)')} value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="small" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={onlyUsed} onChange={(e) => setOnlyUsed(e.target.checked)} />
          {t('Faqat ishlatilganlar')}
        </label>
        <span className="muted small">
          {rows.filter((r) => !r.sub).length} / {CHART.length}
        </span>
      </div>
      <div className="card table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>{t('Kod')}</th>
              <th>{t('Nomi')}</th>
              <th>{t('Turi')}</th>
              <th className="c">{t('Valyuta')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ a, sub }) =>
              a.group ? (
                <tr key={a.code} className="section">
                  <td>{a.code}</td>
                  <td colSpan={3}>{t(a.name)}</td>
                </tr>
              ) : (
                <tr key={a.code} className={sub ? 'sub' : ''}>
                  <td className="code">{a.code}</td>
                  <td>
                    {sub ? a.name : t(a.name)}
                    {a.nameRu && <div className="muted small">{a.nameRu}</div>}
                    {sub && <span className="tag">{t('subschyot')}</span>}
                  </td>
                  <td className="muted small">{t(KIND[a.kind])}</td>
                  <td className="c">{a.currency ? '✓' : ''}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
