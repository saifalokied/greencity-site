/* ============================ شاشات الموقع ============================
   الرئيسية وطلباتي، والأقسام، والمواد، والمخطط — قراءةٌ لما رفعه الحاسوب
   الرئيسي، بألوان العمليات نفسها التي في البرنامج.

   والسحابة لا تحمل إلا ما يلزم كتابة طلب: المواد بأقسامها وأرصدتها،
   والمخازن، والمنازل. فالسندات والأمانات والعمال ودفتر الحركة على
   الحاسوب الرئيسي وحده، ولا شاشة لها هنا. والمخطط للمعتمد: نسب الإنجاز.

   وطلبات الموظف في سجلّ هاتفه (sb.js): السحابة تحمل الطلب حتى يُقرَّر،
   فإذا وصل قراره إلى الهاتف الذي أرسله حُفظ فيه وحُذف منها. وما أُرسل من
   جهازٍ آخر للحساب لا يُعرض هنا: قراره لذلك الجهاز.

   ومن أُعطي «الأمانات» أو «العمال والحضور»: زرّاهما في الرئيسية، وتحت
   «طلباتي» عملياته عليهما بحالها وقرارها (people.js) — وشاشتاهما في
   custody.js وworkers.js.

   والأقسام والمواد بأرصدتها للمعتمد. و«الطالب» يطلب من قائمة الطلبات
   (menu.js) بلا أرصدة ولا أعداد: أيقونات الأقسام في رئيسيته تفتحها على
   القسم، ورابط المواد أو القسم يفتحها له (main.js).

   ورئيسية الطالب أبسط (الإصدار الخامس): زرٌّ كبير واحد «اطلب مواد» أوّلها،
   ثم «طلب إدخال» إن كان له، ثم «طلباتي» — وعلى كل طلبٍ مراحله نقاطاً، وفي درجه
   مراحله كلّها بأوقاتها: أُرسل، وصل، تمت الموافقة، قيد التجهيز، تم التجهيز
   (track.js).
   ===================================================================== */

import {
  h, clear, icon, num, fmtDate, fmtDateTime, drawer, table, badge, emptyState, loadingState,
  meter, kpi, fold, debounce, toast, soleHouse,
} from '../ui.js';
import { OPS, opIcon } from '../ops.js';
import { all, withdraw, settleRequests, ackRequest, localHistory, currentUserId, storageKept, readCart } from './sb.js';
import {
  state, loadData, canRequest, requestTitle, requestHint, pcOnline, isTrusted, bySection, sectionColor, NO_SECTION, go,
  canCustody, canWorkers,
} from './main.js';
import { homeOps, kindIcon } from './people.js';
import { WH_KEY } from './send.js';
import { displayStatus, timeline, currentStep, TRACK_LABELS } from './track.js';
import { guideLink } from './guide-pdf.js';

/* ------------------------------ الطلبات ------------------------------ */

export const REQUEST_STATES = {
  pending: { label: 'بانتظار الحاسوب الرئيسي', icon: 'clock' },
  received: { label: 'بانتظار موافقة المدير', icon: 'history' },
  posted: { label: 'سُجّل سنداً', icon: 'checkCircle' },
  /* الإصدار الخامس: طلب الإخراج بعد اعتماده — المخزن يجهّز موادّه، ثم جهّزها. */
  preparing: { label: 'قيد التجهيز', icon: 'box' },
  prepared: { label: 'تم التجهيز', icon: 'checkCircle' },
  rejected: { label: 'مردود', icon: 'xCircle' },
  withdrawn: { label: 'مسحوب', icon: 'undo' },
  /* سُجّل سنداً ثم ألغى المدير السند: ما طُلب لم يُصرف. */
  cancelled: { label: 'أُلغي سنده', icon: 'ban' },
  /* طلبٌ من هذا الجهاز ينتظر، ولم يعد في السحابة: لا يُعرف قراره هنا (sb.js). */
  gone: { label: 'لم يصل قراره إلى هذا الجهاز', icon: 'info' },
};

function requestState(r) {
  /* طلب صاحب الصلاحية المباشرة لا ينتظر موافقة: إن وصل ولم يُسجَّل
     فلأن شيئاً منعه، وسببه مكتوب تحته. والسند المسجَّل بمرحلة تجهيزه. */
  const status = displayStatus(r);
  const s = REQUEST_STATES[status] ?? REQUEST_STATES.pending;
  const label = status === 'pending' && r.direct ? 'يُسجَّل حين يتّصل الحاسوب الرئيسي' : s.label;
  return h('span', { class: `req-state ${status}` }, icon(s.icon, 13), label);
}

/** المراحل نقاطاً تحت عنوان الطلب: لكل مرحلةٍ نقطة بحالها، ونصّ المرحلة الحالية لقارئ الشاشة. */
function trackDots(r) {
  const steps = timeline(r);
  return h('div', { class: 'p-track-dots', role: 'img', 'aria-label': currentStep(steps).label },
    ...steps.map((s) => h('span', { class: `dot ${s.state}` })));
}

const STEP_ICON = { done: 'check', now: 'clock', bad: 'x' };

/**
 * مراحل الطلب في درجه، من فوق إلى تحت: كلٌّ بعلامتها ووقتها ومن قرّرها، ورقم السند
 * عند الموافقة. وما كتبه المدير بيده (سبب الردّ أو الإلغاء) كما كتبه (translate=no)،
 * وما كتبه البرنامج (لِمَ لم يُسجَّل تلقائياً) يُترجم.
 */
function trackList(r) {
  return h('ol', { class: 'p-track' }, ...timeline(r).map((s) => {
    const free = s.key === 'cancelled' || (s.key === 'approved' && r.status === 'rejected');
    return h('li', { class: `p-track-step ${s.state}`, 'data-step': s.key },
      h('span', { class: 'pt-ico' }, STEP_ICON[s.state] ? icon(STEP_ICON[s.state], 14) : null),
      h('div', { class: 'pt-main' },
        h('b', {}, s.label),
        s.voucher ? h('span', { class: `req-voucher${r.status === 'cancelled' ? ' cancelled' : ''}` }, icon('file', 13),
          h('span', {}, TRACK_LABELS.voucher), ' ', h('b', { class: 'ltr', translate: 'no' }, s.voucher)) : null,
        s.at || s.by ? h('div', { class: 'pt-meta' }, s.at ? h('span', {}, fmtDateTime(s.at)) : null,
          s.at && s.by ? ' · ' : null, s.by ? h('span', { translate: 'no' }, s.by) : null) : null,
        s.note ? h('div', { class: `req-note${s.state === 'bad' ? ' bad' : ''}` },
          free ? h('span', { translate: 'no' }, s.note) : s.note) : null));
  }));
}

const linesOf = (r) => (Array.isArray(r.lines) ? r.lines : []);

/**
 * ما قيل في الطلب. سبب الرفض بارزٌ بعنوانه: به يعرف صاحب الطلب ما يصحّحه
 * قبل أن يعيده. وإلغاء السند يكتبه البرنامج «أُلغي السند …: السبب»،
 * وملاحظة البرنامج («لم يُسجَّل تلقائياً: …») تُعرض كما هي.
 *
 * وما كتبه المدير بيده يُعرض كما كتبه (translate=no): القاموس يعرف جمل
 * البرنامج لا الكلام الحرّ، فيترجم منه كلمةً ويترك ما حولها عربياً.
 * والعنوان عقدةٌ وحده فيُترجم.
 */
function decisionNote(r) {
  const note = r.decision_note;
  if (!note) return null;
  const said = (text) => h('span', { translate: 'no' }, text);
  if (r.status === 'rejected') {
    return h('div', { class: 'req-note bad strong' }, h('b', {}, 'سبب الرفض:'), ' ', said(note));
  }
  const cancel = r.status === 'cancelled' ? /^(أُلغي السند \S+):\s*([\s\S]*)$/.exec(note) : null;
  if (cancel) return h('div', { class: 'req-note bad' }, h('b', {}, cancel[1]), ': ', said(cancel[2]));
  return h('div', { class: `req-note${r.status === 'cancelled' ? ' bad' : ''}` }, note);
}

/** رقم السند الذي صار إليه الطلب — مشطوباً إن أُلغي السند. */
function voucherChip(r) {
  if (!r.voucher_number || !['posted', 'cancelled'].includes(r.status)) return null;
  return h('span', { class: `req-voucher${r.status === 'cancelled' ? ' cancelled' : ''}` },
    icon('file', 13), h('b', { class: 'ltr', translate: 'no' }, r.voucher_number));
}

/** كم مادةً في طلب الإخراج جُهّز بها المنزل من قبل — كما نُبّه صاحبه حين أرسله. */
const resupplyOf = (r) => linesOf(r).filter((l) => l.resupply).length;

/** أجزاء السطر عُقداً منفصلة بينها «·» — فتُترجم كلٌّ على حدة. */
const dots = (...parts) => parts.filter(Boolean).flatMap((p, i) => (i ? [' · ', h('span', {}, p)] : [h('span', {}, p)]));

/** الكمية ووحدتها عقدتين: الوحدة («حبة») تُترجم وحدها، و«2 حبة» معاً لا. */
const amount = (value, unit) => [num(value), unit ? [' ', h('span', {}, unit)] : null];

/** «منزل D-DF13»: الكلمة تُترجم، والرمز كلمةٌ واحدة لا تنكسر عند الشرطة. */
const houseLabel = (code) => [h('span', {}, 'منزل'), ' ', h('span', { class: 'house-code', translate: 'no' }, code)];

/* ============================== الرئيسية ============================== */

/* قراءات «طلباتي» بترتيب بدئها — للشاشات كلّها معاً. قراءةٌ علِقت في شبكة
   الهاتف فعادت بعد قراءةٍ بدأت بعدها ودُمجت، ما فيها أقدم ممّا حُفظ: لا
   تُدمج ولا تُرسم. وإلا طلب «تسلّمت» (sb.js) لطلبٍ حُذف بعدها ثم أعاده
   الحاسوب بقرارٍ متأخّر — فحُذف القرار الجديد قبل أن يُحفظ هنا. */
let requestReads = 0;      // آخر قراءةٍ بدأت
let requestsSettled = 0;   // آخر قراءةٍ دُمجت

export async function home({ content }) {
  const me = state.me;
  const trusted = isTrusted();
  /* الطالب: نوع حسابه وحده — صلاحياته في الأزرار تحته. */
  const perms = !trusted ? [] : [
    me.can_in ? (me.direct_in ? 'إدخال مباشر' : 'طلب إدخال') : null,
    me.can_out ? (me.direct_out ? 'إخراج مباشر' : 'طلب إخراج') : null,
    canCustody() ? 'الأمانات' : null,
    canWorkers() ? 'العمال والحضور' : null,
  ].filter(Boolean);

  content.append(h('div', { class: 'hello' },
    h('div', {},
      h('h2', {}, `أهلاً، ${me.full_name || me.username}`),
      h('p', {}, pcOnline()
        ? 'الحاسوب الرئيسي متصل — ما تطلبه يصله خلال ثوانٍ.'
        : 'الحاسوب الرئيسي غير متصل الآن — طلبك يُحفظ ويصله حين يُفتح.')),
    h('div', { class: 'perm' },
      state.me?.admin
        ? h('span', { class: 'kind admin' }, icon('key', 13), 'مدير')
        : h('span', { class: `kind ${trusted ? 'trusted' : 'asker'}` }, icon(trusted ? 'checkCircle' : 'send', 13), trusted ? 'معتمد' : 'طالب'),
      ...perms.map((p) => h('span', {}, p)))));

  /* «مدير»: لوحته أوّل الرئيسية — أربعة أرقامٍ تفتح شاشاتها (admin.js، تُحمَّل له وحده). */
  if (state.me?.admin) {
    const slot = h('div', {});
    content.append(slot);
    import('./admin.js').then((m) => { if (slot.isConnected) slot.replaceWith(m.adminHomeCard()); }).catch(() => {});
  }

  const types = ['in', 'out'].filter(canRequest);
  /* الطالب يطلب الإخراج من قائمة الطلبات (menu.js)، والإدخال من النموذج —
     ففيه المادة الجديدة. والمعتمد يكتب الاثنين في النموذج. */
  const startOf = (type) => (type === 'out' && !trusted ? '#/menu' : `#/new/${type}`);
  /* الأمانات والعمال لمن أُعطيهما: زرّان بجانب الطلب — بلونيهما. */
  const people = [
    canCustody() ? h('a', { href: '#/custody', 'data-op': 'custody' }, opIcon('custody', 22, true),
      h('div', {}, h('b', {}, 'الأمانات'), h('small', {}, 'تسليمٌ وإعادة وتعهّد'))) : null,
    canWorkers() ? h('a', { href: '#/workers', 'data-op': 'workers' }, kindIcon('worker_add', 22, true),
      h('div', {}, h('b', {}, 'العمال والحضور'), h('small', {}, 'الملفّات والحضور اليومي'))) : null,
  ].filter(Boolean);
  /* الطالب يطلب المواد من زرٍّ كبير واحد أوّل الصفحة — قائمة الطلبات (menu.js)، فيها
     الأقسام والمواد. وما بقي له من الأزرار تحته: طلب الإدخال، والأمانات والعمال. */
  const hero = !trusted && types.includes('out');
  const tiles = trusted ? types : types.filter((type) => type !== 'out');
  if (hero) {
    content.append(h('div', { class: 'p-ask-hero' },
      h('a', { class: 'p-ask-big', href: '#/menu', 'data-op': 'out' }, icon('cart', 28),
        h('div', {}, h('b', {}, 'اطلب مواد'), h('small', {}, 'اختر من القائمة ثم أرسل — يوافق المدير وتتابع طلبك هنا'))),
      /* وتحته دليل الطلب (PDF): خطواته ومعنى كل مرحلة، لمن يطلب أوّل مرة (guide-pdf.js). */
      guideLink({ style: 'margin-top:10px' })));
  }
  if (tiles.length || people.length) {
    content.append(h('div', { class: trusted ? 'quick' : 'quick p-ask-more' },
      ...tiles.map((type) => h('a', { href: startOf(type), 'data-op': type },
        opIcon(type, 22, true), h('div', {}, h('b', {}, requestTitle(type)), h('small', {}, requestHint(type))))),
      ...people,
      trusted
        ? h('a', { href: '#/stock', 'data-op': 'opening' }, opIcon('opening', 22, true),
            h('div', {}, h('b', {}, 'المواد'), h('small', {}, 'بأقسامها وأرصدتها')))
        : null));
  } else if (!hero) {
    content.append(h('div', { class: 'info-box', style: 'margin-bottom:16px' }, icon('eye', 18),
      h('div', {}, h('b', {}, 'حسابك للاطّلاع'),
        h('div', { class: 'small' }, trusted
          ? 'ترى المواد وأرصدتها والمخطط. ولطلب الإدخال أو الإخراج اطلب الصلاحية من المدير.'
          : 'ترى المواد بأقسامها. ولطلب الإدخال أو الإخراج اطلب الصلاحية من المدير.'))));
  }
  /* في السلّة ما لم يُرسل: يُذكَّر به صاحبه قبل أن ينساه. */
  if (!trusted && readCart(currentUserId())?.lines.length) {
    content.append(h('a', { class: 'p-ask-cart', href: '#/cart' }, icon('cart', 20),
      h('span', {}, 'في سلّتك مواد لم تُرسل'), h('b', {}, 'متابعة الطلب'), icon('arrowLeft', 16)));
  }

  /* الأطقم الجاهزة للطالب الذي يطلب الإخراج، بين الزرّ الكبير والأقسام — تُرسم حين
     تصل المواد. وأيقونات الأقسام فوق الطلبات كذلك. */
  const kitBox = h('div', {});
  const secBox = h('div', {});
  const list = h('div', {}, loadingState(3));
  /* متصفّحٌ لا يحفظ ما يُكتب فيه (تخزينٌ محجوب أو ممتلئ): القرار يصل ولا يبقى
     هنا، ولا يُحذف من السحابة — فيُقال لصاحبه قبل أن يفتقده. */
  const keepBox = h('div', {});
  const paintKept = (kept) => {
    clear(keepBox);
    if (!kept) {
      keepBox.append(h('div', { class: 'card-body p-keep-warn' }, h('div', { class: 'warn-box' }, icon('alert', 18),
        h('div', { class: 'small' }, 'هذا المتصفّح لا يحفظ ما يُكتب فيه — قد لا تُحفظ قرارات طلباتك على هذا الجهاز. افتح الموقع في متصفّحٍ عادي، أو اسأل المدير عن قراراتها.'))));
    }
  };
  const card = h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('h3', {}, icon('list', 18), 'طلباتي'),
      h('div', { class: 'spacer' }),
      trusted ? h('a', { class: 'btn btn-sm btn-ghost', href: '#/plan' }, icon('map', 15), 'المخطط') : null,
      /* السجلّ على الهاتف لا في السحابة: من بدّل هاتفه أو أرسل من غيره لا
         يتفاجأ بقائمةٍ ناقصة. */
      h('div', { class: 'p-history-note' }, icon('phone', 14),
        h('span', {}, 'سجلّ طلباتك محفوظ على هذا الجهاز — وما أرسلته من جهازٍ آخر يُحفظ هناك.'))),
    keepBox, list);
  /* عمليات الأمانات والعمال تحت الطلبات — لمن له صلاحيتهما، أو عمليات على جهازه. */
  const opsBox = homeOps();
  content.append(kitBox, secBox, card, opsBox?.node ?? null);

  /* القائمة أربعون أربعون: سجلّ سنةٍ كاملة لا يُرسم دفعةً على الهاتف. */
  const PAGE = 40;
  let shown = PAGE;

  async function refresh() {
    /* المواد تُطلب مع الطلبات لا بعدها: الأقسام لا تنتظر قائمةً لا تخصّها،
       ولا تغيب إن تعذّرت الطلبات وحدها. */
    const loading = loadData().catch(() => null);
    loading.then((data) => {
      /* تعذّرت المواد (الهاتف بلا شبكة): تبقى الأيقونات كما رُسمت آخر مرة. */
      if (!data || !content.isConnected) return;
      const tiles = sectionTiles(data, trusted);
      clear(secBox);
      if (tiles) secBox.append(tiles);
      clear(kitBox);
      if (hero && data.kits?.length) kitBox.append(homeKits(data.kits));
    });
    /* والعمليات مع الطلبات لا بعدها: تعذّرها لا يحبس «طلباتي». */
    opsBox?.refresh().catch(() => {});
    const uid = currentUserId();
    let mine = [];
    let problem = null;
    let kept = storageKept();
    try {
      /* طلبات الحساب في السحابة كلّها — قليلةٌ: ما ينتظر، وما قُرِّر ولم
         يصل إلى جهازه بعد. ثم تُدمج بسجلّ الجهاز ويُحذف ما وصل قراره. */
      const read = ++requestReads;
      /* ووقت بدئها: ما حفظته صفحةٌ أخرى على الهاتف من قراءةٍ بدأت بعدها لا تغلبه. */
      const readAt = Date.now();
      const cloud = await all('gc_requests?select=*&order=created_at.desc,id.desc');
      if (read < requestsSettled) return;
      requestsSettled = read;
      const settled = settleRequests(uid, cloud, ackRequest, readAt);
      mine = settled.view;
      kept &&= settled.kept;
      settled.done.catch(() => {});
    } catch (err) {
      /* السحابة لا تُقرأ (الهاتف بلا شبكة): ما على الجهاز يُعرض كما هو،
         ويُقال لماذا لم يُحدَّث. */
      problem = err.message;
      mine = localHistory(uid);
    }
    const data = await loading;
    if (!content.isConnected) return;
    paintKept(kept);
    paint(mine, data, problem);
  }

  function paint(mine, data, problem) {
    clear(list);
    if (problem) list.append(h('div', { class: 'card-body' }, h('div', { class: 'bad-box' }, icon('alert', 18), problem)));
    if (!mine.length) {
      if (!problem) {
        list.append(emptyState('لا طلبات بعد', hero ? 'اضغط «اطلب مواد» في الأعلى'
          : types.length ? 'اضغط «طلب إدخال» أو «طلب إخراج» في الأعلى' : null, null, 'list'));
      }
      return;
    }
    list.append(h('div', { class: 'feed' }, ...mine.slice(0, shown).map((r) => {
      const lines = linesOf(r);
      const wh = data?.allWarehouses.find((w) => w.id === r.warehouse_id);
      const house = data?.houses.find((x) => x.id === r.house_id);
      const again = resupplyOf(r);
      return h('a', {
        class: `feed-item req-item req-${r.gone ? 'gone' : r.status} req-stage-${displayStatus(r)}`,
        href: 'javascript:void 0', onclick: () => openRequest(r, refresh),
      },
        opIcon(r.type, 18),
        h('div', { class: 'f-main' },
          h('div', { class: 'f-title' }, h('b', {}, requestTitle(r.type, r.direct)), ...lineCount(lines),
            voucherChip(r)),
          trackDots(r),
          h('div', { class: 'f-meta' }, ...dots(fmtDateTime(r.created_at), wh?.name, house ? houseLabel(house.code) : null)),
          again ? h('div', { class: 'req-again' }, icon('history', 13), `تجهيز مكرر: ${again}`) : null,
          decisionNote(r)),
        h('div', { class: 'f-side' }, requestState(r)));
    })));
    if (mine.length > shown) {
      list.append(h('div', { class: 'card-body', style: 'text-align:center' },
        h('button', { class: 'btn btn-sm', type: 'button', onclick: () => { shown += PAGE; paint(mine, data, problem); } },
          icon('chevronDown', 15), 'عرض المزيد')));
    }
  }

  await refresh();
  /* تنقّل الموظف قبل أن تصل طلباته: لا مؤقّت لشاشةٍ لم تعد معروضة. */
  if (!content.isConnected) return null;
  const timer = setInterval(refresh, 30 * 1000);
  return { refresh, cleanup: () => clearInterval(timer) };
}

/**
 * عدد ما في الطلب تحت عنوانه: «N مادة» للمواد — ولا «0 مادة» لطلبٍ أطقمه وحدها —
 * ثم شارةٌ لكل طقم «طقم: الاسم × العدد»، أجزاءً تُترجم كلٌّ وحده. وشاشة طلبات
 * «الإدارة» (admin.js) تكتبه كذلك.
 */
export function lineCount(lines) {
  const items = lines.filter((l) => !l.kit_id).length;
  return [
    items ? h('span', { class: 'muted' }, `${items} مادة`) : null,
    ...lines.filter((l) => l.kit_id).map((l) => h('span', { class: 'req-kit' }, icon('kit', 12),
      h('span', {}, 'طقم:'), ' ', h('span', { translate: 'no' }, l.name ?? ''), ` × ${num(l.qty)}`)),
  ];
}

/** بند الطقم في درج الطلب: اسمه وشارته، و«ما بداخله» كما رآه صاحبه — لطقمٍ واحد.
    ودرج الطلب في «الإدارة» (admin.js) يرسمه كذلك. */
export function kitCell(l) {
  const contents = Array.isArray(l.contents) ? l.contents : [];
  return h('div', { class: 'req-kit-cell' },
    h('b', { translate: 'no' }, l.name ?? '—'), ' ', badge('طقم جاهز', 'info'),
    l.resupply ? h('div', { class: 'req-again' }, icon('history', 12), h('span', {}, 'جُهّز سابقاً')) : null,
    contents.length
      ? h('details', { class: 'p-kit-details' }, h('summary', {}, h('span', {}, 'ما بداخله'), ' (', num(contents.length), ')'),
          h('div', { class: 'small muted' }, 'الكمية لطقمٍ واحد'),
          h('ul', { class: 'p-kit-list' }, ...contents.map((c) => h('li', {},
            h('span', { class: 'pkl-name' }, c.name ?? ''), h('b', { class: 'pkl-qty' }, ...amount(c.qty, c.unit))))))
      : null);
}

/** شريط الأطقم في رئيسية الطالب: أيقونةٌ لكل طقم تفتح قائمة الطلبات عليه. */
function homeKits(kits) {
  return h('div', { class: 'card p-home-kits' },
    h('div', { class: 'card-head' }, h('h3', {}, icon('kit', 18), 'أطقم جاهزة')),
    h('div', { class: 'p-kit-tiles' }, ...kits.map((k) => h('a', {
      class: 'p-kit-tile', href: `#/menu?section=kits&kit=${k.id}`, 'data-kit': k.id, style: `--sc:${k.color || 'var(--op-out)'}`,
    }, h('span', { class: 'pkt-ico' }, icon(k.icon || 'kit', 22)), h('b', {}, k.name)))));
}

function openRequest(r, onChanged) {
  const lines = linesOf(r);
  const data = state.data;
  const wh = data?.allWarehouses.find((w) => w.id === r.warehouse_id);
  const house = data?.houses.find((x) => x.id === r.house_id);
  const sectionName = (id) => data?.categories.find((c) => c.id === Number(id))?.name ?? null;
  const fact = (label, value) => (value ? h('div', { class: 'fact' }, h('span', {}, label), h('b', {}, value)) : null);

  const d = drawer({
    head: h('div', { style: 'display:flex;gap:10px;align-items:center' }, opIcon(r.type, 20, true),
      h('div', {}, h('h3', {}, requestTitle(r.type, r.direct)), h('div', { class: 'sub' }, fmtDateTime(r.created_at)))),
    body: h('div', { class: 'form-grid' },
      h('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' }, requestState(r), voucherChip(r)),
      /* المراحل كلّها بأوقاتها، وفيها سبب الردّ أو الإلغاء. */
      trackList(r),

      r.gone
        ? h('div', { class: 'info-box' }, icon('info', 18), h('div', { class: 'small' },
            'حُذف هذا الطلب من السحابة قبل أن يصل قراره إلى هذا الجهاز: سُحب أو وصل قراره إلى جهازٍ آخر لحسابك، أو مضى على قراره أكثر من ثلاثين يوماً. اسأل المدير عنه.'))
        : null,
      h('div', { class: 'facts' },
        fact('رقم السند', r.voucher_number),
        fact('المخزن', wh?.name),
        fact('المنزل', house ? `${house.code} — قطاع ${house.block_code}` : null),
        fact(r.type === 'in' ? 'المجهّز' : 'الجهة', r.party),
        fact('المستلم', r.receiver_name),
        fact('المرجع', r.reference),
        fact('التاريخ', r.voucher_date ? fmtDate(r.voucher_date) : null),
        fact('قرّره', r.decided_by),
        fact('في', r.decided_at ? fmtDateTime(r.decided_at) : null)),
      table([
        { title: '#', render: (_, i) => String(i + 1) },
        { title: 'المادة', render: (l) => (l.kit_id ? kitCell(l) : h('div', {}, h('b', {}, l.name ?? '—'),
          /* بند الطقم ليس «مادة جديدة»: لا مادة له ولا قسم. */
          !l.item_id && !l.kit_id ? h('div', { class: 'small muted' }, ...dots('مادة جديدة', sectionName(l.category_id))) : null,
          /* نُبّه صاحب الطلب حين أرسله أن المنزل جُهّز بها، فأرسل. */
          l.resupply ? h('div', { class: 'req-again' }, icon('history', 12), h('span', {}, 'جُهّز سابقاً'),
            Number(l.prior_net) > 0 ? [' ', num(l.prior_net), l.unit ? [' ', h('span', {}, l.unit)] : null] : null) : null)) },
        { title: 'الكمية', class: 'num', render: (l) => (l.kit_id ? h('b', { class: 'req-kit-n' }, '× ', num(l.qty)) : amount(l.qty, l.unit)) },
        { title: 'ملاحظة', phone: false, render: (l) => l.notes || '' },
      ], lines),
      r.notes ? h('div', { class: 'req-note', translate: 'no' }, r.notes) : null),
    footer: r.status === 'pending' && !r.gone
      ? [h('button', {
          class: 'btn btn-danger',
          onclick: async (e) => {
            /* الزرّ نفسه لا ما ضُغط فيه: الضغط على أيقونته يجعل target هو
               الـ svg، فيبقى الزرّ يعمل ويُرسل السحب مرّتين. */
            const btn = e.currentTarget;
            if (btn.disabled) return;
            btn.disabled = true;
            try {
              /* يُحذف من السحابة، ويبقى في سجلّ الجهاز «مسحوباً». */
              const done = await withdraw(r.id, r);
              toast(done ? 'سُحب الطلب' : 'تعذّر السحب — وصل الطلب إلى الحاسوب الرئيسي', done ? 'success' : 'error');
              d.close();
              onChanged?.();
            } catch (err) {
              btn.disabled = false;
              toast(err.message, 'error');
            }
          },
        }, icon('undo', 16), 'سحب الطلب')]
      : null,
  });
}

/* ============================== الأقسام ==============================
   كل قسم أيقونةٌ في الرئيسية بلونه، وضغطتها تفتح القسم: موادّه كلّها
   بأرصدتها في المخزن المختار، وعدّادات حالها. وما دخل القسم وخرج منه
   في السندات على الحاسوب الرئيسي وحده — السندات لا تُرفع إلى السحابة.

   ومن القسم يُطلب الإدخال أو الإخراج مباشرةً: لمادةٍ بزرّها، أو لموادّ
   تُحدَّد بكمياتها ثم تُطلب معاً. والطلب نفسه نموذج «طلب جديد» مفتوحاً
   على القسم وفيه المواد بكمياتها (request.js) — فيبقى ما يفحصه النموذج
   كما هو: الرصيد، والوجهة، وتنبيه «التجهيز المكرر». وبعد الإرسال يعود
   الموظف إلى القسم. */

/** القسم في العنوان: رقمه، و0 لـ«بلا قسم» — كما يفتحه البرنامج. */
const sectionParam = (g) => (g.key === NO_SECTION ? '0' : String(g.id));

/**
 * حال موادّ القسم برصيدها كما يعدّها البرنامج في رئيسيته: فيها رصيد،
 * ونافدة، وعند حدّها الأدنى — ومنها النافدة إن كان لها حدّ.
 */
function sectionCounts(items, qty) {
  const out = { items: items.length, stocked: 0, low: 0, zero: 0 };
  for (const it of items) {
    const q = qty(it);
    if (q > 0) out.stocked++;
    else out.zero++;
    if (Number(it.min_qty) > 0 && q <= Number(it.min_qty)) out.low++;
  }
  return out;
}

/**
 * رابط الطلب من القسم: نوعه، والقسم مفتوحاً فيه، والمواد بكمياتها
 * (‎items=12:5,14‎ — المادة بلا كمية تُكتب كميتها في النموذج)، والعودة
 * إلى القسم بعد الإرسال.
 */
function requestLink(type, g, picks = []) {
  const at = sectionParam(g);
  const items = picks.map(([id, qty]) => (Number(qty) > 0 ? `${id}:${Number(qty)}` : String(id))).join(',');
  return `#/new/${type}?section=${at}${items ? `&items=${items}` : ''}&back=section/${at}`;
}

/**
 * أيقونات الأقسام في الرئيسية: لكل قسم لونه وأيقونته وعدد موادّه، وما
 * نفد منها وما بلغ حدّه — فيُعرف من النظرة أين النقص. و«بلا قسم» آخرها
 * إن بقيت مادة لم تُوضع في قسم. وسحابةٌ بلا أقسام (السكربت القديم): لا شيء.
 * والطالب: القسم باسمه وأيقونته وحدهما — بلا عددٍ ولا نفاد — يفتح قائمة
 * الطلبات عليه (menu.js).
 */
function sectionTiles(data, trusted = true) {
  if (!data?.categories.length) return null;
  const groups = bySection(data.items.filter((i) => i.active !== 0), data);
  const flag = (n, label, tone) => (n ? h('span', { class: `ph-flag ${tone}` }, num(n), ' ', h('span', {}, label)) : null);
  return h('div', { class: 'p-home-secs' },
    h('div', { class: 'p-home-secs-head' }, h('h3', {}, icon('grid', 18), 'الأقسام')),
    h('div', { class: 'p-home-tiles' }, ...groups.map((g) => {
      if (!trusted) {
        return h('a', { class: 'p-home-tile', href: `#/menu?section=${sectionParam(g)}`, style: `--sc:${sectionColor(g)}` },
          h('span', { class: 'p-sec-ico' }, icon(g.icon, 26)),
          h('b', {}, g.name));
      }
      const c = sectionCounts(g.items, (i) => i.total);
      return h('a', { class: 'p-home-tile', href: `#/section/${sectionParam(g)}`, style: `--sc:${sectionColor(g)}` },
        h('span', { class: 'p-sec-ico' }, icon(g.icon, 26)),
        h('b', {}, g.name),
        h('span', { class: 'n' }, `${num(c.items)} مادة`),
        c.zero || c.low ? h('span', { class: 'ph-flags' }, flag(c.zero, 'نافدة', 'bad'), flag(c.low, 'عند الحدّ', 'warn')) : null);
    })));
}

export async function section({ content, route }) {
  const key = route.param === '0' || route.param === NO_SECTION ? NO_SECTION : Number(route.param);
  const types = ['in', 'out'].filter(canRequest);
  const view = { wh: null, q: '', state: 'all' };
  /* المواد المحدَّدة لتُطلب معاً: المادة ← كميتها كما كُتبت ('' بلا كمية). */
  const picked = new Map();
  const body = h('div', {}, loadingState(6));
  content.append(body);

  async function refresh(force = false) {
    const data = await loadData(force);
    if (!content.isConnected) return;
    /* القسم موجودٌ وإن أُوقفت موادّه كلّها: الموقوفة لا تُعرض. */
    const every = bySection(data.items, data).find((g) => g.key === key);
    if (!every) {
      clear(body).append(h('div', { class: 'card' }, emptyState('القسم غير موجود', null,
        h('a', { class: 'btn', href: '#/home' }, icon('home', 16), 'الرئيسية'), 'grid')));
      return;
    }
    const sec = { ...every, items: every.items.filter((i) => i.active !== 0) };
    /* المخزن: ما يعمل منه الموظف إن اختاره من قبل، وإلا كل المخازن. */
    if (view.wh === null) {
      let saved = '';
      try { saved = localStorage.getItem(WH_KEY) ?? ''; } catch { /* لا تخزين */ }
      view.wh = saved;
    }
    if (!data.warehouses.some((w) => String(w.id) === view.wh)) view.wh = '';
    for (const id of [...picked.keys()]) if (!sec.items.some((i) => i.id === id)) picked.delete(id);
    const qty = (it) => (view.wh ? Number(it.stock[view.wh] ?? 0) : it.total);
    const color = `--sc:${sectionColor(sec)}`;

    const hero = h('div', { class: 'p-sec-hero', style: color },
      h('a', { class: 'btn btn-sm btn-ghost p-sec-back', href: '#/home' }, icon('chevron', 16), 'كل الأقسام'),
      h('div', { class: 'ph-title' },
        h('span', { class: 'p-sec-ico' }, icon(sec.icon, 28)),
        h('div', {}, h('h2', {}, sec.name), h('p', {}, `${num(sec.items.length)} مادة`))),
      /* الإدخال والإخراج من القسم نفسه — ما يملكه الحساب منهما، بأسمائهما
         له: «طلب إخراج» لمن ينتظر المدير، و«إخراج مباشر» لمن يُسجَّل طلبه. */
      types.length ? h('div', { class: 'ph-acts' }, ...types.map((type) => h('a', {
        class: 'btn btn-op btn-lg', 'data-op': type, href: requestLink(type, sec),
      }, icon(OPS[type].icon, 19), requestTitle(type)))) : null);

    const countsBox = h('div', { class: 'p-sec-counts' });
    const pickWarehouse = (e) => {
      view.wh = e.target.value;
      /* مخزنٌ بعينه يبقى للطلب أيضاً: يُطلب منه ما رُئي رصيده فيه. */
      if (view.wh) {
        try { localStorage.setItem(WH_KEY, view.wh); } catch { /* لا تخزين */ }
      }
      paintCounts();
      paintList();
    };
    const whSel = h('select', { onchange: pickWarehouse },
      h('option', { value: '' }, 'كل المخازن'),
      ...data.warehouses.map((w) => h('option', { value: w.id, selected: String(w.id) === view.wh }, w.name)));
    const search = h('input', { type: 'search', class: 'grow', placeholder: 'ابحث باسم المادة أو رمزها…', value: view.q,
      oninput: debounce((e) => { view.q = e.target.value; paintList(); }, 150) });
    const listBox = h('div', {});
    const bar = h('div', { class: 'p-pick-bar', hidden: true });
    clear(body).append(hero, countsBox,
      h('div', { class: 'toolbar', style: 'margin-bottom:12px' }, search, whSel,
        h('button', { class: 'btn btn-sm', onclick: () => reload() }, icon('undo', 15), 'تحديث')),
      h('div', { class: 'card p-sec-card', style: color }, listBox),
      bar);

    /* العدّادات أزرارٌ تصفّي القائمة بها، وضغطةٌ ثانية تعيد الكل. */
    function paintCounts() {
      const c = sectionCounts(sec.items, qty);
      clear(countsBox).append(...[
        ['all', 'عدد المواد', c.items, 'box', ''],
        ['stocked', 'فيها رصيد', c.stocked, 'checkCircle', 'ok'],
        ['low', 'عند الحدّ', c.low, 'alert', 'warn'],
        ['zero', 'نافدة', c.zero, 'xCircle', 'bad'],
      ].map(([state, label, n, ic, tone]) => h('button', {
        type: 'button', class: `p-sec-count${tone ? ` ${tone}` : ''}${view.state === state ? ' on' : ''}`,
        'aria-pressed': String(view.state === state),
        onclick: () => { view.state = view.state === state ? 'all' : state; paintCounts(); paintList(); },
      }, h('span', {}, icon(ic, 15), label), h('b', {}, num(n)))));
    }

    function paintList() {
      const q = fold(view.q);
      let list = sec.items;
      if (q) list = list.filter((i) => fold(`${i.name} ${i.sku}`).includes(q));
      if (view.state === 'stocked') list = list.filter((i) => qty(i) > 0);
      if (view.state === 'low') list = list.filter((i) => Number(i.min_qty) > 0 && qty(i) <= Number(i.min_qty));
      if (view.state === 'zero') list = list.filter((i) => qty(i) <= 0);
      list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'ar'));
      clear(listBox).append(list.length
        ? h('div', { class: 'p-mats' }, ...list.slice(0, 400).map(matRow))
        : emptyState(q ? 'لا مادة بهذا الاسم' : sec.items.length ? 'لا مواد' : 'لا مواد في هذا القسم بعد', null, null, 'box'));
    }

    /**
     * سطر المادة: اسمها ورمزها وحالها، ورصيدها بوحدتها كبيراً، وزرّا الطلب
     * لها وحدها، وزرّ رصيدها في كل مخزن. ومن يملك الطلب يحدّدها بضغطة على
     * السطر فتظهر خانة كميتها — ثم تُطلب المحدَّدة معاً من الشريط أسفل الشاشة.
     */
    function matRow(it) {
      const q = qty(it);
      const min = Number(it.min_qty) || 0;
      const on = picked.has(it.id);
      const toggle = () => {
        if (on) picked.delete(it.id);
        else picked.set(it.id, '');
        const fresh = matRow(it);
        row.replaceWith(fresh);
        paintBar();
        if (!on) setTimeout(() => fresh.querySelector('.pm-qty input')?.focus(), 20);
      };
      const row = h('div', {
        /* حسابٌ لا يطلب: لا خانة تحديد، فعمودان لا ثلاثة (portal.css ‎.no-pick‎). */
        class: `p-mat${on ? ' on' : ''}${types.length ? '' : ' no-pick'}`, 'data-item': it.id,
        /* السطر كلّه هدفٌ للإصبع — إلا أزراره وخانة كميتها. ومن لا يطلب
           يُفتح له رصيد المادة في كل مخزن. */
        onclick: (e) => {
          if (e.target.closest('a, button, input, label')) return;
          if (types.length) toggle();
          else openItem(it);
        },
      },
      types.length
        ? h('button', { type: 'button', class: 'p-mat-check', role: 'checkbox', 'aria-checked': String(on), 'aria-label': it.name, onclick: toggle },
            icon('check', 16))
        : null,
      h('div', { class: 'pm-main' },
        h('div', { class: 'pm-name' }, it.name),
        h('div', { class: 'pm-meta' }, h('span', { class: 'ltr', translate: 'no' }, it.sku),
          q <= 0 ? badge('نافدة', 'bad') : min > 0 && q <= min ? badge('عند الحدّ', 'warn') : null)),
      h('div', { class: 'pm-side' },
        h('b', { class: `pm-bal${q <= 0 ? ' zero' : ''}` }, num(q), it.unit ? [' ', h('span', {}, it.unit)] : null),
        h('div', { class: 'pm-ops' },
          ...types.map((type) => h('button', {
            type: 'button', class: 'pm-op', 'data-op': type, title: requestTitle(type),
            onclick: () => go(requestLink(type, sec, [[it.id, picked.get(it.id)]])),
          }, icon(OPS[type].icon, 17))),
          h('button', { type: 'button', class: 'pm-op', title: 'الرصيد في كل مخزن', onclick: () => openItem(it) }, icon('layers', 17)))),
      on
        ? h('label', { class: 'pm-qty' }, h('span', {}, 'الكمية'),
            h('input', {
              type: 'number', min: '0', step: 'any', inputmode: 'decimal', placeholder: '0', value: picked.get(it.id),
              oninput: (e) => picked.set(it.id, e.target.value),
              onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } },
            }),
            it.unit ? h('span', {}, it.unit) : null)
        : null);
      return row;
    }

    /* شريط المحدَّد أسفل الشاشة: عددها، وطلبها معاً بكل نوعٍ يملكه الحساب. */
    function paintBar() {
      clear(bar);
      bar.hidden = !picked.size;
      if (!picked.size) return;
      bar.append(
        h('div', { class: 'pb-count' }, icon('checkCircle', 18), h('b', {}, `${num(picked.size)} مادة`),
          h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: () => { picked.clear(); paintList(); paintBar(); } },
            'إلغاء التحديد')),
        h('div', { class: 'pb-acts' }, ...types.map((type) => h('button', {
          type: 'button', class: 'btn btn-op', 'data-op': type,
          onclick: () => go(requestLink(type, sec, [...picked])),
        }, icon(OPS[type].icon, 17), requestTitle(type)))));
    }

    paintCounts();
    paintList();
    paintBar();
  }

  /* «تحديث» والعودة إلى الصفحة: إن تعذّر يبقى ما عُرض، ويُقال السبب. */
  async function reload() {
    try {
      await refresh(true);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  await refresh();
  return { refresh: reload };
}

/* ============================== المواد ==============================
   المواد بأقسامها وأرصدتها — للمعتمد: لا دفتر مخزنٍ في السحابة. والطالب
   يرى المواد في قائمة الطلبات (menu.js) بلا أرصدة. */

/* القسم المختار يبقى بين التنقّلات: من يتابع الكهرباء يعود إليها. */
let stockSection = '';

export async function stock({ content }) {
  const view = { wh: '', q: '', state: 'all' };
  const head = h('div', { class: 'page-head' },
    h('div', {}, h('h2', {}, 'المواد'),
      h('p', {}, 'المواد بأقسامها وأرصدتها كما رفعها الحاسوب الرئيسي')));
  const body = h('div', {}, loadingState(6));
  content.append(head, body);

  async function refresh(force = false) {
    const data = await loadData(force);
    if (!content.isConnected) return;
    const whSel = h('select', { onchange: (e) => { view.wh = e.target.value; paint(); } },
      h('option', { value: '' }, 'كل المخازن'),
      ...data.warehouses.map((w) => h('option', { value: w.id, selected: String(w.id) === view.wh }, w.name)));
    const search = h('input', { placeholder: 'ابحث باسم المادة أو رمزها…', value: view.q,
      oninput: debounce((e) => { view.q = e.target.value; paint(); }, 150) });
    const seg = h('div', { class: 'seg' }, ...[['all', 'الكل'], ['low', 'عند الحدّ'], ['out', 'نافدة']].map(([k, label]) =>
      h('button', { type: 'button', class: view.state === k ? 'on' : null, onclick: () => { view.state = k; refresh(); } }, label)));
    const chips = h('div', { class: 'chips p-sec-chips' });
    const listBox = h('div', {});
    clear(body).append(h('div', { class: 'toolbar', style: 'margin-bottom:12px' }, search, whSel, seg,
      h('button', { class: 'btn btn-sm', onclick: () => reload() }, icon('undo', 15), 'تحديث')), chips, listBox);

    function paint() {
      const qty = (i) => (view.wh ? Number(i.stock[view.wh] ?? 0) : i.total);
      const q = fold(view.q);
      const pool = data.items.filter((i) => i.active !== 0);
      let list = pool;
      if (q) list = list.filter((i) => fold(`${i.name} ${i.sku}`).includes(q));
      if (view.state === 'low') list = list.filter((i) => Number(i.min_qty) > 0 && qty(i) <= Number(i.min_qty) && qty(i) > 0);
      if (view.state === 'out') list = list.filter((i) => qty(i) <= 0);

      const itemTable = (items, empty) => table([
        { title: 'المادة', render: (i) => h('div', { class: 'cell-main' }, h('b', {}, i.name), h('small', { class: 'ltr', translate: 'no' }, i.sku)) },
        { title: 'الرصيد', class: 'num', render: (i) => h('b', {}, num(qty(i)), ' ', h('span', {}, i.unit)) },
        { title: 'الحالة', render: (i) => (qty(i) <= 0 ? badge('نافدة', 'bad')
          : Number(i.min_qty) > 0 && qty(i) <= Number(i.min_qty) ? badge('عند الحدّ', 'warn') : null) },
      ], items, { onRow: (i) => openItem(i), empty });
      const none = (hint) => emptyState(q ? 'لا مادة بهذا الاسم' : hint, null, null, 'box');

      /* سحابةٌ بلا أقسام (السكربت القديم): جدولٌ واحد كما كان. */
      if (!data.categories.length) {
        clear(chips);
        clear(listBox).append(h('div', { class: 'card' }, itemTable(list.slice(0, 500), none('لا مواد'))));
        return;
      }

      /* أزرار الأقسام: كلّها ولو خلت، وعدد كلٍّ بعد البحث والحالة — فيُعرف
         أين وقع ما يُبحث عنه. و«بلا قسم» إن بقيت مادة لم تُوضع في قسم. */
      const sections = bySection(pool, data);
      if (stockSection && !sections.some((g) => String(g.key) === stockSection)) stockSection = '';
      const found = bySection(list, data);
      const inFound = (key) => found.find((g) => String(g.key) === String(key))?.items ?? [];
      const pick = (key) => { stockSection = key; paint(); };
      clear(chips).append(
        h('button', { type: 'button', class: `chip${stockSection ? '' : ' on'}`, onclick: () => pick('') },
          'كل الأقسام', h('span', { class: 'n' }, num(list.length))),
        ...sections.map((g) => h('button', {
          type: 'button', class: `chip p-sec-chip${String(g.key) === stockSection ? ' on' : ''}`, style: `--sc:${sectionColor(g)}`,
          onclick: () => pick(String(g.key)),
        }, icon(g.icon, 14), g.name, h('span', { class: 'n' }, num(inFound(g.key).length)))));

      /* «كل الأقسام»: بطاقةٌ لكل قسم فيه شيء، بترتيب الأقسام. والقسم
         المختار وحده: بطاقته ولو خلت. وخمسمئة سطر حدّ الشاشة. */
      const shown = stockSection
        ? sections.filter((g) => String(g.key) === stockSection)
        : sections.filter((g) => inFound(g.key).length);
      let budget = 500;
      const cards = shown.map((g) => {
        const items = inFound(g.key);
        const part = items.slice(0, Math.max(0, budget));
        budget -= part.length;
        return h('div', { class: 'card p-sec-card', style: `--sc:${sectionColor(g)}` },
          h('div', { class: 'card-head' },
            h('span', { class: 'p-sec-ico' }, icon(g.icon, 17)), h('h3', {}, g.name),
            h('div', { class: 'spacer' }), h('span', { class: 'sub' }, `${num(items.length)} مادة`)),
          itemTable(part, none('لا مواد في هذا القسم بعد')));
      });
      clear(listBox).append(...(cards.length ? cards : [h('div', { class: 'card' }, none('لا مواد'))]));
    }
    paint();
  }

  /* «تحديث» والعودة إلى الصفحة: إن تعذّر (الهاتف بلا شبكة) يبقى ما عُرض،
     ويُقال السبب — لا رفضٌ صامت بلا معالج. */
  async function reload() {
    try {
      await refresh(true);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  await refresh();
  return { refresh: reload };
}

/**
 * المادة في درجٍ جانبي: رصيدها في كل المخازن وفي كل مخزنٍ فيه منها شيء،
 * وحدّها الأدنى. وحركاتها في السندات على الحاسوب الرئيسي وحده: دفتر
 * الحركة لا يُرفع إلى السحابة.
 */
function openItem(item) {
  const data = state.data;
  const section = data.categories.find((c) => c.id === item.category_id);
  const min = Number(item.min_qty) || 0;
  const where = data.warehouses.filter((w) => Math.abs(Number(item.stock[w.id]) || 0) > 1e-9);
  drawer({
    title: item.name,
    sub: h('span', {}, h('span', { class: 'ltr', translate: 'no' }, item.sku),
      section ? [' · ', h('span', { class: 'p-sec-name', style: `--sc:${sectionColor(section)}` }, icon(section.icon, 13), section.name)] : null),
    body: h('div', { class: 'form-grid' },
      h('div', { class: 'kpis' },
        kpi({ label: 'الرصيد في كل المخازن', value: amount(item.total, item.unit), iconName: 'layers',
          tone: item.total <= 0 ? 'bad' : min > 0 && item.total <= min ? 'warn' : null }),
        min > 0 ? kpi({ label: 'الحدّ الأدنى', value: amount(min, item.unit), iconName: 'alert' }) : null),
      where.length
        ? table([
            { title: 'المخزن', render: (w) => w.name },
            { title: 'الرصيد', class: 'num', render: (w) => h('b', {}, ...amount(item.stock[w.id], item.unit)) },
          ], where)
        : h('div', { class: 'muted small' }, 'لا رصيد في أي مخزن')),
  });
}

/* ============================== المخطط ==============================
   للمعتمد: نسب الإنجاز على الخريطة كما ضبطها المدير، والمنزل يُفتح بنسبته
   وحاله. ومالكه وما صُرف له من سندات على الحاسوب الرئيسي وحده. */

const SVG_NS = 'http://www.w3.org/2000/svg';
function s(tag, props = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

/** ألوان القطاعات الباهتة تُعتَّم للخطّ والاسم — كما في البرنامج. */
function darken(hex, amount = 0.45) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const luma = (0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]) / 255;
  if (luma < 0.62) return hex;
  return `#${ch.map((v) => Math.round(v * (1 - amount)).toString(16).padStart(2, '0')).join('')}`;
}

const progressBand = (p) => (p <= 0 ? 0 : p >= 100 ? 5 : Math.min(4, Math.floor((p - 1) / 25) + 1));
const HOUSE_STATUS = { planned: 'مخطط', building: 'قيد البناء', finished: 'مكتمل', handed: 'مُسلَّم' };

let planZone = '';

export async function plan({ content }) {
  const data = await loadData();
  if (!content.isConnected) return null;
  const zones = [...new Set(data.blocks.filter((b) => b.kind !== 'green').map((b) => b.zone))].sort().reverse();
  if (!zones.length) {
    content.append(h('div', { class: 'card' }, emptyState('لا مخطط في السحابة بعد', 'يُرفع من الحاسوب الرئيسي', null, 'map')));
    return;
  }
  if (!zones.includes(planZone)) planZone = zones[0];

  const everyHouse = data.houses;
  const overall = everyHouse.length
    ? Math.round(everyHouse.reduce((t, x) => t + (Number(x.progress) || 0), 0) / everyHouse.length) : 0;
  const box = h('div', {});

  /* على الهاتف منازل المخطط صغيرة تحت الإصبع: المنزل يُفتح برقمه أو رمزه
     من هنا، كما يُختار في الطلب. */
  const findInput = h('input', { type: 'search', placeholder: 'رقم المنزل أو رمزه (D-15)…', class: 'ltr', style: 'text-align:right', autocomplete: 'off' });
  const found = h('div', { class: 'house-grid' });
  const paintFound = () => {
    const q = findInput.value.trim().toUpperCase();
    const exact = (x) => (x.code.toUpperCase() === q ? 0 : String(x.number).toUpperCase() === q ? 1 : 2);
    const list = q
      ? everyHouse.filter((x) => exact(x) < 2 || x.code.toUpperCase().includes(q)).sort((a, b) => exact(a) - exact(b)).slice(0, 60)
      : [];
    clear(found).append(...list.map((x) => h('button', {
      type: 'button', title: `${x.code} — ${x.progress}٪`, style: `--p:${x.progress}%`, onclick: () => openHouse(x),
    }, `${x.block_code}·${x.number}`)));
    if (q && !list.length) found.append(h('div', { class: 'hint' }, 'لا منزل بهذا الرقم'));
  };
  findInput.addEventListener('input', paintFound);
  findInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const hit = soleHouse(everyHouse, findInput.value);
    if (hit) openHouse(hit);
  });
  content.append(
    h('div', { class: 'page-head' }, h('div', {}, h('h2', {}, 'مخطط المشروع'), h('p', {}, 'نسب الإنجاز كما ضبطها المدير'))),
    h('div', { class: 'kpis', style: 'margin-bottom:14px' },
      kpi({ label: 'إنجاز المشروع', value: `${num(overall)}٪`, iconName: 'chart', hint: `${num(everyHouse.length)} منزلاً` }),
      kpi({ label: 'مكتملة', value: num(everyHouse.filter((x) => x.progress >= 100).length), iconName: 'checkCircle' }),
      kpi({ label: 'قيد البناء', value: num(everyHouse.filter((x) => x.progress > 0 && x.progress < 100).length), iconName: 'hardhat' })),
    h('div', { class: 'card', style: 'margin-bottom:14px' },
      h('div', { class: 'card-head' }, h('h3', {}, icon('search', 17), 'افتح منزلاً')),
      h('div', { class: 'p-house-find' }, findInput, found)),
    box);

  function draw() {
    const blocks = data.blocks.filter((b) => b.zone === planZone);
    const houses = data.houses.filter((x) => x.zone === planZone);
    const cw = Number(blocks[0]?.canvas_w) || 1000;
    const ch = Number(blocks[0]?.canvas_h) || 700;
    const svg = s('svg', { viewBox: [-8, -30, cw + 16, ch + 38].join(' '), class: 'plan-svg', preserveAspectRatio: 'xMidYMid meet', role: 'img' });
    const byBlock = new Map(blocks.map((b) => [b.id, []]));
    for (const x of houses) byBlock.get(x.block_id)?.push(x);

    for (const b of blocks) {
      svg.append(s('rect', {
        x: b.x, y: b.y, width: b.w, height: b.h, rx: 7, class: 'plan-block',
        fill: b.kind === 'green' ? b.color : 'none', 'fill-opacity': b.kind === 'green' ? 0.2 : 0,
        stroke: darken(b.color), 'stroke-opacity': b.kind === 'green' ? 0.45 : 0.35,
      }));
      if (b.kind === 'green') {
        svg.append(s('text', { x: Number(b.x) + Number(b.w) / 2, y: Number(b.y) + Number(b.h) / 2 + 4, class: 'plan-green-label', 'text-anchor': 'middle' }, b.name || 'مساحة خضراء'));
        continue;
      }
      const list = byBlock.get(b.id) ?? [];
      for (const x of list) {
        const band = progressBand(Number(x.progress) || 0);
        svg.append(s('rect', {
          x: x.x, y: x.y, width: x.w, height: x.h, rx: 2.5, class: 'plan-house',
          fill: `var(--plan-${band})`, tabindex: '0', role: 'button', 'aria-label': `${x.code} ${x.progress}٪`,
          onclick: () => openHouse(x),
          onkeydown: (e) => { if (e.key === 'Enter') openHouse(x); },
        }, s('title', {}, `${x.code} — ${x.progress}٪`)));
        if (Number(x.w) >= 18 && Number(x.h) >= 12) {
          svg.append(s('text', {
            x: Number(x.x) + Number(x.w) / 2, y: Number(x.y) + Number(x.h) / 2 + 3.4,
            class: band >= 3 ? 'plan-house-num on-dark' : 'plan-house-num', 'text-anchor': 'middle',
          }, x.number));
        }
      }
      const pct = list.length ? Math.round(list.reduce((t, x) => t + (Number(x.progress) || 0), 0) / list.length) : 0;
      svg.append(s('text', { x: Number(b.x) + Number(b.w) / 2, y: Number(b.y) - 7, class: 'plan-block-label', 'text-anchor': 'middle', fill: darken(b.color) },
        b.code, s('tspan', { class: 'plan-block-pct', dx: '4' }, `${pct}٪`)));
    }

    const key = (color, label) => h('span', { class: 'plan-key' }, h('i', { style: `background:${color}` }), label);
    clear(box).append(h('div', { class: 'card p-plan' },
      h('div', { class: 'card-head' },
        h('div', { class: 'seg' }, ...zones.map((z) => h('button', { type: 'button', class: z === planZone ? 'on' : null,
          onclick: () => { planZone = z; draw(); } }, `منطقة ${z}`)))),
      h('div', { class: 'plan-wrap' }, svg),
      h('div', { class: 'plan-legend' }, key('var(--plan-0)', 'لم يبدأ'), key('var(--plan-1)', '1–25%'),
        key('var(--plan-2)', '26–50%'), key('var(--plan-3)', '51–75%'), key('var(--plan-4)', '76–99%'), key('var(--plan-5)', 'مكتمل'))));
  }
  draw();
}

/** المنزل بنسبة إنجازه وحاله — وما يُطلب له يُطلب من «طلب إخراج». */
function openHouse(x) {
  const more = h('div', {});
  /* «مدير»: ومن نسخة المدير ما لا يخرج لغيره — صاحب المنزل وملاحظاته ومن حدّث إنجازه (admin.js). */
  if (state.me?.admin) import('./admin.js').then((m) => m.adminHouseFacts(x.id)).then((nodes) => more.append(...nodes)).catch(() => {});
  drawer({
    title: `منزل ${x.number} — قطاع ${x.block_code}`,
    sub: h('span', { class: 'ltr', translate: 'no' }, x.code),
    body: h('div', { class: 'house-card' },
      h('div', { style: 'display:flex;justify-content:space-between;align-items:center' },
        h('b', { style: 'font-size:22px' }, `${num(x.progress)}٪`), badge(HOUSE_STATUS[x.status] ?? x.status)),
      meter((Number(x.progress) || 0) / 100), more),
  });
}
