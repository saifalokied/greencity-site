/* ============================== هويّة العمليات ==============================
   لكل نوع عملية اسمٌ وأيقونة ولون، تتبعه أينما ظهر: في السجلّ، وفي نموذج
   التسجيل، وفي الرئيسية، وعلى الورق المطبوع. فيُعرف النوع من النظرة قبل
   القراءة. والألوان نفسها معرّفة في app.css تحت [data-op].
   ========================================================================== */

import { h, icon } from './ui.js';

export const OPS = {
  in: {
    label: 'إدخال', full: 'سند إدخال', paper: 'سند إدخال مواد', icon: 'opIn',
    verb: 'تسجيل إدخال', hint: 'مواد وصلت إلى المخزن', color: '#15803d',
  },
  out: {
    label: 'إخراج', full: 'سند إخراج', paper: 'سند إخراج مواد', icon: 'opOut',
    verb: 'تسجيل إخراج', hint: 'مواد خرجت إلى منزل في المشروع', color: '#dc2626',
  },
  transfer: {
    label: 'تحويل', full: 'سند تحويل', paper: 'سند تحويل بين المخازن', icon: 'opTransfer',
    verb: 'تسجيل تحويل', hint: 'من مخزن إلى مخزن', color: '#2563eb',
  },
  return: {
    label: 'إرجاع', full: 'سند إرجاع', paper: 'سند إرجاع مواد', icon: 'opReturn',
    verb: 'تسجيل إرجاع', hint: 'ما عاد من الموقع على سند إخراج', color: '#7c3aed',
  },
  adjust: {
    label: 'تسوية جرد', full: 'تسوية جرد', paper: 'سند تسوية جرد', icon: 'opAdjust',
    verb: 'جرد', hint: 'فروق الجرد', color: '#0891b2',
  },
  custody: {
    label: 'أمانة', full: 'أمانة', paper: 'تعهّد استلام', icon: 'opCustody',
    verb: 'تسليم أمانة', hint: 'عُدّة تُعار وتُعاد', color: '#b45309',
  },
  opening: {
    label: 'رصيد افتتاحي', full: 'رصيد افتتاحي', paper: 'رصيد افتتاحي', icon: 'flag',
    verb: 'رصيد افتتاحي', hint: 'ما بدأ به المخزن', color: '#475569',
  },
};

export const ENTRY_TYPES = ['in', 'out', 'transfer', 'return'];

export const op = (type) => OPS[type] ?? OPS.in;

/** شارة النوع: لونه وأيقونته واسمه. */
export function opTag(type, text) {
  return h('span', { class: 'op-tag', 'data-op': type }, icon(op(type).icon, 14), text ?? op(type).label);
}

/** مربّع أيقونة النوع. */
export function opIcon(type, size = 18, big = false) {
  return h('span', { class: `op-icon${big ? ' lg' : ''}`, 'data-op': type }, icon(op(type).icon, size));
}
