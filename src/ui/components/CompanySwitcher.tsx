import { useEffect, useRef, useState } from 'react';
import type { CompanyRef } from '../../store/companies';
import { useT } from '../../i18n/useT';
import { actions, useApp } from '../../store/store';
import { Modal, toast } from './common';

type Dialog = { mode: 'add' } | { mode: 'rename'; ref: CompanyRef } | { mode: 'remove'; ref: CompanyRef } | null;

const STIR = /^\d{9}$/;

function CompanyForm({ dialog, onClose }: { dialog: Extract<NonNullable<Dialog>, { mode: 'add' | 'rename' }>; onClose: () => void }) {
  const t = useT();
  const [name, setName] = useState(dialog.mode === 'rename' ? dialog.ref.name : '');
  const [stir, setStir] = useState(dialog.mode === 'rename' ? dialog.ref.stir : '');
  const badStir = stir.trim() !== '' && !STIR.test(stir.trim());
  const ok = name.trim() !== '' && !badStir;
  const submit = () => {
    if (!ok) return;
    try {
      if (dialog.mode === 'add') {
        actions.addCompany(name, stir);
        toast(`Korxona qo‘shildi: ${name.trim()}`);
      } else actions.renameCompany(dialog.ref.id, name, stir);
    } catch (e) {
      toast((e as Error).message);
    }
    onClose();
  };
  return (
    <Modal
      title={t(dialog.mode === 'add' ? 'Korxona qo‘shish' : 'Korxona nomi va STIR')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('Bekor qilish')}
          </button>
          <button className="btn primary" disabled={!ok} onClick={submit}>
            {t(dialog.mode === 'add' ? 'Qo‘shish' : 'Saqlash')}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <label>{t('Korxona nomi')}</label>
          <input className="input" autoFocus value={name} placeholder='"Namuna" MChJ' onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </div>
        <div className="field">
          <label>{t('STIR')}</label>
          <input className={`input ${badStir ? 'bad' : ''}`} inputMode="numeric" value={stir} placeholder={t('9 xonali')} onChange={(e) => setStir(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </div>
      </div>
      {dialog.mode === 'add' && (
        <p className="muted small">{t('Yangi korxonaning jurnali, sozlamalari va yuklangan fayllari alohida saqlanadi. Hozirgi korxona ma’lumotlari joyida qoladi.')}</p>
      )}
    </Modal>
  );
}

function RemoveDialog({ company: c, onClose }: { company: CompanyRef; onClose: () => void }) {
  const t = useT();
  const remove = () => {
    try {
      actions.removeCompany(c.id);
      toast(`Korxona o‘chirildi: ${c.name}`);
    } catch (e) {
      toast((e as Error).message);
    }
    onClose();
  };
  return (
    <Modal
      title={t('Korxonani o‘chirish')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('Bekor qilish')}
          </button>
          <button className="btn danger" onClick={remove}>
            {t('O‘chirish')}
          </button>
        </>
      }
    >
      <p>
        <b>{c.name || t('Nomsiz korxona')}</b> {c.stir && <span className="muted">({c.stir})</span>}
      </p>
      <p>{t('Bu korxonaning jurnali, sozlamalari va yuklangan fayllari (bank vipiskalar, fakturalar, GTD) shu brauzerdan butunlay o‘chiriladi. Faylga saqlangan nusxalar (.ohisob, Excel) saqlanib qoladi.')}</p>
    </Modal>
  );
}

/** Current company at the top of the side panel: switch, add, rename, remove. */
export function CompanySwitcher() {
  const t = useT();
  const { co } = useApp();
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const box = useRef<HTMLDivElement>(null);
  const cur = co.list.find((c) => c.id === co.currentId);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const pick = (id: string) => {
    setOpen(false);
    if (id === co.currentId) return;
    try {
      actions.switchCompany(id);
    } catch (e) {
      toast((e as Error).message);
      return;
    }
    const c = co.list.find((x) => x.id === id);
    toast(`Korxona: ${c?.name || t('Nomsiz korxona')}`);
  };
  const ask = (d: Dialog) => {
    setOpen(false);
    setDialog(d);
  };

  return (
    <div className="co-switch" ref={box}>
      <button className="co-current" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" title={t('Korxonani tanlash')}>
        <span className="co-label">{t('Korxona')}</span>
        <span className="co-name">{cur?.name || t('Nomsiz korxona')}</span>
        {cur?.stir && <span className="co-stir">STIR {cur.stir}</span>}
        <span className="co-caret">▾</span>
      </button>
      {open && (
        <div className="co-menu" role="menu">
          {co.list.map((c) => (
            <div key={c.id} className={`co-item ${c.id === co.currentId ? 'on' : ''}`}>
              <button className="co-pick" role="menuitem" onClick={() => pick(c.id)}>
                <span>{c.name || t('Nomsiz korxona')}</span>
                {c.stir && <small>{c.stir}</small>}
              </button>
              <button className="co-act" title={t('Nomini o‘zgartirish')} onClick={() => ask({ mode: 'rename', ref: c })}>
                ✎
              </button>
              {co.list.length > 1 && (
                <button className="co-act" title={t('O‘chirish')} onClick={() => ask({ mode: 'remove', ref: c })}>
                  ✕
                </button>
              )}
            </div>
          ))}
          <button className="co-add" role="menuitem" onClick={() => ask({ mode: 'add' })}>
            + {t('Korxona qo‘shish')}
          </button>
        </div>
      )}
      {dialog && dialog.mode !== 'remove' && <CompanyForm dialog={dialog} onClose={() => setDialog(null)} />}
      {dialog?.mode === 'remove' && <RemoveDialog company={dialog.ref} onClose={() => setDialog(null)} />}
    </div>
  );
}
