/* ======================= الاتصال بالسحابة من الموقع =======================
   طبقة رقيقة فوق Supabase بلا مكتبة: الدخول، وتجديد الجلسة، وقراءة
   الجداول، وكتابة الطلبات وعمليات الأمانات والعمال — ومعرّف هذا الجهاز،
   وسجلّ الطلبات والعمليات عليه (آخر الملف).

   المفتاح هنا anon — عامّ بطبعه، يحمله كل متصفّح. لا يمنح شيئاً بذاته:
   ما يقرؤه الموظف وما يطلبه تقرّره السياسات في القاعدة على حسابه هو.
   ========================================================================== */

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

/* اسم الدخول يصير بريداً بالنطاق نفسه الذي يُنشئ به الحاسوب الرئيسي
   الحسابات (server/portal.js) — نطاقٌ محجوز لا يملكه أحد. */
const STAFF_DOMAIN = 'greencity.invalid';
const KEY = 'gc-portal-session';

export const configured = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && !SUPABASE_URL.startsWith('__'));

let session = null;
try { session = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { session = null; }

const save = (value) => {
  session = value;
  try {
    if (value) localStorage.setItem(KEY, JSON.stringify(value));
    else localStorage.removeItem(KEY);
  } catch { /* لهذه الجلسة وحدها */ }
};

/**
 * الجلسة سقطت والموقع مفتوح — رُفض رمزها (401) أو تعذّر تجديدها: تُمحى،
 * ويُخبَر main.js ليعود إلى شاشة الدخول برسالتها. وإلا بقيت الشاشات
 * مفتوحة تقول كلٌّ منها «سجّل الدخول أولاً» ولا طريق منها إليه.
 */
function lost(message) {
  save(null);
  try { window.dispatchEvent(new CustomEvent('gc-session-lost', { detail: { message } })); } catch { /* خارج المتصفّح */ }
}

export const currentUserId = () => session?.user?.id ?? null;
export const hasSession = () => Boolean(session?.refresh_token);

export class PortalError extends Error {
  /* detail: نصّ Supabase كما جاء، قبل أن يُشرح بالعربية — به يُعرف ما رُفض. */
  constructor(message, status = 0, detail = '') {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

/** رسائل Supabase بالعربية لمن يقرؤها على هاتفه في الموقع. */
function explain(status, body) {
  const raw = String(body?.message ?? body?.msg ?? body?.error_description ?? body?.error ?? '');
  /* رمز التجديد أُبطل — خروجٌ من جهاز آخر، أو جلسةٌ قديمة جدّاً: كانتهاء
     الجلسة، لا «Invalid Refresh Token» بالإنجليزية في شاشة الدخول. */
  if (/refresh.?token/i.test(`${raw} ${body?.error_code ?? ''}`)) return 'انتهت الجلسة — سجّل الدخول من جديد';
  if (/invalid login credentials|invalid_grant/i.test(raw)) return 'اسم الدخول أو كلمة المرور غير صحيحة';
  if (/banned/i.test(raw)) return 'هذا الحساب موقوف — راجع المدير';
  if (/JWT expired|invalid JWT|not authenticated/i.test(raw)) return 'انتهت الجلسة — سجّل الدخول من جديد';
  if (/duplicate key/i.test(raw)) return 'أُرسل هذا الطلب مسبقاً';
  if (status === 404 || /does not exist|schema cache/i.test(raw)) {
    return 'الموقع غير مهيّأ في السحابة بعد — أخبر المدير';
  }
  /* رسائل المحرّك في القاعدة مكتوبة بالعربية أصلاً: تُعرض كما هي. */
  if (/[؀-ۿ]/.test(raw)) return raw;
  if (status === 401 || status === 403) return 'لا تملك صلاحية هذا الإجراء';
  if (status >= 500) return 'السحابة لا تردّ الآن — أعد المحاولة بعد قليل';
  return raw || `خطأ ${status}`;
}

async function call(path, { method = 'GET', headers = {}, body, auth = true } = {}) {
  if (!configured()) throw new PortalError('الموقع غير مهيّأ — أخبر المدير', 0);
  if (auth) await fresh();
  let res;
  try {
    res = await fetch(SUPABASE_URL + path, {
      method,
      headers: {
        apikey: SUPABASE_ANON_KEY,
        /* بعد الدخول يُرسل رمز الجلسة. وقبله المفتاح العامّ إن كان رمزاً
           (anon)، ولا شيء إن كان بالصيغة الجديدة (sb_publishable_). */
        ...(auth && session ? { Authorization: `Bearer ${session.access_token}` }
          : SUPABASE_ANON_KEY.startsWith('eyJ') ? { Authorization: `Bearer ${SUPABASE_ANON_KEY}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new PortalError('لا اتصال بالإنترنت — تأكّد من الشبكة وأعد المحاولة', 0);
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const message = explain(res.status, data);
    if (res.status === 401 && auth) lost('انتهت الجلسة — سجّل الدخول من جديد');
    throw new PortalError(message, res.status, String(data?.message ?? data?.msg ?? ''));
  }
  return { data, res };
}

/* ------------------------------ الجلسة ------------------------------ */

export async function signIn(username, password) {
  const name = String(username).trim().toLowerCase();
  const email = name.includes('@') ? name : `${name}@${STAFF_DOMAIN}`;
  const { data } = await call('/auth/v1/token?grant_type=password', {
    method: 'POST', body: { email, password }, auth: false,
  });
  save(stamp(data));
  return data.user;
}

const stamp = (data) => ({
  access_token: data.access_token,
  refresh_token: data.refresh_token,
  expires_at: data.expires_at ? data.expires_at * 1000 : Date.now() + (data.expires_in ?? 3600) * 1000,
  user: { id: data.user?.id, email: data.user?.email },
});

let refreshing = null;

/** يجدّد الجلسة قبل انتهائها بدقيقة — مرّة واحدة وإن تزاحمت الطلبات. */
async function fresh() {
  if (!session) throw new PortalError('سجّل الدخول أولاً', 401);
  if (session.expires_at - Date.now() > 60 * 1000) return;
  refreshing ??= (async () => {
    try {
      const { data } = await call('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST', body: { refresh_token: session.refresh_token }, auth: false,
      });
      save(stamp(data));
    } catch (err) {
      /* الشبكة وحدها (status 0) لا تُسقط الجلسة: يُجدَّد حين تعود. */
      if (err.status) lost(err.message);
      throw err;
    } finally {
      refreshing = null;
    }
  })();
  await refreshing;
}

/* الخروج من هذا الجهاز وحده (scope=local): الافتراضي في Supabase يُبطل
   جلسات الحساب كلّها، فيُخرج صاحبه من هاتفه الآخر وهو لم يطلب ذلك. */
export async function signOut() {
  try { await call('/auth/v1/logout?scope=local', { method: 'POST' }); } catch { /* يخرج على أي حال */ }
  save(null);
}

/* ------------------------------ البيانات ------------------------------ */

/** يقرأ صفوفاً. المسار كما يكتبه PostgREST: الجدول ثم الشروط. */
export async function rows(path) {
  const { data } = await call(`/rest/v1/${path}`);
  return Array.isArray(data) ? data : [];
}

/**
 * يقرأ الجدول كلّه صفحةً صفحة: Supabase تُرجع ألف صفّ في الطلب الواحد
 * مهما طُلب، فمن قرأ مرّة واحدة ظنّ أن المخزن ألف مادة.
 */
export async function all(path, page = 1000) {
  const out = [];
  const sep = path.includes('?') ? '&' : '?';
  for (let offset = 0; ; offset += page) {
    const chunk = await rows(`${path}${sep}limit=${page}&offset=${offset}`);
    out.push(...chunk);
    if (chunk.length < page) return out;
  }
}

/**
 * صفحةٌ بعددها الكلّي: { rows, total } — لشاشات «الإدارة» (admin.js): السجلّ يُقرأ صفحةً
 * صفحة بمرشّحاته لا جدولاً كاملاً. وtotal null إن لم يُرسل الخادم Content-Range (أو
 * حجبته CORS): تعرض الشاشة حينئذ «المزيد» ما دامت الصفحة ملأى.
 */
export async function page(path, { limit = 50, offset = 0 } = {}) {
  const sep = path.includes('?') ? '&' : '?';
  const { data, res } = await call(`/rest/v1/${path}${sep}limit=${limit}&offset=${offset}`, { headers: { Prefer: 'count=exact' } });
  const m = /\/(\d+)$/.exec(res.headers.get('content-range') ?? '');
  return { rows: Array.isArray(data) ? data : [], total: m ? Number(m[1]) : null };
}

/**
 * يُرسل طلباً. المعرّف من المتصفّح: إن أُعيد الإرسال بعد انقطاع لم يتكرّر.
 * يُرجع true إن كُتب الآن، وfalse إن كان المعرّف قد وصل من قبل — فيُقال
 * لصاحبه «أُرسل مسبقاً» لا «أُرسل»: ما عدّله بعد الإرسال الأول لم يصل.
 *
 * والطلب يحمل معرّف هذا الجهاز (device): إليه وحده يعود قراره، ولا يعرضه
 * جهازٌ آخر للحساب ولا يتسلّمه. وما وصل يُحفظ في سجلّ هذا الجهاز (أسفله).
 * وdirect كما كان الحساب يوم أُرسل — والسحابة تكتبه هي، وتغلب حين تُقرأ.
 */
export async function insertRequest(request, { direct = false } = {}) {
  const send = (body) => call('/rest/v1/gc_requests', {
    method: 'POST', body, headers: { Prefer: 'return=minimal' },
  });
  let fresh = true;
  try {
    try {
      await send({ ...request, device: deviceId() });
    } catch (err) {
      /* سحابةٌ بسكربتٍ سابق لا تعرف عمود الجهاز: يُرسل بدونه ولا يُحبس الطلب —
         فيصير كطلبات ما قبل هذا الإصدار، حتى يُعيد المدير تنفيذ السكربت. */
      if (err.status !== 400 || !/'device' column/.test(err.detail)) throw err;
      await send(request);
    }
  } catch (err) {
    /* المعرّف موجود: الإرسال السابق وصل وإن لم يصل جوابه. */
    if (err.status !== 409) throw err;
    fresh = false;
  }
  rememberRequest(currentUserId(), { ...request, direct: Boolean(direct) });
  return fresh;
}

/**
 * ينادي دالّةً في القاعدة ويُرجع جوابها كما هو: صفوفاً، أو قيمةً واحدة.
 * والدالّة تعمل بصلاحية صاحبها لا بصلاحية الموظف، وتشترط هي ما تشترطه —
 * فالموقع لا يرى بها إلا ما أذنت به.
 */
export async function rpc(name, body = {}) {
  const { data } = await call(`/rest/v1/rpc/${name}`, { method: 'POST', body });
  return data;
}

/**
 * يسحب طلباً لم يصل الحاسوب الرئيسي بعد: الدالّة تحذفه من السحابة، ويبقى
 * في سجلّ هذا الجهاز «مسحوباً». وrow سطره كما عُرض: طلبٌ أُرسل من جهازٍ
 * آخر لا سجلّ له هنا، فيُحفظ بما عُرض منه.
 */
export async function withdraw(id, row = null) {
  const done = (await rpc('gc_withdraw_request', { request_id: id })) === true;
  if (done) requestLog.withdrawn(currentUserId(), id, row);
  return done;
}

/**
 * يحذف من السحابة طلباً وصل قراره إلى هذا الجهاز وحُفظ فيه. وseen ما حُفظ
 * منه — حالته ووقت آخر تغييرٍ عليه (updated_at) كما قُرئا: إن غيّر الحاسوب
 * القرار بين القراءة والحذف (ألغى السند، أو عدّل رقمه) لم يُحذف، ويصل الأحدث
 * في التحديث التالي. والدالّة تشترط معه ما تشترطه: طلبُ صاحب الجلسة وحده،
 * وبعد قراره وحده. وما لا يُعرف ما حُفظ منه لا يُحذف.
 */
export async function ackRequest(id, seen = {}) {
  if (!seen?.status || !seen?.updated_at) return false;
  return (await rpc('gc_ack_request', {
    request_id: id, seen_status: seen.status, seen_updated_at: seen.updated_at,
  })) === true;
}

/* ------------------------------ هذا الجهاز ------------------------------
   لكل متصفّحٍ معرّفٌ عشوائيّ يُنشأ أوّل مرّة ويُحفظ (gc-portal-device)، ويحمله
   كل طلبٍ يُرسل منه: إليه وحده يعود قراره. فهاتفٌ ثانٍ للحساب — أو المتصفّح
   نفسه بعد أن مُسح تخزينه — لا يعرض الطلب ولا يتسلّم قراره فيحذفه من السحابة
   قبل أن يصل إلى الهاتف الذي أرسله.

   ومتصفّحٌ لا يحفظ شيئاً (تصفّحٌ خاصّ، أو تخزينٌ محجوب) يأخذ معرّفاً لهذه
   الجلسة وحدها — ويُنبَّه صاحبه أن قراراته قد لا تُحفظ عليه (storageKept).
   والمعرّف يُقرأ من التخزين في كل مرّة: صفحتان فُتحتا معاً أوّل مرّة كتبت كلٌّ
   منهما معرّفاً، فيغلب ما بقي — وما أرسلته الأخرى قبلها في سجلّ الجهاز. */

const DEVICE_KEY = 'gc-portal-device';
const DEVICE_SHAPE = /^[A-Za-z0-9-]{16,64}$/;
let sessionDevice = '';

function randomId() {
  try { return crypto.randomUUID(); } catch { /* صفحةٌ بلا https */ }
  try {
    return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }
}

/** معرّف هذا المتصفّح: المحفوظ، وإلا فجديدٌ يُحفظ — أو يبقى لهذه الجلسة وحدها. */
export function deviceId() {
  let stored = '';
  try { stored = String(localStorage.getItem(DEVICE_KEY) ?? ''); } catch { stored = ''; }
  if (DEVICE_SHAPE.test(stored)) return (sessionDevice = stored);
  if (!sessionDevice) sessionDevice = randomId();
  try { localStorage.setItem(DEVICE_KEY, sessionDevice); } catch { /* لهذه الجلسة وحدها */ }
  return sessionDevice;
}

/** هل يحفظ هذا المتصفّح ما يُكتب فيه؟ وإلا فقرارات الطلبات قد لا تبقى عليه. */
export function storageKept() {
  const id = deviceId();
  try { return localStorage.getItem(DEVICE_KEY) === id; } catch { return false; }
}

/* ===================== سجلّ الطلبات على هذا الجهاز =====================
   السحابة تمرّر الطلبات ولا تحفظها: يبقى فيها الطلب ما دام ينتظر قراراً،
   فإذا قُرِّر — سُجّل سنداً، أو رُدّ، أو أُلغي سنده — وصل قراره إلى الهاتف
   الذي أرسله فحُفظ فيه، ثم حُذف من السحابة. فسجلّ طلبات الموظف على هاتفه
   وعلى الحاسوب الرئيسي، لا في السحابة.

   والترتيب لا يُعكس: القرار يُحفظ هنا أوّلاً، ثم يُطلب حذفه من السحابة
   (gc_ack_request). فإن تعذّر الحفظ — تخزينٌ ممتلئ أو محجوب — لم يُحذف
   شيء، وإن تعذّر الحذف بقي السطر في السحابة ويُعاد في التحديث التالي.
   ولا يضيع قرارٌ في الطريق.

   والطلب لجهازه وحده: ما في سجلّه، وما يحمل معرّفه (deviceId). حسابٌ مفتوح
   على هاتفين لا يرى أحدهما طلبات الآخر في السحابة ولا يتسلّم قرارها — فيصل
   القرار إلى الهاتف الذي أرسل الطلب. وما كُتب قبل هذا الإصدار بلا معرّف
   (device = null) يأخذه أوّل جهازٍ لا سجلّ له بعد، كما كان: هاتفٌ جديد حلّ
   محلّ قديم. ولا يُؤخذ غير ذلك شيء. وما لا يأخذه جهاز — هاتفٌ ضاع، أو متصفّحٌ
   مُسح تخزينه — يحذفه الحاسوب الرئيسي بعد ثلاثين يوماً من قراره.

   والسجلّ لكل حساب وحده (gc-portal-requests:<معرّفه>): هاتفٌ يدخله موظفان
   لا يرى أحدهما طلبات الآخر. ويُحفظ منه آخر 300 طلب في سنة.

   وlocal_status ما جرى للطلب على هذا الجهاز: sent أُرسل منه · adopted أُخذ
   من السحابة أوّل مرّة · acked وصل قراره وحُذف من السحابة · withdrawn سُحب.

   وعمليات الأمانات والعمال (gc_ops) تمرّ بالسحابة كما يمرّ الطلب، بالقواعد
   نفسها حرفاً بحرف: الجهاز والتسلّم بما حُفظ والسحب والأخذ القديم. فالسجلّ
   أداةٌ واحدة (deviceLog) يأخذها كلٌّ بمفتاحه وحالاته وأعمدته — ولا تُكتب
   القواعد مرّتين فتفترقا يوماً. سجلّ العمليات أسفل سجلّ الطلبات.
   ===================================================================== */

export const HISTORY_MAX = 300;
export const HISTORY_DAYS = 365;
/** قرارٌ تمّ: بعده يُحذف الطلب من السحابة. */
export const FINAL_STATUSES = ['posted', 'rejected', 'cancelled'];
/** ما زال ينتظر: في السحابة حتى يُقرَّر. */
export const LIVE_STATUSES = ['pending', 'received'];

/* الطلب يمضي ولا يرجع: ينتظر، فيتسلّمه الحاسوب، فيُقرَّر — وقد يُلغى سنده
   بعدها. والسحب من الانتظار وحده. فقراءةٌ للسحابة علِقت في شبكة الهاتف
   وعادت بعد أن حُفظ القرار هنا أو سُحب الطلب لا تُرجعه إلى الانتظار — وإلا
   عُدّ بعدها «لم يصل قراره» وقد وصل وحُذف من السحابة. */
const STAGE = { pending: 0, received: 1, posted: 2, rejected: 2, cancelled: 3, withdrawn: 3 };

/* ما يحفظه الجهاز من الطلب، بقيمته حين يغيب. */
/* وupdated_at آخر تغييرٍ على القرار في السحابة: به يُحذف منها ما حُفظ هنا
   كما هو، لا قرارٌ أحدث منه (gc_ack_request). وread_at متى بدأت القراءة التي
   حُفظ منها — بساعة هذا الجهاز: قراءةٌ بدأت قبلها لا تغلبه (mergeHistory). */
/* والإصدار الخامس: متى وصل إلى الحاسوب الرئيسي، ومرحلة تجهيزه (track.js).
   وprep_status بلا قيمة (null) لا '': سطرٌ لم يحمله قطّ — سحابةٌ لم يُعَد فيها
   السكربت، أو سجلٌّ من قبل — فلا يُوعد صاحبه بمرحلة تجهيزٍ لن تصل. */
const ENTRY = {
  id: null, type: 'out', warehouse_id: null, house_id: null, voucher_date: '', party: '', receiver_name: '',
  reference: '', notes: '', lines: null, direct: false, created_at: null, status: 'pending', decision_note: '',
  voucher_number: '', decided_by: '', decided_at: null, updated_at: null, read_at: null,
  received_at: null, prep_status: null, prepared_at: null, prepared_by: '',
};

const time = (value) => Date.parse(value ?? '') || 0;
/** آخر ما جرى على الطلب: تجهيزه أو قراره، وإلا إرساله. */
const lastActivity = (e) => Math.max(time(e.decided_at), time(e.prepared_at), time(e.created_at));

/** الأحدث إرسالاً أوّلاً — كما تُعرض الطلبات. */
export const byCreated = (a, b) => time(b.created_at) - time(a.created_at) || String(b.id).localeCompare(String(a.id));

/** طلبٌ كُتب قبل أن يحمل الطلب معرّف جهازه. */
const legacy = (row) => row.device === null || row.device === undefined || row.device === '';

/**
 * سجلٌّ على هذا الجهاز لما يمرّ بالسحابة ولا يبقى فيها: الطلبات، وعمليات
 * الأمانات والعمال. spec:
 *   prefix  مفتاح التخزين قبل معرّف الحساب (gc-portal-requests:<معرّفه>).
 *   fields  ما يُحفظ من السطر، بقيمته حين يغيب (ENTRY).
 *   shape   ما يُصحَّح بعد النسخ: البنود مصفوفةٌ دائماً، والبيانات كائن.
 *   stages  مراحل الحالات (STAGE): ما يمضي ولا يرجع.
 *   final   حالات القرار — بعدها يُحذف من السحابة.
 *   live    ما زال ينتظر — في السحابة حتى يُقرَّر.
 *   max     كم يُحفظ منه (و HISTORY_DAYS مدّته).
 */
function deviceLog({ prefix, fields, shape = () => {}, stages, final, live, max = HISTORY_MAX }) {
  const key = (uid) => `${prefix}:${uid}`;
  const stage = (status) => stages[status] ?? 0;

  /** سطر السحابة — أو المرسَل — بما يحفظه الجهاز منه. */
  function toEntry(row, localStatus = row?.local_status ?? '') {
    const out = {};
    for (const [name, fallback] of Object.entries(fields)) out[name] = row?.[name] ?? fallback;
    shape(row, out);
    out.local_status = localStatus;
    return out;
  }

  /**
   * آخر max في سنة، بآخر ما جرى عليها: القديم الذي قُرِّر اليوم يبقى.
   * والأحدث أوّلاً — فإن امتلأ التخزين حُفظ أوّله (write).
   */
  function prune(list, now = Date.now()) {
    const since = now - HISTORY_DAYS * 24 * 3600 * 1000;
    const seen = new Set();
    return list
      .filter((e) => {
        if (!e?.id || seen.has(String(e.id))) return false;
        seen.add(String(e.id));
        const at = lastActivity(e);
        return !at || at >= since;
      })
      .sort((a, b) => lastActivity(b) - lastActivity(a))
      .slice(0, max);
  }

  /* سطرٌ من قراءةٍ أقدم ممّا حُفظ هنا لا يغلبه: لا يرجع مرحلةً (stages)، وفي
     المرحلة نفسها — سندٌ عُدّل رقمه — لا تغلب قراءةٌ بدأت قبل التي حُفظ منها.
     صفحتان مفتوحتان على الهاتف: الثانية قرأت الرقم الجديد فحفظته وحُذف من
     السحابة، ثم عادت قراءة الأولى بالرقم القديم — فلولا هذا بقي القديم هنا ولم
     يُصحَّح أبداً. */
  const older = (row, had, readAt) => stage(row.status) < stage(had.status)
    || (stage(row.status) === stage(had.status) && readAt < (Number(had.read_at) || 0));

  /**
   * يدمج ما للحساب في السحابة بسجلّ الجهاز — والسحابة تغلب في كل ما تعرفه،
   * وlocal_status للجهاز.
   *   stored  سجلّ الجهاز، أو null إن لم يكن له سجلّ بعد.
   *   cloud   ما للحساب في السحابة — كلّه، لا صفحةً منه. وسطرٌ فيه أقدم ممّا
   *           حُفظ (older) لا يغلب: القراءة بدأت قبل أن يُحفظ.
   *   now     متى بدأت قراءة cloud — ويُحفظ مع ما أُخذ منها (read_at).
   *   device  معرّف هذا الجهاز (deviceId).
   * وما للجهاز من السحابة: ما في سجلّه، وما يحمل معرّفه — وما قبل هذا
   * الإصدار (بلا معرّف) إن لم يكن له سجلّ بعد. وما سوى ذلك لجهازٍ آخر: لا
   * يُعرض هنا ولا يُتسلَّم، فيصل قراره إلى الجهاز الذي أرسله.
   * ويُرجع:
   *   list  ما يُحفظ على الجهاز.
   *   ack   ما وصل قراره ممّا للجهاز — يُحذف من السحابة بعد أن يُحفظ.
   *   view  ما يُعرض: ما للجهاز. وما ينتظر ولم يعد في السحابة (gone): سُحب،
   *         أو أخذه جهازٌ آخر قبل هذا الإصدار، أو حذفه الحاسوب بعد ثلاثين
   *         يوماً — لا يُعرف قراره هنا.
   */
  function merge(stored, cloud, now = Date.now(), device = deviceId()) {
    const adopt = !Array.isArray(stored);
    const mine = new Map();
    for (const e of adopt ? [] : stored) if (e?.id) mine.set(String(e.id), e);
    const inCloud = new Map();
    for (const r of Array.isArray(cloud) ? cloud : []) if (r?.id) inCloud.set(String(r.id), r);

    const fromCloud = (row, localStatus) => ({ ...toEntry(row, localStatus), read_at: now });
    for (const [id, row] of inCloud) {
      const had = mine.get(id);
      if (had) mine.set(id, older(row, had, now) ? had : fromCloud(row, had.local_status || 'sent'));
      else if (device && String(row.device ?? '') === String(device)) mine.set(id, fromCloud(row, 'sent'));
      else if (adopt && legacy(row)) mine.set(id, fromCloud(row, 'adopted'));
    }

    const list = prune([...mine.values()], now);
    /* ويُحذف ما حُفظ قراره كما هو في السحابة الآن — لا ما بقي هنا على قرارٍ بعده. */
    const ack = list.filter((e) => {
      const status = inCloud.get(String(e.id))?.status;
      return final.includes(status) && status === e.status;
    }).map((e) => e.id);
    const view = list.map((e) => (live.includes(e.status) && !inCloud.has(String(e.id)) ? { ...e, gone: true } : e))
      .sort(byCreated);
    return { list, ack, view };
  }

  /** سجلّ الحساب على هذا الجهاز — أو null إن لم يكن له سجلّ بعد، أو تعذّرت قراءته. */
  function read(uid) {
    if (!uid) return null;
    try {
      const raw = localStorage.getItem(key(uid));
      if (raw === null || raw === undefined) return null;
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list : null;
    } catch {
      return null;
    }
  }

  /**
   * يحفظ السجلّ ويُرجع ما حُفظ فعلاً — أو null إن لم يُحفظ شيء، ويبقى
   * المحفوظ قبله كما كان. فإن امتلأ التخزين حُفظ أحدثه: نصفه ثم ربعه…
   * حتى عشرين — فالقرار الذي وصل الآن يُحفظ ولو سقط ما قبل أشهر.
   */
  function write(uid, list) {
    if (!uid) return null;
    for (let n = list.length; ; n = Math.floor(n / 2)) {
      const part = list.slice(0, n);
      try {
        localStorage.setItem(key(uid), JSON.stringify(part));
        return part;
      } catch {
        if (n <= 20) return null;
      }
    }
  }

  /** ما للحساب على هذا الجهاز وحده — حين تتعذّر السحابة. */
  const local = (uid) => (read(uid) ?? []).map((e) => toEntry(e)).sort(byCreated);

  /**
   * يحفظ في سجلّ الجهاز ما أُرسل منه — بانتظار الحاسوب الرئيسي. وما فيه من
   * قبل (إعادة إرسالٍ بعد انقطاع) يبقى كما حُفظ: ما في السحابة هو الإرسال
   * الأول، وهو يغلب حين يُقرأ.
   */
  function remember(uid, sent, now = Date.now()) {
    if (!uid || !sent?.id) return false;
    const list = read(uid) ?? [];
    if (list.some((e) => String(e.id) === String(sent.id))) return true;
    const entry = toEntry({ ...sent, status: 'pending', created_at: new Date(now).toISOString() }, 'sent');
    return Boolean(write(uid, prune([entry, ...list], now)));
  }

  /** سُحب من السحابة: يبقى في السجلّ «مسحوباً» — بما حُفظ منه، أو بما عُرض. */
  function withdrawn(uid, id, row = null) {
    const list = read(uid) ?? [];
    const had = list.find((e) => String(e.id) === String(id));
    const entry = { ...toEntry(had ?? row ?? { id }, 'withdrawn'), status: 'withdrawn' };
    write(uid, prune([entry, ...list.filter((e) => String(e.id) !== String(id))]));
  }

  /* ما يُحذف الآن من السحابة — فتحديثان متقاربان لا يحذفان السطر نفسه مرّتين. */
  const acking = new Set();

  /**
   * ما للحساب كما يُعرض: يدمج ما قرأته الشاشة من السحابة بسجلّ الجهاز
   * ويحفظه — ثم، بعد الحفظ وحده، يحذف من السحابة ما وصل قراره منه، بما حُفظ
   * منه: ack(id, { status, updated_at }). فإن تغيّر القرار في السحابة بعد قراءته
   * لم يُحذف، ويُحفظ الأحدث في التحديث التالي ثم يُحذف.
   *
   * وnow متى بدأت قراءة cloud: قراءةٌ بدأت قبل ما حفظته صفحةٌ أخرى على الهاتف
   * لا تغلبه (merge).
   *
   * يُرجع { view, done, kept }: view ما يُعرض الآن دون انتظار الحذف، وdone وعدٌ
   * بما حُذف، وkept هل حُفظ السجلّ (وإلا فالقرارات لا تبقى على هذا الجهاز ولا
   * يُحذف من السحابة شيء). والحذف واحداً واحداً: ما تعذّر منه (الشبكة، أو سكربت
   * سحابةٍ لم يُحدَّث بعد) يُترك للتحديث التالي، والسطر محفوظٌ هنا في الحالين.
   *
   * والقراءة والدمج والحفظ في خطوةٍ واحدة بلا انتظار بينها: ما أُرسل من
   * صفحةٍ أخرى أثناء قراءة السحابة لا يمحوه حفظٌ قرأ السجلّ قبله.
   */
  function settle(uid, cloud, ack, now = Date.now(), device = deviceId()) {
    const { list, ack: due, view } = merge(read(uid), cloud, now, device);
    const saved = write(uid, list);
    const kept = new Map((saved ?? []).map((e) => [String(e.id), e]));
    const ids = due.filter((id) => kept.has(String(id)) && !acking.has(String(id)));
    const done = (async () => {
      const acked = [];
      for (const id of ids) acking.add(String(id));
      try {
        for (const id of ids) {
          const e = kept.get(String(id));
          if (await ack(id, { status: e.status, updated_at: e.updated_at ?? null })) acked.push(String(id));
        }
      } catch { /* الباقي في التحديث التالي */ }
      finally {
        for (const id of ids) acking.delete(String(id));
      }
      if (acked.length) {
        /* قراءةٌ جديدة: ما حُفظ أثناء الحذف يبقى. */
        const fresh = read(uid) ?? [];
        write(uid, fresh.map((e) => (acked.includes(String(e.id)) ? { ...e, local_status: 'acked' } : e)));
      }
      return acked;
    })();
    return { view, done, kept: saved !== null };
  }

  return { key, toEntry, prune, merge, read, write, local, remember, withdrawn, settle };
}

const requestLog = deviceLog({
  prefix: 'gc-portal-requests',
  fields: ENTRY,
  shape: (row, out) => { out.lines = Array.isArray(row?.lines) ? row.lines : []; },
  stages: STAGE,
  final: FINAL_STATUSES,
  live: LIVE_STATUSES,
});

export const historyKey = requestLog.key;

/** سطر السحابة — أو الطلب المرسَل — بما يحفظه الجهاز منه. */
export const toEntry = requestLog.toEntry;

/** آخر 300 طلب في سنة، بآخر ما جرى عليها (deviceLog). */
export const pruneHistory = requestLog.prune;

/** يدمج طلبات الحساب في السحابة بسجلّ الجهاز (deviceLog: merge). */
export const mergeHistory = (stored, cloud, now = Date.now(), device = deviceId()) => requestLog.merge(stored, cloud, now, device);

/** سجلّ الحساب على هذا الجهاز — أو null إن لم يكن له سجلّ بعد، أو تعذّرت قراءته. */
export const readHistory = requestLog.read;

/** يحفظ السجلّ ويُرجع ما حُفظ فعلاً — أو null (deviceLog: write). */
export const writeHistory = requestLog.write;

/** طلبات الحساب على هذا الجهاز وحده — حين تتعذّر السحابة. */
export const localHistory = requestLog.local;

/** يحفظ في سجلّ الجهاز طلباً أُرسل منه — بانتظار الحاسوب الرئيسي. */
export const rememberRequest = (uid, request, now = Date.now()) => requestLog.remember(uid, request, now);

/**
 * طلبات الحساب كما تُعرض: تُدمج وتُحفظ، ثم يُحذف من السحابة ما وصل قراره
 * (deviceLog: settle). يُرجع { view, done, kept }.
 */
export const settleRequests = (uid, cloud, ack = ackRequest, now = Date.now(), device = deviceId()) =>
  requestLog.settle(uid, cloud, ack, now, device);

/* ================ عمليات الأمانات والعمال على هذا الجهاز ================
   من أُعطي «الأمانات» أو «العمال والحضور» يعمل عليها من هاتفه: تسليمٌ وإعادة
   وتمديد وتعديل وحذف، وعاملٌ يُضاف أو يُعدَّل، وحضورٌ يُدوَّن. وكل فعلٍ عمليةٌ
   في gc_ops يطبّقها الحاسوب الرئيسي بقواعد شاشاته: «المعتمد» فور وصولها،
   و«الطالب» بعد موافقة المدير.

   والعملية تمرّ بالسحابة كما يمرّ الطلب: تحمل معرّف هذا الجهاز، وتُحفظ في
   سجلّه (gc-portal-ops:<معرّف الحساب>) حين تُرسل، ويعود قرارها إليه وحده —
   طُبّقت ونتيجتها (رقم الأمانة، رمز العامل)، أو رُدّت وسببها — فيُحفظ ثم
   تُحذف من السحابة (gc_ack_op). وتُسحب ما دامت لم تصل الحاسوب (gc_withdraw_op).

   والسجلّ أوسع من سجلّ الطلبات: الحضور عمليةٌ لكل عاملٍ كل يوم. */

export const OPS_MAX = 600;
/** قرارٌ تمّ: طُبّقت، أو رُدّت، أو أُلغيت بعد تطبيقها. */
export const OP_FINAL = ['applied', 'rejected', 'cancelled'];
export const OP_LIVE = ['pending', 'received'];
const OP_STAGE = { pending: 0, received: 1, applied: 2, rejected: 2, cancelled: 3, withdrawn: 3 };

/* ما يحفظه الجهاز من العملية: نوعها وبياناتها كما أُرسلت، وقرارها ونتيجته. */
const OP_ENTRY = {
  id: null, kind: '', payload: null, direct: false, created_at: null, status: 'pending', decision_note: '',
  result: null, decided_by: '', decided_at: null, updated_at: null, read_at: null,
};

const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

const opLog = deviceLog({
  prefix: 'gc-portal-ops',
  fields: OP_ENTRY,
  shape: (row, out) => {
    out.payload = isObject(row?.payload) ? row.payload : {};
    out.result = isObject(row?.result) ? row.result : null;
  },
  stages: OP_STAGE,
  final: OP_FINAL,
  live: OP_LIVE,
  max: OPS_MAX,
});

export const opsKey = opLog.key;
export const toOpEntry = opLog.toEntry;
export const mergeOps = (stored, cloud, now = Date.now(), device = deviceId()) => opLog.merge(stored, cloud, now, device);
export const readOps = opLog.read;
export const writeOps = opLog.write;
/** عمليات الحساب على هذا الجهاز وحده — حين تتعذّر السحابة. */
export const localOps = opLog.local;
export const rememberOp = (uid, op, now = Date.now()) => opLog.remember(uid, op, now);

/**
 * يُرسل عمليةً: { id, kind, payload }. المعرّف من المتصفّح كالطلب: إعادة
 * الإرسال بعد انقطاع لا تُكرّرها — ويُرجع false إن كانت قد وصلت من قبل.
 * والسحابة تكتب صاحبها ومباشرتها وحالتها (gc_ops_guard)، وترفض ما لا يملكه
 * الحساب برسالةٍ عربية. وdirect كما كان الحساب يوم أُرسلت.
 */
export async function insertOp(op, { direct = false } = {}) {
  const body = { id: op.id, kind: op.kind, payload: op.payload, device: deviceId() };
  let fresh = true;
  try {
    await call('/rest/v1/gc_ops', { method: 'POST', body, headers: { Prefer: 'return=minimal' } });
  } catch (err) {
    if (err.status !== 409) throw err;
    fresh = false;
  }
  rememberOp(currentUserId(), { id: op.id, kind: op.kind, payload: op.payload, direct: Boolean(direct) });
  return fresh;
}

/** «تسلّمت» العملية: بمعنى ackRequest حرفاً بحرف — بما حُفظ منها وحده. */
export async function ackOp(id, seen = {}) {
  if (!seen?.status || !seen?.updated_at) return false;
  return (await rpc('gc_ack_op', {
    op_id: id, seen_status: seen.status, seen_updated_at: seen.updated_at,
  })) === true;
}

/** يسحب عمليةً لم تصل الحاسوب الرئيسي بعد — وتبقى في سجلّ الجهاز «مسحوبة». */
export async function withdrawOp(id, row = null) {
  const done = (await rpc('gc_withdraw_op', { op_id: id })) === true;
  if (done) opLog.withdrawn(currentUserId(), id, row);
  return done;
}

/** عمليات الحساب كما تُعرض: تُدمج بسجلّ الجهاز وتُحفظ، ثم يُحذف ما وصل قراره. */
export const settleOps = (uid, cloud, ack = ackOp, now = Date.now(), device = deviceId()) =>
  opLog.settle(uid, cloud, ack, now, device);

/* ======================== سلّة الطالب على هذا الجهاز ========================
   «الطالب» يطلب من قائمة الطلبات (menu.js) كما يطلب الطعام: يضيف المواد إلى
   سلّةٍ ثم يرسلها طلباً واحداً. والسلّة على الهاتف لا في السحابة، ولكل حساب
   سلّته (gc-portal-cart-<معرّفه>): تبقى بعد إعادة فتح الصفحة، ولا تُعرض على
   موظفٍ آخر يدخل من الهاتف نفسه.

   وفيها معرّف الطلب الذي ستصير إليه: يبقى معها حتى يُرسل، فإرسالٌ انقطع
   جوابه ثم أُعيد لا يتكرّر (insertRequest) — وتُفرَّغ بعد الإرسال فتأخذ
   معرّفاً جديداً. وأسطرها المادة وكميتها وحدهما: اسمها ووحدتها من المواد
   حين تُعرض، وما أُوقف منها يسقط (menu.js). والطقم الجاهز (الإصدار الخامس)
   سطرٌ بمعرّفه وعدده { kit_id, qty } — عددٌ صحيح من ١ إلى ٩٩٩.

   ومتصفّحٌ لا يحفظ ما يُكتب فيه — أو امتلأ تخزينه — تبقى السلّة في الصفحة ما
   دامت مفتوحة، ولا تغلبها سلّةٌ أقدم بقيت في التخزين. */

const CART_PREFIX = 'gc-portal-cart';
/* ما لم يُحفظ في التخزين من سلال هذه الصفحة: معرّف الحساب ← السلّة. */
const cartMemo = new Map();

export const cartKey = (uid) => `${CART_PREFIX}-${uid}`;

/**
 * السلّة كما تُحفظ: معرّف الطلب، ونوعه، ومنزله، وملاحظاته، والأسطر —
 * كل مادة مرّةً بكميةٍ موجبة، وكل طقمٍ مرّةً بعددٍ صحيح من ١ إلى ٩٩٩. والسطر
 * مادةٌ أو طقم لا الاثنان. وما سوى ذلك (سلّةٌ تالفة) يُصحَّح أو يسقط، والترتيب
 * كما كان.
 */
export function normalCart(raw) {
  const cart = isObject(raw) ? raw : {};
  const seen = new Set();
  const lines = [];
  for (const line of Array.isArray(cart.lines) ? cart.lines : []) {
    const qty = Number(line?.qty);
    const isKit = line?.kit_id !== undefined && line?.kit_id !== null;
    if (isKit) {
      const kit = Number(line.kit_id);
      if (line.item_id !== undefined && line.item_id !== null) continue;
      if (!Number.isInteger(kit) || kit <= 0 || !Number.isInteger(qty) || qty < 1 || qty > 999 || seen.has(`k${kit}`)) continue;
      seen.add(`k${kit}`);
      lines.push({ kit_id: kit, qty });
      continue;
    }
    const id = Number(line?.item_id);
    if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(qty) || qty <= 0 || seen.has(`i${id}`)) continue;
    seen.add(`i${id}`);
    lines.push({ item_id: id, qty });
  }
  return {
    id: typeof cart.id === 'string' && cart.id ? cart.id : randomId(),
    type: cart.type === 'in' ? 'in' : 'out',
    house_id: Number.isInteger(cart.house_id) ? cart.house_id : null,
    notes: typeof cart.notes === 'string' ? cart.notes : '',
    lines,
  };
}

/** سلّة الحساب على هذا الجهاز — أو null إن لم تكن له سلّة. */
export function readCart(uid) {
  if (!uid) return null;
  const kept = cartMemo.get(String(uid));
  if (kept) return normalCart(kept);
  let raw = null;
  try { raw = localStorage.getItem(cartKey(uid)); } catch { raw = null; }
  if (!raw) return null;
  try {
    return normalCart(JSON.parse(raw));
  } catch {
    return null;   // تالفة: كأن لا سلّة
  }
}

/**
 * يحفظ السلّة — والفارغة تُمحى بمعرّفها: السلّة التالية طلبٌ جديد. ويُرجع
 * هل حُفظت في التخزين، وإلا بقيت في هذه الصفحة وحدها.
 */
export function writeCart(uid, cart) {
  if (!uid) return false;
  const value = cart?.lines?.length ? normalCart(cart) : null;
  try {
    if (value) localStorage.setItem(cartKey(uid), JSON.stringify(value));
    else localStorage.removeItem(cartKey(uid));
    cartMemo.delete(String(uid));
    return true;
  } catch {
    if (value) cartMemo.set(String(uid), value);
    else cartMemo.delete(String(uid));
    /* ما بقي في التخزين أقدم منها: لا يُقرأ بعد إعادة الفتح على أنه الأحدث. */
    try { localStorage.removeItem(cartKey(uid)); } catch { /* محجوب */ }
    return false;
  }
}
