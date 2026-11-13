# Bank vipiskasi bo'limi — reja

**Maqsad:** Ochiq Hisob ichida "Bank vipiska" bo'limi: bank vipiskalarini (Excel) brauzerda o'qish, operatsiyalarni guruh/tur bo'yicha tasniflash, qoldiqlarni tekshirish, svod/hisob/tur/korrespondent/oy/valyuta/diqqat ekranlari va formulali Excel hisobot.

**Manba:** foydalanuvchi bergan spec (haqiqiy namuna ma'lumotlari bilan, shuning uchun git'dan tashqarida `samples/SPEC.md`).

## Qarorlar (spec'dan farqlar)
- Mavjud ilova ichida bo'lim: Tailwind/recharts/tanstack o'rniga ilovaning o'z CSS'i, oddiy SVG grafiklar va oddiy jadval (saralash, filtr, sahifalash).
- xlsx o'qish ham ExcelJS bilan (ilovada allaqachon bor; SheetJS'ning npm versiyasi eskirgan).
- Deploy: GitHub Pages (foydalanuvchi tanlovi), Vercel emas.
- Saqlash: IndexedDB (idb-keyval) — vipiskalar, qoidalar, qo'lda o'zgartirishlar, ko'rib chiqilgan flaglar, sozlamalar.
- Haqiqiy vipiskalar va ular bo'yicha qabul testlari `samples/` da (gitignore) — public repoga tushmaydi; public testlar sun'iy ma'lumotda.

## Bosqichlar
1. Model + Format A parser + testlar.
2. Qoidalar (JSON) + klassifikatsiya + testlar; namuna bo'yicha 203 operatsiya mos kelishi (maxfiy qabul testi).
3. Birlashtirish, saralash, qoldiq, ichki o'tkazmalar, flaglar, tekshiruvlar, agregatlar (turlar, korrespondentlar, oylar, valyuta).
4. UI: yuklash, svod, hisob, turlar, korrespondentlar, oylar, valyuta, diqqat, qoidalar.
5. Formulali Excel eksport + qayta o'qib tekshirish testi.
6. Format B parser (namuna yo'q — test skip), README.
