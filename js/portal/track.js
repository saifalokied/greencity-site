/* ============================ متابعة الطلب ============================
   أين وصل الطلب؟ مراحله كما يراها صاحبه على هاتفه، من سجلّه (sb.js) — بلا
   شاشة ولا عقدة: دوالّ تُختبر في Node، ويرسمها views.js.

     أُرسل ← وصل إلى الحاسوب الرئيسي ← تمت الموافقة (رقم السند)
           ← قيد التجهيز ← تم التجهيز

   والنهايات الأخرى: رُفض (وسببه)، سُحب، أُلغي السند (وسببه).

   ومرحلتا التجهيز لطلب الإخراج وحده، ولا تُعرضان إلا إن عُرف أنهما ستأتيان:
   prep_status في السجلّ null حين لم يحمله سطر السحابة قطّ — سحابةٌ لم يُعَد
   فيها السكربت، أو موقعٌ أقدم، أو سجلٌّ كُتب قبل الإصدار الخامس — فلا يُوعد
   صاحب الطلب بمرحلةٍ لن تصل. و'' في سحابةٍ تعرفها: لم يُجهَّز بعد، أو اعتُمد
   قبل الإصدار الخامس فلا يُتابَع.
   ===================================================================== */

/** كل ما يُكتب في المراحل — هنا وحده، فيجده فحص الترجمة. */
export const TRACK_LABELS = {
  sent: 'أُرسل',
  pending: 'بانتظار الحاسوب الرئيسي',
  pendingDirect: 'يُسجَّل حين يتّصل الحاسوب الرئيسي',
  arrived: 'وصل إلى الحاسوب الرئيسي',
  approval: 'موافقة المدير',
  awaiting: 'بانتظار موافقة المدير',
  approved: 'تمت الموافقة',
  auto: 'سُجّل تلقائياً',
  posted: 'سُجّل سنداً',
  preparing: 'قيد التجهيز',
  prepared: 'تم التجهيز',
  rejected: 'رُفض',
  withdrawn: 'سُحب',
  cancelled: 'أُلغي السند',
  gone: 'لم يصل قراره إلى هذا الجهاز',
  withdrawnNote: 'سحبتَه قبل أن يصل إلى الحاسوب الرئيسي',
  voucher: 'السند',
};

/**
 * الحالة كما تُعرض — مشتقّةٌ لا تُحفظ: «قيد التجهيز» و«تم التجهيز» سندٌ سُجّل
 * ومرحلةُ تجهيزه، و«لم يصل قراره» طلبٌ ينتظر ولم يعد في السحابة.
 */
export function displayStatus(r) {
  if (r?.gone) return 'gone';
  if (r?.status === 'posted' && r.prep_status === 'waiting') return 'preparing';
  if (r?.status === 'posted' && r.prep_status === 'done') return 'prepared';
  return r?.status ?? 'pending';
}

/** هل تُتابَع مرحلة تجهيز هذا الطلب؟ — طلب إخراج، في سحابةٍ تعرفها، ولم ينتهِ بغيرها. */
export function prepTracked(r) {
  const known = r?.prep_status !== null && r?.prep_status !== undefined;
  return r?.type === 'out' && known && (
    ['pending', 'received'].includes(r.status)       // السحابة تعرفها: المرحلتان آتيتان
    || (r.status === 'posted' && ['waiting', 'done'].includes(r.prep_status))  // سُجّل وتُتابَع

    || (r.status === 'cancelled' && r.prep_status === 'done'));
}

/** سبب إلغاء السند كما كتبه البرنامج: «أُلغي السند OUT-…: السبب». */
const cancelReason = (note) => /^أُلغي السند \S+:\s*([\s\S]*)$/.exec(String(note ?? ''))?.[1] ?? null;

/**
 * مراحل الطلب بالترتيب: [{ key, label, state, at, by, voucher, note }].
 * state: done تمّت · now الآن · todo لم تأتِ بعد · bad انتهى بها (رُفض، سُحب…).
 * وnote ما كتبه المدير (سبب الردّ أو الإلغاء) أو البرنامج (لِمَ لم يُسجَّل تلقائياً).
 */
export function timeline(r) {
  const L = TRACK_LABELS;
  const step = (key, label, state, extra = {}) => ({
    key, label, state, at: null, by: null, voucher: null, note: null, ...extra,
  });
  const steps = [step('sent', L.sent, 'done', { at: r.created_at ?? null })];

  if (r.status === 'withdrawn') {
    steps.push(step('withdrawn', L.withdrawn, 'bad', { note: L.withdrawnNote }));
    return steps;
  }
  if (r.gone) {
    steps.push(step('gone', L.gone, 'bad'));
    return steps;
  }

  /* ٢ — الوصول إلى الحاسوب الرئيسي. */
  if (r.status === 'pending') steps.push(step('arrived', r.direct ? L.pendingDirect : L.pending, 'now'));
  else steps.push(step('arrived', L.arrived, 'done', { at: r.received_at ?? null }));

  /* ٣ — الموافقة. و«سُجّل تلقائياً» ما دام سنداً قائماً وحده: إلغاء السند يكتب
     اسم من ألغاه ووقته مكان القرار، فلا يُعرف بعده من وافق ولا متى. */
  const note = r.decision_note || null;
  if (r.status === 'pending') steps.push(step('approved', L.approval, 'todo'));
  else if (r.status === 'received') steps.push(step('approved', L.awaiting, 'now', { note }));
  else if (r.status === 'rejected') {
    steps.push(step('approved', L.rejected, 'bad', { at: r.decided_at ?? null, by: r.decided_by || null, note }));
    return steps;
  } else if (r.status === 'posted') {
    const auto = String(r.decided_by ?? '').startsWith('تلقائياً');
    steps.push(step('approved', auto ? L.auto : L.approved, 'done', {
      voucher: r.voucher_number || null, at: r.decided_at ?? null, by: auto ? null : r.decided_by || null, note,
    }));
  } else if (r.status === 'cancelled') {
    steps.push(step('approved', L.posted, 'done', { voucher: r.voucher_number || null }));
  }

  /* ٤ و٥ — التجهيز، لما يُتابَع وحده. */
  if (prepTracked(r)) {
    const done = r.prep_status === 'done';
    steps.push(step('preparing', L.preparing,
      done ? 'done' : r.status === 'posted' && r.prep_status === 'waiting' ? 'now' : 'todo'));
    steps.push(step('prepared', L.prepared, done ? 'done' : 'todo',
      done ? { at: r.prepared_at ?? null, by: r.prepared_by || null } : {}));
  }

  /* ٦ — إلغاء السند. */
  if (r.status === 'cancelled') {
    steps.push(step('cancelled', L.cancelled, 'bad', {
      at: r.decided_at ?? null, by: r.decided_by || null, note: cancelReason(r.decision_note),
    }));
  }
  return steps;
}

/** المرحلة الحالية: ما يجري الآن، أو ما انتهى به الطلب — وإلا آخر ما تمّ. */
export function currentStep(steps) {
  return steps.find((s) => s.state === 'now' || s.state === 'bad')
    ?? [...steps].reverse().find((s) => s.state === 'done') ?? steps[0];
}
