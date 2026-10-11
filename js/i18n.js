/* ============================== اللغة ==============================
   البرنامج يُكتب بالعربية ويُعرض بالعربية أو بالكردية (السورانية).

   ولمَ لا تُلفّ كل عبارة في الشيفرة بدالّة ترجمة؟ لأنها ألفٌ وخمسمئة
   عبارة في عشرين شاشة، ونسيانُ واحدة يعني نصّاً عربياً في شاشة كردية
   لا ينتبه له أحد حتى يراه الموظف. فالترجمة تجري في موضع واحد: كل نصّ
   يدخل الصفحة — من h() أو textContent أو قالب HTML أو رسالة خطأ من
   الخادم — يمرّ على القاموس قبل أن يُرسم. والشاشات تبقى تكتب العربية
   كما كانت، ولا تعرف أن هناك لغة ثانية.

   والقاموس نوعان من المفاتيح:
     — عبارة تامّة: «حفظ» ← «پاشەکەوت».
     — قالب فيه متغيّرات: «حذف الأمانة {0}» يطابق «حذف الأمانة AMN-2026-0005»
       ويُخرج «سڕینەوەی ئەمانەتی AMN-2026-0005». ولا يلزم الشاشةَ أن تغيّر
       طريقة تركيبها للجملة.

   وما لا يمرّ بالصفحة — نافذة confirm، ورؤوس ملف التصدير، والمطبوعات —
   يُترجم صراحةً بـ tx() أو translateHtml().

   واللغة اختيار الجهاز لا الحساب: تُحفظ في المتصفّح، وتبقى بعد الخروج،
   فتظهر شاشة الدخول نفسها بلغة من يستعمل الجهاز.

   ولغة الطباعة اختيارٌ ثانٍ مستقلّ: الموظف الكردي قد يقرأ الشاشة بلغته
   ويسلّم الورق بلغة الشركة الرسمية، أو يطبعه بلغة من سيوقّع عليه.
   ==================================================================== */

const KEY = 'green-lang';
const PRINT_KEY = 'green-print-lang';

/* أسماء الأشهر هنا لا في أدوات التاريخ: الطباعة تحتاج أن تكتب التاريخ
   بلغتها هي، وأن تُعيد شهراً كردياً في الشاشة إلى اسمه العربي. */
export const MONTHS = {
  ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
  ckb: ['کانوونی دووەم', 'شوبات', 'ئازار', 'نیسان', 'ئایار', 'حوزەیران',
    'تەممووز', 'ئاب', 'ئەیلوول', 'تشرینی یەکەم', 'تشرینی دووەم', 'کانوونی یەکەم'],
};

export const LANGS = { ar: 'العربية', ckb: 'کوردی' };

let lang = readSaved();
const exact = new Map();
const patterns = [];
/* قوالب الأسطر: المفتاح الذي فيه «\n» يُحفظ ثانيةً بأسطره كما كُتب، ويُطابَق
   به النصّ ذو الأسطر كاملاً قبل أن يُترجم سطراً سطراً. */
const multiline = [];
const memo = new Map();

function readSaved() {
  /* داخل تطبيق الهاتف: لغة التطبيق أوّلاً. هو يرسم شاشاته الأصلية بها،
     ومن بدّلها هناك يجب أن يجدها هنا. */
  try {
    const native = window.GreenCityNative?.getLanguage?.();
    if (Object.hasOwn(LANGS, native)) return native;
  } catch { /* ليس داخل التطبيق */ }
  try {
    const saved = localStorage.getItem(KEY);
    return Object.hasOwn(LANGS, saved) ? saved : 'ar';
  } catch {
    /* تخزين المتصفّح محجوب: تبقى العربية، ولا يتعطّل شيء. */
    return 'ar';
  }
}

export const getLang = () => lang;
export const isArabic = () => lang === 'ar';

/**
 * يُبدّل اللغة ويُعيد رسم البرنامج كلّه.
 * إعادة التحميل أصدق من إعادة رسم الشاشة: ما رُسم قبل التبديل — القائمة
 * الجانبية وشاشة الدخول والنوافذ المفتوحة — يُرسم كلّه من جديد.
 */
export function setLang(code) {
  if (!Object.hasOwn(LANGS, code)) return;
  try { localStorage.setItem(KEY, code); } catch { /* يُطبَّق لهذه الجلسة وحدها */ }
  /* تطبيق الهاتف يرسم شاشاته الأصلية (الاتصال والدخول عبر الإنترنت)
     بنفسه، فيُخبَر باللغة ليوافقها. */
  try { window.GreenCityNative?.setLanguage?.(code); } catch { /* ليس داخل التطبيق */ }
  location.reload();
}

/* --------------------------- لغة الطباعة ---------------------------
   تُسأل حين يتحوّل الجهاز إلى الكردية، وتُغيَّر من نافذة «الحساب».
   والشاشة العربية تطبع بالعربية دائماً: لا قاموس محمّلاً فيها يُطبع به. */

/** لغة الورق المطبوع: 'ar' أو 'ckb'. */
export function getPrintLang() {
  if (lang === 'ar') return 'ar';
  try {
    const saved = localStorage.getItem(PRINT_KEY);
    return Object.hasOwn(LANGS, saved) ? saved : lang;
  } catch {
    return lang;
  }
}

/** هل اختار صاحب الجهاز لغة الطباعة، أم لم يُسأل بعد؟ */
export function printLangChosen() {
  try { return Object.hasOwn(LANGS, localStorage.getItem(PRINT_KEY)); } catch { return false; }
}

export function setPrintLang(code) {
  if (!Object.hasOwn(LANGS, code)) return;
  try { localStorage.setItem(PRINT_KEY, code); } catch { /* لهذه الجلسة وحدها */ }
}

/* ------------------------------ القاموس ------------------------------ */

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const HOLE = /\{(\w+)\}/g;

/* في المفتاح نوعان خاصّان من المتغيّرات:
     {_0}  — يُنقل كما هو ولا يُترجم: عبارة تأكيد يطابقها الخادم حرفياً،
             فلو تُرجمت داخل رسالة الخطأ لكتبها الموظف بالكردية فرُفضت.
     {0:w} — رمزٌ بلا فراغات (رقم أمانة، رمز صنف). يُرسي الجملة الطويلة:
             «بذمّة {1} ({2:w})» تعرف أين ينتهي الاسم وإن حمل الاسم قوساً.
     {0:n} — عدد. به يُفرَّق «{0:n} صنف» (عدّاد في الشاشة) عن صنفٍ اسمه
             «رولة خيط صنف»: القالب العامّ كان يترجم آخر اسمه. */
const KEY_HOLE = /\{(\w+)(:[wn])?\}/g;
const ANY = '([\\s\\S]+?)';
const CODE = '([A-Za-z0-9_\\-./:]+)';
const NUMBER = '(-?[0-9٠-٩][0-9٠-٩.,٫٬]*)';

/* الفراغات داخل العبارة لا تُحسب: جملة في قالب HTML تلتفّ على سطرين
   بمسافات البادئة («…طلبات الموظفين.\n             اختر هذا…»)، وهي في
   القاموس سطرٌ واحد. فالمفتاح يُحفظ بفراغاته مضمومة، والنصّ يُطابَق كما
   هو أوّلاً ثم مضموماً. */
export const squash = (s) => s.replace(/\s+/g, ' ');
const LOOSE = /\s\s|[^\S ]/;

function load(table) {
  for (const [source, target] of Object.entries(table)) {
    const key = squash(source.trim());
    exact.set(key, target);
    const pattern = compile(key, target);
    if (pattern) patterns.push(pattern);
    /* ومفتاح الأسطر قالباً بأسطره أيضاً: المضموم لا يطابق النصّ كما يظهر. */
    const raw = source.trim();
    if (pattern && raw.includes('\n')) multiline.push(compile(raw, target));
  }
  /* الأغنى نصّاً أوّلاً: «تعديل {0} — {1}» قبل «تعديل {0}»، وإلا التقط
     الثاني «سند إدخال — IN-7» كلّه متغيّراً واحداً لا يُترجم. */
  patterns.sort((a, b) => b.weight - a.weight);
  multiline.sort((a, b) => b.weight - a.weight);
}

/** القالب تعبيراً نمطياً — أو null إن لم يكن المفتاح قالباً تُرسيه عبارة عربية. */
function compile(key, target) {
  if (!KEY_HOLE.test(key)) return null;
  KEY_HOLE.lastIndex = 0;

  /* القالب يصير تعبيراً نمطياً مرسّخ الطرفين. والنصّ الثابت الأطول فيه
     «مرساة»: يُفحص بـ includes قبل التعبير، فلا يُجرَّب ثلاثمئة تعبير
     على كل خليّة في جدول من أربعمئة سطر. */
  const names = [];
  const kinds = [];
  const literals = key.split(KEY_HOLE).filter((_, i) => i % 3 === 0);
  const source_ = key.replace(KEY_HOLE, (_, name, code) => {
    names.push(name);
    kinds.push(code === ':w' ? CODE : code === ':n' ? NUMBER : ANY);
    return '\u0000';
  });
  const re = new RegExp('^' + source_.split('\u0000').map(escapeRe)
    .reduce((acc, lit, i) => acc + (i ? kinds[i - 1] : '') + lit, '') + '$');
  const anchor = literals.reduce((a, b) => (b.trim().length > a.length ? b.trim() : a), '');
  /* قالبٌ لا عربية في ثابته («{0} — {1}») يطابق كل شيء، فيُترجم
     أسماء الأصناف والناس. لا يُقبل قالب إلا بعبارة عربية تُرسيه. */
  /* والتشكيل لا يُحسب: «عُدّت» كلمةٌ وإن فصلت الحركاتُ بين حروفها. */
  if (!WORD.test(anchor.replace(/[ً-ْٰـ]/g, ''))) return null;
  const weight = literals.join('').trim().length;
  return { re, names, target, anchor, weight };
}

const AR = /[؀-ۿ]/;
/* مرساة القالب كلمةٌ لا علامة: «،» وحدها عربية الحرف، لكن قالباً
   ثابتُه فاصلة يطابق كل قائمة أسماء. */
const WORD = /[ء-يٱ-ۓ]{2}/;

function fill(template, values) {
  return template.replace(HOLE, (m, name) => (Object.hasOwn(values, name) ? values[name] : m));
}

/**
 * ترجمة سطر واحد مقصوص الأطراف، أو null إن لم يُعرف.
 *
 * ما التقطه القالب قد يكون هو نفسه جملة مركّبة: «{0} — {1} مُرحَّل» و{0}
 * «12 سند». فيُترجم الملتقط بالقاموس نفسه — عبارةً أو قالباً — إلى عمقين،
 * فتتركّب الترجمة كما تركّبت الجملة العربية في الشاشة.
 */
function translateCore(text, depth = 0, list = patterns) {
  const hit = exact.get(text);
  if (hit !== undefined) return hit;
  if (depth > 2 || !AR.test(text)) return null;

  for (const p of list) {
    if (!text.includes(p.anchor)) continue;
    const m = p.re.exec(text);
    if (!m) continue;
    const values = {};
    p.names.forEach((name, i) => {
      const raw = m[i + 1];
      if (name.startsWith('_')) { values[name] = raw; return; }
      const [, lead, core, tail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(raw);
      const inner = translateCore(core, depth + 1);
      values[name] = inner === null ? raw : lead + inner + tail;
    });
    return fill(p.target, values);
  }
  return null;
}

/**
 * يترجم نصّاً كما سيظهر. يحفظ الفراغات حوله، ويطابق الجملة الملتفّة على
 * سطرين بفراغاتها مضمومة، ويترجم الرسالة ذات الأسطر سطراً سطراً إن لم
 * تُعرف كاملة. وما لا يعرفه يُرجعه كما هو.
 */
export function tx(text) {
  if (lang === 'ar' || text === null || text === undefined) return text;
  const s = String(text);
  if (!AR.test(s)) return s;

  const cached = memo.get(s);
  if (cached !== undefined) return cached;

  const [, lead, core, tail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
  let out = exact.get(core) ?? (LOOSE.test(core) ? exact.get(squash(core)) : undefined) ?? null;
  /* رسالة الأسطر — خطأٌ لكل خطوة مزامنة مثلاً — تُترجم سطراً سطراً قبل
     القوالب: قالبٌ عامّ متغيّره يقبل الأسطر («{0} جديد») يبتلعها كلّها
     متغيّراً واحداً فتبقى عربية. وإن لم يُعرف سطرٌ منها وحده فهي جملةٌ
     التفّت على سطرين، فتُطابق مضمومةً بالقوالب.
     وقبل ذلك قوالب الأسطر نفسها («استُرجع {0} سجلّاً…\n{_1}\n\nستُغلق…»):
     لو تُرجمت سطراً سطراً لعُرف سطرها الأخير وحده وبقي أوّلها عربياً. */
  if (out === null && core.includes('\n') && multiline.length) out = translateCore(core, 0, multiline);
  if (out === null && core.includes('\n')) {
    let known = false;
    const lines = core.split('\n').map((line) => {
      const [, l, c, t] = /^(\s*)([\s\S]*?)(\s*)$/.exec(line);
      const hit = c ? translateCore(c) : null;
      if (hit !== null) known = true;
      return c ? l + (hit ?? c) + t : line;
    });
    if (known) out = lines.join('\n');
  }
  if (out === null) out = translateCore(core);
  if (out === null && LOOSE.test(core)) out = translateCore(squash(core));
  const result = out === null ? s : lead + out + tail;

  if (memo.size > 20000) memo.clear();
  memo.set(s, result);
  return result;
}

/* ------------------------------ الصفحة ------------------------------ */

/* ما لا يُترجم نصّه: الشيفرة، وما يكتبه المستخدم (محتوى خانة النصّ
   الطويل قيمتُها الأولى). أمّا صفاتها — «ابحث بالاسم…» في placeholder —
   فتُترجم. وما وُسم translate="no" لا يُمسّ هو ولا ما تحته: نصّ رسالة
   كتبها موظف، وعبارة تأكيد يطابقها الخادم حرفاً بحرف. */
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'KBD']);
const ATTRS = ['title', 'placeholder', 'aria-label', 'data-label', 'alt'];

const muted = (el) => el.getAttribute?.('translate') === 'no';

/* كل ما تُرجم يحفظ أصله العربي معه: به تُطبع الشاشة الكردية ورقاً عربياً
   بلا أن يُعاد رسمها. */
function translateText(node) {
  const v = node.nodeValue;
  if (!v || !AR.test(v)) return;
  const out = tx(v);
  if (out !== v) {
    node.__ar = v;
    node.nodeValue = out;
  }
}

function translateAttrs(el) {
  for (const name of ATTRS) {
    const v = el.getAttribute(name);
    if (!v || !AR.test(v)) continue;
    const out = tx(v);
    if (out !== v) {
      (el.__arAttrs ??= {})[name] = v;
      el.setAttribute(name, out);
    }
  }
}

/** يترجم عنصراً وكل ما تحته — إلا ما استُثني وما تحته. */
function translateTree(root) {
  if (lang === 'ar' || !root) return;
  if (root.nodeType === Node.TEXT_NODE) {
    if (!root.parentElement?.closest('[translate="no"], textarea, script, style, code, pre')) {
      translateText(root);
    }
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  if (root.closest?.('[translate="no"]')) return;

  translateAttrs(root);
  if (SKIP.has(root.tagName)) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      if (n.nodeType !== Node.ELEMENT_NODE) {
        return SKIP.has(n.parentElement?.tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
      return muted(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) translateText(n);
    else translateAttrs(n);
  }
}

let observer = null;

function watch() {
  /* المراقب يجري قبل أن ترسم الصفحة، فلا يرى الموظف العربية تومض ثم
     تتبدّل. وكتابتُه هو تُطلق حدثاً جديداً، لكن ترجمة الكردية لا تغيّر
     شيئاً فيقف عندها. */
  observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'childList') r.addedNodes.forEach(translateTree);
      else if (r.type === 'characterData') translateTree(r.target);
      else if (r.type === 'attributes') {
        if (!r.target.closest?.('[translate="no"]')) translateAttrs(r.target);
      }
    }
  });
  observer.observe(document.documentElement, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ATTRS,
  });
}

/**
 * يُحمّل قاموس اللغة ويترجم ما في الصفحة ويراقب ما يُضاف إليها.
 * يُنادى مرّة قبل أن يرسم البرنامج شيئاً.
 */
export async function initLang() {
  document.documentElement.lang = lang;
  if (lang === 'ar') return;
  try {
    const { default: table } = await import(`./i18n/${lang}.js`);
    load(table);
  } catch (err) {
    /* القاموس لم يصل: العربية خيرٌ من شاشة معطّلة. */
    console.error('تعذّر تحميل القاموس', err);
    lang = 'ar';
    document.documentElement.lang = 'ar';
    return;
  }
  translateTree(document.body);
  if (document.title) document.title = tx(document.title);
  watch();
}

/**
 * الشاشة المعروضة كما كانت ستُرسم بالعربية — صفحةً كاملة تُطبع.
 *
 * كل نصّ تُرجم يعود إلى أصله الذي حُفظ معه، والأشهر الكردية إلى أسمائها
 * العربية، ثم تُنسخ الصفحة وتُعاد الكردية فوراً. يجري ذلك كله في خطوة
 * واحدة لا يُرسم بينها شيء، فلا يرى الموظف شاشته تتبدّل.
 */
export function screenInArabic() {
  const swapped = [];
  const attrs = [];
  const monthRe = new RegExp(MONTHS.ckb.join('|'), 'g');

  observer?.disconnect();
  try {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.nodeType === Node.TEXT_NODE) {
        const now = n.nodeValue;
        /* الأصل العربي نفسه قد يحمل شهراً كردياً: الجملة رُكّبت بتاريخ
           كُتب بلغة الشاشة قبل أن تُترجم. */
        const back = (n.__ar ?? now).replace(monthRe, (m) => MONTHS.ar[MONTHS.ckb.indexOf(m)]);
        if (back !== now) { swapped.push([n, now]); n.nodeValue = back; }
      } else if (n.__arAttrs) {
        for (const [name, value] of Object.entries(n.__arAttrs)) {
          attrs.push([n, name, n.getAttribute(name)]);
          n.setAttribute(name, value);
        }
      }
    }

    const copy = document.documentElement.cloneNode(true);
    copy.lang = 'ar';
    /* النسخة تُطبع ولا تعمل: بلا شيفرة، وإلا أقلعت نسخة ثانية من البرنامج
       داخل إطار الطباعة. */
    copy.querySelectorAll('script, #modals > *, #toasts > *, .print-frame, .tabbar, .scrim').forEach((el) => el.remove());
    return '<!DOCTYPE html>\n' + copy.outerHTML;
  } finally {
    for (const [n, value] of swapped) n.nodeValue = value;
    for (const [el, name, value] of attrs) el.setAttribute(name, value);
    if (observer) {
      observer.takeRecords();
      observer.observe(document.documentElement, {
        childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: ATTRS,
      });
    }
  }
}

/**
 * يترجم صفحة HTML كاملة قبل طباعتها بالكردية. من يناديها يسأل لغة الطباعة
 * أوّلاً: الورق العربي يُطبع كما بُني.
 */
export function translateHtml(html) {
  if (lang === 'ar') return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const walker = doc.createTreeWalker(doc.documentElement, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      if (n.parentElement && !SKIP.has(n.parentElement.tagName)
          && !n.parentElement.closest('[translate="no"]')) translateText(n);
    } else if (!n.closest('[translate="no"]')) translateAttrs(n);
  }
  doc.documentElement.lang = lang;
  return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
}
