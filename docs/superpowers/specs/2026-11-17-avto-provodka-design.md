# Hujjatlardan avto-provodka va Ombor tovar filtri — dizayn

Sana: 2026-11-17. Holat: tasdiqlangan (2026-11-17).

## 1. Maqsad va nima uchun

Buxgalter bank vipiskalarini va kirim/chiqim e-faktura reyestrlarini (hamda import uchun GTD hisobotini) saytga yuklaydi — ilova provodkalarni o‘zi tuzib jurnalga yozadi, Buxgalteriya balansi (1-shakl), Moliyaviy natijalar (2-shakl) va foyda solig‘i shu provodkalardan avtomatik to‘ladi. Hozir provodkalar faqat qo‘lda kiritiladi; bank/faktura/GTD ma’lumotlari esa ilovada bor, lekin faqat tahlil (Bank, Ekspres audit, Ombor) uchun ishlatiladi.

Ikkinchi qism — Ombor: qoldiq tovar nomi bo‘yicha (foydalanuvchi tanlovi: “Tovar nomi bo‘yicha”) Excel-filtr kabi tanlab ko‘riladi; sotilgan tovarning kirimi topilmasa, ilova GTD hisobotini (shablon) yuklashni talab qiladi.

Natija shu chatdagi brauzerda (lokal sayt) ko‘rsatiladi; foydalanuvchi fayllarni o‘zi yuklaydi. Ommaviy sayt to‘xtatilgan holda qoladi (alohida so‘ralmagan).

## 2. Maqsadlar, maqsad emas, yomon natija

**Maqsadlar**
- Bir joyda (yangi “Hujjatlardan provodka” sahifasi) barcha fayllarni yuklash: vipiska, faktura reyestri (Didox/my.soliq .xlsx va soliq.uz CSV), GTD.
- Yuklash bilan provodkalar jurnalga “avto” belgisi bilan tushadi; balans va 2-shakl darhol yangilanadi.
- Har bir operatsiya turi uchun Dt/Kt jadvali — standart 21-son BHMS bo‘yicha, foydalanuvchi o‘zgartira oladi.
- Kontragentlar bo‘yicha subschyotlar (4010.NN, 6010.NN, 4610.NN) STIR bilan avtomatik ochiladi — balans “noto‘g‘ri tomondagi” qoldiqni bo‘nak qatoriga o‘zi o‘tkazadi (mavjud BALANCE_RULES).
- Valyuta operatsiyalari Markaziy bank kursi bo‘yicha so‘mga; oy oxirida valyuta qoldiqlari qayta baholanadi.
- Sotilgan tovar tannarxi o‘rtacha tortilgan narx bilan (GTD qiymati + boj/yig‘im, kirim fakturalari).
- Har bir taxmin va kamchilik “Diqqat” ro‘yxatida aniq ko‘rinadi.

**Maqsad emas (bu bosqichda)**
- Ish haqi hisoblash (vipiskada ish haqi ma’lumoti yo‘q) — faqat ogohlantirish.
- Asosiy vositalar, amortizatsiya, kassa, foyda solig‘i bo‘nagi hisoblash.
- Format B (1C vipiska) — namuna yo‘q, avvalgidek.
- Saytni internetga qayta chiqarish.

**Yomon natija (bo‘lmasligi kerak)**
- Qo‘lda kiritilgan yoki qo‘lda tuzatilgan provodkaning yo‘qolishi yoki ustidan yozilishi.
- Bitta faktura yoki bank operatsiyasi ikki marta provodka bo‘lishi (ikki reyestr, takroriy yuklash).
- Taxmin bilan tuzilgan summa “aniq”dek ko‘rinishi.
- Haqiqiy mijoz ma’lumotining git’ga tushishi (samples/ git’dan tashqarida qoladi).

## 3. Cheklovlar

- Statik sayt, server yo‘q; ma’lumot brauzerda: hujjat (provodkalar) — localStorage + `.ohisob` fayl; vipiska/faktura/GTD — IndexedDB (`bankStore`).
- Pul — butun tiyin; sanalar ISO.
- Yagona tashqi so‘rov: cbu.uz kurs API (brauzerdan CORS bilan ishlashi tekshirildi; 06.07.2026 USD = 11 973,90 — GTD’dagi kurs bilan mos). Internet bo‘lmasa — GTD kurslari va qo‘lda kiritilgan kurslar.
- Hisobvaraqlar rejasida 2970 va 8420 yo‘q — ishlatilmaydi.

## 4. Yondashuvlar

1. **Avto-provodkalar hujjatda saqlanadi va qayta tuziladi (tanlandi).** Har bir avto-provodkada manba kaliti (`bank:<opId>`, `inv:<id>:sale`, `gtd:<raqam>` …). Ma’lumot o‘zgarganda barcha tahrirlanmagan avto-provodkalar qayta tuziladi; qo‘lda o‘zgartirilgani “tahrirlangan” bo‘lib qoladi, o‘chirilgani qaytmaydi. Afzalligi: jurnalda ko‘rinadi, tahrirlanadi, `.ohisob` faylga tushadi, mavjud hisobot dvigateli o‘zgarmaydi.
2. Provodkalar saqlanmay, har safar hisoblanadi. Jurnalda tahrirlab bo‘lmaydi, fayl ularsiz qoladi, hisobotlar ikki xil manbadan yig‘ilishi kerak — rad etildi.
3. Bir martalik “Jurnalga import” tugmasi. Oddiy, lekin foydalanuvchi “avtomat” degan; qayta yuklashda dublikat xavfi — rad etildi.

## 5. Dizayn

### 5.1 Ma’lumot oqimi

```
fayllar ─► bankStore (statements, invoices, gtd, rates)        hujjat (Doc)
                 │                                                 │ auto sozlamalar
                 └──► buildAutoEntries(input, settings) ─► { entries, subaccounts, warnings }
                                                         └► applyAuto(doc) ─► jurnal ─► balans / 2-shakl / foyda solig‘i
```

- `src/auto/` — sof funksiyalar (testlar bilan): `bankEntries`, `invoiceEntries`, `gtdEntries`, `costing` (o‘rtacha narx), `fx` (kurs, qayta baholash), `vat` (oylik zachyot), `build` (hammasini yig‘ish), `apply` (hujjatga yozish).
- Sinxronlash: `App` da hook — bank ma’lumotlari, kurslar yoki sozlamalar o‘zgarsa (kirish xeshi `doc.auto.inputHash` dan farq qilsa) `applyAuto` bitta tarix qadami sifatida bajariladi. “Avtomatik yangilash” o‘chirilsa — faqat tugma bilan.
- Hujjat bo‘sh bo‘lsa (provodka va qoldiq yo‘q), hujjat yili va korxona nomi/STIR ma’lumotdan olinadi. Yil mos kelmasa — ogohlantirish.

### 5.2 Hujjat modeli o‘zgarishi

- `Entry.auto?: { src: string; edited?: boolean }`.
- `Doc.auto?: { enabled: boolean; inputHash: string; skip: string[]; accounts: Record<bankAccountNo, string>; types: Record<bankType, string>; services: Record<inn, string>; serviceDefault: string; includePending: boolean; rates: Record<'USD:2026-07-06', number> }` — `parseDocFile` yo‘q maydonlarni standart qiymat bilan to‘ldiradi.
- Jurnal: avto-provodka tahrirlansa `edited: true`; o‘chirilsa `src` → `skip`. “Avto-provodkalarni tiklash” tugmasi `skip`/`edited` ni tozalaydi.

### 5.3 Hisobvaraq ifodasi

Jadvallarda hisobvaraq quyidagicha yoziladi:
- `9690` — rejadagi hisobvaraq;
- `6010.*` — har bir kontragent uchun subschyot (STIR bo‘yicha, yo‘q bo‘lsa nom bo‘yicha; mavjud `nextSubCode` qoidasi bilan);
- `6010[Xorijiy yetkazib beruvchilar]` — nomli subschyot (nomi bo‘yicha topiladi, yo‘q bo‘lsa keyingi bo‘sh raqam ochiladi).

### 5.4 Bank hisobvaraqlari → buxgalteriya hisobvarag‘i (standart, tahrirlanadi)

| Bank hisobi | Hisobvaraq |
|---|---|
| 202xx, UZS | 5110 (bir nechta bo‘lsa 5110.NN) |
| 202xx, valyuta | 5210[<valyuta> <hisob oxiri>] |
| 226xx, UZS (masalan, 22613 valyuta xaridi) | 5530[...] |
| 226xx, valyuta (22614) | 5210[...] |
| boshqa (23xxx, QR tranzit) | 5530[...] |

### 5.5 Bank operatsiyasi → provodka

Tushum: Dt bank Kt X; to‘lov: Dt X Kt bank. X — tur jadvalidan (standart):

| Tur | X |
|---|---|
| Mijozdan tushum, Eksport xizmatlari uchun tushum | 4010.* |
| Terminal (QR/POS) savdo tushumi, Ta’sischidan tushum («savdo puli») | 4010[Chakana savdo] (diqqat ro‘yxatida) |
| Ustav fondiga hissa | 4610.* (+ e’lon: Dt 4610.* Kt 8330, agar boshlang‘ich qoldiqda 8330 bo‘lmasa) |
| Yetkazib beruvchiga to‘lov, Ijara, Deklarantlik, Sertifikatlash, ERI, Internet, Kommunal, IT Park | 6010.* (xarajat fakturadan tan olinadi) |
| Xorijiy yetkazib beruvchiga to‘lov (import), Xorijiy transport | 6010[Xorijiy yetkazib beruvchilar] |
| Ish haqi | 6710 |
| Bank komissiyasi (barcha turlari) | 9690 |
| Bojxona to‘lovlari | 4410[Bojxona to‘lovlari bo‘naki] |
| JShDS, INPS | 6410[JShDS] |
| Ijtimoiy soliq | 6520 |
| Aylanmadan olinadigan soliq | 6410[Aylanmadan soliq] |
| QQS / Foyda / Mol-mulk solig‘i | 6410[Soliqlar] |
| Boshqa byudjet to‘lovlari, Ekologik/davlat to‘lovlari | 9430 |
| Penya | 9430 (soliq bazasidan chegirilmaydi) |
| Berilgan moliyaviy qarz / qaytishi | 5830.* |
| Moliyaviy yordam (jismoniy shaxsga) | 9430 (chegirilmaydi) |
| Ichki o‘tkazmalar (o‘z hisoblari, QR → asosiy) | 5710 (UZS) / 5720[Valyuta o‘tkazmalari] (valyuta) — har tomon alohida, tranzit nolga tushadi; tushmasa — “vipiska yetishmaydi” |
| Valyuta xaridi: so‘m to‘lovi (SPOT) / valyuta tushumi | 5720[Valyuta xaridi]; juftlikdagi farq → 9430 (zarar) / 9390 (foyda) |
| Valyutani sotish (rezerv / tushum) | 5720[Valyuta sotuvi]; farq → 9430 / 9390 |
| Tasniflanmagan: tushum / to‘lov (STIR bor) | 4010.* / 6010.* |
| Tasniflanmagan, STIR yo‘q | 6990[Aniqlanmagan tushumlar] / 4890[Aniqlanmagan to‘lovlar] (diqqat) |

Valyuta hisobidagi operatsiya: summa × MB kursi (operatsiya sanasi).

### 5.6 Fakturalar → provodka

Faqat “Подписан/Подтверждён” (sozlamada “Ожидает” ham). Bir faktura ikki reyestrda bo‘lsa — ID bo‘yicha bitta, tarkibli (Didox .xlsx) ustun.

**Chiqim (biz sotuvchi):**
- tovar qatorlari: Dt 4010.* Kt 9020 (QQSsiz); xizmat qatorlari: Kt 9030;
- QQS: Dt 4010.* Kt 6410[QQS];
- tannarx: Dt 9120 Kt 2910 = soni × o‘rtacha narx (5.8); narx noma’lum tovar — diqqat: “GTD hisobotini yuklang”.

**Kirim (biz xaridor):**
- tovar: Dt 2910 Kt 6010.*; xizmat: Dt 9420 (kontragent bo‘yicha o‘zgartirsa bo‘ladi, masalan broker → 2910) Kt 6010.*;
- QQS: Dt 4410[QQS] Kt 6010.*.

**Tarkibsiz faktura (soliq.uz CSV):** chiqim — jami summadan 12/112 QQS, tovar deb olinadi (korxona QQS to‘lovchi bo‘lsa), tannarx hisoblanmaydi; kirim — shu kontragentning tarkibli fakturalaridagi ulush (tovar/xizmat, QQS) bo‘yicha, ma’lumot bo‘lmasa xizmat, QQSsiz. Har biri diqqat ro‘yxatida “taxminiy”.

Xizmat/tovar ajratish: “Происхождение” = “Оказание услуг” yoki birlik xizmat (услуга, xizmat, oy, kv. metr) — xizmat; qolgani tovar.

### 5.7 GTD (import) → provodka

Har bir GTD (ИМ rejimi):
- tovar qiymati: Σ гр.42 × гр.23 kurs → Dt 2910 Kt 6010[Xorijiy yetkazib beruvchilar] (valyutada ham kuzatiladi);
- boj, yig‘im, ko‘rik, aksiz, boshqa (47-1) → Dt 2910 Kt 4410[Bojxona to‘lovlari bo‘naki];
- import QQS (47-1 НДС) → Dt 4410[QQS] Kt 4410[Bojxona to‘lovlari bo‘naki].
Eksport (ЭК) — qiymat provodkasi yo‘q (faqat ombor chiqimi).

### 5.8 Tannarx (o‘rtacha tortilgan)

Tovar kaliti — Ombordagi kabi (`productKey` + o‘xshash nomlarni birlashtirish). Kirim narxi: GTD qatori — (гр.42 × kurs + qatorning 47-1 boj/aksiz + GTD bo‘yicha yig‘im/ko‘rik qiymat ulushiga qarab) / soni; kirim faktura — QQSsiz summa / soni. Soni noma’lum GTD qatori — Omborda qo‘lda kiritilgan son ishlatiladi, bo‘lmasa narxga kirmaydi (diqqat). Sotuv sanasigacha bo‘lgan kirimlar bo‘yicha o‘rtacha narx (sana tartibida, xronologik).

### 5.9 Valyuta

- Kurslar: qo‘lda kiritilgan → cbu.uz (IndexedDB keshi) → GTD kurslari. Yetishmagan sanalar avtomatik so‘raladi; olinmasa — operatsiya provodkasiz qoladi, diqqat ro‘yxatida.
- Oy oxirida qayta baholash: 5210 subschyotlari, 5720[Valyuta o‘tkazmalari] va 6010[Xorijiy yetkazib beruvchilar] (valyutada kuzatilgani) — farq Dt 9620 / Kt 9540.
- Ustav fondiga valyutada hissa — operatsiya sanasidagi kursda, qayta baholanmaydi.

### 5.10 QQS zachyoti

Har oy oxirida: Dt 6410[QQS] Kt 4410[QQS] — oy oxiridagi hisobga olinadigan QQS va to‘lanadigan QQS qoldiqlarining kichigi.

### 5.11 Diqqat ro‘yxati (sahifada)

Kurs topilmadi · Tannarxi noma’lum sotuv (→ GTD shabloni yuklab olish tugmasi bilan) · Taxminiy QQS/tarkib (CSV) · Ish haqi hisoblanmagan (JShDS/ijtimoiy soliq to‘langan, 6710 hisoblash yo‘q) · Tasniflanmagan bank operatsiyalari · Tranzit (5710/5720) nolga tushmadi · Hujjat yilidan tashqari operatsiyalar · Ustav kapitali hissalar bo‘yicha olingani.

### 5.12 Interfeys

- **Yangi sahifa “Hujjatlardan provodka”** (navigatsiyada Jurnal yonida): bitta yuklash maydoni (barcha turdagi fayllar — mavjud Bank/Audit/Ombor yuklash mantig‘i umumiy funksiyaga ajratiladi); yuklangan fayllar; xulosa (manba bo‘yicha provodkalar soni va summasi, jurnaldagi avto-provodkalar); Diqqat ro‘yxati; sozlamalar bo‘limlari: bank hisoblari, operatsiya turlari jadvali, xizmatlar hisobvarag‘i, kurslar jadvali (“cbu.uz’dan yangilash”); “Avtomatik yangilash” va “Avto-provodkalarni tiklash”.
- **Jurnal:** “avto” belgisi va manba (Bank / Faktura № / GTD №), filtr: hammasi / avto / qo‘lda.
- Bank, Ekspres audit, Ombor sahifalaridagi yuklash ham shu ma’lumotga tushadi va provodkalarni yangilaydi.

### 5.13 Ombor

- Tovar nomi filtri: Exceldagi avtofiltr kabi ochiluvchi ro‘yxat — tovar nomlari belgilash katakchalari bilan, ichida qidiruv, “Hammasi”; jadval va Excel eksport shu tanlovga bo‘ysunadi.
- GTD talabi: chiqimi bor, kirimi yo‘q (yoki manfiy) tovarlar — yuqorida banner “Bu tovarlar kirimi topilmadi — import bo‘lsa GTD hisobotini (shablon) yuklang” va shablon tugmasi; qatorda “GTD kerak” belgisi.
- Tarkibsiz (CSV) fakturalar omborga kirmaydi — eslatma.

## 6. Quruvchiga qoldirilgan (o‘zim hal qildim)

- Subschyot nomlari va raqamlari (mavjud `nextSubCode` qoidasi).
- Provodka matni: “Bank: <tur> — <kontragent>”, “Faktura № N — <kontragent>”, “GTD № N”.
- Bir faktura uchun provodkalar soni: tovar, xizmat, QQS, tannarx — har biri bittadan (qatorlar yig‘iladi).
- Kurs keshini IndexedDB’da saqlash; cbu.uz so‘rovi faqat sana va valyuta kodi bilan.
- Tannarx sanasi — sotuv fakturasi sanasi.
- Testlar: sun’iy namunalar bilan unit testlar (git’da), haqiqiy fayllar bilan qabul testi faqat `samples/` da (git’dan tashqari).
- Jurnalda shu davrda bank/hisob-kitob hisobvaraqlariga qo‘lda kiritilgan provodkalar bo‘lsa — “ikki marta hisoblanishi mumkin” ogohlantirishi (avto-provodkalarni o‘chirish imkoni bilan).
- Yil yopilgan bo‘lsa (yopish provodkalari bor) va avto-provodkalar o‘zgarsa — “yilni qayta yoping” ogohlantirishi.
- Valyuta xaridi juftligi: SPOT so‘m to‘lovi va valyuta tushumi sana bo‘yicha ketma-ket juftlanadi.
- Xorijiy yetkazib beruvchilar puli har valyuta uchun alohida kuzatiladi (GTD гр.22 valyuta kodi).
