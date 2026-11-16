# Ochiq Hisob — provodkadan hisobotgacha

Bepul web ilova: buxgalter faqat provodkalarni kiritadi, ilova esa bir vaqtda quyidagilarni tuzadi:

- **Buxgalteriya balansi (1-shakl)**
- **Moliyaviy natijalar to‘g‘risida hisobot (2-shakl)**
- **Foyda solig‘i hisob-kitobi** (asosiy shakl, 1-ilova, 2-ilova)

…va ularning o‘zaro mosligini tekshiradi (aktiv = passiv, sof foyda → 450-satr, foyda solig‘i 150 = 2-shakl 250, sof tushum 2-shakl 010 = 1-ilova 020).

## Imkoniyatlar

- Yil boshidagi qoldiqlar, provodkalar jurnali (jonli izoh: hisobvaraq nomi va hisobotdagi joyi)
- Har bir provodka uchun foyda solig‘i satri avtomatik tanlanadi, “chegirilmaydi” belgisi (jarima, xayriya…)
- Subschyotlar (6010.05), kontragent STIR, solishtirish dalolatnomasi (Excel)
- Aylanma-saldo qaydnomasi, satrni bosib manbasini ko‘rish
- Takroriy provodkalar, namuna ma’lumotlar, yil yakuni yopish va keyingi yilga o‘tish
- Excel: 3 ta rasmiy shakl, barcha hisobotlar kitobi, jurnal/qoldiqlarni import qilish
- Lotin / Кирилл, ming so‘m / so‘m, Ctrl+Z / Ctrl+Y / Ctrl+S
- Server yo‘q: ma’lumotlar faqat brauzerda va foydalanuvchining `.ohisob` faylida. Birinchi ochilgandan keyin internetsiz ishlaydi.

## Bank vipiska bo‘limi

Bir yoki bir nechta bank vipiskasini (.xlsx) tashlang. Bo‘lim quyidagilarni qiladi:

- hisoblar va operatsiyalarni o‘qiydi, bir hisob bir nechta faylda bo‘lsa birlashtiradi va dublikatlarni olib tashlaydi;
- har bir operatsiyaga guruh (Kirim / Chiqim / Soliqlar) va tur beradi — qoidalar `src/bank/rules/default-rules.json` da, ilovadagi “Qoidalar” muharririda o‘zgartiriladi;
- qoldiqni tekshiradi (boshlang‘ich − debet + kredit = bankdagi yakuniy qoldiq, “Итоговый оборот” bilan solishtirish);
- ekranlar: Svod, Hisoblar (filtr, qoldiq grafigi, turni qo‘lda o‘zgartirish), Turlar, Korrespondentlar, Oylar, Valyuta (konvertatsiya kurslari), Diqqat (avtomatik belgilar), Qoidalar;
- formulali Excel hisobot: Svod, Turlar svodi, har bir hisob va korrespondentlar varaqlari, Batafsil, Diqqat.

Vipiskalar faqat brauzerda (IndexedDB) saqlanadi; “Hammasini o‘chirish” tugmasi bor.

## Ekspres audit bo‘limi

Bank vipiskalari va hisob-faktura reyestrlarini (my.soliq / Didox eksporti .xlsx yoki soliq.uz CSV — kirim va chiqim) birga yuklang. Har bir korxona (STIR bo‘yicha) uchun:

- **Kirgan pul** (bankka tushgan) va **Chiqqan pul** (to‘langan),
- **Kirgan faktura** (bizga yozilgan) va **Chiqqan faktura** (biz yozgan),
- **Saldo** = chiqqan faktura + chiqqan pul − kirgan pul − kirgan faktura: musbat — **debitor** (bizga qarz), manfiy — **kreditor** (bizning qarzimiz).

Fakturaning yo‘nalishi korxona STIR’idan aniqlanadi; hisobga faqat “Подписан” fakturalar olinadi (“Ожидает” — ixtiyoriy, “Отменен”/“Отказ” — yo‘q). Soliqlar, bank komissiyalari, ichki o‘tkazmalar, valyuta konvertatsiyasi, ta’sischi ustav puli va ish haqi alohida “hisobga olinmagan” ro‘yxatda ko‘rsatiladi. STIR’i yo‘q (yoki “000000000”) bank qatorlari kontragentga nomi bo‘yicha bog‘lanadi. Har bir kontragent uchun solishtirish dalolatnomasi va umumiy Excel hisobot yuklab olinadi. Boshlang‘ich qoldiq (oldingi davr qarzlari) hozircha hisobga olinmaydi.

## Ombor bo‘limi

GTD hisobotini (“Отчет о таможенном оформлении товаров” Excel shabloni) va kirim/chiqim hisob-faktura reyestrlarini yuklang. Har bir tovar uchun **Kirim soni**, **Chiqim soni** va **Qoldiq** chiqadi; sana bo‘yicha filtr (davr boshiga qoldiq + davrdagi harakat) bor.

- **Excel shablon yuklab olish** tugmasi bo‘sh GTD shablonini (`GTD_shablon.xlsx`: kerakli ustunlar, rejim ro‘yxati, yo‘riqnoma varag‘i) beradi — GTD hisobotingiz bo‘lmasa, import tovarlarni shu shablonga yozib yuklang.
- Kirim: GTD (import rejimlari) va bizga yozilgan fakturalardagi tovar qatorlari; chiqim: biz yozgan fakturalar (eksport GTD — “ЭК” ham chiqim).
- Tovarlar nomi bo‘yicha bog‘lanadi: GTD tavsifining ruscha qismi olinadi (“кол.”, “Изг.:”, “вес:” izohlarisiz), 1–2 harflik xatolar bitta tovar hisoblanadi.
- GTD’da soni ko‘rsatilmagan qatorlar (faqat joylar soni) alohida ro‘yxatda — sonini qo‘lda kiritish, keyin o‘zgartirish yoki × bilan o‘chirish mumkin; harakatlarda “qo‘lda” deb belgilanadi.
- Xizmatlar (ijara, sertifikatlash va h.k.) va “Подписан”dan boshqa holatdagi fakturalar omborga kirmaydi.
- **Tovar nomi** filtri (Exceldagi avtofiltr kabi: qidiruv, “Hammasi”, belgilash) — jadval va Excel eksport tanlangan tovarlar bo‘yicha.
- Sotilgan, lekin kirimi (GTD yoki kirim fakturasi) topilmagan tovarlar “GTD kerak” deb belgilanadi va GTD shablonini yuklash taklif qilinadi.

## Hujjatlardan provodka bo‘limi

Bank vipiskalari, kirim/chiqim hisob-faktura reyestrlari (Didox / my.soliq .xlsx yoki soliq.uz CSV) va GTD hisobotini bitta joyga tashlang — provodkalar jurnalga “avto” belgisi bilan tushadi, balans, 2-shakl va foyda solig‘i shulardan avtomatik to‘ladi.

- Bank: tushum Dt 5110 Kt 4010 (kontragent subschyoti), to‘lov Dt 6010 Kt 5110, komissiya 9690, bojxona bo‘naki 4410, soliqlar 6410/6520, ustav fondi 4610 (+ e’lon Dt 4610 Kt 8330), ichki o‘tkazmalar 5710/5720 orqali. Har bir operatsiya turi va bank hisobi uchun hisobvaraqni o‘zgartirish mumkin.
- Fakturalar: sotuv Dt 4010 Kt 9020/9030 + QQS 6410; tannarx Dt 9120 Kt 2910 (o‘rtacha tortilgan narx); xarid Dt 2910 / xizmat 9420 Kt 6010 + QQS 4410. Bir faktura ikki reyestrda bo‘lsa — bir marta (tarkibli nusxa ustun). Tarkibsiz (CSV) fakturada QQS va tovar/xizmat ulushi taxminiy — “Diqqat”da ko‘rsatiladi.
- GTD: tovar qiymati (гр.42 × kurs) Dt 2910 Kt 6010 (xorijiy yetkazib beruvchilar), boj va yig‘im tannarxga, import QQS 4410 ga.
- Valyuta: Markaziy bank kursi (cbu.uz’dan avtomatik, faqat valyuta kodi va sana yuboriladi; qo‘lda kiritish mumkin), oy oxirida qayta baholash 9540/9620; har oy QQS zachyoti.
- Qo‘lda tuzatilgan avto-provodka keyingi yuklashda o‘zgarmaydi, o‘chirilgani qaytmaydi; “Avto-provodkalarni tiklash” hammasini qayta yozadi.
- Ish haqi hisoblash fayllardan chiqmaydi — ogohlantirish beriladi, qo‘lda kiritiladi.

### Yangi bank formatini qo‘shish

1. `src/bank/parsers/` ga yangi fayl: `isFormatX(rows)` (sarlavha matnidan tanish) va `parseFormatX(rows, file): ParsedStatement`.
2. `src/bank/parsers/detect.ts` dagi `parseStatements` ga ulang.
3. `src/bank/parsers/parsers.test.ts` ga sun’iy namuna bilan test yozing.

Hozir qo‘llab-quvvatlanadi: **Format A** — “Сведения о работе счета” (bank-klient eksporti). **Format B** — 1C “Выписка лицевых счетов” parseri spec bo‘yicha yozilgan, lekin **haqiqiy namuna kerak**: namuna bo‘lmagani uchun u hali sinovdan o‘tmagan.

Haqiqiy vipiskalar va ular bo‘yicha qabul testlari `samples/` papkasida saqlanadi va git’ga qo‘shilmaydi (`.gitignore`).

## Ishga tushirish

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # hisob mantiqi testlari
npm run build    # dist/ — statik sayt
```

## Hammaga chiqarish (bepul hosting)

`dist/` papkasi oddiy statik sayt, istalgan statik hostingga qo‘yiladi:

- **GitHub Pages:** repozitoriyani GitHub’ga yuklang, *Settings → Pages → Source: GitHub Actions* ni tanlang. `.github/workflows/deploy.yml` har bir `main` push’da saytni yangilaydi.
- **Netlify / Cloudflare Pages:** build buyrug‘i `npm run build`, chiqish papkasi `dist`.

## Muhim cheklovlar

- Ilova hisob-kitobni avtomatlashtiradi, lekin buxgalter tekshiruvining o‘rnini bosmaydi.
- Foyda solig‘i: asosiy shakl (010–150) to‘liq; 1-ilova va 2-ilovaning I bo‘limi provodkalardan to‘ldiriladi. 2-ilova II bo‘limi (0101–0137) va 3–11-ilovalar hozircha qo‘lda to‘ldiriladi. “shakl bilan solishtiring” belgili satrlarni amaldagi rasmiy shakl bilan tekshiring.
- Excel fayllari rasmiy shakllar tuzilishida yaratiladi (satr kodlari bilan), lekin davlat shablonining aynan nusxasi emas.

## Tuzilishi

- `src/engine` — hisob mantiqi (sof TypeScript, testlar bilan): hisobvaraqlar rejasi, bosh daftar, balans, 2-shakl, foyda solig‘i, tekshiruvlar, yil yopish
- `src/excel` — Excel import/eksport (ExcelJS, kerak bo‘lganda yuklanadi)
- `src/store` — holat, undo/redo, avtosaqlash, fayl
- `src/ui` — sahifalar va komponentlar
