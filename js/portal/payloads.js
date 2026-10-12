/* ===================== ما يرسله الموقع في كل عملية =====================
   بيانات كل عملية (gc_ops.payload) كما يقرؤها الحاسوب الرئيسي ويطبّقها بقواعد
   شاشاته (server/ops.js) — بأسماء خاناتها هناك:

     custody_issue     الصنف (مسجّلٌ أو جديد) والكمية والمستلم (عاملٌ أو اسم)
                       وهاتفه وصفته والتاريخان والملاحظات، ومرجع التسليم الواحد.
     custody_return    الأمانة والكمية والتاريخ — وبلا كمية: الباقي كلّه.
     custody_extend    الأمانة والموعد الجديد (أو بلا موعد).
     custody_edit      الأمانة وما تغيّر وحده: به يكتب الحاسوب سيرتها.
     custody_delete    الأمانة.
     custody_item_add  الاسم والوحدة والتفاصيل والعدد المملوك.
     worker_add        الاسم والمهنة والهاتف والملاحظات والمخزن — والرمز يُعطيه الحاسوب.
     worker_edit       العامل وما تغيّر وحده — ولا رقم هوية: لا يخرج من الحاسوب.
     attendance_set    العامل واليوم والحال، ووقتا الحاضر.
     attendance_all    اليوم والحال: لمن لا سجلّ له ذلك اليوم.
     attendance_punch  العامل ودخولٌ أو خروج بوقت الضغطة على الهاتف.

   دوالّ خالصة بلا صفحة: تبنيها الشاشتان (custody.js وworkers.js)، ويُرسل بها
   الفحص عملياتٍ حقيقية يطبّقها الحاسوب (test/cw-web-roundtrip) — فلا تفترق
   خانات الموقع عن خانات الحاسوب يوماً دون أن يُرى. */

const text = (value) => String(value ?? '').trim();

/** تسليم أمانة: item صنفٌ مسجّل { id } أو جديد { name, unit, details }. */
export function issuePayload({ item, qty, workerId = null, holder = '', phone = '', title, issueDate, dueDate = null, notes = '', ref = null }) {
  return {
    ...(item?.id
      ? { custody_item_id: Number(item.id) }
      : { new_item: { name: text(item?.name), unit: text(item?.unit), details: text(item?.details) } }),
    qty: Number(qty),
    ...(workerId ? { worker_id: Number(workerId) } : { holder: text(holder) }),
    holder_phone: text(phone),
    holder_title: title || (workerId ? 'worker' : 'staff'),
    issue_date: issueDate,
    due_date: dueDate || null,
    notes: text(notes),
    ...(ref ? { client_ref: String(ref) } : {}),
  };
}

/**
 * إعادة أمانة. الباقي كلّه يُرسل بلا كمية — يعيده الحاسوب كلّه كما هو ساعة
 * التطبيق — ما لم تكن على الأمانة إعادةٌ أخرى تنتظر: فبكميتها.
 */
export function returnPayload(row, qty, date) {
  const all = Math.abs(Number(qty) - Number(row.outstanding)) < 1e-9 && !(row.wait?.returnQty > 0);
  return { custody_id: Number(row.id), qty: all ? null : Number(qty), date };
}

export const extendPayload = (row, due) => ({ custody_id: Number(row.id), due_date: due || null });

/** الأمانة كما عرضها نموذج التعديل — وصفةٌ لم تُكتب (سجلٌّ قديم) هي ما عرضه. */
export const custodyBefore = (c) => ({
  custody_item_id: c.custody_item_id, qty: c.qty, worker_id: c.worker_id ?? null, holder: c.worker_id ? '' : (c.holder ?? ''),
  holder_phone: c.holder_phone ?? '', holder_title: c.holder_title || (c.worker_id ? 'worker' : 'staff'),
  issue_date: c.issue_date, due_date: c.due_date ?? null, notes: c.notes ?? '',
});

/** ما تغيّر في نموذج التعديل — والمستلم زوجٌ: العامل أو الاسم يُرسلان معاً. */
export function changedFields(before, after) {
  const same = (k) => (k === 'qty'
    ? Math.abs(Number(after.qty) - Number(before.qty)) < 1e-9
    : String(after[k] ?? '') === String(before[k] ?? ''));
  const body = Object.fromEntries(Object.keys(after).filter((k) => !same(k)).map((k) => [k, after[k]]));
  if ('worker_id' in body || 'holder' in body) Object.assign(body, { worker_id: after.worker_id ?? null, holder: after.holder ?? '' });
  return body;
}

export const editPayload = (row, changes) => ({ custody_id: Number(row.id), changes });
export const deletePayload = (row) => ({ custody_id: Number(row.id) });

export const itemPayload = ({ name, unit = '', details = '', owned = 0 }) => ({
  name: text(name), unit: text(unit), details: text(details), owned_qty: Number(owned) || 0,
});

export const workerPayload = ({ name, job = '', phone = '', notes = '', warehouse = null }) => ({
  name: text(name), job_title: text(job), phone: text(phone), notes: text(notes), warehouse_id: Number(warehouse) || null,
});

/** ما تغيّر في ملف العامل — ورمزه ومخزنه ورقم هويته لا تُعدَّل من الموقع. */
export function workerChanges(w, next) {
  const before = { name: w.name ?? '', job_title: w.job_title ?? '', phone: w.phone ?? '', notes: w.notes ?? '', active: Number(w.active ?? 1) === 1 ? 1 : 0 };
  const after = { name: text(next.name), job_title: text(next.job_title), phone: text(next.phone), notes: text(next.notes), active: next.active ? 1 : 0 };
  return Object.fromEntries(Object.keys(after).filter((k) => String(after[k]) !== String(before[k])).map((k) => [k, after[k]]));
}

export const workerEditPayload = (w, changes) => ({ worker_id: Number(w.id), changes });

/** حال العامل في يوم. الحاضر يبقى بوقتيه: من غُيّر إلى حاضرٍ بعد دخوله لا يُمحى دخوله. */
export const attendancePayload = (r, date, status) => ({
  worker_id: Number(r.worker_id), date, status,
  check_in: status === 'present' ? (r.check_in ?? null) : null,
  check_out: status === 'present' ? (r.check_out ?? null) : null,
});

export const restPayload = (date, status = 'present') => ({ date, status });

/* وقت الضغطة على الهاتف: العملية قد تُطبَّق بعد ساعات، والدخول دخولُ ساعته. */
export const punchPayload = (r, direction, at = new Date()) => ({
  worker_id: Number(r.worker_id), direction, at: at.toISOString(),
});
