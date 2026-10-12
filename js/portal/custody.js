/* ============================== الأمانات على الموقع ==============================
   بطلب صاحب المشروع: «أسجّل الأمانات وأدوّنها وأطّلع عليها بالتلفون» — كما
   يفعل على الحاسوب. لمن أعطاه المدير «الأمانات» وحده (can_custody):

     السجلّ     الأمانات كلّها كما رفعها الحاسوب — القائمة والمتأخّرة والمُعادة —
                بالبحث برقمها أو صنفها أو مستلمها، ودرجٌ لكلٍّ بسيرتها: التسليم
                وكل إعادة وكل تعديل (من عدّل ومتى، وما كان وما صار، ومن أين).
     الأفعال    تسليم أمانة (لعاملٍ مسجّل أو باسم المستلم، بصنفٍ مسجّل أو جديد)،
                وإعادتها كلّها أو بعضها، وتمديد موعدها، وتعديلها، وحذفها ما لم
                يُعَد منها شيء — وطباعة التعهّد (pledge.js، نموذج الشركة نفسه).
     الأصناف    ما يملكه المشروع من كل صنف وما بذمم الناس منه الآن.

   وكل فعلٍ عمليةٌ تُرسل إلى الحاسوب (people.js): «المعتمد» تُسجَّل عمليته حين
   يتّصل، و«الطالب» تنتظر موافقة المدير. وما أُرسل ولم يُقرَّر يُعرض فوق السجلّ
   بعلامته (overlay.js): تسليمٌ بلا رقم بعد، وإعادةٌ تنتظر على أمانتها… فلا
   يُعاد ما فُعل. وقرارها في الرئيسية — سُجّلت برقمها، أو رُدّت بسببها.

   والهاتف أوّلاً: بطاقاتٌ تحت الإبهام لا جدولٌ عريض، والأزرار 44 بكسلاً.
   ========================================================================== */

import {
  h, clear, icon, num, fmtDate, fmtDateTime, badge, emptyState, loadingState, drawer, field, select, formModal,
  confirmDialog, toast, today, debounce, fold, kpi,
} from '../ui.js';
import { tx } from '../i18n.js';
import { opIcon } from '../ops.js';
import { pledgeHtml } from '../pledge.js';
import { openPrint, printLanguage } from '../print.js';
import { canCustody, isTrusted, go } from './main.js';
import { custodyRows, custodyItems, filterCustody } from './overlay.js';
import {
  issuePayload, returnPayload, extendPayload, custodyBefore, changedFields, editPayload, deletePayload, itemPayload,
} from './payloads.js';
import {
  loadPeople, loadStory, syncOps, sendOp, sentToast, newOpId, waitChip, said, dots, amount, fact, HOLDER_TITLES,
  sendHint, openOp, opItem,
} from './people.js';

const STATUS = {
  open: { label: 'قائمة', tone: 'warn' },
  partial: { label: 'مُعادة جزئياً', tone: 'info' },
  returned: { label: 'مُعادة', tone: 'ok' },
};

/* التصفية كما على الحاسوب: ما لم يُعَد كاملاً، والمتأخّر منه، والمُعاد، والكل. */
const FILTERS = [['open', 'قائمة'], ['late', 'متأخّرة'], ['returned', 'مُعادة'], ['all', 'الكل']];

/* أسماء الخانات في «سيرة الأمانة» — والخادم يكتب القيم كما تُقرأ (custody_edits). */
const FIELDS = {
  custody_item_id: 'الصنف', qty: 'الكمية', worker_id: 'العامل', holder: 'المستلم', holder_phone: 'الهاتف',
  holder_title: 'الصفة', issue_date: 'تاريخ التسليم', due_date: 'موعد الإعادة', notes: 'ملاحظات',
};

/* من أين جاء التعديل: الحاسوب، أو الموقع من هاتف موظفٍ له «الأمانات». */
const SOURCES = { pc: 'على الحاسوب', web: 'عبر الموقع' };

/* التصفية والبحث يبقيان بين التنقّلات: من يتابع المتأخّرة يعود إليها. */
let filter = 'open';
let query = '';

/** صفة المستلم كما تُطبع في التعهّد: «عامل — نجّار». */
function titleOf(r) {
  const label = HOLDER_TITLES[r.holder_title];
  if (!label) return '';
  return r.job_title ? `${label} — ${r.job_title}` : label;
}

/* أصل الموقع: منه تُحمَّل ورقة الشركة في التعهّد المطبوع (img/pledge-letterhead.png). */
const siteBase = () => new URL('.', location.href).href.replace(/\/$/, '');

export async function custody({ content, route }) {
  if (!canCustody()) {
    content.append(h('div', { class: 'card' }, emptyState('لا تملك صلاحية الأمانات', 'اطلبها من المدير.', null, 'lock')));
    return null;
  }
  const tab = route.param === 'items' ? 'items' : 'list';

  const head = h('div', { class: 'page-head p-people-head', 'data-op': 'custody' },
    h('div', { style: 'display:flex;gap:12px;align-items:center' }, opIcon('custody', 22, true),
      h('div', {}, h('h2', {}, 'الأمانات'), h('p', {}, 'عُدّة تُسلَّم وتُعاد بعينها — ولكل تسليم تعهّده.'))),
    h('div', { class: 'page-actions' },
      h('button', { class: 'btn btn-op', 'data-op': 'custody', type: 'button', onclick: () => issueForm() }, icon('plus', 18), 'تسليم أمانة')));
  const tabs = h('div', { class: 'seg p-tabs' },
    h('button', { type: 'button', class: tab === 'list' ? 'on' : null, onclick: () => go('#/custody') }, icon('list', 15), 'السجلّ'),
    h('button', { type: 'button', class: tab === 'items' ? 'on' : null, onclick: () => go('#/custody/items') }, icon('box', 15), 'الأصناف'));
  const body = h('div', {}, loadingState(5));
  content.append(head, tabs, body);

  /* ما رفعه الحاسوب، وعمليات الجهاز، وما يُعرض منهما معاً. */
  let snap = null;

  async function refresh(force = false) {
    const [data, sync] = await Promise.all([loadPeople(force), syncOps()]);
    if (!content.isConnected) return;
    snap = {
      data,
      ops: sync.ops,
      problem: sync.problem,
      rows: custodyRows(data, sync.ops, today()),
      items: custodyItems(data, sync.ops),
    };
    if (tab === 'items') paintItems();
    else paintList();
  }

  /* «تحديث» والعودة إلى الصفحة وبعد كل عملية: إن تعذّر يبقى ما عُرض، ويُقال السبب. */
  async function reload(force = true) {
    try {
      await refresh(force);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  const problemBox = () => (snap.problem
    ? h('div', { class: 'bad-box', style: 'margin-bottom:12px' }, icon('alert', 18),
        h('div', {}, h('b', {}, 'لم تُقرأ حال عملياتك من السحابة'), h('div', { class: 'small' }, snap.problem)))
    : null);

  /* ------------------------------ السجلّ ------------------------------ */

  function paintList() {
    const rows = snap.rows;
    const open = rows.filter((r) => !r.draft && r.status !== 'returned');
    const late = open.filter((r) => r.overdue).length;
    const waitingOps = snap.ops.filter((o) => ['pending', 'received'].includes(o.status) && !o.gone && o.kind.startsWith('custody_'));

    const search = h('input', { type: 'search', class: 'grow', placeholder: 'رقم الأمانة أو الصنف أو المستلم…', value: query,
      oninput: debounce((e) => { query = e.target.value; paintRows(); }, 150) });
    const seg = h('div', { class: 'seg p-filter' }, ...FILTERS.map(([key, label]) => h('button', {
      type: 'button', class: filter === key ? 'on' : null, 'data-key': key,
      onclick: () => {
        filter = key;
        for (const b of seg.children) b.classList.toggle('on', b.dataset.key === key);
        paintRows();
      },
    }, label)));
    const listBox = h('div', {});

    clear(body).append(
      problemBox(),
      h('div', { class: 'kpis p-kpis' },
        kpi({ label: 'أمانات قائمة', value: num(open.length), iconName: 'opCustody', op: 'custody', hint: 'بذمم المستلمين الآن' }),
        kpi({ label: 'الكمية بذمّتهم', value: num(open.reduce((t, r) => t + r.outstanding, 0)), iconName: 'layers', hint: 'مجموع ما لم يُعَد' }),
        kpi({ label: 'متأخّرة', value: num(late), iconName: 'clock', tone: late ? 'bad' : null, hint: 'تجاوزت موعد إعادتها' })),
      waitingOps.length
        ? h('div', { class: 'info-box', style: 'margin-bottom:12px' }, icon('clock', 18),
            h('div', { class: 'small' }, h('b', {}, `${num(waitingOps.length)} عملية تنتظر`), ' — ',
              h('span', {}, isTrusted() ? 'تُسجَّل حين يتّصل الحاسوب الرئيسي، وقرارها في الرئيسية.' : 'تُسجَّل بعد موافقة المدير، وقرارها في الرئيسية.')))
        : null,
      h('div', { class: 'toolbar p-toolbar' }, search, seg,
        h('button', { class: 'btn btn-sm', type: 'button', onclick: () => reload() }, icon('undo', 15), 'تحديث')),
      listBox);

    function paintRows() {
      const shown = filterCustody(rows, filter, query, fold);
      clear(listBox).append(shown.length
        ? h('div', { class: 'p-cards' }, ...shown.slice(0, 300).map(card))
        : h('div', { class: 'card' }, emptyState(query ? 'لا أمانة بهذا البحث' : 'لا أمانات بهذه التصفية',
            rows.length ? null : 'سجّل أول تسليم حين تُعار عُدّة لعامل أو موظف',
            rows.length ? null : h('button', { class: 'btn btn-op', 'data-op': 'custody', onclick: () => issueForm() }, icon('plus', 17), 'تسليم أمانة'),
            'opCustody')));
      if (shown.length > 300) listBox.append(h('div', { class: 'hint', style: 'text-align:center;margin-top:8px' }, 'ابحث لترى ما بعدها'));
    }
    paintRows();
  }

  /** بطاقة الأمانة في السجلّ: رقمها وحالها، وما بقي منها، ومستلمها، وتاريخاها، وما ينتظر عليها. */
  function card(r) {
    const st = STATUS[r.status] ?? STATUS.open;
    return h('button', { type: 'button', class: `p-cust${r.overdue ? ' late' : ''}${r.draft ? ' draft' : ''}`, onclick: () => openRecord(r) },
      h('div', { class: 'pc-top' },
        r.number ? h('b', { class: 'p-code', translate: 'no' }, r.number) : h('span', { class: 'pc-nonum' }, 'بلا رقم بعد'),
        r.draft ? null : badge(st.label, st.tone),
        r.overdue ? badge('متأخّرة', 'bad dot') : null),
      h('div', { class: 'pc-item' }, h('b', {}, said(r.item_name || '—')),
        h('span', { class: 'pc-qty' }, ...amount(r.outstanding, r.unit),
          r.returned_qty > 0 ? [' ', h('span', { class: 'muted' }, 'من'), ' ', num(r.qty)] : null)),
      h('div', { class: 'pc-meta' }, ...dots(r.holder_name ? said(r.holder_name) : null, titleOf(r) || null,
        r.phone ? h('span', { class: 'ltr', translate: 'no' }, r.phone) : null)),
      h('div', { class: 'pc-meta' }, ...dots([h('span', {}, 'التسليم'), ' ', fmtDate(r.issue_date)],
        r.due_date ? [h('span', {}, 'الإعادة'), ' ', fmtDate(r.due_date)] : null)),
      waits(r));
  }

  /** ما ينتظر على الأمانة من هذا الجهاز — كلٌّ بعلامته. */
  function waits(r) {
    const chips = [];
    if (r.draft) {
      chips.push(r.op.status === 'applied'
        ? h('span', { class: 'p-wait done' }, icon('checkCircle', 12), h('span', {}, 'سُجّلت — تظهر بعد التحديث'))
        : waitChip(r.op, 'تسليم'));
    }
    const of = (kind) => r.wait?.ops.filter((o) => o.kind === kind).at(-1) ?? null;
    if (r.wait?.returnAll) chips.push(waitChip(of('custody_return'), 'إعادة كاملة'));
    else if (r.wait?.returnQty > 0) chips.push(waitChip(of('custody_return'), ['إعادة', ' ', num(r.wait.returnQty)]));
    if (r.wait && r.wait.due !== undefined) {
      chips.push(waitChip(of('custody_extend'), ['موعد جديد', ' ', r.wait.due ? fmtDate(r.wait.due) : h('span', {}, 'بلا موعد')]));
    }
    if (r.wait?.edit) chips.push(waitChip(of('custody_edit'), 'تعديل'));
    if (r.wait?.remove) chips.push(waitChip(of('custody_delete'), 'حذف'));
    return chips.length ? h('div', { class: 'pc-waits' }, ...chips) : null;
  }

  /* ------------------------------ درج الأمانة ------------------------------ */

  function openRecord(r) {
    const st = STATUS[r.status] ?? STATUS.open;
    const storyBox = h('div', {}, r.draft ? null : loadingState(2));
    /* تسليمٌ طُبّق ولم يُرفع سطره لا ينتظر شيئاً: قراره في الرئيسية. */
    const waitOps = r.draft ? (r.op.status === 'applied' ? [] : [r.op]) : r.wait.ops;
    const busy = r.wait?.remove;
    const d = drawer({
      wide: true,
      head: h('div', { style: 'display:flex;gap:10px;align-items:center' }, opIcon('custody', 20, true),
        h('div', {}, h('h3', {}, r.number ? h('span', { class: 'ltr', translate: 'no' }, r.number) : h('span', {}, 'تسليمٌ ينتظر')),
          h('div', { class: 'sub' }, said(r.item_name || '')))),
      body: h('div', { class: 'form-grid' },
        h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;align-items:center' },
          r.draft ? null : badge(st.label, `${st.tone} dot`),
          r.overdue ? badge('متأخّرة', 'bad dot') : null,
          waits(r)),
        h('div', { class: 'facts' },
          fact('المستلم', r.holder_name ? said(r.holder_name) : null),
          fact('الصفة', titleOf(r) || null),
          fact('الهاتف', r.phone ? h('span', { class: 'ltr', translate: 'no' }, r.phone) : null),
          fact('الكمية', [num(r.qty), r.unit ? [' ', h('small', {}, r.unit)] : null]),
          r.draft ? null : fact('المُعاد', num(r.returned_qty)),
          r.draft ? null : fact('المتبقّي', num(r.outstanding)),
          fact('تاريخ التسليم', fmtDate(r.issue_date)),
          fact('موعد الإعادة', r.due_date ? fmtDate(r.due_date) : '—'),
          fact('سجّلها', r.created_by_name ? said(r.created_by_name) : null)),
        r.item_details ? h('div', { class: 'info-box' }, icon('box', 18), said(r.item_details)) : null,
        r.notes ? h('div', { class: 'info-box' }, icon('file', 18), said(r.notes)) : null,
        /* ما أُرسل عليها من هذا الجهاز ولم يُقرَّر: يُفتح فيُسحب ما لم يصل الحاسوب. */
        waitOps.length
          ? h('div', {}, h('b', {}, 'ينتظر من هذا الجهاز'),
              h('div', { class: 'feed p-wait-feed' }, ...waitOps.map((o) => opItem(o, snap.data, (op) => openOp(op, snap.data, () => { d.close(); reload(); })))))
          : null,
        r.draft ? null : h('div', {}, h('b', {}, 'سيرة الأمانة'), storyBox)),
      footer: [
        h('button', { class: 'btn', type: 'button', onclick: () => printPledge(r) }, icon('print', 16), 'طباعة التعهّد'),
        !r.draft && !busy ? h('button', { class: 'btn btn-op', 'data-op': 'custody', type: 'button', onclick: () => editForm(r, d) }, icon('edit', 16), 'تعديل') : null,
        !r.draft && !busy && r.status !== 'returned'
          ? h('button', { class: 'btn', type: 'button', onclick: () => returnForm(r, d) }, icon('opReturn', 16), 'إعادة') : null,
        !r.draft && !busy && r.status !== 'returned'
          ? h('button', { class: 'btn', type: 'button', onclick: () => extendForm(r, d) }, icon('calendar', 16), 'تمديد') : null,
        h('div', { class: 'spacer' }),
        !r.draft && !busy && !(r.returned_qty > 0)
          ? h('button', { class: 'btn btn-danger', type: 'button', onclick: () => remove(r, d) }, icon('trash', 16), 'حذف') : null,
      ],
    });
    if (!r.draft) {
      loadStory(r.id)
        .then(({ returns, edits }) => { if (storyBox.isConnected) clear(storyBox).append(story(r, returns, edits)); })
        .catch((err) => { if (storyBox.isConnected) clear(storyBox).append(h('div', { class: 'bad-box' }, icon('alert', 18), err.message)); });
    }
    return d;
  }

  /* ------------------------------ التسليم ------------------------------ */

  function issueForm() {
    const { data } = snap;
    const NEW = '__new__';
    const items = data.items.filter((i) => Number(i.active) === 1);
    const workers = data.workers.filter((w) => Number(w.active ?? 1) === 1);
    /* أسطر التسليم الواحد عملياتٌ تحمل مرجعاً واحداً — به يُعرف ما سُلّم معاً. */
    const ref = newOpId();
    const lines = [];
    const linesBox = h('div', { class: 'p-lines' });

    const addLine = () => {
      const sel = select('', [{ value: '', label: '— اختر الأمانة —' },
        ...items.map((i) => ({ value: i.id, label: i.unit ? `${i.name} (${i.unit})` : i.name })),
        { value: NEW, label: '＋ أمانة جديدة — تُسجَّل الآن' }], items.length ? '' : NEW);
      const qty = h('input', { type: 'number', min: '0', step: 'any', inputmode: 'decimal', value: '1' });
      const newName = h('input', { placeholder: 'اسم الأمانة — مثال: مثقاب كهربائي' });
      const newUnit = h('input', { placeholder: 'الوحدة — حبة' });
      const newDetails = h('input', { placeholder: 'الرقم التسلسلي، الحالة…' });
      const fresh = h('div', { class: 'field-row p-new-item' }, newName, newUnit, newDetails);
      const sync = () => { fresh.hidden = sel.value !== NEW; };
      sel.addEventListener('change', sync);
      const line = { sel, qty, newName, newUnit, newDetails, id: null, sent: false };
      const row = h('div', { class: 'p-line' },
        h('div', { class: 'p-line-main' }, field('الأمانة', sel), field('الكمية', qty),
          h('button', {
            class: 'icon-btn danger', type: 'button', title: 'حذف البند',
            onclick: () => { row.remove(); lines.splice(lines.indexOf(line), 1); if (!lines.length) addLine(); },
          }, icon('trash', 16))),
        fresh);
      lines.push(line);
      linesBox.append(row);
      sync();
    };
    addLine();

    const workerSel = select('worker_id', [{ value: '', label: '— مستلم من خارج قائمة العمال —' },
      ...workers.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}${w.job_title ? ` (${w.job_title})` : ''}` }))], '');
    const holder = h('input', { name: 'holder', placeholder: 'اسم المستلم إن لم يكن عاملاً مسجّلاً' });
    const phone = h('input', { name: 'holder_phone', type: 'tel', inputmode: 'tel', placeholder: '07xx xxx xxxx', class: 'ltr', style: 'text-align:right' });
    const titleSel = select('holder_title', Object.entries(HOLDER_TITLES).map(([value, label]) => ({ value, label })), 'staff');
    let touched = false;
    titleSel.addEventListener('change', () => { touched = true; });
    workerSel.addEventListener('change', () => {
      holder.disabled = Boolean(workerSel.value);
      if (workerSel.value) holder.value = '';
      if (!touched) titleSel.value = workerSel.value ? 'worker' : 'staff';
    });

    formModal({
      title: 'تسليم أمانة',
      width: 'wide',
      submitText: isTrusted() ? 'تسجيل التسليم' : 'إرسال للموافقة',
      op: 'custody',
      fields: [
        h('div', { class: 'info-box' }, icon(isTrusted() ? 'checkCircle' : 'send', 18), h('div', { class: 'small' }, sendHint())),
        h('div', { class: 'field-row' },
          field('تاريخ التسليم', h('input', { type: 'date', name: 'issue_date', value: today(), max: today(), required: true })),
          field('موعد الإعادة', h('input', { type: 'date', name: 'due_date' }), 'يُنبَّه عند تجاوزه')),
        field('العامل المستلم', workerSel),
        h('div', { class: 'field-row' }, field('أو اسم المستلم', holder), field('صفة المستلم', titleSel, 'تُطبع في التعهّد')),
        field('رقم الهاتف', phone, 'يظهر في تذكير الأمانات'),
        h('div', { class: 'field' }, h('span', {}, 'الأمانات المُسلَّمة'), linesBox,
          h('button', { class: 'btn btn-sm', type: 'button', style: 'justify-self:start', onclick: addLine }, icon('plus', 14), 'أمانة أخرى للمستلم نفسه'),
          h('div', { class: 'hint' }, 'كل أمانة تُسجَّل برقمها لتُعاد وحدها، ويُطبع لها جميعاً تعهّد واحد.')),
        field('ملاحظات', h('textarea', { name: 'notes' })),
      ],
      onSubmit: async (form, close) => {
        const workerId = Number(workerSel.value) || null;
        const name = holder.value.trim();
        if (!workerId && !name) throw new Error(tx('اختر العامل أو اكتب اسم المستلم'));
        if (form.due_date && form.due_date < form.issue_date) throw new Error(tx('موعد الإعادة قبل تاريخ التسليم'));
        const entries = [];
        const seen = new Set();
        lines.forEach((l, i) => {
          const at = `${tx('البند')} ${i + 1}`;
          const qty = Number(l.qty.value);
          if (!l.sel.value) throw new Error(`${at}: ${tx('اختر الأمانة')}`);
          if (!(qty > 0)) throw new Error(`${at}: ${tx('الكمية يجب أن تكون أكبر من صفر')}`);
          if (l.sel.value === NEW) {
            if (!l.newName.value.trim()) throw new Error(`${at}: ${tx('اكتب اسم الأمانة الجديدة')}`);
            entries.push({ line: l, item: { name: l.newName.value, unit: l.newUnit.value, details: l.newDetails.value }, qty });
          } else {
            if (seen.has(l.sel.value)) throw new Error(`${at}: ${tx('مكرّرة — اجمع كميتها في بند واحد')}`);
            seen.add(l.sel.value);
            entries.push({ line: l, item: { id: Number(l.sel.value) }, qty });
          }
        });
        let sent = 0;
        for (const e of entries) {
          if (e.line.sent) continue;
          /* المعرّف يبقى للسطر: إعادة الإرسال بعد انقطاع لا تكرّره. */
          e.line.id ??= newOpId();
          try {
            await sendOp({
              id: e.line.id,
              kind: 'custody_issue',
              payload: issuePayload({
                item: e.item, qty: e.qty, workerId, holder: name, phone: form.holder_phone, title: titleSel.value,
                issueDate: form.issue_date || today(), dueDate: form.due_date, notes: form.notes, ref,
              }),
            }, { quiet: true });
          } catch (err) {
            if (sent) reload();
            throw new Error(sent ? `${tx('أُرسل')} ${sent} ${tx('ثم تعثّر الباقي:')} ${err.message}` : err.message);
          }
          e.line.sent = true;
          sent++;
        }
        close();
        sentToast();
        reload();
      },
    });
  }

  /* ------------------------------ الإعادة والتمديد ------------------------------ */

  function returnForm(r, d) {
    /* ما ينتظر من إعادةٍ على الأمانة لا يُعاد ثانيةً. */
    const left = Math.max(0, r.outstanding - (r.wait?.returnQty ?? 0));
    if (r.wait?.returnAll || left <= 1e-9) return toast('على هذه الأمانة إعادةٌ تنتظر الحاسوب الرئيسي', 'info');
    const id = newOpId();
    formModal({
      title: `إعادة الأمانة ${r.number}`,
      submitText: isTrusted() ? 'تسجيل الإعادة' : 'إرسال للموافقة',
      fields: [
        h('div', { class: 'info-box' }, icon('opCustody', 18),
          h('span', {}, ...dots(said(r.item_name), r.holder_name ? said(r.holder_name) : null,
            [h('span', {}, 'المتبقّي'), ' ', ...amount(left, r.unit)]))),
        h('div', { class: 'field-row' },
          field('الكمية المُعادة', h('input', { name: 'qty', type: 'number', min: '0', step: 'any', inputmode: 'decimal', value: String(left) }), 'اتركها لإعادة الكل'),
          field('تاريخ الإعادة', h('input', { name: 'date', type: 'date', value: today(), min: r.issue_date, max: today() }))),
        h('div', { class: 'hint' }, sendHint()),
      ],
      onSubmit: async (form, close) => {
        const qty = Number(form.qty);
        if (!(qty > 0)) throw new Error(tx('الكمية يجب أن تكون أكبر من صفر'));
        if (qty > left + 1e-9) throw new Error(`${tx('المتبقّي')} ${num(left)}`);
        if (form.date && form.date < r.issue_date) throw new Error(tx('تاريخ الإعادة قبل تاريخ التسليم'));
        await sendOp({ id, kind: 'custody_return', payload: returnPayload(r, qty, form.date || today()) });
        close();
        d?.close();
        reload();
      },
    });
  }

  function extendForm(r, d) {
    const id = newOpId();
    formModal({
      title: `موعد إعادة ${r.number}`,
      submitText: isTrusted() ? 'حفظ' : 'إرسال للموافقة',
      fields: [
        field('الموعد الجديد', h('input', { name: 'due_date', type: 'date', value: r.due_date ?? '', min: r.issue_date }), 'اتركه فارغاً لإلغاء الموعد'),
        h('div', { class: 'hint' }, sendHint()),
      ],
      onSubmit: async (form, close) => {
        const due = form.due_date || null;
        if (due && due < r.issue_date) throw new Error(tx('الموعد قبل تاريخ التسليم'));
        if ((due ?? '') === (r.due_date ?? '')) {
          close();
          toast('لم يتغيّر شيء', 'info');
          return;
        }
        await sendOp({ id, kind: 'custody_extend', payload: extendPayload(r, due) });
        close();
        d?.close();
        reload();
      },
    });
  }

  /* ------------------------------ التعديل ------------------------------
     كل ما في الأمانة يُعدَّل — والمُعادة أيضاً — إلا أن الكمية لا تقلّ عمّا
     أُعيد منها. ولا يُرسل إلا ما تغيّر: به يكتب الحاسوب سطر السيرة (القديم ←
     الجديد) ومصدره «عبر الموقع»، ويعيد حساب حالتها. */

  function editForm(c, d) {
    const { data } = snap;
    const id = newOpId();
    const itemSel = select('custody_item_id', data.items.filter((i) => Number(i.active) === 1 || i.id === c.custody_item_id)
      .map((i) => ({ value: i.id, label: i.unit ? `${i.name} (${i.unit})` : i.name })), c.custody_item_id);
    /* العامل الموقوف يبقى في القائمة إن كان هو المستلم — وإلا ضاع عند الحفظ. */
    const workerSel = select('worker_id', [{ value: '', label: '— مستلم من خارج قائمة العمال —' },
      ...data.workers.filter((w) => Number(w.active ?? 1) === 1 || w.id === c.worker_id)
        .map((w) => ({ value: w.id, label: `${w.code} — ${w.name}${w.job_title ? ` (${w.job_title})` : ''}` }))], c.worker_id ?? '');
    const holder = h('input', { name: 'holder', value: c.worker_id ? '' : (c.holder ?? ''), disabled: Boolean(c.worker_id),
      placeholder: 'اسم المستلم إن لم يكن عاملاً مسجّلاً' });
    const titleSel = select('holder_title', Object.entries(HOLDER_TITLES).map(([value, label]) => ({ value, label })),
      c.holder_title || (c.worker_id ? 'worker' : 'staff'));
    let touched = false;
    titleSel.addEventListener('change', () => { touched = true; });
    workerSel.addEventListener('change', () => {
      holder.disabled = Boolean(workerSel.value);
      if (workerSel.value) holder.value = '';
      if (!touched) titleSel.value = workerSel.value ? 'worker' : 'staff';
    });
    const returned = Number(c.returned_qty) || 0;

    formModal({
      title: `تعديل الأمانة ${c.number}`,
      width: 'wide',
      submitText: isTrusted() ? 'حفظ التعديل' : 'إرسال للموافقة',
      op: 'custody',
      fields: [
        h('div', { class: 'info-box' }, icon('history', 18),
          h('div', { class: 'small' }, 'كل تغيير هنا يُكتب في «سيرة الأمانة»: من عدّل ومتى، وما كان وما صار.', ' ', sendHint())),
        h('div', { class: 'field-row' },
          field('الأمانة', itemSel),
          field('الكمية', h('input', { name: 'qty', type: 'number', min: String(returned || 0), step: 'any', inputmode: 'decimal', value: c.qty, required: true }),
            returned ? [h('span', {}, 'أُعيد منها'), ' ', num(returned), ' — ', h('span', {}, 'لا تقلّ الكمية عنه')] : null)),
        field('العامل المستلم', workerSel),
        h('div', { class: 'field-row' }, field('أو اسم المستلم', holder), field('صفة المستلم', titleSel, 'تُطبع في التعهّد')),
        field('رقم الهاتف', h('input', { name: 'holder_phone', type: 'tel', value: c.holder_phone ?? '', inputmode: 'tel', placeholder: '07xx xxx xxxx', class: 'ltr', style: 'text-align:right' }),
          'فارغاً يُؤخذ هاتف العامل من ملفّه'),
        h('div', { class: 'field-row' },
          field('تاريخ التسليم', h('input', { type: 'date', name: 'issue_date', value: c.issue_date, required: true })),
          field('موعد الإعادة', h('input', { type: 'date', name: 'due_date', value: c.due_date ?? '' }), 'اتركه فارغاً لإلغاء الموعد')),
        field('ملاحظات', h('textarea', { name: 'notes' }, c.notes ?? '')),
      ],
      onSubmit: async (form, close) => {
        const qty = Number(form.qty);
        const workerId = workerSel.value ? Number(workerSel.value) : null;
        const next = {
          custody_item_id: Number(itemSel.value), qty,
          worker_id: workerId, holder: workerId ? '' : holder.value.trim(),
          holder_phone: String(form.holder_phone ?? '').trim(), holder_title: titleSel.value,
          issue_date: form.issue_date, due_date: form.due_date || null, notes: String(form.notes ?? '').trim(),
        };
        if (!(qty > 0)) throw new Error(tx('الكمية يجب أن تكون أكبر من صفر'));
        if (qty < returned - 1e-9) throw new Error(tx('الكمية أقل ممّا أُعيد'));
        if (!workerId && !next.holder) throw new Error(tx('اختر العامل أو اكتب اسم المستلم'));
        if (next.due_date && next.due_date < next.issue_date) throw new Error(tx('موعد الإعادة قبل تاريخ التسليم'));
        const changes = changedFields(custodyBefore(c), next);
        if (!Object.keys(changes).length) {
          close();
          toast('لم يتغيّر شيء', 'info');
          return;
        }
        await sendOp({ id, kind: 'custody_edit', payload: editPayload(c, changes) });
        close();
        d?.close();
        reload();
      },
    });
  }

  async function remove(r, d) {
    const ok = await confirmDialog({
      title: 'حذف الأمانة',
      message: `سيُحذف السجل ${r.number} نهائياً.\n${sendHint()}`,
      confirmText: 'حذف', danger: true,
    });
    if (!ok) return;
    try {
      await sendOp({ id: newOpId(), kind: 'custody_delete', payload: deletePayload(r) });
      d?.close();
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  /* ------------------------------ الأصناف ------------------------------ */

  function paintItems() {
    const items = snap.items;
    clear(body).append(
      problemBox(),
      h('div', { class: 'toolbar p-toolbar' },
        h('p', { class: 'hint grow', style: 'margin:0' }, 'سجلّ مستقلّ عن مواد المخزن: ما يُسلَّم أمانةً ويُعاد بعينه.'),
        h('button', { class: 'btn btn-sm', type: 'button', onclick: () => reload() }, icon('undo', 15), 'تحديث'),
        h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => itemForm() }, icon('plus', 15), 'صنف جديد')),
      items.length
        ? h('div', { class: 'p-cards' }, ...items.map((i) => {
            const free = i.owned_qty > 0 ? Math.max(0, i.owned_qty - i.out_qty) : null;
            return h('div', { class: `p-citem${i.draft ? ' draft' : ''}${Number(i.active) === 1 ? '' : ' off'}` },
              h('div', { class: 'pc-top' }, h('b', {}, said(i.name)), i.unit ? h('span', { class: 'muted' }, i.unit) : null,
                Number(i.active) === 1 ? null : badge('موقوف')),
              i.details ? h('div', { class: 'pc-meta' }, said(i.details)) : null,
              h('div', { class: 'pc-nums' },
                h('div', {}, h('span', {}, 'المملوك'), h('b', {}, i.owned_qty ? num(i.owned_qty) : '—')),
                h('div', { class: i.out_qty ? 'warn' : '' }, h('span', {}, 'بذمّة الآن'), h('b', {}, num(i.out_qty))),
                h('div', { class: free !== null && free <= 0 ? 'bad' : 'ok' }, h('span', {}, 'المتاح'), h('b', {}, free === null ? '—' : num(free)))),
              i.draft ? h('div', { class: 'pc-waits' }, waitChip(i.op, 'صنف جديد')) : null);
          }))
        : h('div', { class: 'card' }, emptyState('لا أصناف بعد', 'أضف ما تُعيره من عُدّة وأدوات', null, 'box')));
  }

  function itemForm() {
    const id = newOpId();
    formModal({
      title: 'صنف أمانة جديد',
      submitText: isTrusted() ? 'إضافة' : 'إرسال للموافقة',
      fields: [
        field('الاسم', h('input', { name: 'name', required: true })),
        h('div', { class: 'field-row' },
          field('الوحدة', h('input', { name: 'unit', placeholder: 'حبة' })),
          field('العدد المملوك', h('input', { name: 'owned_qty', type: 'number', min: '0', step: 'any', inputmode: 'decimal' }))),
        field('التفاصيل', h('textarea', { name: 'details' }), 'الرقم التسلسلي والموديل — يُطبع في ملاحظات التعهّد'),
        h('div', { class: 'hint' }, sendHint()),
      ],
      onSubmit: async (form, close) => {
        const name = String(form.name ?? '').trim();
        if (!name) throw new Error(tx('اسم الأمانة مطلوب'));
        if (snap.data.items.some((i) => fold(i.name) === fold(name))) throw new Error(`«${name}» ${tx('مسجَّل مسبقاً في أصناف الأمانات')}`);
        await sendOp({ id, kind: 'custody_item_add', payload: itemPayload({ name, unit: form.unit, details: form.details, owned: form.owned_qty }) });
        close();
        reload();
      },
    });
  }

  /* ------------------------------ الطباعة ------------------------------
     التعهّد نفسه الذي يطبعه الحاسوب (pledge.js): الأمانة ومعها ما سُلّم
     للشخص نفسه في اليوم نفسه — ورقة واحدة. وعلى الهاتف يُفتح في صفحةٍ جديدة
     تُطبع أو تُحفظ PDF، وإن حجبها المتصفّح طُبع من إطارٍ مخفي كما على الحاسوب. */

  async function printPledge(row) {
    const same = (r) => r.issue_date === row.issue_date && (row.worker_id
      ? Number(r.worker_id) === Number(row.worker_id)
      : !r.worker_id && (r.holder ?? '') === (row.holder ?? ''));
    const list = snap.rows.filter(same);
    const items = (list.length ? list : [row]).sort((a, b) => String(a.id).localeCompare(String(b.id), 'en', { numeric: true }));
    const language = await printLanguage();
    if (!language) return;
    const head = items[0];
    const job = titleOf(head);
    const html = pledgeHtml({
      holder: head.holder_name,
      job: language === 'ckb' ? tx(job) : job,
      date: head.issue_date,
      items: items.map((r) => ({
        name: r.item_name, qty: r.qty,
        unit: language === 'ckb' ? tx(r.unit ?? '') : r.unit,
        note: [r.number, r.item_details, r.due_date ? `${language === 'ckb' ? tx('الإعادة') : 'الإعادة'} ${fmtDate(r.due_date, language)}` : '', r.notes]
          .filter(Boolean).join(' — '),
      })),
    }, siteBase(), language);
    let win = null;
    try { win = window.open('', '_blank'); } catch { win = null; }
    if (win?.document) {
      win.document.open();
      win.document.write(html);
      win.document.close();
    } else {
      openPrint(html);
    }
  }

  await refresh();
  /* تنقّل الموظف قبل أن تصل الأمانات: لا مؤقّت لشاشةٍ لم تعد معروضة. */
  if (!content.isConnected) return null;
  /* قرارات العمليات تصل وهو ينظر: تُقرأ كل نصف دقيقة كالرئيسية. */
  const timer = setInterval(() => { refresh().catch(() => {}); }, 30 * 1000);
  return { refresh: () => reload(true), cleanup: () => clearInterval(timer) };
}

/* ------------------------------ سيرة الأمانة ------------------------------ */

/** قيمة الخانة كما تُقرأ: الصفة باسمها، والتاريخ بشهره، والفارغ «—». */
function shown(name, value) {
  if (value === null || value === undefined || String(value).trim() === '') return '—';
  const v = String(value);
  if (name === 'holder_title') return HOLDER_TITLES[v] ?? v;
  if (/date$/.test(name) && /^\d{4}-\d{2}-\d{2}$/.test(v)) return fmtDate(v);
  if (name === 'qty' && Number.isFinite(Number(v))) return num(Number(v));
  return said(v);
}

/**
 * التسليم، وكل إعادة، وكل تعديل — الأحدث أوّلاً، كما في درج الأمانة على
 * الحاسوب. وخانات التعديل الواحد (حفظةٌ واحدة: الوقت والمعدِّل والمصدر نفسها)
 * سطرٌ واحد.
 */
function story(c, returns = [], edits = []) {
  const events = [];
  const groups = new Map();
  /* الأقدم أوّلاً من السحابة: تُجمع الحفظة الواحدة ثم يُرتَّب الكل. */
  for (const e of edits) {
    const key = `${e.created_at}|${e.edited_by_name ?? ''}|${e.source ?? ''}`;
    if (!groups.has(key)) {
      const group = { at: e.created_at, who: e.edited_by_name, source: e.source, changes: [] };
      groups.set(key, group);
      events.push({ kind: 'edit', at: e.created_at, group });
    }
    groups.get(key).changes.push(e);
  }
  /* ما سُلّم أوّل مرّة: الكمية قبل أوّل تعديلٍ لها — وإلا هي كما هي الآن. */
  const firstQty = edits.find((e) => e.field === 'qty')?.old_value;
  for (const r of returns) events.push({ kind: 'return', at: r.created_at || r.date, who: r.created_by_name, row: r });
  events.push({ kind: 'issue', at: c.created_at || c.issue_date, who: c.created_by_name });
  events.sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')));

  const who = (name) => h('b', {}, name ? said(name) : '—');
  return h('div', { class: 'p-story' }, ...events.map((e) => {
    if (e.kind === 'issue') {
      return h('div', { class: 'ps-item', 'data-kind': 'issue' },
        h('span', { class: 'ps-dot' }, icon('opCustody', 14)),
        h('div', { class: 'ps-main' },
          h('div', { class: 'ps-head' }, who(e.who), ' ', h('span', {}, 'سلّمها'), ' — ',
            h('span', {}, firstQty ? said(firstQty) : num(c.qty), c.unit ? [' ', h('span', {}, c.unit)] : null)),
          h('time', {}, String(e.at ?? '').length > 10 ? fmtDateTime(e.at) : fmtDate(c.issue_date))));
    }
    if (e.kind === 'return') {
      const r = e.row;
      return h('div', { class: 'ps-item', 'data-kind': 'return' },
        h('span', { class: 'ps-dot' }, icon('opReturn', 14)),
        h('div', { class: 'ps-main' },
          h('div', { class: 'ps-head' }, who(e.who), ' ', h('span', {}, 'سجّل إعادة'), ' — ', h('span', {}, ...amount(r.qty, c.unit))),
          h('div', { class: 'small muted' }, r.date ? [h('span', {}, 'تاريخ الإعادة'), ' ', fmtDate(r.date)] : h('span', {}, 'تاريخها غير معروف'),
            r.notes ? [' · ', said(r.notes)] : null),
          h('time', {}, e.at ? fmtDateTime(e.at) : '')));
    }
    return h('div', { class: 'ps-item', 'data-kind': 'edit' },
      h('span', { class: 'ps-dot' }, icon('edit', 14)),
      h('div', { class: 'ps-main' },
        h('div', { class: 'ps-head' }, who(e.group.who), ' ', h('span', {}, 'عدّلها'), ' ',
          SOURCES[e.group.source] ? badge(SOURCES[e.group.source], e.group.source === 'web' ? 'info' : '') : null),
        h('ul', { class: 'ps-changes' }, ...e.group.changes.map((x) => h('li', {},
          h('span', { class: 'ps-field' }, FIELDS[x.field] ?? x.field), ': ',
          h('s', { class: 'ps-old' }, shown(x.field, x.old_value)), ' ← ',
          h('b', { class: 'ps-new' }, shown(x.field, x.new_value))))),
        h('time', {}, e.at ? fmtDateTime(e.at) : '')));
  }),
  events.length === 1 ? h('div', { class: 'hint' }, 'لم يُعَد منها شيء ولم تُعدَّل بعد.') : null);
}
