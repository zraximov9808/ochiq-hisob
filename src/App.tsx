import { useEffect, useMemo, useState } from 'react';
import { runChecks } from './engine/checks';
import { formatDate } from './engine/period';
import type { Opening } from './engine/types';
import { uid } from './engine/uid';
import type { ParsedEntry } from './excel/parse';
import { useT } from './i18n/useT';
import { pickFile, saveDocToFile } from './store/fileIO';
import { actions, getState, isDirty, useApp } from './store/store';
import { AccountDatalist, Modal, ToastHost, toast } from './ui/components/common';
import { ReportContext } from './ui/report';
import { ChecksPanel, SideNav, TopBar } from './ui/components/Shell';
import { JournalPage } from './ui/pages/JournalPage';
import { OpeningPage } from './ui/pages/OpeningPage';
import { HelpPage, SettingsPage } from './ui/pages/OtherPages';
import { BalancePage, IncomePage, TaxPage, TrialBalancePage } from './ui/pages/ReportPages';
import { SubaccountsPage } from './ui/pages/SubaccountsPage';

type ImportResult =
  | { kind: 'journal'; entries: ParsedEntry[]; errors: string[]; file: string }
  | { kind: 'opening'; opening: Opening[]; errors: string[]; file: string };

const isTyping = (el: EventTarget | null) => el instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);

export default function App() {
  const t = useT();
  const { h, ui } = useApp();
  const report = useMemo(() => runChecks(h.doc, ui.quarter), [h.doc, ui.quarter]);
  const [imported, setImported] = useState<ImportResult | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 's') {
        e.preventDefault();
        void saveDocToFile(getState().h.doc).then((name) => name && (actions.markSaved(name), toast(`Saqlandi: ${name}`)));
      } else if ((k === 'z' || k === 'я') && !e.shiftKey && !isTyping(e.target)) {
        e.preventDefault();
        actions.undo();
      } else if ((k === 'y' || (k === 'z' && e.shiftKey)) && !isTyping(e.target)) {
        e.preventDefault();
        actions.redo();
      }
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (isDirty()) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, []);

  const runImport = async (kind: 'journal' | 'opening') => {
    const file = await pickFile('.xlsx,.csv');
    if (!file) return;
    try {
      const [{ readSheetRows }, parse] = await Promise.all([import('./excel/importXlsx'), import('./excel/parse')]);
      const rows = await readSheetRows(file);
      if (kind === 'journal') setImported({ kind, file: file.name, ...parse.parseJournalRows(rows) });
      else setImported({ kind, file: file.name, ...parse.parseOpeningRows(rows) });
    } catch (e) {
      toast(`Faylni o‘qib bo‘lmadi: ${(e as Error).message}`);
    }
  };

  const onExcel = async (kind: 'all' | 'forms' | 'import') => {
    if (kind === 'import') return runImport(ui.page === 'opening' ? 'opening' : 'journal');
    try {
      const x = await import('./excel/exportForms');
      if (kind === 'all') await x.exportAllReports(h.doc, ui.quarter, report);
      else await x.exportOfficialForms(h.doc, ui.quarter, report);
    } catch (e) {
      toast(`Excel yaratilmadi: ${(e as Error).message}`);
    }
  };

  const applyImport = (mode: 'append' | 'replace') => {
    if (!imported) return;
    actions.update((d) => {
      if (imported.kind === 'journal') {
        const items = imported.entries.map((e) => ({ id: uid(), ...e }));
        d.entries = mode === 'replace' ? items : [...d.entries, ...items];
      } else {
        d.opening = mode === 'replace' ? imported.opening : [...d.opening, ...imported.opening];
      }
    });
    toast(imported.kind === 'journal' ? `${imported.entries.length} ta provodka import qilindi` : `${imported.opening.length} ta qoldiq import qilindi`);
    setImported(null);
  };

  const page = (() => {
    switch (ui.page) {
      case 'opening':
        return <OpeningPage onImport={() => runImport('opening')} />;
      case 'journal':
        return <JournalPage />;
      case 'subaccounts':
        return <SubaccountsPage />;
      case 'balance':
        return <BalancePage />;
      case 'income':
        return <IncomePage />;
      case 'tax':
        return <TaxPage />;
      case 'trial':
        return <TrialBalancePage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <HelpPage />;
    }
  })();

  const count = imported ? (imported.kind === 'journal' ? imported.entries.length : imported.opening.length) : 0;
  return (
    <ReportContext.Provider value={report}>
      <div className="app">
        <SideNav />
        <div className="main">
          <TopBar onExcel={onExcel} />
          <div className="content">
            {page}
            <ChecksPanel />
          </div>
        </div>
      </div>
      <AccountDatalist subaccounts={h.doc.subaccounts} />
      <ToastHost />
      {imported && (
        <Modal
          title={`${t('Exceldan import')}: ${imported.file}`}
          onClose={() => setImported(null)}
          footer={
            <>
              <button className="btn" onClick={() => setImported(null)}>
                {t('Bekor qilish')}
              </button>
              <button className="btn" disabled={!count} onClick={() => applyImport('replace')}>
                {t('Joriylarini almashtirish')}
              </button>
              <button className="btn primary" disabled={!count} onClick={() => applyImport('append')}>
                {t('Qo‘shish')}
              </button>
            </>
          }
        >
          <p>
            {imported.kind === 'journal' ? t(`${count} ta provodka o‘qildi.`) : t(`${count} ta hisobvaraq qoldig‘i o‘qildi.`)}{' '}
            {imported.errors.length > 0 && <span className="warn-text">{t(`${imported.errors.length} ta qator o‘tkazib yuborildi.`)}</span>}
          </p>
          {imported.kind === 'journal' && count > 0 && (
            <p className="muted small">
              {formatDate(imported.entries[0].date)} … {formatDate(imported.entries[imported.entries.length - 1].date)}
            </p>
          )}
          {imported.errors.length > 0 && (
            <ul className="small muted">
              {imported.errors.slice(0, 12).map((e, i) => (
                <li key={i}>{t(e)}</li>
              ))}
            </ul>
          )}
          <p className="muted small">
            {imported.kind === 'journal'
              ? t('Kutilgan ustunlar: Sana, Mazmun, Debet, Kredit, Summa (so‘mda). Sarlavha qatori istalgan joyda bo‘lishi mumkin.')
              : t('Kutilgan ustunlar: Hisobvaraq, Debet qoldiq, Kredit qoldiq (so‘mda).')}
          </p>
        </Modal>
      )}
    </ReportContext.Provider>
  );
}
