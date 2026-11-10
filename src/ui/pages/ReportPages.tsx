import { useState, type ReactNode } from 'react';
import { accountName } from '../../engine/accounts';
import { formatAmount } from '../../engine/money';
import { formatDate } from '../../engine/period';
import { TAX_LINES, TAX_MAIN_LINES } from '../../engine/taxLines';
import { taxSign } from '../../engine/taxSuggest';
import { buildTrialBalance } from '../../engine/trialBalance';
import type { Entry } from '../../engine/types';
import { useT } from '../../i18n/useT';
import { useApp } from '../../store/store';
import { Modal, Num, PageHead } from '../components/common';
import { useReport } from '../report';

type Drill = { title: string; body: ReactNode } | null;

function ExportButton({ kind, label }: { kind: 'balance' | 'income' | 'tax'; label: string }) {
  const t = useT();
  const { h, ui } = useApp();
  const r = useReport();
  const run = async () => {
    const x = await import('../../excel/exportForms');
    await x.exportForm(kind, h.doc, ui.quarter, r);
  };
  return (
    <button className="btn primary" onClick={run}>
      {t(label)}
    </button>
  );
}

function AccountsDrill({ rows, unit }: { rows: Array<{ account: string; start?: number; end?: number; amount?: number }>; unit: 'som' | 'ming' }) {
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

function DrillModal({ drill, onClose }: { drill: NonNullable<Drill>; onClose: () => void }) {
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

export function BalancePage() {
  const t = useT();
  const { ui } = useApp();
  const r = useReport();
  const [drill, setDrill] = useState<Drill>(null);
  const f = r.balance;
  return (
    <div className="page">
      <PageHead title="Buxgalteriya balansi (1-shakl)">
        {formatDate(f.date.end)} {t('holatiga')}, {t(ui.unit === 'ming' ? 'ming so‘m' : 'so‘m')}.{' '}
        {t('Yil boshi — kiritilgan qoldiqlardan, davr oxiri — qoldiqlar va provodkalardan. Satrni bossangiz, qaysi hisobvaraqlardan tuzilgani ko‘rinadi.')}
      </PageHead>
      <div className="toolbar">
        <ExportButton kind="balance" label="To‘ldirilgan 1-shaklni yuklab olish (.xlsx)" />
        <span className="muted small">{t('shakl ming so‘mda')}</span>
      </div>
      <div className="card table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>{t('Ko‘rsatkich')}</th>
              <th className="c">{t('Satr')}</th>
              <th className="r">{t('Yil boshiga')}</th>
              <th className="r">{t('Davr oxiriga')}</th>
            </tr>
          </thead>
          <tbody>
            {f.lines.map((l, i) => {
              if (l.kind === 'section' || l.kind === 'header')
                return (
                  <tr key={i} className={l.kind}>
                    <td colSpan={4}>{t(l.label)}</td>
                  </tr>
                );
              const contrib = f.contrib[l.code];
              const click = contrib?.length
                ? () => setDrill({ title: `${l.code}: ${t(l.label)}`, body: <AccountsDrill rows={contrib} unit={ui.unit} /> })
                : undefined;
              return (
                <tr key={i} className={`${l.kind === 'total' ? 'total' : ''} ${click ? 'clickable' : ''}`} onClick={click}>
                  <td>{t(l.label)}</td>
                  <td className="c code">{l.code}</td>
                  <td className="r">{l.manual ? '' : <Num v={l.start} blankZero={l.kind !== 'total'} />}</td>
                  <td className="r">{l.manual ? '' : <Num v={l.end} blankZero={l.kind !== 'total'} />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {drill && <DrillModal drill={drill} onClose={() => setDrill(null)} />}
    </div>
  );
}

export function IncomePage() {
  const t = useT();
  const { ui } = useApp();
  const r = useReport();
  const [drill, setDrill] = useState<Drill>(null);
  const f = r.income;
  /** Income/expense lines use one column ('x' in the other); results go to profit or loss by sign. */
  const cell = (v: number | undefined, col: 'inc' | 'exp' | 'res', want: 'inc' | 'exp') => {
    if (col !== 'res' && col !== want) return 'x';
    if (v === undefined) return '';
    if (col !== 'res') return <Num v={v} />;
    if (v > 0) return want === 'inc' ? <Num v={v} /> : '';
    if (v < 0) return want === 'exp' ? <Num v={-v} /> : '';
    return want === 'inc' ? '0' : '';
  };
  return (
    <div className="page">
      <PageHead title="Moliyaviy natijalar to‘g‘risida hisobot (2-shakl)">
        {formatDate(f.period.from)} – {formatDate(f.period.to)}, {t(ui.unit === 'ming' ? 'ming so‘m' : 'so‘m')}.{' '}
        {t('Daromad va xarajat hisobvaraqlarining davr aylanmalaridan tuziladi; 9910 ga yopish provodkalari ikki marta hisoblanmaydi. O‘tgan yil ustuni Sozlamalarda yoki yilni yopishda to‘ldiriladi.')}
      </PageHead>
      <div className="toolbar">
        <ExportButton kind="income" label="To‘ldirilgan 2-shaklni yuklab olish (.xlsx)" />
      </div>
      <div className="card table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>{t('Ko‘rsatkich')}</th>
              <th className="c">{t('Satr')}</th>
              <th className="r">{t('O‘tgan yil: daromad (foyda)')}</th>
              <th className="r">{t('O‘tgan yil: xarajat (zarar)')}</th>
              <th className="r">{t('Hisobot davri: daromad (foyda)')}</th>
              <th className="r">{t('Hisobot davri: xarajat (zarar)')}</th>
            </tr>
          </thead>
          <tbody>
            {f.lines.map((l) => {
              const contrib = f.contrib[l.code];
              const click = contrib?.length
                ? () => setDrill({ title: `${l.code}: ${t(l.label)}`, body: <AccountsDrill rows={contrib} unit={ui.unit} /> })
                : undefined;
              return (
                <tr key={l.code} className={`${l.total ? 'total' : ''} ${click ? 'clickable' : ''}`} onClick={click}>
                  <td>{t(l.label)}</td>
                  <td className="c code">{l.code}</td>
                  <td className="r">{cell(f.prev[l.code], l.col, 'inc')}</td>
                  <td className="r">{cell(f.prev[l.code], l.col, 'exp')}</td>
                  <td className="r">{cell(f.byCode[l.code], l.col, 'inc')}</td>
                  <td className="r">{cell(f.byCode[l.code], l.col, 'exp')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {drill && <DrillModal drill={drill} onClose={() => setDrill(null)} />}
    </div>
  );
}

function EntriesDrill({ entries, lineId }: { entries: Entry[]; lineId: string }) {
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

export function TaxPage() {
  const t = useT();
  const r = useReport();
  const [drill, setDrill] = useState<Drill>(null);
  const x = r.tax;
  const openLines = (ids: string[], title: string) => {
    const entries = ids.flatMap((id) => (x.sources[id] ?? []).map((e) => ({ e, id })));
    if (!entries.length) return;
    setDrill({
      title,
      body: (
        <>
          {ids.map((id) =>
            x.sources[id]?.length ? (
              <div key={id} style={{ marginBottom: 14 }}>
                <b>{t(TAX_LINES.find((l) => l.id === id)!.label)}</b>
                <EntriesDrill entries={x.sources[id]} lineId={id} />
              </div>
            ) : null,
          )}
        </>
      ),
    });
  };
  const incomeIds = TAX_LINES.filter((l) => l.annex === 1).map((l) => l.id);
  const expenseIds = TAX_LINES.filter((l) => l.annex === 2).map((l) => l.id);
  const linkNum = (v: number, ids: string[], title: string) =>
    ids.some((id) => x.sources[id]?.length) ? (
      <button className="link-num" onClick={() => openLines(ids, title)}>
        {formatAmount(v, 'som')}
      </button>
    ) : (
      formatAmount(v, 'som')
    );

  return (
    <div className="page">
      <PageHead title="Foyda solig‘i hisob-kitobi">
        {formatDate(x.period.from)} – {formatDate(x.period.to)}, {t('so‘m, o‘sib boruvchi tartibda. Provodkalardan yig‘ilgan satrlar avtomatik, qolganlari 0. Summani bossangiz, qaysi provodkalardan yig‘ilgani chiqadi.')}
      </PageHead>
      <div className="toolbar">
        <ExportButton kind="tax" label="To‘ldirilgan hisob-kitobni yuklab olish (.xlsx)" />
        <span className="muted small">{t('asosiy shakl, 1-ilova va 2-ilova')}</span>
      </div>

      <div className="card table-wrap">
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <b>{t('Asosiy shakl')}</b>
        </div>
        <table className="grid">
          <thead>
            <tr>
              <th className="c">{t('Satr')}</th>
              <th>{t('Ko‘rsatkich')}</th>
              <th className="r">{t('Summa')}</th>
            </tr>
          </thead>
          <tbody>
            {TAX_MAIN_LINES.map((l) => {
              const v = x.main[l.code] ?? 0;
              return (
                <tr key={l.code} className={l.bold ? 'total' : ''}>
                  <td className="c code">{l.code}</td>
                  <td>{t(l.label)}</td>
                  <td className="r">
                    {l.rate
                      ? `${v}%`
                      : l.code === '010'
                        ? linkNum(v, incomeIds, t('Jami daromadlar'))
                        : l.code === '020'
                          ? linkNum(v, expenseIds, t('Chegiriladigan xarajatlar'))
                          : formatAmount(v, 'som')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card table-wrap">
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <b>{t('1-ilova. Jami daromadlar')}</b>
        </div>
        <table className="grid">
          <thead>
            <tr>
              <th className="c">{t('Satr')}</th>
              <th>{t('Ko‘rsatkich')}</th>
              <th className="r">{t('Summa')}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="total">
              <td className="c code">010</td>
              <td>{t('Jami daromadlar')}</td>
              <td className="r">{formatAmount(x.annex1['010'] ?? 0, 'som')}</td>
            </tr>
            <tr className="total">
              <td className="c code">020</td>
              <td>{t('Tovar (ish, xizmat)larni realizatsiya qilishdan daromadlar — jami (021–026)')}</td>
              <td className="r">{formatAmount(x.annex1['020'] ?? 0, 'som')}</td>
            </tr>
            {TAX_LINES.filter((l) => l.annex === 1).map((l) => (
              <tr key={l.id}>
                <td className="c code">{l.code}</td>
                <td>
                  {t(l.label)} {!l.verified && <span className="tag warn">{t('shakl bilan solishtiring')}</span>}
                </td>
                <td className="r">{linkNum(x.annex1[l.code] ?? 0, [l.id], `${l.code} ${t(l.label)}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card table-wrap">
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <b>{t('2-ilova. Xarajatlar')}</b>
          <div className="muted small">{t('3-ustun — jami xarajatlar, 4-ustun — shundan chegirilmaydiganlari. Chegiriladigan xarajat = 3-ustun − 4-ustun.')}</div>
        </div>
        <table className="grid">
          <thead>
            <tr>
              <th className="c">{t('Satr')}</th>
              <th>{t('Ko‘rsatkich')}</th>
              <th className="r">{t('3-ustun: jami')}</th>
              <th className="r">{t('4-ustun: chegirilmaydi')}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="total">
              <td className="c code">010</td>
              <td>{t('Jami xarajatlar')}</td>
              <td className="r">{formatAmount(x.annex2['010'].total, 'som')}</td>
              <td className="r">{formatAmount(x.annex2['010'].nonDeductible, 'som')}</td>
            </tr>
            {TAX_LINES.filter((l) => l.annex === 2).map((l) => (
              <tr key={l.id}>
                <td className="c code">{l.code}</td>
                <td>{t(l.label)}</td>
                <td className="r">{linkNum(x.annex2[l.code]?.total ?? 0, [l.id], `${l.code} ${t(l.label)}`)}</td>
                <td className="r">{formatAmount(x.annex2[l.code]?.nonDeductible ?? 0, 'som')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="card-pad muted small">
          {t('Eslatma: xarajatlarning moddalar bo‘yicha tarkibi (2-ilova II bo‘lim, 0101–0137-satrlar) va 3–11-ilovalar bu versiyada to‘ldirilmaydi — ularni soliq hisobotida qo‘lda kiriting.')}
        </div>
      </div>
      {drill && <DrillModal drill={drill} onClose={() => setDrill(null)} />}
    </div>
  );
}

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
