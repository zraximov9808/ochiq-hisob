import { useEffect, useMemo, useRef, useState } from 'react';
import { isServiceItem } from '../../audit/invoices';
import { autoSettings, resetAuto } from '../../auto/apply';
import { defaultAccountExpr } from '../../auto/bankEntries';
import { DEFAULT_TYPE_ACCOUNTS } from '../../auto/defaults';
import { AUTO_KIND_LABEL, autoKind, type AutoKind } from '../../auto/labels';
import { parseExpr } from '../../auto/resolve';
import type { AutoSettings, AutoWarning } from '../../auto/types';
import { useT } from '../../i18n/useT';
import { importFiles } from '../../import/importFiles';
import { downloadBlob } from '../../store/fileIO';
import { actions, getState, useApp } from '../../store/store';
import { toast } from '../components/common';
import { getBank, useBank } from '../bank/bankStore';
import { fmtDay, fmtMoney } from '../bank/format';
import { autoInputOf, fetchMissingRates, rebuildNow, useAutoBuild } from './useAutoSync';
import { UploadedFiles } from '../components/UploadedFiles';

type Tab = 'types' | 'accounts' | 'services' | 'rates';

/** Account expression input: saved on Enter / blur when valid; empty means "use the default". */
function ExprInput({ value, placeholder, onSave }: { value?: string; placeholder: string; onSave: (v: string | null) => void }) {
  const [text, setText] = useState(value ?? '');
  const [bad, setBad] = useState(false);
  useEffect(() => setText(value ?? ''), [value]);
  const commit = () => {
    const v = text.trim();
    if (!v) {
      setBad(false);
      if (value) onSave(null);
      return;
    }
    if (!parseExpr(v)) return setBad(true);
    setBad(false);
    if (v !== value) onSave(v);
  };
  return (
    <input
      className={`input ${bad ? 'bad' : ''}`}
      style={{ width: 260 }}
      value={text}
      placeholder={placeholder}
      title="9690 · 6010.* (kontragent bo‘yicha) · 6010[Nomi] · 6010.05"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  );
}

const SEVERITY: Partial<Record<AutoWarning['kind'], 'warn' | 'info'>> = { capital: 'info', 'brief-invoice': 'info', unclassified: 'info' };

export default function AutoPage() {
  const t = useT();
  const bank = useBank();
  const { h } = useApp();
  const doc = h.doc;
  const s = autoSettings(doc);
  const { built, analysis, input, hash } = useAutoBuild();
  const [tab, setTab] = useState<Tab>('types');
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [errors, setErrors] = useState<Array<{ file: string; error: string }>>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const setS = (patch: Partial<AutoSettings>) => actions.update((d) => void (d.auto = { ...autoSettings(d), ...patch }));
  const setMap = (field: 'types' | 'accounts' | 'services', key: string, v: string | null) => {
    const next = { ...s[field] };
    if (v === null) delete next[key];
    else next[key] = v;
    setS({ [field]: next });
  };

  const resetAndRebuild = () => {
    if (!confirm(t('Qo‘lda tuzatilgan va o‘chirilgan avto-provodkalar bekor qilinadi, hammasi yuklangan hujjatlardan qaytadan yoziladi. Davom etasizmi?'))) return;
    actions.update((d) => resetAuto(d));
    const fresh = autoInputOf(getBank(), getState().h.doc, analysis);
    rebuildNow(fresh.input, fresh.hash);
  };
  const removeAll = () => {
    if (!confirm(t('Jurnaldagi barcha avto-provodkalar o‘chiriladi va avtomatik yangilash o‘chiriladi (yuklangan fayllar qoladi). Ctrl+Z bilan qaytarish mumkin.'))) return;
    actions.update((d) => {
      d.entries = d.entries.filter((e) => !e.auto);
      d.auto = { ...autoSettings(d), enabled: false, inputHash: '' };
    });
  };

  const handle = async (list: FileList | null) => {
    if (!list?.length) return;
    // Uploading here is the go-ahead for a document saved before auto entries existed.
    if (!doc.auto) setS({ enabled: true });
    setBusy(true);
    const r = await importFiles(Array.from(list));
    setBusy(false);
    setErrors(r.errors);
    toast(`${r.statements} ta vipiska, ${r.invoices} ta faktura, ${r.gtd} ta GTD qatori o‘qildi`);
  };

  const auto = doc.entries.filter((e) => e.auto);
  const byKind = useMemo(() => {
    const m = new Map<AutoKind, { n: number; sum: number }>();
    for (const e of auto) {
      const k = autoKind(e.auto!.src);
      const r = m.get(k) ?? { n: 0, sum: 0 };
      r.n++;
      r.sum += e.amount;
      m.set(k, r);
    }
    return [...m];
  }, [auto]);
  const hasData = bank.statements.length > 0 || bank.invoices.length > 0 || bank.gtd.length > 0;

  const downloadTemplate = async () => {
    const { buildGtdTemplate } = await import('../../stock/template');
    const buf = await (await buildGtdTemplate()).xlsx.writeBuffer();
    downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'GTD_shablon.xlsx');
  };
  const fetchRates = async () => {
    const n = await fetchMissingRates(built.needRates, true);
    toast(n ? `${n} ta kurs cbu.uz’dan olindi` : 'Kurs olinmadi (internet yoki cbu.uz javob bermadi) — qo‘lda kiriting');
  };

  const typeRows = useMemo(() => {
    const m = new Map<string, { group: string; n: number }>();
    for (const o of analysis?.operations ?? []) {
      const r = m.get(o.type) ?? { group: o.group, n: 0 };
      r.n++;
      m.set(o.type, r);
    }
    return [...m].sort((a, b) => a[1].group.localeCompare(b[1].group) || b[1].n - a[1].n);
  }, [analysis]);

  const serviceSuppliers = useMemo(() => {
    const m = new Map<string, { name: string; sum: number }>();
    for (const i of bank.invoices) {
      if (i.buyerInn !== input.companyInn) continue;
      const sum = i.brief ? i.total : i.items.filter(isServiceItem).reduce((a, it) => a + it.amount, 0);
      if (!sum) continue;
      const r = m.get(i.sellerInn) ?? { name: i.sellerName, sum: 0 };
      r.sum += sum;
      m.set(i.sellerInn, r);
    }
    return [...m].sort((a, b) => b[1].sum - a[1].sum);
  }, [bank.invoices, input.companyInn]);

  const rateRows = useMemo(() => {
    const keys = new Set([...Object.keys(input.rates), ...built.needRates.map((n) => `${n.ccy}:${n.date}`)]);
    return [...keys].sort().map((k) => ({
      key: k,
      value: input.rates[k],
      source: s.rates[k] ? 'qo‘lda' : bank.rates[k] ? 'MB (cbu.uz)' : input.rates[k] ? 'GTD' : '',
    }));
  }, [input.rates, built.needRates, s.rates, bank.rates]);

  return (
    <div className="page bank">
      <div className="bank-head">
        <div>
          <h1>{t('Hujjatlardan provodka')}</h1>
          <p className="muted">
            {t('Bank vipiskalari, kirim/chiqim hisob-faktura reyestrlari (.xlsx yoki soliq.uz CSV) va GTD hisobotini yuklang — provodkalar jurnalga avtomatik tushadi, balans va moliyaviy natijalar shulardan to‘ladi.')}
          </p>
        </div>
        <div className="toolbar">
          <label className="small" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={s.enabled} onChange={(e) => setS({ enabled: e.target.checked })} />
            {t('Avtomatik yangilash')}
          </label>
          <button className="btn" disabled={!hasData} onClick={() => (rebuildNow(input, hash), toast('Avto-provodkalar yangilandi'))}>
            {t('Hozir yangilash')}
          </button>
          <button className="btn" onClick={() => actions.setUi({ page: 'journal' })}>
            {t('Jurnal')}
          </button>
          <button className="btn" onClick={() => actions.setUi({ page: 'balance' })}>
            {t('Balans')}
          </button>
          <button className="btn" onClick={() => actions.setUi({ page: 'income' })}>
            {t('2-shakl')}
          </button>
        </div>
      </div>

      <div
        className={`dropzone ${over ? 'over' : ''}`}
        style={{ padding: '26px 20px' }}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void handle(e.dataTransfer.files);
        }}
        onClick={() => fileInput.current?.click()}
        role="button"
        tabIndex={0}
      >
        <input ref={fileInput} type="file" accept=".xlsx,.csv" multiple hidden onChange={(e) => void handle(e.target.files)} />
        <b>{busy ? t('O‘qilmoqda…') : t('Fayllarni shu yerga tashlang yoki bosib tanlang')}</b>
        <div className="muted">{t('Bir nechta faylni birdaniga tashlash mumkin: turi avtomatik aniqlanadi.')}</div>
      </div>
      {errors.length > 0 && (
        <ul className="notes">
          {errors.map((e) => (
            <li key={e.file} className="warn">
              <b>{e.file}</b> — {t(e.error)}
            </li>
          ))}
        </ul>
      )}

      <UploadedFiles kinds={['statement', 'invoice', 'gtd']} />

      <div className="kpi-grid">
        <div className="card kpi brand">
          <div className="muted small">{t('Jurnaldagi avto-provodkalar')}</div>
          <div className="kpi-value">{auto.length}</div>
        </div>
        <div className="card kpi">
          <div className="muted small">{t('Qo‘lda tuzatilgan / o‘chirilgan')}</div>
          <div className="kpi-value">
            {auto.filter((e) => e.auto!.edited).length} / {s.skip.length}
          </div>
        </div>
        <div className={`card kpi ${built.warnings.length ? 'warn' : 'ok'}`}>
          <div className="muted small">{t('Diqqat talab qiladi')}</div>
          <div className="kpi-value">{built.warnings.length}</div>
        </div>
      </div>

      {byKind.length > 0 && (
        <div className="card table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>{t('Manba')}</th>
                <th className="r">{t('Provodkalar')}</th>
                <th className="r">{t('Summa, so‘m')}</th>
              </tr>
            </thead>
            <tbody>
              {byKind.map(([k, r]) => (
                <tr key={k}>
                  <td>{t(AUTO_KIND_LABEL[k])}</td>
                  <td className="r">{r.n}</td>
                  <td className="r">{fmtMoney(r.sum)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="toolbar" style={{ padding: '8px 10px' }}>
            <button className="btn small ghost" onClick={resetAndRebuild}>
              {t('Avto-provodkalarni tiklash')}
            </button>
            <button className="btn small ghost danger" onClick={removeAll}>
              {t('Avto-provodkalarni o‘chirish')}
            </button>
          </div>
        </div>
      )}

      {built.warnings.length > 0 && (
        <div className="card card-pad">
          <div className="toolbar" style={{ justifyContent: 'space-between' }}>
            <b>{t('Diqqat')}</b>
            <div className="toolbar">
              {built.warnings.some((w) => w.kind === 'no-cost') && (
                <button className="btn small" onClick={() => void downloadTemplate()}>
                  {t('GTD shablonini yuklab olish')}
                </button>
              )}
              {built.needRates.length > 0 && (
                <button className="btn small" onClick={() => void fetchRates()}>
                  {t('Kurslarni cbu.uz’dan olish')}
                </button>
              )}
            </div>
          </div>
          <ul className="notes">
            {built.warnings.map((w, i) => (
              <li key={i} className={SEVERITY[w.kind] === 'info' ? '' : 'warn'}>
                {t(w.text)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasData && (
        <div className="card card-pad">
          <div className="tabs">
            {(
              [
                ['types', 'Operatsiya turlari'],
                ['accounts', 'Bank hisoblari'],
                ['services', 'Xizmatlar va fakturalar'],
                ['rates', 'Valyuta kurslari'],
              ] as Array<[Tab, string]>
            ).map(([id, label]) => (
              <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
                {t(label)}
              </button>
            ))}
          </div>
          <p className="muted small">
            {t('Hisobvaraq: 9690 — rejadagi hisobvaraq; 6010.* — har bir kontragentga subschyot; 6010[Nomi] — nomli subschyot; 6010.05 — mavjud subschyot. Bo‘sh qoldirilsa — standart.')}
          </p>

          {tab === 'types' && (
            <table className="grid">
              <thead>
                <tr>
                  <th>{t('Guruh')}</th>
                  <th>{t('Operatsiya turi')}</th>
                  <th className="r">{t('Soni')}</th>
                  <th>{t('Qarshi hisobvaraq')}</th>
                </tr>
              </thead>
              <tbody>
                {typeRows.map(([type, r]) => (
                  <tr key={type}>
                    <td className="muted">{t(r.group)}</td>
                    <td>{type}</td>
                    <td className="r">{r.n}</td>
                    <td>
                      <ExprInput value={s.types[type]} placeholder={DEFAULT_TYPE_ACCOUNTS[type] ?? (r.group === 'Kirim' ? '4010.*' : '6010.*')} onSave={(v) => setMap('types', type, v)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'accounts' && (
            <table className="grid">
              <thead>
                <tr>
                  <th>{t('Bank hisobi')}</th>
                  <th>{t('Valyuta')}</th>
                  <th className="r">{t('Operatsiyalar')}</th>
                  <th>{t('Buxgalteriya hisobvarag‘i')}</th>
                </tr>
              </thead>
              <tbody>
                {(analysis?.accounts ?? []).map((a) => (
                  <tr key={a.number}>
                    <td className="code">{a.number}</td>
                    <td>{a.currency}</td>
                    <td className="r">{analysis!.operations.filter((o) => o.account === a.number).length}</td>
                    <td>
                      <ExprInput value={s.accounts[a.number]} placeholder={defaultAccountExpr(a, analysis!.accounts)} onSave={(v) => setMap('accounts', a.number, v)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'services' && (
            <>
              <div className="toolbar" style={{ margin: '8px 0' }}>
                <span className="small">{t('Xizmatlar uchun standart xarajat hisobvarag‘i')}</span>
                <ExprInput value={s.serviceDefault} placeholder="9420" onSave={(v) => setS({ serviceDefault: v ?? '9420' })} />
                <label className="small" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" checked={s.includePending} onChange={(e) => setS({ includePending: e.target.checked })} />
                  {t('Imzolanmagan (Ожидает) fakturalarni ham provodka qilish')}
                </label>
                <label className="small" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" checked={s.declareCapital} onChange={(e) => setS({ declareCapital: e.target.checked })} />
                  {t('Ustav kapitalini kiritilgan ulushlar summasida e’lon qilish (Dt 4610 Kt 8330)')}
                </label>
              </div>
              <table className="grid">
                <thead>
                  <tr>
                    <th>{t('Xizmat ko‘rsatuvchi')}</th>
                    <th>{t('STIR')}</th>
                    <th className="r">{t('Xizmatlar, so‘m')}</th>
                    <th>{t('Xarajat hisobvarag‘i')}</th>
                  </tr>
                </thead>
                <tbody>
                  {serviceSuppliers.map(([inn, r]) => (
                    <tr key={inn}>
                      <td>{r.name}</td>
                      <td className="code">{inn}</td>
                      <td className="r">{fmtMoney(r.sum)}</td>
                      <td>
                        <ExprInput value={s.services[inn]} placeholder={s.serviceDefault} onSave={(v) => setMap('services', inn, v)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {tab === 'rates' && (
            <>
              <div className="toolbar" style={{ margin: '8px 0' }}>
                <button className="btn small" disabled={!built.needRates.length} onClick={() => void fetchRates()}>
                  {t('Yetishmagan kurslarni cbu.uz’dan olish')}
                </button>
                <span className="muted small">{t('cbu.uz’ga faqat valyuta kodi va sana yuboriladi.')}</span>
              </div>
              <table className="grid">
                <thead>
                  <tr>
                    <th>{t('Valyuta')}</th>
                    <th>{t('Sana')}</th>
                    <th className="r">{t('Kurs, so‘m')}</th>
                    <th>{t('Manba')}</th>
                    <th>{t('Qo‘lda')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rateRows.map((r) => (
                    <tr key={r.key}>
                      <td>{r.key.split(':')[0]}</td>
                      <td>{fmtDay(r.key.split(':')[1])}</td>
                      <td className={`r ${r.value ? '' : 'err-text'}`}>{r.value ? r.value.toLocaleString('ru-RU', { maximumFractionDigits: 4 }) : t('yo‘q')}</td>
                      <td className="muted small">{t(r.source)}</td>
                      <td>
                        <input
                          className="input"
                          style={{ width: 120 }}
                          defaultValue={s.rates[r.key] ?? ''}
                          placeholder="12000,00"
                          onBlur={(e) => {
                            const v = Number(e.target.value.replace(/\s/g, '').replace(',', '.'));
                            const next = { ...s.rates };
                            if (v > 0) next[r.key] = v;
                            else delete next[r.key];
                            if (JSON.stringify(next) !== JSON.stringify(s.rates)) setS({ rates: next });
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  );
}
