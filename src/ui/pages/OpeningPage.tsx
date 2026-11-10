import { useState } from 'react';
import { isKnownAccount } from '../../engine/accounts';
import { rollToNextYear } from '../../engine/closing';
import { formatAmount } from '../../engine/money';
import { useT } from '../../i18n/useT';
import { forgetFileHandle, saveDocToFile } from '../../store/fileIO';
import { actions, getState, isDirty, useApp } from '../../store/store';
import { AccountInput, AccountLabel, AmountInput, PageHead, toast } from '../components/common';

export function OpeningPage({ onImport }: { onImport: () => void }) {
  const t = useT();
  const { h } = useApp();
  const doc = h.doc;
  const [row, setRow] = useState({ account: '', debit: 0, credit: 0 });
  const [err, setErr] = useState('');
  const dr = doc.opening.reduce((s, o) => s + o.debit, 0);
  const cr = doc.opening.reduce((s, o) => s + o.credit, 0);
  const sorted = doc.opening.map((o, i) => ({ o, i })).sort((a, b) => a.o.account.localeCompare(b.o.account));

  const add = () => {
    const code = row.account.trim();
    if (!isKnownAccount(code, doc.subaccounts)) return setErr(`Hisobvaraq topilmadi: ${code || '(bo‘sh)'}`);
    if (doc.opening.some((o) => o.account === code)) return setErr(`${code} allaqachon ro‘yxatda — summasini jadvalda o‘zgartiring.`);
    if (!row.debit && !row.credit) return setErr('Debet yoki kredit qoldiqni kiriting.');
    actions.update((d) => {
      d.opening.push({ account: code, debit: row.debit, credit: row.credit });
    });
    setRow({ account: '', debit: 0, credit: 0 });
    setErr('');
  };

  const rollOver = async () => {
    const next = doc.year + 1;
    if (!confirm(t(`${doc.year}-yil yopiladi: daromad va xarajatlar 9910 orqali 8710 ga o‘tkaziladi, qoldiqlar ${next}-yil boshiga ko‘chiriladi va 2-shaklning o‘tgan yil ustuni to‘ldiriladi. Avval joriy yil faylini saqlaymizmi?`))) return;
    if (isDirty()) {
      const name = await saveDocToFile(getState().h.doc, true);
      if (!name) return;
    }
    forgetFileHandle();
    actions.replaceDoc(rollToNextYear(getState().h.doc), null, false);
    toast(`${next}-yil fayli tayyor. Uni alohida faylga saqlang.`);
  };

  return (
    <div className="page">
      <PageHead title={`${doc.year}-yil boshidagi qoldiqlar`}>
        {t('O‘tgan yil oxiridagi aylanma-saldo qaydnomasidan qoldiqlarni kiriting (so‘mda). Balansning “yil boshi” ustuni shulardan tuziladi. Yangi tashkil etilgan korxona bo‘lsa, bo‘sh qoldiring.')}
      </PageHead>
      <div className="toolbar">
        <button className="btn" onClick={onImport}>
          {t('Exceldan import')}
        </button>
        <button className="btn" onClick={rollOver}>
          {t(`Yilni yopish va ${doc.year + 1}-yilga o‘tish`)}
        </button>
        <span className="muted small">{t('Excel ustunlari: Hisobvaraq, Debet qoldiq, Kredit qoldiq')}</span>
      </div>
      <div className="card table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th style={{ width: 120 }}>{t('Hisobvaraq')}</th>
              <th>{t('Nomi')}</th>
              <th className="r" style={{ width: 200 }}>
                {t('Debet qoldiq')}
              </th>
              <th className="r" style={{ width: 200 }}>
                {t('Kredit qoldiq')}
              </th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ o, i }) => (
              <tr key={o.account + i}>
                <td className="code">{o.account}</td>
                <td>
                  <AccountLabel code={o.account} />
                </td>
                <td>
                  <AmountInput
                    lazy
                    value={o.debit}
                    onChange={(v) =>
                      actions.update((d) => {
                        d.opening[i].debit = v;
                      })
                    }
                  />
                </td>
                <td>
                  <AmountInput
                    lazy
                    value={o.credit}
                    onChange={(v) =>
                      actions.update((d) => {
                        d.opening[i].credit = v;
                      })
                    }
                  />
                </td>
                <td>
                  <button
                    className="icon-btn"
                    aria-label={t('O‘chirish')}
                    onClick={() =>
                      actions.update((d) => {
                        d.opening.splice(i, 1);
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
                <AccountInput value={row.account} placeholder={t('Kod')} onChange={(v) => setRow({ ...row, account: v })} onEnter={add} />
              </td>
              <td className="muted">
                {row.account ? <AccountLabel code={row.account} /> : t('Hisobvaraq qo‘shish')}
              </td>
              <td>
                <AmountInput value={row.debit} onChange={(v) => setRow((r) => ({ ...r, debit: v }))} onEnter={add} />
              </td>
              <td>
                <AmountInput value={row.credit} onChange={(v) => setRow((r) => ({ ...r, credit: v }))} onEnter={add} />
              </td>
              <td>
                <button className="btn small" onClick={add} aria-label={t('Qo‘shish')}>
                  +
                </button>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td />
              <td>{t('Jami')}</td>
              <td className="r">{formatAmount(dr, 'som')}</td>
              <td className="r">{formatAmount(cr, 'som')}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {err && <div className="err-text small">{t(err)}</div>}
      <div className={dr === cr ? 'ok-text small' : 'err-text small'}>
        {dr === cr ? `✓ ${t('Debet va kredit qoldiqlari teng.')}` : `! ${t('Farq')}: ${formatAmount(dr - cr, 'som')} ${t('so‘m — debet va kredit teng bo‘lishi kerak.')}`}
      </div>
    </div>
  );
}
