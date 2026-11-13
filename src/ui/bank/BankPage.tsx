import { useEffect, useMemo, useRef, useState } from 'react';
import { accountSummaries, correspondents, dailyBalances, fxSummary, monthly, typeSummary } from '../../bank/aggregates';
import { analyze, type Analysis } from '../../bank/analyze';
import { FLAG_TEXT } from '../../bank/flagsText';
import type { BankAccount, FlagCode, Group, ParsedStatement } from '../../bank/model';
import { parseStatements } from '../../bank/parsers/detect';
import { readWorkbookRows } from '../../bank/parsers/rows';
import { useT } from '../../i18n/useT';
import { downloadBlob } from '../../store/fileIO';
import { actions, useApp } from '../../store/store';
import { toast } from '../components/common';
import { bankActions, loadBank, rulesOf, useBank, type FileResult } from './bankStore';
import { BarChart, LineChart, Money, ShareBar, fmtDay, fmtMonth } from './format';
import { EMPTY_FILTER, OpsTable, type OpsFilter } from './OpsTable';
import { RulesTab } from './RulesTab';

type Tab = 'upload' | 'summary' | 'account' | 'types' | 'korr' | 'months' | 'fx' | 'flags' | 'rules';

const accLabel = (a: BankAccount) => `${a.currency} ${a.number}`;

function AccountSelect({ accounts, value, onChange }: { accounts: BankAccount[]; value: string; onChange: (n: string) => void }) {
  return (
    <div className="chips">
      {accounts.map((a) => (
        <button key={a.number} className={`chip ${value === a.number ? 'on' : ''}`} onClick={() => onChange(a.number)}>
          {accLabel(a)}
        </button>
      ))}
    </div>
  );
}

export default function BankPage() {
  const t = useT();
  const bank = useBank();
  const { ui } = useApp();
  const [tab, setTab] = useState<Tab>('summary');
  const [account, setAccount] = useState('');
  const [filter, setFilter] = useState<OpsFilter>(EMPTY_FILTER);

  useEffect(() => {
    void loadBank();
  }, []);

  const analysis = useMemo<Analysis | null>(
    () => (bank.statements.length ? analyze(bank.statements, rulesOf(bank), bank.overrides, bank.settings) : null),
    [bank],
  );
  const active = analysis?.accounts.filter((a) => analysis.operations.some((o) => o.account === a.number)) ?? [];
  const current = active.find((a) => a.number === account) ?? active[0];
  const unreviewed = analysis ? analysis.operations.reduce((n, o) => n + o.flags.filter((f) => !bank.reviewed.includes(`${o.id}:${f}`)).length, 0) : 0;
  const hasFx = !!analysis?.accounts.some((a) => a.currency !== 'UZS');
  const view: Tab = !analysis && tab !== 'rules' ? 'upload' : tab;

  const goAccount = (number: string, f: Partial<OpsFilter> = {}) => {
    setAccount(number);
    setFilter({ ...EMPTY_FILTER, ...f });
    setTab('account');
  };

  const exportExcel = async () => {
    if (!analysis) return;
    const { buildBankWorkbook, bankFileName } = await import('../../bank/exportExcel');
    const buf = await (await buildBankWorkbook(analysis)).xlsx.writeBuffer();
    downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), bankFileName(analysis));
  };

  const TABS: Array<[Tab, string, boolean]> = [
    ['upload', 'Yuklash', true],
    ['summary', 'Svod', !!analysis],
    ['account', 'Hisoblar', !!analysis],
    ['types', 'Turlar', !!analysis],
    ['korr', 'Korrespondentlar', !!analysis],
    ['months', 'Oylar', !!analysis],
    ['fx', 'Valyuta', hasFx],
    ['flags', `Diqqat${unreviewed ? ` (${unreviewed})` : ''}`, !!analysis],
    ['rules', 'Qoidalar', true],
  ];

  return (
    <div className="page bank">
      <div className="bank-head">
        <div>
          <h1>{t('Bank vipiska tahlili')}</h1>
          {analysis && (
            <p className="muted">
              {analysis.company.name} · INN {analysis.company.inn} · {analysis.company.bankName} (MFO {analysis.company.mfo}) · {fmtDay(analysis.company.periodFrom)} –{' '}
              {fmtDay(analysis.company.periodTo)}
            </p>
          )}
        </div>
        <div className="toolbar">
          <div className="seg" role="group" aria-label="Alifbo">
            <button className={ui.script === 'lat' ? 'on' : ''} onClick={() => actions.setUi({ script: 'lat' })}>
              Lotin
            </button>
            <button className={ui.script === 'cyr' ? 'on' : ''} onClick={() => actions.setUi({ script: 'cyr' })}>
              Кирилл
            </button>
          </div>
          <button className="btn primary" disabled={!analysis} onClick={exportExcel}>
            {t('Excel yuklab olish')}
          </button>
          <button
            className="btn"
            disabled={!analysis}
            onClick={() => {
              if (confirm(t('Yuklangan vipiskalar va qo‘lda o‘zgartirishlar o‘chiriladi (qoidalar saqlanadi). Davom etasizmi?'))) {
                bankActions.newAnalysis();
                setTab('upload');
              }
            }}
          >
            {t('Yangi tahlil')}
          </button>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {TABS.filter(([, , show]) => show).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={view === id} className={view === id ? 'on' : ''} onClick={() => setTab(id)}>
            {t(label)}
          </button>
        ))}
      </div>

      {!bank.loaded ? (
        <div className="empty">{t('Yuklanmoqda…')}</div>
      ) : view === 'upload' ? (
        <UploadTab onDone={() => setTab('summary')} />
      ) : view === 'rules' ? (
        <RulesTab />
      ) : !analysis ? null : view === 'summary' ? (
        <SummaryTab a={analysis} unreviewed={unreviewed} onAccount={(n) => goAccount(n)} onFlags={() => setTab('flags')} />
      ) : view === 'account' && current ? (
        <>
          <AccountSelect accounts={active} value={current.number} onChange={(n) => goAccount(n)} />
          <div className="card card-pad">
            <b>{t('Qoldiq grafigi')}</b>
            <LineChart points={dailyBalances(current, analysis.operations.filter((o) => o.account === current.number))} />
          </div>
          <OpsTable ops={analysis.operations.filter((o) => o.account === current.number)} currency={current.currency} filter={filter} setFilter={setFilter} />
        </>
      ) : view === 'types' && current ? (
        <>
          <AccountSelect accounts={active} value={current.number} onChange={setAccount} />
          <TypesTab a={analysis} acc={current} onType={(g, type) => goAccount(current.number, { group: g, type })} />
        </>
      ) : view === 'korr' && current ? (
        <>
          <AccountSelect accounts={active} value={current.number} onChange={setAccount} />
          <KorrTab a={analysis} acc={current} onKorr={(k) => goAccount(current.number, { korr: k })} />
        </>
      ) : view === 'months' && current ? (
        <>
          <AccountSelect accounts={active} value={current.number} onChange={setAccount} />
          <MonthsTab a={analysis} acc={current} />
        </>
      ) : view === 'fx' ? (
        <FxTab a={analysis} />
      ) : view === 'flags' ? (
        <FlagsTab a={analysis} />
      ) : null}
    </div>
  );
}

function UploadTab({ onDone }: { onDone: () => void }) {
  const t = useT();
  const bank = useBank();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  const handle = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    const statements: ParsedStatement[] = [];
    const results: FileResult[] = [];
    for (const f of Array.from(list)) {
      try {
        if (!/\.xlsx$/i.test(f.name)) throw new Error('Faqat .xlsx fayllar o‘qiladi. Eski .xls faylni Excel’da “.xlsx” qilib saqlang.');
        const sts = parseStatements(await readWorkbookRows(await f.arrayBuffer()), f.name);
        statements.push(...sts);
        results.push({ file: f.name, ok: true, accounts: sts.map((s) => ({ number: s.account.number, currency: s.account.currency, from: s.account.periodFrom, to: s.account.periodTo, count: s.operations.length })) });
      } catch (e) {
        results.push({ file: f.name, ok: false, error: (e as Error).message, accounts: [] });
      }
    }
    bankActions.addStatements(statements, results);
    setBusy(false);
    if (statements.length) {
      toast(`${statements.length} ta hisob vipiskasi o‘qildi`);
      onDone();
    }
  };

  return (
    <>
      <div
        className={`dropzone ${over ? 'over' : ''}`}
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
        <input ref={input} type="file" accept=".xlsx" multiple hidden onChange={(e) => void handle(e.target.files)} />
        <div className="dz-title">{busy ? t('O‘qilmoqda…') : t('Bank vipiskalarini shu yerga tashlang yoki bosib tanlang')}</div>
        <div className="muted">{t('Bir nechta .xlsx fayl birdaniga. Bitta hisob bir nechta faylda bo‘lsa, birlashtiriladi.')}</div>
        <div className="dz-safe">🔒 {t('Fayllar faqat sizning brauzeringizda qayta ishlanadi — hech qayerga yuborilmaydi.')}</div>
      </div>
      {bank.files.length > 0 && (
        <div className="card table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>{t('Fayl')}</th>
                <th>{t('Hisob')}</th>
                <th>{t('Valyuta')}</th>
                <th>{t('Davr')}</th>
                <th className="r">{t('Operatsiyalar')}</th>
                <th>{t('Holat')}</th>
              </tr>
            </thead>
            <tbody>
              {bank.files.flatMap((f, i) =>
                f.ok
                  ? f.accounts.map((a, j) => (
                      <tr key={`${i}-${j}`}>
                        <td>{f.file}</td>
                        <td className="code">{a.number}</td>
                        <td>{a.currency}</td>
                        <td>
                          {fmtDay(a.from)} – {fmtDay(a.to)}
                        </td>
                        <td className="r">{a.count}</td>
                        <td className="ok-text">✓</td>
                      </tr>
                    ))
                  : [
                      <tr key={i}>
                        <td>{f.file}</td>
                        <td colSpan={4} />
                        <td className="err-text">✗ {t(f.error ?? '')}</td>
                      </tr>,
                    ],
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function SummaryTab({ a, unreviewed, onAccount, onFlags }: { a: Analysis; unreviewed: number; onAccount: (n: string) => void; onFlags: () => void }) {
  const t = useT();
  const [noInternal, setNoInternal] = useState(false);
  const sums = accountSummaries(a, noInternal);
  const problems = a.checks.filter((c) => c.diff !== 0 || c.totalsOk === false || c.dailyMismatches.length);
  return (
    <>
      {problems.map((c) => (
        <div key={c.account} className="banner bad">
          ✗ {c.currency} {c.account}:{' '}
          {c.diff !== 0 && (
            <>
              {t('hisoblangan qoldiq bankdagidan farq qiladi')}: <Money v={c.diff} />.{' '}
            </>
          )}
          {c.totalsOk === false && t('oborotlar “Итоговый оборот” bilan mos emas — vipiskada sahifa yetishmayotgan bo‘lishi mumkin. ')}
          {c.dailyMismatches.length > 0 && `${t('kunlik qoldiq mos emas')}: ${c.dailyMismatches.map(fmtDay).join(', ')}`}
        </div>
      ))}
      <div className="toolbar">
        <label className="small" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={noInternal} onChange={(e) => setNoInternal(e.target.checked)} />
          {t('Ichki o‘tkazmalarsiz (o‘z hisoblari orasidagi pul ikki marta sanalmaydi)')}
        </label>
        <span className="muted small">
          {a.operations.length} {t('ta operatsiya')}
          {a.duplicates ? ` · ${a.duplicates} ${t('ta dublikat olib tashlandi')}` : ''}
        </span>
      </div>
      {unreviewed > 0 && (
        <button className="banner warn clickable" onClick={onFlags}>
          ⚑ {t('Diqqat talab qiladi')}: <b>{unreviewed}</b> {t('ta — ko‘rib chiqish uchun bosing')}
        </button>
      )}
      <div className="acc-grid">
        {sums
          .filter((s) => !s.inactive)
          .map((s) => (
            <button key={s.account.number} className="card acc-card" onClick={() => onAccount(s.account.number)}>
              <div className="acc-top">
                <span className="cur">{s.account.currency}</span>
                <span className="code">{s.account.number}</span>
                {s.diff === 0 ? <span className="ok-text">✓</span> : <span className="err-text">✗</span>}
              </div>
              <div className="acc-flow">
                <div>
                  <div className="muted small">{t('Boshlang‘ich')}</div>
                  <Money v={s.opening} />
                </div>
                <div>
                  <div className="muted small">{t('Debet (chiqim)')}</div>
                  <span className="kt-code">
                    <Money v={s.debit} />
                  </span>
                </div>
                <div>
                  <div className="muted small">{t('Kredit (kirim)')}</div>
                  <span className="ok-text">
                    <Money v={s.credit} />
                  </span>
                </div>
                <div>
                  <div className="muted small">{t('Yakuniy')}</div>
                  <b className="big">
                    <Money v={s.closing} />
                  </b>
                </div>
              </div>
              <div className="muted small">
                {s.count} {t('ta operatsiya')} · {t('bank qoldig‘i')} <Money v={s.bank} /> {s.diff !== 0 && <span className="err-text">· {t('farq')} <Money v={s.diff} /></span>}
              </div>
            </button>
          ))}
      </div>
      {sums.some((s) => s.inactive) && (
        <details className="card card-pad">
          <summary>
            {t('Harakatsiz hisoblar')} ({sums.filter((s) => s.inactive).length})
          </summary>
          <ul className="small muted">
            {sums
              .filter((s) => s.inactive)
              .map((s) => (
                <li key={s.account.number}>
                  {s.account.currency} {s.account.number} · {t('qoldiq')} <Money v={s.closing} />
                </li>
              ))}
          </ul>
        </details>
      )}
    </>
  );
}

function TypesTab({ a, acc, onType }: { a: Analysis; acc: BankAccount; onType: (g: Group, type: string) => void }) {
  const t = useT();
  const groups = typeSummary(a.operations.filter((o) => o.account === acc.number));
  const color: Record<Group, string> = { Kirim: 'var(--ok)', Chiqim: 'var(--kt)', Soliqlar: 'var(--warn)' };
  return (
    <div className="acc-grid wide">
      {groups.map((g) => (
        <div key={g.group} className="card">
          <div className="card-pad" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <b>{t(g.group)}</b>
            <span>
              {g.total.count} {t('ta')} · <Money v={g.group === 'Kirim' ? g.total.credit : g.total.debit} cur={acc.currency} />
            </span>
          </div>
          <table className="grid">
            <tbody>
              {g.rows.map((r) => (
                <tr key={r.type} className="clickable" onClick={() => onType(g.group, r.type)}>
                  <td>{r.type}</td>
                  <td className="r muted">{r.count}</td>
                  <td className="r">
                    <Money v={g.group === 'Kirim' ? r.credit : r.debit} />
                  </td>
                  <td style={{ width: 170 }}>
                    <ShareBar share={r.share} color={color[g.group]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function KorrTab({ a, acc, onKorr }: { a: Analysis; acc: BankAccount; onKorr: (k: string) => void }) {
  const t = useT();
  const [byInn, setByInn] = useState(false);
  const rows = correspondents(a.operations.filter((o) => o.account === acc.number), byInn);
  return (
    <div className="card table-wrap">
      <div className="card-pad">
        <label className="small" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={byInn} onChange={(e) => setByInn(e.target.checked)} />
          {t('INN bo‘yicha guruhlash (bitta INN’ning bir nechta hisobi birlashadi)')}
        </label>
      </div>
      <table className="grid">
        <thead>
          <tr>
            <th>{t('Korrespondent')}</th>
            <th>INN</th>
            <th>{t('Korr. hisob')}</th>
            <th className="r">{t('Soni')}</th>
            <th className="r">{t('Debet')}</th>
            <th className="r">{t('Kredit')}</th>
            <th className="r">{t('Saldo (K − D)')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="clickable" onClick={() => onKorr(byInn && r.inn ? r.inn : r.accounts[0])}>
              <td>{r.name}</td>
              <td className="small">{r.inn}</td>
              <td className="small" style={{ fontFamily: 'ui-monospace, monospace' }}>
                {r.accounts.join(', ')}
              </td>
              <td className="r">{r.count}</td>
              <td className="r">
                <Money v={r.debit} />
              </td>
              <td className="r">
                <Money v={r.credit} />
              </td>
              <td className="r">
                <Money v={r.saldo} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MonthsTab({ a, acc }: { a: Analysis; acc: BankAccount }) {
  const t = useT();
  const rows = monthly(acc, a.operations.filter((o) => o.account === acc.number));
  return (
    <>
      <div className="card card-pad">
        <BarChart rows={rows.map((r) => ({ label: fmtMonth(r.month), debit: r.debit, credit: r.credit }))} />
        <div className="small muted">
          <span className="kt-code">■</span> {t('Debet (chiqim)')} · <span className="ok-text">■</span> {t('Kredit (kirim)')}
        </div>
      </div>
      <div className="card table-wrap">
        <table className="grid">
          <thead>
            <tr>
              <th>{t('Oy')}</th>
              <th className="r">{t('Oy boshiga qoldiq')}</th>
              <th className="r">{t('Debet')}</th>
              <th className="r">{t('Kredit')}</th>
              <th className="r">{t('Oy oxiriga qoldiq')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month}>
                <td>{fmtMonth(r.month)}</td>
                <td className="r">
                  <Money v={r.opening} />
                </td>
                <td className="r">
                  <Money v={r.debit} />
                </td>
                <td className="r">
                  <Money v={r.credit} />
                </td>
                <td className="r">
                  <b>
                    <Money v={r.closing} />
                  </b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function FxTab({ a }: { a: Analysis }) {
  const t = useT();
  const fx = fxSummary(a);
  return (
    <>
      {fx.conversions.length > 0 && (
        <div className="card table-wrap">
          <div className="card-pad">
            <b>{t('Konvertatsiyalar')}</b> <span className="muted small">({fx.conversions.length})</span>
          </div>
          <table className="grid">
            <thead>
              <tr>
                <th>{t('Sana')}</th>
                <th>{t('Zayavka')}</th>
                <th className="r">{t('Valyuta')}</th>
                <th className="r">{t('To‘langan so‘m')}</th>
                <th className="r">{t('Kurs')}</th>
              </tr>
            </thead>
            <tbody>
              {fx.conversions.map((c, i) => (
                <tr key={i}>
                  <td>{fmtDay(c.date)}</td>
                  <td>{c.request ?? '—'}</td>
                  <td className="r">
                    <Money v={c.fx} cur={c.currency} />
                  </td>
                  <td className="r">
                    <Money v={c.uzs} cur="UZS" />
                  </td>
                  <td className="r">
                    <b>{c.rate ? c.rate.toLocaleString('ru-RU') : '—'}</b>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>{t('JAMI')}</td>
                <td className="r">
                  <Money v={fx.conversions.reduce((s, c) => s + c.fx, 0)} />
                </td>
                <td className="r">
                  <Money v={fx.conversions.reduce((s, c) => s + c.uzs, 0)} />
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {fx.importRows.length > 0 && (
        <div className="card table-wrap">
          <div className="card-pad">
            <b>{t('Import: valyuta sotib olish va xorijga to‘lov')}</b>
          </div>
          <table className="grid">
            <thead>
              <tr>
                <th>{t('Oy')}</th>
                <th>{t('Valyuta')}</th>
                <th className="r">{t('Ta’sischidan valyuta')}</th>
                <th className="r">{t('Sotib olingan valyuta')}</th>
                <th className="r">{t('Xaridga to‘langan so‘m')}</th>
                <th className="r">{t('Kurs')}</th>
                <th className="r">{t('Xorijga to‘langan')}</th>
              </tr>
            </thead>
            <tbody>
              {fx.importRows.map((r) => (
                <tr key={r.currency + r.month}>
                  <td>{fmtMonth(r.month)}</td>
                  <td>{r.currency}</td>
                  <td className="r">
                    <Money v={r.founderFx} />
                  </td>
                  <td className="r">
                    <Money v={r.boughtFx} />
                  </td>
                  <td className="r">
                    <Money v={r.paidUzs} />
                  </td>
                  <td className="r">{r.rate ? r.rate.toLocaleString('ru-RU') : '–'}</td>
                  <td className="r">
                    <Money v={r.paidAbroad} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {fx.exportRows.length > 0 && (
        <div className="card table-wrap">
          <div className="card-pad">
            <b>{t('Eksport: valyuta tushumi va sotish')}</b>
          </div>
          <table className="grid">
            <thead>
              <tr>
                <th>{t('Oy')}</th>
                <th>{t('Valyuta')}</th>
                <th className="r">{t('Valyuta tushumi')}</th>
                <th className="r">{t('Sotish uchun rezerv')}</th>
                <th className="r">{t('So‘m ekvivalenti')}</th>
                <th className="r">{t('Kurs')}</th>
              </tr>
            </thead>
            <tbody>
              {fx.exportRows.map((r) => (
                <tr key={r.currency + r.month}>
                  <td>{fmtMonth(r.month)}</td>
                  <td>{r.currency}</td>
                  <td className="r">
                    <Money v={r.receivedFx} />
                  </td>
                  <td className="r">
                    <Money v={r.reservedFx} />
                  </td>
                  <td className="r">
                    <Money v={r.uzs} />
                  </td>
                  <td className="r">{r.rate ? r.rate.toLocaleString('ru-RU') : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!fx.conversions.length && !fx.importRows.length && !fx.exportRows.length && <div className="empty">{t('Valyuta operatsiyalari topilmadi.')}</div>}
    </>
  );
}

function FlagsTab({ a }: { a: Analysis }) {
  const t = useT();
  const bank = useBank();
  const [code, setCode] = useState<FlagCode | ''>('');
  const [showReviewed, setShowReviewed] = useState(false);
  const cur = new Map(a.accounts.map((x) => [x.number, x.currency]));
  const items = a.operations.flatMap((o) => o.flags.map((f) => ({ o, f, key: `${o.id}:${f}` })));
  const counts = items.reduce<Record<string, number>>((m, x) => ((m[x.f] = (m[x.f] ?? 0) + 1), m), {});
  const shown = items.filter((x) => (!code || x.f === code) && (showReviewed || !bank.reviewed.includes(x.key)));
  return (
    <>
      <div className="toolbar">
        <div className="chips">
          <button className={`chip ${code === '' ? 'on' : ''}`} onClick={() => setCode('')}>
            {t('Hammasi')} ({items.length})
          </button>
          {(Object.keys(counts) as FlagCode[]).map((f) => (
            <button key={f} className={`chip ${code === f ? 'on' : ''}`} onClick={() => setCode(f)} title={t(FLAG_TEXT[f])}>
              {t(FLAG_TEXT[f]).split(' — ')[0]} ({counts[f]})
            </button>
          ))}
        </div>
        <label className="small" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <input type="checkbox" checked={showReviewed} onChange={(e) => setShowReviewed(e.target.checked)} />
          {t('Ko‘rib chiqilganlarni ham ko‘rsatish')}
        </label>
      </div>
      <div className="card table-wrap">
        {shown.length === 0 ? (
          <div className="empty">{t('Ko‘rib chiqilmagan belgi qolmadi.')}</div>
        ) : (
          <table className="grid">
            <thead>
              <tr>
                <th>{t('Sana')}</th>
                <th>{t('Hisob')}</th>
                <th className="r">{t('Summa')}</th>
                <th>{t('Korrespondent')}</th>
                <th>{t('To‘lov maqsadi')}</th>
                <th>{t('Sabab')}</th>
                <th>{t('Ko‘rib chiqildi')}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ o, f, key }) => (
                <tr key={key}>
                  <td>{fmtDay(o.datetime)}</td>
                  <td className="small">
                    {cur.get(o.account)} {o.account.slice(0, 8)}…
                  </td>
                  <td className="r">
                    <Money v={o.debit ? -o.debit : o.credit} />
                  </td>
                  <td className="small">{o.korrName}</td>
                  <td className="small" title={o.purpose} style={{ maxWidth: 360 }}>
                    {o.purpose.length > 110 ? o.purpose.slice(0, 110) + '…' : o.purpose}
                  </td>
                  <td className="small warn-text">{t(FLAG_TEXT[f])}</td>
                  <td className="c">
                    <input type="checkbox" checked={bank.reviewed.includes(key)} onChange={() => bankActions.toggleReviewed(key)} aria-label={t('Ko‘rib chiqildi')} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
