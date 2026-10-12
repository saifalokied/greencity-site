/* ============================== موقع الموظفين ==============================
   صفحات ثابتة على GitHub Pages تقرأ من السحابة ما رفعه الحاسوب الرئيسي،
   وتكتب إليها شيئاً واحداً: طلب إدخال أو إخراج.

   والسحابة تحمل ما يلزم كتابة الطلب وحده: المواد بأقسامها ووحداتها
   وأرصدتها في كل مخزن، والمخازن، والقطاعات والمنازل — بثوانٍ بعد كل
   تعديل ما دام الحاسوب الرئيسي مفتوحاً. ولذلك تُعرض حالة الحاسوب في
   الأعلى دائماً: «متصل» أو «آخر ظهور قبل ساعتين». والسندات ودفتر الحركة
   لا تخرج من الحاسوب الرئيسي، فلا شاشة لها هنا.

   والأمانات والعمال لمن أعطاه المدير صلاحيتها وحده (can_custody وcan_workers):
   يعمل عليها من هاتفه «كما أفعل باللابتوب» — يسلّم الأمانة ويعيدها ويمدّدها
   ويعدّلها ويطبع تعهّدها، ويضيف العامل ويدوّن الحضور (custody.js وworkers.js).
   وكل فعلٍ عمليةٌ تمرّ بالسحابة إلى الحاسوب كما يمرّ الطلب. ومن لا صلاحية له
   لا يرى لها زرّاً، ورابطها يفتح له الرئيسية، والسحابة لا تُرجع له صفّاً منها.

   والطلب يمرّ بالسحابة ولا يبقى فيها: ينتظر فيها قراره، فإذا قُرِّر
   حُفظ على الهاتف الذي أرسله وحُذف منها (sb.js). فسجلّ طلبات الموظف على
   هاتفه وعلى الحاسوب الرئيسي.

   والحسابات نوعان يحدّدهما المدير: «معتمد» يُسجَّل ما يكتبه سنداً بلا
   موافقة ويرى المخطط، و«طالب» يرى المواد وأرصدتها وطلباته وحالاتها،
   وطلبه ينتظر المدير. والمنع الحقّ في سياسات السحابة: ما لا يُعرض للطالب
   هنا لا تُرجعه له القاعدة أصلاً.
   ========================================================================== */

import { initLang, getLang, setLang, LANGS, tx } from '../i18n.js';
import { h, clear, icon, toast, modal, ago, fmtDateTime } from '../ui.js';
import { OPS, opIcon } from '../ops.js';
import { configured, hasSession, signIn, signOut, rows, all, currentUserId } from './sb.js';
import { SITE_VERSION } from './config.js';

await initLang();

/* ============================== الحالة ============================== */

export const state = {
  me: null,          // سطر الموظف في gc_staff: اسمه ونوع حسابه وصلاحياته
  meta: {},          // pc_seen, mirror_at, app_version, site_version
  data: null,        // المواد وأقسامها والمخازن والوحدات والأرصدة والمخطط
  loadedAt: 0,
};

export const canRequest = (type) => Boolean(state.me?.[type === 'in' ? 'can_in' : 'can_out']);
export const isDirect = (type) => Boolean(state.me?.[type === 'in' ? 'direct_in' : 'direct_out']);

/**
 * هل الحساب «معتمد»؟ سكربت السحابة القديم لا يعرف العمود، فيغيب من السطر:
 * يبقى الموقع حينئذ كما كان في الإصدار الثالث — يرى كلٌّ كل شيء، وهو ما
 * تسمح به سياسات ذلك السكربت — حتى يُنفَّذ الجديد.
 */
export const isTrusted = () => state.me?.trusted !== false;

/**
 * صلاحيات الأمانات والعمال على الحساب (can_custody وcan_workers). سكربت السحابة
 * الأقدم لا يعرفهما فيغيبان من السطر: لا صلاحية — فلا جدول لعملياتها هناك.
 */
export const hasPerm = (perm) => Boolean(state.me?.[perm]);
export const canCustody = () => hasPerm('can_custody');
export const canWorkers = () => hasPerm('can_workers');

/** المواد والمخازن والأرصدة والمخطط — تُحمَّل مرّة وتُجدَّد كل دقيقة عند الحاجة. */
export async function loadData(force = false) {
  if (!force && state.data && Date.now() - state.loadedAt < 60 * 1000) return state.data;
  const [warehouses, units, items, stock, blocks, houses, categories] = await Promise.all([
    all('gc_warehouses?select=id,code,name,active&order=id'),
    all('gc_units?select=id,name&order=name'),
    all('gc_items?select=id,sku,name,category_id,unit_id,min_qty,active&order=name'),
    all('gc_stock?select=item_id,warehouse_id,qty'),
    all('gc_blocks?select=*&order=sort,id'),
    /* بلا مالك ولا ملاحظات: ليسا ممّا يلزم الطلب، ولا يُرفعان إلى السحابة. */
    all('gc_houses?select=id,block_id,number,code,status,progress,x,y,w,h&order=id'),
    /* الأقسام بكل أعمدتها وتُرتَّب هنا: السكربت القديم لا يعرف ترتيبها
       ولونها وأيقونتها، وطلبُ عمودٍ غائب يُسقط الطلب كلّه. وإن لم تُقرأ
       أصلاً بقيت المواد كلّها «بلا قسم» ولم يتعطّل شيء. */
    all('gc_categories?select=*&order=id').catch(() => []),
  ]);
  const unitName = new Map(units.map((u) => [u.id, u.name]));
  const byItem = new Map();
  for (const s of stock) {
    if (!byItem.has(s.item_id)) byItem.set(s.item_id, {});
    byItem.get(s.item_id)[s.warehouse_id] = Number(s.qty) || 0;
  }
  const blockById = new Map(blocks.map((b) => [b.id, b]));
  state.data = {
    warehouses: warehouses.filter((w) => w.active !== 0),
    allWarehouses: warehouses,
    units,
    items: items.map((i) => {
      const per = byItem.get(i.id) ?? {};
      return { ...i, unit: unitName.get(i.unit_id) ?? '', stock: per,
        total: Object.values(per).reduce((t, q) => t + q, 0) };
    }),
    blocks,
    houses: houses.map((x) => ({ ...x, block_code: blockById.get(x.block_id)?.code ?? '',
      zone: blockById.get(x.block_id)?.zone ?? '', color: blockById.get(x.block_id)?.color ?? '#999' })),
    categories: categories
      .map((c) => ({ id: c.id, name: c.name ?? '', sort: Number(c.sort) || 0, color: c.color || '', icon: c.icon || 'box' }))
      .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'ar')),
  };
  state.loadedAt = Date.now();
  return state.data;
}

/* ------------------------------ الأقسام ------------------------------ */

/** مفتاح «بلا قسم»: مادةٌ أُضيفت من طلبٍ على الموقع أو من الرصيد الافتتاحي ولم تُوضع في قسم بعد. */
export const NO_SECTION = 'none';

/**
 * المواد موزّعةً على أقسامها بترتيبها في البرنامج: [{ key, name, color,
 * icon, items }]. القسم الذي لا مواد فيه يبقى — يُعرف أنه موجود، وفي
 * الإدخال تُطلب فيه مادة جديدة. و«بلا قسم» آخرها، ولا يظهر إلا إن وُجد فيه شيء.
 */
export function bySection(items, data = state.data) {
  const groups = (data?.categories ?? []).map((c) => ({ ...c, key: c.id, items: [] }));
  const byId = new Map(groups.map((g) => [g.id, g]));
  const none = { key: NO_SECTION, id: null, name: 'بلا قسم', color: '', icon: 'box', items: [] };
  for (const it of items) (byId.get(it.category_id) ?? none).items.push(it);
  return none.items.length ? [...groups, none] : groups;
}

/** لون القسم لمتغيّر --sc، ولون محايد لما لا لون له. */
export const sectionColor = (sec) => sec?.color || 'var(--text-3)';

/* ============================== التوجيه ============================== */

/* trusted: شاشة المعتمد وحده. و«المواد» للنوعين: المواد وأرصدتها ليُطلب
   منها — لا دفتر مخزنٍ في السحابة.
   والقسم (‎#/section/3‎، و0 لـ«بلا قسم») يُفتح من أيقونته في الرئيسية —
   للنوعين: موادّه بأرصدتها، ومنه يُطلب إدخالها أو إخراجها. وليس له زرّ في
   الشريط: nav يُبقي «الرئيسية» مضاءةً وهو مفتوح.
   والسندات (‎#/vouchers‎) لم تعد هنا: بقيت على الحاسوب الرئيسي، ورابطها
   المحفوظ يفتح الرئيسية.
   وperm: شاشةٌ لمن أُعطي صلاحيتها — الأمانات (‎#/custody‎) والعمال والحضور
   (‎#/workers‎ و‎#/workers/attendance‎). ومن لم يُعطَها يُفتح له رابطها الرئيسية. */
const ROUTES = {
  home: { title: 'الرئيسية', icon: 'home', view: 'home' },
  section: { title: 'القسم', icon: 'grid', view: 'section', nav: 'home' },
  stock: { title: 'المواد', icon: 'layers', view: 'stock' },
  plan: { title: 'المخطط', icon: 'map', view: 'plan', trusted: true },
  custody: { title: 'الأمانات', icon: 'opCustody', view: 'custody', perm: 'can_custody' },
  workers: { title: 'العمال', icon: 'hardhat', view: 'workers', perm: 'can_workers' },
  new: { title: 'طلب جديد', view: 'request' },
};

/** هل يفتح هذا الحساب الشاشة؟ */
const allowed = (name) => (!ROUTES[name]?.trusted || isTrusted()) && (!ROUTES[name]?.perm || hasPerm(ROUTES[name].perm));

export function currentRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const [name, ...rest] = path.split('/');
  if (name && (!Object.hasOwn(ROUTES, name) || !allowed(name))) {
    /* طالبٌ كتب ‎#/plan‎ بيده — أو فتح رابطاً أرسله له معتمد، أو رابط الأمانات
       وليست له — أو رابطٌ محفوظ لشاشةٍ لم تعد في الموقع (‎#/vouchers‎): يرى
       الرئيسية، والعنوان يُصحَّح معها فلا يبقى فيه ما لا يُعرض. */
    history.replaceState(null, '', '#/home');
    return { name: 'home', param: '', query: {} };
  }
  return { name: name || 'home', param: rest.join('/'), query: Object.fromEntries(new URLSearchParams(query)) };
}

export function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

let current = null;
let renderSeq = 0;   // رقم آخر رسم بدأ — وما سبقه قديم
let homeStale = false;   // تغيّرت الصلاحيات والرئيسية تحت نافذةٍ مفتوحة: تُرسم حين تُغلق

/**
 * كل رسم يكتب في حاوية جديدة تحلّ محلّ القديمة. الشاشة البطيئة التي تنقّل
 * الموظف عنها قبل أن تكتمل تُكمل في حاويتها المنزوعة فلا يظهر منها شيء،
 * وما أرجعته يُنظَّف ويُرمى — فلا يبقى مؤقّتها يعمل ولا تحلّ محلّ الجديدة.
 */
function freshContent() {
  const old = document.getElementById('content');
  const content = old.cloneNode(false);
  old.replaceWith(content);
  return content;
}

export async function render() {
  if (!state.me) return;
  const route = currentRoute();
  const def = ROUTES[route.name];
  homeStale = false;
  document.title = `${tx(def.title)} — Green City`;
  paintNav(def.nav ?? route.name);

  const seq = ++renderSeq;
  const stale = () => seq !== renderSeq;
  current?.cleanup?.();
  current = null;
  const content = freshContent();
  content.append(h('div', { class: 'skeleton', style: 'height:120px;border-radius:16px' }));
  try {
    /* كل شاشةٍ من وحدتها، تُحمَّل حين تُفتح: من لا يملك الأمانات لا يحمّل شيفرتها. */
    const mod = def.view === 'request' ? await import('./request.js')
      : def.view === 'custody' ? await import('./custody.js')
        : def.view === 'workers' ? await import('./workers.js')
          : await import('./views.js');
    if (stale()) return;
    const result = await mod[def.view]({ content: clear(content), route });
    if (stale()) {
      result?.cleanup?.();
      return;
    }
    current = result ?? null;
  } catch (err) {
    if (stale()) return;
    console.error(err);
    clear(content).append(h('div', { class: 'card' }, h('div', { class: 'empty' },
      h('div', { class: 'e-icon' }, icon('alert', 28)), h('b', {}, 'تعذّر عرض الصفحة'), h('div', {}, err.message),
      h('button', { class: 'btn', style: 'margin-top:10px', onclick: () => render() }, icon('undo', 16), 'أعد المحاولة'))));
  }
}

window.addEventListener('hashchange', render);

function paintNav(active) {
  const any = canRequest('in') || canRequest('out');
  const nav = clear(document.getElementById('p-nav'));
  for (const name of ['home', 'stock', 'plan', 'custody', 'workers'].filter(allowed)) {
    nav.append(h('a', { href: `#/${name}`, class: active === name ? 'active' : null },
      icon(ROUTES[name].icon, 17), ROUTES[name].title));
  }
  /* على الحاسوب لا شريط سفلي: زرّ الطلب في الشريط العلوي بلون زرّ الهاتف. */
  if (any) nav.append(h('button', { class: 'p-new', type: 'button', onclick: chooseRequest }, icon('plus', 17), 'طلب جديد'));
  const tab = (name) => h('a', { href: `#/${name}`, class: active === name ? 'active' : null }, icon(ROUTES[name].icon, 21), ROUTES[name].title);
  const fab = any ? h('button', { class: 'fab', title: 'طلب جديد', onclick: chooseRequest }, icon('plus', 26)) : null;
  const bar = clear(document.getElementById('tabbar'));
  /* المعتمد: الرئيسية والمواد، وزرّ الطلب، والمخطط. والطالب: طلباته،
     وزرّ الطلب في الوسط تحت إبهامه، والمواد. وحساب الاطّلاع بلا زرّ طلب.
     ومن له الأمانات أو العمال: أزرارهما بعد زرّ الطلب. والشريط خمسة أزرار
     على الأكثر — تحت الإبهام على شاشة 360 بكسلاً: فإن زاد خرج منه المخطط،
     ويُفتح من «المخطط» في الرئيسية. */
  const names = ['home', 'stock', 'plan', 'custody', 'workers'].filter(allowed);
  if (names.length + (fab ? 1 : 0) > 5) names.splice(names.indexOf('plan'), 1);
  const tabs = names.map(tab);
  /* زرّ الطلب في الوسط: بعد نصف الأزرار — وفي العدد الفرديّ بعد أكثرها. */
  if (fab) tabs.splice(Math.ceil(names.length / 2), 0, fab);
  bar.append(...tabs);
  bar.style.gridTemplateColumns = `repeat(${bar.children.length}, 1fr)`;
}

/** نوعا الطلب بلونيهما، لمن يملك أحدهما أو كليهما. */
export function chooseRequest() {
  const types = ['in', 'out'].filter(canRequest);
  if (types.length === 1) return go(`#/new/${types[0]}`);
  modal({
    title: 'طلب جديد',
    body: (close) => h('div', { class: 'quick', style: 'margin:0' },
      ...types.map((type) => h('a', { href: `#/new/${type}`, 'data-op': type, onclick: close },
        opIcon(type, 22, true),
        h('div', {}, h('b', {}, requestTitle(type)), h('small', {}, requestHint(type)))))),
  });
}

/**
 * اسم الطلب كما يراه صاحبه: «إدخال مباشر» لمن يُسجَّل طلبه بلا موافقة،
 * و«طلب إدخال» لمن ينتظر المدير. والطلب المرسَل يحمل ما كان عليه يوم
 * أُرسل (direct) — لا ما صار إليه الحساب بعده.
 */
export const requestTitle = (type, direct = isDirect(type)) => (direct
  ? (type === 'in' ? 'إدخال مباشر' : 'إخراج مباشر')
  : `طلب ${OPS[type].label}`);
export const requestHint = (type) => (isDirect(type)
  ? 'يُسجَّل سنداً دون موافقة حين يتّصل الحاسوب الرئيسي'
  : 'يُرسل إلى المدير ويُسجَّل سنداً بعد موافقته');

/* ============================ حالة الحاسوب الرئيسي ============================ */

const ONLINE_MS = 90 * 1000;

/* ساعة الحاسوب غير ساعة الهاتف: pc_seen يكتبه الحاسوب بساعته كل عشرين
   ثانية، والهاتف يقرؤه بساعته. فإن تأخّرت إحداهما دقائق قال الموقع «غير
   متصل» والحاسوب يعمل، أو «متصل» ساعاتٍ بعد إطفائه. فيُحكم بما يراه الهاتف
   بساعته هو — كما يفعل الحاسوب نفسه حين ينظر إلى حاسوبٍ ثانٍ: هل تغيّر
   pc_seen منذ القراءة السابقة؟ ومتى رآه يتغيّر آخر مرة؟ والساعتان لا
   تُقارَنان إلا في أول قراءة، قبل أن يُرى شيء يتغيّر.
   والتغيّر لا يُصدَّق إلا بين قراءتين متقاربتين: هاتفٌ عاد من الجيب بعد
   ساعات يرى pc_seen تغيّر، ولا يدري أتغيّر قبل دقيقة أم قبل ساعتين ثم
   أُطفئ الحاسوب — فيُرجع في تلك القراءة إلى الساعتين، لا «متصل» بلا دليل. */
const beat = { value: null, since: 0, moved: false, checked: 0 };

function noteBeat() {
  const value = state.meta.pc_seen ?? '';
  const now = Date.now();
  if (value !== beat.value) {
    beat.moved = beat.value !== null && value !== '' && now - beat.checked < ONLINE_MS;
    beat.value = value;
    beat.since = now;
  }
  beat.checked = now;
}

export async function refreshMeta() {
  try {
    const list = await rows('gc_meta?select=key,value');
    state.meta = Object.fromEntries(list.map((r) => [r.key, r.value]));
    noteBeat();
  } catch { /* تبقى الحالة السابقة */ }
  paintPill();
  paintBanner();
}

export function pcOnline() {
  const seen = Date.parse(state.meta.pc_seen ?? '');
  if (!Number.isFinite(seen)) return false;
  /* لم يتغيّر منذ دقيقة ونصف بساعة الهاتف: متوقّف، مهما قالت ساعة الحاسوب. */
  if (beat.value === (state.meta.pc_seen ?? '') && Date.now() - beat.since >= ONLINE_MS) return false;
  if (beat.moved) return true;
  return Math.abs(Date.now() - seen) < ONLINE_MS;
}

/** متى ظهر الحاسوب آخر مرة بساعة الهاتف — أو null إن لم يُعرف. */
function lastSeenAt() {
  const seen = Date.parse(state.meta.pc_seen ?? '');
  if (!Number.isFinite(seen)) return null;
  if (beat.moved) return beat.since;
  /* ساعةٌ تسبق ساعة الهاتف لا يُعرف منها شيء: لا «الآن» عن حاسوبٍ مطفأ. */
  return seen > Date.now() + 60 * 1000 ? null : Math.min(seen, Date.now());
}

/** حالة الحاسوب: النوع، والعبارة كاملةً للحاسوب، ومختصرةً للهاتف. */
function pcState() {
  if (!state.meta.pc_seen) return { kind: 'unknown', long: 'لم يتّصل الحاسوب الرئيسي بعد', short: 'لم يتّصل بعد', when: null };
  if (pcOnline()) return { kind: 'on', long: 'الحاسوب الرئيسي متصل', short: 'متصل', when: null };
  const at = lastSeenAt();
  return { kind: 'off', long: 'الحاسوب الرئيسي غير متصل', short: 'غير متصل', when: at === null ? null : ago(new Date(at)) };
}

/* على الهاتف لا يتّسع الشريط للعبارة كاملة: «متصل» أو «غير متصل · قبل
   3 ساعة» عقدٌ يُترجم كلٌّ وحده — وبضغطةٍ تُفتح التفاصيل كلّها، فالـ title
   لا يظهر على شاشة اللمس. */
function paintPill() {
  const pill = document.getElementById('pc-pill');
  const now = pcState();
  pill.classList.remove('on', 'off', 'unknown');
  pill.classList.add(now.kind);
  const when = now.when ? [h('span', { class: 'pc-sep' }, ' · '), h('span', { class: 'pc-when' }, now.when)] : null;
  clear(pill).append(h('i'),
    h('span', { class: 'pc-long' }, now.long), h('span', { class: 'pc-short' }, now.short), when);
  pill.title = state.meta.mirror_at
    ? `${tx('آخر تحديث للبيانات:')} ${fmtDateTime(state.meta.mirror_at)}`
    : tx('لم تُرفع البيانات بعد');
}

function pcDetails() {
  const now = pcState();
  const at = lastSeenAt();
  const fact = (label, value) => h('div', { class: 'fact' }, h('span', {}, label), h('b', {}, value));
  modal({
    title: 'الحاسوب الرئيسي',
    body: h('div', { class: 'form-grid' },
      h('div', { class: `pc-pill ${now.kind} pc-big` }, h('i'), h('span', {}, now.long)),
      h('div', { class: 'facts' },
        now.kind === 'off' && at !== null ? fact('آخر ظهور:', [fmtDateTime(new Date(at)), ' · ', h('span', {}, ago(new Date(at)))]) : null,
        fact('آخر تحديث للبيانات:', state.meta.mirror_at ? fmtDateTime(state.meta.mirror_at) : h('span', {}, 'لم تُرفع البيانات بعد'))),
      h('div', { class: 'small muted' }, now.kind === 'on'
        ? 'الحاسوب الرئيسي متصل — ما تطلبه يصله خلال ثوانٍ.'
        : 'الحاسوب الرئيسي غير متصل الآن — طلبك يُحفظ ويصله حين يُفتح.')),
  });
}

{
  const pill = document.getElementById('pc-pill');
  pill.setAttribute('role', 'button');
  pill.setAttribute('tabindex', '0');
  pill.addEventListener('click', pcDetails);
  pill.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pcDetails(); } });
}

/* ============================== إصدار الموقع ==============================
   الموقع يُفتح على الهاتف ويبقى مفتوحاً أيّاماً، والحاسوب الرئيسي يُحدَّث
   فيُنشر الموقع الجديد معه. فإن اختلف إصدار الموقع المنشور (gc_meta.site_version)
   عن إصدار هذه الصفحة قيل للموظف أن يحدّثها — بضغطة تُسقط ما خبّأه المتصفّح
   من ملفاتها، لا بإعادة تحميل تُرجع الملفات القديمة نفسها من ذاكرته.

   والمقارنة بالمنشور لا بإصدار البرنامج: البرنامج يُحدَّث ثم يُنشر موقعه بعد
   دقيقة أو أكثر، ومن حدّث صفحته قبل النشر عادت إليه القديمة. وحاسوبٌ لا يكتب
   site_version بعد (إصدارٌ أقدم) يُقارن بإصدار برنامجه كما كان.

   ومن حدّث فبقي الإصدار — البرنامج حُدّث ولم يُنشر موقعه بعد — لا يُسأل
   ثانيةً في الجلسة نفسها: لا شيء بيده حتى يُنشر. وكذلك من أغلق الشريط. */

const UPDATE_KEY = 'gc-portal-update';

function paintBanner() {
  const banner = document.getElementById('p-banner');
  if (!banner) return;
  const latest = state.meta.site_version || state.meta.app_version || '';
  let handled = '';
  try { handled = sessionStorage.getItem(UPDATE_KEY) ?? ''; } catch { /* لا تخزين */ }
  /* ‎dev‎: نسخة التطوير من config.js، لا موقعٌ منشور يُقارن. */
  const show = Boolean(latest) && SITE_VERSION !== 'dev' && latest !== SITE_VERSION && handled !== latest;
  if (!show) {
    banner.hidden = true;
    clear(banner);
    return;
  }
  if (!banner.hidden && banner.dataset.version === latest) return;
  const dismiss = () => {
    try { sessionStorage.setItem(UPDATE_KEY, latest); } catch { /* لهذه الصفحة وحدها */ }
    banner.hidden = true;
  };
  banner.dataset.version = latest;
  clear(banner).append(
    icon('info', 17),
    h('span', { class: 'grow' }, 'تحدّث البرنامج — حدّث الصفحة'),
    h('button', { class: 'btn btn-sm', type: 'button', onclick: (e) => { e.currentTarget.disabled = true; dismiss(); reloadFresh(); } },
      icon('undo', 15), 'تحديث'),
    h('button', { class: 'icon-btn sm', type: 'button', title: 'إغلاق', onclick: dismiss }, icon('x', 15)));
  banner.hidden = false;
}

/**
 * يُعيد تحميل الصفحة بملفاتها الجديدة. ما حمّلته الصفحة من ملفاتها
 * (الشيفرة والتنسيق والقاموس) يُطلب من الشبكة متجاوزاً ذاكرة المتصفّح،
 * فيحلّ الجديد محلّ المخبّأ — ثم تُحمَّل الصفحة فتجده.
 */
async function reloadFresh() {
  const urls = new Set([location.href.split('#')[0]]);
  for (const entry of performance.getEntriesByType?.('resource') ?? []) {
    const url = new URL(entry.name);
    if (url.origin === location.origin && /\.(?:js|css|html|webmanifest)$/.test(url.pathname)) urls.add(url.href.split('#')[0]);
  }
  await Promise.allSettled([...urls].map((url) => fetch(url, { cache: 'reload' })));
  location.reload();
}

/* ============================== الدخول ============================== */

function showAuth(message) {
  document.getElementById('app').classList.add('hidden');
  document.getElementById('auth').classList.remove('hidden');
  const err = document.getElementById('login-error');
  err.hidden = !message;
  err.textContent = message ?? '';
  setTimeout(() => document.querySelector('#login-form input')?.focus(), 50);
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('button[type=submit]');
  const data = Object.fromEntries(new FormData(form));
  btn.disabled = true;
  try {
    await signIn(data.username, data.password);
    form.reset();
    await start();
  } catch (err) {
    showAuth(err.message);
  } finally {
    btn.disabled = false;
  }
});

let metaTimer = null;

async function start() {
  const uid = currentUserId();
  const [me] = await rows(`gc_staff?select=*&id=eq.${encodeURIComponent(uid)}`);
  if (!me || !me.active) {
    await signOut();
    return showAuth(tx('حسابك غير مفعّل على الموقع — راجع المدير'));
  }
  state.me = me;
  document.getElementById('auth').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  clear(document.getElementById('me-btn')).append(icon('user', 18));
  await refreshMeta();
  clearInterval(metaTimer);
  metaTimer = setInterval(() => { refreshMeta(); refreshMe(); }, 30 * 1000);
  await render();
}

/* صلاحيات الحساب تُقرأ ثانيةً مع حالة الحاسوب: ما يعطيه المدير من الحاسوب —
   الأمانات أو العمال أو «معتمد» — يظهر في الشريط خلال نصف دقيقة، وما يسحبه
   يغيب، بلا خروجٍ ولا تحديث صفحة. والحساب الموقوف يعود إلى شاشة الدخول. */
const PERM_KEYS = ['trusted', 'can_in', 'can_out', 'direct_in', 'direct_out', 'can_custody', 'can_workers'];

async function refreshMe() {
  if (!state.me) return;
  const before = state.me;
  let me;
  try {
    [me] = await rows(`gc_staff?select=*&id=eq.${encodeURIComponent(currentUserId())}`);
  } catch {
    return;   // بلا شبكة: تبقى الصلاحيات كما كانت
  }
  if (state.me !== before) return;   // خرج أو دخل غيره في أثناء القراءة
  if (!me || !me.active) {
    await signOut();
    window.dispatchEvent(new CustomEvent('gc-session-lost', { detail: { message: 'حسابك غير مفعّل على الموقع — راجع المدير' } }));
    return;
  }
  state.me = me;
  const changed = PERM_KEYS.some((key) => me[key] !== before[key]);
  if (!changed && !homeStale) return;
  /* شاشةٌ لم تعد له تُستبدل بالرئيسية، والرئيسية تُرسم بأزرارها الجديدة —
     إلا وفوقها درج طلبٍ أو نافذة: رسمها تحته يقطع ما يفعله فيه، فيتغيّر
     الشريط الآن وتُرسم هي في قراءةٍ تالية بعد أن تُغلق. وغيرهما — طلبٌ
     يُكتب — لا يُمسّ: يتغيّر الشريط وحده. */
  const name = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0] || 'home';
  const layerOpen = document.getElementById('modals')?.childElementCount > 0;
  homeStale = false;
  if (!Object.hasOwn(ROUTES, name) || !allowed(name) || (name === 'home' && !layerOpen)) return render();
  if (name === 'home') homeStale = true;
  if (!changed) return;
  const route = currentRoute();
  paintNav(ROUTES[route.name].nav ?? route.name);
}

/* حين يعود الموظف إلى الصفحة بعد غياب تُجدَّد الحالة والشاشة: الهاتف
   يُترك مفتوحاً في الجيب ساعات. */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !state.me) return;
  refreshMeta();
  refreshMe();
  /* الشاشة تعرض خطأها بنفسها؛ وما أفلت منها — الهاتف بلا شبكة بعدُ — لا
     يصير رفضاً بلا معالج يُرى في الطرفية ولا يُرى في الشاشة. */
  if (Date.now() - state.loadedAt > 60 * 1000) Promise.resolve(current?.refresh?.()).catch(() => {});
});

/* الجلسة سقطت والموقع مفتوح (sb.js): رمزٌ رُفض، أو تجديدٌ رُفض — خروجٌ من
   جهاز آخر، أو حسابٌ أُوقف. يعود الموظف إلى شاشة الدخول برسالتها، لا يبقى
   أمام شاشاتٍ تقول كلٌّ منها «سجّل الدخول أولاً» وزرٍّ لا يُخرجه منها. */
window.addEventListener('gc-session-lost', (e) => {
  if (!state.me) return;
  state.me = null;
  state.data = null;
  clearInterval(metaTimer);
  current?.cleanup?.();
  current = null;
  renderSeq++;
  showAuth(tx(e.detail?.message || 'انتهت الجلسة — سجّل الدخول من جديد'));
});

/* ============================== الحساب ============================== */

/** نوع الحساب بأيقونته ولونه، وما يعنيه لصاحبه بكلامٍ موجّه إليه. */
function accountKind() {
  const trusted = isTrusted();
  return h('div', { class: `p-kind ${trusted ? 'trusted' : 'asker'}` },
    h('span', { class: 'kind-icon' }, icon(trusted ? 'checkCircle' : 'send', 18)),
    h('div', {}, h('b', {}, trusted ? 'معتمد' : 'طالب'),
      h('div', { class: 'small' }, trusted
        ? 'ما تكتبه يُسجَّل سنداً دون موافقة، وترى المواد والمخطط.'
        : 'طلباتك تنتظر موافقة المدير، وترى المواد وأرصدتها.')));
}

function accountMenu() {
  const me = state.me;
  const perms = [
    me.can_in ? (me.direct_in ? 'إدخال مباشر' : 'طلب إدخال') : null,
    me.can_out ? (me.direct_out ? 'إخراج مباشر' : 'طلب إخراج') : null,
  ].filter(Boolean);
  modal({
    title: 'الحساب',
    body: (close) => h('div', { class: 'form-grid' },
      h('div', { style: 'display:flex;gap:12px;align-items:center' },
        h('span', { class: 'avatar', translate: 'no', style: 'width:46px;height:46px;font-size:18px' }, (me.full_name || me.username).charAt(0)),
        h('div', {}, h('b', { style: 'font-size:16px' }, me.full_name || me.username),
          h('div', { class: 'muted ltr', translate: 'no', style: 'text-align:right' }, me.username))),
      h('div', {}, h('div', { class: 'small muted', style: 'margin-bottom:6px' }, 'نوع الحساب'), accountKind()),
      h('div', {}, h('div', { class: 'small muted', style: 'margin-bottom:6px' }, 'صلاحياتك على الموقع'),
        h('div', { class: 'chips' }, h('span', { class: 'chip' }, icon('eye', 14), 'المواد وأرصدتها'),
          isTrusted() ? h('span', { class: 'chip' }, icon('map', 14), 'المخطط') : null,
          ...perms.map((p) => h('span', { class: 'chip' }, icon('check', 14), p)),
          /* الأمانات والعمال: «مباشرة» للمعتمد، و«بموافقة المدير» للطالب — كما تصل عملياته. */
          canCustody() ? h('span', { class: 'chip' }, icon('opCustody', 14), isTrusted() ? 'الأمانات مباشرة' : 'الأمانات بموافقة المدير') : null,
          canWorkers() ? h('span', { class: 'chip' }, icon('hardhat', 14), isTrusted() ? 'العمال مباشرة' : 'العمال بموافقة المدير') : null)),
      h('div', { class: 'info-box' }, icon('phone', 18), h('div', {},
        h('b', {}, 'على الهاتف'),
        h('div', { class: 'small' }, 'من قائمة المتصفّح اختر «الإضافة إلى الشاشة الرئيسية» ليفتح الموقع كتطبيق.'))),
      h('button', {
        class: 'btn btn-danger btn-block',
        onclick: async () => { close(); await signOut(); location.hash = '#/home'; location.reload(); },
      }, icon('logout', 17), 'تسجيل الخروج'),
      h('div', { class: 'small muted', style: 'text-align:center' }, `Green City ${SITE_VERSION}`)),
  });
}

document.getElementById('me-btn').addEventListener('click', accountMenu);

/* ============================== المظهر واللغة ============================== */

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('green-theme', theme); } catch { /* لا تخزين */ }
  for (const btn of document.querySelectorAll('[data-theme-toggle]')) {
    clear(btn).append(icon(theme === 'dark' ? 'sun' : 'moon', 18));
  }
}
for (const btn of document.querySelectorAll('[data-theme-toggle]')) {
  btn.addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
}
applyTheme(document.documentElement.dataset.theme ?? 'light');

for (const btn of document.querySelectorAll('[data-lang-toggle]')) {
  const other = getLang() === 'ar' ? 'ckb' : 'ar';
  btn.textContent = LANGS[other];
  btn.setAttribute('lang', other);
  btn.title = tx('تغيير اللغة');
  btn.onclick = () => setLang(other);
}

/* ============================== الإقلاع ============================== */

(async function boot() {
  if (!configured()) {
    showAuth(tx('الموقع غير مهيّأ — أخبر المدير'));
    document.querySelector('#login-form button').disabled = true;
    return;
  }
  if (!hasSession()) return showAuth();
  try {
    await start();
  } catch (err) {
    showAuth(err.status === 401 ? tx('انتهت الجلسة — سجّل الدخول من جديد') : err.message);
  }
})();

export { toast };
