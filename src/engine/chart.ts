/**
 * Chart of accounts (BHMS 21, "Schyotlar rejasi"), Uzbek Latin.
 * Written with plain apostrophes; normalised to oʻ/gʻ and ’ when loaded.
 */
export const CHART_SOURCE = `
001|Operativ ijaraga olingan asosiy vositalar
002|Mas'ul saqlashga qabul qilingan tovar-moddiy boyliklar
003|Qayta ishlashga qabul qilingan materiallar
004|Komissiyaga qabul qilingan tovarlar
005|O'rnatish uchun qabul qilingan asbob-uskunalar
006|Qat'iy hisobot blankalari
007|To'lovga qobiliyatsiz debitorlarning hisobdan chiqarilgan qarzi
008|Olingan majburiyatlar va to'lovlar ta'minoti
009|Berilgan majburiyatlar va to'lovlar ta'minoti
010|Uzoq muddatli ijara shartnomasi bo'yicha berilgan asosiy vositalar
011|Ssuda shartnomasi bo'yicha olingan mol-mulk
0100|Asosiy vositalar
0110|Yer
0111|Yerni obodonlashtirish
0112|Tabiiy resurslar
0120|Binolar, inshootlar va uzatuvchi moslamalar
0130|Mashina va asbob-uskunalar
0140|Mebel va ofis jihozlari
0150|Kompyuter jihozlari va hisoblash texnikasi
0160|Transport vositalari
0170|Ishchi va mahsuldor hayvonlar
0180|Ko'p yillik daraxtlar
0190|Boshqa asosiy vositalar
0200|Asosiy vositalarning eskirishi
0211|Yerni obodonlashtirishning eskirishi
0212|Tabiiy resurslarning eskirishi
0220|Binolar, inshootlar va uzatuvchi moslamalarning eskirishi
0230|Mashina va asbob-uskunalarning eskirishi
0240|Mebel va ofis jihozlarining eskirishi
0250|Kompyuter jihozlari va hisoblash texnikasining eskirishi
0260|Transport vositalarining eskirishi
0270|Ishchi va mahsuldor hayvonlarning eskirishi
0280|Ko'p yillik daraxtlarning eskirishi
0290|Boshqa asosiy vositalarning eskirishi
0300|Uzoq muddatli ijara shartnomasi bo'yicha olingan asosiy vositalar
0310|Uzoq muddatli ijara shartnomasi bo'yicha olingan asosiy vositalar
0400|Nomoddiy aktivlar
0410|Patentlar, litsenziyalar va nou-xau
0420|Tovar belgilari, tovar markalari va sanoat namunalari
0430|Dasturiy ta'minot
0440|Yer va tabiiy resurslardan foydalanish huquqi
0450|Tashkiliy xarajatlar
0460|Franchayzing
0470|Mualliflik huquqi
0480|Gudvill
0490|Boshqa nomoddiy aktivlar
0500|Nomoddiy aktivlarning amortizatsiyasi
0510|Patentlar, litsenziyalar va nou-xau amortizatsiyasi
0520|Tovar belgilari va sanoat namunalari amortizatsiyasi
0530|Dasturiy ta'minot amortizatsiyasi
0540|Yer va tabiiy resurslardan foydalanish huquqi amortizatsiyasi
0550|Tashkiliy xarajatlar amortizatsiyasi
0560|Franchayzing amortizatsiyasi
0570|Mualliflik huquqi amortizatsiyasi
0580|Gudvill amortizatsiyasi
0590|Boshqa nomoddiy aktivlar amortizatsiyasi
0600|Uzoq muddatli investitsiyalar
0610|Qimmatli qog'ozlar
0620|Sho'ba xo'jalik jamiyatlariga investitsiyalar
0630|Qaram xo'jalik jamiyatlariga investitsiyalar
0640|Chet el kapitali mavjud korxonalarga investitsiyalar
0690|Boshqa uzoq muddatli investitsiyalar
0700|O'rnatiladigan asbob-uskunalar
0710|Mahalliy o'rnatiladigan asbob-uskunalar
0720|Chet eldan keltirilgan o'rnatiladigan asbob-uskunalar
0800|Kapital qo'yilmalar
0810|Tugallanmagan qurilish
0820|Asosiy vositalarni xarid qilish
0830|Nomoddiy aktivlarni xarid qilish
0840|Asosiy podani shakllantirish
0850|Yerni obodonlashtirishga kapital qo'yilmalar
0890|Boshqa kapital qo'yilmalar
0900|Uzoq muddatli debitorlik qarzlari
0910|Xaridor va buyurtmachilarning uzoq muddatli qarzlari
0920|Ajratilgan bo'linmalarning uzoq muddatli qarzlari
0930|Sho'ba va qaram xo'jalik jamiyatlarining uzoq muddatli qarzlari
0940|Xodimlarning uzoq muddatli qarzlari
0950|Uzoq muddatli kechiktirilgan xarajatlar
0960|Uzoq muddatli kechiktirilgan soliq aktivlari
0990|Boshqa uzoq muddatli kechiktirilgan xarajatlar
1000|Materiallar
1010|Xom ashyo va materiallar
1020|Sotib olingan yarim tayyor mahsulotlar va butlovchi buyumlar
1030|Yoqilg'i
1040|Ehtiyot qismlar
1050|Qurilish materiallari
1060|Qayta ishlash uchun berilgan materiallar
1070|Idishlar va idishbop materiallar
1080|Inventar va xo'jalik jihozlari
1090|Boshqa materiallar
1100|O'stirishdagi va boqishdagi hayvonlar
1110|O'stirishdagi va boqishdagi hayvonlar
1500|Materiallarni tayyorlash va xarid qilish
1510|Materiallarni tayyorlash va xarid qilish
1600|Materiallar qiymatidagi farqlar
1610|Materiallar qiymatidagi farqlar
2000|Asosiy ishlab chiqarish
2010|Asosiy ishlab chiqarish
2100|O'zi ishlab chiqargan yarim tayyor mahsulotlar
2110|O'zi ishlab chiqargan yarim tayyor mahsulotlar
2300|Yordamchi ishlab chiqarish
2310|Yordamchi ishlab chiqarish
2500|Umumishlab chiqarish xarajatlari
2510|Umumishlab chiqarish xarajatlari
2600|Ishlab chiqarishdagi nuqsonlar
2610|Ishlab chiqarishdagi nuqsonlar
2700|Xizmat ko'rsatuvchi xo'jaliklar
2710|Xizmat ko'rsatuvchi xo'jaliklar
2800|Tayyor mahsulot
2810|Ombordagi tayyor mahsulot
2820|Omonatga berilgan tayyor mahsulot
2900|Tovarlar
2910|Ombordagi tovarlar
2920|Chakana savdodagi tovarlar
2930|Prokat buyumlari
2940|Omonatga berilgan tovarlar
2980|Savdo ustamasi
3100|Kelgusi davr xarajatlari
3110|Kelgusi davr xarajatlari
3200|Muddati kechiktirilgan xarajatlar
3210|Muddati kechiktirilgan xarajatlar
3290|Boshqa muddati kechiktirilgan xarajatlar
4000|Xaridor va buyurtmachilardan olinadigan hisobvaraqlar
4010|Xaridor va buyurtmachilardan olinadigan hisobvaraqlar
4020|Olingan veksellar
4100|Ajratilgan bo'linmalar, sho'ba va qaram jamiyatlarning qarzlari
4110|Ajratilgan bo'linmalarning qarzi
4120|Sho'ba va qaram xo'jalik jamiyatlarining qarzi
4200|Xodimlarga berilgan bo'naklar
4210|Mehnatga haq to'lash bo'yicha berilgan bo'naklar
4220|Xizmat safarlari uchun berilgan bo'naklar
4230|Umumxo'jalik xarajatlari uchun berilgan bo'naklar
4290|Xodimlarga berilgan boshqa bo'naklar
4300|Mol yetkazib beruvchilarga berilgan bo'naklar
4310|Mol yetkazib beruvchilar va pudratchilarga berilgan bo'naklar
4320|Kapital qurilish uchun berilgan bo'naklar
4330|Boshqa berilgan bo'naklar
4400|Byudjetga soliq va yig'imlar bo'yicha bo'nak to'lovlari
4410|Byudjetga soliq va yig'imlar bo'yicha bo'nak to'lovlari
4500|Sug'urta va maqsadli davlat jamg'armalariga bo'nak to'lovlari
4510|Sug'urtalar bo'yicha bo'nak to'lovlari
4520|Maqsadli davlat jamg'armalariga bo'nak to'lovlari
4600|Ta'sischilarning ustav kapitaliga ulushlar bo'yicha qarzi
4610|Ta'sischilarning ustav kapitaliga ulushlar bo'yicha qarzi
4700|Xodimlarning boshqa operatsiyalar bo'yicha qarzi
4710|Kreditga sotilgan tovarlar bo'yicha xodimlarning qarzi
4720|Berilgan qarzlar bo'yicha xodimlarning qarzi
4730|Moddiy zararni qoplash bo'yicha xodimlarning qarzi
4790|Xodimlarning boshqa operatsiyalar bo'yicha qarzi
4800|Turli debitorlarning qarzlari
4810|Ijara bo'yicha olinadigan hisobvaraqlar
4830|Foizlar bo'yicha olinadigan hisobvaraqlar
4840|Dividendlar bo'yicha olinadigan hisobvaraqlar
4850|Da'volar bo'yicha olinadigan hisobvaraqlar
4890|Boshqa debitorlarning qarzlari
4900|Shubhali qarzlar bo'yicha rezerv
4910|Shubhali qarzlar bo'yicha rezerv
5000|Kassadagi pul mablag'lari
5010|Milliy valyutadagi pul mablag'lari (kassa)
5020|Chet el valyutasidagi pul mablag'lari (kassa)
5100|Hisob-kitob hisobvarag'i
5110|Hisob-kitob hisobvarag'i
5200|Chet el valyutasidagi hisobvaraqlar
5210|Mamlakat ichidagi valyuta hisobvaraqlari
5220|Chet eldagi valyuta hisobvaraqlari
5500|Bankdagi maxsus hisobvaraqlar
5510|Akkreditivlar
5520|Chek daftarchalari
5530|Boshqa maxsus hisobvaraqlar
5600|Pul ekvivalentlari
5610|Pul ekvivalentlari
5700|Yo'ldagi pul o'tkazmalari
5710|Yo'ldagi pul o'tkazmalari (milliy valyutada)
5720|Yo'ldagi pul o'tkazmalari (chet el valyutasida)
5800|Qisqa muddatli investitsiyalar
5810|Qimmatli qog'ozlar
5830|Berilgan qisqa muddatli qarzlar
5890|Boshqa joriy investitsiyalar
5900|Boshqa joriy aktivlar
5910|Kamomadlar va qimmatliklarning buzilishidan yo'qotishlar
5920|Boshqa joriy aktivlar
6000|Mol yetkazib beruvchilar va pudratchilarga to'lanadigan hisobvaraqlar
6010|Mol yetkazib beruvchilar va pudratchilarga to'lovlar
6020|Berilgan veksellar
6100|Ajratilgan bo'linmalar, sho'ba va qaram jamiyatlarga to'lanadigan hisobvaraqlar
6110|Ajratilgan bo'linmalarga to'lanadigan hisobvaraqlar
6120|Sho'ba va qaram xo'jalik jamiyatlariga to'lanadigan hisobvaraqlar
6200|Muddati kechiktirilgan majburiyatlar
6210|Muddati kechiktirilgan daromadlar
6220|Muddati kechiktirilgan foiz daromadlari
6230|Boshqa muddati kechiktirilgan daromadlar
6240|Soliq va majburiy to'lovlar bo'yicha muddati kechiktirilgan majburiyatlar
6250|Muddati kechiktirilgan boshqa majburiyatlar
6290|Boshqa muddati kechiktirilgan majburiyatlar
6300|Olingan bo'naklar
6310|Xaridor va buyurtmachilardan olingan bo'naklar
6390|Boshqa olingan bo'naklar
6400|Byudjetga to'lovlar bo'yicha qarz
6410|Byudjetga to'lovlar bo'yicha qarz (turlari bo'yicha)
6500|Sug'urta va maqsadli davlat jamg'armalariga to'lovlar bo'yicha qarz
6510|Sug'urta bo'yicha to'lovlar
6520|Maqsadli davlat jamg'armalariga to'lovlar
6600|Ta'sischilarga bo'lgan qarzlar
6610|To'lanadigan dividendlar
6620|Ta'sischilarga ulushlarni qaytarish bo'yicha qarz
6700|Mehnatga haq to'lash bo'yicha xodimlar bilan hisoblashishlar
6710|Mehnatga haq to'lash bo'yicha xodimlar bilan hisoblashishlar
6720|Deponentlangan ish haqi
6800|Qisqa muddatli bank kreditlari va qarzlar
6810|Qisqa muddatli bank kreditlari
6820|Qisqa muddatli qarzlar
6840|Boshqa qisqa muddatli qarzlar
6900|Hisoblangan majburiyatlar
6910|To'lanadigan ijara
6920|Hisoblangan foizlar
6950|Uzoq muddatli majburiyatlarning joriy qismi
6970|Hisobdor shaxslarga qarz
6990|Boshqa majburiyatlar
7000|Mol yetkazib beruvchilar va pudratchilarga uzoq muddatli qarz
7010|Mol yetkazib beruvchilar va pudratchilarga uzoq muddatli qarz
7100|Ajratilgan bo'linmalar, sho'ba va qaram jamiyatlarga uzoq muddatli qarz
7110|Ajratilgan bo'linmalarga uzoq muddatli qarz
7120|Sho'ba va qaram xo'jalik jamiyatlariga uzoq muddatli qarz
7200|Uzoq muddatli kechiktirilgan majburiyatlar
7210|Uzoq muddatli kechiktirilgan daromadlar
7220|Uzoq muddatli kechiktirilgan foiz daromadlari
7230|Boshqa uzoq muddatli kechiktirilgan daromadlar
7240|Soliq va majburiy to'lovlar bo'yicha uzoq muddatli kechiktirilgan majburiyatlar
7250|Boshqa uzoq muddatli kechiktirilgan majburiyatlar
7300|Xaridor va buyurtmachilardan olingan uzoq muddatli bo'naklar
7310|Xaridor va buyurtmachilardan olingan uzoq muddatli bo'naklar
7800|Uzoq muddatli bank kreditlari va qarzlar
7810|Uzoq muddatli bank kreditlari
7820|Uzoq muddatli qarzlar
7900|Boshqa uzoq muddatli majburiyatlar
7910|Boshqa uzoq muddatli majburiyatlar
8300|Ustav kapitali
8310|Oddiy aksiyalar
8320|Imtiyozli aksiyalar
8330|Pay va ulushlar
8400|Qo'shilgan kapital
8410|Qo'shilgan kapital
8500|Rezerv kapitali
8510|Mol-mulkni qayta baholash bo'yicha tuzatishlar
8520|Rezerv kapitali
8530|Beg'araz olingan mol-mulk
8600|Sotib olingan xususiy aksiyalar
8610|Sotib olingan oddiy aksiyalar
8620|Sotib olingan imtiyozli aksiyalar
8700|Taqsimlanmagan foyda (qoplanmagan zarar)
8710|Hisobot davrining taqsimlanmagan foydasi (qoplanmagan zarari)
8720|Jamg'arilgan foyda (qoplanmagan zarar)
8800|Maqsadli tushumlar
8810|Grantlar
8820|Subsidiyalar
8830|A'zolik badallari
8890|Boshqa maqsadli tushumlar
8900|Kelgusi davr xarajatlari va to'lovlari uchun zaxiralar
8910|Kelgusi davr xarajatlari va to'lovlari uchun zaxiralar
9000|Asosiy faoliyatdan olingan daromadlar
9010|Tayyor mahsulotlarni sotishdan daromadlar
9020|Tovarlarni sotishdan daromadlar
9030|Ishlar bajarish va xizmatlar ko'rsatishdan daromadlar
9040|Sotilgan tovarlarning qaytarilishi
9050|Xaridor va buyurtmachilarga berilgan chegirmalar
9100|Sotilgan mahsulot tannarxi
9110|Sotilgan tayyor mahsulotning tannarxi
9120|Sotilgan tovarlarning tannarxi
9130|Bajarilgan ishlar va ko'rsatilgan xizmatlarning tannarxi
9200|Asosiy vositalar va boshqa aktivlarning chiqib ketishi
9210|Asosiy vositalarning chiqib ketishi
9220|Boshqa aktivlarning chiqib ketishi
9300|Asosiy faoliyatning boshqa daromadlari
9310|Asosiy vositalarning chiqib ketishidan foyda
9320|Boshqa aktivlarning chiqib ketishidan foyda
9330|Undirilgan jarima, penya va neustoykalar
9340|O'tgan yillar foydasi
9350|Operativ ijaradan daromadlar
9360|Kreditorlik qarzlarini hisobdan chiqarishdan daromadlar
9380|Beg'araz olingan aktivlardan daromadlar
9390|Boshqa operatsion daromadlar
9400|Davr xarajatlari
9410|Sotish xarajatlari
9420|Ma'muriy xarajatlar
9430|Boshqa operatsion xarajatlar
9440|Kelgusida soliq solinadigan foydadan chegiriladigan xarajatlar
9500|Moliyaviy faoliyatdan daromadlar
9510|Dividendlar ko'rinishidagi daromadlar
9520|Foizlar ko'rinishidagi daromadlar
9530|Uzoq muddatli ijaradan (lizingdan) daromadlar
9540|Valyuta kursi farqlaridan daromadlar
9550|Qimmatli qog'ozlarni qayta baholashdan daromadlar
9560|Moliyaviy faoliyatning boshqa daromadlari
9600|Moliyaviy faoliyat bo'yicha xarajatlar
9610|Foizlar ko'rinishidagi xarajatlar
9620|Valyuta kursi farqlaridan zararlar
9630|Qimmatli qog'ozlarni qayta baholashdan zararlar
9690|Moliyaviy faoliyat bo'yicha boshqa xarajatlar
9700|Favqulodda foyda va zararlar
9710|Favqulodda foyda
9720|Favqulodda zararlar
9800|Foydadan to'lanadigan soliqlar va yig'imlar
9810|Foyda solig'i bo'yicha xarajatlar
9820|Foydadan boshqa soliqlar va yig'imlar
9900|Yakuniy moliyaviy natija
9910|Yakuniy moliyaviy natija
`;
