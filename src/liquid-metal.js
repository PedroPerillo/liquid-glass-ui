/**
 * liquid-metal (part of liquid-glass-ui)
 *
 * Optional enhancer for liquid-metal.css:
 * - adds the SVG noise filter that makes the rim flow like liquid
 * - moves the core highlight toward the pointer
 * - click ripples on buttons and chips
 * - fills .lm-slider tracks as they move
 * - pauses rim animations while offscreen
 *
 * Usage:
 *   <link rel="stylesheet" href="src/liquid-metal.css">
 *   <script type="module" src="src/liquid-metal.js"></script>
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
const reduceMotion = typeof matchMedia !== 'undefined'
  ? matchMedia('(prefers-reduced-motion: reduce)')
  : { matches: false };

let ready = false;
let io = null;

function injectFilter() {
  if (document.getElementById('lm-flow')) return;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
  // Static noise displaces the spinning gradient, so the reflections wobble like liquid.
  svg.innerHTML = `
    <filter id="lm-flow" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.014 0.04" numOctaves="2" seed="7" result="noise"/>
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="22" xChannelSelector="R" yChannelSelector="G"/>
    </filter>`;
  document.body.appendChild(svg);
}

/* ---------- Pointer highlight ---------- */
let pending = null;
let frameQueued = false;
function onPointerMove(e) {
  const el = e.target.closest && e.target.closest('.lm');
  if (!el) return;
  pending = { el, x: e.clientX, y: e.clientY };
  if (frameQueued) return;
  frameQueued = true;
  requestAnimationFrame(() => {
    frameQueued = false;
    if (!pending) return;
    const r = pending.el.getBoundingClientRect();
    pending.el.style.setProperty('--lm-x', `${((pending.x - r.left) / r.width) * 100}%`);
    pending.el.style.setProperty('--lm-y', `${((pending.y - r.top) / r.height) * 100}%`);
    pending = null;
  });
}
function onPointerOut(e) {
  const el = e.target.closest && e.target.closest('.lm');
  if (el && !el.contains(e.relatedTarget)) {
    el.style.removeProperty('--lm-x');
    el.style.removeProperty('--lm-y');
  }
}

/* ---------- Ripple ---------- */
function onPointerDown(e) {
  if (reduceMotion.matches) return;
  const el = e.target.closest && e.target.closest('.lm-button, .lm-icon-button, .lm-chip');
  if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
  const r = el.getBoundingClientRect();
  const dot = document.createElement('span');
  dot.className = 'lm-ripple';
  dot.setAttribute('aria-hidden', 'true');
  dot.style.left = `${e.clientX - r.left}px`;
  dot.style.top = `${e.clientY - r.top}px`;
  el.appendChild(dot);
  dot.addEventListener('animationend', () => dot.remove(), { once: true });
  setTimeout(() => dot.remove(), 900);
}

/* ---------- Slider fill ---------- */
function paintSlider(input) {
  const min = +input.min || 0;
  const max = input.max === '' ? 100 : +input.max;
  const pct = max > min ? ((+input.value - min) / (max - min)) * 100 : 0;
  input.style.setProperty('--lm-val', `${pct}%`);
}
function onInput(e) {
  if (e.target.classList && e.target.classList.contains('lm-slider')) paintSlider(e.target);
}

/* ---------- Offscreen pause ---------- */
function watch(root) {
  if (root.nodeType !== 1) return;
  const els = root.matches('.lm') ? [root] : [];
  els.push(...root.querySelectorAll('.lm'));
  if (io) els.forEach((el) => io.observe(el));
  const sliders = root.matches('.lm-slider') ? [root] : [];
  sliders.push(...root.querySelectorAll('.lm-slider'));
  sliders.forEach(paintSlider);
}

/** Set up liquid metal. Runs automatically when the module loads. */
export function init() {
  if (ready || typeof document === 'undefined') return;
  ready = true;
  injectFilter();
  document.documentElement.dataset.lmReady = '';
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) delete en.target.dataset.lmOffscreen;
        else en.target.dataset.lmOffscreen = '';
      });
    });
  }
  document.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerout', onPointerOut, { passive: true });
  document.addEventListener('pointerdown', onPointerDown, { passive: true });
  document.addEventListener('input', onInput);
  watch(document.body);
  new MutationObserver((records) => {
    for (const r of records) r.addedNodes.forEach((n) => { if (n.nodeType === 1) watch(n); });
  }).observe(document.body, { childList: true, subtree: true });
}

/**
 * Set how strongly the rim ripples (SVG displacement scale). Default 22, 0 = no ripple.
 */
export function setFlow(scale) {
  if (typeof document === 'undefined') return;
  const map = document.querySelector('#lm-flow feDisplacementMap');
  if (map && scale >= 0) map.setAttribute('scale', String(scale));
}

/** Re-sync a slider's fill after setting its value from code. */
export function updateSlider(input) {
  paintSlider(input);
}

if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}

const LiquidMetal = { init, setFlow, updateSlider };
if (typeof window !== 'undefined') window.LiquidMetal = LiquidMetal;
export default LiquidMetal;
