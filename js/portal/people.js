/* ================= الأمانات والعمال على الموقع: ما تشترك فيه الشاشات =================
   بطلب صاحب المشروع: من أعطاه المدير «الأمانات» أو «العمال والحضور» يعمل
   عليها من هاتفه «كما أفعل باللابتوب». وهذا ما تشترك فيه شاشتاهما
   (custody.js وworkers.js) والرئيسية:

     — ما رفعه الحاسوب الرئيسي: العمال (بلا رقم الهوية)، وأصناف الأمانات،
       والأمانات كلّها — القائمة والمُعادة — وسيرة كلٍّ منها، والحضور في آخر
       ٦٢ يوماً. والسحابة لا تُرجع شيئاً منها لمن لا صلاحية له.
     — العمليات: كل فعلٍ عمليةٌ في gc_ops (sb.js) يطبّقها الحاسوب بقواعد
       شاشاته. «المعتمد» تُطبَّق عمليته حين تصل، و«الطالب» تنتظر موافقة
       المدير. وسجلّها على هذا الجهاز كسجلّ الطلبات: يُحفظ قرارها هنا ثم
       تُحذف من السحابة.
     — العمليات المنتظرة تُعرض فوق ما رفعه الحاسوب (overlay.js)، وقراراتها
       في الرئيسية: سُجّلت برقمها، أو رُدّت بسببها.
   ========================================================================== */

import { h, clear, icon, num, fmtDate, fmtDateTime, fmtTime, drawer, toast, emptyState, loadingState } from '../ui.js';
import { all, rows, insertOp, settleOps, ackOp, localOps, withdrawOp, currentUserId, storageKept } from './sb.js';
import { state, isTrusted, canCustody, canWorkers } from './main.js';

/* ------------------------------ أنواع العمليات ------------------------------ */

/* كل نوعٍ يرسله الموقع (gc_ops.kind): اسمه وأيقونته — ولون الأمانات أو العمال —
   بأسمائها في «طلبات الموقع» على الحاسوب. */
export const OP_KINDS = {
  custody_issue: { label: 'تسليم أمانة', icon: 'opCustody', area: 'custody' },
  custody_return: { label: 'إعادة أمانة', icon: 'opReturn', area: 'custody' },
  custody_extend: { label: 'تمديد موعد أمانة', icon: 'calendar', area: 'custody' },
  custody_edit: { label: 'تعديل أمانة', icon: 'edit', area: 'custody' },
  custody_delete: { label: 'حذف أمانة', icon: 'trash', area: 'custody' },
  custody_item_add: { label: 'صنف أمانة جديد', icon: 'box', area: 'custody' },
  worker_add: { label: 'عامل جديد', icon: 'hardhat', area: 'workers' },
  worker_edit: { label: 'تعديل عامل', icon: 'hardhat', area: 'workers' },
  attendance_set: { label: 'حضور عامل', icon: 'checkCircle', area: 'workers' },
  attendance_all: { label: 'الباقون حاضرون', icon: 'users', area: 'workers' },
  attendance_punch: { label: 'دخول أو خروج عامل', icon: 'clock', area: 'workers' },
};
export const opKind = (kind) => OP_KINDS[kind] ?? { label: String(kind ?? ''), icon: 'info', area: 'workers' };

/** مربّع أيقونة العملية بلون الأمانات أو العمال (portal.css ‎[data-op="workers"]‎). */
export function kindIcon(kind, size = 18, big = false) {
  const k = opKind(kind);
  return h('span', { class: `op-icon${big ? ' lg' : ''}`, 'data-op': k.area === 'custody' ? 'custody' : 'workers' }, icon(k.icon, size));
}

/* حالة العملية كما يراها صاحبها — كحالات الطلب في الرئيسية. */
export const OP_STATES = {
  pending: { label: 'بانتظار الحاسوب الرئيسي', icon: 'clock' },
  received: { label: 'بانتظار موافقة المدير', icon: 'history' },
  applied: { label: 'سُجّلت على الحاسوب', icon: 'checkCircle' },
  rejected: { label: 'رُدّت', icon: 'xCircle' },
  withdrawn: { label: 'مسحوبة', icon: 'undo' },
  cancelled: { label: 'أُلغيت بعد تطبيقها', icon: 'ban' },
  /* عمليةٌ من هذا الجهاز تنتظر، ولم تعد في السحابة: لا يُعرف قرارها هنا. */
  gone: { label: 'لم يصل قرارها إلى هذا الجهاز', icon: 'info' },
};

export function opState(o) {
  const status = o.gone ? 'gone' : o.status;
  const s = OP_STATES[status] ?? OP_STATES.pending;
  /* «المعتمد» لا ينتظر موافقة: تُسجَّل عمليته حين يتّصل الحاسوب. */
  const label = status === 'pending' && o.direct ? 'يُسجَّل حين يتّصل الحاسوب الرئيسي' : s.label;
  return h('span', { class: `req-state ${status}` }, icon(s.icon, 13), label);
}

/**
 * علامة الانتظار على سطرٍ في الأمانات أو العمال أو الحضور: ما فُعل ولم يصل
 * الحاسوب، أو وصله وينتظر المدير. text ما ينتظر («إعادة 2»)، وإلا حاله وحدها.
 */
export function waitChip(op, text = null) {
  const label = op.status === 'received' ? 'ينتظر موافقة المدير'
    : op.direct ? 'يُسجَّل حين يتّصل الحاسوب' : 'ينتظر الحاسوب الرئيسي';
  return h('span', { class: `p-wait${op.status === 'received' ? ' held' : ''}` }, icon(op.status === 'received' ? 'history' : 'clock', 12),
    text ? [h('span', {}, text), ' · '] : null, h('span', {}, label));
}

/* ------------------------------ ما يُعرض ------------------------------ */

/** ما كتبه إنسانٌ بيده (اسمٌ أو ملاحظة) يُعرض كما كُتب: القاموس للجمل لا للأسماء. */
export const said = (text) => h('span', { translate: 'no' }, text);

/** أجزاء السطر عُقداً منفصلة بينها «·» — فتُترجم كلٌّ على حدة. */
export const dots = (...parts) => parts.filter((p) => p !== null && p !== undefined && p !== '' && p !== false)
  .flatMap((p, i) => (i ? [' · ', p instanceof Node ? p : h('span', {}, p)] : [p instanceof Node ? p : h('span', {}, p)]));

/** «2 حبة»: الكمية ووحدتها عقدتين — الوحدة تُترجم وحدها. */
export const amount = (value, unit) => [num(value), unit ? [' ', h('span', {}, unit)] : null];

export const HOLDER_TITLES = { worker: 'عامل', staff: 'موظف شركة' };
export const ATTENDANCE = { present: 'حاضر', absent: 'غائب', leave: 'إجازة', clear: 'بلا تسجيل' };

/** سطر حقيقةٍ في الدرج: العنوان ثم القيمة — ولا شيء إن لم تكن قيمة. */
export const fact = (label, value) => (value === null || value === undefined || value === ''
  ? null : h('div', { class: 'fact' }, h('span', {}, label), h('b', {}, value)));

/** معرّف عمليةٍ جديدة: يبقى للنموذج حتى تصل، فإعادة الإرسال بعد انقطاع لا تكرّرها. */
export const newOpId = () => crypto.randomUUID();

/* ------------------------------ ما رفعه الحاسوب ------------------------------ */

const cache = { at: 0, data: null, perms: '' };

/**
 * العمال وأصناف الأمانات والأمانات — ما يقرؤه الحساب منها بصلاحيته: العمال
 * لمن له أيٌّ منهما، والأمانات لمن له الأمانات. تُحمَّل مرّة وتُجدَّد كل دقيقة
 * أو بطلب الشاشة (force) — وبعد كل عملية تُرسل.
 */
export async function loadPeople(force = false) {
  const perms = `${canCustody()}:${canWorkers()}`;
  if (!force && cache.data && cache.perms === perms && Date.now() - cache.at < 60 * 1000) return cache.data;
  const custodyToo = canCustody();
  const [workers, items, custody] = await Promise.all([
    all('gc_workers?select=id,code,name,job_title,phone,warehouse_id,active,notes&order=name'),
    custodyToo ? all('gc_custody_items?select=id,name,unit,details,owned_qty,active&order=name') : [],
    custodyToo
      ? all('gc_custody?select=id,number,custody_item_id,qty,returned_qty,worker_id,holder,holder_phone,holder_title,issue_date,due_date,return_date,status,notes,created_by_name,created_at&order=id.desc')
      : [],
  ]);
  cache.data = { workers, items, custody, custodyToo };
  cache.at = Date.now();
  cache.perms = perms;
  return cache.data;
}

/** يُسقط ما حُمّل: بعد إرسال عمليةٍ تُقرأ الشاشة من السحابة من جديد. */
export const dropPeople = () => { cache.at = 0; };

/** سيرة الأمانة: إعاداتها وتعديلاتها كما رفعها الحاسوب — تُقرأ حين يُفتح درجها. */
export async function loadStory(custodyId) {
  const id = Number(custodyId) || 0;
  const [returns, edits] = await Promise.all([
    rows(`gc_custody_returns?select=id,custody_id,qty,date,notes,created_by_name,created_at&custody_id=eq.${id}&order=id`),
    rows(`gc_custody_edits?select=id,custody_id,field,old_value,new_value,edited_by_name,source,created_at&custody_id=eq.${id}&order=id`),
  ]);
  return { returns, edits };
}

/** حضور يومٍ كما رفعه الحاسوب — وفي السحابة آخر ٦٢ يوماً وحدها. */
export const loadAttendance = (date) =>
  all(`gc_attendance?select=id,worker_id,warehouse_id,date,status,check_in,check_out,notes&date=eq.${String(date).slice(0, 10)}`);

/** كم يوماً من الحضور في السحابة: ما قبلها على الحاسوب الرئيسي وحده. */
export const ATTENDANCE_DAYS = 62;

/* ------------------------------ العمليات ------------------------------ */

/* قراءات العمليات بترتيب بدئها، للشاشات كلّها — كقراءات «طلباتي» (views.js):
   قراءةٌ علِقت في شبكة الهاتف وعادت بعد قراءةٍ بدأت بعدها ودُمجت لا تُدمج،
   ويُعرض ما على الجهاز — وقد حفظته الأحدث. */
let opReads = 0;
let opsSettled = 0;

/**
 * عمليات الحساب كما تُعرض: ما في السحابة يُدمج بسجلّ الجهاز ويُحذف منها ما
 * وصل قراره (sb.js). وإن تعذّرت السحابة فما على الجهاز، ويُقال لماذا.
 * يُرجع { ops, problem, kept }.
 */
export async function syncOps() {
  const uid = currentUserId();
  let kept = storageKept();
  try {
    const read = ++opReads;
    const readAt = Date.now();
    const cloud = await all('gc_ops?select=*&order=created_at.desc,id.desc');
    if (read < opsSettled) return { ops: localOps(uid), problem: null, kept };
    opsSettled = read;
    const settled = settleOps(uid, cloud, ackOp, readAt);
    settled.done.catch(() => {});
    kept &&= settled.kept;
    return { ops: settled.view, problem: null, kept };
  } catch (err) {
    return { ops: localOps(uid), problem: err.message, kept };
  }
}

/**
 * يرسل عمليةً { id, kind, payload } ويحفظها في سجلّ الجهاز — بانتظار الحاسوب.
 * والمعرّف من النموذج: يبقى إن تعثّر الإرسال، فإعادته لا تكرّرها. وdirect كما
 * الحساب الآن («معتمد») — والسحابة تكتبه هي. وquiet: لا يُقال شيء — تسليمٌ
 * بأسطرٍ عدّة عملياتٌ عدّة، ويُقال عنها مرّة (sentToast).
 */
export async function sendOp(op, { quiet = false } = {}) {
  const fresh = await insertOp(op, { direct: isTrusted() });
  dropPeople();
  if (!quiet) {
    if (!fresh) toast('أُرسلت هذه العملية مسبقاً', 'info');
    else sentToast();
  }
  return fresh;
}

/** «أُرسلت»: يُسجَّل حين يتّصل الحاسوب لـ«المعتمد»، وينتظر المدير لـ«الطالب». */
export const sentToast = () => toast(isTrusted()
  ? 'أُرسلت — تُسجَّل حين يتّصل الحاسوب الرئيسي'
  : 'أُرسلت إلى المدير — تُسجَّل بعد موافقته', 'success');

/** ما يحمله النموذج إلى صاحبه قبل الإرسال: يُسجَّل مباشرة، أو ينتظر المدير. */
export const sendHint = () => (isTrusted()
  ? 'حسابك معتمد: يُسجَّل حين يتّصل الحاسوب الرئيسي، دون موافقة.'
  : 'يُرسل إلى المدير ويُسجَّل بعد موافقته.');

/* أسماء ما في العملية — كما يرسلها الموقع — للدرج. */
const KEYS = {
  custody_id: 'الأمانة', custody_item_id: 'الصنف', new_item: 'صنف جديد', qty: 'الكمية',
  worker_id: 'العامل', holder: 'المستلم', holder_phone: 'الهاتف', holder_title: 'الصفة',
  issue_date: 'تاريخ التسليم', due_date: 'موعد الإعادة', notes: 'ملاحظات', date: 'التاريخ',
  name: 'الاسم', unit: 'الوحدة', details: 'التفاصيل', owned_qty: 'العدد المملوك',
  job_title: 'المهنة', phone: 'الهاتف', warehouse_id: 'المخزن', active: 'فعّال',
  status: 'الحالة', check_in: 'دخول', check_out: 'خروج', direction: 'الاتجاه', at: 'الوقت',
};

/** أسماءٌ لما يُرسل بمعرّفه: العامل والصنف والأمانة والمخزن. refs ما حُمّل منها. */
function namer(refs = {}) {
  const find = (list, id) => (Array.isArray(list) ? list.find((x) => String(x.id) === String(id)) : null);
  return {
    worker: (id) => find(refs.workers, id)?.name ?? null,
    item: (id) => find(refs.items, id)?.name ?? null,
    custody: (id) => find(refs.custody, id)?.number ?? null,
    warehouse: (id) => find(state.data?.allWarehouses, id)?.name ?? null,
  };
}

/** قيمة خانةٍ في العملية كما تُقرأ. */
function valueOf(key, value, refs, o) {
  if (value === null || value === undefined || value === '') return null;
  const n = namer(refs);
  if (typeof value === 'boolean') return value ? 'نعم' : 'لا';
  if (key === 'active') return Number(value) ? 'نعم' : 'لا';
  if (key === 'worker_id') return n.worker(value) ? said(n.worker(value)) : `#${value}`;
  if (key === 'custody_item_id') return n.item(value) ? said(n.item(value)) : `#${value}`;
  if (key === 'custody_id') return h('span', { class: 'p-code', translate: 'no' }, n.custody(value) ?? o?.result?.custody_number ?? `#${value}`);
  if (key === 'warehouse_id') return n.warehouse(value) ?? `#${value}`;
  if (key === 'holder_title') return HOLDER_TITLES[value] ?? String(value);
  if (key === 'status') return ATTENDANCE[value] ?? String(value);
  if (key === 'direction') return value === 'out' ? 'خروج' : 'دخول';
  if (key === 'qty' || key === 'owned_qty') return num(value);
  if (key === 'new_item' && typeof value === 'object') return said([value.name, value.unit].filter(Boolean).join(' — ') || '—');
  if (/date$/.test(key) && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) return fmtDate(value);
  if (key === 'at') return fmtDateTime(value);
  if (typeof value === 'object') return null;
  return said(String(value));
}

/** أسماء الخانات التي يغيّرها تعديلٌ — بلا تكرار (المستلم زوجٌ). */
const changedNames = (changes) => [...new Set(Object.keys(changes && typeof changes === 'object' ? changes : {})
  .map((k) => KEYS[k]).filter(Boolean))];

/** العملية سطراً: ماذا وعلى من — أجزاءً كلٌّ عقدته فتُترجم وحدها. */
export function opLine(o, refs = {}) {
  const x = o.payload ?? {};
  const v = (key) => valueOf(key, x[key], refs, o);
  switch (o.kind) {
    case 'custody_issue':
      return [x.new_item?.name ? said(x.new_item.name) : v('custody_item_id'), x.qty ? num(x.qty) : null,
        x.worker_id ? v('worker_id') : x.holder ? said(x.holder) : null];
    case 'custody_return':
      return [v('custody_id'), x.qty === null || x.qty === undefined || x.qty === '' ? 'كاملة' : num(x.qty)];
    case 'custody_extend': return [v('custody_id'), x.due_date ? fmtDate(x.due_date) : 'بلا موعد'];
    case 'custody_edit': return [v('custody_id'), ...changedNames(x.changes)];
    case 'custody_delete': return [v('custody_id')];
    case 'custody_item_add': return [said(String(x.name ?? '')), x.unit ? h('span', {}, x.unit) : null];
    case 'worker_add': return [said(String(x.name ?? '')), x.job_title ? said(x.job_title) : null];
    case 'worker_edit': return [v('worker_id'), ...changedNames(x.changes)];
    case 'attendance_set': return [v('worker_id'), x.date ? fmtDate(x.date) : null, ATTENDANCE[x.status] ?? ATTENDANCE.present];
    case 'attendance_all': return [x.date ? fmtDate(x.date) : null, ATTENDANCE[x.status] ?? ATTENDANCE.present];
    case 'attendance_punch': return [v('worker_id'), x.direction === 'out' ? 'خروج' : 'دخول', x.at ? fmtTime(x.at) : null];
    default: return [];
  }
}

/** ما سُجّلت به العملية: رقم الأمانة أو رمز العامل — مشطوباً إن أُلغيت. */
export function resultChip(o) {
  const code = o.result?.custody_number ?? (o.kind === 'worker_add' ? o.result?.worker_code : null);
  if (!code || !['applied', 'cancelled'].includes(o.status)) return null;
  return h('span', { class: `req-voucher${o.status === 'cancelled' ? ' cancelled' : ''}` },
    icon(o.kind === 'worker_add' ? 'hardhat' : 'opCustody', 13), h('b', { class: 'ltr', translate: 'no' }, code));
}

/* من قرّر حين لم يقرّر المدير: البرنامج نفسه (server/ops.js) — طبّق عملية «المعتمد»،
   أو ردّها بقاعدة الشاشة («المتبقّي 2 فقط»). فنصّ القرار وسببه من الخادم وفي القاموس:
   يُترجمان. وما كتبه المدير بيده يُعرض كما كتبه. */
const BY_PROGRAM = ['تلقائياً — حساب معتمد', 'تلقائياً — لم تُقبل'];
const byProgram = (o) => BY_PROGRAM.includes(String(o.decided_by ?? ''));
/** نصّ القرار: يُترجم إن كتبه البرنامج، ويبقى كما كُتب إن كتبه المدير. */
const decided = (o, text) => (byProgram(o) ? h('span', {}, text) : said(text));

/**
 * ما قيل في العملية: سبب الردّ بارزٌ بعنوانه — به يعرف صاحبها ما يصحّحه.
 * وما كتبه المدير يُعرض كما كتبه (translate=no)، وما كتبه البرنامج — ردٌّ
 * بقاعدة الشاشة، أو «لم تُطبَّق تلقائياً: …» — يُترجم.
 */
export function decisionNote(o) {
  const note = o.decision_note;
  if (!note) return null;
  if (o.status === 'rejected') return h('div', { class: 'req-note bad strong' }, h('b', {}, 'سبب الرفض:'), ' ', decided(o, note));
  return h('div', { class: `req-note${o.status === 'cancelled' ? ' bad' : ''}` }, note);
}

/** سطر العملية في القوائم. */
export function opItem(o, refs, onOpen) {
  return h('a', { class: `feed-item req-item req-${o.gone ? 'gone' : o.status}`, href: 'javascript:void 0', onclick: () => onOpen(o) },
    kindIcon(o.kind, 18),
    h('div', { class: 'f-main' },
      h('div', { class: 'f-title' }, h('b', {}, opKind(o.kind).label), resultChip(o)),
      h('div', { class: 'f-meta' }, ...dots(fmtDateTime(o.created_at), ...opLine(o, refs))),
      decisionNote(o)),
    h('div', { class: 'f-side' }, opState(o)));
}

/** العملية في درجٍ: حالها وقرارها، وما أُرسل فيها خانةً خانة — وسحبها ما دامت لم تصل الحاسوب. */
export function openOp(o, refs, onChanged) {
  const x = o.payload ?? {};
  const changes = x.changes && typeof x.changes === 'object' ? x.changes : null;
  const facts = Object.keys(x).filter((k) => k !== 'changes' && k !== 'client_ref' && KEYS[k])
    .map((k) => fact(KEYS[k], valueOf(k, x[k], refs, o)));
  const d = drawer({
    head: h('div', { style: 'display:flex;gap:10px;align-items:center' }, kindIcon(o.kind, 20, true),
      h('div', {}, h('h3', {}, opKind(o.kind).label), h('div', { class: 'sub' }, fmtDateTime(o.created_at)))),
    body: h('div', { class: 'form-grid' },
      h('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' }, opState(o), resultChip(o)),
      decisionNote(o),
      o.gone
        ? h('div', { class: 'info-box' }, icon('info', 18), h('div', { class: 'small' },
            'حُذفت هذه العملية من السحابة قبل أن يصل قرارها إلى هذا الجهاز: سُحبت أو مضى على قرارها أكثر من ثلاثين يوماً. اسأل المدير عنها.'))
        : null,
      h('div', { class: 'facts' }, ...facts,
        fact('قرّرها', o.decided_by ? decided(o, o.decided_by) : null),
        fact('في', o.decided_at ? fmtDateTime(o.decided_at) : null)),
      changes
        ? h('div', {}, h('b', {}, 'التعديل المطلوب'),
            h('div', { class: 'facts', style: 'margin-top:6px' },
              ...Object.keys(changes).filter((k) => KEYS[k]).map((k) => fact(KEYS[k], valueOf(k, changes[k], refs, o) ?? '—'))))
        : null),
    footer: o.status === 'pending' && !o.gone
      ? [h('button', {
          class: 'btn btn-danger',
          onclick: async (e) => {
            /* الزرّ نفسه لا ما ضُغط فيه — كسحب الطلب (views.js). */
            const btn = e.currentTarget;
            if (btn.disabled) return;
            btn.disabled = true;
            try {
              const done = await withdrawOp(o.id, o);
              toast(done ? 'سُحبت العملية' : 'تعذّر السحب — وصلت العملية إلى الحاسوب الرئيسي', done ? 'success' : 'error');
              d.close();
              onChanged?.();
            } catch (err) {
              btn.disabled = false;
              toast(err.message, 'error');
            }
          },
        }, icon('undo', 16), 'سحب العملية')]
      : null,
  });
  return d;
}

/* ------------------------------ في الرئيسية ------------------------------ */

/**
 * «عملياتي على الأمانات والعمال» في الرئيسية — كـ«طلباتي»: سجلّها على هذا
 * الجهاز، وما ينتظر بحاله، وما قُرّر بقراره (سُجّلت برقمها، أو رُدّت بسببها).
 * يُرجع { node, refresh } — أو null لحسابٍ بلا صلاحيتيهما ولا عمليات على جهازه.
 */
export function homeOps() {
  if (!canCustody() && !canWorkers() && !localOps(currentUserId()).length) return null;
  const list = h('div', {}, loadingState(2));
  const node = h('div', { class: 'card', style: 'margin-top:16px' },
    h('div', { class: 'card-head' }, h('h3', {}, icon('history', 18), 'عملياتي على الأمانات والعمال'),
      h('div', { class: 'spacer' }),
      canCustody() ? h('a', { class: 'btn btn-sm btn-ghost', href: '#/custody' }, icon('opCustody', 15), 'الأمانات') : null,
      canWorkers() ? h('a', { class: 'btn btn-sm btn-ghost', href: '#/workers' }, icon('hardhat', 15), 'العمال') : null),
    list);
  const PAGE = 40;
  let shown = PAGE;

  async function refresh() {
    const [{ ops, problem }, refs] = await Promise.all([syncOps(), loadPeople().catch(() => ({}))]);
    if (!node.isConnected) return;
    paint(ops, refs, problem);
  }

  function paint(ops, refs, problem) {
    clear(list);
    if (problem) list.append(h('div', { class: 'card-body' }, h('div', { class: 'bad-box' }, icon('alert', 18), problem)));
    if (!ops.length) {
      if (!problem) list.append(emptyState('لا عمليات بعد', 'ما تفعله في الأمانات والعمال يظهر هنا بحاله وقراره', null, 'history'));
      return;
    }
    list.append(h('div', { class: 'feed' }, ...ops.slice(0, shown).map((o) => opItem(o, refs, (op) => openOp(op, refs, refresh)))));
    if (ops.length > shown) {
      list.append(h('div', { class: 'card-body', style: 'text-align:center' },
        h('button', { class: 'btn btn-sm', type: 'button', onclick: () => { shown += PAGE; paint(ops, refs, problem); } },
          icon('chevronDown', 15), 'عرض المزيد')));
    }
  }

  return { node, refresh };
}
