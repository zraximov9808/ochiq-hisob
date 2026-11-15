import { useEffect, useMemo, useRef, useState } from 'react';
import { companyInnOf, isInvoiceSheet, parseInvoices, type Invoice } from '../../audit/invoices';
import { companySlug } from '../../bank/names';
import { readWorkbookRows } from '../../bank/parsers/rows';
import { isGtdSheet, parseGtd, type GtdItem } from '../../stock/gtd';
import { productDisplay } from '../../stock/names';
import { buildStock, type StockRow } from '../../stock/stock';
import { useT } from '../../i18n/useT';
import { downloadBlob } from '../../store/fileIO';
import { Modal, toast } from '../components/common';
import { bankActions, loadBank, useBank } from '../bank/bankStore';
import { fmtDay } from '../bank/format';

const fmtQty = (v: number) => (v === 0 ? '–' : v.toLocaleString('ru-RU', { maximumFractionDigits: 3 }).replace(/ /g, ' '));

function Qty({ v, strong }: { v: number; strong?: boolean }) {
  const s = <span className={v < 0 ? 'neg' : undefined}>{fmtQty(v)}</span>;
  return strong ? <b>{s}</b> : s;
}

export default function OmborPage() {
  const t = useT();
  const bank = useBank();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [includePending, setIncludePending] = useState(false);
  const [query, setQuery] = useState('');
  const [onlyNegative, setOnlyNegative] = useState(false);
  const [open, setOpen] = useState<StockRow | null>(null);

  useEffect(() => {
    void loadBank();
  }, []);

  const companyInn = bank.statements[0]?.account.inn || companyInnOf(bank.invoices);
  const companyName =
    bank.statements[0]?.account.company ||
    bank.invoices.find((i) => i.sellerInn === companyInn)?.sellerName ||
    bank.invoices.find((i) => i.buyerInn === companyInn)?.buyerName ||
    '';
  const stock = useMemo(
    () => buildStock(bank.invoices, bank.gtd, { companyInn, includePending, qtyOverrides: bank.stockQty, from: from || undefined, to: to || undefined }),
    [bank.invoices, bank.gtd, bank.stockQty, companyInn, includePending, from, to],
  );
  const oldInvoices = bank.invoices.length > 0 && bank.invoices.every((i) => !i.items);
  const q = query.trim().toLowerCase();
  const rows = stock.rows.filter((r) => (!q || r.name.toLowerCase().includes(q)) && (!onlyNegative || r.negative));
  const negatives = stock.rows.filter((r) => r.negative).length;
  const hasData = bank.gtd.length > 0 || bank.invoices.length > 0;

  const downloadTemplate = async () => {
    const { buildGtdTemplate } = await import('../../stock/template');
    const buf = await (await buildGtdTemplate()).xlsx.writeBuffer();
    downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'GTD_shablon.xlsx');
  };

  const exportXlsx = async () => {
    const { buildStockWorkbook } = await import('../../stock/exportStock');
    const buf = await (await buildStockWorkbook({ ...stock, rows }, { from, to, company: companyName })).xlsx.writeBuffer();
    downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${companySlug(companyName)}_ombor.xlsx`);
  };

  return (
    <div className="page bank">
      <div className="bank-head">
        <div>
          <h1>{t('Ombor')}</h1>
          <p className="muted">{t('Tovarlar kirim-chiqimi nazorati: import (GTD) va kirim fakturalari — kirim, chiqim fakturalari — chiqim. Qoldiq = kirim − chiqim.')}</p>
        </div>
        <div className="toolbar">
          <button className="btn" onClick={downloadTemplate} title={t('Import tovarlar (GTD) uchun bo‘sh Excel shablon va yo‘riqnoma')}>
            {t('Excel shablon yuklab olish')}
          </button>
          <button className="btn primary" disabled={!rows.length} onClick={exportXlsx}>
            {t('Excel yuklab olish')}
          </button>
          <button className="btn" disabled={!bank.gtd.length} onClick={() => confirm(t('Yuklangan GTD ma’lumotlari va qo‘lda kiritilgan sonlar o‘chirilsinmi?')) && bankActions.clearGtd()}>
            {t('GTD’larni tozalash')}
          </button>
        </div>
      </div>

      <Upload />

      {oldInvoices && <div className="banner warn">{t('Saqlangan fakturalarda tovar qatorlari yo‘q (oldingi versiyada yuklangan). Faktura fayllarini shu yerga qayta tashlang.')}</div>}

      {hasData && (
        <>
          <div className="card card-pad toolbar" style={{ alignItems: 'flex-end' }}>
            <div className="field">
              <label>{t('Sana (dan)')}</label>
              <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="field">
              <label>{t('Sana (gacha)')}</label>
              <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <button className="btn ghost" disabled={!from && !to} onClick={() => (setFrom(''), setTo(''))}>
              {t('Hamma davr')}
            </button>
            <label className="small" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={includePending} onChange={(e) => setIncludePending(e.target.checked)} />
              {t('Imzolanmagan (Ожидает) fakturalarni ham hisoblash')}
            </label>
            <span className="muted small">
              GTD: {bank.gtd.length} {t('ta tovar qatori')} · {t('Fakturalar')}: {bank.invoices.length}
            </span>
          </div>

          <div className="kpi-grid">
            <div className="card kpi brand">
              <div className="muted small">{t('Tovar turlari')}</div>
              <div className="kpi-value">{stock.rows.length}</div>
            </div>
            <div className={`card kpi ${negatives ? 'kt' : 'ok'}`}>
              <div className="muted small">{t('Qoldig‘i manfiy tovarlar')}</div>
              <div className="kpi-value">{negatives}</div>
            </div>
            <div className={`card kpi ${stock.unknownQty.length ? 'warn' : 'ok'}`}>
              <div className="muted small">{t('Soni ko‘rsatilmagan GTD qatorlari')}</div>
              <div className="kpi-value">{stock.unknownQty.length}</div>
            </div>
          </div>

          {bank.gtd.some((g) => g.qty === null) && <ManualQty gtd={bank.gtd} overrides={bank.stockQty} />}

          <div className="toolbar">
            <input className="input" style={{ maxWidth: 320 }} placeholder={t('Qidirish: tovar nomi')} value={query} onChange={(e) => setQuery(e.target.value)} />
            <label className="small" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={onlyNegative} onChange={(e) => setOnlyNegative(e.target.checked)} />
              {t('Faqat qoldig‘i manfiylar')}
            </label>
            <span className="muted small">
              {rows.length} / {stock.rows.length}
            </span>
          </div>

          <div className="card table-wrap">
            <table className="grid">
              <thead>
                <tr>
                  <th>{t('Tovar nomi')}</th>
                  <th>{t('Birlik')}</th>
                  {from && <th className="r">{t('Davr boshiga')}</th>}
                  <th className="r">{t('Kirim soni')}</th>
                  <th className="r">{t('Chiqim soni')}</th>
                  <th className="r">{t('Qoldiq')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="clickable" onClick={() => setOpen(r)}>
                    <td>
                      {r.name}
                      {r.negative && <div className="err-text small">⚠ {t('chiqim kirimdan ko‘p — kirim hujjati yetishmaydi yoki soni kiritilmagan')}</div>}
                    </td>
                    <td className="muted small">{r.unit}</td>
                    {from && (
                      <td className="r">
                        <Qty v={r.opening} />
                      </td>
                    )}
                    <td className="r ok-text">
                      <Qty v={r.qtyIn} />
                    </td>
                    <td className="r kt-code">
                      <Qty v={r.qtyOut} />
                    </td>
                    <td className="r">
                      <Qty v={r.balance} strong />
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={6} className="empty">
                      {t('Tanlangan davrda tovar harakati yo‘q.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="muted small">{t('Tovarlar nomi bo‘yicha bog‘lanadi: GTD tavsifining ruscha qismi olinadi, 1–2 harflik xatolar bitta tovar deb hisoblanadi. Xizmatlar (ijara, sertifikatlash va h.k.) omborga kirmaydi.')}</p>
        </>
      )}
      {open && <MovesModal row={open} onClose={() => setOpen(null)} />}
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
    const invoices: Invoice[] = [];
    const gtd: GtdItem[] = [];
    const invFiles: Array<{ file: string; ok: boolean; error?: string; count: number }> = [];
    const gtdFiles: Array<{ file: string; ok: boolean; error?: string; count: number }> = [];
    for (const f of Array.from(list)) {
      try {
        if (!/\.xlsx$/i.test(f.name)) throw new Error('Faqat .xlsx fayllar o‘qiladi.');
        const sheets = await readWorkbookRows(await f.arrayBuffer());
        const gSheets = sheets.filter(isGtdSheet);
        const invSheets = sheets.filter(isInvoiceSheet);
        if (!gSheets.length && !invSheets.length) throw new Error('Bu fayl GTD hisoboti ham, hisob-faktura reyestri ham emas.');
        const g = gSheets.flatMap((s) => parseGtd(s, f.name));
        const inv = invSheets.flatMap((s) => parseInvoices(s, f.name));
        if (gSheets.length) {
          gtd.push(...g);
          gtdFiles.push({ file: f.name, ok: true, count: g.length });
        }
        if (invSheets.length) {
          invoices.push(...inv);
          invFiles.push({ file: f.name, ok: true, count: inv.length });
        }
      } catch (e) {
        gtdFiles.push({ file: f.name, ok: false, error: (e as Error).message, count: 0 });
      }
    }
    if (invFiles.length) bankActions.addInvoices(invoices, invFiles);
    if (gtdFiles.length) bankActions.addGtd(gtd, gtdFiles);
    setBusy(false);
    toast(`${gtd.length} ta GTD qatori, ${invoices.length} ta faktura o‘qildi`);
  };

  const files = [
    ...bank.gtdFiles.map((f) => ({ ...f, what: f.ok ? (f.count ? `GTD: ${f.count} ta tovar` : 'GTD shabloni bo‘sh — tovar qatorlari yo‘q') : f.error ?? '' })),
    ...bank.invoiceFiles.map((f) => ({ ...f, what: f.ok ? `${t('hisob-fakturalar')}: ${f.count}` : f.error ?? '' })),
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
        <input ref={input} type="file" accept=".xlsx" multiple hidden onChange={(e) => void handle(e.target.files)} />
        <div className="dz-title">{busy ? t('O‘qilmoqda…') : t('GTD hisoboti (Excel shablon) va kirim/chiqim faktura reyestrlarini shu yerga tashlang')}</div>
        <div className="muted">{t('Fayl turi avtomatik aniqlanadi. Ekspres auditda yuklangan fakturalar shu yerda ham ishlatiladi. GTD hisobotingiz bo‘lmasa, “Excel shablon yuklab olish” orqali bo‘sh shablonni to‘ldiring.')}</div>
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

/**
 * GTD lines that state no quantity. Every such line stays listed so a hand-typed quantity can be
 * changed later or removed (×); the table folds away once all of them are filled.
 */
function ManualQty({ gtd, overrides }: { gtd: GtdItem[]; overrides: Record<string, number> }) {
  const t = useT();
  const lines = gtd
    .filter((g) => g.qty === null)
    .sort((a, b) => a.date.localeCompare(b.date) || a.gtdNo.localeCompare(b.gtdNo) || Number(a.itemNo) - Number(b.itemNo));
  const missing = lines.filter((g) => !(g.id in overrides)).length;
  const save = (id: string, text: string) => {
    if (!text.trim()) return bankActions.setStockQty(id, null);
    const v = Number(text.replace(/\s/g, '').replace(',', '.'));
    if (!isNaN(v) && v >= 0) bankActions.setStockQty(id, v);
    else toast('Son noto‘g‘ri kiritildi');
  };
  return (
    <details className="card table-wrap" open={missing > 0}>
      <summary className="card-pad" style={{ cursor: 'pointer' }}>
        <b>{t('GTD’da soni ko‘rsatilmagan tovarlar')}</b>{' '}
        <span className={missing ? 'tag warn' : 'tag'}>
          {missing ? `${missing} ${t('ta to‘ldirilmagan')}` : t('hammasi to‘ldirilgan')}
        </span>{' '}
        <span className="muted small">
          ({lines.length - missing} {t('tasi qo‘lda kiritilgan — o‘zgartirish mumkin')})
        </span>
        <div className="muted small">{t('Bu qatorlarda faqat joylar soni va og‘irlik bor. Haqiqiy sonini (invoys yoki yuk xatidan) kiriting — qoldiq shunga qarab hisoblanadi. Sonni o‘zgartirib Enter bosing yoki × bilan o‘chiring.')}</div>
      </summary>
      <table className="grid">
        <thead>
          <tr>
            <th>{t('Sana')}</th>
            <th>GTD</th>
            <th>{t('Tovar')}</th>
            <th className="r">{t('Joylar soni')}</th>
            <th className="r" style={{ width: 150 }}>
              {t('Soni')}
            </th>
            <th style={{ width: 40 }} />
          </tr>
        </thead>
        <tbody>
          {lines.map((g) => {
            const value = overrides[g.id];
            const filled = value !== undefined;
            return (
              <tr key={g.id}>
                <td>{fmtDay(g.date)}</td>
                <td className="code">
                  {g.gtdNo} / {g.itemNo}
                </td>
                <td className="small">{productDisplay(g.name)}</td>
                <td className="r muted">{g.places ?? '—'}</td>
                <td>
                  <input
                    key={`${g.id}:${value ?? ''}`}
                    className={`input num ${filled ? '' : 'bad'}`}
                    inputMode="decimal"
                    aria-label={t('Soni')}
                    placeholder={t('kiriting')}
                    defaultValue={filled ? String(value) : ''}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') {
                        (e.target as HTMLInputElement).value = filled ? String(value) : '';
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    onBlur={(e) => {
                      const text = e.target.value;
                      if (text.trim() === (filled ? String(value) : '')) return;
                      save(g.id, text);
                    }}
                  />
                </td>
                <td>
                  {filled && (
                    <button className="icon-btn" aria-label={t('Qo‘lda kiritilgan sonni o‘chirish')} title={t('Qo‘lda kiritilgan sonni o‘chirish')} onClick={() => bankActions.setStockQty(g.id, null)}>
                      ×
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </details>
  );
}

function MovesModal({ row, onClose }: { row: StockRow; onClose: () => void }) {
  const t = useT();
  return (
    <Modal
      title={row.name}
      onClose={onClose}
      wide
      footer={
        <button className="btn" onClick={onClose}>
          {t('Yopish')}
        </button>
      }
    >
      <p className="muted small">
        {t('Birlik')}: {row.unit || '—'} · {t('Davr boshiga')}: {fmtQty(row.opening)} · {t('Kirim')}: {fmtQty(row.qtyIn)} · {t('Chiqim')}: {fmtQty(row.qtyOut)} · {t('Qoldiq')}: {fmtQty(row.balance)}
      </p>
      <table className="grid">
        <thead>
          <tr>
            <th>{t('Sana')}</th>
            <th>{t('Hujjat')}</th>
            <th>{t('Kontragent')}</th>
            <th className="r">{t('Kirim')}</th>
            <th className="r">{t('Chiqim')}</th>
            <th className="r">{t('Qoldiq')}</th>
          </tr>
        </thead>
        <tbody>
          {row.moves.map((m) => (
            <tr key={m.id}>
              <td>{fmtDay(m.date)}</td>
              <td className="small">{m.doc}</td>
              <td className="small">{m.party}</td>
              <td className="r ok-text">
                {m.dir === 'in' ? (m.qty === null ? t('noma’lum') : fmtQty(m.qty)) : ''}
                {m.manual && <div className="tag">{t('qo‘lda')}</div>}
              </td>
              <td className="r kt-code">{m.dir === 'out' ? fmtQty(m.qty ?? 0) : ''}</td>
              <td className="r">
                <Qty v={m.balance} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
