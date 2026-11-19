import { useState } from 'react';
import { INCOME_LINES } from '../../engine/incomeStatement';
import { sampleDoc } from '../../engine/sample';
import type { Company, CompanyCodes } from '../../engine/types';
import { useT } from '../../i18n/useT';
import { bankActions } from '../bank/bankStore';
import { actions, useApp } from '../../store/store';
import { AmountInput, PageHead, toast } from '../components/common';

function TextField({ label, value, onCommit, placeholder }: { label: string; value: string; onCommit: (v: string) => void; placeholder?: string }) {
  const t = useT();
  const [v, setV] = useState(value);
  return (
    <div className="field">
      <label>{t(label)}</label>
      <input className="input" value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onCommit(v)} />
    </div>
  );
}

export function SettingsPage() {
  const t = useT();
  const { h } = useApp();
  const doc = h.doc;
  const setCompany = (k: Exclude<keyof Company, 'codes'>) => (v: string) =>
    actions.update((d) => {
      d.company[k] = v.trim();
    });
  const setCode = (k: keyof CompanyCodes) => (v: string) =>
    actions.update((d) => {
      d.company.codes = { ...d.company.codes, [k]: v.trim() };
      if (!v.trim()) delete d.company.codes[k];
    });
  const codes = doc.company.codes ?? {};
  return (
    <div className="page" key={doc.year + doc.company.name}>
      <PageHead title="Sozlamalar">{t('Korxona rekvizitlari rasmiy shakllarning sarlavhasiga yoziladi.')}</PageHead>
      <div className="card card-pad">
        <h3 style={{ marginBottom: 12 }}>{t('Korxona')}</h3>
        <div className="form-grid">
          <TextField label="Korxona nomi" value={doc.company.name} onCommit={setCompany('name')} placeholder='"Namuna" MChJ' />
          <TextField label="STIR" value={doc.company.stir} onCommit={setCompany('stir')} placeholder="9 xonali" />
          <TextField label="Manzil" value={doc.company.address} onCommit={setCompany('address')} />
          <TextField label="Rahbar" value={doc.company.director} onCommit={setCompany('director')} />
          <TextField label="Bosh buxgalter" value={doc.company.accountant} onCommit={setCompany('accountant')} />
          <TextField label="Soliq organi" value={doc.company.taxOffice} onCommit={setCompany('taxOffice')} />
        </div>
      </div>
      <div className="card card-pad">
        <h3 style={{ marginBottom: 4 }}>{t('Rasmiy shakllar sarlavhasi')}</h3>
        <p className="muted small" style={{ marginTop: 0 }}>{t('1- va 2-shakl tepasidagi korxona kartochkasi. To‘ldirilmasa, bo‘sh qoladi.')}</p>
        <div className="form-grid">
          <TextField label="Faoliyat turi" value={doc.company.industry ?? ''} onCommit={setCompany('industry')} />
          <TextField label="Tashkiliy-huquqiy shakli" value={doc.company.legalForm ?? ''} onCommit={setCompany('legalForm')} placeholder="MChJ" />
          <TextField label="Mulkchilik shakli" value={doc.company.ownership ?? ''} onCommit={setCompany('ownership')} placeholder="Xususiy" />
          <TextField label="Vazirlik, idora, xo‘jalik birlashmasi" value={doc.company.ministry ?? ''} onCommit={setCompany('ministry')} />
          <TextField label="Hudud" value={doc.company.region ?? ''} onCommit={setCompany('region')} />
          <TextField label="KTUT (OKPO)" value={codes.ktut ?? ''} onCommit={setCode('ktut')} />
          <TextField label="IFUT (OKED)" value={codes.ifut ?? ''} onCommit={setCode('ifut')} />
          <TextField label="TXSHT (OKOPF)" value={codes.txsht ?? ''} onCommit={setCode('txsht')} />
          <TextField label="MShT (OKFS)" value={codes.msht ?? ''} onCommit={setCode('msht')} />
          <TextField label="DBIBT (SOOGU)" value={codes.dbibt ?? ''} onCommit={setCode('dbibt')} />
          <TextField label="MHOBT (SOATO)" value={codes.mxobt ?? ''} onCommit={setCode('mxobt')} />
        </div>
      </div>
      <div className="card card-pad">
        <h3 style={{ marginBottom: 12 }}>{t('Hisobot')}</h3>
        <div className="form-grid">
          <div className="field">
            <label>{t('Hisobot yili')}</label>
            <input
              className="input"
              type="number"
              defaultValue={doc.year}
              onBlur={(e) => {
                const y = Number(e.target.value);
                if (y > 1990 && y < 2100 && y !== doc.year) {
                  actions.update((d) => {
                    d.year = y;
                  });
                  toast(`Hisobot yili: ${y}. Boshqa yil sanasidagi provodkalar hisobga olinmaydi.`);
                }
              }}
            />
          </div>
          <div className="field">
            <label>{t('Foyda solig‘i stavkasi, %')}</label>
            <input
              className="input"
              type="number"
              step="0.5"
              defaultValue={doc.taxRate}
              onBlur={(e) => {
                const r = Number(e.target.value);
                if (r >= 0 && r <= 100 && r !== doc.taxRate)
                  actions.update((d) => {
                    d.taxRate = r;
                  });
              }}
            />
          </div>
        </div>
      </div>
      <div className="card card-pad">
        <h3>{t('2-shakl: o‘tgan yilning shu davri')}</h3>
        <p className="muted small">{t('So‘mda kiriting. Natija satrlarida (030, 100, 220, 230, 240, 270) zarar bo‘lsa minus bilan yozing. Yilni yopib keyingi yilga o‘tganda bu ustun avtomatik to‘ldiriladi.')}</p>
        <table className="grid">
          <tbody>
            {INCOME_LINES.map((l) => (
              <tr key={l.code}>
                <td className="code" style={{ width: 50 }}>
                  {l.code}
                </td>
                <td>{t(l.label)}</td>
                <td style={{ width: 200 }}>
                  <AmountInput
                    lazy
                    value={doc.prevYear[l.code] ?? 0}
                    onChange={(v) =>
                      actions.update((d) => {
                        if (v) d.prevYear[l.code] = v;
                        else delete d.prevYear[l.code];
                      })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card card-pad">
        <h3 style={{ marginBottom: 8 }}>{t('Ma’lumotlar')}</h3>
        <p className="muted small">{t('Barcha ma’lumotlar faqat shu brauzerda va siz saqlagan .ohisob faylida turadi — hech qayerga yuborilmaydi. Muhim ishni “Saqlash” bilan faylga saqlab qo‘ying.')}</p>
        <button
          className="btn danger"
          onClick={() => {
            const name = doc.company.name || t('Nomsiz korxona');
            if (
              !confirm(
                t(`«${name}» korxonasining provodkalari, qoldiqlari, subschyotlari, shakllarga qo‘lda kiritilganlari va yuklangan fayllari (vipiska, faktura, GTD) shu brauzerdan o‘chiriladi. Korxona rekvizitlari va boshqa korxonalar qoladi, saqlangan fayllaringizga tegmaydi. Davom etasizmi?`),
              )
            )
              return;
            actions.update((d) => {
              d.entries = [];
              d.opening = [];
              d.subaccounts = [];
              d.prevYear = {};
              delete d.forms;
              delete d.formNames;
              delete d.auto;
            });
            bankActions.clearUploads();
            toast('Korxona ma’lumotlari tozalandi (provodkalarni Ctrl+Z bilan qaytarish mumkin, yuklangan fayllarni esa qayta yuklang)');
          }}
        >
          {t('Shu korxona ma’lumotlarini tozalash')}
        </button>
      </div>
    </div>
  );
}

export function HelpPage() {
  const t = useT();
  const { h } = useApp();
  const start = () => {
    // with data of its own, the button only goes to the journal; the demo opens as a company of its own
    if (!h.doc.entries.length) actions.openDoc(sampleDoc(h.doc.year), null);
    actions.setUi({ page: 'journal' });
  };
  return (
    <div className="page help">
      <PageHead title="Ochiq Hisob — provodkadan hisobotgacha">
        {t('Bepul va ochiq web ilova: buxgalter faqat provodkalarni kiritadi, ilova esa balans (1-shakl), moliyaviy natijalar (2-shakl) va foyda solig‘i hisob-kitobini bir vaqtda tuzadi va ularning o‘zaro mosligini tekshiradi.')}
      </PageHead>
      <div className="card card-pad">
        <div className="toolbar" style={{ marginBottom: 10 }}>
          <button className="btn primary" onClick={start}>
            {h.doc.entries.length ? t('Jurnalga o‘tish') : t('Namuna bilan tanishish')}
          </button>
          <button className="btn" onClick={() => actions.setUi({ page: 'opening' })}>
            {t('O‘z ma’lumotlarim bilan boshlash')}
          </button>
        </div>
        <h2>{t('Qanday ishlaydi')}</h2>
        <ol>
          <li>{t('Sozlamalarda korxona nomi, STIR va hisobot yilini kiriting.')}</li>
          <li>{t('“Yil boshidagi qoldiqlar”ga o‘tgan yil oxiridagi qoldiqlarni kiriting yoki Exceldan import qiling.')}</li>
          <li>{t('“Provodkalar jurnali”da har bir xo‘jalik operatsiyasini kiriting: sana, mazmun, debet, kredit, summa.')}</li>
          <li>{t('Yuqoridan davrni tanlang (I chorak, yarim yil, 9 oy, yillik) — hisobotlar o‘sib boruvchi tartibda tuziladi.')}</li>
          <li>{t('O‘ng paneldagi tekshiruvlar yashil bo‘lsa, “Rasmiy shakllar” tugmasi bilan 3 ta Excel faylni yuklab oling.')}</li>
          <li>{t('Ishni “Saqlash” bilan .ohisob faylga saqlang; keyin “Ochish” bilan davom ettirasiz.')}</li>
        </ol>
        <h2>{t('Foydali imkoniyatlar')}</h2>
        <ul>
          <li>{t('Subschyotlar (6010.05) — kontragentlar bo‘yicha qoldiq va solishtirish dalolatnomasi.')}</li>
          <li>{t('Takroriy provodkalar — ijara, ish haqi kabi oylik operatsiyalar bir tugmada.')}</li>
          <li>{t('Yil oxirida — yopish provodkalari va keyingi yilga qoldiqlarni ko‘chirish.')}</li>
          <li>{t('Lotin / Кирилл almashtirgichi, ming so‘m / so‘m ko‘rinishi.')}</li>
          <li>
            <span className="kbd">Ctrl+Z</span> {t('— orqaga,')} <span className="kbd">Ctrl+Y</span> {t('— qaytarish,')} <span className="kbd">Ctrl+S</span> {t('— saqlash.')}
          </li>
          <li>{t('Internet bo‘lmasa ham ishlaydi (birinchi ochilgandan keyin).')}</li>
        </ul>
        <h2>{t('Muhim')}</h2>
        <p className="muted">
          {t('Ilova hisob-kitobni avtomatlashtiradi, lekin buxgalter tekshiruvining o‘rnini bosmaydi. Hisobotni topshirishdan oldin raqamlarni va satr kodlarini amaldagi rasmiy shakl bilan solishtiring. Foyda solig‘i ilovalarining ayrim satrlari “shakl bilan solishtiring” belgisi bilan ko‘rsatilgan.')}
        </p>
      </div>
    </div>
  );
}
