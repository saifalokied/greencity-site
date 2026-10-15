/* ============================== إرسال الطلب ==============================
   ما يشترك فيه نموذج «طلب جديد» (request.js) وسلّة الطالب (menu.js): منتقي
   الوجهة — القطاع والمنزل —، وما جُهّز به المنزل من قبل وسؤال «تجهيز مكرر»
   عنه، والطلب نفسه كما يُرسل إلى السحابة. فيُرسل الاثنان طلباً واحداً
   بقواعد واحدة، ولا تُكتب القواعد مرّتين فتفترقا يوماً: من طلب من النموذج
   ومن طلب من السلّة يُسأل السؤال نفسه، ويصل طلبه إلى المدير بالأعمدة نفسها.

   والطلب يحمل معرّفه من المتصفّح، ويبقى مع صاحبه (النموذج أو السلّة) حتى
   يُرسل: إرسالٌ انقطع جوابه ثم أُعيد لا يتكرّر (sb.js).

   والطقم الجاهز (الإصدار الخامس) بندٌ واحد «الطقم × العدد»، ومعه ما رآه صاحب
   الطلب في داخله (contents) لطقمٍ واحد — للعرض، والحاسوب يوسّعه بتعريفه هو.
   وهو للإخراج وحده، وبعددٍ صحيح من ١ إلى ٩٩٩. وما جُهّز به المنزل من موادّه
   يُسأل عنه مع بنود الطلب، كلُّ مادةٍ سطرٌ باسم طقمها.
   ========================================================================== */

import { h, clear, icon, num, toast, modal, fmtDate, today, soleHouse } from '../ui.js';
import { insertRequest, rpc } from './sb.js';
import { isDirect } from './main.js';

/** المخزن الذي يعمل منه الموظف: يختاره في القسم أو الطلب أو السلّة، فيبقى للكل. */
export const WH_KEY = 'gc-portal-wh';
/* أطول ما يُنتظر جواب «ما جُهّز به المنزل» عند الإرسال. */
export const SUPPLY_WAIT = 8 * 1000;

/** الكمية ووحدتها عقدتين: الوحدة («كيس») تُترجم وحدها، و«12 كيس» معاً لا. */
export const amount = (value, unit) => [num(Math.max(0, Number(value) || 0)), unit ? [' ', h('span', {}, unit)] : null];

/* ------------------------------ الأطقم ------------------------------ */

/* الطقم بعددٍ صحيح من ١ إلى ٩٩٩ — قاعدة الحاسوب نفسها (server/kits.js) — وفي السلّة
   عشرون طقماً على الأكثر: عشرون طقماً بمئة مادةٍ لكلٍّ تبقى دون حدّ السحابة. */
export const KIT_QTY_MAX = 999;
export const KIT_CART_MAX = 20;
/* بنود الطلب في السحابة 262144 بايتاً على الأكثر (gc_requests_guard): فوق هذا الحدّ
   يُسقط ما في داخل الأطقم — الحاسوب يوسّعها بتعريفه ولا يحتاجه — وإلا فالطلب كبير. */
export const LINES_MAX_BYTES = 240000;
/** كميةٌ موجبة. */
export const positive = (x) => Number(x) > 0;
/** عدد أطقمٍ صحيح من ١ إلى ٩٩٩. */
export const wholeKits = (x) => Number.isInteger(Number(x)) && Number(x) >= 1 && Number(x) <= KIT_QTY_MAX;

/* --------------------------- ما جُهّز به المنزل ---------------------------
   لكل منزلٍ يُختار: مادةٌ ← ما خرج إليه منها وما أُرجع، وآخر مرة. يُسأل
   عنه مرّة لكل منزل في الطلب الواحد. وإن لم يُجب — الدالّة غائبة في سكربت
   سحابة قديم، أو انقطع الإنترنت — فلا تنبيه، ولا يتعطّل الإرسال لأجله. */

/**
 * ما جُهّز به المنزل المختار — لطلبٍ واحد:
 *   houseOf   المنزل المختار الآن، أو null.
 *   active    هل الطلب إخراج؟ الإدخال لا يُسأل عنه.
 *   alive     هل الشاشة معروضة بعد؟ جوابٌ وصل بعد أن تُركت لا يُرسم.
 *   onChange  تغيّرت التنبيهات: مُحيت لمنزلٍ جديد، أو وصل جوابه.
 * ويُرجع { load, priorOf, ready, covers }: load بعد كل اختيارٍ للمنزل، وpriorOf
 * ما جُهّز به من المادة أو null، وready وعدٌ يتمّ حين يصل آخر جواب، وcovers
 * هل ما يُنبَّه عليه الآن لهذا المنزل في إخراج — به يُعرف أن الطلب لم يتغيّر
 * تحت الإرسال.
 */
export function houseSupply({ houseOf, active = () => true, alive = () => true, onChange = () => {} }) {
  const cache = new Map();   // house_id ← Promise<Map<item_id, prior>>
  let supply = new Map();    // ما جُهّز به supplyHouse
  let supplyHouse = null;
  let ready = Promise.resolve();

  function load() {
    if (!active()) return;
    const house = houseOf();
    if (supplyHouse !== house) {
      /* تنبيهات المنزل السابق تُمحى فوراً، لا حين يصل جواب الجديد. */
      supply = new Map();
      supplyHouse = house;
      onChange();
    }
    if (!house) {
      ready = Promise.resolve();
      return;
    }
    if (!cache.has(house)) {
      cache.set(house, rpc('gc_house_supply', { p_house: house })
        /* ما أُرجع كلّه لا يُنبَّه عليه: لم يبقَ في المنزل منه شيء. */
        .then((list) => new Map((Array.isArray(list) ? list : [])
          .filter((p) => Number(p.net) > 1e-9).map((p) => [Number(p.item_id), p])))
        .catch(() => {
          cache.delete(house);   // يُسأل ثانيةً حين يُختار المنزل من جديد
          return new Map();
        }));
    }
    ready = cache.get(house).then((map) => {
      if (houseOf() !== house || !alive()) return;
      supply = map;
      onChange();
    });
  }

  const priorOf = (itemId) => (active() && itemId && supplyHouse === houseOf()
    ? supply.get(Number(itemId)) ?? null : null);
  const covers = (house) => active() && Boolean(house) && houseOf() === house;

  return { load, priorOf, ready: () => ready, covers };
}

/**
 * شارة التنبيه تحت سطر المادة، أجزاءً تُترجم كلٌّ وحده:
 * «جُهّز لهذا المنزل سابقاً: 12 كيس — آخر مرة 3 أكتوبر 2026».
 */
export function priorChip(prior, unit) {
  return h('div', { class: 'p-prior' }, icon('history', 13),
    h('span', {}, h('span', {}, 'جُهّز لهذا المنزل سابقاً:'), ' ', ...amount(prior.net, unit),
      prior.last_date ? [' — ', h('span', {}, 'آخر مرة'), ' ', fmtDate(prior.last_date)] : null));
}

/**
 * «تجهيز مكرر»: يُسأل مرّة عند الإرسال، بالكلمات نفسها التي يسأل بها
 * البرنامج المدير. والتركيز على «لا»: ضغطةٌ عجلى لا تُرسل بلا قراءة.
 * again أسطر الطلب التي جُهّز بها المنزل، وhouse المنزل نفسه.
 */
export function confirmResupply(again, { house = null, priorOf }) {
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
            /* مادةٌ من طقم: اسمه تحتها — وقد تأتي في طقمين، أو في طقمٍ وبندٍ عادي. */
            l.kit ? h('div', { class: 'small p-again-kit' }, h('span', {}, 'طقم:'), ' ', h('span', { translate: 'no' }, l.kit)) : null,
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

/* ------------------------------ منتقي المنزل ------------------------------ */

/**
 * الوجهة: أزرار القطاعات ومنازل المختار منها تحتها، وخانةٌ تجد المنزل برقمه
 * أو رمزه. والمختار بطاقةٌ بزرّ «تغيير».
 *   houses    منازل السحابة (loadData).
 *   value     المنزل المختار أوّل مرّة، أو null.
 *   onChange  يُنادى بالمنزل حين يُختار، وبـ null حين يُضغط «تغيير».
 * ويُرجع { node, set }: set يضع المنزل من خارجه — مسودّةٌ استُعيدت — بلا onChange.
 */
export function housePicker({ houses, value = null, onChange = () => {} }) {
  const blocks = [];
  for (const x of houses) {
    if (!blocks.some((b) => b.id === x.block_id)) blocks.push({ id: x.block_id, code: x.block_code, color: x.color });
  }
  let current = null;
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
    const x = houses.find((y) => y.id === current);
    clear(chosen).append(x
      ? h('div', { class: 'chosen-house' }, icon('map', 18),
          h('div', { style: 'flex:1' }, h('b', {}, `قطاع ${x.block_code} — منزل ${x.number}`),
            h('div', { class: 'small muted' }, h('span', { class: 'ltr' }, x.code), ` · الإنجاز ${x.progress}%`)),
          h('button', {
            class: 'btn btn-sm btn-ghost', type: 'button',
            onclick: () => { current = null; quick.value = ''; paintGrid(); paintChosen(); onChange(null); },
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
      class: x.id === current ? 'on' : null, 'data-house': x.id,
      onclick: () => { current = x.id; note.hidden = true; paintChosen(); paintGrid(); onChange(x.id); },
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
    current = id;
    const x = houses.find((y) => y.id === id);
    if (x) block = x.block_id;
    paintGrid();
    paintChosen();
  };
  set(value);
  return { node, set };
}

/* ------------------------------ الإرسال ------------------------------ */

/**
 * يُرسل الطلب كما يرسله النموذج والسلّة كلاهما. req:
 *   { id, type, warehouse_id, house_id, date, party, receiver_name, reference, notes, lines }
 * والأسطر بكمياتها كما كُتبت: يُرسل منها ما كميته موجبة.
 *
 * في الإخراج يُنتظر جواب «ما جُهّز به المنزل» ثوانيَ على الأكثر، ثم يُسأل
 * صاحب الطلب مرّة عمّا جُهّز به — و«لا» لا يُرسل شيئاً. ويُرجع true إن
 * أُرسل (أو كان قد وصل من قبل)، وfalse إن عدل عنه أو تُركت الشاشة قبل
 * السؤال. وخطأ الإرسال يُرمى كما هو: المعرّف يبقى مع صاحبه، فإعادة الإرسال
 * بعد انقطاع لا تُكرّر الطلب.
 *
 * وصاحب الطلب يقفل نموذجه ما دام يُرسل: req نسخةٌ يوم ضُغط «إرسال»، وما
 * جُهّز به المنزل يُقرأ للمنزل المختار الآن — فإن اختلفا لم يُسأل عن المنزل
 * الذي يُرسل إليه.
 */
export async function submitRequest(req, { supply, houses = [], alive = () => true }) {
  const { type } = req;
  const filled = req.lines.filter((l) => Number(l.qty) > 0);
  const kits = filled.filter((l) => l.kit_id);
  /* الطقم للإخراج وحده: لا يُرسل شيء — السلّة تمنع الإرسال قبل هذا، والنموذج كذلك. */
  if (kits.length && type !== 'out') throw new Error('الأطقم الجاهزة تُطلب للإخراج وحده');
  /* ما جُهّز به المنزل لكل مادة — بنداً أو في طقم — كما سُئل عنه، وبه يُعلَّم. */
  let priors = new Map();
  const contentsOf = (l) => (Array.isArray(l.contents) ? l.contents : []);
  if (type === 'out') {
    /* السؤال عمّا جُهّز به المنزل ربما لم يصل بعد: يُنتظر، فلا يُرسل
       تجهيزٌ مكرر بلا تنبيه لأن الضغط سبق الجواب. ولا يُنتظر أكثر من
       ثوانٍ: جوابٌ علِق في شبكة الهاتف لا يحبس الطلب — كأنه فشل. */
    await Promise.race([supply.ready(), new Promise((resolve) => { setTimeout(resolve, SUPPLY_WAIT); })]);
    if (!alive()) return false;
    /* تغيّر المنزل أو صار الطلب إدخالاً في أثناء الانتظار: لا يُرسل إلى
       منزلٍ تُرك بلا سؤالٍ عمّا جُهّز به — يُرجَع إلى صاحبه كما «لا». */
    if (!supply.covers(req.house_id)) return false;
    const ids = [...filled.filter((l) => !l.kit_id).map((l) => l.item_id), ...kits.flatMap((l) => contentsOf(l).map((c) => c.item_id))];
    priors = new Map(ids.filter(Boolean).map((id) => [id, supply.priorOf(id)]));
    const priorOf = (itemId) => priors.get(itemId) ?? null;
    /* سطرٌ لكل بندٍ جُهّز به المنزل، ولكل مادةٍ في طقمٍ جُهّز بها — بما يُطلب منها الآن. */
    const again = filled.filter((l) => !l.kit_id && priorOf(l.item_id));
    for (const l of kits) {
      for (const c of contentsOf(l).filter((x) => priorOf(x.item_id))) {
        again.push({ item_id: c.item_id, name: c.name, unit: c.unit, qty: Number(c.qty) * Number(l.qty), kit: l.name });
      }
    }
    const house = houses.find((x) => x.id === req.house_id) ?? null;
    if (again.length && !(await confirmResupply(again, { house, priorOf }))) return false;
  }
  const body = filled.map((l) => {
    if (l.kit_id) {
      /* بند الطقم: بلا مادة ولا قسم — معرّفه وعدده وما في داخله لطقمٍ واحد. وما جُهّز
         به المنزل من موادّه للعلم كذلك. */
      const before = contentsOf(l).map((c) => priors.get(c.item_id)).filter(Boolean);
      return {
        name: l.name, qty: Number(l.qty), notes: l.notes ?? '',
        ...(l.kit_id ? { kit_id: Number(l.kit_id), unit: 'طقم', contents: contentsOf(l).slice(0, 100) } : {}),
        ...(before.length ? { resupply: true, prior_items: before.length } : {}),
      };
    }
    const prior = priors.get(l.item_id) ?? null;
    return {
      item_id: l.item_id ?? null, name: l.name, unit: l.unit ?? '', sku: l.sku ?? '',
      qty: Number(l.qty), notes: l.notes ?? '',
      /* المادة الجديدة في القسم الذي اختاره صاحب الطلب — به يضيفها المدير. */
      ...(l.item_id || l.kit_id ? {} : { category_id: Number(l.category_id) || null }),
      /* للعلم: أُرسل وهو يعلم أن المنزل جُهّز بها. والحاسوب الرئيسي يحسب ذلك بنفسه. */
      ...(prior ? { resupply: true, prior_net: Number(prior.net) || 0, prior_date: prior.last_date ?? '' } : {}),
    };
  });
  /* حدّ السحابة بالبايت (UTF-8): ما في داخل الأطقم يُسقط أوّلاً، فإن بقي كبيراً لا يُرسل شيء. */
  const size = () => encodeURIComponent(JSON.stringify(body)).replace(/%[0-9A-F]{2}/g, '.').length;
  if (size() > LINES_MAX_BYTES) for (const l of body) delete l.contents;
  if (size() > LINES_MAX_BYTES) throw new Error('الطلب كبير جداً — قسّمه طلبين');
  /* insertRequest يُلحق بالطلب معرّف هذا الجهاز، وما وصل يُحفظ في سجلّه
     (sb.js): إليه وحده يعود قراره. وdirect كما كان الحساب يوم أُرسل —
     يُعرض به الطلب حتى تُقرأ السحابة. */
  const fresh = await insertRequest({
    id: req.id,
    type,
    warehouse_id: Number(req.warehouse_id),
    house_id: type === 'out' ? req.house_id : null,
    voucher_date: req.date || today(),
    party: String(req.party ?? '').trim(),
    receiver_name: String(req.receiver_name ?? '').trim(),
    reference: String(req.reference ?? '').trim(),
    notes: String(req.notes ?? '').trim(),
    lines: body,
  }, { direct: isDirect(type) });
  /* المعرّف وصل من قبل — إرسالٌ سابق انقطع جوابه: ما وصل هو الأول، فلا
     يُقال «أُرسل» عن تعديلٍ لم يصل. */
  if (!fresh) toast('أُرسل هذا الطلب مسبقاً', 'info');
  else {
    toast(isDirect(type)
      ? 'أُرسل — يُسجَّل سنداً حين يتّصل الحاسوب الرئيسي'
      : 'أُرسل الطلب إلى المدير', 'success');
  }
  return true;
}
