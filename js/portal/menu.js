/* ============================== قائمة الطلبات ==============================
   «الطالب» يطلب المواد كما يُطلب الطعام من تطبيقه (بطلب صاحب المشروع): المواد
   بأقسامها قائمةً — لكل قسم لونه وأيقونته، ولكل مادة اسمها ووحدتها ورمزها —
   و«أضف» تضعها في السلّة، فيصير الزرّ [− الكمية +]. وشريط السلّة أسفل الشاشة
   يفتحها (‎#/cart‎): يختار فيها نوع الطلب ووجهته ومخزنه ويكتب ملاحظته للمدير،
   ثم يرسلها طلباً واحداً ينتظر موافقة المدير.

   ولا أعداد هنا: لا رصيد ولا «نافدة» ولا «عند الحدّ» ولا عدد موادّ القسم.
   والنافدة تُطلب كغيرها — المدير يحكم حين يوافق. والأرصدة تصل من السحابة كما
   تصل للمعتمد (loadData) ولا تُقرأ في هذا الملف أبداً.

   والطلب نفسه طلب النموذج (send.js): معرّفه من السلّة فلا يتكرّر بعد انقطاع،
   وما جُهّز به المنزل يُعلَّم في سطره ويُسأل عنه بالسؤال نفسه. والسلّة على
   هذا الجهاز، لكل حسابٍ وحده (sb.js).

   ‎#/menu?section=3‎ تفتح القائمة على القسم (و0 لـ«بلا قسم») — من أيقونته في
   الرئيسية، أو من رابط القسم القديم (main.js).

   والأطقم الجاهزة (الإصدار الخامس) أوّل القائمة لمن يطلب الإخراج: الطقم مواد
   تُطلب معاً باسمٍ واحد، يُضاف بعددٍ صحيح (أطقماً كاملة) و«ما بداخله» يُريه
   موادّه بكمياتها لطقمٍ واحد — تعريفٌ لا رصيد. وفي السلّة عشرون طقماً على
   الأكثر، وطلب الإدخال لا يحمل طقماً. ‎#/menu?section=kits&kit=3‎ من رئيسية
   الطالب تفتحها على الطقم.
   ========================================================================== */

import {
  h, clear, icon, num, toast, modal, field, select, segmented, fold, today, debounce, emptyState, loadingState,
} from '../ui.js';
import { tx } from '../i18n.js';
import { OPS } from '../ops.js';
import { currentUserId, readCart, writeCart, normalCart } from './sb.js';
import {
  loadData, canRequest, isDirect, requestTitle, pcOnline, bySection, sectionColor, NO_SECTION, go, paintCartBadge,
} from './main.js';
import {
  WH_KEY, houseSupply, priorChip, housePicker, submitRequest, positive, wholeKits, KIT_QTY_MAX, KIT_CART_MAX, amount,
} from './send.js';

/* ------------------------------ المواد ------------------------------ */

/** نوعا الطلب اللذان يملكهما الحساب — والإخراج أوّلاً: له تُطلب المواد غالباً. */
const typesOf = () => ['out', 'in'].filter(canRequest);

/* «أطقم جاهزة»: قسمٌ في القائمة قبل الأقسام، وفي العنوان section=kits. */
const KITS = 'kits';

/** القسم في العنوان: رقمه، و0 لـ«بلا قسم» — كما يكتبه رابط القسم. */
const sectionParam = (g) => (g.key === NO_SECTION ? '0' : String(g.id));
const sectionKey = (raw) => (raw === KITS ? KITS : raw === '0' || raw === NO_SECTION ? NO_SECTION
  : /^\d+$/.test(String(raw ?? '')) ? Number(raw) : null);

const byName = (a, b) => a.name.localeCompare(b.name, 'ar');

/**
 * ما يُطلب: المواد الفعّالة وحدها، وأقسامها بترتيبها في البرنامج — أو null
 * لسحابةٍ بلا أقسام (السكربت القديم): قائمةٌ واحدة بلا عناوين.
 */
function catalog(data) {
  const pool = data.items.filter((i) => i.active !== 0);
  const groups = data.categories.length ? bySection(pool, data) : null;
  const secOf = new Map((groups ?? []).flatMap((g) => g.items.map((i) => [i.id, g])));
  /* الأطقم لمن يطلب الإخراج وحده: من يطلب الإدخال وحده لا يرى طقماً. */
  const kits = canRequest('out') ? data.kits ?? [] : [];
  return { pool, groups, byId: new Map(pool.map((i) => [i.id, i])), secOf, kits, kitById: new Map(kits.map((k) => [k.id, k])) };
}

/* ------------------------------ السلّة ------------------------------
   السلّة هي ما في التخزين (sb.js)، لا نسخةً رُسمت بها الشاشة: إرسالٌ تمّ من
   سلّةٍ تُركت يُخرج منها ما أُرسل والقائمة معروضة، ونافذة كميةٍ بقيت مفتوحة
   حين أُعيد رسم القائمة تكتب فيها. فكل تغييرٍ يُقرأ لها ثم يُكتب عليها —
   لا تعود بنسخةٍ قديمة سلّةٌ أُرسلت، فيُردّ ما أُضيف إليها «أُرسل مسبقاً» —
   ثم يُنادى CART_EVENT فترسم الشاشة المعروضة نفسها منها كما هي الآن. */

const CART_EVENT = 'gc-cart';

/** سلّة الحساب كما هي في التخزين الآن — أو سلّةٌ فارغة بمعرّفٍ جديد. */
const storedCart = () => readCart(currentUserId()) ?? normalCart({});

/** يحفظ السلّة على الجهاز، ويُعيد رسم عددها على زرّ «اطلب»، ويُخبر الشاشة المعروضة. */
function save(cart) {
  writeCart(currentUserId(), cart);
  paintCartBadge();
  window.dispatchEvent(new Event(CART_EVENT));
}

/**
 * يغيّر السلّة كما هي في التخزين الآن ويحفظها. والسلّة التي فرغت تأخذ
 * معرّفاً جديداً: ما يُضاف بعدها طلبٌ آخر، لا إعادةٌ لما كان فيها.
 */
function editCart(change) {
  const cart = storedCart();
  change(cart);
  if (!cart.lines.length) cart.id = normalCart({}).id;
  save(cart);
  return cart;
}

/**
 * السلّة كما تُعرض: ما أُوقف من موادّها أو حُذف منذ أُضيف يسقط، ونوعٌ لم
 * يعد الحساب يملكه يصير ما يملكه، ومنزلٌ أُزيل يُترك.
 */
function shownCart(cart, data, items) {
  const types = typesOf();
  /* والطقم يبقى ما دام على الموقع ويُطلب الإخراج — ولو صار الطلب إدخالاً: يُعلَّم ولا يُحذف. */
  const kits = new Set(types.includes('out') ? (data.kits ?? []).map((k) => k.id) : []);
  return {
    ...cart,
    lines: cart.lines.filter((l) => (l.kit_id ? kits.has(l.kit_id) : items.has(l.item_id))),
    type: types.includes(cart.type) ? cart.type : types[0] ?? 'out',
    house_id: data.houses.some((x) => x.id === cart.house_id) ? cart.house_id : null,
  };
}

/** سلّة الحساب حين تُفتح الشاشة، كما تُعرض — وما تغيّر منها يُحفظ. */
function loadCart(data, items) {
  const stored = readCart(currentUserId());
  const fixed = shownCart(stored ?? normalCart({}), data, items);
  if (stored && (fixed.lines.length !== stored.lines.length || fixed.type !== stored.type || fixed.house_id !== stored.house_id)) save(fixed);
  return fixed;
}

const qtyOf = (cart, itemId) => cart.lines.find((l) => !l.kit_id && l.item_id === itemId)?.qty ?? 0;
/** عدد الطقم في السلّة، أو صفر. */
const kitQtyOf = (cart, kitId) => cart.lines.find((l) => l.kit_id === kitId)?.qty ?? 0;

/**
 * يضع كمية المادة في السلّة — عدداً، أو دالّةً من كميتها فيها الآن («+»
 * و«−» على ما في السلّة) — وصفرٌ أو أقلّ يُزيلها. والكمية بثلاث مراتب عشرية
 * كما تُعرض.
 */
function setQty(itemId, qty) {
  return editCart((cart) => {
    const at = cart.lines.findIndex((l) => !l.kit_id && l.item_id === itemId);
    const want = typeof qty === 'function' ? qty(at >= 0 ? cart.lines[at].qty : 0) : qty;
    const q = Math.round((Number(want) || 0) * 1000) / 1000;
    if (q <= 0) {
      if (at >= 0) cart.lines.splice(at, 1);
    } else if (at >= 0) cart.lines[at].qty = q;
    else cart.lines.push({ item_id: itemId, qty: q });
  });
}

/**
 * عدد الطقم في السلّة — عدداً، أو دالّةً من عدده فيها الآن — صحيحاً من صفر إلى
 * ٩٩٩: «−» إلى الصفر يُزيله. والطقم الحادي والعشرون لا يُضاف: يُقال لماذا.
 */
function setKitQty(kitId, qty) {
  let full = false;
  const cart = editCart((cart) => {
    const at = cart.lines.findIndex((l) => l.kit_id === kitId);
    const want = typeof qty === 'function' ? qty(at >= 0 ? cart.lines[at].qty : 0) : qty;
    const n = Math.min(KIT_QTY_MAX, Math.max(0, Math.round(Number(want) || 0)));
    if (!n) {
      if (at >= 0) cart.lines.splice(at, 1);
    } else if (at >= 0) cart.lines[at].qty = n;
    else if (cart.lines.filter((l) => l.kit_id).length >= KIT_CART_MAX) full = true;
    else cart.lines.push({ kit_id: kitId, qty: n });
  });
  if (full) toast('السلة عشرون طقماً على الأكثر — أرسلها ثم اطلب الباقي', 'error');
  return cart;
}

/**
 * بعد الإرسال: يخرج من السلّة ما أُرسل كما أُرسل. وما أُضيف إليها أو عُدّل
 * بعد الضغط على «إرسال» — من القائمة، والطلب في الطريق — يبقى فيها طلباً
 * آخر بمعرّفٍ جديد. وسلّةٌ صارت طلباً آخر لا تُمسّ. والطقم سطرٌ غير المادة.
 */
function settleCart(id, sent) {
  const now = readCart(currentUserId());
  if (!now || now.id !== id) return;
  const left = now.lines.filter((l) => !sent.some((x) => (x.kit_id ?? 0) === (l.kit_id ?? 0)
    && (x.item_id ?? 0) === (l.item_id ?? 0) && x.qty === l.qty));
  save({ ...normalCart({}), lines: left });
}

/**
 * الكمية مكتوبةً: أي كمية موجبة، والكسر مقبول كما في نموذج الطلب. وصفرٌ
 * يُزيل المادة من السلّة.
 */
function askQty(it, current, done, { whole = false } = {}) {
  /* الطقم بعددٍ صحيح: خطوة واحد، وأرقامٌ بلا فاصلة على لوحة الهاتف. */
  const input = h('input', whole
    ? { type: 'number', min: '0', max: String(KIT_QTY_MAX), step: '1', inputmode: 'numeric', placeholder: '0', value: current ? String(current) : '' }
    : { type: 'number', min: '0', step: 'any', inputmode: 'decimal', placeholder: '0', value: current ? String(current) : '' });
  const error = h('div', { class: 'form-error', hidden: true });
  let close = () => {};
  const ok = () => {
    const raw = input.value.trim();
    const value = Number(raw);
    if (!raw || !Number.isFinite(value) || value < 0) {
      error.textContent = tx('اكتب الكمية');
      error.hidden = false;
      input.focus();
      return;
    }
    if (whole && value !== 0 && !wholeKits(value)) {
      error.textContent = tx('اكتب عدداً صحيحاً');
      error.hidden = false;
      input.focus();
      return;
    }
    close();
    done(value);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    ok();
  });
  ({ close } = modal({
    title: it.name,
    body: h('div', { class: 'form-grid' },
      field('الكمية', h('div', { class: 'p-qty-in' }, input, it.unit ? h('span', {}, it.unit) : null), 'اكتب 0 لإزالتها من السلة'),
      error),
    footer: (closeFn) => [
      h('button', { class: 'btn', type: 'button', onclick: closeFn }, 'إلغاء'),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: ok }, icon('check', 16), 'حفظ'),
    ],
  }));
  setTimeout(() => input.select(), 60);
}

/**
 * «أضف» أو [− الكمية +] للمادة. qtyNow كميتها في السلّة كما تعرضها الشاشة،
 * وpaint يرسمها إن تغيّرت — تناديه الشاشة لكل تغييرٍ في السلّة (CART_EVENT)،
 * وما لم يتغيّر لا يُعاد رسمه فيبقى المؤشّر على زرّه. ومن ضغط «أضف» يجد «+»
 * حيث ضغط. والضغط على الكمية يفتح خانةً تُكتب فيها (askQty).
 */
function qtyControl(it, qtyNow) {
  const node = h('div', { class: 'pmi-act' });
  let shown = null;
  const change = (qty, focus) => {
    const had = node.contains(document.activeElement);
    setQty(it.id, qty);
    if (had && node.isConnected) (node.querySelector(focus) ?? node.querySelector('button'))?.focus();
  };
  const paint = () => {
    const q = qtyNow();
    if (q === shown) return;
    shown = q;
    const last = q - 1 <= 0;
    clear(node).append(q
      ? h('div', { class: 'p-step', role: 'group', 'aria-label': it.name },
          h('button', {
            type: 'button', class: `ps-minus${last ? ' danger' : ''}`, title: last ? 'أزل من السلة' : 'أنقص',
            onclick: () => change((n) => n - 1, '.ps-minus'),
          }, icon(last ? 'trash' : 'minus', 17)),
          h('button', { type: 'button', class: 'ps-qty', title: 'اكتب الكمية', onclick: () => askQty(it, q, (v) => change(v, '.ps-qty')) },
            num(q)),
          h('button', { type: 'button', class: 'ps-plus', title: 'زد', onclick: () => change((n) => n + 1, '.ps-plus') }, icon('plus', 17)))
      : h('button', { type: 'button', class: 'pmi-add', onclick: () => change((n) => n + 1, '.ps-plus') }, icon('plus', 16), 'أضف'));
  };
  paint();
  return { node, paint };
}

/**
 * «أضف» أو [− العدد +] للطقم — كأزرار المادة، والعدد صحيحٌ: «+» و«−» بواحد، وما
 * يُكتب كسراً يُردّ (askQty). qtyNow عدده في السلّة كما تعرضها الشاشة.
 */
function kitControl(kit, qtyNow) {
  const node = h('div', { class: 'pmi-act' });
  let shown = null;
  const change = (qty, focus) => {
    const had = node.contains(document.activeElement);
    setKitQty(kit.id, qty);
    if (had && node.isConnected) (node.querySelector(focus) ?? node.querySelector('button'))?.focus();
  };
  const paint = () => {
    const q = qtyNow();
    if (q === shown) return;
    shown = q;
    const last = q - 1 <= 0;
    clear(node).append(q
      ? h('div', { class: 'p-step', role: 'group', 'aria-label': kit.name },
          h('button', {
            type: 'button', class: `ps-minus${last ? ' danger' : ''}`, title: last ? 'أزل من السلة' : 'أنقص',
            onclick: () => change((n) => n - 1, '.ps-minus'),
          }, icon(last ? 'trash' : 'minus', 17)),
          h('button', {
            type: 'button', class: 'ps-qty', title: 'اكتب العدد',
            onclick: () => askQty({ name: kit.name, unit: 'طقم' }, q, (v) => change(v, '.ps-qty'), { whole: true }),
          }, num(q)),
          h('button', { type: 'button', class: 'ps-plus', title: 'زد', onclick: () => change((n) => n + 1, '.ps-plus') }, icon('plus', 17)))
      : h('button', { type: 'button', class: 'pmi-add', onclick: () => change((n) => n + 1, '.ps-plus') }, icon('plus', 16), 'أضف'));
  };
  paint();
  return { node, paint };
}

/** أيقونة الطقم بلونه، واسمه، وعدد موادّه — بلا رصيد. */
function kitFace(kit) {
  return [
    h('span', { class: 'pmi-ico' }, icon(kit.icon || 'kit', 20)),
    h('div', { class: 'pmi-main' },
      h('div', { class: 'pmi-name' }, kit.name),
      h('div', { class: 'pmi-meta' }, h('span', { class: 'pmi-unit' }, num(kit.lines.length), ' ', h('span', {}, 'مادة')))),
  ];
}

/**
 * «ما بداخله»: موادّ الطقم وكمية كلٍّ لطقمٍ واحد — تعريفٌ لا رصيد. و«أضف» إن لم
 * يكن في السلّة بعد.
 */
function kitInside(kit, inCart, add) {
  modal({
    title: kit.name,
    body: h('div', { class: 'form-grid p-kit-contents' },
      h('div', { class: 'small muted' }, 'الكمية لطقمٍ واحد'),
      h('ul', { class: 'p-kit-list' }, ...kit.lines.map((l) => h('li', {},
        h('span', { class: 'pkl-name' }, l.name), h('b', { class: 'pkl-qty' }, ...amount(l.qty, l.unit))))),
      kit.notes ? h('div', { class: 'info-box' }, icon('info', 16), h('span', { translate: 'no' }, kit.notes)) : null),
    footer: (close) => [
      h('button', { class: 'btn', type: 'button', onclick: close }, 'إغلاق'),
      !inCart() && add
        ? h('button', { class: 'btn btn-op', 'data-op': 'out', type: 'button', onclick: () => { close(); add(); } }, icon('plus', 16), 'أضف')
        : null,
    ],
  });
}

/** أيقونة المادة بلون قسمها، واسمها، ووحدتها ورمزها — بلا رصيد. */
function itemFace(it, sec) {
  return [
    h('span', { class: 'pmi-ico' }, icon(sec?.icon ?? 'box', 20)),
    h('div', { class: 'pmi-main' },
      h('div', { class: 'pmi-name' }, it.name),
      h('div', { class: 'pmi-meta' },
        it.unit ? h('span', { class: 'pmi-unit' }, it.unit) : null,
        it.sku ? h('span', { class: 'pmi-sku ltr', translate: 'no' }, it.sku) : null)),
  ];
}

/* ============================== القائمة ============================== */

/* حدّ الشاشة: خمسمئة سطر — وما بعدها يُبحث عنه. */
const LIMIT = 500;

export async function menu({ content, route }) {
  const types = typesOf();
  const canOrder = types.length > 0;
  const view = { q: '', section: sectionKey(route.query?.section) };
  const head = h('div', { class: 'page-head p-menu-head' },
    h('div', {}, h('h2', {}, canOrder ? 'اطلب مواد' : 'المواد'),
      h('p', {}, canOrder ? 'أضف المواد إلى السلة، ثم أرسلها طلباً إلى المدير' : 'المواد بأقسامها كما رفعها الحاسوب الرئيسي')));
  const body = h('div', { class: 'p-menu' }, loadingState(6));
  content.append(head, body);
  /* يرسم القائمة من السلّة كما هي الآن: كل رسمٍ للقائمة (refresh) يضع ما يخصّه. */
  let sync = () => {};
  const onCart = () => { if (content.isConnected) sync(); };

  async function refresh(force = false) {
    const data = await loadData(force);
    if (!content.isConnected) return;
    const { pool, groups, byId, secOf, kits } = catalog(data);
    let cart = loadCart(data, byId);
    /* أسطر القائمة المعروضة بأزرارها: تُرسم منها حين تتغيّر السلّة. والأطقم وحدها. */
    const live = [];
    const liveKits = [];
    const withKits = canOrder && kits.length > 0;
    if (view.section === KITS ? !withKits : view.section !== null && !groups?.some((g) => g.key === view.section)) view.section = null;

    const search = h('input', {
      type: 'search', placeholder: 'ابحث باسم المادة أو رمزها…', value: view.q, autocomplete: 'off',
      oninput: debounce((e) => { view.q = e.target.value; paintList(); }, 150),
    });
    const chips = groups || withKits ? h('div', { class: 'p-menu-chips' }) : null;
    const top = h('div', { class: 'p-menu-top' },
      h('label', { class: 'p-menu-search' }, icon('search', 18), search), chips);
    const listBox = h('div', { class: 'p-menu-list' });
    const bar = h('a', { class: 'p-cart-bar', href: '#/cart', hidden: true });
    clear(body).append(
      canOrder ? null : h('div', { class: 'info-box', style: 'margin-bottom:12px' }, icon('eye', 18),
        h('div', {}, h('b', {}, 'حسابك للاطّلاع'),
          h('div', { class: 'small' }, 'ترى المواد بأقسامها. ولطلب الإدخال أو الإخراج اطلب الصلاحية من المدير.'))),
      top, listBox, bar);

    /* القسم المختار: يُبقيه العنوان (فتعود إليه إعادة الفتح)، ويُرى زرّه. */
    function pick(key) {
      view.section = key;
      const at = groups?.find((g) => g.key === key);
      history.replaceState(null, '', key === KITS ? `#/menu?section=${KITS}` : at ? `#/menu?section=${sectionParam(at)}` : '#/menu');
      paintChips();
      paintList();
      /* القائمة من أوّلها تحت الشريط الملتصق — إن كانت قد مُرِّرت تحته. */
      const offset = (document.querySelector('.p-top')?.offsetHeight ?? 60) + top.offsetHeight;
      const y = listBox.getBoundingClientRect().top;
      if (y < offset) window.scrollTo({ top: Math.max(0, y + window.scrollY - offset - 8), behavior: 'smooth' });
    }

    function paintChips() {
      if (!chips) return;
      const chip = (g) => {
        const on = (g?.key ?? null) === view.section;
        return h('button', {
          type: 'button', class: `chip p-menu-chip${g ? ' p-sec-chip' : ''}${on ? ' on' : ''}`, 'aria-pressed': String(on),
          'data-section': g ? sectionParam(g) : '', style: g ? `--sc:${sectionColor(g)}` : null,
          onclick: () => pick(g ? g.key : null),
        }, icon(g ? g.icon : 'grid', 15), g ? g.name : 'الكل');
      };
      /* «أطقم جاهزة» بعد «الكل» وقبل الأقسام. */
      const kitChip = withKits
        ? h('button', {
            type: 'button', class: `chip p-menu-chip p-kit-chip${view.section === KITS ? ' on' : ''}`,
            'aria-pressed': String(view.section === KITS), 'data-section': KITS, onclick: () => pick(KITS),
          }, icon('kit', 15), 'أطقم جاهزة')
        : null;
      clear(chips).append(chip(null), kitChip, ...(groups ?? []).map(chip));
      /* زرّ القسم المختار في الشاشة — وإن كان آخر الصفّ على هاتفٍ ضيّق. */
      const on = chips.querySelector('.chip.on');
      if (on && chips.scrollWidth > chips.clientWidth) {
        chips.scrollLeft += on.getBoundingClientRect().left - chips.getBoundingClientRect().left
          - (chips.clientWidth - on.offsetWidth) / 2;
      }
    }

    function itemRow(it) {
      const sec = secOf.get(it.id);
      const row = h('div', {
        class: `p-menu-item${qtyOf(cart, it.id) ? ' in-cart' : ''}`, 'data-item': it.id,
        style: sec ? `--sc:${sectionColor(sec)}` : null,
      }, ...itemFace(it, sec));
      if (canOrder) {
        const ctl = qtyControl(it, () => qtyOf(cart, it.id));
        row.append(ctl.node);
        live.push({ it, row, ctl });
      }
      return row;
    }

    /* بطاقة الطقم: لا p-menu-item ولا data-item — أسطر المواد تبقى موادَّ وحدها. */
    function kitRow(kit) {
      const row = h('div', {
        class: `p-kit-item${kitQtyOf(cart, kit.id) ? ' in-cart' : ''}`, 'data-kit': kit.id,
        style: `--sc:${kit.color || 'var(--op-out)'}`,
      }, ...kitFace(kit),
      h('button', {
        type: 'button', class: 'p-kit-inside',
        onclick: () => kitInside(kit, () => kitQtyOf(cart, kit.id) > 0, canOrder ? () => setKitQty(kit.id, 1) : null),
      }, icon('list', 15), 'ما بداخله'));
      if (canOrder) {
        const ctl = kitControl(kit, () => kitQtyOf(cart, kit.id));
        row.append(ctl.node);
        liveKits.push({ kit, row, ctl });
      }
      return row;
    }

    function paintList() {
      const q = fold(view.q);
      const match = (i) => !q || fold(`${i.name} ${i.sku}`).includes(q);
      /* الطقم يُجد باسمه أو باسم مادةٍ فيه. */
      const kitMatch = (k) => !q || fold(k.name).includes(q) || k.lines.some((l) => fold(l.name).includes(q));
      let budget = LIMIT;
      let beyond = 0;
      const rowsOf = (items) => {
        const part = items.slice(0, Math.max(0, budget));
        budget -= part.length;
        beyond += items.length - part.length;
        return part.map(itemRow);
      };
      clear(listBox);
      live.length = 0;
      liveKits.length = 0;
      /* الأطقم أوّلاً: في «الكل» وفي قسمها — وما طابق البحث منها. */
      const kitList = withKits && (view.section === null || view.section === KITS) ? kits.filter(kitMatch) : [];
      if (kitList.length || (view.section === KITS && !q)) {
        listBox.append(h('section', { class: 'p-menu-sec p-menu-kits', 'data-section': KITS, style: '--sc:var(--op-out)' },
          h('h3', { class: 'p-menu-sec-head' }, h('span', { class: 'p-sec-ico' }, icon('kit', 18)), h('span', {}, 'أطقم جاهزة')),
          kitList.length
            ? h('div', { class: 'p-menu-items' }, ...kitList.map(kitRow))
            : h('div', { class: 'p-menu-none' }, 'لا أطقم بهذا الاسم')));
      }
      if (view.section === KITS) {
        if (q && !kitList.length) listBox.append(nothing(q));
      } else if (!groups) {
        const list = pool.filter(match).sort(byName);
        if (list.length) listBox.append(h('div', { class: 'p-menu-items' }, ...rowsOf(list)));
        else if (!kitList.length) listBox.append(nothing(q));
      } else {
        /* «الكل»: كل قسمٍ فيه ما يُطلب، بعنوانه. والقسم المختار وحده: ولو خلا. */
        const shown = groups
          .filter((g) => view.section === null || g.key === view.section)
          .map((g) => ({ ...g, items: g.items.filter(match).sort(byName) }))
          .filter((g) => g.items.length || (view.section !== null && !q));
        for (const g of shown) {
          listBox.append(h('section', { class: 'p-menu-sec', 'data-section': sectionParam(g), style: `--sc:${sectionColor(g)}` },
            h('h3', { class: 'p-menu-sec-head' }, h('span', { class: 'p-sec-ico' }, icon(g.icon, 18)), h('span', {}, g.name)),
            g.items.length
              ? h('div', { class: 'p-menu-items' }, ...rowsOf(g.items))
              : h('div', { class: 'p-menu-none' }, 'لا مواد في هذا القسم بعد')));
        }
        if (!shown.length && !kitList.length) listBox.append(nothing(q));
      }
      if (beyond) listBox.append(h('div', { class: 'hint p-menu-more' }, 'ابحث لترى ما بعدها'));
    }

    /* لا مادة بما كُتب: يُبحث في كل الأقسام إن كان قسمٌ مختاراً، ومن يطلب
       الإدخال يطلبها مادةً جديدة من نموذجه (request.js). */
    function nothing(q) {
      const acts = [
        view.section !== null
          ? h('button', { type: 'button', class: 'btn', onclick: () => pick(null) }, icon('search', 16), 'ابحث في كل الأقسام')
          : null,
        q && canRequest('in')
          ? h('a', { class: 'btn btn-op', 'data-op': 'in', href: '#/new/in' }, icon('plus', 16), 'اطلبها مادةً جديدة')
          : null,
      ].filter(Boolean);
      return h('div', { class: 'card' }, emptyState(q ? 'لا مادة بهذا الاسم' : 'لا مواد', null,
        acts.length ? h('div', { class: 'p-menu-acts' }, ...acts) : null, 'box'));
    }

    /* شريط السلّة فوق الشريط السفلي: كم مادةً فيها، ومتابعة الطلب. */
    function paintBar() {
      const n = canOrder ? cart.lines.length : 0;
      body.classList.toggle('has-cart', n > 0);
      bar.hidden = !n;
      clear(bar);
      if (!n) return;
      bar.append(
        h('span', { class: 'pcb-ico' }, icon('cart', 21), h('b', {}, num(n))),
        h('span', { class: 'pcb-main' }, h('b', {}, 'السلة'), h('small', {}, `${num(n)} مادة`)),
        h('span', { class: 'pcb-go' }, h('span', {}, 'متابعة الطلب'), icon('arrowLeft', 18)));
    }

    /* السلّة تغيّرت — من هذه القائمة، أو من غيرها: إرسالٌ تمّ من سلّةٍ تُركت،
       أو نافذة كميةٍ من رسمٍ سابق. */
    sync = () => {
      cart = shownCart(storedCart(), data, byId);
      for (const { it, row, ctl } of live) {
        ctl.paint();
        row.classList.toggle('in-cart', qtyOf(cart, it.id) > 0);
      }
      for (const { kit, row, ctl } of liveKits) {
        ctl.paint();
        row.classList.toggle('in-cart', kitQtyOf(cart, kit.id) > 0);
      }
      paintBar();
    };

    paintChips();
    paintList();
    paintBar();
    /* من رئيسية الطالب على طقمٍ بعينه: يُمرَّر إليه ويُضاء لحظة. */
    const wanted = Number(route.query?.kit) || 0;
    if (wanted && !view.shownKit) {
      view.shownKit = true;
      const card = listBox.querySelector(`[data-kit="${wanted}"]`);
      if (card) {
        card.classList.add('p-kit-hit');
        setTimeout(() => card.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60);
        setTimeout(() => card.classList.remove('p-kit-hit'), 2600);
      }
    }
  }

  /* «تحديث» والعودة إلى الصفحة: إن تعذّر (الهاتف بلا شبكة) يبقى ما عُرض،
     ويُقال السبب. */
  async function reload() {
    try {
      await refresh(true);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  await refresh();
  window.addEventListener(CART_EVENT, onCart);
  return { refresh: reload, cleanup: () => window.removeEventListener(CART_EVENT, onCart) };
}

/* ============================== السلّة ============================== */

export async function cart({ content }) {
  const types = typesOf();
  const head = h('div', { class: 'page-head' },
    h('div', {}, h('h2', {}, 'السلة'), h('p', {}, 'راجع المواد واختر وجهتها، ثم أرسلها طلباً إلى المدير')));
  content.append(head);
  if (!types.length) {
    content.append(h('div', { class: 'card' }, emptyState('لا تملك صلاحية الطلب', 'اطلبها من المدير.',
      h('a', { class: 'btn', href: '#/menu' }, icon('layers', 16), 'المواد'), 'lock')));
    return null;
  }
  const body = h('div', {}, loadingState(4));
  content.append(body);
  /* الوجهة والمخزن كما هما الآن في السحابة — كما يُفتح نموذج الطلب. */
  const data = await loadData(true);
  if (!content.isConnected) return null;
  if (!data.warehouses.length) {
    clear(body).append(h('div', { class: 'card' }, h('div', { class: 'empty' }, h('b', {}, 'لا مخزن في السحابة بعد'),
      'يُرفع من الحاسوب الرئيسي حين يتّصل.')));
    return null;
  }
  const { byId, secOf, kitById } = catalog(data);
  /* السلّة كما تعرضها الشاشة: تُقرأ من التخزين كلما تغيّرت (sync). */
  let c = loadCart(data, byId);
  let sending = false;

  /* المخزن: ما يعمل منه الموظف إن اختاره من قبل (القسم أو الطلب)، وإلا الأول. */
  let wh = '';
  try { wh = localStorage.getItem(WH_KEY) ?? ''; } catch { /* لا تخزين */ }
  if (!data.warehouses.some((w) => String(w.id) === wh)) wh = String(data.warehouses[0].id);

  /* ما جُهّز به المنزل في الإخراج: يُعلَّم في سطره، ويُسأل عنه عند الإرسال. */
  const supply = houseSupply({
    houseOf: () => c.house_id,
    active: () => c.type === 'out',
    alive: () => content.isConnected,
    onChange: () => paintLines(),
  });

  /* ------------------------------ المواد ------------------------------ */

  const count = h('span', { class: 'sub' });
  const linesBox = h('div', { class: 'p-cart-lines' });
  const controls = new Map();   // المادة ← أزرار كميتها في سطرها
  const linesCard = h('div', { class: 'card p-cart-card' },
    h('div', { class: 'card-head' }, h('h3', {}, icon('cart', 18), 'المواد في السلة'), count),
    linesBox,
    h('div', { class: 'card-foot' }, h('a', { class: 'btn btn-ghost p-cart-more', href: '#/menu' }, icon('plus', 16), 'أضف مواد أخرى')));

  /* سطر الطقم: وجهه وعدده، و«ما بداخله» — وفي الإخراج إلى منزل: كم من موادّه جُهّز
     بها قبلاً. وفي طلب الإدخال يبقى في السلّة باهتاً «للإخراج وحده». */
  function kitLine(line) {
    const kit = kitById.get(line.kit_id);
    const ctl = kitControl(kit, () => kitQtyOf(c, kit.id));
    controls.set(`k${kit.id}`, ctl);
    const out = c.type === 'out';
    const before = out ? kit.lines.filter((l) => supply.priorOf(l.item_id)).length : 0;
    return h('div', {
      class: `p-cart-line p-cart-kit${before ? ' p-resupply' : ''}${out ? '' : ' p-kit-off'}`, 'data-kit': kit.id,
      style: `--sc:${kit.color || 'var(--op-out)'}`,
    },
    ...kitFace(kit),
    ctl.node,
    h('button', {
      type: 'button', class: 'icon-btn danger p-cart-remove', title: 'أزل من السلة',
      onclick: () => setKitQty(kit.id, 0),
    }, icon('trash', 17)),
    h('div', { class: 'p-cart-kit-foot' },
      h('button', { type: 'button', class: 'p-kit-inside', onclick: () => kitInside(kit, () => true, null) }, icon('list', 15), 'ما بداخله'),
      out ? null : h('span', { class: 'p-kit-only' }, 'للإخراج وحده')),
    before && c.house_id
      ? h('div', { class: 'p-cart-prior' }, h('span', { class: 'prior-chip' }, icon('history', 13),
          h('span', {}, `سبق تجهيز ${num(before)} من موادّه لهذا المنزل`)))
      : null);
  }

  function lineRow(line) {
    if (line.kit_id) return kitLine(line);
    const it = byId.get(line.item_id);
    const sec = secOf.get(it.id);
    const prior = supply.priorOf(it.id);
    const ctl = qtyControl(it, () => qtyOf(c, it.id));
    controls.set(it.id, ctl);
    return h('div', {
      class: `p-cart-line${prior ? ' p-resupply' : ''}`, 'data-item': it.id, style: sec ? `--sc:${sectionColor(sec)}` : null,
    },
    ...itemFace(it, sec),
    ctl.node,
    h('button', {
      type: 'button', class: 'icon-btn danger p-cart-remove', title: 'أزل من السلة',
      onclick: () => setQty(it.id, 0),
    }, icon('trash', 17)),
    prior ? h('div', { class: 'p-cart-prior' }, priorChip(prior, it.unit)) : null);
  }

  function paintLines() {
    controls.clear();
    if (!c.lines.length) {
      clear(body).append(h('div', { class: 'card' }, emptyState('السلة فارغة', 'أضف المواد من قائمة الطلبات، ثم أرسلها من هنا.',
        h('a', { class: 'btn btn-primary', href: '#/menu' }, icon('layers', 16), 'تصفّح المواد'), 'cart')));
      return;
    }
    clear(linesBox).append(...c.lines.filter((l) => (l.kit_id ? kitById.has(l.kit_id) : byId.has(l.item_id))).map(lineRow));
    count.textContent = `${num(c.lines.length)} مادة`;
    paintSend();
  }

  /* ------------------------------ الطلب ------------------------------ */

  const typeSeg = types.length > 1
    ? segmented(types.map((type) => ({ value: type, label: requestTitle(type), icon: OPS[type].icon, op: type })), c.type, (type) => {
        editCart((cart) => { cart.type = type; });
        /* الإخراج إلى منزل: يُسأل عمّا جُهّز به إن كان مختاراً. */
        supply.load();
        paintLines();
      })
    : null;
  const whSel = data.warehouses.length > 1
    ? select('warehouse', data.warehouses.map((w) => ({ value: w.id, label: w.name })), wh, {
        onchange: (e) => {
          wh = e.target.value;
          try { localStorage.setItem(WH_KEY, wh); } catch { /* لا تخزين */ }
        },
      })
    : null;
  const housePick = housePicker({
    houses: data.houses,
    value: c.house_id,
    onChange: (id) => { editCart((cart) => { cart.house_id = id; }); supply.load(); },
  });
  const houseBox = h('div', { class: 'p-cart-house' }, housePick.node);
  const notes = h('textarea', {
    placeholder: 'ما يحتاج المدير أن يعرفه عن هذا الطلب', rows: 3,
    oninput: (e) => editCart((cart) => { cart.notes = e.target.value; }),
  }, c.notes);
  const need = h('div', { class: 'p-cart-need' }, icon('map', 15), 'اختر وجهة الإخراج');
  /* أطقمٌ في طلب إدخال: تبقى في السلّة، والإرسال ممنوعٌ حتى يُختار الإخراج أو تُزال. */
  const kitIn = h('div', { class: 'p-cart-kitin' }, icon('kit', 15),
    'الأطقم الجاهزة تُطلب للإخراج وحده — اختر «طلب إخراج» أو أزلها');
  const again = h('div', { class: 'p-cart-again' });
  const error = h('div', { class: 'form-error', hidden: true });
  const sendBtn = h('button', { class: 'btn btn-op btn-lg btn-block p-cart-send-btn', type: 'button', onclick: send });
  const details = h('div', { class: 'card p-cart-send', 'data-op': c.type },
    h('div', { class: 'card-head' }, h('h3', {}, icon('file', 18), 'تفاصيل الطلب')),
    h('div', { class: 'card-body form-grid' },
      typeSeg ? h('div', { class: 'p-cart-type' }, typeSeg.node) : null,
      /* مخزنٌ واحد: يُذكر ولا يُختار. */
      whSel ? field('المخزن', whSel)
        : h('div', { class: 'p-cart-wh' }, icon('warehouse', 16), h('span', {}, 'المخزن:'), ' ',
          h('b', {}, data.warehouses[0].name)),

      houseBox,
      field('ملاحظات للمدير', notes),
      h('div', { class: 'stale-note p-cart-pc' }, icon('info', 15), pcOnline()
        ? 'الحاسوب الرئيسي متصل — ما تطلبه يصله خلال ثوانٍ.'
        : 'الحاسوب الرئيسي غير متصل الآن — طلبك يُحفظ ويصله حين يُفتح.'),
      need, kitIn, again, error, sendBtn));
  const page = h('div', { class: 'p-cart' }, linesCard, details);

  function paintSend() {
    const out = c.type === 'out';
    const kitsIn = !out && c.lines.some((l) => l.kit_id);
    details.dataset.op = c.type;
    houseBox.hidden = !out;
    need.hidden = !out || Boolean(c.house_id);
    kitIn.hidden = !kitsIn;
    /* ما جُهّز به المنزل: المواد عدداً، والأطقم التي فيها شيءٌ منه عدداً وحدها. */
    const marked = out ? c.lines.filter((l) => !l.kit_id && supply.priorOf(l.item_id)).length : 0;
    const kitsMarked = out ? c.lines.filter((l) => l.kit_id && kitById.get(l.kit_id)?.lines.some((x) => supply.priorOf(x.item_id))).length : 0;
    clear(again).append(...(marked || kitsMarked ? [icon('history', 15),
      marked ? h('span', {}, `${num(marked)} مادة جُهّزت لهذا المنزل سابقاً`) : null,
      marked && kitsMarked ? ' · ' : null,
      kitsMarked ? h('span', {}, `${num(kitsMarked)} طقم فيه مواد جُهّزت لهذا المنزل سابقاً`) : null] : []));
    again.hidden = !(marked || kitsMarked);
    clear(sendBtn).append(icon('send', 19), isDirect(c.type) ? 'إرسال للتسجيل' : 'إرسال الطلب');
    sendBtn.disabled = sending || !c.lines.length || (out && !c.house_id) || kitsIn;
    /* ما يُرسل الآن لا يُعدَّل تحته — موادّه ولا نوعه ولا منزله: المنزل الذي
       سُئل عمّا جُهّز به هو الذي يُرسل إليه (send.js). */
    page.inert = sending;
  }

  /* السلّة تغيّرت — من هذه الشاشة، أو من غيرها: إرسالٌ تمّ من سلّةٍ تُركت
     يُخرج منها ما أُرسل. وما يُرسل من هنا يُرسم حين ينتهي. */
  function sync() {
    if (sending || !content.isConnected) return;
    const next = shownCart(storedCart(), data, byId);
    /* صارت طلباً آخر — بنوعه ووجهته وملاحظاته: تُفتح من جديد. */
    if (next.lines.length && next.id !== c.id) return go('#/cart');
    const keyOf = (l) => (l.kit_id ? `k${l.kit_id}` : `i${l.item_id}`);
    const same = next.lines.map(keyOf).join() === c.lines.map(keyOf).join() && next.type === c.type;
    c = next;
    if (!same) return paintLines();
    for (const ctl of controls.values()) ctl.paint();
    paintSend();
  }

  async function send() {
    if (sending || !c.lines.length) return;
    if (c.type === 'out' && !c.house_id) return toast('اختر القطاع والمنزل', 'error');
    sending = true;
    error.hidden = true;
    paintSend();
    const sent = c.lines.filter((l) => (l.kit_id ? kitById.has(l.kit_id) && wholeKits(l.qty) : byId.has(l.item_id) && positive(l.qty)));
    const lines = sent.map((l) => {
      if (l.kit_id) {
        /* الطقم بنداً واحداً، ومعه ما رآه صاحبه في داخله لطقمٍ واحد. */
        const kit = kitById.get(l.kit_id);
        return {
          kit_id: kit.id, name: kit.name, unit: 'طقم', qty: l.qty, notes: '',
          contents: kit.lines.map(({ item_id, name, unit, qty }) => ({ item_id, name, unit, qty })),
        };
      }
      const it = byId.get(l.item_id);
      return { item_id: it.id, name: it.name, sku: it.sku, unit: it.unit, qty: l.qty, notes: '' };
    });
    try {
      /* send.js: ما جُهّز به المنزل يُسأل عنه، ثم يُرسل الطلب بمعرّف السلّة. */
      const done = await submitRequest({
        id: c.id, type: c.type, warehouse_id: wh, house_id: c.house_id, date: today(), notes: c.notes, lines,
      }, { supply, houses: data.houses, alive: () => content.isConnected });
      if (!done) {
        /* «لا، راجع الطلب»: تبقى السلّة كما هي لتُراجَع. */
        sending = false;
        sync();
        return;
      }
      /* أُرسلت: يخرج منها ما أُرسل — والتالية طلبٌ جديد بمعرّفٍ جديد — وحاله في «طلباتي». */
      settleCart(c.id, sent);
      if (content.isConnected) go('#/home');
    } catch (err) {
      /* السلّة تبقى بمعرّفها: إعادة الإرسال بعد انقطاع لا تُكرّر الطلب. */
      sending = false;
      sync();
      error.textContent = err.message;
      error.hidden = false;
      toast(err.message, 'error');
    }
  }

  clear(body).append(page);
  paintLines();
  supply.load();
  window.addEventListener(CART_EVENT, sync);
  return { cleanup: () => window.removeEventListener(CART_EVENT, sync) };
}
