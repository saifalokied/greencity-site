/* ================== ما أُرسل ولم يُقرَّر — فوق ما رفعه الحاسوب ==================
   شاشتا الأمانات والعمال تقرآن ما رفعه الحاسوب الرئيسي إلى السحابة، وما يفعله
   الموظف من هاتفه عمليةٌ تنتظر الحاسوب (sb.js). فلو عُرض المرفوع وحده لاختفى
   ما فعله الآن حتى يتّصل الحاسوب ويطبّقه — فيعيده ظانّاً أنه لم يصل.

   فتُعرض العمليات المنتظرة من سجلّ هذا الجهاز فوقه، كلٌّ بعلامته:
     — تسليمٌ ينتظر: سطرٌ جديد في الأمانات بلا رقم بعد.
     — إعادةٌ أو تمديدٌ أو تعديلٌ أو حذفٌ ينتظر: يُعلَّم على سطر أمانته — ولا
       يُغيَّر المرفوع: الحاسوب قد يردّه.
     — عاملٌ جديد ينتظر: سطرٌ في العمال. وتعديله: علامةٌ على سطره.
     — الحضور: يُعرض كما سيصير — حاضرٌ أو غائب، ودخولٌ وخروج بوقت الضغطة —
       وعليه علامة الانتظار؛ فمن يدوّن الحضور صباحاً يكمل من حيث انتهى.

   وتسليمٌ طُبّق ولم يصل سطره إلى السحابة بعد (الرفع يتبع التطبيق بثوانٍ)
   يبقى ظاهراً برقمه دقائق — لا يختفي ما سُلّم لحظةً بين التطبيق والرفع.

   دوالّ خالصة بلا صفحة ولا شبكة: تُفحص في Node كما هي (test/cw-web-*). */

/** ما زال ينتظر: لم يصل الحاسوب، أو وصله وينتظر المدير. */
export const LIVE = ['pending', 'received'];

/** تسليمٌ طُبّق ولم يُرفع سطره بعد: يبقى ظاهراً هذه المدّة بعد قراره. */
export const LANDING_MS = 10 * 60 * 1000;

const time = (value) => Date.parse(value ?? '') || 0;
const byOldest = (a, b) => time(a.created_at) - time(b.created_at) || String(a.id).localeCompare(String(b.id));

/** العمليات التي تنتظر — أقدمها أوّلاً، كما سيطبّقها الحاسوب. وما «لم يصل قراره» لا يُعرف: لا يُعرض فوق شيء. */
export const waiting = (ops) => (Array.isArray(ops) ? ops : [])
  .filter((o) => o && LIVE.includes(o.status) && !o.gone)
  .sort(byOldest);

const p = (op) => (op?.payload && typeof op.payload === 'object' ? op.payload : {});
const qtyOf = (value) => (value === null || value === undefined || value === '' ? null : Number(value));

/* ------------------------------ الأمانات ------------------------------ */

/** حالة الأمانة من كميتها وما أُعيد منها — كما يحسبها الحاسوب. */
export function custodyStatus(qty, returned) {
  const q = Number(qty) || 0;
  const r = Number(returned) || 0;
  if (r <= 1e-9) return 'open';
  return r >= q - 1e-9 ? 'returned' : 'partial';
}

/** متأخّرة: لم تُعَد كاملة، ومضى موعد إعادتها. */
export const isOverdue = (row, today) => row.status !== 'returned' && Boolean(row.due_date) && String(row.due_date) < String(today);

/**
 * الأمانات كما تُعرض: سطور السحابة بأسماء أصنافها ومستلميها وما بقي منها،
 * وفوقها ما ينتظر من هذا الجهاز.
 *   data   { custody, items, workers }
 *   ops    عمليات الجهاز (sb.js) بحالاتها.
 *   today  تاريخ اليوم 'YYYY-MM-DD' — للمتأخّرة.
 *   now    الآن — لتسليمٍ طُبّق ولم يُرفع سطره بعد.
 * وكل سطر: item_name وunit وholder_name وphone وoutstanding وoverdue، وwait
 * ما ينتظر عليه: { ops, returnQty, returnAll, due, edit, remove }. والتسليم
 * المنتظر سطرٌ معرّفه ‎op:…‎ وفيه op (العملية) وdraft.
 */
export function custodyRows(data, ops, today, now = Date.now()) {
  const items = new Map((data?.items ?? []).map((i) => [Number(i.id), i]));
  const workers = new Map((data?.workers ?? []).map((w) => [Number(w.id), w]));
  const decorate = (row) => {
    const item = items.get(Number(row.custody_item_id));
    const worker = row.worker_id ? workers.get(Number(row.worker_id)) : null;
    const qty = Number(row.qty) || 0;
    const returned = Number(row.returned_qty) || 0;
    const out = {
      ...row,
      item_name: row.item_name ?? item?.name ?? '',
      unit: row.unit ?? item?.unit ?? '',
      item_details: row.item_details ?? item?.details ?? '',
      holder_name: worker?.name || row.holder || '',
      job_title: worker?.job_title ?? '',
      phone: row.holder_phone || worker?.phone || '',
      qty,
      returned_qty: returned,
      outstanding: Math.max(0, qty - returned),
      wait: { ops: [], returnQty: 0, returnAll: false, due: undefined, edit: null, remove: false },
    };
    out.status = row.status || custodyStatus(qty, returned);
    out.overdue = isOverdue(out, today);
    return out;
  };

  /* تسليمٌ من هذا الجهاز: سطرٌ بلا رقم ينتظر — أو برقمه إن طُبّق ولم يُرفع بعد. */
  function issueDraft(op, dress, number) {
    const x = p(op);
    const fresh = !x.custody_item_id && x.new_item && typeof x.new_item === 'object' ? x.new_item : null;
    const row = dress({
      id: `op:${op.id}`,
      number,
      custody_item_id: x.custody_item_id ?? null,
      item_name: fresh ? String(fresh.name ?? '') : undefined,
      unit: fresh ? String(fresh.unit ?? '') : undefined,
      item_details: fresh ? String(fresh.details ?? '') : undefined,
      qty: Number(x.qty) || 0,
      returned_qty: 0,
      worker_id: x.worker_id ?? null,
      holder: x.holder ?? '',
      holder_phone: x.holder_phone ?? '',
      holder_title: x.holder_title ?? '',
      issue_date: x.issue_date || String(op.created_at ?? '').slice(0, 10),
      due_date: x.due_date || null,
      notes: x.notes ?? '',
      created_at: op.created_at,
    });
    row.status = 'open';
    row.overdue = isOverdue(row, today);
    row.draft = true;
    row.op = op;
    return row;
  }

  const rows = (data?.custody ?? []).map(decorate);
  const byId = new Map(rows.map((r) => [String(r.id), r]));
  const drafts = [];

  /* تسليمٌ طُبّق ولم يصل سطره: برقمه، دقائق بعد قراره. */
  for (const op of Array.isArray(ops) ? ops : []) {
    if (op?.kind !== 'custody_issue' || op.status !== 'applied' || op.gone) continue;
    const id = op.result?.custody_id;
    if (id === undefined || id === null || byId.has(String(id))) continue;
    if (now - time(op.decided_at) > LANDING_MS) continue;
    drafts.push(issueDraft(op, decorate, op.result?.custody_number ?? ''));
  }

  for (const op of waiting(ops)) {
    const x = p(op);
    if (op.kind === 'custody_issue') {
      drafts.push(issueDraft(op, decorate, ''));
      continue;
    }
    const row = byId.get(String(x.custody_id));
    if (!row) continue;
    row.wait.ops.push(op);
    if (op.kind === 'custody_return') {
      const q = qtyOf(x.qty);
      if (q === null) row.wait.returnAll = true;
      else row.wait.returnQty += q;
    } else if (op.kind === 'custody_extend') {
      row.wait.due = x.due_date || null;
    } else if (op.kind === 'custody_edit') {
      row.wait.edit = { ...(row.wait.edit ?? {}), ...(x.changes && typeof x.changes === 'object' ? x.changes : {}) };
    } else if (op.kind === 'custody_delete') {
      row.wait.remove = true;
    }
  }

  /* الأحدث أوّلاً: ما سُلّم الآن فوق ما سُلّم قبله. */
  return [...drafts.sort((a, b) => time(b.op.created_at) - time(a.op.created_at)), ...rows.sort(newestCustody)];
}

/** الأحدث تسليماً أوّلاً، ثم الأحدث رقماً. */
function newestCustody(a, b) {
  return String(b.issue_date ?? '').localeCompare(String(a.issue_date ?? '')) || (Number(b.id) || 0) - (Number(a.id) || 0);
}

/** ما يُصفّى به: القائمة (لم تُعَد كاملة)، والمتأخّرة، والمُعادة، والكل. */
export function filterCustody(rows, filter, q = '', fold = (s) => String(s ?? '').toLowerCase()) {
  const query = fold(q);
  return rows.filter((r) => {
    if (filter === 'open' && r.status === 'returned') return false;
    if (filter === 'late' && !r.overdue) return false;
    if (filter === 'returned' && r.status !== 'returned') return false;
    if (!query) return true;
    return fold(`${r.number} ${r.item_name} ${r.holder_name} ${r.phone} ${r.job_title}`).includes(query);
  });
}

/**
 * أصناف الأمانات بما يملكه المشروع منها وما بذمم الناس الآن — وفوقها صنفٌ
 * جديد ينتظر. وما بذمّتهم من سطور السحابة وحدها: المنتظر لم يُسلَّم بعد.
 */
export function custodyItems(data, ops) {
  const out = new Map();
  for (const r of data?.custody ?? []) {
    if (custodyStatus(r.qty, r.returned_qty) === 'returned' || r.status === 'returned') continue;
    const id = Number(r.custody_item_id);
    out.set(id, (out.get(id) ?? 0) + Math.max(0, (Number(r.qty) || 0) - (Number(r.returned_qty) || 0)));
  }
  const items = (data?.items ?? []).map((i) => ({ ...i, owned_qty: Number(i.owned_qty) || 0, out_qty: out.get(Number(i.id)) ?? 0 }));
  const drafts = waiting(ops).filter((o) => o.kind === 'custody_item_add').map((o) => ({
    id: `op:${o.id}`, name: String(p(o).name ?? ''), unit: String(p(o).unit ?? ''), details: String(p(o).details ?? ''),
    owned_qty: Number(p(o).owned_qty) || 0, out_qty: 0, active: 1, draft: true, op: o,
  }));
  return [...drafts, ...items.sort((a, b) => (Number(b.active) - Number(a.active)) || String(a.name).localeCompare(String(b.name), 'ar'))];
}

/* ------------------------------ العمال ------------------------------ */

/**
 * العمال كما يُعرضون: سطور السحابة، وعددُ ما بذمّة كلٍّ من أمانات (إن قُرئت
 * الأمانات)، وفوقها عاملٌ جديد ينتظر وتعديلٌ ينتظر.
 */
export function workerRows(data, ops) {
  const open = new Map();
  for (const r of data?.custody ?? []) {
    if (!r.worker_id || custodyStatus(r.qty, r.returned_qty) === 'returned' || r.status === 'returned') continue;
    open.set(Number(r.worker_id), (open.get(Number(r.worker_id)) ?? 0) + 1);
  }
  const rows = (data?.workers ?? []).map((w) => ({ ...w, active: Number(w.active ?? 1), open_custody: open.get(Number(w.id)) ?? 0, wait: { ops: [], edit: null } }));
  const byId = new Map(rows.map((w) => [String(w.id), w]));
  const drafts = [];
  for (const op of waiting(ops)) {
    const x = p(op);
    if (op.kind === 'worker_add') {
      drafts.push({
        id: `op:${op.id}`, code: '', name: String(x.name ?? ''), job_title: String(x.job_title ?? ''), phone: String(x.phone ?? ''),
        notes: String(x.notes ?? ''), warehouse_id: x.warehouse_id ?? null, active: 1, open_custody: 0, draft: true, op, wait: { ops: [op], edit: null },
      });
    } else if (op.kind === 'worker_edit') {
      const w = byId.get(String(x.worker_id));
      if (!w) continue;
      w.wait.ops.push(op);
      w.wait.edit = { ...(w.wait.edit ?? {}), ...(x.changes && typeof x.changes === 'object' ? x.changes : {}) };
    }
  }
  const sorted = rows.sort((a, b) => (b.active - a.active) || String(a.name).localeCompare(String(b.name), 'ar'));
  return [...drafts, ...sorted];
}

/* ------------------------------ الحضور ------------------------------ */

const pad = (n) => String(n).padStart(2, '0');
/** يوم الضغطة ووقتها بساعة هذا الجهاز — كما يقرؤهما الحاسوب بساعته. */
export function momentOf(at) {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return null;
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

/**
 * حضور يومٍ كما يُعرض: لكل عاملٍ فعّال سطره في السحابة إن كان، ثم ما ينتظر
 * عليه من هذا الجهاز بترتيب إرساله — كما سيطبّقه الحاسوب:
 *   attendance_set    حالته ووقتاه (والوقتان للحاضر وحده، وclear يمحوه).
 *   attendance_all    من لا سجلّ له ذلك اليوم يأخذ الحالة.
 *   attendance_punch  دخولٌ يجعله حاضراً بوقته ويمحو الخروج، وخروجٌ بعد دخول.
 * ويُرجع { rows, summary }: وفي السطر wait (العمليات المنتظرة عليه).
 */
export function attendanceDay(workers, attendance, ops, date) {
  const rec = new Map();
  for (const a of attendance ?? []) if (String(a.date) === String(date)) rec.set(Number(a.worker_id), a);
  const rows = (workers ?? [])
    .filter((w) => Number(w.active ?? 1) === 1 && !String(w.id).startsWith('op:'))
    .map((w) => {
      const a = rec.get(Number(w.id));
      return {
        worker_id: Number(w.id), code: w.code ?? '', name: w.name ?? '', job_title: w.job_title ?? '',
        status: a?.status ?? null, check_in: a?.check_in ?? null, check_out: a?.check_out ?? null, wait: [],
      };
    })
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'ar'));
  const byId = new Map(rows.map((r) => [r.worker_id, r]));

  for (const op of waiting(ops)) {
    const x = p(op);
    if (op.kind === 'attendance_set' && String(x.date) === String(date)) {
      const r = byId.get(Number(x.worker_id));
      if (!r) continue;
      const status = String(x.status ?? 'present');
      const clock = (v) => (/^\d{2}:\d{2}$/.test(String(v ?? '')) ? String(v) : null);
      r.status = status === 'clear' ? null : status;
      r.check_in = status === 'present' ? clock(x.check_in) : null;
      r.check_out = status === 'present' ? clock(x.check_out) : null;
      r.wait.push(op);
    } else if (op.kind === 'attendance_all' && String(x.date) === String(date)) {
      const status = ['present', 'absent', 'leave'].includes(x.status) ? x.status : 'present';
      for (const r of rows) {
        if (r.status) continue;
        r.status = status;
        r.wait.push(op);
      }
    } else if (op.kind === 'attendance_punch') {
      const at = momentOf(x.at ?? op.created_at);
      if (!at || at.date !== String(date)) continue;
      const r = byId.get(Number(x.worker_id));
      if (!r) continue;
      if (x.direction === 'out') {
        if (r.check_in) r.check_out = at.time;
      } else {
        r.status = 'present';
        r.check_in = at.time;
        r.check_out = null;
      }
      r.wait.push(op);
    }
  }

  const count = (status) => rows.filter((r) => r.status === status).length;
  return {
    rows,
    summary: {
      total: rows.length,
      present: count('present'),
      absent: count('absent'),
      leave: count('leave'),
      unset: rows.filter((r) => !r.status).length,
      inside: rows.filter((r) => r.check_in && !r.check_out).length,
    },
  };
}
