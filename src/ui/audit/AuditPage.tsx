import { useEffect, useMemo, useRef, useState } from 'react';
import { isInvoiceSheet, parseInvoices, type Invoice } from '../../audit/invoices';
import { KIND_LABEL, buildAudit, type AuditResult, type CounterpartyRow } from '../../audit/settlement';
import { analyze } from '../../bank/analyze';
import { companySlug } from '../../bank/names';
import type { ParsedStatement } from '../../bank/model';
import { parseStatements } from '../../bank/parsers/detect';
import { readWorkbookRows } from '../../bank/parsers/rows';
import { useT } from '../../i18n/useT';
import { downloadBlob } from '../../store/fileIO';
import { Modal, toast } from '../components/common';
import { bankActions, loadBank, rulesOf, useBank, type FileResult } from '../bank/bankStore';
import { Money, fmtDay } from '../bank/format';

type Filter = 'all' | 'debitor' | 'kreditor' | 'yopiq' | 'NO_INVOICE' | 'NO_PAYMENT';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const safeName = companySlug;

export default function AuditPage() {
  const t = useT();
  const bank = useBank();
  const [includePending, setIncludePending] = useState(false);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<CounterpartyRow | null>(null);

  useEffect(() => {
    void loadBank();
  }, []);

  const analysis = useMemo(
    () => (bank.statements.length ? analyze(bank.statements, rulesOf(bank), bank.overrides, bank.settings) : null),
    [bank.statements, bank.overrides, bank.rules, bank.settings],
  );
  const audit = useMemo<AuditResult | null>(
    () =>
      analysis || bank.invoices.length
        ? buildAudit(analysis, bank.invoices, { includePending, from: from ?? undefined, to: to ?? undefined })
        : null,
    [analysis, bank.invoices, includePending, from, to],
  );

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, debitor: 0, kreditor: 0, yopiq: 0, NO_INVOICE: 0, NO_PAYMENT: 0 };
    for (const r of audit?.rows ?? []) {
      c.all++;
      c[r.side]++;
      for (const f of r.flags) c[f]++;
    }
    return c;
  }, [audit]);
  const q = query.trim().toLowerCase();
  const rows = (audit?.rows ?? []).filter(
    (r) =>
      (filter === 'all' || r.side === filter || r.flags.includes(filter as 'NO_INVOICE')) &&
      (!q || r.name.toLowerCase().includes(q) || r.inn.includes(q)),
  );

  const exportAll = async () => {
    if (!audit) return;
    const { buildAuditWorkbook } = await import('../../audit/exportAudit');
    const buf = await (await buildAuditWorkbook(audit)).xlsx.writeBuffer();
    downloadBlob(new Blob([buf], { type: XLSX }), `${safeName(audit.companyName)}_ekspres_audit_${(audit.period.to || '').slice(0, 4)}.xlsx`);
  };

  const FILTERS: Array<[Filter, string]> = [
    ['all', 'Hammasi'],
    ['debitor', 'Debitorlar'],
    ['kreditor', 'Kreditorlar'],
    ['yopiq', 'Yopiq'],
    ['NO_INVOICE', 'Pul bor, faktura yo‘q'],
    ['NO_PAYMENT', 'Faktura bor, pul yo‘q'],
  ];

  return (
    <div className="page bank">
      <div className="bank-head">
        <div>
          <h1>{t('Ekspres audit')}</h1>
          <p className="muted">
            {t('Bank vipiskalari va hisob-fakturalar bo‘yicha har bir korxona bilan oldi-berdi: kirgan va chiqqan pul, kirgan va chiqqan faktura, debitor va kreditor qarz.')}
          </p>
        </div>
        <div className="toolbar">
          <button className="btn primary" disabled={!audit?.rows.length} onClick={exportAll}>
            {t('Excel yuklab olish')}
          </button>
          <button
            className="btn"
            disabled={!bank.invoices.length}
            onClick={() => confirm(t('Yuklangan hisob-fakturalar o‘chirilsinmi? Bank vipiskalari qoladi.')) && bankActions.clearInvoices()}
          >
            {t('Fakturalarni tozalash')}
          </button>
        </div>
      </div>

      <Upload />

      {audit && (
        <>
          <div className="card card-pad toolbar" style={{ alignItems: 'flex-end' }}>
            <div className="small">
              <b>{audit.companyName || t('Korxona')}</b> {audit.companyInn && `· STIR ${audit.companyInn}`}
              <div className="muted">
                {t('Bank')}: {analysis ? `${analysis.accounts.length} ${t('ta hisob')}, ${analysis.operations.length} ${t('ta operatsiya')}` : t('yuklanmagan')} · {t('Fakturalar')}: {bank.invoices.length}
              </div>
            </div>
            <div className="field">
              <label>{t('Davr (dan)')}</label>
              <input className="input" type="date" value={from ?? audit.period.from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="field">
              <label>{t('Davr (gacha)')}</label>
              <input className="input" type="date" value={to ?? audit.period.to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <label className="small" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={includePending} onChange={(e) => setIncludePending(e.target.checked)} />
              {t('Imzolanmagan (Ожидает) fakturalarni ham hisoblash')}
            </label>
          </div>

          {!analysis && <div className="banner warn">{t('Bank vipiskasi yuklanmagan — faqat fakturalar ko‘rsatilmoqda. Vipiskalarni shu yerga yoki “Bank vipiska” bo‘limiga yuklang.')}</div>}
          {!bank.invoices.length && <div className="banner warn">{t('Hisob-fakturalar yuklanmagan — faqat bank to‘lovlari ko‘rsatilmoqda.')}</div>}

          <div className="kpi-grid">
            {[
              ['Kirgan pul', audit.totals.moneyIn, 'ok'],
              ['Chiqqan pul', audit.totals.moneyOut, 'kt'],
              ['Kirgan faktura', audit.totals.invIn, 'kt'],
              ['Chiqqan faktura', audit.totals.invOut, 'ok'],
              ['Debitorlik (bizga qarz)', audit.totals.debitor, 'brand'],
              ['Kreditorlik (bizning qarzimiz)', audit.totals.kreditor, 'warn'],
            ].map(([label, v, tone]) => (
              <div key={label as string} className={`card kpi ${tone}`}>
                <div className="muted small">{t(label as string)}</div>
                <div className="kpi-value">
                  <Money v={v as number} />
                </div>
              </div>
            ))}
          </div>

          <div className="toolbar">
            <input className="input" style={{ maxWidth: 260 }} placeholder={t('Qidirish: nomi yoki STIR')} value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="chips">
              {FILTERS.map(([f, label]) => (
                <button key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
                  {t(label)} ({counts[f]})
                </button>
              ))}
            </div>
          </div>

          <div className="card table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th>{t('Kontragent')}</th>
                  <th className="r">{t('Kirgan pul')}</th>
                  <th className="r">{t('Chiqqan pul')}</th>
                  <th className="r">{t('Kirgan faktura')}</th>
                  <th className="r">{t('Chiqqan faktura')}</th>
                  <th className="r">{t('Debitor')}</th>
                  <th className="r">{t('Kreditor')}</th>
                  <th>{t('Izoh')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="clickable" onClick={() => setOpen(r)}>
                    <td>
                      {r.name}
                      <div className="muted small">{r.inn ? `STIR ${r.inn}` : t('STIR yo‘q')}</div>
                    </td>
                    <td className="r">
                      <Money v={r.moneyIn} />
                    </td>
                    <td className="r">
                      <Money v={r.moneyOut} />
                    </td>
                    <td className="r">
                      <Money v={r.invIn} />
                    </td>
                    <td className="r">
                      <Money v={r.invOut} />
                    </td>
                    <td className="r">
                      <b className="ok-text">{r.saldo > 0 ? <Money v={r.saldo} /> : ''}</b>
                    </td>
                    <td className="r">
                      <b className="kt-code">{r.saldo < 0 ? <Money v={-r.saldo} /> : ''}</b>
                    </td>
                    <td className="small">
                      {r.flags.includes('NO_INVOICE') && <span className="tag warn">{t('faktura yo‘q')}</span>} {r.flags.includes('NO_PAYMENT') && <span className="tag warn">{t('to‘lov yo‘q')}</span>}{' '}
                      {r.side === 'yopiq' && <span className="tag">{t('yopiq')}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>
                    {t('JAMI')} ({rows.length})
                  </td>
                  {(['moneyIn', 'moneyOut', 'invIn', 'invOut'] as const).map((k) => (
                    <td key={k} className="r">
                      <Money v={rows.reduce((s, r) => s + r[k], 0)} />
                    </td>
                  ))}
                  <td className="r">
                    <Money v={rows.reduce((s, r) => s + Math.max(0, r.saldo), 0)} />
                  </td>
                  <td className="r">
                    <Money v={rows.reduce((s, r) => s + Math.max(0, -r.saldo), 0)} />
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="acc-grid wide">
            <div className="card">
              <div className="card-pad">
                <b>{t('Hisobga olinmagan bank operatsiyalari')}</b>
                <div className="muted small">{t('Soliqlar, bank komissiyalari, ichki o‘tkazmalar va boshqa nosavdo operatsiyalar korxonalar bilan hisob-kitobga kiritilmaydi.')}</div>
              </div>
              <table className="grid">
                <tbody>
                  {audit.excluded.map((e) => (
                    <tr key={e.reason}>
                      <td>{t(e.reason)}</td>
                      <td className="r muted">{e.count}</td>
                      <td className="r">
                        <Money v={e.debit} />
                      </td>
                      <td className="r">
                        <Money v={e.credit} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card">
              <div className="card-pad">
                <b>{t('Hisobga olinmagan fakturalar')}</b>
              </div>
              <table className="grid">
                <tbody>
                  {audit.skippedInvoices.map((s) => (
                    <tr key={s.reason}>
                      <td>{s.reason}</td>
                      <td className="r muted">{s.count}</td>
                      <td className="r">
                        <Money v={s.total} />
                      </td>
                    </tr>
                  ))}
                  {audit.outsidePeriod > 0 && (
                    <tr>
                      <td>{t('Davrdan tashqari sanali')}</td>
                      <td className="r muted">{audit.outsidePeriod}</td>
                      <td />
                    </tr>
                  )}
                  {audit.foreignInvoices > 0 && (
                    <tr>
                      <td>{t('Korxona ishtirok etmagan')}</td>
                      <td className="r muted">{audit.foreignInvoices}</td>
                      <td />
                    </tr>
                  )}
                  {!audit.skippedInvoices.length && !audit.outsidePeriod && !audit.foreignInvoices && (
                    <tr>
                      <td className="muted">{t('Yo‘q')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <p className="muted small">{t('Eslatma: davr boshidagi qoldiq (oldingi yillardan qolgan qarzlar) hisobga olinmagan — natija faqat tanlangan davr harakatlaridan tuziladi.')}</p>
        </>
      )}
      {open && audit && <ActModal audit={audit} row={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Upload() {
  const t = useT();
  const bank = useBank();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  const handle = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    const statements: ParsedStatement[] = [];
    const bankFiles: FileResult[] = [];
    const invoices: Invoice[] = [];
    const invoiceFiles: Array<{ file: string; ok: boolean; error?: string; count: number }> = [];
    for (const f of Array.from(list)) {
      try {
        if (!/\.(xlsx|csv)$/i.test(f.name)) throw new Error('Faqat .xlsx yoki .csv fayllar o‘qiladi.');
        const sheets = await readWorkbookRows(await f.arrayBuffer());
        const invSheets = sheets.filter(isInvoiceSheet);
        if (invSheets.length) {
          const inv = invSheets.flatMap((s) => parseInvoices(s, f.name));
          invoices.push(...inv);
          invoiceFiles.push({ file: f.name, ok: true, count: inv.length });
        } else {
          const sts = parseStatements(sheets, f.name);
          statements.push(...sts);
          bankFiles.push({ file: f.name, ok: true, accounts: sts.map((s) => ({ number: s.account.number, currency: s.account.currency, from: s.account.periodFrom, to: s.account.periodTo, count: s.operations.length })) });
        }
      } catch (e) {
        invoiceFiles.push({ file: f.name, ok: false, error: (e as Error).message, count: 0 });
      }
    }
    if (statements.length) bankActions.addStatements(statements, bankFiles);
    if (invoiceFiles.length) bankActions.addInvoices(invoices, invoiceFiles);
    setBusy(false);
    toast(`${statements.length} ta vipiska, ${invoices.length} ta faktura o‘qildi`);
  };

  const files = [
    ...bank.files.map((f) => ({ file: f.file, ok: f.ok, what: f.ok ? `${t('bank vipiska')}: ${f.accounts.map((a) => `${a.currency} ${a.number.slice(0, 8)}…`).join(', ')}` : f.error ?? '' })),
    ...bank.invoiceFiles.map((f) => ({ file: f.file, ok: f.ok, what: f.ok ? `${t('hisob-fakturalar')}: ${f.count}` : f.error ?? '' })),
  ];

  return (
    <>
      <div
        className={`dropzone ${over ? 'over' : ''}`}
        style={{ padding: '26px 20px' }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void handle(e.dataTransfer.files);
        }}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
      >
        <input ref={input} type="file" accept=".xlsx,.csv" multiple hidden onChange={(e) => void handle(e.target.files)} />
        <div className="dz-title">{busy ? t('O‘qilmoqda…') : t('Bank vipiskalari va hisob-faktura reyestrlarini (kirim va chiqim) shu yerga tashlang')}</div>
        <div className="muted">{t('Fayl turi avtomatik aniqlanadi. Fakturalar my.soliq / Didox reyestridan .xlsx ko‘rinishida.')}</div>
        <div className="dz-safe">🔒 {t('Fayllar faqat sizning brauzeringizda qayta ishlanadi — hech qayerga yuborilmaydi.')}</div>
      </div>
      {files.length > 0 && (
        <details className="card card-pad">
          <summary>
            {t('Yuklangan fayllar')} ({files.length})
          </summary>
          <ul className="small">
            {files.map((f, i) => (
              <li key={i} className={f.ok ? undefined : 'err-text'}>
                {f.ok ? '✓' : '✗'} {f.file} — {t(f.what)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function ActModal({ audit, row, onClose }: { audit: AuditResult; row: CounterpartyRow; onClose: () => void }) {
  const t = useT();
  const exportAct = async () => {
    const { buildActWorkbook } = await import('../../audit/exportAudit');
    const buf = await (await buildActWorkbook(audit, row)).xlsx.writeBuffer();
    downloadBlob(new Blob([buf], { type: XLSX }), `dalolatnoma_${safeName(row.name)}.xlsx`);
  };
  const summary =
    row.saldo > 0
      ? `${row.name}ning bizga qarzi (debitor): `
      : row.saldo < 0
        ? `Bizning ${row.name}ga qarzimiz (kreditor): `
        : 'O‘zaro qarz yo‘q.';
  return (
    <Modal
      title={`${t('Solishtirish dalolatnomasi')}: ${row.name}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn primary" onClick={exportAct}>
            {t('Excelga yuklab olish')}
          </button>
          <button className="btn" onClick={onClose}>
            {t('Yopish')}
          </button>
        </>
      }
    >
      <p className="muted small">
        {row.inn ? `STIR ${row.inn} · ` : ''}
        {fmtDay(audit.period.from)} – {fmtDay(audit.period.to)} · {t('xaridor sifatida')}: <Money v={row.customerBalance} /> · {t('yetkazib beruvchi sifatida')}: <Money v={row.supplierBalance} />
      </p>
      <table className="grid">
        <thead>
          <tr>
            <th>{t('Sana')}</th>
            <th>{t('Turi')}</th>
            <th>{t('Hujjat')}</th>
            <th>{t('Mazmun')}</th>
            <th className="r">{t('Debet')}</th>
            <th className="r">{t('Kredit')}</th>
            <th className="r">{t('Qoldiq')}</th>
          </tr>
        </thead>
        <tbody>
          {row.movements.map((m, i) => {
            const dr = m.kind === 'invOut' || m.kind === 'moneyOut';
            return (
              <tr key={i}>
                <td>{fmtDay(m.date)}</td>
                <td className="small">{t(KIND_LABEL[m.kind])}</td>
                <td className="code">{m.doc}</td>
                <td className="small" title={m.text} style={{ maxWidth: 380 }}>
                  {m.text.length > 100 ? m.text.slice(0, 100) + '…' : m.text}
                </td>
                <td className="r">{dr ? <Money v={m.amount} /> : ''}</td>
                <td className="r">{dr ? '' : <Money v={m.amount} />}</td>
                <td className="r">
                  <Money v={m.balance} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p>
        <b>{t(summary)}</b>
        {row.saldo !== 0 && <Money v={Math.abs(row.saldo)} />} {row.saldo !== 0 && t('so‘m')}
      </p>
    </Modal>
  );
}
