/* ============================ العمال والحضور على الموقع ============================
   لمن أعطاه المدير «العمال والحضور» (can_workers): ما يفعله المدير على الحاسوب
   في شاشة العمال، من هاتفه —

     العمال   ملفّاتهم كما رفعها الحاسوب (بلا رقم الهوية: لا يخرج منه)،
              بالبحث والتصفية، وعاملٌ جديد، وتعديل ملفّه أو إيقافه.
     الحضور   يومٌ يومٌ في آخر ٦٢ يوماً: لكل عاملٍ حاضرٌ أو غائب أو مجاز، و
              «الباقون حاضرون» بضغطةٍ صباحاً ثم يُعدَّل الغائب وحده، ودخولٌ
              وخروج بوقت الضغطة على الهاتف — لا بوقت وصولها إلى الحاسوب.

   وكل ضغطةٍ عمليةٌ تُرسل إلى الحاسوب (people.js): «المعتمد» تُسجَّل حين يتّصل،
   و«الطالب» تنتظر موافقة المدير. والحضور يُعرض كما سيصير وعليه علامة الانتظار
   (overlay.js) — فمن يدوّن الحضور صباحاً يكمل من حيث انتهى ولا يعيده. ويُرسم
   من سجلّ الجهاز فور الضغطة، ثم تُقرأ السحابة بعد هدوء الضغطات.
   ========================================================================== */

import {
  h, clear, icon, num, fmtDate, badge, emptyState, loadingState, drawer, field, select, formModal, toast, today,
  daysAgo, debounce, fold, kpi,
} from '../ui.js';
import { tx } from '../i18n.js';
import { localOps, currentUserId } from './sb.js';
import { canWorkers, isTrusted, loadData, go } from './main.js';
import { workerRows, attendanceDay, momentOf } from './overlay.js';
import {
  workerPayload, workerChanges, workerEditPayload, attendancePayload, restPayload, punchPayload,
} from './payloads.js';
import {
  loadPeople, loadAttendance, syncOps, sendOp, newOpId, waitChip, said, dots, fact, ATTENDANCE_DAYS,
  sendHint, kindIcon, opItem, openOp,
} from './people.js';

const ATT = {
  present: { label: 'حاضر', tone: 'ok' },
  absent: { label: 'غائب', tone: 'bad' },
  leave: { label: 'إجازة', tone: 'info' },
};

/* البحث والتصفية واليوم المختار يبقون بين التنقّلات. */
let query = '';
let showAll = false;
let day = '';

export async function workers({ content, route }) {
  if (!canWorkers()) {
    content.append(h('div', { class: 'card' }, emptyState('لا تملك صلاحية العمال والحضور', 'اطلبها من المدير.', null, 'lock')));
    return null;
  }
  const tab = route.param === 'attendance' ? 'attendance' : 'list';
  if (!day || day > today() || day < daysAgo(ATTENDANCE_DAYS)) day = today();

  const actions = h('div', { class: 'page-actions' });
  const head = h('div', { class: 'page-head p-people-head', 'data-op': 'workers' },
    h('div', { style: 'display:flex;gap:12px;align-items:center' }, kindIcon('worker_add', 22, true),
      h('div', {}, h('h2', {}, 'العمال والحضور'), h('p', {}, 'ملفّات العمال، وحضورهم اليومي.'))),
    actions);
  const tabs = h('div', { class: 'seg p-tabs' },
    h('button', { type: 'button', class: tab === 'list' ? 'on' : null, onclick: () => go('#/workers') }, icon('hardhat', 15), 'العمال'),
    h('button', { type: 'button', class: tab === 'attendance' ? 'on' : null, onclick: () => go('#/workers/attendance') }, icon('calendar', 15), 'الحضور'));
  const body = h('div', {}, loadingState(6));
  content.append(head, tabs, body);

  /* ما رفعه الحاسوب، وعمليات الجهاز، والمخازن (لعاملٍ جديد). */
  let snap = null;
  /* آخر قراءةٍ بدأت: قراءةٌ أقدم — مؤقّت النصف دقيقة، أو يومٌ اختير قبل هذا —
     تعود بعد أحدث منها فلا تُرسم. وإلا رُسم حضور يومٍ تحت تاريخ يومٍ آخر:
     عمّاله بلا تسجيل، و«الباقون حاضرون» بعددٍ ليس عدده. */
  let reads = 0;

  async function refresh(force = false) {
    const read = ++reads;
    const forDay = day;
    const [data, sync, attendance, base] = await Promise.all([
      loadPeople(force), syncOps(),
      tab === 'attendance' ? loadAttendance(forDay) : Promise.resolve([]),
      loadData().catch(() => null),
    ]);
    if (!content.isConnected || read !== reads || forDay !== day) return;
    snap = { data, ops: sync.ops, problem: sync.problem, attendance, warehouses: base?.warehouses ?? [], day: forDay };
    paint();
  }

  /** فور الضغطة: يُرسم من سجلّ الجهاز — والعملية فيه — ثم تُقرأ السحابة بعد هدوء الضغطات. */
  const later = debounce(() => { refresh(true).catch(() => {}); }, 4000);
  function repaintLocal() {
    if (!snap || !content.isConnected) return;
    /* يومٌ اختير ولم تصل قراءته: لا يُرسم بحضور اليوم السابق — تُرسمه قراءته. */
    if (tab === 'attendance' && snap.day !== day) return later();
    snap.ops = localOps(currentUserId());
    paint();
    later();
  }

  async function reload(force = true) {
    try {
      await refresh(force);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  const paint = () => (tab === 'attendance' ? paintAttendance() : paintList());

  const problemBox = () => (snap.problem
    ? h('div', { class: 'bad-box', style: 'margin-bottom:12px' }, icon('alert', 18),
        h('div', {}, h('b', {}, 'لم تُقرأ حال عملياتك من السحابة'), h('div', { class: 'small' }, snap.problem)))
    : null);

  /* ------------------------------- العمال ------------------------------- */

  function paintList() {
    const rows = workerRows(snap.data, snap.ops);
    clear(actions).append(
      h('button', { class: 'btn btn-op', 'data-op': 'workers', type: 'button', onclick: () => workerForm(null) }, icon('plus', 18), 'عامل جديد'));
    const search = h('input', { type: 'search', class: 'grow', placeholder: 'الاسم، الرمز، الهاتف، المهنة…', value: query,
      oninput: debounce((e) => { query = e.target.value; paintRows(); }, 150) });
    const seg = h('div', { class: 'seg p-filter' },
      h('button', { type: 'button', class: showAll ? null : 'on', onclick: () => { showAll = false; paintList(); } }, 'على رأس العمل'),
      h('button', { type: 'button', class: showAll ? 'on' : null, onclick: () => { showAll = true; paintList(); } }, 'الكل (مع الموقوفين)'));
    const listBox = h('div', {});
    const active = rows.filter((w) => w.active === 1 && !w.draft);
    clear(body).append(
      problemBox(),
      h('div', { class: 'kpis p-kpis' },
        kpi({ label: 'العمال الفعّالون', value: num(active.length), iconName: 'hardhat' }),
        snap.data.custodyToo
          ? kpi({ label: 'بذمّتهم أمانات', value: num(active.filter((w) => w.open_custody).length), iconName: 'opCustody', op: 'custody' })
          : null),
      h('div', { class: 'toolbar p-toolbar' }, search, seg,
        h('button', { class: 'btn btn-sm', type: 'button', onclick: () => reload() }, icon('undo', 15), 'تحديث')),
      listBox);

    function paintRows() {
      const q = fold(query);
      const shown = rows.filter((w) => (showAll || w.active === 1)
        && (!q || fold(`${w.name} ${w.code} ${w.phone} ${w.job_title}`).includes(q)));
      clear(listBox).append(shown.length
        ? h('div', { class: 'p-cards' }, ...shown.slice(0, 400).map(card))
        : h('div', { class: 'card' }, emptyState(q ? 'لا عامل بهذا البحث' : 'لا عمال بعد',
            q ? null : 'أضف العمال لتسجيل حضورهم وتسليمهم الأمانات', null, 'hardhat')));
    }
    paintRows();
  }

  function card(w) {
    return h('button', { type: 'button', class: `p-worker${w.active === 1 ? '' : ' off'}${w.draft ? ' draft' : ''}`, onclick: () => openWorker(w) },
      h('div', { class: 'pc-top' }, h('b', {}, said(w.name)),
        w.code ? h('span', { class: 'p-code muted', translate: 'no' }, w.code) : h('span', { class: 'pc-nonum' }, 'بلا رمز بعد'),
        w.active === 1 ? null : badge('موقوف'),
        snap.data.custodyToo && w.open_custody ? badge(`${num(w.open_custody)} قائمة`, 'warn') : null),
      h('div', { class: 'pc-meta' }, ...dots(w.job_title ? said(w.job_title) : null,
        w.phone ? h('span', { class: 'ltr', translate: 'no' }, w.phone) : null)),
      waits(w));
  }

  function waits(w) {
    const chips = [];
    if (w.draft) chips.push(waitChip(w.op, 'عامل جديد'));
    if (w.wait?.edit) chips.push(waitChip(w.wait.ops.at(-1), 'تعديل'));
    return chips.length ? h('div', { class: 'pc-waits' }, ...chips) : null;
  }

  function openWorker(w) {
    const warehouse = snap.warehouses.find((x) => String(x.id) === String(w.warehouse_id));
    const d = drawer({
      head: h('div', { style: 'display:flex;gap:10px;align-items:center' }, kindIcon('worker_add', 20, true),
        h('div', {}, h('h3', {}, said(w.name)), h('div', { class: 'sub ltr', translate: 'no' }, w.code || ''))),
      body: h('div', { class: 'form-grid' },
        h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;align-items:center' },
          w.active === 1 ? badge('على رأس العمل', 'ok dot') : badge('موقوف', 'dot'), waits(w)),
        h('div', { class: 'facts' },
          fact('المهنة', w.job_title ? said(w.job_title) : null),
          fact('الهاتف', w.phone ? h('a', { class: 'ltr', href: `tel:${w.phone}`, translate: 'no' }, w.phone) : null),
          fact('المخزن', warehouse?.name ?? null),
          snap.data.custodyToo ? fact('أمانات قائمة', num(w.open_custody)) : null),
        w.notes ? h('div', { class: 'info-box' }, icon('file', 18), said(w.notes)) : null,
        w.wait?.ops.length
          ? h('div', {}, h('b', {}, 'ينتظر من هذا الجهاز'),
              h('div', { class: 'feed p-wait-feed' }, ...w.wait.ops.map((o) => opItem(o, snap.data, (op) => openOp(op, snap.data, () => { d.close(); reload(); })))))
          : null),
      footer: w.draft ? null : [
        h('button', { class: 'btn btn-op', 'data-op': 'workers', type: 'button', onclick: () => workerForm(w, d) }, icon('edit', 16), 'تعديل'),
        snap.data.custodyToo && w.open_custody
          ? h('button', { class: 'btn', type: 'button', onclick: () => { d.close(); go('#/custody'); } }, icon('opCustody', 16), 'الأمانات')
          : null,
      ],
    });
  }

  /**
   * عاملٌ جديد أو تعديل ملفّه. ورقم الهوية ورمز العامل لا يُكتبان من الموقع:
   * الرمز يُعطيه الحاسوب، والهوية لا تخرج منه. والتعديل يُرسل ما تغيّر وحده.
   */
  function workerForm(w, d = null) {
    const id = newOpId();
    const warehouses = snap.warehouses;
    formModal({
      title: w ? `تعديل: ${w.name}` : 'عامل جديد',
      submitText: isTrusted() ? 'حفظ' : 'إرسال للموافقة',
      op: 'workers',
      fields: [
        field('الاسم الكامل', h('input', { name: 'name', value: w?.name ?? '', required: true })),
        h('div', { class: 'field-row' },
          field('المهنة', h('input', { name: 'job_title', value: w?.job_title ?? '', placeholder: 'نجّار، كهربائي…' })),
          field('الهاتف', h('input', { name: 'phone', type: 'tel', value: w?.phone ?? '', inputmode: 'tel', class: 'ltr', style: 'text-align:right' }))),
        w ? null : field('المخزن', select('warehouse_id', [{ value: '', label: '—' }, ...warehouses.map((x) => ({ value: x.id, label: x.name }))], ''),
          'يُستخدم افتراضياً عند تسجيل الحضور'),
        field('ملاحظات', h('textarea', { name: 'notes' }, w?.notes ?? '')),
        w ? h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'active', checked: w.active === 1 }), 'العامل على رأس العمل') : null,
        h('div', { class: 'hint' }, w ? sendHint() : [sendHint(), ' ', h('span', {}, 'ورمز العامل يُعطيه الحاسوب الرئيسي.')]),
      ].filter(Boolean),
      onSubmit: async (form, close) => {
        if (!String(form.name ?? '').trim()) throw new Error(tx('اسم العامل مطلوب'));
        if (!w) {
          await sendOp({ id, kind: 'worker_add', payload: workerPayload({
            name: form.name, job: form.job_title, phone: form.phone, notes: form.notes, warehouse: form.warehouse_id,
          }) });
        } else {
          const changes = workerChanges(w, { ...form, active: Boolean(form.active) });
          if (!Object.keys(changes).length) {
            close();
            toast('لم يتغيّر شيء', 'info');
            return;
          }
          await sendOp({ id, kind: 'worker_edit', payload: workerEditPayload(w, changes) });
        }
        close();
        d?.close();
        reload();
      },
    });
  }

  /* ------------------------------- الحضور ------------------------------- */

  function paintAttendance() {
    const { rows, summary } = attendanceDay(snap.data.workers, snap.attendance, snap.ops, day);
    const isToday = day === today();
    const dateInput = h('input', {
      type: 'date', value: day, max: today(), min: daysAgo(ATTENDANCE_DAYS),
      onchange: (e) => {
        const v = e.target.value;
        if (!v || v > today() || v < daysAgo(ATTENDANCE_DAYS)) {
          e.target.value = day;
          toast('الحضور على الموقع لآخر 62 يوماً — وما قبلها على الحاسوب الرئيسي', 'info');
          return;
        }
        day = v;
        clear(body).append(loadingState(6));
        reload(false);
      },
    });
    clear(actions).append(dateInput,
      summary.unset
        ? h('button', { class: 'btn btn-primary', type: 'button', onclick: (e) => markRest(e.currentTarget, summary.unset) },
            icon('checkCircle', 17), 'الباقون حاضرون', ' ', h('span', { class: 'p-count' }, `(${num(summary.unset)})`))
        : null);

    const waitingAll = snap.ops.filter((o) => ['pending', 'received'].includes(o.status) && !o.gone && o.kind.startsWith('attendance_')
      && (o.payload?.date === day || momentOf(o.payload?.at)?.date === day)).length;

    clear(body).append(
      problemBox(),
      h('div', { class: 'p-day' }, icon('calendar', 16), h('b', {}, fmtDate(day)), isToday ? badge('اليوم', 'info') : null,
        h('span', { class: 'hint' }, 'الحضور على الموقع لآخر 62 يوماً — وما قبلها على الحاسوب الرئيسي')),
      h('div', { class: 'kpis p-kpis' },
        kpi({ label: 'حاضرون', value: `${num(summary.present)} / ${num(summary.total)}`, iconName: 'checkCircle', color: 'var(--ok)' }),
        kpi({ label: 'غائبون', value: num(summary.absent), iconName: 'xCircle', tone: summary.absent ? 'bad' : null }),
        kpi({ label: 'إجازة', value: num(summary.leave), iconName: 'calendar' }),
        kpi({ label: 'داخل الموقع الآن', value: num(summary.inside), iconName: 'hardhat', hint: isToday ? 'دخلوا ولم يخرجوا' : fmtDate(day) })),
      waitingAll
        ? h('div', { class: 'info-box', style: 'margin-bottom:12px' }, icon('clock', 18),
            h('div', { class: 'small' }, h('b', {}, `${num(waitingAll)} عملية تنتظر`), ' — ',
              h('span', {}, isTrusted() ? 'تُسجَّل حين يتّصل الحاسوب الرئيسي، وقرارها في الرئيسية.' : 'تُسجَّل بعد موافقة المدير، وقرارها في الرئيسية.')))
        : null,
      rows.length
        ? h('div', { class: 'p-cards p-att' }, ...rows.map((r) => attRow(r, isToday)))
        : h('div', { class: 'card' }, emptyState('لا عمال فعّالون', 'أضف العمال من تبويب «العمال»',
            h('button', { class: 'btn', type: 'button', onclick: () => go('#/workers') }, 'العمال'), 'hardhat')));
  }

  /** سطر العامل في يومه: حاله بثلاثة أزرار، ودخوله وخروجه — وزرّاهما لليوم وحده. */
  function attRow(r, isToday) {
    const pending = r.wait.at(-1) ?? null;
    const row = h('div', { class: `p-att-row${r.status ? ` is-${r.status}` : ''}${pending ? ' waiting' : ''}` },
      h('div', { class: 'pa-who' }, h('b', {}, said(r.name)), h('span', { class: 'muted small' }, r.job_title ? said(r.job_title) : said(r.code))),
      h('div', { class: 'seg pa-seg' }, ...Object.entries(ATT).map(([k, m]) => h('button', {
        type: 'button', class: r.status === k ? `on ${k}` : null, 'aria-pressed': String(r.status === k),
        onclick: (e) => setStatus(e.currentTarget, r, k),
      }, m.label))),
      h('div', { class: 'pa-times' },
        h('span', {}, h('span', {}, 'دخول'), ' ', h('b', { class: 'ltr' }, r.check_in ?? '—')),
        h('span', {}, h('span', {}, 'خروج'), ' ', h('b', { class: 'ltr' }, r.check_out ?? '—')),
        isToday && r.status !== 'absent' && r.status !== 'leave'
          ? (!r.check_in
              ? h('button', { class: 'btn btn-sm', type: 'button', onclick: (e) => punch(e.currentTarget, r, 'in') }, icon('opIn', 14), 'دخول')
              : !r.check_out
                ? h('button', { class: 'btn btn-sm', type: 'button', onclick: (e) => punch(e.currentTarget, r, 'out') }, icon('opOut', 14), 'خروج')
                : null)
          : null),
      pending ? h('div', { class: 'pc-waits' }, waitChip(pending)) : null);
    return row;
  }

  /** ضغطةٌ تُرسل عمليتها، والزرّ معطّلٌ حتى تصل — فلا تُرسل مرّتين. يُرجع هل وصلت. */
  async function send(btn, op) {
    if (btn?.disabled) return false;
    if (btn) btn.disabled = true;
    try {
      await sendOp(op, { quiet: true });
      repaintLocal();
      return true;
    } catch (err) {
      if (btn) btn.disabled = false;
      toast(err.message, 'error');
      return false;
    }
  }

  const setStatus = (btn, r, status) => {
    if (r.status === status) return;
    send(btn, { id: newOpId(), kind: 'attendance_set', payload: attendancePayload(r, day, status) });
  };

  const punch = (btn, r, direction) => send(btn, { id: newOpId(), kind: 'attendance_punch', payload: punchPayload(r, direction) });

  const markRest = async (btn, count) => {
    if (await send(btn, { id: newOpId(), kind: 'attendance_all', payload: restPayload(day) })) {
      toast(`${tx('الباقون حاضرون')}: ${num(count)}`, 'success');
    }
  };

  await refresh();
  if (!content.isConnected) return null;
  const timer = setInterval(() => { refresh().catch(() => {}); }, 30 * 1000);
  return { refresh: () => reload(true), cleanup: () => { clearInterval(timer); } };
}
