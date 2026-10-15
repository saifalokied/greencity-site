/* ==========================================================================
   أدوات بناء الواجهة: العناصر، والأيقونات، والتنسيق، والنوافذ والأدراج،
   والجداول، والتنبيهات. كل شاشة تُبنى من هذه وحدها.
   ========================================================================== */

import { saveBlob } from './save.js';
import { getLang, tx, MONTHS } from './i18n.js';

/* ============================== العناصر ============================== */

/* append وprepend الأصليتان تكتبان null وundefined نصّاً على الشاشة، والشرط
   الذي لم يتحقّق (‎cond ? h(...) : null‎) شائع في بناء الشاشات. فتُسقطان
   الفارغ هنا مرّة واحدة لكل عنصر في الصفحة، بدل أن يتذكّره كل سطر. */
for (const proto of [Element.prototype, DocumentFragment.prototype]) {
  for (const name of ['append', 'prepend']) {
    const native = proto[name];
    proto[name] = function (...nodes) {
      return native.apply(this, nodes.filter((n) => n !== null && n !== undefined && n !== false));
    };
  }
}

/**
 * h('div', { class: 'card', onclick }, 'نص', h('span'))
 * الخصائص المبدوءة بـ on مستمعات أحداث، والقيم الفارغة تُتجاهل.
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'class') el.className = value;
    else if (key === 'html') el.innerHTML = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (['value', 'checked', 'disabled', 'selected', 'required', 'hidden', 'readOnly'].includes(key)) el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  return append(el, ...children);
}

/** إلحاق أبناء مع إسقاط ما لم يتحقّق شرطه — فلا يُكتب «null» على الشاشة. */
export function append(parent, ...children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

export function clear(node) {
  node.replaceChildren();
  return node;
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/* ============================== الأيقونات ============================== */

const ICONS = {
  home: 'M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z',
  opIn: 'M12 3v10M8 9l4 4 4-4M4 14v4a2 2 0 002 2h12a2 2 0 002-2v-4',
  opOut: 'M12 14V4M8 8l4-4 4 4M4 14v4a2 2 0 002 2h12a2 2 0 002-2v-4',
  opTransfer: 'M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7',
  opReturn: 'M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 010 11H11',
  opAdjust: 'M9 3h6v3H9zM8 5H6a1 1 0 00-1 1v14a1 1 0 001 1h12a1 1 0 001-1V6a1 1 0 00-1-1h-2M9 14l2 2 4-4',
  opCustody: 'M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z',
  flag: 'M4 22V4M4 4h13l-2 4 2 4H4',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  box: 'M21 8v8l-9 5-9-5V8l9-5zM3 8l9 5 9-5M12 13v8',
  layers: 'M12 2L2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  warehouse: 'M3 21h18M5 21V9l7-4 7 4v12M9 21v-7h6v7',
  map: 'M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4zM8 2v16M16 6v16',
  users: 'M17 20v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9.5 6.5a3.5 3.5 0 11-7 0 3.5 3.5 0 017 0zM22 20v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  user: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z',
  hardhat: 'M2 18h20M4 18v-3a8 8 0 0116 0v3M10 7V4h4v3M8 10V8M16 10V8',
  calendar: 'M3 6a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2zM3 10h18M8 2v4M16 2v4',
  report: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M8 13h8M8 17h5',
  chart: 'M3 3v18h18M7 15l4-5 3 3 5-7',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  edit: 'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z',
  trash: 'M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M19 6l-1 14a1 1 0 01-1 1H7a1 1 0 01-1-1L5 6M10 11v6M14 11v6',
  search: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35',
  print: 'M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6z',
  download: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3',
  upload: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12',
  check: 'M20 6L9 17l-5-5',
  checkCircle: 'M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3',
  x: 'M18 6L6 18M6 6l12 12',
  xCircle: 'M12 22a10 10 0 100-20 10 10 0 000 20zM15 9l-6 6M9 9l6 6',
  alert: 'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01',
  info: 'M12 22a10 10 0 100-20 10 10 0 000 20zM12 16v-4M12 8h.01',
  logout: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  key: 'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4',
  file: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  copy: 'M9 9h10a2 2 0 012 2v10a2 2 0 01-2 2H9a2 2 0 01-2-2V11a2 2 0 012-2zM5 15H4a2 2 0 01-2-2V3a2 2 0 012-2h10a2 2 0 012 2v1',
  bell: 'M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0',
  chat: 'M21 11.5a8.4 8.4 0 01-9 8.4 8.9 8.9 0 01-3.9-.9L3 20.5l1.5-4.4A8.4 8.4 0 013.6 11.6a8.4 8.4 0 018.4-8.4h.5a8.4 8.4 0 018 8z',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z',
  lock: 'M5 11h14a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2v-7a2 2 0 012-2zM7 11V7a5 5 0 0110 0v4',
  history: 'M3 3v5h5M3.05 13A9 9 0 106 5.3L3 8M12 7v5l4 2',
  clock: 'M12 22a10 10 0 100-20 10 10 0 000 20zM12 6v6l4 2',
  sun: 'M12 17a5 5 0 100-10 5 5 0 000 10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42',
  moon: 'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z',
  cloud: 'M17.5 19a4.5 4.5 0 000-9 6 6 0 00-11.6 1.6A3.5 3.5 0 006 19h11.5z',
  server: 'M3 5a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2H5a2 2 0 01-2-2zM3 15a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2H5a2 2 0 01-2-2zM7 7h.01M7 17h.01',
  menu: 'M4 6h16M4 12h16M4 18h16',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  chevron: 'M9 18l6-6-6-6',
  chevronDown: 'M6 9l6 6 6-6',
  arrowLeft: 'M19 12H5M12 19l-7-7 7-7',
  external: 'M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3',
  filter: 'M22 3H2l8 9.46V19l4 2v-8.54z',
  tag: 'M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82zM7 7h.01',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 100-6 3 3 0 000 6z',
  ban: 'M12 22a10 10 0 100-20 10 10 0 000 20zM4.93 4.93l14.14 14.14',
  undo: 'M3 7v6h6M3.51 13a9 9 0 102.13-9.36L3 8',
  zap: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  /* أيقونات الأقسام: الصحيات قطرة، والطرق والمساحة طريق. */
  drop: 'M12 2.69l5.66 5.66a8 8 0 11-11.31 0z',
  road: 'M4 21L9 3M20 21L15 3M12 5v2M12 10v3M12 16v3',
  /* سلّة الطالب: قائمة الطلبات على الموقع (portal/menu.js). */
  cart: 'M9 22a1 1 0 100-2 1 1 0 000 2zM20 22a1 1 0 100-2 1 1 0 000 2zM1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6',
  /* الطقم الجاهز: صندوقٌ بشريطه — مواد مجموعة تُطلب معاً. */
  kit: 'M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z',
  phone: 'M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.08 4.18 2 2 0 014.06 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z',
};

export function icon(name, size = 18) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.9');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICONS[name] ?? ICONS.box);
  svg.append(path);
  return svg;
}

/* ============================== التنسيق ============================== */

export function num(value, digits = 3) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US', { maximumFractionDigits: digits });
}

/** «12 كيس» — الكمية ووحدتها معاً. */
export const qtyUnit = (value, unit) => `${num(value)}${unit ? ` ${unit}` : ''}`;

/**
 * «12 كيس» للشاشة: الكمية ووحدتها عقدتين. الوحدة («كيس») يعرفها القاموس
 * وحدها فتُترجم، و«12 كيس» نصّاً واحداً لا — فتبقى عربية في الشاشة الكردية.
 */
export const qtyParts = (value, unit) => [num(value), unit ? [' ', h('span', {}, unit)] : null];

/* تاريخ العمل («2026-09-19») محلّي يُقرأ كما هو؛ والطابع الزمني بغرينتش
   يُعرض بساعة الجهاز. */
function asDate(value) {
  if (value instanceof Date) return value;
  const s = String(value);
  if (s.length <= 10) return new Date(s + 'T00:00:00');
  const iso = s.replace(' ', 'T');
  return new Date(/[Zz]$|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z');
}

export function fmtDate(value, language = getLang()) {
  if (!value) return '—';
  const d = asDate(value);
  if (isNaN(d)) return String(value);
  const months = MONTHS[language] ?? MONTHS.ar;
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtTime(value) {
  if (!value) return '—';
  const d = asDate(value);
  if (isNaN(d)) return String(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtDateTime(value) {
  if (!value) return '—';
  if (isNaN(asDate(value))) return String(value);
  return `${fmtDate(value)} — ${fmtTime(value)}`;
}

export function localDay(value) {
  const d = asDate(value);
  if (isNaN(d)) return String(value).slice(0, 10);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const today = () => localDay(new Date());

export function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDay(d);
}

/** «قبل ٥ دقائق» — للخط الزمني. */
export function ago(value) {
  if (!value) return '';
  const d = asDate(value);
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'الآن';
  const m = Math.round(s / 60);
  if (m < 60) return `قبل ${m} دقيقة`;
  const hours = Math.round(m / 60);
  if (hours < 24) return `قبل ${hours} ساعة`;
  return fmtDate(value);
}

/* ============================== التنبيهات ============================== */

export function toast(message, type = 'info', action = null) {
  const root = document.getElementById('toasts');
  if (!root) return;
  const node = h('div', { class: `toast ${type}` },
    icon(type === 'success' ? 'checkCircle' : type === 'error' ? 'alert' : 'info', 18),
    h('span', {}, message),
    action ? h('button', { class: 't-action', onclick: () => { action.run(); node.remove(); } }, action.label) : null);
  root.append(node);
  setTimeout(() => {
    node.style.transition = 'opacity .25s, transform .25s';
    node.style.opacity = '0';
    node.style.transform = 'translateY(8px)';
    setTimeout(() => node.remove(), 260);
  }, action ? 7000 : type === 'error' ? 5500 : 3200);
}

/* ============================== النوافذ ============================== */

const layers = [];

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && layers.length) {
    e.preventDefault();
    layers.at(-1)();
  }
});

/** نافذة منبثقة. body وfooter عقدتان أو دالتان تأخذان close. */
export function modal({ title, body, footer, width = '', onClose }) {
  const root = document.getElementById('modals');
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    backdrop.remove();
    layers.splice(layers.indexOf(close), 1);
    onClose?.();
  };
  const box = h('div', { class: `modal ${width}`, role: 'dialog', 'aria-modal': 'true', onclick: (e) => e.stopPropagation() },
    h('div', { class: 'modal-head' },
      h('h3', {}, title),
      h('button', { class: 'icon-btn', type: 'button', title: 'إغلاق', onclick: close }, icon('x', 18))),
    h('div', { class: 'modal-body' }, typeof body === 'function' ? body(close) : body),
    footer ? h('div', { class: 'modal-foot' }, typeof footer === 'function' ? footer(close) : footer) : null);
  const backdrop = h('div', { class: 'backdrop', onmousedown: (e) => { if (e.target === backdrop) close(); } }, box);
  root.append(backdrop);
  layers.push(close);
  /* المؤشّر إلى أول خانة — إلا إن كان داخل النافذة: من بدأ يكتب في خانةٍ
     قبل أن تنقضي المهلة لا يُنتزع منها فيكمل ما يكتبه في غيرها. */
  setTimeout(() => {
    if (closed || box.contains(document.activeElement)) return;
    box.querySelector('[autofocus], input:not([type=hidden]):not([disabled]), select, textarea')?.focus();
  }, 50);
  return { close, box };
}

/** درج جانبي للتفاصيل: يبقى ما خلفه ظاهراً فلا يضيع موضع القارئ. */
export function drawer({ title, sub, head, body, footer, wide = false, onClose }) {
  const root = document.getElementById('modals');
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    shade.remove();
    panel.remove();
    layers.splice(layers.indexOf(close), 1);
    onClose?.();
  };
  const bodyNode = h('div', { class: 'drawer-body' }, typeof body === 'function' ? body(close) : body);
  const footNode = h('div', { class: 'drawer-foot', hidden: !footer }, footer ? (typeof footer === 'function' ? footer(close) : footer) : null);
  const headNode = h('div', { class: 'drawer-head' },
    head ?? h('div', {}, h('h3', {}, title), sub ? h('div', { class: 'sub' }, sub) : null),
    h('div', { class: 'spacer' }),
    h('button', { class: 'icon-btn', type: 'button', title: 'إغلاق', onclick: close }, icon('x', 18)));
  const panel = h('aside', { class: `drawer${wide ? ' wide' : ''}`, role: 'dialog' }, headNode, bodyNode, footNode);
  const shade = h('div', { class: 'drawer-backdrop', onclick: close });
  root.append(shade, panel);
  layers.push(close);
  return {
    close,
    setHead: (node) => headNode.firstChild.replaceWith(node),
    setBody: (...nodes) => append(clear(bodyNode), ...nodes),
    setFooter: (...nodes) => { footNode.hidden = !nodes.length; append(clear(footNode), ...nodes); },
  };
}

export function confirmDialog({ title = 'تأكيد', message, confirmText = 'تأكيد', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    modal({
      title,
      body: h('p', { style: 'margin:0;line-height:1.9;white-space:pre-line' }, message),
      footer: (close) => [
        h('button', { class: 'btn', onclick: () => { answered = true; close(); resolve(false); } }, 'رجوع'),
        h('button', {
          class: `btn ${danger ? 'btn-danger-solid' : 'btn-primary'}`,
          onclick: () => { answered = true; close(); resolve(true); },
        }, confirmText),
      ],
      onClose: () => { if (!answered) resolve(false); },
    });
  });
}

/** يسأل عن نصّ قصير — سبب الإلغاء مثلاً. يُرجع النصّ أو null. */
export function promptDialog({ title, message, warn = null, label, placeholder = '', confirmText = 'تأكيد', danger = false, min = 0 }) {
  return new Promise((resolve) => {
    let answered = false;
    const input = h('textarea', { placeholder, style: 'min-height:70px' });
    const err = h('div', { class: 'form-error', hidden: true });
    modal({
      title,
      body: h('div', { class: 'form-grid' },
        message ? h('p', { style: 'margin:0;line-height:1.9' }, message) : null,
        /* تنبيهٌ يُقرأ قبل التأكيد — إلغاء سندٍ جُهّزت موادّه مثلاً. */
        warn ? h('div', { class: 'warn-box' }, icon('alert', 18), h('div', {}, warn)) : null,
        field(label, input), err),

      footer: (close) => [
        h('button', { class: 'btn', onclick: () => { answered = true; close(); resolve(null); } }, 'رجوع'),
        h('button', {
          class: `btn ${danger ? 'btn-danger-solid' : 'btn-primary'}`,
          onclick: () => {
            const text = input.value.trim();
            if (text.length < min) {
              err.textContent = tx('اكتب سبباً واضحاً');
              err.hidden = false;
              input.focus();
              return;
            }
            answered = true;
            close();
            resolve(text);
          },
        }, confirmText),
      ],
      onClose: () => { if (!answered) resolve(null); },
    });
  });
}

/** نافذة نموذج: تمنع الإرسال الافتراضي وتعرض خطأ الحفظ في مكانه. */
export function formModal({ title, fields, width = '', submitText = 'حفظ', submitClass = 'btn-primary', op = null, onSubmit, extra }) {
  const error = h('div', { class: 'form-error', hidden: true });
  const form = h('form', { class: 'form-grid', autocomplete: 'off' }, ...fields, error);
  const submitBtn = h('button', { class: `btn ${op ? 'btn-op' : submitClass}`, type: 'button', 'data-op': op }, submitText);

  const { close } = modal({
    title, width, body: form,
    footer: (closeFn) => [extra ?? null, h('button', { class: 'btn', type: 'button', onclick: closeFn }, 'إلغاء'), submitBtn],
  });

  const submit = async (e) => {
    e?.preventDefault();
    error.hidden = true;
    submitBtn.disabled = true;
    try {
      await onSubmit(Object.fromEntries(new FormData(form)), close, form);
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
      error.scrollIntoView({ block: 'nearest' });
    } finally {
      submitBtn.disabled = false;
    }
  };
  form.addEventListener('submit', submit);
  submitBtn.addEventListener('click', submit);
  return { close, form };
}

/* ============================== الحقول ============================== */

export function field(label, input, hint) {
  return h('label', { class: 'field' }, h('span', {}, label), input, hint ? h('div', { class: 'hint' }, hint) : null);
}

export function select(name, options, value, extra = {}) {
  return h('select', { name, ...extra },
    ...options.map((o) => h('option', { value: o.value, selected: String(o.value) === String(value ?? '') }, o.label)));
}

/** مفتاح بين خيارات: [{ value, label, icon, op }]. */
export function segmented(options, value, onChange) {
  const node = h('div', { class: 'seg', role: 'tablist' });
  const paint = (v) => {
    for (const b of node.children) b.classList.toggle('on', b.dataset.value === String(v));
  };
  for (const o of options) {
    node.append(h('button', {
      type: 'button', 'data-value': o.value, 'data-op': o.op ?? null,
      onclick: () => { paint(o.value); onChange(o.value); },
    }, o.icon ? icon(o.icon, 16) : null, o.label));
  }
  paint(value);
  return { node, set: paint };
}

/** يُسقط التشكيل ويوحّد الألف والياء: «إسمنت» يجد «اسمنت». */
export const fold = (s) =>
  String(s ?? '')
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/**
 * المنزل الذي يعنيه ما كُتب — إن كان واحداً لا غير: رمزه كاملاً، أو رقمٌ لا
 * يحمله إلا منزل واحد، أو ما لا يطابقه جزئياً إلا منزل واحد. وإلا null:
 * «15» في القطاعين D وC لا يُختار منه أحدهما بـ Enter.
 */
export function soleHouse(houses, text) {
  const q = String(text ?? '').trim().toUpperCase();
  if (!q) return null;
  const sole = (list) => (list.length === 1 ? list[0] : null);
  const byCode = houses.filter((x) => String(x.code).toUpperCase() === q);
  if (byCode.length) return sole(byCode);
  const byNumber = houses.filter((x) => String(x.number).toUpperCase() === q);
  if (byNumber.length) return sole(byNumber);
  return sole(houses.filter((x) => String(x.code).toUpperCase().includes(q)));
}

/* ============================ عناصر جاهزة ============================ */

export function badge(text, tone = '') {
  return h('span', { class: `badge ${tone}` }, text);
}

export function emptyState(title, hint, action, iconName = 'box') {
  return h('div', { class: 'empty' },
    h('div', { class: 'e-icon' }, icon(iconName, 28)),
    h('b', {}, title),
    hint ? h('div', {}, hint) : null,
    action ? h('div', { style: 'margin-top:16px' }, action) : null);
}

export function loadingState(rows = 6) {
  return h('div', { class: 'card' },
    ...Array.from({ length: rows }, (_, i) => h('div', { class: 'sk-row', style: `opacity:${1 - i * 0.12}` },
      h('div', { class: 'skeleton sk-line sm' }), h('div', { class: 'skeleton sk-line' }), h('div', { class: 'skeleton sk-line sm' }))));
}

export function kpi({ label, value, hint, iconName, op, tone, href, color }) {
  const tag = href ? 'a' : 'div';
  return h(tag, {
    class: `kpi${tone ? ` tone-${tone}` : ''}`, href: href ?? null, 'data-op': op ?? null,
    style: op ? '--soft:var(--op-soft);--c:var(--op)' : color ? `--c:${color}` : null,
  },
    iconName ? h('div', { class: 'k-icon' }, icon(iconName, 20)) : null,
    h('div', { class: 'k-label' }, label),
    h('div', { class: 'k-value' }, value),
    hint ? h('div', { class: 'k-hint' }, hint) : null);
}

export function meter(ratio, color) {
  const pct = Math.max(0, Math.min(100, ratio * 100));
  return h('div', { class: 'meter', style: color ? `--c:${color}` : null }, h('i', { style: `width:${pct}%` }));
}

/**
 * جدول. columns: [{ title, render(row, i) | key, class, phone:false, foot }]
 * onRow يجعل الصفّ قابلاً للنقر. وafter(row, i) عقدةٌ تُعرض تحت الصفّ بعرض
 * الجدول كلّه — ما في الطقم تحت سطره مثلاً — أو null.
 */
export function table(columns, rows, { onRow, rowClass, empty, footer, after } = {}) {
  if (!rows.length && empty) return empty;
  const cols = columns.filter(Boolean);
  const cls = (c) => [c.class ?? '', c.phone === false ? 'col-phone-hide' : ''].join(' ').trim() || null;
  return h('div', { class: 'table-wrap' },
    h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, ...cols.map((c) => h('th', { class: cls(c) }, c.title)))),
      h('tbody', {}, ...rows.flatMap((row, i) => {
        const tr = h('tr', {
          class: [onRow ? 'clickable' : '', rowClass?.(row) ?? ''].join(' ').trim() || null,
          onclick: onRow ? (e) => { if (!e.target.closest('button, a, input, select')) onRow(row); } : null,
        }, ...cols.map((c) => h('td', { class: cls(c) }, c.render ? c.render(row, i) : row[c.key] ?? '')));
        const below = after?.(row, i) ?? null;
        return below ? [tr, h('tr', { class: 'row-after' }, h('td', { colspan: String(cols.length) }, below))] : [tr];
      })),
      footer ? h('tfoot', {}, footer) : null));
}

/* ============================ الرسم البياني ============================ */

const SVG_NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined && v !== false) el.setAttribute(k, v);
  for (const c of children.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

/** أعمدة مزدوجة عبر الأيام. series: [{ label, values, color }] */
export function barChart(labels, series, { height = 220 } = {}) {
  const W = 720, H = height, top = 12, bottom = 26, side = 36;
  const plotH = H - top - bottom, plotW = W - side * 2;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const gw = plotW / labels.length;
  const bw = Math.max(4, Math.min(16, (gw - 8) / series.length));
  const y = (v) => top + plotH - (v / max) * plotH;
  const grid = [0, 0.5, 1].map((f) => svg('g', {},
    svg('line', { class: 'chart-grid', x1: side, x2: W - side, y1: top + plotH * (1 - f), y2: top + plotH * (1 - f) }),
    svg('text', { class: 'chart-axis', x: W - side + 6, y: top + plotH * (1 - f) + 4, 'text-anchor': 'start' }, num(max * f, 0))));
  const bars = [];
  labels.forEach((label, gi) => series.forEach((s, si) => {
    const v = s.values[gi] ?? 0;
    const cx = side + gw * gi + gw / 2 + (si - (series.length - 1) / 2) * (bw + 3);
    bars.push(svg('rect', { x: cx - bw / 2, y: y(v), width: bw, height: Math.max(v > 0 ? 2 : 0, (v / max) * plotH), rx: 3, fill: s.color },
      svg('title', {}, `${label} — ${s.label}: ${num(v)}`)));
  }));
  const axis = labels.map((l, i) => (i % 2 === 0
    ? svg('text', { class: 'chart-axis', x: side + gw * i + gw / 2, y: H - 7, 'text-anchor': 'middle' }, l) : null));
  return h('div', { class: 'chart' }, svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' }, ...grid, ...bars, ...axis));
}

/* ============================== التصدير ============================== */

/** CSV يفتحه Excel بالعربية سليمة. */
export function exportCsv(filename, headers, rows) {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.map((x) => esc(tx(x))).join(','),
    ...rows.map((r) => r.map((x) => esc(typeof x === 'string' ? tx(x) : x)).join(',')),
  ];
  saveBlob(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' }), tx(filename));
  toast('صُدِّر الملف', 'success');
}

/** يقرأ ملفاً يختاره المستخدم ويُرجعه base64 — للاستيراد من إكسل. */
export function pickFile(accept = '.xlsx,.xls,.csv') {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, style: 'display:none' });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, data: String(reader.result).split(',')[1] ?? '' });
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
    document.body.append(input);
    input.click();
  });
}
