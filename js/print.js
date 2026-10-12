/* ============================== الطباعة ==============================
   موضعٌ واحد لكل ما يُطبع، وسؤالٌ واحد: بأي لغة؟

   الشاشة العربية تطبع بالعربية. والشاشة الكردية تطبع بما اختاره صاحب
   الجهاز: بالكردية لمن سيوقّع وهو لا يقرأ العربية، أو بالعربية لغةِ
   الشركة الرسمية. يُسأل مرّة حين يتحوّل الجهاز إلى الكردية، ويُغيّره
   متى شاء من نافذة «الحساب».

   وثلاثة أنواع من الورق:
     — نموذج يبنيه البرنامج (السند، التعهّد، كشف الأمانات): يُبنى بلغة
       الطباعة من أوّله.
     — الشاشة المعروضة (الأرصدة، الحضور، كشف الحركة، الملخّص): تُطبع كما
       هي إن وافقت لغتُها لغةَ الطباعة، وإلا نُسخت بالعربية وطُبعت النسخة.
   ==================================================================== */

import { printHtml } from './save.js';
import { h, modal, toast } from './ui.js';
import {
  getLang, getPrintLang, printLangChosen, setPrintLang, screenInArabic, translateHtml,
} from './i18n.js';

const AUTO_PRINT = '<script>window.onload = () => { window.print(); }<\/script>';

/**
 * طباعة صفحة مستقلّة بإطار مخفي لا نافذة منبثقة: البرنامج يعمل في نافذة
 * تطبيق تحجب النوافذ المنبثقة. وداخل تطبيق الهاتف لا إطار يطبع نفسه —
 * فتذهب الصفحة إلى خدمة الطباعة في أندرويد.
 */
export function openPrint(html) {
  if (printHtml(html)) return;

  document.getElementById('print-frame')?.remove();
  const frame = h('iframe', { id: 'print-frame', class: 'print-frame', title: 'معاينة الطباعة' });
  document.body.append(frame);

  const doc = frame.contentDocument;
  if (!doc) {
    toast('تعذّر تجهيز الطباعة.', 'error');
    frame.remove();
    return;
  }

  // ينظّف نفسه بعد إغلاق حوار الطباعة، وبمهلة احتياطية إن لم يصل الحدث.
  frame.contentWindow.addEventListener('afterprint', () => setTimeout(() => frame.remove(), 300));
  setTimeout(() => document.getElementById('print-frame')?.remove(), 120000);

  doc.open();
  doc.write(html);
  doc.close();
}

/**
 * يسأل عن لغة الطباعة بالعربية والكردية معاً — فمن يُسأل قد لا يقرأ
 * لغة الشاشة التي هو عليها. يُرجع 'ar' أو 'ckb'، أو null إن أُغلق.
 */
export function askPrintLang() {
  return new Promise((resolve) => {
    let answered = false;
    const pick = (code, close) => {
      answered = true;
      close();
      resolve(code);
    };

    modal({
      title: 'لغة الطباعة — زمانی چاپکردن',
      body: (close) => h('div', { translate: 'no' },
        h('p', { style: 'margin:0 0 4px;font-size:14px;line-height:1.8' },
          'بأي لغة تُطبع السندات والتعهّدات والكشوف؟'),
        h('p', { lang: 'ckb', style: 'margin:0 0 16px;font-size:14px;line-height:1.8' },
          'پسوولە و بەڵێننامە و کەشفەکان بە چ زمانێک چاپ بکرێن؟'),
        h('button', {
          class: 'btn btn-primary btn-block', type: 'button', lang: 'ckb',
          style: 'margin-bottom:9px', onclick: () => pick('ckb', close),
        }, 'کوردی — چاپکردن بە کوردی'),
        h('button', {
          class: 'btn btn-block', type: 'button', onclick: () => pick('ar', close),
        }, 'العربية — الطباعة بالعربية'),
        h('p', { class: 'hint', style: 'margin:14px 0 0;line-height:1.9' },
          'تُغيَّر متى شئت من نافذة «الحساب».', h('br'),
          h('span', { lang: 'ckb' }, 'هەر کاتێک بتەوێت لە پەنجەرەی «هەژمار» دەگۆڕدرێت.'))),
      onClose: () => { if (!answered) resolve(null); },
    });
  });
}

/**
 * لغة الورق الذي يُطبع الآن. الشاشة الكردية التي لم يُختر لها بعدُ
 * (تحوّلت إلى الكردية من شاشة الإعداد أو من تطبيق الهاتف) تُسأل هنا عند
 * أول طباعة. يُرجع null إن أُغلق السؤال بلا اختيار.
 */
export async function printLanguage() {
  if (getLang() === 'ar' || printLangChosen()) return getPrintLang();
  const choice = await askPrintLang();
  if (choice) setPrintLang(choice);
  return choice;
}

/** صفحةٌ بناها البرنامج بالعربية تُطبع بلغتها: تُترجم إن كانت الطباعة كردية. */
export function inPrintLanguage(html, language) {
  return language === 'ckb' ? translateHtml(html) : html;
}

/** يطبع الشاشة المعروضة بلغة الطباعة. */
export async function printScreen() {
  const language = await printLanguage();
  if (!language) return;
  if (language === getLang()) {
    window.print();
    return;
  }
  /* الشاشة كردية والورق عربي: تُنسخ الشاشة بنصوصها العربية الأصلية. */
  openPrint(screenInArabic().replace('</body>', `${AUTO_PRINT}</body>`));
}
