import { useState } from 'react';
import { formatDate } from '../../engine/period';
import { buildTrialBalance } from '../../engine/trialBalance';
import { useT } from '../../i18n/useT';
import { useApp } from '../../store/store';
import { Num, PageHead } from '../components/common';
import { FormPage } from '../forms/FormPage';

/** 1-shakl with its off-balance and overdue-debts annexes. */
export const BalancePage = () => <FormPage key="balance" group="balance" />;
/** 2-shakl with the budget payments annex. */
export const IncomePage = () => <FormPage key="income" group="income" />;
/** Profit tax calculation with annexes 1–11. */
export const TaxPage = () => <FormPage key="tax" group="tax" />;

export function TrialBalancePage() {
  const t = useT();
  const { h, ui } = useApp();
  const tb = buildTrialBalance(h.doc, ui.quarter);
  const [showSubs, setShowSubs] = useState(true);
  return (
    <div className="page">
      <PageHead title="Aylanma-saldo qaydnomasi">
        {formatDate(tb.period.from)} – {formatDate(tb.period.to)}, {t(ui.unit === 'ming' ? 'ming so‘m' : 'so‘m')}. {t('Debet va kredit jamilari har bir ustunda teng bo‘lishi kerak.')}
      </PageHead>
      <label className="small" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
        <input type="checkbox" checked={showSubs} onChange={(e) => setShowSubs(e.target.checked)} />
        {t('Subschyotlarni ko‘rsatish')}
      </label>
      <div className="card table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th rowSpan={2}>{t('Hisobvaraq')}</th>
              <th rowSpan={2}>{t('Nomi')}</th>
              <th className="c" colSpan={2}>
                {t('Davr boshiga qoldiq')}
              </th>
              <th className="c" colSpan={2}>
                {t('Aylanma')}
              </th>
              <th className="c" colSpan={2}>
                {t('Davr oxiriga qoldiq')}
              </th>
            </tr>
            <tr>
              {['Debet', 'Kredit', 'Debet', 'Kredit', 'Debet', 'Kredit'].map((x, i) => (
                <th key={i} className="r">
                  {t(x)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tb.rows
              .filter((r) => showSubs || r.level === 'syn')
              .map((r) => (
                <tr key={r.code} className={r.level === 'sub' ? 'sub' : ''}>
                  <td className="code">{r.code}</td>
                  <td>{r.level === 'sub' ? r.name : t(r.name)}</td>
                  {[r.openDr, r.openCr, r.dr, r.cr, r.closeDr, r.closeCr].map((v, i) => (
                    <td key={i} className="r">
                      <Num v={v} blankZero />
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
          <tfoot>
            <tr>
              <td />
              <td>{t('Jami (balans hisobvaraqlari)')}</td>
              {[tb.totals.openDr, tb.totals.openCr, tb.totals.dr, tb.totals.cr, tb.totals.closeDr, tb.totals.closeCr].map((v, i) => (
                <td key={i} className="r">
                  <Num v={v} />
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
