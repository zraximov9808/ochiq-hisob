import { useT } from '../../i18n/useT';
import { bankActions, useBank, type UploadKind } from '../bank/bankStore';
import { toast } from './common';

const KIND_LABEL: Record<UploadKind, string> = { statement: 'vipiskalar', invoice: 'fakturalar', gtd: 'GTD' };

/**
 * Uploaded files of the given kinds: each can be deleted with what was read from it, or all at once.
 * The data lives in this company's uploads only; entries built from them are rebuilt without them.
 */
export function UploadedFiles({ kinds }: { kinds: UploadKind[] }) {
  const t = useT();
  const bank = useBank();
  const rows: Array<{ kind: UploadKind; file: string; ok: boolean; what: string }> = [
    ...(kinds.includes('statement')
      ? bank.files.map((f) => ({
          kind: 'statement' as const,
          file: f.file,
          ok: f.ok,
          what: f.ok ? `${t('bank vipiska')}: ${f.accounts.map((a) => `${a.currency} …${a.number.slice(-6)} (${a.count})`).join(', ')}` : t(f.error ?? ''),
        }))
      : []),
    ...(kinds.includes('invoice') ? bank.invoiceFiles.map((f) => ({ kind: 'invoice' as const, file: f.file, ok: f.ok, what: f.ok ? `${t('hisob-fakturalar')}: ${f.count}` : t(f.error ?? '') })) : []),
    ...(kinds.includes('gtd') ? bank.gtdFiles.map((f) => ({ kind: 'gtd' as const, file: f.file, ok: f.ok, what: f.ok ? `GTD: ${f.count}` : t(f.error ?? '') })) : []),
  ];
  if (!rows.length) return null;
  const present = kinds.filter((k) => rows.some((r) => r.kind === k));

  const removeOne = (r: (typeof rows)[number]) => {
    if (!confirm(t(`«${r.file}» fayli va undan o‘qilgan ma’lumotlar o‘chirilsinmi? Ulardan tuzilgan avto-provodkalar ham qayta tuziladi.`))) return;
    bankActions.removeFile(r.kind, r.file);
    toast(`O‘chirildi: ${r.file}`);
  };
  const removeKinds = (which: UploadKind[], what: string) => {
    const n = rows.filter((r) => which.includes(r.kind)).length;
    if (!confirm(t(`${what}: ${n} ta fayl va ulardan o‘qilgan ma’lumotlar o‘chiriladi. Davom etasizmi?`))) return;
    if (which.length === 3) bankActions.clearUploads();
    else for (const r of rows) if (which.includes(r.kind)) bankActions.removeFile(r.kind, r.file);
    toast(`${n} ta fayl o‘chirildi`);
  };

  return (
    <details className="card card-pad">
      <summary>
        <b>{t('Yuklangan fayllar')}</b> <span className="muted small">({rows.length})</span>
      </summary>
      <table className="grid uploads">
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.kind}:${r.file}`} className={r.ok ? undefined : 'err-text'}>
              <td className="c">{r.ok ? '✓' : '✗'}</td>
              <td>{r.file}</td>
              <td className="muted small">{r.what}</td>
              <td className="c">
                <button className="icon-btn" aria-label={t('Faylni o‘chirish')} title={t('Faylni va undan o‘qilganlarni o‘chirish')} onClick={() => removeOne(r)}>
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="toolbar" style={{ marginTop: 8 }}>
        <button className="btn small danger" onClick={() => removeKinds(present, t('Barcha yuklangan fayllar'))}>
          {t('Hammasini o‘chirish')}
        </button>
        {present.length > 1 &&
          present.map((k) => (
            <button key={k} className="btn small" onClick={() => removeKinds([k], t(`Barcha ${KIND_LABEL[k]}`))}>
              {t(`Faqat ${KIND_LABEL[k]}ni o‘chirish`)}
            </button>
          ))}
      </div>
    </details>
  );
}
