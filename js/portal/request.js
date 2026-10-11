/* ============================== طلب جديد ==============================
   نموذج السند نفسه بلونه وترتيبه — المادة ثم الكمية ثم Enter — لكنه
   يُرسل طلباً لا سنداً: الحاسوب الرئيسي هو الدفتر، وهو من يكتب السند
   بموافقة المدير أو مباشرةً لصاحب الصلاحية.

   الرصيد المعروض كما كان عند آخر رفع. فالنقص يُنبَّه إليه ولا يمنع:
   قد يكون وصل إلى المخزن ما لم يُرفع بعد، والحاسوب الرئيسي يحكم.

   وفوق البحث أزرار الأقسام: من لا يذكر اسم المادة على هاتفه يضغط قسمها
   فيرى موادّه بأرصدتها، وضغطةٌ على المادة تُدرجها وتضع المؤشّر في كميتها.

   وفي الإخراج: ما جُهّز به المنزل من قبل يُنبَّه عليه في سطره، ويُسأل
   عنه مرّة عند الإرسال — «تجهيز مكرر». والجواب لصاحب الطلب: لا يُمنع.

   ومن القسم (views.js) يُفتح النموذج برابطه: ‎#/new/out?section=3&items=12:5,14&back=section/3‎
   — القسم مفتوحاً فوق البحث، وما حُدّد فيه من موادّ أسطراً بكمياتها (وما
   لا كمية له تُكتب كميته هنا)، وبعد الإرسال يعود الموظف إلى القسم.

   والطلب المرسَل يحمل معرّف هذا الجهاز ويُحفظ في سجلّه (sb.js): السحابة
   تحمله حتى يُقرَّر، ثم يعود قراره إلى هذا الجهاز وحده ويُحذف منها — لا إلى
   هاتفٍ آخر يدخله الحساب نفسه.
   ======================================================================== */

import {
  h, clear, icon, num, toast, field, select, fold, today, debounce, modal, fmtDate, soleHouse,
} from '../ui.js';
import { tx } from '../i18n.js';
import { OPS, opIcon } from '../ops.js';
import { insertRequest, rpc, currentUserId } from './sb.js';
import {
  loadData, canRequest, isDirect, requestTitle, requestHint, go, pcOnline, bySection, NO_SECTION, sectionColor,
} from './main.js';

/* المسودّة لصاحبها: هاتفٌ واحد قد يدخله موظفان، ولا يُعرض على الثاني طلبٌ
   كتبه الأول — فيرسله المعتمد باسمه سنداً مباشراً وهو طلب طالبٍ ينتظر
   الموافقة. ومسودّة الإصدار السابق بلا صاحب تُمحى (LEGACY). */
const DRAFT_KEY = (type) => `gc-portal-draft-${currentUserId() ?? 'anon'}-${type}`;
const LEGACY_DRAFT_KEY = (type) => `gc-portal-draft-${type}`;
const WH_KEY = 'gc-portal-wh';
/* أطول ما يُنتظر جواب «ما جُهّز به المنزل» عند الإرسال. */
const SUPPLY_WAIT = 8 * 1000;

/** الكمية ووحدتها عقدتين: الوحدة («كيس») تُترجم وحدها، و«12 كيس» معاً لا. */
const amount = (value, unit) => [num(Math.max(0, Number(value) || 0)), unit ? [' ', h('span', {}, unit)] : null];

export async function request({ content, route }) {
  const type = route.param === 'in' ? 'in' : 'out';
  if (!canRequest(type)) {
    content.append(h('div', { class: 'card' }, h('div', { class: 'empty' },
      h('div', { class: 'e-icon' }, icon('lock', 28)), h('b', {}, `لا تملك صلاحية طلب ${OPS[type].label}`),
      h('div', {}, 'اطلبها من المدير.'))));
    return null;
  }
  const data = await loadData(true);
  if (!content.isConnected) return null;
  if (!data.warehouses.length) {
    content.append(h('div', { class: 'card' }, h('div', { class: 'empty' }, h('b', {}, 'لا مخزن في السحابة بعد'),
      'يُرفع من الحاسوب الرئيسي حين يتّصل.')));
    return null;
  }

  /* ------------------------------ الحالة ------------------------------ */

  let savedWh = null;
  try { savedWh = localStorage.getItem(WH_KEY); } catch { /* لا تخزين */ }
  const s = {
    id: crypto.randomUUID(),
    warehouse_id: data.warehouses.some((w) => String(w.id) === savedWh) ? savedWh : String(data.warehouses[0].id),
    house_id: null,
    date: today(),
    party: '',
    receiver_name: '',
    reference: '',
    notes: '',
    lines: [],
  };
  const draft = readDraft(type);
  /* ما جاء من القسم: أسطره في الطلب من أوّله. ولا يُكتب مسودّةً حتى يُعدَّل
     — فلا يمحو مسودّةً سابقة لم يُقرَّر فيها بعد. */
  const ask = route.query ?? {};
  const preset = presetLines(ask.items);
  s.lines.push(...preset.map((l) => ({ ...l })));
  /* بعد الإرسال: إلى القسم الذي جاء منه، وإلا إلى طلباته في الرئيسية. */
  const backTo = /^section\/\w+$/.test(ask.back ?? '') ? `#/${ask.back}` : '#/home';
  let sending = false;
  /* أُرسل الطلب: لا تُكتب مسودّته بعد ذلك. حفظ المسودّة مؤجَّل 400 جزء من
     الثانية، فمن أرسل قبل انقضائها عادت مسودّته بعد الإرسال — بمعرّف الطلب
     نفسه — وما عُدّل فيها ثم أُرسل رُدّ صامتاً لأن المعرّف وصل من قبل. */
  let sent = false;

  const available = (itemId) => {
    const it = data.items.find((i) => i.id === itemId);
    return Number(it?.stock?.[s.warehouse_id] ?? 0);
  };
  const wanted = (itemId) => s.lines.filter((l) => l.item_id === itemId).reduce((t, l) => t + (Number(l.qty) || 0), 0);

  /* --------------------------- ما جُهّز به المنزل ---------------------------
     لكل منزلٍ يُختار: مادةٌ ← ما خرج إليه منها وما أُرجع، وآخر مرة. يُسأل
     عنه مرّة لكل منزل في الطلب الواحد. وإن لم يُجب — الدالّة غائبة في سكربت
     سحابة قديم، أو انقطع الإنترنت — فلا تنبيه، ولا يتعطّل الإرسال لأجله. */

  const supplyCache = new Map();   // house_id ← Promise<Map<item_id, prior>>
  let supply = new Map();          // ما جُهّز به supplyHouse
  let supplyHouse = null;
  let supplyReady = Promise.resolve();

  function loadSupply() {
    if (type !== 'out') return;
    const house = s.house_id;
    if (supplyHouse !== house) {
      /* تنبيهات المنزل السابق تُمحى فوراً، لا حين يصل جواب الجديد. */
      supply = new Map();
      supplyHouse = house;
      paintLines();
    }
    if (!house) {
      supplyReady = Promise.resolve();
      return;
    }
    if (!supplyCache.has(house)) {
      supplyCache.set(house, rpc('gc_house_supply', { p_house: house })
        /* ما أُرجع كلّه لا يُنبَّه عليه: لم يبقَ في المنزل منه شيء. */
        .then((list) => new Map((Array.isArray(list) ? list : [])
          .filter((p) => Number(p.net) > 1e-9).map((p) => [Number(p.item_id), p])))
        .catch(() => {
          supplyCache.delete(house);   // يُسأل ثانيةً حين يُختار المنزل من جديد
          return new Map();
        }));
    }
    supplyReady = supplyCache.get(house).then((map) => {
      if (s.house_id !== house || !content.isConnected) return;
      supply = map;
      paintLines();
    });
  }

  const priorOf = (itemId) => (type === 'out' && itemId && supplyHouse === s.house_id
    ? supply.get(Number(itemId)) ?? null : null);

  /* ------------------------------ الرأس ------------------------------ */

  const head = h('div', { class: 'entry-head', 'data-op': type },
    opIcon(type, 24, true),
    h('div', { class: 'title' }, h('b', {}, requestTitle(type)), h('small', {}, requestHint(type))));

  const stale = h('div', { class: 'stale-note' }, icon('info', 15),
    pcOnline()
      ? 'الأرصدة كما رُفعت من الحاسوب الرئيسي قبل لحظات.'
      : 'الحاسوب الرئيسي غير متصل الآن — الأرصدة كما كانت عند آخر رفع، وطلبك يصله حين يُفتح.');

  /* ------------------------------ المواد ------------------------------ */

  const linesBox = h('div', { class: 'lines' });
  const picker = itemPicker();
  const browser = sectionBrowser();
  const itemsCard = h('div', { class: 'card', 'data-op': type },
    h('div', { class: 'card-head' }, h('h3', {}, icon('box', 18), 'المواد'), h('span', { class: 'sub', id: 'lines-count' })),
    h('div', { class: 'card-body' }, browser.node, picker.node, linesBox));

  /* ------------------------------ التفاصيل ------------------------------ */

  const whSelect = select('warehouse', data.warehouses.map((w) => ({ value: w.id, label: w.name })), s.warehouse_id, {
    onchange: (e) => {
      s.warehouse_id = e.target.value;
      try { localStorage.setItem(WH_KEY, s.warehouse_id); } catch { /* لا تخزين */ }
      paintLines();
      browser.refresh();
    },
  });
  const dateInput = h('input', { type: 'date', value: s.date, max: today(), oninput: (e) => { s.date = e.target.value; saveDraft(); } });
  const text = (key, placeholder) => h('input', { value: s[key], placeholder, 'data-k': key, oninput: (e) => { s[key] = e.target.value; saveDraft(); } });
  const housePick = type === 'out' ? housePicker() : null;

  const sumBox = h('div', { class: 'sum-box' });
  const sendBtn = h('button', { class: 'btn btn-op btn-lg btn-block', 'data-op': type, onclick: send },
    icon('send', 19), isDirect(type) ? 'إرسال للتسجيل' : 'إرسال الطلب');

  const side = h('div', { class: 'entry-side', 'data-op': type },
    h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('h3', {}, icon('file', 18), 'التفاصيل')),
      h('div', { class: 'card-body form-grid' },
        h('div', { class: 'field-row' }, field('التاريخ', dateInput), field('المخزن', whSelect)),
        housePick?.node ?? null,
        type === 'in' ? field('المجهّز', text('party', 'اسم المورّد أو الجهة')) : null,
        field(type === 'in' ? 'المستلم في المخزن' : 'اسم المستلم', text('receiver_name', type === 'out' ? 'من يستلم المواد' : '')),
        field('المرجع', text('reference', type === 'in' ? 'رقم الفاتورة' : 'رقم طلب أو أمر عمل')),
        field('ملاحظات', h('textarea', { oninput: (e) => { s.notes = e.target.value; saveDraft(); } }, s.notes)))),
    sumBox,
    h('div', { class: 'stack save-stack', style: 'gap:8px' }, sendBtn));

  /* على الهاتف يقع الإرسال تحت المواد وحدها (save-stack يُخفي الذي فوقها):
     يُملأ الطلب من أعلاه إلى أسفله ثم يُرسل من حيث انتهى — لا قبل أن تُرى
     المواد. */
  const phoneSend = h('button', { class: 'btn btn-op btn-lg btn-block', 'data-op': type, onclick: send },
    icon('send', 19), isDirect(type) ? 'إرسال للتسجيل' : 'إرسال الطلب');
  itemsCard.querySelector('.card-body').append(h('div', { class: 'show-phone', style: 'margin-top:14px' }, phoneSend));

  const draftBox = h('div', {});
  if (draft?.lines?.length) {
    draftBox.append(h('div', { class: 'info-box', style: 'margin-bottom:14px' }, icon('history', 18),
      h('div', { style: 'flex:1' }, h('b', {}, `لديك ${requestTitle(type)} لم يُرسل — ${draft.lines.length} مادة`)),
      h('button', {
        class: 'btn btn-sm',
        onclick: () => {
          /* وما جاء من القسم يبقى معها — بما عُدّل من كمياته — يُضاف منه ما ليس فيها. */
          const fromSection = s.lines.filter((l) => preset.some((p) => p.item_id === l.item_id));
          Object.assign(s, draft, { id: draft.id || s.id });
          s.lines = [...s.lines, ...fromSection.filter((p) => !s.lines.some((l) => l.item_id === p.item_id))];
          restore();
          clear(draftBox);
        },
      }, 'استعادته'),
      h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { clearDraft(type); clear(draftBox); } }, 'تجاهله')));
  }

  content.append(head, stale, draftBox, h('div', { class: 'entry' }, side, itemsCard));
  /* القسم الذي جاء منه مفتوحاً بموادّه: يأخذ منه ما بقي. و0 «بلا قسم». */
  if (ask.section) browser.openSection(ask.section === '0' || ask.section === NO_SECTION ? NO_SECTION : Number(ask.section));
  paintLines();
  /* مادةٌ جاءت بلا كمية: المؤشّر في كميتها كما لو أُدرجت هنا (addLine) —
     وإلا بقي سطرها تحت موادّ القسم كلّها على الهاتف لا يُرى. */
  const blank = s.lines.findIndex((l) => !(Number(l.qty) > 0));
  if (preset.length && blank >= 0) focusQty(blank);

  function restore() {
    /* مخزنٌ أُوقف أو منزلٌ أُزيل منذ كُتبت المسودّة: يُختار المتاح. */
    if (!data.warehouses.some((w) => String(w.id) === String(s.warehouse_id))) s.warehouse_id = String(data.warehouses[0].id);
    s.warehouse_id = String(s.warehouse_id);
    if (s.house_id && !data.houses.some((x) => x.id === s.house_id)) s.house_id = null;
    dateInput.value = s.date;
    whSelect.value = s.warehouse_id;
    housePick?.set(s.house_id);
    for (const key of ['party', 'receiver_name', 'reference']) {
      const el = side.querySelector(`input[data-k="${key}"]`);
      if (el) el.value = s[key];
    }
    const notes = side.querySelector('textarea');
    if (notes) notes.value = s.notes;
    paintLines();
    browser.refresh();
    /* المسودّة رجعت بمنزلها: يُسأل عمّا جُهّز به. */
    loadSupply();
  }

  const saveDraft = debounce(() => {
    if (sent) return;
    try {
      if (!s.lines.length) localStorage.removeItem(DRAFT_KEY(type));
      else localStorage.setItem(DRAFT_KEY(type), JSON.stringify(s));
    } catch { /* لا تخزين */ }
  }, 400);

  /* ------------------------------ الأسطر ------------------------------ */

  /**
   * ‎items=12:5,14‎ من القسم ← أسطر الطلب: المادة الفعّالة وحدها، مرّةً
   * واحدة، وكميتها إن كُتبت موجبة — وإلا تُكتب هنا. ورقمٌ لا مادة له
   * (أُوقفت منذ فُتح القسم) يُترك بلا ضجيج.
   */
  function presetLines(text) {
    const out = [];
    for (const part of String(text ?? '').split(',')) {
      const [id, qty = ''] = part.split(':');
      const it = data.items.find((i) => i.id === Number(id) && i.active !== 0);
      if (!it || out.some((l) => l.item_id === it.id)) continue;
      out.push({ item_id: it.id, name: it.name, sku: it.sku, unit: it.unit, qty: Number(qty) > 0 ? String(Number(qty)) : '', notes: '' });
    }
    return out;
  }

  function addLine(line) {
    /* المادة الجديدة تُعرف باسمها: «بلوك 20» مرّتين في الطلب سطرٌ واحد. */
    const existing = s.lines.find((l) => (line.item_id ? l.item_id === line.item_id : !l.item_id && fold(l.name) === fold(line.name)));
    if (existing) {
      focusQty(s.lines.indexOf(existing));
      toast(`«${line.name}» في الطلب مسبقاً — عدّل كميته`, 'info');
      return;
    }
    s.lines.push({ qty: '', notes: '', ...line });
    paintLines();
    focusQty(s.lines.length - 1);
    saveDraft();
  }

  function focusQty(i) {
    setTimeout(() => {
      const input = linesBox.querySelectorAll('.ln-qty input')[i];
      input?.focus();
      input?.select();
    }, 20);
  }

  function paintLines() {
    clear(linesBox);
    s.lines.forEach((line, i) => linesBox.append(lineRow(line, i)));
    if (!s.lines.length) {
      linesBox.append(h('div', { class: 'empty', style: 'padding:26px' },
        h('div', { class: 'e-icon' }, icon(OPS[type].icon, 26)),
        h('b', {}, 'لا مواد بعد'),
        data.categories.length
          ? 'اضغط قسماً أعلاه، أو اكتب اسم المادة أو رمزها في الخانة'
          : 'اكتب اسم المادة أو رمزها في الخانة أعلاه'));
    }
    browser.mark();
    paintSummary();
  }

  function lineRow(line, i) {
    const bal = line.item_id ? available(line.item_id) : null;
    const prior = priorOf(line.item_id);
    const section = line.item_id ? null : data.categories.find((c) => c.id === Number(line.category_id));
    const metaRow = h('div', { class: 'ln-meta' });
    const row = h('div', { class: `line${prior ? ' p-resupply' : ''}` },
      h('span', { class: 'ln-n' }, String(i + 1)),
      h('div', {}, h('div', { class: 'ln-name' }, line.name), metaRow, prior ? priorChip(prior, line.unit) : null),
      h('div', { class: 'ln-qty' },
        h('input', {
          type: 'number', min: '0', step: 'any', inputmode: 'decimal', value: line.qty, placeholder: '0',
          oninput: (e) => { line.qty = e.target.value; update(); paintSummary(); saveDraft(); },
          onkeydown: (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            /* من أخذ المادة من قسمٍ مفتوح يعود إليه ليأخذ التالية، ومن
               بحث عنها يعود إلى البحث. */
            if (browser.isOpen()) {
              e.target.blur();
              browser.reveal();
            } else picker.focus();
          },
        }),
        h('span', {}, line.unit ?? '')),
      h('button', {
        class: 'icon-btn sm danger', type: 'button', title: 'حذف السطر',
        onclick: () => { s.lines.splice(s.lines.indexOf(line), 1); paintLines(); saveDraft(); },
      }, icon('trash', 16)));

    function update() {
      const after = bal === null ? null : type === 'out' ? bal - wanted(line.item_id) : bal + wanted(line.item_id);
      clear(metaRow).append(
        line.item_id ? h('span', { class: 'ltr', translate: 'no' }, line.sku ?? '') : h('span', { class: 'after' }, 'مادة جديدة — يضيفها المدير'),
        section ? h('span', { class: 'p-sec-name', style: `--sc:${sectionColor(section)}` }, icon(section.icon, 12), section.name) : null,
        bal !== null ? h('span', {}, `في المخزن ${num(bal)}`) : null,
        after !== null && Number(line.qty) > 0
          ? h('span', { class: after < -1e-9 ? 'bad' : 'after' }, after < -1e-9 ? `ينقص ${num(-after)}` : `يصير ${num(after)}`)
          : null);
      row.classList.toggle('short', type === 'out' && after !== null && after < -1e-9);
    }
    update();
    return row;
  }

  /**
   * شارة التنبيه تحت سطر المادة، أجزاءً تُترجم كلٌّ وحده:
   * «جُهّز لهذا المنزل سابقاً: 12 كيس — آخر مرة 3 أكتوبر 2026».
   */
  function priorChip(prior, unit) {
    return h('div', { class: 'p-prior' }, icon('history', 13),
      h('span', {}, h('span', {}, 'جُهّز لهذا المنزل سابقاً:'), ' ', ...amount(prior.net, unit),
        prior.last_date ? [' — ', h('span', {}, 'آخر مرة'), ' ', fmtDate(prior.last_date)] : null));
  }

  function paintSummary() {
    const filled = s.lines.filter((l) => Number(l.qty) > 0);
    const total = filled.reduce((t, l) => t + Number(l.qty), 0);
    const short = type === 'out'
      ? [...new Set(s.lines.map((l) => l.item_id).filter(Boolean))].filter((id) => available(id) - wanted(id) < -1e-9).length
      : 0;
    const again = s.lines.filter((l) => priorOf(l.item_id)).length;
    const counter = itemsCard.querySelector('#lines-count');
    if (counter) counter.textContent = s.lines.length ? `${s.lines.length} مادة` : '';
    clear(sumBox).append(
      h('div', { class: 'sum-row' }, h('span', {}, 'المواد'), h('b', {}, String(filled.length))),
      h('div', { class: 'sum-big' }, num(total)),
      h('div', { class: 'small muted' }, 'مجموع الكميات'),
      short ? h('div', { class: 'sum-row', style: 'color:var(--bad);font-weight:700;margin-top:6px' }, icon('alert', 15),
        `${short} مادة لا يكفي رصيدها الظاهر`) : null,
      again ? h('div', { class: 'sum-row', style: 'color:var(--warn);font-weight:700;margin-top:6px' }, icon('history', 15),
        `${again} مادة جُهّزت لهذا المنزل سابقاً`) : null,
      type === 'out' && !s.house_id ? h('div', { class: 'sum-row', style: 'color:var(--warn);margin-top:6px' }, icon('map', 15), 'اختر وجهة الإخراج') : null);
    sendBtn.disabled = sending || !filled.length || (type === 'out' && !s.house_id);
    phoneSend.disabled = sendBtn.disabled;
  }

  /* ------------------------------ الإرسال ------------------------------ */

  async function send() {
    const filled = s.lines.filter((l) => Number(l.qty) > 0);
    if (!filled.length || sending) return;
    if (type === 'out' && !s.house_id) return toast('اختر القطاع والمنزل', 'error');
    sending = true;
    paintSummary();
    try {
      if (type === 'out') {
        /* السؤال عمّا جُهّز به المنزل ربما لم يصل بعد: يُنتظر، فلا يُرسل
           تجهيزٌ مكرر بلا تنبيه لأن الضغط سبق الجواب. ولا يُنتظر أكثر من
           ثوانٍ: جوابٌ علِق في شبكة الهاتف لا يحبس الطلب — كأنه فشل. */
        await Promise.race([supplyReady, new Promise((resolve) => { setTimeout(resolve, SUPPLY_WAIT); })]);
        if (!content.isConnected) return;
        const again = filled.filter((l) => priorOf(l.item_id));
        if (again.length && !(await confirmResupply(again))) {
          sending = false;
          paintSummary();
          return;
        }
      }
      /* insertRequest يُلحق بالطلب معرّف هذا الجهاز، وما وصل يُحفظ في سجلّه
         (sb.js): إليه وحده يعود قراره. وdirect كما كان الحساب يوم أُرسل —
         يُعرض به الطلب حتى تُقرأ السحابة. */
      const fresh = await insertRequest({
        id: s.id,
        type,
        warehouse_id: Number(s.warehouse_id),
        house_id: type === 'out' ? s.house_id : null,
        voucher_date: s.date || today(),
        party: s.party.trim(),
        receiver_name: s.receiver_name.trim(),
        reference: s.reference.trim(),
        notes: s.notes.trim(),
        lines: filled.map((l) => {
          const prior = priorOf(l.item_id);
          return {
            item_id: l.item_id ?? null, name: l.name, unit: l.unit ?? '', sku: l.sku ?? '',
            qty: Number(l.qty), notes: l.notes ?? '',
            /* المادة الجديدة في القسم الذي اختاره صاحب الطلب — به يضيفها المدير. */
            ...(l.item_id ? {} : { category_id: Number(l.category_id) || null }),
            /* للعلم: أُرسل وهو يعلم أن المنزل جُهّز بها. والحاسوب الرئيسي يحسب ذلك بنفسه. */
            ...(prior ? { resupply: true, prior_net: Number(prior.net) || 0, prior_date: prior.last_date ?? '' } : {}),
          };
        }),
      }, { direct: isDirect(type) });
      sent = true;
      clearDraft(type);
      /* المعرّف وصل من قبل — إرسالٌ سابق انقطع جوابه: ما وصل هو الأول، فلا
         يُقال «أُرسل» عن تعديلٍ لم يصل. */
      if (!fresh) toast('أُرسل هذا الطلب مسبقاً', 'info');
      else {
        toast(isDirect(type)
          ? 'أُرسل — يُسجَّل سنداً حين يتّصل الحاسوب الرئيسي'
          : 'أُرسل الطلب إلى المدير', 'success');
      }
      /* جاء من القسم برابطٍ فيه موادّه: «رجوع» بعد الإرسال يفتح نموذجاً فارغاً
         كما بعد كل طلب — لا الطلبَ نفسه مملوءاً فيُرسَل ثانيةً. */
      if (Object.keys(ask).length) history.replaceState(null, '', `#/new/${type}`);
      go(backTo);
    } catch (err) {
      /* المعرّف يبقى: إعادة الإرسال بعد انقطاع لا تُكرّر الطلب. */
      sending = false;
      paintSummary();
      toast(err.message, 'error');
    }
  }

  /**
   * «تجهيز مكرر»: يُسأل مرّة عند الإرسال، بالكلمات نفسها التي يسأل بها
   * البرنامج المدير. والتركيز على «لا»: ضغطةٌ عجلى لا تُرسل بلا قراءة.
   */
  function confirmResupply(again) {
    const house = data.houses.find((x) => x.id === s.house_id);
    return new Promise((resolve) => {
      let answered = false;
      const answer = (yes, close) => { answered = true; close(); resolve(yes); };
      modal({
        title: 'تجهيز مكرر',
        body: h('div', { class: 'form-grid' },
          h('div', { class: 'warn-box' }, icon('alert', 18), h('div', {},
            h('b', {}, 'تم تجهيز هذه المواد سابقاً لهذا المنزل — هل تريد تجهيزه مجدداً؟'),
            house ? h('div', { class: 'small' }, h('span', {}, 'المنزل'), ' ', h('b', { class: 'ltr', translate: 'no' }, house.code)) : null)),
          h('div', { class: 'p-again-list' }, ...again.map((l) => {
            const prior = priorOf(l.item_id);
            return h('div', { class: 'p-again' },
              h('b', {}, l.name),
              h('div', { class: 'small' }, h('span', {}, 'جُهّز سابقاً'), ': ', ...amount(prior.net, l.unit),
                prior.last_date ? [' — ', h('span', {}, 'آخر مرة'), ' ', fmtDate(prior.last_date)] : null),
              h('div', { class: 'small' }, h('span', {}, 'المطلوب الآن'), ': ', h('b', {}, ...amount(l.qty, l.unit))));
          }))),
        footer: (close) => [
          h('button', { class: 'btn', autofocus: true, onclick: () => answer(false, close) }, icon('edit', 16), 'لا، راجع الطلب'),
          h('button', { class: 'btn btn-op', 'data-op': 'out', onclick: () => answer(true, close) }, icon('send', 16), 'نعم، أرسل'),
        ],
        onClose: () => { if (!answered) resolve(false); },
      });
    });
  }

  /* ------------------------------ الأقسام ------------------------------ */

  /**
   * أزرار الأقسام فوق البحث: لكل قسم لونه وأيقونته وعدد موادّه، و«بلا قسم»
   * إن بقيت مواد لم تُوضع في قسم. الضغط على قسم يعرض موادّه مكان الأزرار —
   * أزراراً كبيرة تحت الإبهام بأرصدتها في المخزن المختار — والضغط على مادة
   * يُدرجها ويضع المؤشّر في كميتها. و«كل الأقسام» يعود إلى الأزرار. والبحث
   * تحتها يبقى يبحث في المواد كلّها.
   */
  function sectionBrowser() {
    let open = null;   // مفتاح القسم المفتوح، أو null حين تُعرض الأزرار
    const node = h('div', { class: 'p-sections' });
    const pool = () => data.items.filter((i) => i.active !== 0);

    const itemButton = (it) => {
      const bal = Number(it.stock?.[s.warehouse_id] ?? 0);
      return h('button', { type: 'button', class: 'p-sec-item', 'data-item': it.id, onclick: () => pick(it) },
        h('div', { class: 'ps-main' }, h('div', { class: 'ps-name' }, it.name), h('div', { class: 'ps-sku ltr', translate: 'no' }, it.sku)),
        h('span', { class: 'ps-added' }, icon('check', 16)),
        h('span', { class: `ps-bal${bal <= 0 ? ' zero' : ''}` }, num(bal), it.unit ? [' ', h('span', {}, it.unit)] : null));
    };

    const pick = (it) => addLine({ item_id: it.id, name: it.name, sku: it.sku, unit: it.unit });

    const paint = () => {
      clear(node);
      /* سحابةٌ بلا أقسام (السكربت القديم): البحث وحده كما كان. */
      if (!data.categories.length) return;
      const groups = bySection(pool());
      const sec = groups.find((g) => g.key === open);
      if (!sec) {
        open = null;
        node.append(h('div', { class: 'p-sec-tiles' }, ...groups.map((g) => h('button', {
          type: 'button', class: 'p-sec-tile', style: `--sc:${sectionColor(g)}`,
          onclick: () => { open = g.key; paint(); reveal(); },
        }, h('span', { class: 'p-sec-ico' }, icon(g.icon, 20)), h('b', {}, g.name), h('span', { class: 'n' }, num(g.items.length))))));
        return;
      }
      const list = [...sec.items].sort((a, b) => a.name.localeCompare(b.name, 'ar'));
      node.append(
        h('div', { class: 'p-sec-head', style: `--sc:${sectionColor(sec)}` },
          h('button', { type: 'button', class: 'btn btn-sm', onclick: () => { open = null; paint(); } }, icon('chevron', 16), 'كل الأقسام'),
          h('span', { class: 'p-sec-ico' }, icon(sec.icon, 18)),
          h('b', {}, sec.name),
          h('span', { class: 'n' }, `${num(list.length)} مادة`)),
        list.length
          ? h('div', { class: 'p-sec-items' }, ...list.map(itemButton))
          : h('div', { class: 'pk-hint' }, 'لا مواد في هذا القسم بعد'),
        /* مادةٌ لا يجدها في قسمها: يطلبها جديدةً فيه. */
        type === 'in' && sec.key !== NO_SECTION
          ? h('button', { type: 'button', class: 'btn btn-sm btn-ghost', style: 'margin-top:8px', onclick: () => newItem('', sec.id) },
              icon('plus', 15), 'مادة جديدة في هذا القسم')
          : null);
      mark();
    };

    /** ما في الطلب من موادّ القسم المفتوح يُعلَّم: يُرى ما أُخذ منه وما بقي. */
    const mark = () => {
      const inRequest = new Set(s.lines.map((l) => l.item_id).filter(Boolean));
      for (const b of node.querySelectorAll('.p-sec-item')) b.classList.toggle('added', inRequest.has(Number(b.dataset.item)));
    };

    /** يُظهر الأقسام إن خرجت من الشاشة — بعد فتح قسم، أو بعد كمية مادةٍ أُخذت منه. */
    const reveal = () => {
      const top = node.getBoundingClientRect().top;
      if (top < 70 || top > window.innerHeight * 0.6) node.scrollIntoView({ block: 'start', behavior: 'smooth' });
    };

    paint();
    return {
      node, mark, reveal,
      refresh: paint,
      /** يفتح القسم برابطٍ جاء منه — وقسمٌ لم يعد موجوداً تبقى الأزرار مكانه. */
      openSection: (key) => { open = key; paint(); },
      isOpen: () => open !== null,
      /** القسم المفتوح ليُقترح للمادة الجديدة، أو null. */
      section: () => (open !== null && open !== NO_SECTION ? open : null),
    };
  }

  /* ------------------------------ منتقي المواد ------------------------------ */

  function itemPicker() {
    const input = h('input', {
      placeholder: type === 'in' ? 'اكتب اسم المادة أو رمزها — أو اسماً جديداً' : 'اكتب اسم المادة أو رمزها…',
      autocomplete: 'off',
    });
    const list = h('div', { class: 'picker-list', hidden: true });
    const node = h('div', { class: 'picker' },
      h('div', { class: 'picker-input' }, icon('search', 19), input), list);
    let shown = [];
    let marked = 0;

    const paint = () => {
      const q = fold(input.value);
      const pool = data.items.filter((i) => i.active !== 0);
      shown = q
        ? pool.filter((i) => fold(`${i.name} ${i.sku}`).includes(q))
            .sort((a, b) => (fold(a.name).startsWith(q) ? 0 : 1) - (fold(b.name).startsWith(q) ? 0 : 1))
        : [];
      shown = shown.slice(0, 30);
      const offerNew = type === 'in' && q && !pool.some((i) => fold(i.name) === q);
      clear(list);
      shown.forEach((it, i) => {
        const bal = Number(it.stock?.[s.warehouse_id] ?? 0);
        list.append(h('div', {
          class: `pk-item${i === marked ? ' on' : ''}`,
          onmousedown: (e) => { e.preventDefault(); pick(it); },
        }, h('div', {}, h('div', { class: 'pk-name' }, it.name), h('div', { class: 'pk-sku ltr', translate: 'no' }, it.sku)),
        h('span', { class: `pk-bal${bal <= 0 ? ' zero' : ''}` }, ...amount(bal, it.unit))));
      });
      if (offerNew) {
        list.append(h('div', {
          class: `pk-item new${shown.length === 0 ? ' on' : ''}`,
          onmousedown: (e) => { e.preventDefault(); offer(); },
        }, icon('plus', 17), h('b', {}, `«${input.value.trim()}» مادة جديدة`)));
      }
      if (!shown.length && !offerNew) list.append(h('div', { class: 'pk-hint' }, q ? 'لا مادة بهذا الاسم أو الرمز' : 'اكتب للبحث في المواد'));
      list.hidden = false;
    };

    const pick = (it) => {
      input.value = '';
      list.hidden = true;
      addLine({ item_id: it.id, name: it.name, sku: it.sku, unit: it.unit });
    };

    /* الاسم المكتوب مادةٌ جديدة، والقسم المفتوح فوق البحث قسمها المقترح. */
    const offer = () => newItem(input.value.trim(), browser.section(), () => { input.value = ''; list.hidden = true; });

    input.addEventListener('input', () => { marked = 0; paint(); });
    input.addEventListener('focus', paint);
    input.addEventListener('blur', () => setTimeout(() => { list.hidden = true; }, 150));
    input.addEventListener('keydown', (e) => {
      const rowsEls = list.querySelectorAll('.pk-item');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        rowsEls[marked]?.classList.remove('on');
        marked = Math.max(0, Math.min(rowsEls.length - 1, marked + (e.key === 'ArrowDown' ? 1 : -1)));
        rowsEls[marked]?.classList.add('on');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (shown[marked]) pick(shown[marked]);
        else if (rowsEls[marked]?.classList.contains('new')) offer();
      } else if (e.key === 'Escape') {
        list.hidden = true;
      }
    });

    return { node, focus: () => input.focus() };
  }

  /* المادة الجديدة لا تُضاف إلى المواد من الموقع: تُكتب في الطلب باسمها
     ووحدتها وقسمها، ويضيفها المدير حين يوافق — فلا تتكاثر المواد بأسماء
     متقاربة كتبها كلٌّ على هواه. والقسم يختاره صاحب الطلب: هو يعرف ما
     طلب، والمدير يجد المادة في قسمها حين يضيفها. */
  function newItem(name, sectionId = null, done = null) {
    const nameInput = h('input', { value: name });
    const unitSel = select('unit', [{ value: '', label: '— الوحدة —' }, ...data.units.map((u) => ({ value: u.name, label: u.name }))], '');
    const sectionSel = data.categories.length
      ? select('category', [{ value: '', label: '— اختر القسم —' }, ...data.categories.map((c) => ({ value: c.id, label: c.name }))], sectionId ?? '')
      : null;
    const error = h('div', { class: 'form-error', hidden: true });
    modal({
      title: 'مادة جديدة',
      body: h('div', { class: 'form-grid' },
        h('div', { class: 'info-box' }, icon('info', 18), h('div', { class: 'small' },
          'المادة لا تُضاف إلى المخزن من الموقع: تُكتب في طلبك، ويضيفها المدير حين يوافق عليه.')),
        field('اسم المادة', nameInput),
        h('div', { class: 'field-row' }, field('الوحدة', unitSel), sectionSel ? field('القسم', sectionSel) : null),
        error),
      footer: (close) => [
        h('button', { class: 'btn', onclick: close }, 'إلغاء'),
        h('button', {
          class: 'btn btn-op', 'data-op': 'in',
          onclick: () => {
            const finalName = nameInput.value.trim();
            const problem = !finalName ? 'اكتب اسم المادة' : sectionSel && !sectionSel.value ? 'اختر قسم المادة' : null;
            if (problem) {
              error.textContent = tx(problem);
              error.hidden = false;
              return;
            }
            close();
            done?.();
            addLine({ item_id: null, name: finalName, unit: unitSel.value, category_id: Number(sectionSel?.value) || null });
          },
        }, icon('plus', 16), 'إدراج في الطلب'),
      ],
    });
  }

  /* ------------------------------ منتقي المنزل ------------------------------ */

  function housePicker() {
    const houses = data.houses;
    const blocks = [];
    for (const x of houses) {
      if (!blocks.some((b) => b.id === x.block_id)) blocks.push({ id: x.block_id, code: x.block_code, color: x.color });
    }
    let block = blocks[0]?.id ?? null;
    const chosen = h('div', {});
    const chips = h('div', { class: 'block-chips' });
    const grid = h('div', { class: 'house-grid' });
    /* من اليسار لـ«D-15»، وفارغةً من اليمين (app.css ‎:placeholder-shown‎)
       فيُقرأ تلميحها العربي كما كُتب. */
    const quick = h('input', { placeholder: 'رقم المنزل أو رمزه (D-15)…', class: 'ltr', style: 'text-align:right', autocomplete: 'off' });
    const note = h('div', { class: 'hint', style: 'color:var(--warn);font-weight:600', hidden: true });
    const pickBox = h('div', { class: 'house-pick' }, quick, note, chips, grid);

    const paintChosen = () => {
      const x = houses.find((y) => y.id === s.house_id);
      clear(chosen).append(x
        ? h('div', { class: 'chosen-house' }, icon('map', 18),
            h('div', { style: 'flex:1' }, h('b', {}, `قطاع ${x.block_code} — منزل ${x.number}`),
              h('div', { class: 'small muted' }, h('span', { class: 'ltr' }, x.code), ` · الإنجاز ${x.progress}%`)),
            h('button', {
              class: 'btn btn-sm btn-ghost', type: 'button',
              onclick: () => { s.house_id = null; quick.value = ''; paintGrid(); paintChosen(); paintSummary(); loadSupply(); },
            }, 'تغيير'))
        : null);
      pickBox.hidden = Boolean(x);
    };

    const paintGrid = () => {
      clear(chips).append(...blocks.map((b) => h('button', {
        type: 'button', class: b.id === block ? 'on' : null, style: `--bc:${b.color}`,
        onclick: () => { block = b.id; quick.value = ''; paintGrid(); },
      }, b.code)));
      const q = quick.value.trim().toUpperCase();
      /* المطابق تماماً أوّلاً: «C-1» هو C-1 لا C-12 — وEnter يأخذ الأول. */
      const exact = (x) => (x.code.toUpperCase() === q ? 0 : x.number === q ? 1 : 2);
      const list = q
        ? houses.filter((x) => exact(x) < 2 || x.code.toUpperCase().includes(q)).sort((a, b) => exact(a) - exact(b))
        : houses.filter((x) => x.block_id === block);
      clear(grid).append(...list.slice(0, 120).map((x) => h('button', {
        type: 'button', title: `${x.code} — ${x.progress}٪`, style: `--p:${x.progress}%`,
        class: x.id === s.house_id ? 'on' : null, 'data-house': x.id,
        onclick: () => { s.house_id = x.id; note.hidden = true; paintChosen(); paintGrid(); paintSummary(); saveDraft(); loadSupply(); },
      }, q ? `${x.block_code}·${x.number}` : x.number)));
      if (!list.length) grid.append(h('div', { class: 'hint' }, q ? 'لا منزل بهذا الرقم' : 'اختر القطاع'));
    };

    quick.addEventListener('input', () => { note.hidden = true; paintGrid(); });
    quick.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (!quick.value.trim()) return;
      const hit = soleHouse(houses, quick.value);
      if (hit) {
        grid.querySelector(`[data-house="${hit.id}"]`)?.click();
        return;
      }
      /* رقمٌ في قطاعين (D-15 وC-15): لا يُختار أوّلهما — يُختار بالضغط. */
      note.textContent = 'أكثر من منزل بهذا الرقم — اختر من القائمة أو اكتب الرمز كاملاً';
      note.hidden = !grid.querySelector('button');
    });

    const node = h('div', { class: 'field' }, h('span', {}, 'الوجهة — القطاع والمنزل'), chosen, pickBox);
    const set = (id) => {
      s.house_id = id;
      const x = houses.find((y) => y.id === id);
      if (x) block = x.block_id;
      paintGrid();
      paintChosen();
    };
    set(s.house_id);
    return { node, set };
  }

  return null;
}

function readDraft(type) {
  try {
    localStorage.removeItem(LEGACY_DRAFT_KEY(type));
    return JSON.parse(localStorage.getItem(DRAFT_KEY(type)) || 'null');
  } catch {
    return null;
  }
}

function clearDraft(type) {
  try { localStorage.removeItem(DRAFT_KEY(type)); } catch { /* لا تخزين */ }
}
