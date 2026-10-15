/* ============================ «الإدارة» — شاشات «مدير» ============================
   حساب «مدير» يرى على الموقع ما على الحاسوب الرئيسي كلّه، ولو كان مطفأً: الطلبات
   والسندات وأسطرها ودفتر الحركة والجرد والتقارير وسجلّ النشاط وحسابات الموقع ومالكي
   المنازل. يقرؤها من نسخة المدير في السحابة (gc_adm_*) كما رفعها الحاسوب — ولا
   يقرؤها غيره: سياساتها تسأل gc_admin().

   والنسخة تُرفع بعد كل تغييرٍ بدقائق (الجداول الثقيلة كل خمس دقائق على الأكثر)، فكل
   شاشةٍ تبدأ بشريطٍ يقول حتى متى هي محدّثة، وهل الحاسوب متصل. والطلبات الحيّة —
   ما لم يصل الحاسوب بعد، أو ينتظر قرارك — تُقرأ فوراً من دالّتها (gc_admin_requests).

   والشاشات للاطّلاع: تُقرأ صفحةً صفحة بمرشّحاتها في السحابة (التاريخ والنوع والحالة)
   لا جدولاً كاملاً. والأوقات (*_at) فيها نصّ UTC، فيُحوَّل اليوم المحلّي إلى حدَّيه
   بتوقيت UTC قبل أن يُصفّى به (utcStart / utcEnd) — والتواريخ (date) أيامٌ محلّية كما
   كُتبت فتُقارن كما هي. والأمانات والعمال والمواد والمخطط شاشاتها كما هي: للمدير كل
   الصلاحيات.
   ================================================================================== */

import {
  h, clear, icon, num, fmtDate, fmtDateTime, drawer, table, badge, emptyState, loadingState, kpi, debounce, exportCsv,
  today, daysAgo, fold,
} from '../ui.js';
import { OPS, opIcon } from '../ops.js';
import { rows, all, page, rpc } from './sb.js';
import { state, loadData, pcOnline, requestTitle } from './main.js';
import { displayStatus, timeline, currentStep, TRACK_LABELS } from './track.js';
import { loadPeople, ATTENDANCE } from './people.js';
import { ENTITIES, ACTIONS } from '../activity-labels.js';
import { lineCount, kitCell } from './views.js';

/* ------------------------------ الأيام والأوقات ------------------------------ */

/** اليوم بعد n يوماً من «YYYY-MM-DD» — بالتقويم لا بالساعات. */
export function addDays(day, n) {
  const [y, m, d] = String(day).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** أوّل لحظةٍ من اليوم المحلّي بتوقيت UTC، بصيغة الأعمدة: «2026-10-13 21:00:00». */
export const utcStart = (day) => new Date(`${day}T00:00:00`).toISOString().slice(0, 19).replace('T', ' ');

/** أوّل لحظةٍ من اليوم المحلّي التالي — الحدّ الأعلى بـ lt (لا lte). */
export const utcEnd = (day) => utcStart(addDays(day, 1));

/** مرشّح عمودٍ زمنيّ (created_at) على أيامٍ محلّية من..إلى — فارغٌ إن لم يُختر شيء. */
export function utcRange(column, from, to) {
  const enc = encodeURIComponent;
  return [from ? `&${column}=gte.${enc(utcStart(from))}` : '', to ? `&${column}=lt.${enc(utcEnd(to))}` : ''].join('');
}

/* ------------------------------ الحساب ------------------------------ */

/**
 * «حركة فترة»: لكل مادة ما دخل وما خرج وما حُوّل وما أُرجع، وتسوية الجرد بإشارتها —
 * أسطر التسوية كمياتها موجبة، والاتجاه في الملاحظة: «نقص» ينقص، وغيره يزيد.
 */
export function periodTotals(lines) {
  const out = new Map();
  for (const l of lines) {
    const t = out.get(l.item_id) ?? { item_id: l.item_id, in: 0, out: 0, transfer: 0, return: 0, adjust: 0 };
    const q = Number(l.qty) || 0;
    if (l.type === 'adjust') t.adjust += l.notes === 'نقص' ? -q : q;
    else if (['in', 'out', 'transfer', 'return'].includes(l.type)) t[l.type] += q;
    out.set(l.item_id, t);
  }
  return [...out.values()];
}

/**
 * دفتر مادةٍ في مخزن من..إلى: رصيد أوّل المدة (ما قبل من)، ثم كل حركةٍ برصيدها بعدها.
 * الحركات مرتّبةً بالتاريخ ثم المعرّف كما في الدفتر.
 */
export function ledgerRows(moves, from = '', to = '') {
  let balance = 0;
  let opening = 0;
  const list = [];
  for (const m of moves) {
    const q = Number(m.qty) || 0;
    if (from && String(m.date) < from) {
      balance += q;
      opening = balance;
      continue;
    }
    if (to && String(m.date) > to) continue;
    balance += q;
    list.push({ ...m, qty: q, balance });
  }
  return { opening, rows: list, closing: balance };
}

/* ------------------------------ أجزاء مشتركة ------------------------------ */

const fact = (label, value) => (value === null || value === undefined || value === ''
  ? null : h('div', { class: 'fact' }, h('span', {}, label), h('b', {}, value)));
const said = (text) => h('span', { translate: 'no' }, text);
const amount = (value, unit) => [num(value), unit ? [' ', h('span', {}, unit)] : null];
/** ملاحظة سطر السند أجزاءً بينها «، »: «طقم: X × 2» (ما جاء من طقمٍ جاهز) تُترجم كلمتها
    وحدها والاسم كما هو — كما على الحاسوب (voucher-view.js noteParts) — والباقي كما كُتب. */
const lineNote = (text) => String(text).split('، ').filter(Boolean).flatMap((part, i) => {
  const kit = /^طقم: (.*) × (\S+)$/.exec(part);
  const node = kit ? h('span', { class: 'kit-note-part' }, h('span', {}, 'طقم:'), ' ', said(kit[1]), ` × ${kit[2]}`) : said(part);
  return i ? ['، ', node] : [node];
});
const parseLines = (raw) => {
  if (Array.isArray(raw)) return raw;
  try {
    const list = JSON.parse(raw ?? '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

/** المواد والمخازن والمنازل بمعرّفاتها — من loadData (المواد كلّها، الموقوفة أيضاً). */
async function lookups() {
  const data = await loadData();
  return {
    data,
    item: new Map(data.items.map((i) => [i.id, i])),
    warehouse: new Map(data.allWarehouses.map((w) => [w.id, w])),
    house: new Map(data.houses.map((x) => [x.id, x])),
    category: new Map(data.categories.map((c) => [c.id, c])),
  };
}

/** شريط الحداثة: حتى متى نسخة المدير محدّثة، وهل الحاسوب متصل. */
function freshness() {
  const at = state.meta.admin_mirror_at;
  return h('div', { class: 'p-adm-fresh' },
    h('div', { class: 'paf-main' }, icon(at ? 'history' : 'info', 16),
      at
        ? h('span', {}, h('span', {}, 'نسخة المدير محدّثة حتى'), ' ', h('b', {}, fmtDateTime(at)))
        : h('span', {}, 'لم تُرفع نسخة المدير بعد — تُرفع خلال دقائق من فتح الحاسوب الرئيسي')),
    pcOnline() ? null : h('div', { class: 'paf-off' }, icon('alert', 15),
      h('span', {}, 'الحاسوب الرئيسي غير متصل — ما تراه آخر ما رفعه')));
}

/** رأس الشاشة: عنوانها، وطريق العودة إلى اللوحة، والشريط. */
function screenHead(content, title, sub) {
  content.append(
    h('div', { class: 'page-head p-adm-head' },
      h('div', {}, h('h2', {}, title), sub ? h('p', {}, sub) : null),
      h('a', { class: 'btn btn-sm btn-ghost', href: '#/admin' }, icon('grid', 15), 'لوحة المدير')),
    freshness());
}

/** خطأ قراءةٍ في مكانه — والشاشة باقية. */
const problemBox = (err) => h('div', { class: 'bad-box' }, icon('alert', 18), h('div', {}, err?.message ?? String(err)));

/** أزرار التبويب: الشريحة المختارة، وتغييرها. */
function tabs(list, value, onPick) {
  return h('div', { class: 'chips p-adm-tabs' }, ...list.map(([key, label]) => h('button', {
    type: 'button', class: `chip${key === value ? ' on' : ''}`, 'data-tab': key, onclick: () => onPick(key),
  }, label)));
}

/** حقلا «من» و«إلى» بتاريخ اليوم المحلّي. */
function dayRange(view, onChange) {
  const input = (key) => h('input', { type: 'date', value: view[key] ?? '', onchange: (e) => { view[key] = e.target.value; onChange(); } });
  return [h('label', { class: 'p-adm-day' }, h('span', {}, 'من'), input('from')),
    h('label', { class: 'p-adm-day' }, h('span', {}, 'إلى'), input('to'))];
}

/** صفحاتٌ تُقرأ تباعاً: «المزيد» ما دام شيءٌ باقياً — بالعدد الكلّي، أو بصفحةٍ ملأى. */
function pager({ load, paint, size }) {
  const st = { rows: [], total: null, busy: false, error: null };
  const more = () => (st.total === null ? st.rows.length % size === 0 && st.rows.length > 0 : st.rows.length < st.total);
  async function next(reset = false) {
    if (st.busy) return;
    st.busy = true;
    if (reset) Object.assign(st, { rows: [], total: null, error: null });
    try {
      const got = await load(st.rows.length, size);
      st.rows.push(...got.rows);
      st.total = got.total;
      st.error = null;
    } catch (err) {
      st.error = err;
    } finally {
      st.busy = false;
    }
    paint(st, more() ? h('button', { class: 'btn btn-sm p-adm-more', type: 'button', onclick: () => next() },
      icon('chevronDown', 15), 'المزيد') : null);
  }
  return { next, st };
}

/** عدد ما يطابق: من العدد الكلّي، وإلا بقراءة المعرّفات. */
async function countOf(path) {
  const got = await page(path, { limit: 1 });
  if (got.total !== null) return got.total;
  return (await all(path)).length;
}

/* ------------------------------ الطلبات: الحال ------------------------------ */

const STATES = {
  pending: { label: 'بانتظار الحاسوب الرئيسي', icon: 'clock' },
  received: { label: 'بانتظار موافقتك', icon: 'history' },
  posted: { label: 'سُجّل سنداً', icon: 'checkCircle' },
  preparing: { label: 'قيد التجهيز', icon: 'box' },
  prepared: { label: 'تم التجهيز', icon: 'checkCircle' },
  rejected: { label: 'مردود', icon: 'xCircle' },
  cancelled: { label: 'أُلغي سنده', icon: 'ban' },
};

/** طلبٌ كما رفعه الحاسوب (gc_adm_requests) أو كما في السحابة الآن (gc_admin_requests) — بشكلٍ واحد. */
function asRequest(r) {
  return { ...r, lines: parseLines(r.lines), direct: Boolean(Number(r.direct)) };
}

function stateChip(r) {
  const status = displayStatus(r);
  const s = STATES[status] ?? STATES.pending;
  return h('span', { class: `req-state ${status}` }, icon(s.icon, 13), s.label);
}

const STEP_ICON = { done: 'check', now: 'clock', bad: 'x' };

/** مراحل الطلب كما يراها صاحبه على هاتفه (track.js) — وما كتبه المدير كما كتبه. */
function trackSteps(r) {
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
        s.note ? h('div', { class: `req-note${s.state === 'bad' ? ' bad' : ''}` }, free ? said(s.note) : s.note) : null));
  }));
}

const trackDots = (r) => {
  const steps = timeline(r);
  return h('div', { class: 'p-track-dots', role: 'img', 'aria-label': currentStep(steps).label },
    ...steps.map((s) => h('span', { class: `dot ${s.state}` })));
};

const voucherChip = (r) => (r.voucher_number && ['posted', 'cancelled'].includes(r.status)
  ? h('span', { class: `req-voucher${r.status === 'cancelled' ? ' cancelled' : ''}` }, icon('file', 13),
    h('b', { class: 'ltr', translate: 'no' }, r.voucher_number))
  : null);

/* ============================== اللوحة ============================== */

/** أرقام اللوحة: ما ينتظر موافقتك، وما ينتظر تجهيزه، وسندات اليوم، والمواد عند حدّها. */
async function hubCounts() {
  const [received, live, preparing, vouchers, data] = await Promise.all([
    all('gc_adm_requests?select=id&status=eq.received').catch(() => []),
    rpc('gc_admin_requests').catch(() => []),
    countOf('gc_adm_requests?select=id&status=eq.posted&prep_status=eq.waiting&voucher_id=not.is.null').catch(() => null),
    countOf(`gc_adm_vouchers?select=id&date=eq.${today()}&status=eq.posted`).catch(() => null),
    loadData().catch(() => null),
  ]);
  const waiting = new Set([...received.map((r) => r.id), ...(Array.isArray(live) ? live : []).map((r) => r.id)]);
  const low = data ? data.items.filter((i) => i.active !== 0 && Number(i.min_qty) > 0 && i.total <= Number(i.min_qty)).length : null;
  return { waiting: waiting.size, preparing, vouchers, low };
}

function hubKpis(counts) {
  const value = (n) => (n === null || n === undefined ? '—' : num(n));
  return h('div', { class: 'kpis p-adm-kpis' },
    kpi({ label: 'بانتظار موافقتك', value: value(counts?.waiting), iconName: 'history', tone: counts?.waiting ? 'warn' : null, href: '#/admin/requests' }),
    kpi({ label: 'قيد التجهيز', value: value(counts?.preparing), iconName: 'box', href: '#/admin/requests?tab=preparing' }),
    kpi({ label: 'سندات اليوم', value: value(counts?.vouchers), iconName: 'file', href: '#/admin/vouchers' }),
    kpi({ label: 'مواد عند الحدّ', value: value(counts?.low), iconName: 'alert', tone: counts?.low ? 'bad' : null, href: '#/stock' }));
}

const TILES = [
  ['#/admin/requests', 'list', 'الطلبات', 'ما ينتظر قرارك، وما قُرّر'],
  ['#/admin/vouchers', 'file', 'السندات', 'بأسطرها، والجرد'],
  ['#/admin/ledger', 'layers', 'حركة المخزن', 'دفتر مادةٍ في مخزن'],
  ['#/stock', 'box', 'المواد والأرصدة', 'بأقسامها وأرصدتها'],
  ['#/plan', 'map', 'المخطط والمالكون', 'المنزل ومالكه ونسبته'],
  ['#/custody', 'opCustody', 'الأمانات', 'تسليمٌ وإعادة وتعهّد'],
  ['#/workers', 'hardhat', 'العمال والحضور', 'الملفّات والحضور اليومي'],
  ['#/admin/reports', 'report', 'التقارير', 'اليومي والفترة والمنزل'],
  ['#/admin/activity', 'clock', 'سجلّ النشاط', 'كل فعلٍ بفاعله ووقته'],
  ['#/admin/accounts', 'users', 'حسابات الموقع', 'من يدخل الموقع وبماذا'],
];

async function hub({ content }) {
  content.append(
    h('div', { class: 'page-head p-adm-head' }, h('div', {}, h('h2', {}, 'لوحة المدير'),
      h('p', {}, 'بيانات البرنامج كلّها كما رفعها الحاسوب الرئيسي — ولو كان مطفأً.'))),
    freshness());
  const box = h('div', {}, hubKpis(null));
  content.append(box, h('div', { class: 'p-adm-tiles' }, ...TILES.map(([href, glyph, title, hint]) =>
    h('a', { class: 'p-adm-tile', href }, h('span', { class: 'pat-ico' }, icon(glyph, 20)),
      h('div', {}, h('b', {}, title), h('small', {}, hint))))));
  const counts = await hubCounts();
  if (!content.isConnected) return null;
  clear(box).append(hubKpis(counts));
  return null;
}

/** بطاقة «لوحة المدير» في رئيسية المدير: الأرقام الأربعة، وتفتح اللوحة. */
export function adminHomeCard() {
  const box = h('div', {}, hubKpis(null));
  const card = h('div', { class: 'card p-adm-card' },
    h('div', { class: 'card-head' }, h('h3', {}, icon('grid', 18), 'لوحة المدير'), h('div', { class: 'spacer' }),
      h('a', { class: 'btn btn-sm', href: '#/admin' }, 'الإدارة', icon('arrowLeft', 15))),
    h('div', { class: 'card-body' }, box));
  hubCounts().then((counts) => { if (card.isConnected) clear(box).append(hubKpis(counts)); }).catch(() => {});
  return card;
}

/* ============================== الطلبات ============================== */

const REQUEST_TABS = [
  ['waiting', 'بانتظار الموافقة'], ['preparing', 'قيد التجهيز'], ['posted', 'سُجّلت'],
  ['rejected', 'مردودة'], ['cancelled', 'أُلغيت'], ['all', 'الكل'],
];
const REQUEST_FILTER = {
  waiting: '&status=eq.received',
  preparing: '&status=eq.posted&prep_status=eq.waiting&voucher_id=not.is.null',
  posted: '&status=eq.posted',
  rejected: '&status=eq.rejected',
  cancelled: '&status=eq.cancelled',
  all: '',
};

async function requests({ content, route }) {
  const view = { tab: Object.hasOwn(REQUEST_FILTER, route.query?.tab) ? route.query.tab : 'waiting', from: '', to: '' };
  screenHead(content, 'الطلبات', null);
  content.append(h('div', { class: 'p-adm-note' }, icon('info', 15),
    h('span', {}, 'سجلّ الطلبات يُحدَّث كل بضع دقائق — وما ينتظر الآن يظهر فوراً')));
  const bar = h('div', {});
  const liveBox = h('div', {});
  const listBox = h('div', {}, loadingState(4));
  content.append(bar, liveBox, listBox);
  let refs = await lookups().catch(() => null);
  if (!content.isConnected) return null;

  const item = (r) => {
    const wh = refs?.warehouse.get(r.warehouse_id);
    const house = refs?.house.get(r.house_id);
    return h('a', {
      class: `feed-item req-item req-${r.status} req-stage-${displayStatus(r)}`, 'data-request': r.id,
      href: 'javascript:void 0', onclick: () => openRequest(r, refs),
    },
      opIcon(r.type, 18),
      h('div', { class: 'f-main' },
        h('div', { class: 'f-title' }, h('b', {}, requestTitle(r.type, r.direct)), h('span', { translate: 'no' }, r.user_name),
          ...lineCount(r.lines), voucherChip(r)),
        trackDots(r),
        h('div', { class: 'f-meta' }, h('span', {}, fmtDateTime(r.created_at)),
          wh ? [' · ', h('span', {}, wh.name)] : null,
          house ? [' · ', h('span', {}, 'منزل'), ' ', h('span', { class: 'house-code', translate: 'no' }, house.code)] : null)),
      h('div', { class: 'f-side' }, stateChip(r)));
  };

  let live = [];
  const list = pager({
    size: 30,
    load: async (offset, limit) => {
      const filter = REQUEST_FILTER[view.tab] + utcRange('created_at', view.from, view.to);
      return page(`gc_adm_requests?select=*${filter}&order=created_at.desc,id.desc`, { limit, offset });
    },
    paint: (st, more) => {
      if (!content.isConnected) return;
      /* ما ينتظر قرارك: نسخة الحاسوب والسحابة الآن معاً — الأحدث منهما. */
      const seen = new Set();
      const shown = [];
      if (view.tab === 'waiting') {
        for (const r of live.filter((x) => x.status === 'received')) { seen.add(r.id); shown.push(r); }
      }
      for (const r of st.rows.map(asRequest)) if (!seen.has(r.id)) shown.push(r);
      clear(listBox).append(h('div', { class: 'card' },
        st.error ? h('div', { class: 'card-body' }, problemBox(st.error)) : null,
        shown.length ? h('div', { class: 'feed' }, ...shown.map(item))
          : st.error ? null : emptyState('لا طلبات هنا', null, null, 'list'),
        more ? h('div', { class: 'card-body', style: 'text-align:center' }, more) : null));
    },
  });

  async function paintLive() {
    clear(liveBox);
    if (view.tab !== 'waiting') return;
    try {
      const got = await rpc('gc_admin_requests');
      live = (Array.isArray(got) ? got : []).map(asRequest);
    } catch (err) {
      live = [];
      liveBox.append(h('div', { class: 'card card-body', style: 'margin-bottom:12px' }, problemBox(err)));
      return;
    }
    if (!content.isConnected) return;
    const pending = live.filter((r) => r.status === 'pending');
    if (!pending.length) return;
    liveBox.append(h('div', { class: 'card p-adm-live' },
      h('div', { class: 'card-head' }, h('h3', {}, icon('clock', 17), 'لم تصل إلى الحاسوب بعد'),
        h('span', { class: 'sub' }, num(pending.length))),
      h('div', { class: 'feed' }, ...pending.map(item))));
  }

  function paintBar() {
    clear(bar).append(
      tabs(REQUEST_TABS, view.tab, (key) => { view.tab = key; reload(); }),
      h('div', { class: 'toolbar p-adm-filters' }, ...dayRange(view, () => reload()),
        h('button', { class: 'btn btn-sm', type: 'button', onclick: () => reload() }, icon('undo', 15), 'تحديث')));
  }

  async function reload() {
    paintBar();
    clear(listBox).append(loadingState(4));
    refs = await lookups().catch(() => refs);
    await paintLive();
    await list.next(true);
  }

  await reload();
  return { refresh: reload };
}

/** درج الطلب: مراحله، وما فيه برصيده الآن في مخزنه — المدير يرى الأرقام. */
function openRequest(r, refs) {
  const wh = refs?.warehouse.get(r.warehouse_id);
  const house = refs?.house.get(r.house_id);
  const have = (id) => Number(refs?.item.get(Number(id))?.stock?.[r.warehouse_id] ?? 0);
  /* الطقم: كم طقماً يكفي رصيد المخزن الآن من موادّه — بما في الطلب منها (contents)،
     والحاسوب يوسّعه بتعريفه يوم الاعتماد. */
  const kitStock = (l) => {
    const contents = (Array.isArray(l.contents) ? l.contents : []).filter((c) => Number(c.qty) > 0);
    if (!refs || !contents.length) return '—';
    const fits = Math.max(0, Math.floor(Math.min(...contents.map((c) => have(c.item_id) / Number(c.qty))) + 1e-9));
    return h('span', { class: r.type === 'out' && fits < Number(l.qty) ? 'p-adm-short' : null },
      h('span', {}, 'يكفي لـ'), ' ', num(fits), ' ', h('span', {}, 'طقم'));
  };
  drawer({
    head: h('div', { style: 'display:flex;gap:10px;align-items:center' }, opIcon(r.type, 20, true),
      h('div', {}, h('h3', {}, requestTitle(r.type, r.direct)), h('div', { class: 'sub' }, fmtDateTime(r.created_at)))),
    body: h('div', { class: 'form-grid' },
      h('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' }, stateChip(r), voucherChip(r)),
      trackSteps(r),
      h('div', { class: 'facts' },
        fact('صاحب الطلب', said(r.user_name)),
        fact('رقم السند', r.voucher_number ? said(r.voucher_number) : null),
        fact('المخزن', wh?.name),
        fact('المنزل', house ? [h('span', { class: 'house-code', translate: 'no' }, house.code), ' — ', h('span', {}, 'قطاع'), ' ', said(house.block_code)] : null),
        fact(r.type === 'in' ? 'المجهّز' : 'الجهة', r.party ? said(r.party) : null),
        fact('المستلم', r.receiver_name ? said(r.receiver_name) : null),
        fact('المرجع', r.reference ? said(r.reference) : null),
        fact('التاريخ', r.voucher_date ? fmtDate(r.voucher_date) : null),
        fact('قرّره', r.decided_by ? said(r.decided_by) : null),
        fact('في', r.decided_at ? fmtDateTime(r.decided_at) : null)),
      table([
        /* بند الطقم (الإصدار الخامس) كما على هاتف صاحبه: اسمه وشارته و«ما بداخله» — لا «مادة جديدة». */
        { title: 'المادة', render: (l) => {
          if (l.kit_id) return kitCell(l);
          const it = refs?.item.get(Number(l.item_id));
          return h('div', {}, h('b', {}, l.name ?? it?.name ?? '—'),
            l.item_id ? null : h('div', { class: 'small muted' }, 'مادة جديدة'),
            l.resupply ? h('div', { class: 'req-again' }, icon('history', 12), h('span', {}, 'جُهّز سابقاً')) : null);
        } },
        { title: 'الكمية', class: 'num', render: (l) => (l.kit_id ? h('b', { class: 'req-kit-n' }, '× ', num(l.qty)) : amount(l.qty, l.unit)) },
        { title: 'في المخزن الآن', class: 'num', render: (l) => {
          if (l.kit_id) return kitStock(l);
          const it = refs?.item.get(Number(l.item_id));
          if (!it) return '—';
          return h('span', { class: r.type === 'out' && have(l.item_id) < Number(l.qty) ? 'p-adm-short' : null }, ...amount(have(l.item_id), it.unit));
        } },
        { title: 'ملاحظة', phone: false, render: (l) => (l.notes ? said(l.notes) : '') },
      ], r.lines),
      r.notes ? h('div', { class: 'req-note' }, said(r.notes)) : null),
  });
}

/* ============================== السندات ============================== */

const VOUCHER_TYPES = [['', 'كل الأنواع'], ['in', 'إدخال'], ['out', 'إخراج'], ['transfer', 'تحويل'], ['return', 'إرجاع'], ['adjust', 'تسوية']];
const VOUCHER_STATUS = [['', 'كل الحالات'], ['posted', 'سارٍ'], ['cancelled', 'ملغى']];

async function vouchers({ content, route }) {
  const view = { tab: route.query?.tab === 'counts' ? 'counts' : 'vouchers', type: '', status: '', wh: '', q: '',
    from: daysAgo(30), to: today() };
  screenHead(content, 'السندات', null);
  const bar = h('div', {});
  const listBox = h('div', {}, loadingState(5));
  content.append(bar, listBox);
  let refs = await lookups().catch(() => null);
  if (!content.isConnected) return null;

  const voucherList = pager({
    size: 50,
    load: (offset, limit) => {
      const q = view.q.trim().replace(/[*,()"]/g, ' ').trim();
      const filter = [
        view.type ? `&type=eq.${view.type}` : '',
        view.status ? `&status=eq.${view.status}` : '',
        view.wh ? `&warehouse_id=eq.${Number(view.wh)}` : '',
        q ? `&or=(number.ilike.*${encodeURIComponent(q)}*,party.ilike.*${encodeURIComponent(q)}*,receiver_name.ilike.*${encodeURIComponent(q)}*,requested_by.ilike.*${encodeURIComponent(q)}*)` : '',
      ].join('');
      return page(`gc_adm_vouchers?select=*&date=gte.${view.from || '0000-01-01'}&date=lte.${view.to || '9999-12-31'}${filter}&order=date.desc,id.desc`, { limit, offset });
    },
    paint: (st, more) => {
      if (!content.isConnected) return;
      clear(listBox).append(h('div', { class: 'card flush' },
        st.error ? h('div', { class: 'card-body' }, problemBox(st.error)) : null,
        table([
          { title: 'السند', render: (v) => h('div', { class: 'cell-main' }, h('b', { class: 'ltr', translate: 'no' }, v.number),
            h('small', {}, OPS[v.type]?.full ?? v.type)) },
          { title: 'التاريخ', render: (v) => h('span', { class: 'nowrap' }, fmtDate(v.date)) },
          { title: 'المخزن', phone: false, render: (v) => refs?.warehouse.get(v.warehouse_id)?.name ?? '—' },
          { title: 'الجهة', phone: false, render: (v) => partyOf(v, refs) },
          { title: '', render: (v) => (v.status === 'cancelled' ? badge('ملغى', 'bad') : null) },
        ], st.rows, {
          onRow: (v) => openVoucher(v, refs),
          rowClass: (v) => (v.status === 'cancelled' ? 'cancelled' : null),
          empty: st.error ? null : emptyState('لا سندات في هذه الفترة', null, null, 'file'),
        }),
        h('div', { class: 'card-foot' }, h('span', { class: 'muted' }, st.total === null ? num(st.rows.length) : [num(st.rows.length), ' / ', num(st.total)]),
          h('div', { class: 'spacer' }), more)));
    },
  });

  const countList = pager({
    size: 50,
    load: (offset, limit) => page('gc_adm_counts?select=*&order=date.desc,id.desc', { limit, offset }),
    paint: (st, more) => {
      if (!content.isConnected) return;
      clear(listBox).append(h('div', { class: 'card flush' },
        st.error ? h('div', { class: 'card-body' }, problemBox(st.error)) : null,
        table([
          { title: 'الجرد', render: (c) => h('b', { class: 'ltr', translate: 'no' }, c.number) },
          { title: 'التاريخ', render: (c) => fmtDate(c.date) },
          { title: 'المخزن', phone: false, render: (c) => refs?.warehouse.get(c.warehouse_id)?.name ?? '—' },
          { title: 'الحالة', render: (c) => (c.status === 'closed' ? badge('مُقفل', 'ok') : badge('مفتوح', 'warn')) },
        ], st.rows, { onRow: (c) => openCount(c, refs), empty: st.error ? null : emptyState('لا جرد بعد', null, null, 'list') }),
        more ? h('div', { class: 'card-foot' }, h('div', { class: 'spacer' }), more) : null));
    },
  });

  function paintBar() {
    const sel = (value, options, onPick) => h('select', { onchange: (e) => onPick(e.target.value) },
      ...options.map(([k, label]) => h('option', { value: k, selected: k === value }, label)));
    const search = h('input', { type: 'search', placeholder: 'رقم السند أو الجهة أو المستلم…', value: view.q,
      oninput: debounce((e) => { view.q = e.target.value; reload(false); }, 350) });
    clear(bar).append(tabs([['vouchers', 'السندات'], ['counts', 'الجرد']], view.tab, (key) => { view.tab = key; reload(); }),
      view.tab === 'vouchers'
        ? h('div', { class: 'toolbar p-adm-filters' },
          h('div', { class: 'grow input-icon' }, icon('search', 16), search),
          sel(view.type, VOUCHER_TYPES, (v) => { view.type = v; reload(false); }),
          sel(view.status, VOUCHER_STATUS, (v) => { view.status = v; reload(false); }),
          sel(view.wh, [['', 'كل المخازن'], ...(refs?.data.allWarehouses ?? []).map((w) => [String(w.id), w.name])], (v) => { view.wh = v; reload(false); }),
          ...dayRange(view, () => reload(false)))
        : null);
  }

  async function reload(bar = true) {
    if (bar) paintBar();
    clear(listBox).append(loadingState(5));
    refs = await lookups().catch(() => refs);
    await (view.tab === 'counts' ? countList : voucherList).next(true);
  }

  await reload();
  return { refresh: () => reload() };
}

/** الجهة كما تُعرض: المنزل للإخراج، وإلا الجهة المكتوبة. */
function partyOf(v, refs) {
  const house = refs?.house.get(v.house_id);
  if (house) return [h('span', {}, 'منزل'), ' ', h('span', { class: 'house-code', translate: 'no' }, house.code)];
  return v.party ? said(v.party) : '—';
}

async function openVoucher(v, refs) {
  const lines = h('div', {}, loadingState(3));
  const op = OPS[v.type] ?? OPS.in;
  const wh = refs?.warehouse.get(v.warehouse_id);
  const to = refs?.warehouse.get(v.to_warehouse_id);
  drawer({
    wide: true,
    head: h('div', { style: 'display:flex;gap:10px;align-items:center' }, opIcon(v.type, 20, true),
      h('div', {}, h('h3', {}, op.full, ' ', h('span', { class: 'ltr', translate: 'no' }, v.number)),
        h('div', { class: 'sub' }, fmtDate(v.date)))),
    body: h('div', { class: 'form-grid' },
      v.status === 'cancelled'
        ? h('div', { class: 'bad-box' }, icon('ban', 18), h('div', {}, h('b', {}, 'ملغى'),
          v.cancel_reason ? [' — ', said(v.cancel_reason)] : null))
        : null,
      h('div', { class: 'facts' },
        fact('المخزن', wh?.name),
        fact('إلى المخزن', to?.name),
        fact(v.type === 'in' ? 'المجهّز' : 'الجهة', partyOf(v, refs)),
        fact('المستلم', v.receiver_name ? said(v.receiver_name) : null),
        fact('المرجع', v.reference ? said(v.reference) : null),
        fact('طلبه من الموقع', v.requested_by ? said(v.requested_by) : null),
        fact('أنشأه', v.created_by_name ? [said(v.created_by_name), ' · ', h('span', {}, fmtDateTime(v.created_at))] : null),
        fact('عدّله', v.updated_by_name ? [said(v.updated_by_name), ' · ', h('span', {}, fmtDateTime(v.updated_at))] : null),
        fact('ألغاه', v.cancelled_by_name ? [said(v.cancelled_by_name), ' · ', h('span', {}, fmtDateTime(v.cancelled_at))] : null)),
      v.notes ? h('div', { class: 'req-note' }, said(v.notes)) : null,
      lines),
  });
  try {
    const list = await all(`gc_adm_voucher_lines?select=id,item_id,qty,unit_cost,item_condition,usage_location,notes&voucher_id=eq.${Number(v.id)}&order=id`);
    clear(lines).append(table([
      { title: 'المادة', render: (l) => {
        const it = refs?.item.get(l.item_id);
        return h('div', { class: 'cell-main' }, h('b', {}, it?.name ?? '—'), it ? h('small', { class: 'ltr', translate: 'no' }, it.sku) : null);
      } },
      { title: 'الكمية', class: 'num', render: (l) => h('span', {},
        v.type === 'adjust' ? (l.notes === 'نقص' ? '−' : '+') : null, ...amount(l.qty, refs?.item.get(l.item_id)?.unit)) },
      { title: 'الكلفة', class: 'num', phone: false, render: (l) => (Number(l.unit_cost) ? num(l.unit_cost) : '—') },
      { title: 'ملاحظة', phone: false, render: (l) => [...[l.item_condition, l.usage_location].filter(Boolean).map(said),
        v.type === 'adjust' || !l.notes ? null : lineNote(l.notes)].filter(Boolean).map((n, i) => [i ? ' · ' : null, n]) },
    ], list, { empty: emptyState('لا أسطر', null, null, 'list') }));
  } catch (err) {
    clear(lines).append(problemBox(err));
  }
}

async function openCount(c, refs) {
  const lines = h('div', {}, loadingState(3));
  drawer({
    wide: true,
    title: ['جرد', ' ', h('span', { class: 'ltr', translate: 'no' }, c.number)],
    sub: [fmtDate(c.date), ' · ', refs?.warehouse.get(c.warehouse_id)?.name ?? ''],
    body: h('div', { class: 'form-grid' }, c.notes ? h('div', { class: 'req-note' }, said(c.notes)) : null, lines),
  });
  try {
    const list = await all(`gc_adm_count_lines?select=id,item_id,system_qty,counted_qty,notes&count_id=eq.${Number(c.id)}&order=id`);
    clear(lines).append(table([
      { title: 'المادة', render: (l) => refs?.item.get(l.item_id)?.name ?? '—' },
      { title: 'في الدفتر', class: 'num', render: (l) => num(l.system_qty) },
      { title: 'المعدود', class: 'num', render: (l) => (l.counted_qty === null ? '—' : num(l.counted_qty)) },
      { title: 'الفرق', class: 'num', render: (l) => (l.counted_qty === null ? '—'
        : h('b', { class: Number(l.counted_qty) < Number(l.system_qty) ? 'p-adm-short' : null }, num(Number(l.counted_qty) - Number(l.system_qty)))) },
    ], list, { empty: emptyState('لا أسطر', null, null, 'list') }));
  } catch (err) {
    clear(lines).append(problemBox(err));
  }
}

/* ============================== حركة المخزن ============================== */

async function ledger({ content, route }) {
  screenHead(content, 'حركة المخزن', 'دفتر مادةٍ في مخزن: كل حركةٍ برصيدها بعدها.');
  const refs = await lookups().catch(() => null);
  if (!content.isConnected) return null;
  if (!refs) {
    content.append(h('div', { class: 'card card-body' }, problemBox(new Error('تعذّرت قراءة المواد — أعد المحاولة'))));
    return null;
  }
  const view = { item: Number(route.query?.item) || 0, wh: String(refs.data.warehouses[0]?.id ?? ''), from: daysAgo(90), to: today(), q: '' };
  const bar = h('div', {});
  const box = h('div', {});
  content.append(bar, box);

  const picker = h('div', { class: 'p-adm-pick' });
  function paintPicker() {
    const q = fold(view.q);
    const hits = q ? refs.data.items.filter((i) => fold(`${i.name} ${i.sku}`).includes(q)).slice(0, 30) : [];
    clear(picker).append(...hits.map((i) => h('button', { type: 'button', class: `pk-item${i.id === view.item ? ' on' : ''}`,
      onclick: () => { view.item = i.id; view.q = ''; paintBar(); load(); } },
      h('b', {}, i.name), h('small', { class: 'ltr', translate: 'no' }, i.sku), i.active === 0 ? badge('موقوفة', '') : null)));
  }
  function paintBar() {
    const chosen = refs.item.get(view.item);
    const search = h('input', { type: 'search', placeholder: 'ابحث عن مادة باسمها أو رمزها…', value: view.q,
      oninput: debounce((e) => { view.q = e.target.value; paintPicker(); }, 150) });
    clear(bar).append(h('div', { class: 'card card-body p-adm-ledger-bar' },
      chosen ? h('div', { class: 'p-adm-chosen' }, icon('box', 16), h('b', {}, chosen.name), h('small', { class: 'ltr', translate: 'no' }, chosen.sku)) : null,
      h('div', { class: 'input-icon' }, icon('search', 16), search), picker,
      h('div', { class: 'toolbar p-adm-filters' },
        h('select', { onchange: (e) => { view.wh = e.target.value; load(); } },
          ...refs.data.allWarehouses.map((w) => h('option', { value: w.id, selected: String(w.id) === view.wh }, w.name))),
        ...dayRange(view, () => load()))));
    paintPicker();
  }

  async function load() {
    const chosen = refs.item.get(view.item);
    if (!chosen) {
      clear(box).append(h('div', { class: 'card' }, emptyState('اختر مادة', 'ابحث عنها باسمها أو رمزها أعلاه', null, 'layers')));
      return;
    }
    clear(box).append(loadingState(5));
    try {
      const moves = await all(`gc_adm_stock_moves?select=id,voucher_id,qty,date,created_at&item_id=eq.${view.item}&warehouse_id=eq.${Number(view.wh)}&order=date,id`);
      const { opening, rows: list, closing } = ledgerRows(moves, view.from, view.to);
      const ids = [...new Set(list.map((m) => m.voucher_id).filter(Boolean))];
      const byId = new Map();
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        for (const v of await all(`gc_adm_vouchers?select=id,number,type,party,house_id&id=in.(${chunk.join(',')})`)) byId.set(v.id, v);
      }
      if (!content.isConnected) return;
      const unit = chosen.unit;
      clear(box).append(
        h('div', { class: 'kpis' },
          kpi({ label: 'رصيد أوّل المدة', value: amount(opening, unit), iconName: 'flag' }),
          kpi({ label: 'رصيد آخر المدة', value: amount(closing, unit), iconName: 'layers' })),
        h('div', { class: 'card flush' }, table([
          { title: 'التاريخ', render: (m) => h('span', { class: 'nowrap' }, fmtDate(m.date)) },
          { title: 'السند', render: (m) => {
            const v = byId.get(m.voucher_id);
            if (!m.voucher_id) return h('span', {}, 'رصيد افتتاحي');
            return v ? h('div', { class: 'cell-main' }, h('b', { class: 'ltr', translate: 'no' }, v.number), h('small', {}, OPS[v.type]?.full ?? v.type))
              : h('span', { class: 'muted' }, '—');
          } },
          { title: 'الحركة', class: 'num', render: (m) => h('b', { class: m.qty < 0 ? 'p-adm-short' : 'p-adm-in' }, m.qty > 0 ? '+' : '', num(m.qty)) },
          { title: 'الرصيد', class: 'num', render: (m) => num(m.balance) },
        ], list, { empty: emptyState('لا حركة في هذه الفترة', null, null, 'layers') })));
    } catch (err) {
      clear(box).append(h('div', { class: 'card card-body' }, problemBox(err)));
    }
  }

  paintBar();
  await load();
  return { refresh: load };
}

/* ============================== التقارير ============================== */

const REPORT_TABS = [['daily', 'التقرير اليومي'], ['period', 'حركة فترة'], ['house', 'تجهيز منزل'], ['attendance', 'الحضور'], ['value', 'قيمة المخزون']];

async function reports({ content, route }) {
  const view = { tab: REPORT_TABS.some(([k]) => k === route.query?.tab) ? route.query.tab : 'daily',
    day: today(), from: daysAgo(30), to: today(), house: '', month: today().slice(0, 7) };
  screenHead(content, 'التقارير', null);
  const bar = h('div', {});
  const box = h('div', {});
  content.append(bar, box);
  const refs = await lookups().catch(() => null);
  if (!content.isConnected) return null;

  const itemName = (id) => refs?.item.get(id)?.name ?? '—';
  const unitOf = (id) => refs?.item.get(id)?.unit ?? '';
  const sectionOf = (id) => refs?.category.get(refs?.item.get(id)?.category_id)?.name ?? 'بلا قسم';
  const input = (type, key, extra = {}) => h('input', { type, value: view[key], ...extra, onchange: (e) => { view[key] = e.target.value; load(); } });

  function paintBar() {
    const controls = {
      daily: [h('label', { class: 'p-adm-day' }, h('span', {}, 'اليوم'), input('date', 'day'))],
      period: dayRange(view, () => load()),
      house: [h('select', { onchange: (e) => { view.house = e.target.value; load(); } },
        h('option', { value: '' }, 'اختر المنزل'),
        ...(refs?.data.houses ?? []).map((x) => h('option', { value: x.id, selected: String(x.id) === view.house }, x.code)))],
      attendance: [h('label', { class: 'p-adm-day' }, h('span', {}, 'الشهر'), input('month', 'month'))],
      value: [],
    };
    clear(bar).append(tabs(REPORT_TABS, view.tab, (key) => { view.tab = key; paintBar(); load(); }),
      controls[view.tab].length ? h('div', { class: 'toolbar p-adm-filters' }, ...controls[view.tab]) : null);
  }

  const totalsTable = (totals, { csv = null } = {}) => h('div', { class: 'card flush' },
    csv ? h('div', { class: 'card-head' }, h('div', { class: 'spacer' }),
      h('button', { class: 'btn btn-sm', type: 'button', onclick: csv }, icon('download', 15), 'تصدير CSV')) : null,
    table([
      { title: 'المادة', render: (t) => h('div', { class: 'cell-main' }, h('b', {}, itemName(t.item_id)), h('small', {}, sectionOf(t.item_id))) },
      { title: 'إدخال', class: 'num', render: (t) => (t.in ? num(t.in) : '—') },
      { title: 'إخراج', class: 'num', render: (t) => (t.out ? num(t.out) : '—') },
      { title: 'تحويل', class: 'num', phone: false, render: (t) => (t.transfer ? num(t.transfer) : '—') },
      { title: 'إرجاع', class: 'num', render: (t) => (t.return ? num(t.return) : '—') },
      { title: 'تسوية (±)', class: 'num', render: (t) => (t.adjust ? `${t.adjust > 0 ? '+' : ''}${num(t.adjust)}` : '—') },
      { title: 'الوحدة', phone: false, render: (t) => unitOf(t.item_id) },
    ], totals, { empty: emptyState('لا حركة', null, null, 'report') }));

  /** المجموع لكل قسم: ما في الأسطر بأنواعه — والتسوية بإشارتها. */
  const bySection = (totals) => {
    const out = new Map();
    for (const t of totals) {
      const name = sectionOf(t.item_id);
      const s = out.get(name) ?? { name, in: 0, out: 0, transfer: 0, return: 0, adjust: 0 };
      for (const k of ['in', 'out', 'transfer', 'return', 'adjust']) s[k] += t[k];
      out.set(name, s);
    }
    return [...out.values()];
  };
  const sectionTable = (totals) => h('div', { class: 'card flush' },
    h('div', { class: 'card-head' }, h('h3', {}, icon('grid', 17), 'المجموع لكل قسم')),
    table([
      { title: 'القسم', render: (s) => h('b', {}, s.name) },
      { title: 'إدخال', class: 'num', render: (s) => num(s.in) },
      { title: 'إخراج', class: 'num', render: (s) => num(s.out) },
      { title: 'إرجاع', class: 'num', phone: false, render: (s) => num(s.return) },
      { title: 'تسوية (±)', class: 'num', phone: false, render: (s) => num(s.adjust) },
    ], bySection(totals)));

  const runs = {
    async daily() {
      const [list, lines] = await Promise.all([
        all(`gc_adm_vouchers?select=*&date=eq.${view.day}&order=id`),
        all(`gc_adm_voucher_lines?select=voucher_id,item_id,qty,type,notes,status&date=eq.${view.day}`),
      ]);
      const posted = lines.filter((l) => l.status === 'posted');
      const types = ['in', 'out', 'transfer', 'return', 'adjust'].filter((t) => list.some((v) => v.type === t));
      const count = (id) => lines.filter((l) => l.voucher_id === id).length;
      return [
        h('div', { class: 'kpis' }, ...types.map((t) => kpi({ label: OPS[t].full, value: num(list.filter((v) => v.type === t && v.status === 'posted').length), op: t }))),
        ...types.map((t) => h('div', { class: 'card flush', style: 'margin-bottom:12px' },
          h('div', { class: 'card-head' }, h('h3', {}, opIcon(t, 16), ' ', OPS[t].full), h('span', { class: 'sub' }, num(list.filter((v) => v.type === t).length))),
          table([
            { title: 'السند', render: (v) => h('b', { class: 'ltr', translate: 'no' }, v.number) },
            { title: 'الجهة', render: (v) => partyOf(v, refs) },
            { title: 'الأسطر', class: 'num', render: (v) => num(count(v.id)) },
            { title: '', render: (v) => (v.status === 'cancelled' ? badge('ملغى', 'bad') : null) },
          ], list.filter((v) => v.type === t), { onRow: (v) => openVoucher(v, refs), rowClass: (v) => (v.status === 'cancelled' ? 'cancelled' : null) }))),
        list.length ? sectionTable(periodTotals(posted)) : h('div', { class: 'card' }, emptyState('لا سندات في هذا اليوم', null, null, 'file')),
      ];
    },
    async period() {
      const lines = await all(`gc_adm_voucher_lines?select=item_id,qty,type,notes,house_id&date=gte.${view.from}&date=lte.${view.to}&status=eq.posted`);
      const totals = periodTotals(lines).sort((a, b) => sectionOf(a.item_id).localeCompare(sectionOf(b.item_id), 'ar')
        || itemName(a.item_id).localeCompare(itemName(b.item_id), 'ar'));
      const csv = () => exportCsv(`حركة فترة ${view.from} — ${view.to}.csv`,
        ['المادة', 'القسم', 'الوحدة', 'إدخال', 'إخراج', 'تحويل', 'إرجاع', 'تسوية (±)'],
        totals.map((t) => [itemName(t.item_id), sectionOf(t.item_id), unitOf(t.item_id), t.in, t.out, t.transfer, t.return, t.adjust]));
      return [totalsTable(totals, { csv }), totals.length ? sectionTable(totals) : null];
    },
    async house() {
      if (!view.house) return [h('div', { class: 'card' }, emptyState('اختر المنزل', null, null, 'map'))];
      const lines = await all(`gc_adm_voucher_lines?select=voucher_id,item_id,qty,type,date&house_id=eq.${Number(view.house)}&status=eq.posted&type=in.(out,return)`);
      const per = new Map();
      for (const l of lines) {
        const t = per.get(l.item_id) ?? { item_id: l.item_id, issued: 0, returned: 0, last: '', vouchers: new Set() };
        if (l.type === 'out') { t.issued += Number(l.qty) || 0; t.vouchers.add(l.voucher_id); if (String(l.date) > t.last) t.last = String(l.date); }
        else t.returned += Number(l.qty) || 0;
        per.set(l.item_id, t);
      }
      const list = [...per.values()].filter((t) => t.issued > 0).sort((a, b) => b.last.localeCompare(a.last));
      return [h('div', { class: 'card flush' }, table([
        { title: 'المادة', render: (t) => h('b', {}, itemName(t.item_id)) },
        { title: 'خرج', class: 'num', render: (t) => amount(t.issued, unitOf(t.item_id)) },
        { title: 'أُرجع', class: 'num', render: (t) => (t.returned ? num(t.returned) : '—') },
        { title: 'الصافي', class: 'num', render: (t) => h('b', {}, num(t.issued - t.returned)) },
        { title: 'آخر مرة', phone: false, render: (t) => fmtDate(t.last) },
        { title: 'مرات', class: 'num', phone: false, render: (t) => num(t.vouchers.size) },
      ], list, { empty: emptyState('لم يُجهَّز هذا المنزل بشيء بعد', null, null, 'map') }))];
    },
    async attendance() {
      const [y, m] = view.month.split('-').map(Number);
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const [list, people] = await Promise.all([
        all(`gc_adm_attendance?select=id,worker_id,date,status&date=gte.${view.month}-01&date=lte.${view.month}-${String(last).padStart(2, '0')}&order=date`),
        loadPeople().catch(() => ({ workers: [] })),
      ]);
      const name = new Map(people.workers.map((w) => [w.id, w.name]));
      const per = new Map();
      for (const a of list) {
        const t = per.get(a.worker_id) ?? { worker_id: a.worker_id, present: 0, absent: 0, leave: 0 };
        if (['present', 'absent', 'leave'].includes(a.status)) t[a.status]++;
        per.set(a.worker_id, t);
      }
      return [h('div', { class: 'card flush' }, table([
        { title: 'العامل', render: (t) => (name.has(t.worker_id) ? said(name.get(t.worker_id)) : h('span', { class: 'muted' }, '—')) },
        { title: ATTENDANCE.present, class: 'num', render: (t) => num(t.present) },
        { title: ATTENDANCE.absent, class: 'num', render: (t) => num(t.absent) },
        { title: ATTENDANCE.leave, class: 'num', render: (t) => num(t.leave) },
      ], [...per.values()], { empty: emptyState('لا حضور في هذا الشهر', null, null, 'calendar') }))];
    },
    async value() {
      const [costs, data] = await Promise.all([all('gc_adm_item_costs?select=id,cost'), loadData(true)]);
      const cost = new Map(costs.map((c) => [c.id, Number(c.cost) || 0]));
      const list = data.items.filter((i) => Math.abs(i.total) > 1e-9)
        .map((i) => ({ ...i, cost: cost.get(i.id) ?? 0, value: (cost.get(i.id) ?? 0) * i.total }))
        .sort((a, b) => b.value - a.value);
      const sum = list.reduce((t, i) => t + i.value, 0);
      return [
        h('div', { class: 'kpis' }, kpi({ label: 'قيمة المخزون', value: num(sum, 2), iconName: 'chart', hint: [num(list.length), ' ', h('span', {}, 'مادة')] })),
        h('div', { class: 'card flush' }, table([
          { title: 'المادة', render: (i) => h('div', { class: 'cell-main' }, h('b', {}, i.name), h('small', { class: 'ltr', translate: 'no' }, i.sku)) },
          { title: 'الرصيد', class: 'num', render: (i) => amount(i.total, i.unit) },
          { title: 'الكلفة', class: 'num', phone: false, render: (i) => (i.cost ? num(i.cost, 2) : '—') },
          { title: 'القيمة', class: 'num', render: (i) => (i.value ? h('b', {}, num(i.value, 2)) : '—') },
        ], list.slice(0, 500), { empty: emptyState('لا رصيد', null, null, 'box') })),
      ];
    },
  };

  async function load() {
    clear(box).append(loadingState(5));
    const tab = view.tab;
    try {
      const nodes = await runs[tab]();
      if (!content.isConnected || tab !== view.tab) return;
      clear(box).append(...nodes.filter(Boolean));
    } catch (err) {
      if (content.isConnected) clear(box).append(h('div', { class: 'card card-body' }, problemBox(err)));
    }
  }

  paintBar();
  await load();
  return { refresh: load };
}

/* ============================== سجلّ النشاط ============================== */

async function activity({ content }) {
  const view = { entity: '', from: '', to: '', q: '' };
  screenHead(content, 'سجلّ النشاط', 'كل فعل بفاعله ووقته.');
  const bar = h('div', {});
  const box = h('div', {}, loadingState(6));
  content.append(bar, box);

  const list = pager({
    size: 100,
    load: (offset, limit) => {
      const q = view.q.trim().replace(/[*,()"]/g, ' ').trim();
      const filter = [view.entity ? `&entity=eq.${encodeURIComponent(view.entity)}` : '', utcRange('created_at', view.from, view.to),
        q ? `&details=ilike.*${encodeURIComponent(q)}*` : ''].join('');
      return page(`gc_adm_activity?select=*${filter}&order=created_at.desc,id.desc`, { limit, offset });
    },
    paint: (st, more) => {
      if (!content.isConnected) return;
      clear(box).append(h('div', { class: 'card flush' },
        st.error ? h('div', { class: 'card-body' }, problemBox(st.error)) : null,
        table([
          { title: 'الوقت', render: (r) => h('span', { class: 'nowrap' }, fmtDateTime(r.created_at)) },
          { title: 'المستخدم', render: (r) => (r.user_name ? said(r.user_name) : 'النظام') },
          { title: 'الفعل', render: (r) => badge(ACTIONS[r.action]?.[0] ?? r.action, ACTIONS[r.action]?.[1] ?? '') },
          { title: 'على', phone: false, render: (r) => ENTITIES[r.entity] ?? r.entity },
          { title: 'التفاصيل', render: (r) => h('span', { style: 'word-break:break-word' }, r.details || '—') },
        ], st.rows, { empty: st.error ? null : emptyState('لا نشاط هنا', null, null, 'clock') }),
        h('div', { class: 'card-foot' }, h('span', { class: 'muted' }, st.total === null ? num(st.rows.length) : [num(st.rows.length), ' / ', num(st.total)]),
          h('div', { class: 'spacer' }), more)));
    },
  });

  const search = h('input', { type: 'search', placeholder: 'ابحث في التفاصيل — رقم سند، اسم مادة…',
    oninput: debounce((e) => { view.q = e.target.value; list.next(true); }, 350) });
  bar.append(h('div', { class: 'toolbar p-adm-filters' },
    h('div', { class: 'grow input-icon' }, icon('search', 16), search),
    h('select', { onchange: (e) => { view.entity = e.target.value; list.next(true); } },
      h('option', { value: '' }, 'كل الأنواع'), ...Object.entries(ENTITIES).map(([value, label]) => h('option', { value }, label))),
    ...dayRange(view, () => list.next(true))));
  await list.next(true);
  return { refresh: () => list.next(true) };
}

/* ============================== حسابات الموقع ============================== */

async function accounts({ content }) {
  screenHead(content, 'حسابات الموقع', null);
  content.append(h('div', { class: 'p-adm-note' }, icon('info', 15), h('span', {}, 'تُدار الحسابات من الحاسوب الرئيسي')));
  const box = h('div', {}, loadingState(5));
  content.append(box);
  try {
    const list = await all('gc_adm_staff?select=*&order=active.desc,full_name');
    if (!content.isConnected) return null;
    const kind = (s) => (Number(s.admin) ? badge('مدير', 'gold dot') : Number(s.trusted) ? badge('معتمد', 'ok dot') : badge('طالب', 'info dot'));
    const perms = (s) => [Number(s.can_in) ? 'إدخال' : null, Number(s.can_out) ? 'إخراج' : null,
      Number(s.can_custody) ? 'الأمانات' : null, Number(s.can_workers) ? 'العمال والحضور' : null].filter(Boolean);
    clear(box).append(h('div', { class: 'card flush' }, table([
      { title: 'الموظف', render: (s) => h('div', { class: 'cell-main' }, h('b', { translate: 'no' }, s.full_name || s.username),
        h('small', { class: 'ltr', translate: 'no' }, s.username)) },
      { title: 'النوع', render: kind },
      { title: 'الصلاحيات', phone: false, render: (s) => h('div', { class: 'chips' }, ...perms(s).map((p) => h('span', { class: 'chip' }, p))) },
      { title: '', render: (s) => (Number(s.active) ? null : badge('موقوف', 'bad')) },
    ], list, { rowClass: (s) => (Number(s.active) ? null : 'cancelled'), empty: emptyState('لا حسابات', null, null, 'users') })));
  } catch (err) {
    clear(box).append(h('div', { class: 'card card-body' }, problemBox(err)));
  }
  return null;
}

/* ============================== المخطط: المالك ============================== */

/** مالك المنزل وملاحظاته ومن حدّث إنجازه — للمدير في درج المنزل (views.js openHouse). */
export async function adminHouseFacts(houseId) {
  const [x] = await rows(`gc_adm_house_owners?select=owner,notes,progress_by&id=eq.${Number(houseId)}`);
  if (!x) return [];
  return [h('div', { class: 'facts p-adm-house' },
    fact('المالك', x.owner ? said(x.owner) : null),
    fact('ملاحظات', x.notes ? said(x.notes) : null),
    fact('حدّث الإنجاز', x.progress_by ? said(x.progress_by) : null))];
}

/* ============================== التوجيه ============================== */

const SCREENS = { requests, vouchers, ledger, reports, activity, accounts };

/** ‎#/admin‎ اللوحة، و‎#/admin/<الشاشة>‎ شاشاتها — وما لا يُعرف يفتح اللوحة. */
export async function admin({ content, route }) {
  const name = String(route.param ?? '').split('/')[0];
  const screen = Object.hasOwn(SCREENS, name) ? SCREENS[name] : hub;
  return screen({ content, route });
}
