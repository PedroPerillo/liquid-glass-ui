/**
 * liquid-glass-ui
 * Refraction engine + components for Apple-style Liquid Glass on the web.
 *
 * - Every element with the `.lg` class becomes a glass surface.
 * - Chromium: real edge refraction via an SVG displacement map used as a
 *   backdrop-filter (one filter per element, sized to it).
 * - Safari / Firefox: frosted fallback (blur + saturate).
 * - Reduce Transparency: solid surfaces (handled in CSS).
 *
 * Usage:
 *   <link rel="stylesheet" href="src/liquid-glass.css">
 *   <script type="module" src="src/liquid-glass.js"></script>
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const DEFAULT_BLUR = 10;

/** True when the browser applies SVG filters to the backdrop (Chromium). */
export const supportsRefraction = (() => {
  if (typeof navigator === 'undefined') return false;
  const brands = navigator.userAgentData && navigator.userAgentData.brands;
  return !!(brands && brands.some((b) => /Chromium/i.test(b.brand)));
})();

let mode = 'liquid'; // 'liquid' | 'frost' | 'flat'
const options = { blur: DEFAULT_BLUR, refraction: 1 }; // global defaults, see configure()
let uid = 0;
let defs = null;
const surfaces = new Map(); // element -> state
const mapCache = new Map(); // "WxHxR" -> data URL

function ensureDefs() {
  if (defs) return defs;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  defs = document.createElementNS(SVG_NS, 'defs');
  svg.appendChild(defs);
  document.body.appendChild(svg);
  return defs;
}

/**
 * Displacement map for a rounded rect. Neutral (128) in the middle, pushed
 * toward the center near the rim, so the backdrop bends like a glass lens.
 */
function buildMap(W, H, r) {
  const key = `${W}x${H}x${r}`;
  if (mapCache.has(key)) return mapCache.get(key);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const band = Math.max(4, Math.min(24, Math.min(W, H) * 0.36));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = x + 0.5 - W / 2;
      const py = y + 0.5 - H / 2;
      const qx = Math.abs(px) - (W / 2 - r);
      const qy = Math.abs(py) - (H / 2 - r);
      const sdf = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
      let dx = 0;
      let dy = 0;
      if (sdf < 0) {
        const t = Math.max(0, 1 + sdf / band);
        const s = t * t * t;
        let nx;
        let ny;
        if (qx > 0 && qy > 0) {
          const l = Math.hypot(qx, qy) || 1;
          nx = qx / l;
          ny = qy / l;
        } else if (qx > qy) {
          nx = 1; ny = 0;
        } else {
          nx = 0; ny = 1;
        }
        dx = -nx * (Math.sign(px) || 1) * s;
        dy = -ny * (Math.sign(py) || 1) * s;
      }
      const i = (y * W + x) * 4;
      d[i] = 128 + dx * 127;
      d[i + 1] = 128 + dy * 127;
      d[i + 2] = 128;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const url = c.toDataURL();
  if (mapCache.size > 64) mapCache.clear();
  mapCache.set(key, url);
  return url;
}

function createFilter(id) {
  const f = document.createElementNS(SVG_NS, 'filter');
  f.id = id;
  f.setAttribute('filterUnits', 'userSpaceOnUse');
  f.setAttribute('color-interpolation-filters', 'sRGB');
  f.setAttribute('x', '0');
  f.setAttribute('y', '0');
  f.innerHTML = `
    <feImage x="0" y="0" preserveAspectRatio="none" result="map"/>
    <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="soft"/>
    <feDisplacementMap in="soft" in2="map" xChannelSelector="R" yChannelSelector="G" result="bent"/>
    <feColorMatrix in="bent" type="saturate" values="1.6"/>`;
  ensureDefs().appendChild(f);
  return f;
}

function radiusOf(el, W, H) {
  const raw = getComputedStyle(el).borderTopLeftRadius;
  let r = parseFloat(raw) || 0;
  if (raw.endsWith('%')) r = (r / 100) * Math.min(W, H);
  return Math.round(Math.min(r, W / 2, H / 2));
}

function frostedValue(blur) {
  return `blur(${blur}px) saturate(180%)`;
}

function render(el) {
  const s = surfaces.get(el);
  if (!s) return;
  const blur = el.dataset.lgBlur != null ? +el.dataset.lgBlur : options.blur;
  let value = '';
  if (mode === 'frost' || (mode === 'liquid' && !supportsRefraction)) {
    value = frostedValue(blur);
  } else if (mode === 'liquid') {
    const W = Math.round(el.offsetWidth);
    const H = Math.round(el.offsetHeight);
    if (!W || !H) return;
    const r = radiusOf(el, W, H);
    const auto = Math.max(16, Math.min(60, H * 0.9));
    const bend = (el.dataset.lgBend != null ? +el.dataset.lgBend : auto) * options.refraction;
    if (!s.filter) s.filter = createFilter(s.id);
    const f = s.filter;
    f.setAttribute('width', W);
    f.setAttribute('height', H);
    const feImage = f.querySelector('feImage');
    feImage.setAttribute('width', W);
    feImage.setAttribute('height', H);
    feImage.setAttribute('href', buildMap(W, H, r));
    f.querySelector('feDisplacementMap').setAttribute('scale', bend);
    value = `url(#${s.id}) blur(${Math.round(blur * 0.35)}px)`;
  }
  // Inline on purpose: Safari ignores CSS variables in -webkit-backdrop-filter.
  el.style.backdropFilter = value;
  el.style.webkitBackdropFilter = value;
}

const resizeObserver = typeof ResizeObserver !== 'undefined'
  ? new ResizeObserver((entries) => entries.forEach((e) => render(e.target)))
  : null;

/** Turn an element into a glass surface. Called automatically for `.lg`. */
export function attach(el) {
  if (surfaces.has(el)) {
    render(el);
    return;
  }
  surfaces.set(el, { id: `lg-filter-${++uid}`, filter: null });
  if (resizeObserver) resizeObserver.observe(el);
  render(el);
}

/** Stop managing an element and remove its filter. */
export function detach(el) {
  const s = surfaces.get(el);
  if (!s) return;
  if (resizeObserver) resizeObserver.unobserve(el);
  if (s.filter) s.filter.remove();
  el.style.backdropFilter = '';
  el.style.webkitBackdropFilter = '';
  surfaces.delete(el);
}

/** Re-render one element, or every surface when called without arguments. */
export function refresh(el) {
  if (el) render(el);
  else surfaces.forEach((_, e) => render(e));
}

/** Switch all surfaces between 'liquid', 'frost' and 'flat'. */
export function setMode(next) {
  if (!['liquid', 'frost', 'flat'].includes(next)) return;
  mode = next;
  document.documentElement.dataset.lgMode = next;
  refresh();
  document.dispatchEvent(new CustomEvent('lg-modechange', { detail: { mode } }));
}

export function getMode() {
  return mode;
}

/**
 * Change global defaults for every surface.
 * @param {{blur?: number, refraction?: number}} next
 *   blur: px of blur (default 10). refraction: multiplier on edge bending (default 1, 0 = none).
 * Per-element data-lg-blur still wins; data-lg-bend is multiplied by refraction.
 */
export function configure(next = {}) {
  if (typeof next.blur === 'number' && next.blur >= 0) options.blur = next.blur;
  if (typeof next.refraction === 'number' && next.refraction >= 0) options.refraction = next.refraction;
  refresh();
  return { ...options };
}

export function getOptions() {
  return { ...options };
}

/* ---------------- Toast ---------------- */

let toastRegion = null;

/**
 * Show a glass toast at the top of the screen.
 * @param {string} message
 * @param {{duration?: number, icon?: string}} [options] icon is an SVG/HTML string
 */
export function toast(message, { duration = 2600, icon = '' } = {}) {
  if (!toastRegion) {
    toastRegion = document.createElement('div');
    toastRegion.className = 'lg-toast-region';
    toastRegion.setAttribute('role', 'status');
    toastRegion.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastRegion);
  }
  const t = document.createElement('div');
  t.className = 'lg lg-toast';
  if (icon) t.insertAdjacentHTML('afterbegin', icon);
  t.appendChild(document.createTextNode(message));
  toastRegion.appendChild(t);
  attach(t);
  const leave = () => {
    t.dataset.leaving = '';
    const done = () => { detach(t); t.remove(); };
    t.addEventListener('animationend', done, { once: true });
    setTimeout(done, 400);
  };
  setTimeout(leave, duration);
  return { dismiss: leave };
}

/* ---------------- Sheet ---------------- */

/** Open a `<dialog class="lg lg-sheet">` as a modal sheet. */
export function openSheet(dialog) {
  if (typeof dialog === 'string') dialog = document.querySelector(dialog);
  if (!dialog || dialog.open) return;
  dialog.showModal();
  requestAnimationFrame(() => refresh(dialog));
}

export function closeSheet(dialog) {
  if (typeof dialog === 'string') dialog = document.querySelector(dialog);
  if (dialog && dialog.open) dialog.close();
}

function wireSheets(root = document) {
  root.querySelectorAll('dialog.lg-sheet:not([data-lg-wired])').forEach((d) => {
    d.dataset.lgWired = '';
    // Tap on the backdrop closes the sheet
    d.addEventListener('click', (e) => {
      if (e.target !== d) return;
      const r = d.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) d.close();
    });
  });
}

document.addEventListener('click', (e) => {
  const opener = e.target.closest && e.target.closest('[data-lg-open]');
  if (opener) {
    openSheet(opener.getAttribute('data-lg-open'));
    return;
  }
  const closer = e.target.closest && e.target.closest('[data-lg-close]');
  if (closer) {
    const d = closer.closest('dialog');
    if (d) d.close();
  }
});

/* ---------------- Indicator groups ---------------- */

/**
 * Shared base for components with a sliding glass indicator.
 * Children must be <button> elements. Fires a `change` event with
 * detail { index, value } where value is the button's data-value.
 */
class IndicatorGroup extends HTMLElement {
  static get observedAttributes() { return ['value']; }

  get itemRole() { return 'tab'; }
  get groupRole() { return 'tablist'; }
  get selectedAttr() { return 'aria-selected'; }

  connectedCallback() {
    this.classList.add('lg');
    if (!this.hasAttribute('role')) this.setAttribute('role', this.groupRole);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setup(), { once: true });
    } else {
      this.setup();
    }
  }

  setup() {
    if (this._ready) return;
    this._ready = true;
    this.indicator = document.createElement('span');
    this.indicator.className = 'lg-ind';
    this.indicator.setAttribute('aria-hidden', 'true');
    this.prepend(this.indicator);
    this.items.forEach((b, i) => {
      b.setAttribute('role', this.itemRole);
      b.type = 'button';
      b.addEventListener('click', () => this.select(i, true));
    });
    this.addEventListener('keydown', (e) => this.onKey(e));
    const initial = this.getAttribute('value');
    let idx = this.items.findIndex((b) => b.getAttribute(this.selectedAttr) === 'true');
    if (initial != null) idx = this.indexOf(initial);
    this.select(Math.max(0, idx), false);
    this._ro = new ResizeObserver(() => this.place(false));
    this._ro.observe(this);
    attach(this);
  }

  disconnectedCallback() {
    if (this._ro) this._ro.disconnect();
    detach(this);
  }

  attributeChangedCallback(name, oldV, newV) {
    if (this._ready && name === 'value' && oldV !== newV) this.select(this.indexOf(newV), false);
  }

  get items() {
    return [...this.children].filter((c) => c.tagName === 'BUTTON');
  }

  indexOf(v) {
    const byValue = this.items.findIndex((b) => b.dataset.value === v);
    if (byValue >= 0) return byValue;
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? 0 : n;
  }

  get index() { return this._index ?? 0; }
  get value() {
    const b = this.items[this.index];
    return b ? (b.dataset.value ?? String(this.index)) : null;
  }

  select(i, fire) {
    const items = this.items;
    if (!items[i]) return;
    const changed = i !== this._index;
    this._index = i;
    items.forEach((b, j) => {
      b.setAttribute(this.selectedAttr, String(j === i));
      b.tabIndex = j === i ? 0 : -1;
    });
    this.place(true);
    if (fire && changed) {
      this.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { index: i, value: this.value } }));
    }
  }

  place(animate) {
    const b = this.items[this.index];
    if (!b || !this.indicator) return;
    const ind = this.indicator;
    if (!animate) ind.style.transition = 'none';
    const pad = this.indicatorPad;
    ind.style.width = `${b.offsetWidth + pad * 2}px`;
    ind.style.transform = `translateX(${b.offsetLeft - pad}px)`;
    if (!animate) {
      ind.getBoundingClientRect();
      ind.style.transition = '';
    }
  }

  get indicatorPad() { return 0; }

  onKey(e) {
    const keys = { ArrowRight: 1, ArrowLeft: -1, Home: -Infinity, End: Infinity };
    if (!(e.key in keys)) return;
    e.preventDefault();
    const n = this.items.length;
    let i = this.index + keys[e.key];
    if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = n - 1;
    else i = (i + n) % n;
    this.select(i, true);
    this.items[i].focus();
  }
}

/** <lg-tab-bar floating> with <button> children (icon + label). */
class LgTabBar extends IndicatorGroup {
  get indicatorPad() { return 4; }
}

/** <lg-segmented> with <button data-value> children. */
class LgSegmented extends IndicatorGroup {
  get itemRole() { return 'radio'; }
  get groupRole() { return 'radiogroup'; }
  get selectedAttr() { return 'aria-checked'; }
}

/* ---------------- Auto-attach ---------------- */

function scan(root) {
  if (root.nodeType !== 1) return;
  if (root.matches('.lg') && !root.matches('lg-tab-bar, lg-segmented, .lg-toast')) attach(root);
  root.querySelectorAll('.lg:not(lg-tab-bar):not(lg-segmented):not(.lg-toast)').forEach(attach);
  wireSheets(root.matches('dialog') ? root.parentNode || document : root);
}

function sweep(root) {
  if (root.nodeType !== 1) return;
  if (surfaces.has(root)) detach(root);
  root.querySelectorAll('.lg').forEach((el) => { if (surfaces.has(el)) detach(el); });
}

function init() {
  if (!document.documentElement.dataset.lgMode) document.documentElement.dataset.lgMode = mode;
  document.documentElement.dataset.lgRefraction = supportsRefraction ? 'on' : 'off';
  scan(document.body);
  new MutationObserver((records) => {
    for (const r of records) {
      r.addedNodes.forEach((n) => { if (n.nodeType === 1 && n.isConnected) scan(n); });
      r.removedNodes.forEach((n) => { if (n.nodeType === 1 && !n.isConnected) sweep(n); });
    }
  }).observe(document.body, { childList: true, subtree: true });
}

if (typeof window !== 'undefined') {
  if (!customElements.get('lg-tab-bar')) customElements.define('lg-tab-bar', LgTabBar);
  if (!customElements.get('lg-segmented')) customElements.define('lg-segmented', LgSegmented);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}

const LiquidGlass = {
  attach, detach, refresh, setMode, getMode, configure, getOptions, toast, openSheet, closeSheet, supportsRefraction,
};
if (typeof window !== 'undefined') window.LiquidGlass = LiquidGlass;
export default LiquidGlass;
