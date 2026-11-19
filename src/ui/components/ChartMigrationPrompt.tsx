import { useMemo, useState } from 'react';
import { accountName } from '../../engine/accounts';
import { applyChartMigration, OLD_MEANING, planChartMigration } from '../../engine/migrate';
import { useT } from '../../i18n/useT';
import { actions, useApp } from '../../store/store';
import { Modal, toast } from './common';

/** Asks once per company and visit to move a document written on the previous chart to the 1C chart. */
export function ChartMigrationPrompt() {
  const t = useT();
  const { h, co } = useApp();
  const plan = useMemo(() => planChartMigration(h.doc), [h.doc]);
  const [later, setLater] = useState<string[]>([]);
  if (!plan.length || later.includes(co.currentId)) return null;
  const close = () => setLater([...later, co.currentId]);
  const migrate = () => {
    actions.update((d) => applyChartMigration(d));
    toast('Hujjat yangi hisobvaraqlar rejasiga o‘tkazildi (Ctrl+Z — qaytarish)');
  };
  return (
    <Modal
      title={t('Hujjat yangi hisobvaraqlar rejasiga o‘tkazilsinmi?')}
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>
            {t('Hozir emas')}
          </button>
          <button className="btn primary" onClick={migrate}>
            {t('O‘tkazish')}
          </button>
        </>
      }
    >
      <p>{t('Bu hujjat dasturning oldingi hisobvaraqlar rejasida yozilgan. Yangi (1C) rejada quyidagi kodlarning ma’nosi o‘zgargan — o‘tkazilmasa, ular hisobotlarda boshqa satrga tushadi:')}</p>
      <table className="grid">
        <thead>
          <tr>
            <th>{t('Eski kod')}</th>
            <th>{t('Yangi kod')}</th>
            <th className="r">{t('Provodkalar')}</th>
          </tr>
        </thead>
        <tbody>
          {plan.map((r) => (
            <tr key={`${r.from}>${r.to}`}>
              <td>
                <b>{r.from}</b> <span className="muted">— {t(OLD_MEANING[r.from] ?? '')}</span>
              </td>
              <td>
                <b>{r.to}</b> <span className="muted">— {t(accountName(r.to))}</span>
              </td>
              <td className="r">{r.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">
        {t('Balans o‘zgarmaydi. Soliq turlari 6410 dan provodka matniga qarab ajratiladi (QQS va noaniqlari 6410 da qoladi). Avto-provodkalar yuklangan hujjatlardan yangi rejada qayta tuziladi. Ctrl+Z bilan qaytarish mumkin; “Hozir emas” bosilsa, eslatma o‘ng paneldagi “Eslatmalar”da qoladi.')}
      </p>
    </Modal>
  );
}
