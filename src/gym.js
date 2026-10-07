/**
 * liquid-glass-ui · Gym kit
 * Custom elements for workout-tracker UIs, modelled on the openGym app
 * (github.com/DuarteSantos8/openGym) and written from scratch for this library.
 *
 *   <og-stepper>     − value + with hold-to-repeat
 *   <og-rest-timer>  countdown bar with −15 / +15 / pause / skip
 *   <og-heatmap>     year-at-a-glance activity grid
 *   <og-line-chart>  progress line with hover / keyboard readout
 *   <og-swipe-row>   swipe to delete or copy
 *   <og-wheel>       scroll-snap value picker
 *   <og-elapsed>     running m:ss clock
 *   .og-slider       fill sync for <input type="range" class="og-slider">
 *
 * Add the `lg` class to any of them for the Liquid Glass skin (needs
 * liquid-glass.css/js). Styles live in gym.css.
 *
 * Usage:
 *   <link rel="stylesheet" href="src/gym.css">
 *   <script type="module" src="src/gym.js"></script>
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const icon = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${d}</svg>`;
const ICONS = {
  minus: icon('<path d="M5 12h14"/>'),
  plus: icon('<path d="M12 5v14M5 12h14"/>'),
  pause: icon('<path d="M9 5v14M15 5v14"/>'),
  play: icon('<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>'),
  skip: icon('<path d="M5 5l9 7-9 7zM18 5v14"/>'),
  trash: icon('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>'),
  copy: icon('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>'),
};

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Number of decimals in a number's shortest representation (2.5 -> 1). */
function decimalsOf(n) {
  if (!Number.isFinite(n)) return 0;
  const s = String(n);
  if (s.includes('e-')) return parseInt(s.split('e-')[1], 10);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

/** Parse user input, accepting "," as the decimal separator. NaN when empty. */
function parseNumber(raw) {
  if (raw == null) return NaN;
  const s = String(raw).trim().replace(',', '.');
  if (s === '' || s === '-' || s === '.') return NaN;
  return Number(s);
}

/** Escape text for use inside markup or a quoted attribute. */
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ESC[c]);

function numAttr(el, name, fallback) {
  const v = parseNumber(el.getAttribute(name));
  return Number.isFinite(v) ? v : fallback;
}

function fire(el, type, detail) {
  return el.dispatchEvent(new CustomEvent(type, { bubbles: true, cancelable: true, detail }));
}

function onReady(fn) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
  else fn();
}

/** Local-date ISO key, "2026-10-07". */
function isoDay(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Accepts a Date, a timestamp or an ISO date string ("2026-10-07" is read as local midnight). */
function toDate(x) {
  if (x instanceof Date) return new Date(x.getTime());
  if (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)) {
    const [y, m, d] = x.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(x);
}

const clock = (sec) => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/* ======================================================================
 * <og-stepper value="80" step="2.5" min="0" max="500" unit="kg" label="Weight">
 * ====================================================================== */

const HOLD_DELAY = 400;
const HOLD_SLOW = 90;
const HOLD_FAST = 40;
const HOLD_FAST_AFTER = 12;

class OgStepper extends HTMLElement {
  static get observedAttributes() { return ['value', 'min', 'max', 'step', 'unit', 'label', 'disabled']; }

  connectedCallback() {
    if (!this._built) this.build();
    this.sync();
  }

  disconnectedCallback() {
    this.stopHold();
    clearTimeout(this._heldReset);
    this._held = false;
  }

  attributeChangedCallback(name) {
    if (!this._built) return;
    if (name === 'value' && this._reflecting) return;
    if (name === 'unit' || name === 'label') this.renderLabels();
    this.sync();
  }

  build() {
    this._built = true;
    this.innerHTML = '';
    this.dec = this.makeButton('minus', 'Decrease', -1);
    this.input = document.createElement('input');
    this.input.className = 'og-stepper__input';
    this.input.type = 'text';
    this.input.autocomplete = 'off';
    this.input.setAttribute('role', 'spinbutton');
    this.unitEl = document.createElement('span');
    this.unitEl.className = 'og-stepper__unit';
    this.unitEl.setAttribute('aria-hidden', 'true');
    const val = document.createElement('span');
    val.className = 'og-stepper__val';
    val.append(this.input, this.unitEl);
    this.inc = this.makeButton('plus', 'Increase', 1);
    this.append(this.dec, val, this.inc);
    this.renderLabels();

    this.input.addEventListener('focus', () => this.input.select());
    // The inner field's own events would reach listeners on the stepper with no detail;
    // the stepper fires its own input/change instead.
    this.input.addEventListener('input', (e) => { e.stopPropagation(); this.onType(); });
    this.input.addEventListener('change', (e) => e.stopPropagation());
    this.input.addEventListener('blur', () => this.commitDraft());
    this.input.addEventListener('keydown', (e) => this.onKey(e));
  }

  makeButton(name, label, dir) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'og-stepper__btn';
    b.tabIndex = -1; // the input is the single tab stop; arrows step it
    b.setAttribute('aria-label', label);
    b.innerHTML = ICONS[name];
    b.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || b.disabled) return;
      b.setPointerCapture?.(e.pointerId);
      clearTimeout(this._heldReset);
      this._held = false;
      this.startHold(dir);
    });
    const stop = () => this.stopHold();
    b.addEventListener('pointerup', stop);
    b.addEventListener('pointercancel', stop);
    b.addEventListener('lostpointercapture', stop);
    b.addEventListener('click', () => {
      // A hold already stepped; the click that ends it must not add one more.
      if (this._held) { this._held = false; return; }
      this.stepBy(dir);
    });
    return b;
  }

  renderLabels() {
    const unit = this.getAttribute('unit') || '';
    this.unitEl.textContent = unit;
    this.unitEl.hidden = !unit;
    const label = this.getAttribute('label') || this.getAttribute('aria-label');
    if (label) this.input.setAttribute('aria-label', label);
  }

  /* -- bounds -- */
  get min() { return Math.min(numAttr(this, 'min', -Infinity), numAttr(this, 'max', Infinity)); }
  get max() { return Math.max(numAttr(this, 'min', -Infinity), numAttr(this, 'max', Infinity)); }
  get step() { const s = numAttr(this, 'step', 1); return s > 0 ? s : 1; }
  get precision() {
    const lo = numAttr(this, 'min', 0);
    return Math.max(decimalsOf(this.step), Number.isFinite(lo) ? decimalsOf(lo) : 0);
  }

  get value() {
    const v = numAttr(this, 'value', NaN);
    if (Number.isFinite(v)) return this.clamp(v);
    return Number.isFinite(this.min) ? this.min : this.clamp(0);
  }
  set value(v) {
    const n = parseNumber(v);
    if (!Number.isFinite(n)) return;
    this.setAttribute('value', String(this.round(this.clamp(n))));
  }

  get disabled() { return this.hasAttribute('disabled'); }
  set disabled(on) { this.toggleAttribute('disabled', !!on); }

  clamp(v) { return Math.min(this.max, Math.max(this.min, v)); }
  /** Round to the step's precision so 0.1 + 0.2 shows 0.3. */
  round(v) { return Number(v.toFixed(this.precision)); }
  format(v) { return String(this.round(v)); }

  /** Write a new value: reflect it, redraw, and fire input + change when it moved. */
  setValue(v, { change = true } = {}) {
    const next = this.round(this.clamp(v));
    const prev = this.value;
    this._reflecting = true;
    this.setAttribute('value', String(next));
    this._reflecting = false;
    this._draft = null;
    this.removeAttribute('invalid');
    this.sync();
    if (next !== prev) {
      fire(this, 'input', { value: next });
      if (change) fire(this, 'change', { value: next });
    }
    return next;
  }

  stepBy(dir, times = 1) {
    if (this.disabled) return;
    const base = this._draft != null && Number.isFinite(parseNumber(this._draft)) ? parseNumber(this._draft) : this.value;
    // Snap onto the step grid first, so + from 77.3 lands on the next mark, 77.5, rather than 79.8.
    const s = this.step;
    const origin = Number.isFinite(this.min) ? this.min : 0;
    const k = (base - origin) / s;
    const snapped = dir > 0 ? Math.floor(k + 1e-9) : Math.ceil(k - 1e-9);
    this.setValue(origin + (snapped + dir * times) * s);
  }

  sync() {
    if (!this._built) return;
    const v = this.value;
    if (this._draft == null) this.input.value = this.format(v);
    const decimal = this.precision > 0;
    this.input.inputMode = decimal ? 'decimal' : 'numeric';
    this.input.setAttribute('aria-valuenow', String(v));
    if (Number.isFinite(this.min)) this.input.setAttribute('aria-valuemin', String(this.min));
    else this.input.removeAttribute('aria-valuemin');
    if (Number.isFinite(this.max)) this.input.setAttribute('aria-valuemax', String(this.max));
    else this.input.removeAttribute('aria-valuemax');
    const unit = this.getAttribute('unit');
    this.input.setAttribute('aria-valuetext', unit ? `${this.format(v)} ${unit}` : this.format(v));
    this.input.disabled = this.disabled;
    this.dec.disabled = this.disabled || v <= this.min;
    this.inc.disabled = this.disabled || v >= this.max;
    // Stop a hold that just ran into a bound.
    if (this._hold && ((this._hold.dir < 0 && this.dec.disabled) || (this._hold.dir > 0 && this.inc.disabled))) this.stopHold();
  }

  /* -- typing: keep the draft as typed, clamp only when the field is left -- */
  onType() {
    this._draft = this.input.value;
    const n = parseNumber(this._draft);
    this.toggleAttribute('invalid', this._draft.trim() !== '' && (!Number.isFinite(n) || n < this.min || n > this.max));
    if (Number.isFinite(n)) fire(this, 'input', { value: n });
  }

  commitDraft() {
    if (this._draft == null) return;
    const n = parseNumber(this._draft);
    this._draft = null;
    this.removeAttribute('invalid');
    if (Number.isFinite(n)) this.setValue(n);
    else this.sync(); // empty or junk: put the last good value back
  }

  onKey(e) {
    const big = Math.max(1, Math.round(10 / Math.max(1, this.step)));
    switch (e.key) {
      case 'ArrowUp': this.stepBy(1); break;
      case 'ArrowDown': this.stepBy(-1); break;
      case 'PageUp': this.stepBy(1, big); break;
      case 'PageDown': this.stepBy(-1, big); break;
      case 'Home': if (!Number.isFinite(this.min)) return; this.setValue(this.min); break;
      case 'End': if (!Number.isFinite(this.max)) return; this.setValue(this.max); break;
      case 'Enter': this.commitDraft(); this.input.select(); break;
      case 'Escape': if (this._draft == null) return; this._draft = null; this.removeAttribute('invalid'); this.sync(); break;
      default: return;
    }
    e.preventDefault();
  }

  /* -- hold to repeat, speeding up after a while -- */
  startHold(dir) {
    this.stopHold();
    this.commitDraft();
    const h = (this._hold = { dir, count: 0, timer: 0 });
    const tick = () => {
      if (this._hold !== h) return;
      h.count++;
      this._held = true;
      this.stepBy(dir);
      if (this._hold !== h) return;
      h.timer = setTimeout(tick, h.count >= HOLD_FAST_AFTER ? HOLD_FAST : HOLD_SLOW);
    };
    h.timer = setTimeout(tick, HOLD_DELAY);
  }

  stopHold() {
    if (this._hold) clearTimeout(this._hold.timer);
    this._hold = null;
    // The click that ends a hold arrives right after; if it never does (finger slid off),
    // don't let the flag swallow a later, unrelated click.
    clearTimeout(this._heldReset);
    if (this._held) this._heldReset = setTimeout(() => { this._held = false; }, 350);
  }
}

/* ======================================================================
 * <input type="range" class="og-slider"> fill sync
 * ====================================================================== */

/** Re-sync a .og-slider's filled track after setting its value from code. */
export function updateSlider(input) {
  if (!input) return;
  const min = parseNumber(input.min);
  const max = parseNumber(input.max);
  const lo = Number.isFinite(min) ? min : 0;
  const hi = Number.isFinite(max) ? max : 100;
  const pct = hi > lo ? ((parseNumber(input.value) - lo) / (hi - lo)) * 100 : 0;
  input.style.setProperty('--og-slider-pct', `${Math.min(100, Math.max(0, pct))}%`);
}

function syncSliders(root) {
  if (root.nodeType !== 1) return;
  if (root.matches('input.og-slider')) updateSlider(root);
  root.querySelectorAll('input.og-slider').forEach(updateSlider);
}

/* ======================================================================
 * <og-rest-timer duration="90" label="Rest">
 * ====================================================================== */

class OgRestTimer extends HTMLElement {
  static get observedAttributes() { return ['duration', 'label']; }

  connectedCallback() {
    if (!this._built) this.build();
    if (!this._state) this.reset();
    if (this._state === 'running') this.loop();
  }

  disconnectedCallback() {
    clearInterval(this._iv);
    this._iv = 0;
  }

  attributeChangedCallback() {
    if (this._built && this._state === 'idle') this.reset();
    else if (this._built) this.render();
  }

  get duration() { return Math.max(1, Math.round(numAttr(this, 'duration', 90))); }
  set duration(v) { this.setAttribute('duration', String(v)); }
  /** Seconds left, rounded up. */
  get left() { return Math.max(0, Math.ceil(this._left)); }
  get state() { return this._state; }

  build() {
    this._built = true;
    this.innerHTML = `
      <div class="og-timer__bar" aria-hidden="true"><i></i></div>
      <div class="og-timer__clock">
        <span class="og-timer__time" role="timer" aria-live="off"></span>
        <span class="og-timer__label"></span>
      </div>
      <div class="og-timer__acts">
        <button type="button" class="og-button og-button--sm" data-act="sub" aria-label="15 seconds less">${ICONS.minus}<span>15s</span></button>
        <button type="button" class="og-button og-button--sm" data-act="add" aria-label="15 seconds more">${ICONS.plus}<span>15s</span></button>
        <button type="button" class="og-button og-button--sm" data-act="toggle"></button>
        <button type="button" class="og-button og-button--sm og-button--primary" data-act="skip"></button>
      </div>
      <span class="og-timer__live" aria-live="polite" style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)"></span>`;
    this.els = {
      bar: this.querySelector('.og-timer__bar > i'),
      time: this.querySelector('.og-timer__time'),
      label: this.querySelector('.og-timer__label'),
      toggle: this.querySelector('[data-act="toggle"]'),
      skip: this.querySelector('[data-act="skip"]'),
      add: this.querySelector('[data-act="add"]'),
      sub: this.querySelector('[data-act="sub"]'),
      live: this.querySelector('.og-timer__live'),
    };
    this.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b || !this.contains(b)) return;
      const act = b.dataset.act;
      if (act === 'add') this.add(15);
      else if (act === 'sub') this.add(-15);
      else if (act === 'toggle') this.toggle();
      else if (act === 'skip') this._state === 'ready' ? this.reset() : this.skip();
    });
  }

  /** Back to a full, stopped timer. */
  reset() {
    clearInterval(this._iv);
    this._iv = 0;
    this._total = this.duration;
    this._left = this._total;
    this._state = 'idle';
    this.render();
  }

  /** Start (or restart) the countdown, optionally with a different length. */
  start(seconds) {
    const s = Math.max(1, Math.round(seconds ?? this.duration));
    this._total = s;
    this._left = s;
    this._end = Date.now() + s * 1000;
    this._state = 'running';
    if (this.isConnected) this.loop(); // otherwise connectedCallback starts it
    this.render();
    fire(this, 'rest-start', { seconds: s });
  }

  pause() {
    if (this._state !== 'running') return;
    this._left = Math.max(0, (this._end - Date.now()) / 1000);
    this._state = 'paused';
    clearInterval(this._iv);
    this._iv = 0;
    this.render();
  }

  resume() {
    if (this._state !== 'paused') return;
    this._end = Date.now() + this._left * 1000;
    this._state = 'running';
    if (this.isConnected) this.loop();
    this.render();
  }

  toggle() {
    if (this._state === 'running') this.pause();
    else if (this._state === 'paused') this.resume();
    else this.start(this._state === 'idle' ? this._total : undefined);
  }

  /** Add (or with a negative number, take away) seconds. */
  add(sec) {
    if (this._state === 'ready') { if (sec > 0) this.start(sec); return; }
    if (this._state === 'idle') { this._total = this._left = Math.max(1, this._total + sec); this.render(); return; }
    const next = Math.max(0, (this._state === 'running' ? (this._end - Date.now()) / 1000 : this._left) + sec);
    this._left = next;
    this._total = Math.max(this._total + Math.max(0, sec), next, 1);
    if (this._state === 'running') {
      this._end = Date.now() + next * 1000;
      if (next <= 0) { this.finish(); return; }
    }
    this.render();
  }

  /** End the rest early. */
  skip() {
    if (this._state === 'idle') return;
    const was = this._state;
    this.reset();
    if (was !== 'ready') fire(this, 'rest-end', { skipped: true });
  }

  loop() {
    clearInterval(this._iv);
    this._iv = setInterval(() => {
      this._left = Math.max(0, (this._end - Date.now()) / 1000);
      if (this._left <= 0) this.finish();
      else this.render();
    }, 250);
  }

  finish() {
    clearInterval(this._iv);
    this._iv = 0;
    this._left = 0;
    this._state = 'ready';
    this.render();
    if (this.els) {
      this.els.live.textContent = 'Rest over';
      setTimeout(() => { this.els.live.textContent = ''; }, 3000);
    }
    if (navigator.vibrate && !this.hasAttribute('silent')) navigator.vibrate([120, 60, 120]);
    fire(this, 'rest-end', { skipped: false });
  }

  render() {
    if (!this._built) return;
    const { bar, time, label, toggle, skip, sub } = this.els;
    const st = this._state;
    const left = Math.max(0, this._left);
    // This runs four times a second while counting, so only touch what changed: every DOM
    // write would also wake liquid-glass's page-wide MutationObserver.
    const text = (el, v) => { if (el.textContent !== v) el.textContent = v; };
    const flag = (el, on) => { if (el.disabled !== on) el.disabled = on; };
    text(time, st === 'ready' ? 'Ready' : clock(Math.ceil(left)));
    const base = this.getAttribute('label') || 'Rest';
    text(label, st === 'paused' ? 'Paused' : st === 'idle' ? `${base} · ${clock(this._total)}` : base);
    const p = String(st === 'idle' ? 1 : this._total ? Math.round((left / this._total) * 1000) / 1000 : 0);
    if (bar.style.getPropertyValue('--p') !== p) bar.style.setProperty('--p', p);
    flag(sub, st === 'idle' ? this._left <= 15 : st === 'ready');
    if (this.dataset.state === st) return;
    this.dataset.state = st;
    const playing = st === 'running';
    toggle.innerHTML = playing ? ICONS.pause : ICONS.play;
    // Ready keeps the button (as "start again") so the row never reflows under a thumb.
    toggle.setAttribute('aria-label', playing ? 'Pause' : st === 'paused' ? 'Resume' : st === 'ready' ? 'Start again' : 'Start rest');
    skip.innerHTML = `<span>${st === 'ready' ? 'Dismiss' : 'Skip'}</span>`;
    flag(skip, st === 'idle');
  }
}

/* ======================================================================
 * <og-heatmap weeks="26" unit="min" week-start="1">  el.data = { '2026-10-01': 45, … }
 * ====================================================================== */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

class OgHeatmap extends HTMLElement {
  static get observedAttributes() { return ['weeks', 'week-start', 'unit', 'today', 'less-label', 'more-label']; }

  connectedCallback() {
    if (this._data == null && this.hasAttribute('data-values')) {
      try { this._data = JSON.parse(this.getAttribute('data-values')); } catch { this._data = {}; }
    }
    this.render();
    if (!this._wired) {
      this._wired = true;
      this.addEventListener('click', (e) => {
        const c = e.target.closest('.og-hm__c[data-value]');
        if (c && this.contains(c)) fire(this, 'day', { date: c.dataset.date, value: +c.dataset.value });
      });
    }
  }

  attributeChangedCallback() { if (this.isConnected) this.render(); }

  /** { 'YYYY-MM-DD': number } — minutes, volume, sets, whatever you shade by. */
  get data() { return this._data || {}; }
  set data(v) { this._data = v || {}; if (this.isConnected) this.render(); }

  render() {
    const weeks = Math.max(1, Math.min(104, Math.round(numAttr(this, 'weeks', 26))));
    const ws = numAttr(this, 'week-start', 1) === 0 ? 0 : 1;
    const unit = this.getAttribute('unit') || '';
    const data = this.data;

    // Shade by quartiles of the days that have anything, so one huge day doesn't wash the rest out.
    const vals = Object.values(data).map(Number).filter((v) => v > 0).sort((a, b) => a - b);
    const q = (p) => (vals.length ? vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] : 0);
    const [q1, q2, q3] = [q(0.25), q(0.5), q(0.75)];
    const level = (v) => (!(v > 0) ? 0 : v >= q3 ? 4 : v >= q2 ? 3 : v >= q1 ? 2 : 1);

    const today = this.hasAttribute('today') ? toDate(this.getAttribute('today')) : new Date();
    today.setHours(12, 0, 0, 0);
    const todayKey = isoDay(today);
    const lastStart = new Date(today);
    lastStart.setDate(today.getDate() - ((today.getDay() - ws + 7) % 7));
    const first = new Date(lastStart);
    first.setDate(lastStart.getDate() - (weeks - 1) * 7);

    const months = [];
    const cols = [];
    let active = 0;
    let lastMonth = -1;
    for (let w = 0; w < weeks; w++) {
      const colStart = new Date(first);
      colStart.setDate(first.getDate() + w * 7);
      const m = colStart.getMonth();
      // Label a column when the 1st of a month falls in it; a month already under way at the
      // left edge gets no label. Never on the last column, where the text would overflow.
      const label = m !== lastMonth && colStart.getDate() <= 7 && w < weeks - 1 ? MONTHS[m] : '';
      if (colStart.getDate() <= 7) lastMonth = m;
      months.push(`<span>${label}</span>`);
      let cells = '';
      for (let d = 0; d < 7; d++) {
        const day = new Date(colStart);
        day.setDate(colStart.getDate() + d);
        const key = isoDay(day);
        const v = Number(data[key]) || 0;
        if (v > 0) active++;
        const future = day > today;
        const title = esc(`${key}${v > 0 ? ` · ${v}${unit ? ` ${unit}` : ''}` : ''}`);
        cells += `<i class="og-hm__c" data-l="${level(v)}" data-date="${key}"${v > 0 ? ` data-value="${v}"` : ''}${key === todayKey ? ' data-today' : ''}${future ? ' data-future' : ''} title="${title}"></i>`;
      }
      cols.push(cells);
    }
    const dayLabels = Array.from({ length: 7 }, (_, i) => {
      const dow = (i + ws) % 7;
      return `<span>${dow === 1 || dow === 3 || dow === 5 ? DAYS[dow] : ''}</span>`;
    }).join('');

    const less = esc(this.getAttribute('less-label') || 'Less');
    const more = esc(this.getAttribute('more-label') || 'More');
    this.setAttribute('role', 'img');
    this.setAttribute('aria-label', `${this.getAttribute('label') || 'Activity'}: ${active} active ${active === 1 ? 'day' : 'days'} in the last ${weeks} weeks`);
    this.innerHTML = `
      <div class="og-hm__body">
        <div class="og-hm__days" aria-hidden="true">${dayLabels}</div>
        <div class="og-hm__scroll">
          <div class="og-hm__inner">
            <div class="og-hm__months" aria-hidden="true">${months.join('')}</div>
            <div class="og-hm__grid" aria-hidden="true" style="grid-template-columns:repeat(${weeks}, var(--og-hm-cell))">${cols.map((c) => `<div style="display:contents">${c}</div>`).join('')}</div>
          </div>
        </div>
      </div>
      <div class="og-hm__legend" aria-hidden="true"><span>${less}</span><i class="og-hm__c" data-l="0"></i><i class="og-hm__c" data-l="1"></i><i class="og-hm__c" data-l="2"></i><i class="og-hm__c" data-l="3"></i><i class="og-hm__c" data-l="4"></i><span>${more}</span></div>`;
    // Newest week in view, like a timeline.
    const sc = this.querySelector('.og-hm__scroll');
    requestAnimationFrame(() => { sc.scrollLeft = sc.scrollWidth; });
  }
}

/* ======================================================================
 * <og-line-chart height="160" unit="kg" goal="78">  el.points = [{ x: '2026-09-01', y: 82.4 }, …]
 * ====================================================================== */

const fmtNum = (n) => {
  const a = Math.abs(n);
  return String(Number(n.toFixed(a >= 100 ? 0 : a >= 10 ? 1 : 2)));
};
const fmtDay = (d) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;

class OgLineChart extends HTMLElement {
  static get observedAttributes() { return ['height', 'unit', 'goal', 'invert', 'empty-label']; }

  connectedCallback() {
    if (this._points == null && this.hasAttribute('data-points')) {
      try { this._points = JSON.parse(this.getAttribute('data-points')); } catch { this._points = []; }
    }
    if (!this._wired) this.wire();
    this._ro?.observe(this);
    this.render();
  }

  disconnectedCallback() { this._ro?.disconnect(); }

  attributeChangedCallback() { if (this.isConnected) this.render(); }

  /** [{ x: Date | ms | 'YYYY-MM-DD', y: number, label?: string }] */
  get points() { return this._points || []; }
  set points(v) { this._points = Array.isArray(v) ? v : []; this._hover = null; if (this.isConnected) this.render(); }

  wire() {
    this._wired = true;
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => {
        const w = Math.round(this.clientWidth);
        if (w !== this._w) this.render();
      });
    }
    this.tabIndex = 0;
    const pick = (e) => {
      if (!this._xs?.length) return;
      const r = this.svg.getBoundingClientRect();
      const x = e.clientX - r.left;
      let best = 0;
      this._xs.forEach((px, i) => { if (Math.abs(px - x) < Math.abs(this._xs[best] - x)) best = i; });
      this.focusPoint(best);
    };
    this.addEventListener('pointermove', pick);
    this.addEventListener('pointerdown', pick);
    this.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') this.focusPoint(null); });
    this.addEventListener('blur', () => this.focusPoint(null));
    this.addEventListener('keydown', (e) => {
      const n = this._xs?.length || 0;
      if (!n) return;
      const cur = this._hover ?? (e.key === 'ArrowLeft' ? n : -1);
      let i;
      if (e.key === 'ArrowRight') i = Math.min(n - 1, cur + 1);
      else if (e.key === 'ArrowLeft') i = Math.max(0, cur - 1);
      else if (e.key === 'Home') i = 0;
      else if (e.key === 'End') i = n - 1;
      else if (e.key === 'Escape') i = null;
      else return;
      e.preventDefault();
      this.focusPoint(i, true);
    });
  }

  series() {
    return this.points
      .map((p) => ({ t: toDate(p.x).getTime(), y: Number(p.y), label: p.label }))
      .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.y))
      .sort((a, b) => a.t - b.t);
  }

  render() {
    const W = Math.max(120, Math.round(this.clientWidth - (parseFloat(getComputedStyle(this).paddingLeft) || 0) - (parseFloat(getComputedStyle(this).paddingRight) || 0)) || 320);
    this._w = Math.round(this.clientWidth);
    const H = Math.max(80, numAttr(this, 'height', 160));
    const unit = this.getAttribute('unit') || '';
    const pts = this.series();
    this._pts = pts;
    if (!pts.length) {
      this.innerHTML = `<div class="og-lc__empty">${esc(this.getAttribute('empty-label') || 'No data yet')}</div>`;
      this._xs = [];
      this.setAttribute('aria-label', 'Chart: no data yet');
      return;
    }
    const goal = numAttr(this, 'goal', NaN);
    const invert = this.hasAttribute('invert');
    const P = { l: 36, r: 10, t: 12, b: 22 };
    let lo = Math.min(...pts.map((p) => p.y));
    let hi = Math.max(...pts.map((p) => p.y));
    if (Number.isFinite(goal)) { lo = Math.min(lo, goal); hi = Math.max(hi, goal); }
    if (lo === hi) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.12;
    lo -= pad; hi += pad;
    const t0 = pts[0].t;
    const t1 = pts[pts.length - 1].t;
    const X = (t) => (t1 === t0 ? (P.l + W - P.r) / 2 : P.l + ((t - t0) / (t1 - t0)) * (W - P.l - P.r));
    const Y = (y) => {
      const f = (y - lo) / (hi - lo);
      return P.t + (invert ? f : 1 - f) * (H - P.t - P.b);
    };
    this._xs = pts.map((p) => X(p.t));
    this._ys = pts.map((p) => Y(p.y));

    const ticks = [0, 0.5, 1].map((f) => lo + pad + f * (hi - lo - 2 * pad));
    const grid = ticks.map((v) => {
      const y = Y(v).toFixed(1);
      return `<line class="og-lc__grid" x1="${P.l}" x2="${W - P.r}" y1="${y}" y2="${y}"/><text class="og-lc__axis" x="${P.l - 6}" y="${y}" text-anchor="end" dominant-baseline="middle">${fmtNum(v)}</text>`;
    }).join('');
    const line = this._xs.map((x, i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${this._ys[i].toFixed(1)}`).join(' ');
    const floor = (H - P.b).toFixed(1);
    const area = pts.length > 1 ? `<path class="og-lc__area" d="${line} L${this._xs[this._xs.length - 1].toFixed(1)} ${floor} L${this._xs[0].toFixed(1)} ${floor} Z"/>` : '';
    const dots = pts.length <= 40 ? this._xs.map((x, i) => `<circle class="og-lc__dot" cx="${x.toFixed(1)}" cy="${this._ys[i].toFixed(1)}" r="2.5"/>`).join('') : '';
    const goalLine = Number.isFinite(goal) ? `<line class="og-lc__goal" x1="${P.l}" x2="${W - P.r}" y1="${Y(goal).toFixed(1)}" y2="${Y(goal).toFixed(1)}"/>` : '';
    const xLabels = `<text class="og-lc__axis" x="${P.l}" y="${H - 6}">${fmtDay(new Date(t0))}</text>${t1 !== t0 ? `<text class="og-lc__axis" x="${W - P.r}" y="${H - 6}" text-anchor="end">${fmtDay(new Date(t1))}</text>` : ''}`;

    this.innerHTML = `<svg class="og-lc__svg" xmlns="${SVG_NS}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true">
      ${grid}${goalLine}${area}<path class="og-lc__line" d="${line}"/>${dots}
      <line class="og-lc__cursor" y1="${P.t}" y2="${floor}" visibility="hidden"/>
      <circle class="og-lc__focus" r="5" visibility="hidden"/>${xLabels}
    </svg><div class="og-lc__tip" hidden></div>`;
    this.svg = this.querySelector('svg');
    const first = pts[0].y;
    const last = pts[pts.length - 1].y;
    const u = unit ? ` ${unit}` : '';
    this.setAttribute('role', 'img');
    this.setAttribute('aria-label', `${this.getAttribute('label') || 'Chart'}: ${pts.length} ${pts.length === 1 ? 'point' : 'points'}, from ${fmtNum(first)}${u} to ${fmtNum(last)}${u}. Use the arrow keys to read each point.`);
    if (this._hover != null) { const i = Math.min(this._hover, pts.length - 1); this._hover = null; this.focusPoint(i); }
  }

  focusPoint(i, announce = false) {
    const changed = i !== this._hover;
    this._hover = i;
    const svg = this.svg;
    if (!svg) return;
    const cursor = svg.querySelector('.og-lc__cursor');
    const dot = svg.querySelector('.og-lc__focus');
    const tip = this.querySelector('.og-lc__tip');
    if (i == null || !this._pts[i]) {
      cursor.setAttribute('visibility', 'hidden');
      dot.setAttribute('visibility', 'hidden');
      tip.hidden = true;
      return;
    }
    const x = this._xs[i];
    const y = this._ys[i];
    const p = this._pts[i];
    cursor.setAttribute('x1', x); cursor.setAttribute('x2', x);
    cursor.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', x); dot.setAttribute('cy', y);
    dot.setAttribute('visibility', 'visible');
    const unit = this.getAttribute('unit') || '';
    tip.textContent = `${fmtDay(new Date(p.t))} · ${fmtNum(p.y)}${unit ? ` ${unit}` : ''}${p.label ? ` · ${p.label}` : ''}`;
    tip.hidden = false;
    // Read out keyboard moves; pointer hovers would chatter.
    tip.setAttribute('aria-live', announce ? 'polite' : 'off');
    // Keep the readout inside the chart, and below the point when the point sits near the top.
    const offX = svg.offsetLeft;
    const offY = svg.offsetTop;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const cw = this.clientWidth;
    tip.style.left = `${Math.max(4, Math.min(cw - tw - 4, offX + x - tw / 2))}px`;
    tip.style.top = `${y + offY < th + 16 ? offY + y + 12 : offY + y - th - 10}px`;
    if (changed) fire(this, 'point', { index: i, x: new Date(p.t), y: p.y });
  }
}

/* ======================================================================
 * <og-swipe-row>…row content…</og-swipe-row>
 *   Swipe left for delete, right for copy (omit with `no-copy`).
 *   Fires cancelable `swipe-delete` / `swipe-copy` events. An uncancelled delete
 *   collapses and removes the row.
 * ====================================================================== */

const SWIPE_OPEN = 84;

class OgSwipeRow extends HTMLElement {
  connectedCallback() {
    if (this._built) return;
    this._built = true;
    const front = document.createElement('div');
    front.className = 'og-swipe__front';
    front.tabIndex = 0;
    while (this.firstChild) front.appendChild(this.firstChild);
    this.front = front;
    this.del = this.pane('delete', this.getAttribute('delete-label') || 'Delete', ICONS.trash);
    if (!this.hasAttribute('no-copy')) this.copy = this.pane('copy', this.getAttribute('copy-label') || 'Copy', ICONS.copy);
    this.append(...[this.copy, this.del].filter(Boolean).map((p) => p.pane), front);
    front.setAttribute('aria-keyshortcuts', this.copy ? 'ArrowLeft ArrowRight Escape' : 'ArrowLeft Escape');
    if (!front.hasAttribute('aria-label')) {
      const hint = this.copy ? 'Arrow left to delete, arrow right to copy' : 'Arrow left to delete';
      front.setAttribute('aria-description', hint);
    }
    this.x = 0;
    this.close(false);

    front.addEventListener('pointerdown', (e) => this.down(e));
    front.addEventListener('pointermove', (e) => this.move(e));
    front.addEventListener('pointerup', (e) => this.up(e));
    front.addEventListener('pointercancel', () => this.cancel());
    front.addEventListener('keydown', (e) => {
      if (e.target !== front) return;
      if (e.key === 'ArrowLeft') this.open('delete', true);
      else if (e.key === 'ArrowRight' && this.copy) this.open('copy', true);
      else if (e.key === 'Escape') this.close(true);
      else return;
      e.preventDefault();
    });
    this.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.side) { this.close(true); this.front.focus(); }
    });
    // A tap on the open row closes it rather than activating what's under it.
    front.addEventListener('click', (e) => {
      // The click that ends a drag belongs to the drag.
      if (this._suppressClick) { e.preventDefault(); e.stopPropagation(); this._suppressClick = false; return; }
      if (this.side) { e.preventDefault(); e.stopPropagation(); this.close(true); }
    }, true);
  }

  pane(kind, label, svg) {
    const pane = document.createElement('div');
    pane.className = `og-swipe__pane og-swipe__pane--${kind}`;
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = svg;
    const text = document.createElement('span');
    text.textContent = label;
    b.appendChild(text);
    b.addEventListener('click', () => this.commit(kind));
    pane.appendChild(b);
    return { pane, button: b };
  }

  setX(x, animate) {
    this.x = x;
    this.toggleAttribute('data-dragging', !animate);
    this.front.style.transform = x ? `translateX(${x}px)` : '';
    if (this.del) this.del.pane.style.width = `${Math.max(0, -x)}px`;
    if (this.copy) this.copy.pane.style.width = `${Math.max(0, x)}px`;
    if (!animate) return;
    const tr = reducedMotion() ? '' : 'width 0.28s cubic-bezier(0.25, 0.8, 0.25, 1)';
    [this.del, this.copy].forEach((p) => { if (p) p.pane.style.transition = tr; });
  }

  /** Show one side's action. */
  open(kind, focus) {
    if (kind === 'copy' && !this.copy) return;
    this.side = kind;
    this.setX(kind === 'delete' ? -SWIPE_OPEN : SWIPE_OPEN, true);
    this.setInert();
    if (focus) (kind === 'delete' ? this.del : this.copy).button.focus();
  }

  close(animate = true) {
    this.side = null;
    this.setX(0, animate);
    this.setInert();
  }

  /** Hidden actions stay out of the tab order and the accessibility tree. */
  setInert() {
    [['delete', this.del], ['copy', this.copy]].forEach(([k, p]) => {
      if (!p) return;
      const shut = this.side !== k;
      p.pane.inert = shut;
      p.pane.toggleAttribute('aria-hidden', shut);
    });
  }

  down(e) {
    if (e.button !== 0 || e.target.closest('input, select, textarea, og-stepper, [data-swipe-ignore]')) return;
    this.drag = { x0: e.clientX, y0: e.clientY, base: this.x, id: e.pointerId, active: false };
  }

  move(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.active) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { this.drag = null; return; } // a scroll
      if (Math.abs(dx) < 8) return;
      d.active = true;
      this.front.setPointerCapture?.(d.id);
    }
    let x = d.base + dx;
    if (!this.copy && x > 0) x = 0;
    // Rubber band past the commit distance.
    const w = this.offsetWidth;
    const limit = w * 0.7;
    if (Math.abs(x) > limit) x = Math.sign(x) * (limit + (Math.abs(x) - limit) * 0.3);
    this.setX(x, false);
  }

  up(e) {
    const d = this.drag;
    this.drag = null;
    if (!d || !d.active) return;
    if (e) this._suppressClick = true;
    const w = this.offsetWidth;
    const x = this.x;
    if (x < -w * 0.5) this.commit('delete');
    else if (x > w * 0.5 && this.copy) this.commit('copy');
    else if (x < -SWIPE_OPEN / 2) this.open('delete');
    else if (x > SWIPE_OPEN / 2 && this.copy) this.open('copy');
    else this.close(true);
    setTimeout(() => { this._suppressClick = false; }, 0);
  }

  cancel() {
    this.drag = null;
    this.close(true);
  }

  commit(kind) {
    const ok = fire(this, `swipe-${kind}`, {});
    if (kind === 'copy' || !ok) {
      this.close(true);
      if (ok) this.flash();
      this.front.focus({ preventScroll: true });
      return;
    }
    // Delete: collapse the row, then remove it.
    const h = this.offsetHeight;
    this.style.height = `${h}px`;
    this.setX(-this.offsetWidth, true);
    const done = () => this.remove();
    if (reducedMotion()) { done(); return; }
    requestAnimationFrame(() => {
      this.setAttribute('data-leaving', '');
      this.style.height = '0px';
      this.style.marginBlock = '0px';
      setTimeout(done, 260);
    });
  }

  flash() {
    this.removeAttribute('data-flash');
    void this.offsetWidth;
    this.setAttribute('data-flash', '');
    setTimeout(() => this.removeAttribute('data-flash'), 600);
  }
}

/* ======================================================================
 * <og-wheel min="0" max="600" step="15" value="90" format="duration" label="Rest">
 * ====================================================================== */

class OgWheel extends HTMLElement {
  static get observedAttributes() { return ['min', 'max', 'step', 'value', 'format', 'unit']; }

  connectedCallback() {
    if (!this._built) this.build();
    this.populate();
  }

  disconnectedCallback() {
    cancelAnimationFrame(this._raf);
    clearTimeout(this._settle);
  }

  attributeChangedCallback(name) {
    if (!this._built || !this.isConnected) return;
    if (name === 'value') { if (!this._reflecting) this.scrollToIndex(this.indexOf(this.value), false); return; }
    this.populate();
  }

  get min() { return numAttr(this, 'min', 0); }
  get max() { return Math.max(this.min, numAttr(this, 'max', 100)); }
  get step() { const s = numAttr(this, 'step', 1); return s > 0 ? s : 1; }
  get count() { return Math.min(2000, Math.floor((this.max - this.min) / this.step + 1e-9) + 1); }
  valueAt(i) { return Number((this.min + i * this.step).toFixed(decimalsOf(this.step))); }
  indexOf(v) { return Math.max(0, Math.min(this.count - 1, Math.round((v - this.min) / this.step))); }

  get value() { return this.valueAt(this.indexOf(numAttr(this, 'value', this.min))); }
  set value(v) { const n = parseNumber(v); if (Number.isFinite(n)) this.setAttribute('value', String(this.valueAt(this.indexOf(n)))); }

  format(v) {
    const f = this.getAttribute('format');
    if (f === 'duration') return clock(v);
    const unit = this.getAttribute('unit');
    return unit ? `${v} ${unit}` : String(v);
  }

  build() {
    this._built = true;
    this.innerHTML = '<div class="og-wheel__band" aria-hidden="true"></div><div class="og-wheel__scroll" aria-hidden="true"></div>';
    this.scroller = this.querySelector('.og-wheel__scroll');
    this.setAttribute('role', 'spinbutton');
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
    if (this.getAttribute('label') && !this.hasAttribute('aria-label')) this.setAttribute('aria-label', this.getAttribute('label'));
    this.scroller.addEventListener('scroll', () => {
      cancelAnimationFrame(this._raf);
      this._raf = requestAnimationFrame(() => this.paint());
      clearTimeout(this._settle);
      this._settle = setTimeout(() => this.settle(), 120);
    }, { passive: true });
    this.scroller.addEventListener('click', (e) => {
      const it = e.target.closest('.og-wheel__item');
      if (it) this.scrollToIndex(+it.dataset.i, true);
    });
    this.addEventListener('keydown', (e) => {
      const i = this.indexOf(this.value);
      const map = { ArrowUp: i - 1, ArrowDown: i + 1, PageUp: i - 5, PageDown: i + 5, Home: 0, End: this.count - 1 };
      if (!(e.key in map)) return;
      e.preventDefault();
      const next = Math.max(0, Math.min(this.count - 1, map[e.key]));
      this.commit(next);
      this.scrollToIndex(next, true);
    });
  }

  populate() {
    const n = this.count;
    let html = '<div class="og-wheel__pad"></div>';
    for (let i = 0; i < n; i++) html += `<div class="og-wheel__item" data-i="${i}">${esc(this.format(this.valueAt(i)))}</div>`;
    html += '<div class="og-wheel__pad"></div>';
    this.scroller.innerHTML = html;
    this.items = [...this.scroller.querySelectorAll('.og-wheel__item')];
    this.updateAria();
    requestAnimationFrame(() => this.scrollToIndex(this.indexOf(this.value), false));
  }

  itemHeight() { return this.items[0]?.offsetHeight || 38; }

  scrollToIndex(i, smooth) {
    const top = i * this.itemHeight();
    this.scroller.scrollTo({ top, behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' });
    this.paint();
  }

  /** Fade and shrink items by their distance from the centre band. */
  paint() {
    const h = this.itemHeight();
    const center = this.scroller.scrollTop / h;
    const near = Math.round(center);
    for (let i = Math.max(0, near - 4); i <= Math.min(this.items.length - 1, near + 4); i++) {
      const d = Math.min(3, Math.abs(i - center));
      const it = this.items[i];
      it.style.opacity = String(1 - d * 0.28);
      it.style.transform = `scale(${1 - d * 0.08})`;
      it.setAttribute('aria-selected', String(i === near));
    }
  }

  settle() {
    const i = Math.max(0, Math.min(this.count - 1, Math.round(this.scroller.scrollTop / this.itemHeight())));
    this.commit(i);
  }

  commit(i) {
    const v = this.valueAt(i);
    if (v === this.value && this.hasAttribute('value')) { this.updateAria(); return; }
    this._reflecting = true;
    this.setAttribute('value', String(v));
    this._reflecting = false;
    this.updateAria();
    fire(this, 'input', { value: v });
    fire(this, 'change', { value: v });
  }

  updateAria() {
    const v = this.value;
    this.setAttribute('aria-valuenow', String(v));
    this.setAttribute('aria-valuemin', String(this.min));
    this.setAttribute('aria-valuemax', String(this.valueAt(this.count - 1)));
    const f = this.getAttribute('format');
    this.setAttribute('aria-valuetext', f === 'duration' ? `${Math.floor(v / 60)} min ${v % 60} s` : this.format(v));
  }
}

/* ======================================================================
 * <og-elapsed start="2026-10-07T18:30:00"> → "12:34", ticking every second
 * ====================================================================== */

class OgElapsed extends HTMLElement {
  static get observedAttributes() { return ['start']; }
  connectedCallback() {
    if (!Number.isFinite(this._start)) {
      const t = this.hasAttribute('start') ? toDate(this.getAttribute('start')).getTime() : NaN;
      this._start = Number.isFinite(t) ? t : Date.now(); // a bad start counts from now, never NaN:NaN
    }
    this.tick();
    clearInterval(this._iv);
    this._iv = setInterval(() => this.tick(), 1000);
  }
  disconnectedCallback() { clearInterval(this._iv); }
  attributeChangedCallback() {
    const t = this.hasAttribute('start') ? toDate(this.getAttribute('start')).getTime() : NaN;
    if (Number.isFinite(t)) { this._start = t; this.tick(); }
  }
  /** Restart from now (or from a given time). */
  restart(start = Date.now()) {
    const t = toDate(start).getTime();
    this._start = Number.isFinite(t) ? t : Date.now();
    this.tick();
  }
  tick() {
    const s = Math.max(0, Math.floor((Date.now() - this._start) / 1000));
    const h = Math.floor(s / 3600);
    this.textContent = h ? `${h}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : clock(s);
  }
}

/* ---------------- Register ---------------- */

function define(name, cls) {
  if (!customElements.get(name)) customElements.define(name, cls);
}

let started = false;
/** Register the elements and start slider syncing. Runs automatically on import. */
export function init() {
  if (started || typeof window === 'undefined') return;
  started = true;
  define('og-stepper', OgStepper);
  define('og-rest-timer', OgRestTimer);
  define('og-heatmap', OgHeatmap);
  define('og-line-chart', OgLineChart);
  define('og-swipe-row', OgSwipeRow);
  define('og-wheel', OgWheel);
  define('og-elapsed', OgElapsed);
  document.addEventListener('input', (e) => {
    if (e.target.matches?.('input.og-slider')) updateSlider(e.target);
  });
  onReady(() => {
    syncSliders(document.body);
    new MutationObserver((records) => {
      for (const r of records) r.addedNodes.forEach((n) => syncSliders(n));
    }).observe(document.body, { childList: true, subtree: true });
  });
}

init();

const Gym = { init, updateSlider };
if (typeof window !== 'undefined') window.Gym = Gym;
export default Gym;
