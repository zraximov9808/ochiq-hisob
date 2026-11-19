import type { ReactNode } from 'react';
import { accountName } from '../../engine/accounts';
import { formatAmount } from '../../engine/money';
import { formatDate } from '../../engine/period';
import { taxSign } from '../../engine/taxSuggest';
import type { Entry } from '../../engine/types';
import { useT } from '../../i18n/useT';
import { useApp } from '../../store/store';
import { Modal, Num } from './common';

export type Drill = { title: string; body: ReactNode } | null;

/** Accounts behind a report line, with start/end balances or one amount. */
export function AccountsDrill({ rows, unit }: { rows: Array<{ account: string; start?: number; end?: number; amount?: number }>; unit: 'som' | 'ming' }) {
  const t = useT();
  const { h } = useApp();
  const twoCols = rows.some((r) => r.start !== undefined);
  return (
    <table className="grid">
      <thead>
        <tr>
          <th>{t('Hisobvaraq')}</th>
          <th>{t('Nomi')}</th>
          {twoCols ? (
            <>
              <th className="r">{t('Yil boshi')}</th>
              <th className="r">{t('Davr oxiri')}</th>
            </>
          ) : (
            <th className="r">{t('Summa')}</th>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.account}>
            <td className="code">{r.account}</td>
            <td>{r.account.includes('.') ? accountName(r.account, h.doc.subaccounts) : t(accountName(r.account))}</td>
            {twoCols ? (
              <>
                <td className="r">
                  <Num v={r.start} unit={unit} />
                </td>
                <td className="r">
                  <Num v={r.end} unit={unit} />
                </td>
              </>
            ) : (
              <td className="r">
                <Num v={r.amount} unit={unit} />
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Journal entries behind a profit-tax line, signed as the line counts them. */
export function EntriesDrill({ entries, lineId }: { entries: Entry[]; lineId: string }) {
  const t = useT();
  const total = entries.reduce((s, e) => s + taxSign(e, lineId) * e.amount, 0);
  return (
    <table className="grid">
      <thead>
        <tr>
          <th>{t('Sana')}</th>
          <th>{t('Mazmun')}</th>
          <th>{t('Debet')}</th>
          <th>{t('Kredit')}</th>
          <th className="r">{t('Summa')}</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <tr key={e.id}>
            <td>{formatDate(e.date)}</td>
            <td>
              {e.text} {e.tax?.nonDeductible && <span className="tag warn">{t('chegirilmaydi')}</span>}
            </td>
            <td className="dt-code">{e.debit}</td>
            <td className="kt-code">{e.credit}</td>
            <td className="r">{formatAmount(taxSign(e, lineId) * e.amount, 'som')}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={4}>{t('Jami')}</td>
          <td className="r">{formatAmount(total, 'som')}</td>
        </tr>
      </tfoot>
    </table>
  );
}

export function DrillModal({ drill, onClose }: { drill: NonNullable<Drill>; onClose: () => void }) {
  const t = useT();
  return (
    <Modal
      title={drill.title}
      onClose={onClose}
      wide
      footer={
        <button className="btn" onClick={onClose}>
          {t('Yopish')}
        </button>
      }
    >
      {drill.body}
    </Modal>
  );
}
