/* ===================== تعهّد استلام مواد (الذمّة) =====================
   النموذج الورقي المعتمد لدى الشركة («تعهد موظفين» — ملف Word) منقولاً
   كما هو: ورقة الشركة الرسمية بشعارها وعلامتها المائية وتذييلها خلفيّةً،
   وفوقها نص النموذج بخطّه ومقاساته ومواضعه في الأصل.

   والمقاسات بالنقطة الطباعية (pt) لا بالبكسل: هي وحدة ملف Word نفسه،
   فتُنقل الأرقام من الأصل كما هي بلا تحويل ولا تقريب ينحرف به سطر.

   وما يعرفه النظام يُملأ: الاسم والوظيفة وتاريخ الاستلام وجدول المواد
   واسم المستلم أسفل الورقة. وما لا يعرفه — القسم، والتواقيع، واسم
   الموظف المسؤول — يبقى نقاطاً يُكتب عليها باليد، كما في الأصل.

   ولا نصّ برمجي في الصفحة: تطبيق الهاتف يطبعها بمتصفّح لا يشغّل
   البرامج، فكل ما فيها HTML وأنماط فقط.

   وللتعهّد نصّان: العربي كما في الأصل حرفاً بحرف، والكردي (السوراني)
   لمن يطبع بالكردية — بالتخطيط نفسه والورقة نفسها. ونصّه هنا لا في
   قاموس الشاشات: هو وثيقة تُقرأ جملةً جملة، والغامق فيها جزءٌ منها.
   ==================================================================== */

import { num } from './ui.js';

/** أسطر الجدول في الأصل ستّة، وتُترك فارغةً ما لم تُملأ. */
const MIN_ROWS = 6;

/* وتتّسع الورقة لسطر واحد فوقها قبل أن يبلغ التوقيعُ تذييلَها. فما زاد
   يُنقل إلى ورقة ثانية كاملة بتعهّدها وتوقيعها: لكل ورقة حجّتها إن
   فُرّقت، ولا يُوقَّع على ورقة لا يُرى فيها ما وُقّع عليه. */
const PER_PAGE = 7;

/** سطر نقاط أطول من أي خانة، يُقصّ على عرضها. */
const DOTS = '.'.repeat(120);

const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * خانة منقّطة بعرض الأصل. إن عُرفت قيمتها كُتبت في أوّلها وأكملت النقاط
 * ما بقي، كمن كتب اسمه على السطر. وإلا بقيت نقاطاً تُملأ باليد.
 */
function blank(width, value = '') {
  const text = String(value ?? '').trim();
  return `<span class="blank" style="width:${width}pt">` +
    (text ? `<b>${esc(text)}</b> ` : '') + `${DOTS}</span>`;
}

/** «2026-09-26» ← «26 / 9 / 2026»: اليوم أوّلاً، كترتيب خانات الأصل. */
function dateOf(iso) {
  const [y, m, d] = String(iso ?? '').split('-').map(Number);
  return y && m && d ? `${d} / ${m} / ${y}` : '..... / ..... / .....';
}

/** نصوص التعهّد بلغتيه. العربي بنصّه في الأصل حرفاً بحرف، والغامق غامق. */
const TEXT = {
  ar: {
    doc: 'تعهد استلام مواد',
    title: 'تعهد استلام مواد (الذمة)',
    undersigned: 'أنا الموقع أدناه:',
    name: 'الاسم الكامل',
    department: 'القسم / المشروع',
    job: 'الوظيفة',
    date: 'تاريخ الاستلام:',
    intro: 'أتعهد بموجب هذا بأنني قد استلمت من قسم المخزن / المشتريات  المواد والمعدات '
      + 'الموضحة أدناه، وذلك وفقاً لتعليمات الشركة الخاصة باستلام المواد، وأتحمل كامل المسؤولية '
      + 'عن عهدتي اعتباراً من تاريخ الاستلام.',
    details: 'تفاصيل المواد / المعدات المستلمة:',
    head: ['رقم', 'إسم المادة', 'العدد', 'القياس', 'الملاحظات'],
    termsTitle: 'شروط وتعهدات',
    receiver: 'اسم المستلم',
    signature: 'التوقيع',
    officer: 'اسم الموظف المسؤول / لجنة الاستلام',
    officerBlank: 159,
    perPage: PER_PAGE,
    terms: null,   // أدناه، بنصّها في الأصل
  },
  ckb: {
    doc: 'بەڵێننامەی وەرگرتنی کەرەستە',
    title: 'بەڵێننامەی وەرگرتنی کەرەستە (ئەمانەت)',
    undersigned: 'من کە لە خوارەوە واژووم کردووە:',
    name: 'ناوی تەواو',
    department: 'بەش / پرۆژە',
    job: 'ناونیشانی کار',
    date: 'بەرواری وەرگرتن:',
    intro: 'بەم بەڵێننامەیە دەیسەلمێنم کە لە بەشی کۆگا / کڕین ئەو کەرەستە و ئامێرانەی لە خوارەوە '
      + 'ڕوونکراونەتەوە وەرمگرتووە، بەپێی ڕێنماییەکانی کۆمپانیا تایبەت بە وەرگرتنی کەرەستە، و لە بەرواری '
      + 'وەرگرتنەوە بەرپرسیارێتی تەواوی ئەمانەتەکەم لە ئەستۆ دەگرم.',
    details: 'وردەکاری کەرەستە / ئامێرە وەرگیراوەکان:',
    head: ['ژمارە', 'ناوی کەرەستە', 'بڕ', 'یەکە', 'تێبینی'],
    termsTitle: 'مەرج و بەڵێنەکان',
    receiver: 'ناوی وەرگر',
    signature: 'واژوو',
    officer: 'ناوی فەرمانبەری بەرپرس / لیژنەی وەرگرتن',
    /* ناونیشانەکە لە عەرەبییەکە درێژترە، بۆیە خاڵەکانی دوای کورتترن تا دێڕەکە لە پەڕەکە دەرنەچێت. */
    officerBlank: 118,
    /* ڕستە کوردییەکان درێژترن و دێڕی زیاتر دەگرن: شەش دێڕی خشتە لە هەر پەڕەیەکدا، نەک حەوت،
       بۆ ئەوەی واژووەکان نەگەنە سەر پێپەڕەی کاغەزەکە. */
    perPage: 6,
    terms: [
      'دان بەوەدا دەنێم کە هەموو ئەو کەرەستانەی سەرەوە بە دۆخێکی باش و گونجاو لەگەڵ تایبەتمەندییەکان وەرمگرتوون.',
      'بەڵێن دەدەم کەرەستەکان بپارێزم و تەنها بۆ ئەو مەبەستانە بەکاریان بهێنم کە بۆیان دیاریکراون.',
      'بەڵێن دەدەم هیچ یەکێک لەم کەرەستانە نەفرۆشم، نەگوازمەوە و ڕادەستی هیچ لایەنێکی تر نەکەم، '
        + 'مەگەر بە ڕەزامەندی نووسراوی بەڕێوەبەرایەتی.',
      'لە حاڵەتی تێکچوون یان ونبوونی هەر کەرەستەیەک بەهۆی کەمتەرخەمی یان خراپ بەکارهێنانەوە، '
        + '<b>تێچووی دارایی یان کارگێڕی و یاسایی تەواو</b> بەپێی سیستەمی کۆمپانیا لە ئەستۆ دەگرم.',
      'لە حاڵەتی <b>دەستلەکارکێشانەوە یان کۆتاییهاتنی خزمەت</b>، بەڵێن دەدەم هەموو ئەو کەرەستە و '
        + 'ئامێرانەی پێم دراون بگەڕێنمەوە، یان نرخی تەواویان بدەم ئەگەر نەگەڕێندرانەوە یان تێکچوون.',
      'ئەم کەرەستانە بە <b>ئەمانەتی کەسی (ئەستۆ)</b> دادەنرێن، و بەرپرسیارێتی یاسایی و کارگێڕی و دارایی تەواویان لە ئەستۆ دەگرم.',
      'لە حاڵەتی کەرەستەکانی سەلامەتیدا (کڵاو – جلی کار – پێڵاو – دەستکێش – چاویلکەی پارێزەر)، '
        + 'بەڵێن دەدەم ڕۆژانە لە کاتی کاردا بیانپۆشم بۆ پاراستنی سەلامەتی خۆم.',
      'بەڵێن دەدەم کە مەرجەکانی سەرەوەم خوێندۆتەوە و ڕازیم پێیان.',
    ],
  },
};

TEXT.ar.terms = [
  'أقرّ بأن جميع المواد المذكورة أعلاه قد تم استلامها بحالة جيدة ومطابقة للمواصفات.',
  'أتعهد بالمحافظة على المواد واستخدامها فقط للأغراض المخصصة لها.',
  'أتعهد بعدم التصرف أو نقل أو تسليم أي من هذه المواد لأي جهة أخرى إلا بموافقة خطية من الإدارة.',
  'في حال تلف أو فقدان أي مادة بسبب الإهمال أو سوء الاستخدام، أتحمل ' +
    '<b>الكلفة المالية أو الإدارية والقانونية الكاملة</b> حسب نظام الشركة.',
  'في حال <b>الاستقالة أو إنهاء الخدمة</b>، أتعهد بإعادة جميع المواد والمعدات المسلمة ' +
    'إليّ أو دفع قيمتها الكاملة في حال عدم إعادتها أو تلفها.',
  'تعتبر هذه المواد <b>عهدة شخصية (ذمة)</b>، وأتحمل كامل المسؤولية القانونية والإدارية والمالية عنها.',
  'في حالة المواد الخاصة بالسلامة (الخوذة – البدلة – الحذاء – القفازات – النظارات الواقية)، ' +
    'أتعهد بارتدائها يوميًا أثناء العمل للمحافظة على سلامتي.',
  'اتعهد بأني قرئت الشروط أعلاه وموافق عليها',
];

function row(item, n) {
  if (!item) return '<tr><td></td><td></td><td></td><td></td><td></td></tr>';
  return `<tr>
      <td>${n}</td>
      <td>${esc(item.name)}</td>
      <td>${num(item.qty)}</td>
      <td>${esc(item.unit ?? '')}</td>
      <td class="note">${esc(item.note ?? '')}</td>
    </tr>`;
}

function sheet(data, items, start, origin, T) {
  const rows = [...items];
  while (rows.length < MIN_ROWS) rows.push(null);

  return `
  <section class="sheet">
    <img class="paper" src="${origin}/img/pledge-letterhead.png" alt="">
    <div class="text">
      <h1>${T.title}</h1>
      <p>${T.undersigned}</p>
      <p>${T.name}${blank(183, data.holder)} :</p>
      <p>${T.department}${blank(183, data.department)} :</p>
      <p>${T.job}${blank(183, data.job)} :</p>
      <p>${T.date} <b>${dateOf(data.date)}</b></p>

      <p class="gap">${T.intro}</p>

      <p class="gap"><b>${T.details}</b></p>

      <table>
        <colgroup>
          <col style="width:33.6pt"><col style="width:151.5pt"><col style="width:56.9pt">
          <col style="width:47.5pt"><col style="width:173pt">
        </colgroup>
        <thead><tr>${T.head.map((x) => `<th>${x}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((item, i) => row(item, start + i + 1)).join('')}</tbody>
      </table>

      <p class="terms-title"><b>${T.termsTitle}</b></p>
      <ol>${T.terms.map((t, i) => `<li><span class="n">${i + 1}.</span>${t}</li>`).join('')}</ol>

      <p class="sign"><b>${T.receiver}</b>${blank(162, data.holder)} <b>:</b><span class="tab"></span><b>${T.signature}</b>${blank(159)} <b>:</b></p>
      <p class="sign next"><b>${T.officer}</b><b>:</b>${blank(T.officerBlank)}<b>${T.signature}</b><b>:</b>${blank(93)}</p>
    </div>
  </section>`;
}

/* المواضع من الأصل: الهامشان ٧٢ نقطة (بوصة)، وخطّ السطر ١٢ نقطة بتباعد
   ١٣٫٨، وأوّل سطر — العنوان — يقع خطّه على ١٣٦٫٣ من أعلى الورقة.
   والجدول أعرض من النص، يبرز يميناً ٢٠ نقطة كما يبرز في Word. */
const STYLES = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    color: #000;
    font-family: "Times New Roman", "Noto Naskh Arabic", serif;
    font-size: 12pt; line-height: 13.8pt;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }

  .sheet { position: relative; width: 210mm; height: 297mm; overflow: hidden;
           page-break-after: always; break-after: page; }
  .sheet:last-child { page-break-after: auto; break-after: auto; }
  .paper { position: absolute; top: 0; left: 0; width: 210mm; height: 297mm; }
  .text { position: absolute; top: 123.5pt; right: 72pt; left: 72pt; }

  h1 { margin: 0; font-size: 14pt; line-height: 16.1pt; font-weight: 400;
       color: #2F5496; text-align: center; }
  p { margin: 0; }
  .gap { margin-top: 13.8pt; }

  .blank { display: inline-block; vertical-align: top; height: 13.8pt;
           overflow: hidden; white-space: nowrap; }
  .blank b { padding-right: 4pt; }   /* لا يلتصق الاسم بعنوان خانته */
  .tab { display: inline-block; width: 33pt; }

  table { border-collapse: separate; border-spacing: 1.5pt 1.6pt; table-layout: fixed;
          width: 471.5pt; margin: 13.65pt -20.7pt 0 0; }
  th, td { border: 0.5pt solid #000; height: 18.5pt; padding: 0 1.5pt;
           text-align: right; vertical-align: middle; }
  th { font-family: Arial, sans-serif; font-weight: 700; font-size: 14pt; line-height: 15pt; }
  td { font-size: 12pt; line-height: 13pt; }
  td.note { font-size: 10pt; line-height: 11.5pt; }

  .terms-title { margin-top: 9.15pt; }
  ol { list-style: none; margin: 14.1pt 0 0; padding: 0; }
  li { position: relative; padding-right: 36.1pt; }
  li .n { position: absolute; right: 18.1pt; }

  .sign { margin-top: 14.1pt; white-space: nowrap; }
  .sign.next { margin-top: 13.9pt; }

  /* الكردية بخطّ يحمل حروفها كلّها (ێ ۆ ڵ ڕ ە): Times New Roman يفتقد
     بعضها فتُرسم الكلمة بخطّين. والمقاسات والمواضع هي هي. */
  html[lang="ckb"] body { font-family: "Segoe UI", Tahoma, "Noto Naskh Arabic", sans-serif;
                          font-size: 10.5pt; line-height: 13pt; }
  html[lang="ckb"] h1 { font-size: 13pt; line-height: 15.5pt; }
  html[lang="ckb"] .gap { margin-top: 11pt; }
  html[lang="ckb"] .blank { height: 13pt; }
  html[lang="ckb"] th { font-family: "Segoe UI", Tahoma, sans-serif; font-size: 11.5pt; }
  html[lang="ckb"] td { font-size: 10.5pt; }
  html[lang="ckb"] td.note { font-size: 9pt; line-height: 11pt; }
  html[lang="ckb"] ol { margin-top: 11pt; }
  html[lang="ckb"] .sign { margin-top: 12pt; }`;

/**
 * صفحة التعهّد كاملةً للطباعة.
 *
 * data: { holder, job, department, date, items: [{ name, qty, unit, note }] }
 * origin: أصل الخادم — تُحمَّل منه ورقة الشركة، وتطبعها نافذة لا عنوان لها.
 * language: 'ar' (الأصل) أو 'ckb'.
 */
export function pledgeHtml(data, origin, language = 'ar') {
  const T = TEXT[language] ?? TEXT.ar;
  const items = data.items ?? [];
  const pages = [];
  for (let i = 0; i < Math.max(items.length, 1); i += T.perPage) {
    pages.push(sheet(data, items.slice(i, i + T.perPage), i, origin, T));
  }

  return `<!DOCTYPE html>
<html lang="${language === 'ckb' ? 'ckb' : 'ar'}" dir="rtl"><head><meta charset="utf-8">
<title>${T.doc} — ${esc(data.holder)}</title>
<style>${STYLES}</style></head><body>
${pages.join('')}
<script>window.onload = () => { window.print(); }<\/script>
</body></html>`;
}
