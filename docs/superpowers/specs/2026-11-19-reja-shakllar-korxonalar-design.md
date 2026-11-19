# Yangi hisobvaraqlar rejasi, rasmiy shakllar ko‘rinishi va bir nechta korxona — dizayn

Sana: 2026-11-19. Holat: tasdiqlangan (2026-11-19).

## 1. Maqsad va nima uchun

Foydalanuvchi (buxgalter) ilovada:
1. 1C’dagi O‘zbekiston hisobvaraqlar rejasi bilan ishlashni xohlaydi (Excel: 758 hisobvaraq, rejadagi subschyotlar `4410.3`, `6420.1`, valyuta belgisi);
2. foyda solig‘i hisob-kitobini Excel shablondagidek to‘liq ko‘rishni (asosiy shakl + 1, 2, 2.1, 2.1(a), 2.1(b), 3–11-ilovalar);
3. balans va 2-shaklni soliq.uz shaklidagidek ko‘rishni — sarlavha bloki (maydonlar bo‘sh bo‘lishi mumkin) va ilovalar bilan: balansga “Balansdan tashqari hisobvaraqlarda hisobga olinadigan qimmatliklar” (790–920) va “Muddati o‘tgan debitorlik va kreditorlik qarzlari rasshifrovkasi”, 2-shaklga “Byudjetga to‘lovlar to‘g‘risida ma’lumot” (280–480);
4. bir nechta korxona qo‘shib, ular orasida almashishni;
5. faktura va vipiskalar yuklanganda hammasi (balans, 2-shakl, foyda solig‘i) avtomat to‘lishini — hozir ishlaydi, yangi reja va shakllar bilan ham ishlashi kerak.

Foydalanuvchi tanlovi: hisobvaraq nomlari **o‘zbekchaga tarjima**; shakllar **lotin yozuvida, kirill tugmasi bilan** (hozirgidek).

## 2. Maqsadlar, maqsad emas, yomon natija

**Maqsadlar**
- Reja = Excel ro‘yxati: barcha 758 kod, tuzilma (guruh, rejadagi subschyot), turi (aktiv/passiv/kontr-aktiv/tranzit/balansdan tashqari), valyuta belgisi; nomlar o‘zbek lotin (ruscha asl nom qidiruvda ham topiladi).
- Balans, 2-shakl, foyda solig‘i va ularning ilovalari shablondagi satrlar, kodlar, ustunlar va tartibda; avtomat hisoblanadigan kataklar provodkalardan, qolganlari qo‘lda kiritiladi va hujjatda saqlanadi.
- Excel eksport ham shu shakllar tuzilishida (har bir ilova alohida varaq).
- Korxonalar ro‘yxati: qo‘shish, nomini o‘zgartirish, o‘chirish, almashish; har korxonaning o‘z jurnali, sozlamalari va yuklangan fayllari.
- Mavjud ma’lumot yo‘qolmaydi: hozirgi hujjat va yuklangan fayllar birinchi korxonaga o‘tadi.

**Maqsad emas**
- Soliq.uz’ga yuborish (XML/imzo).
- Muddati o‘tgan qarzlarni avtomat aniqlash (shartnoma muddatlari fayllarda yo‘q) — qo‘lda.
- 3–11-ilovalarni provodkalardan to‘ldirish (investitsiya chegirmasi, amortizatsiya guruhlari, imtiyozlar, zararlarni o‘tkazish va h.k.) — shakl va formulalari bor, qiymatlar qo‘lda.
- Server/akkaunt: korxonalar faqat shu brauzerda.

**Yomon natija**
- Eski hujjatdagi provodkalar “hisobvaraq topilmadi” bo‘lib qolishi yoki hisobotdan tushib qolishi.
- Bir korxonaning fayllari/provodkalari boshqasiga aralashishi.
- Shakl kataklarida noto‘g‘ri yig‘indi (formula shablondan farq qilishi).

## 3. Cheklovlar

- Statik sayt, ma’lumot brauzerda (localStorage + IndexedDB) va `.ohisob` faylda.
- Shablonlardagi mijoz ma’lumotlari (korxona nomi, STIR, rahbar) git’ga tushmaydi: shablondan faqat satr nomlari, kodlari va ustun sarlavhalari olinadi; shablon fayllar `samples/ref/` da (git’dan tashqari).
- Lotin yozuvi asosiy: shablondagi kirill matnlar lotinga o‘giriladi (kirill→lotin transliteratsiya + qo‘lda tekshiruv); kirill tugmasi mavjud `toCyrillic` bilan ishlaydi.

## 4. Yondashuvlar

1. **Shakllar ma’lumot sifatida (tanlandi).** Har bir shakl/ilova — ta’rif: satrlar (kod, nom, turi: sarlavha/satr/jami), ustunlar, formulalar, avtomat manba (hisobvaraqlar yoki hisob funksiyasi). Bitta umumiy `FormView` ularni soliq.uz ko‘rinishida chizadi, qo‘lda kiritiladigan kataklarni tahrirlaydi, Excel’ga chiqaradi. Ta’riflar shablondan skript bilan olinadi, keyin tekshiriladi. 17 ta shakl uchun bitta chizuvchi — kam kod, bir xil ko‘rinish.
2. Har bir shakl uchun alohida React sahifa — ko‘p takroriy kod, 17 shaklda xato ehtimoli katta; rad etildi.
3. Shablon `.xltx` ni brauzerda ochib, Excel’ga o‘xshatib ko‘rsatish — ko‘rinish aniq, lekin hisob-kitob va tahrirni ulash qiyin, kirill/lotin tugmasi ishlamaydi; rad etildi.

Reja uchun: Excel’dan bir martalik skript bilan `CHART_SOURCE` yaratiladi (kod | o‘zbekcha nom | tur | valyuta | ruscha nom); tarjima qo‘lda tekshiriladi. Korxonalar uchun: har korxona — alohida hujjat kaliti va alohida IndexedDB bazasi.

## 5. Dizayn

### 5.1 Hisobvaraqlar rejasi
- `src/engine/chart.ts` yangi manba bilan almashadi. `Account` ga `kind: 'A'|'P'|'T'|'KA'|'Z'`, `currency?: true`, `nameRu`. Guruh = XX00 kodlari (provodkaga ishlatilmaydi). Raqamsiz 1C xizmat hisobvaraqlari (ГТД, НЕ, УСН, РВ, …) — balansdan tashqari (Z).
- Rejadagi nuqtali kodlar (`4410.3`) — rejaning o‘zi; foydalanuvchi/kontragent subschyotlari (`6010.05`) avvalgidek, faqat rejadagi kod bilan to‘qnashmaydigan raqam olinadi.
- `findAccount`/`isKnownAccount`: avval reja, keyin subschyotlar. Eski hujjatdagi rejada yo‘q kod — provodka saqlanadi, “rejada yo‘q” belgisi, hisobotda 4 xonali asos bo‘yicha joylashadi.
- Balans qoidalari 4 xonali diapazonlar bo‘yicha qoladi (yangi kodlar ham shu diapazonlarga tushadi). 2-shakl bog‘lanishi rejaga moslab tuzatiladi: 120←9520, 130←9530, 140←9550, 150←9540–9541, 160←9500–9599 qolgani; 180←9610, 190←9650, 200←9620–9621, 210←9600–9699 qolgani; 9440–9499→080, 9001/9002 va 9040/9050 tushumni kamaytiradi. Foyda solig‘i satrlari tavsiyasi ham shunga moslanadi.
- Avto-provodka standartlari yangi rejaga: QQS kirim 4410.3 (tovar), 4410.4 (xizmat), 4410.5 (import); chiqim 6410.1; JShDS 6420.1; INPS 6530.1; ijtimoiy to‘lov 6510.1; foyda solig‘i 6430; mol-mulk 6450; yer 6460; boshqa soliq 6490; bojxona bo‘naki 4490; chakana savdo 4090; valyuta xaridi 5730, sotuvi 5740; valyuta o‘tkazmalari 5715; xorijiy yetkazib beruvchilar 6015 (valyuta bo‘yicha); tushum 9020.1/9030.1; tannarx 9120.1. QQS zachyoti bir nechta kirim QQS hisobvarag‘idan.
- Hisobvaraqlar sahifasi (yangi): qidiruv (kod, o‘zbekcha va ruscha nom), guruhlar, tur va valyuta belgisi.

### 5.2 Shakllar (umumiy)
- `src/forms/`: `FormDef = { id, title, subtitle?, columns: ColumnDef[], lines: LineDef[], header: 'company'|'short'|'none' }`; `LineDef = { code?, label, kind: 'section'|'header'|'line'|'total'|'note', formula?, source?, manual?: boolean, cells?: Record<col, 'x'|'auto'|'input'> }`.
- Qiymatlar: avtomat — hisob funksiyalaridan (balans, 2-shakl, foyda solig‘i, byudjet to‘lovlari, balansdan tashqari); qo‘lda — `doc.forms[formId][line][col]` (tiyin), avtomat katakni qo‘lda o‘zgartirish mumkin (belgi bilan, “avtomatga qaytarish”).
- `FormView`: soliq.uz uslubi — korxona sarlavha bloki (Korxona, Tarmoq, Tashkiliy-huquqiy shakli, Mulkchilik shakli, Vazirlik, STIR, Hudud, Manzil, KTUT, IFUT, TxShT, MShT, DBIBT, MxOBT, sanalar — korxona kartochkasidan, bo‘sh bo‘lishi mumkin), sarlavha, “O‘lchov birligi, ming so‘m”, ustun raqamlari qatori, satrlar; ilovalar shakl ichida tanlov ro‘yxati (soliq.uz’dagidek).
- Excel eksport: har shakl/ilova alohida varaq, shu tuzilishda.
- Sozlamalar: korxona kartochkasiga yangi maydonlar (tarmoq, kodlar, hudud, manzil, rahbar, bosh hisobchi).

### 5.3 Balans va ilovalari
- Asosiy balans — mavjud hisob (`buildBalance`).
- Balansdan tashqari (790–920): 001–014 hisobvaraqlar qoldig‘i davr boshi/oxiriga (avtomat), qo‘lda o‘zgartirish mumkin.
- Muddati o‘tgan qarzlar: shablondagi bo‘limlar (1–6, ichki, respublika tashqarisi), har bo‘limda nom kiritiladigan qatorlar (+ qator qo‘shish), ustunlar 3–8; jami satrlar formulali. Qo‘lda. Kontragentlar ro‘yxatidan tanlash yordami.

### 5.4 2-shakl va ilovasi
- Asosiy 2-shakl — mavjud hisob (tuzatilgan bog‘lanish bilan), o‘tgan yil ustunlari mavjud `prevYear` dan.
- Byudjetga to‘lovlar (280–480): “hisob-kitob bo‘yicha to‘lanadi” = soliq hisobvarag‘ining davrdagi krediti, “haqiqatda to‘langan” = debeti (bankdan); satr ↔ hisobvaraq: 280←6430, 290←6420 (291←6530.1), 310←6410, 320←6440, 350←6450, 360←6460, 400←6490, 440←6510+6520, 450←4490 bo‘yicha boj (GTD), 470←penya/jarima; 480 = jami (291 dan tashqari). Qo‘lda o‘zgartirish mumkin.

### 5.5 Foyda solig‘i
- Asosiy shakl (010–150, 061–063, 071–072, 090–140) — mavjud hisob + yangi satrlar (qo‘lda: 063, 071, 072, 090, 100–140).
- 1-ilova (010–288): avtomat — 020/021–026 sotuv turlari, 130 kurs farqi, 280 boshqa; qolganlari qo‘lda.
- 2-ilova (010, 020, 030 + 0101–0137): avtomat — 020 tannarx, 030 boshqa, 0105 mehnat (6710/6510 bo‘yicha xarajat), 0106 amortizatsiya (02xx/05xx krediti), 0107 qayta sotish tovarlari, 0111 ijara, 0113 foizlar, 0114 kurs farqi zarari, 0129 penya/jarima (chegirilmaydi), 0137 qolgani; ustun 4 (chegirilmaydigan) belgilangan provodkalardan.
- 2.1, 2.1(a), 2.1(b), 3, 4, 5, 6, 7, 8, 9, 10, 11-ilovalar — shablon tuzilishida, qiymatlar qo‘lda, ichki jami formulalar ishlaydi; 6, 7, 8, 4-ilovalar natijasi asosiy shaklga (040, 050, 061, zarar) ulanadi.

### 5.6 Korxonalar
- Ro‘yxat `localStorage['ochiq-hisob:companies']` (`{id, name, stir}`), joriy — `['ochiq-hisob:current']`; hujjat — `ochiq-hisob:doc:<id>`; yuklangan fayllar — IndexedDB baza `ochiq-hisob-bank-<id>`.
- Birinchi ochilishda mavjud hujjat va `ochiq-hisob-bank` bazasi birinchi korxonaga ko‘chiriladi (nusxa, keyin eski kalitlar o‘chiriladi).
- Yon panel tepasida korxona tanlagich: joriy nom ▾ → ro‘yxat, “+ Korxona qo‘shish” (nom, STIR), nomini o‘zgartirish, o‘chirish (tasdiq bilan). Almashishda joriy hujjat saqlanadi, boshqasi yuklanadi, bank xotirasi qayta ochiladi.
- `.ohisob` faylni ochish: STIR mos korxona bo‘lsa — o‘shanga, bo‘lmasa yangi korxona sifatida.

## 6. Quruvchiga qoldirilgan (o‘zim hal qildim)
- Qo‘lda kiritilgan shakl qiymatlari hisobot davri bo‘yicha saqlanadi: `doc.forms["<formId>:<chorak>"]` (foyda solig‘i ham, ilovalar ham o‘sib boruvchi davr bo‘yicha).
- Ichida rejadagi subschyoti bor hisobvaraq (masalan 4410) ham provodkada ishlatilishi mumkin (eski hujjatlar buzilmasin); avto-provodkalar esa eng quyi kodga yoziladi.
- Tarjima: mavjud o‘zbekcha nomlar (BHMS 21) mos kodlarda olinadi, qolganlari tarjima qilinadi; ruscha asl nom saqlanadi.
- Transliteratsiya kirill→lotin uchun alohida funksiya (testlar bilan), shablon matnlari bir marta o‘giriladi.
- Shakl ta’riflari skript bilan generatsiya qilinib, TS faylga yoziladi va qo‘lda tekshiriladi.
- Ish tartibi: reja → shakllar → korxonalar; har bosqich alohida commit va sinov.
- Saytga chiqarish (deploy) — oxirida foydalanuvchidan so‘raladi.
