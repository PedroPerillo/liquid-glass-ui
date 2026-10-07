# liquid-glass-ui

**Live site: [liquid-glass-ui-ruby.vercel.app](https://liquid-glass-ui-ruby.vercel.app)**

Apple-style Liquid Glass components for the web, plus two companion collections:

| Collection | Files | Demo |
| --- | --- | --- |
| **Liquid Glass** | `liquid-glass.css` + `liquid-glass.js` | [`demo/index.html`](demo/index.html) |
| **Liquid Metal** | `liquid-metal.css` + optional `liquid-metal.js` | [`demo/metal.html`](demo/metal.html) |
| **Gradients** | `gradients.css` (no JS) | [`demo/gradients.html`](demo/gradients.html) |

Every demo page has a controls panel at the top to tune the look live and copy the code for your settings, and every snippet has a Copy button.

Each one works on its own, and they're designed to be used together.

## Liquid Glass

A floating tab bar plus a matching set of components, with real edge refraction in Chromium and graceful fallbacks everywhere else.

- **Chromium** (Chrome, Edge, Arc, Brave): real refraction. Each surface gets its own SVG displacement map, sized to it, used as a `backdrop-filter`.
- **Safari / Firefox**: frosted glass (blur + saturate). Safari can't apply SVG filters to the backdrop yet.
- **Reduce Transparency**: solid surfaces, automatically.
- **No build step, no framework.** One CSS file, one ES module. Works in plain HTML, React, Vue, Svelte, whatever.

**Demo:** [`demo/index.html`](demo/index.html) (all glass components, with live controls) or [`demo/preview.html`](demo/preview.html) (the original tab bar prototype).

## Quick start

```html
<link rel="stylesheet" href="src/liquid-glass.css">
<script type="module" src="src/liquid-glass.js"></script>

<lg-tab-bar floating>
  <button data-value="home"><svg>…</svg>Home</button>
  <button data-value="budget"><svg>…</svg>Budget</button>
  <button data-value="me"><svg>…</svg>Me</button>
</lg-tab-bar>
```

Or from a CDN, straight from this repo:

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/PedroPerillo/liquid-glass-ui@main/src/liquid-glass.css">
<script type="module" src="https://cdn.jsdelivr.net/gh/PedroPerillo/liquid-glass-ui@main/src/liquid-glass.js"></script>
<!-- same pattern for liquid-metal.css, liquid-metal.js and gradients.css -->
```

Any element with the `lg` class becomes a glass surface, including ones added later.

## Components

| Component | Markup | Notes |
| --- | --- | --- |
| Tab bar | `<lg-tab-bar floating>` + `<button>` children | Sliding spring indicator, arrow keys, `change` event. `floating` pins it to the bottom with safe-area padding. |
| Segmented control | `<lg-segmented value="month">` + `<button data-value>` | Radio-group semantics, `value` attribute in and out. |
| Toolbar | `<nav class="lg lg-toolbar" data-sticky>` | Capsule top bar. Title goes in `.lg-toolbar__title`. |
| Button | `<button class="lg lg-button">` | Add `lg-button--accent` for the tinted version. |
| Icon button | `<button class="lg lg-icon-button">` | 44px round, for toolbars. |
| Floating action button | `<button class="lg lg-fab">` | Sits above a floating tab bar. |
| Chip | `<button class="lg lg-chip" aria-pressed="false">` | Toggle filters. |
| Search field | `<label class="lg lg-search"><svg/><input></label>` | 16px text so iOS doesn't zoom on focus. |
| Switch | `<input type="checkbox" class="lg-switch">` | Native checkbox, iOS 26 stretchy thumb. |
| Card | `<div class="lg lg-card">` | Glass panel for summaries and widgets. |
| Sheet | `<dialog class="lg lg-sheet">` | Native dialog. Bottom sheet on phones, centered on desktop. Open with `data-lg-open="#id"`, close with `data-lg-close`. |
| Toast | `toast('Saved')` | Drops in from the top, announced to screen readers. |

## JavaScript API

```js
import LiquidGlass, { setMode, configure, toast, openSheet, supportsRefraction } from './src/liquid-glass.js';

setMode('liquid');         // 'liquid' | 'frost' | 'flat'
configure({ blur: 10, refraction: 1 });  // page-wide defaults; refraction is a multiplier (0 = off)
toast('Expense added', { duration: 2500, icon: '<svg>…</svg>' });
openSheet('#addSheet');
LiquidGlass.attach(el);    // manual attach (usually automatic via .lg)
LiquidGlass.refresh();     // re-render all surfaces
```

Listen for selection changes:

```js
document.querySelector('lg-tab-bar').addEventListener('change', (e) => {
  console.log(e.detail.index, e.detail.value);
});
```

### Per-element tuning

```html
<div class="lg lg-card" data-lg-bend="30" data-lg-blur="16">…</div>
```

- `data-lg-bend`: refraction strength (default scales with the element's height, max 60)
- `data-lg-blur`: blur in px (default 10)

## Theming

Everything is driven by CSS variables. Override them on `:root` or any container:

```css
:root {
  --lg-accent: #ff375f;
  --lg-tint: rgba(255, 255, 255, 0.22);
  --lg-font: "Your Font", system-ui, sans-serif;
}
```

Light and dark follow `prefers-color-scheme`, and `data-theme="light|dark"` on `<html>` overrides it.

## Using with React

Custom elements work directly in React 19:

```jsx
import 'liquid-glass-ui/style.css';
import 'liquid-glass-ui';
// also available: 'liquid-glass-ui/metal', 'liquid-glass-ui/metal.css', 'liquid-glass-ui/gradients.css'

export function TabBar({ onChange }) {
  return (
    <lg-tab-bar floating onchange={(e) => onChange(e.detail.value)}>
      <button data-value="home">Home</button>
      <button data-value="budget">Budget</button>
    </lg-tab-bar>
  );
}
```

On React 18, attach the listener with a ref and `addEventListener('change', …)`.

## Liquid Metal

Chrome components whose rim flows like liquid metal. The rim is a rotating conic gradient pushed through an SVG noise filter. There's no WebGL, so unlike shader-based metal buttons you can have as many as you want on a page, and rims pause while offscreen.

```html
<link rel="stylesheet" href="src/liquid-metal.css">
<script type="module" src="src/liquid-metal.js"></script>  <!-- optional: liquid flow, pointer light, ripples -->

<button class="lm lm-button">Get started</button>
```

| Component | Markup |
| --- | --- |
| Button | `<button class="lm lm-button">` (`lm-button--sm`, `lm-button--lg`) |
| Icon button | `<button class="lm lm-icon-button" aria-label="…">` |
| Chip | `<button class="lm lm-chip" aria-pressed="false">` |
| Card | `<div class="lm lm-card">` |
| Ring (avatars, icons) | `<span class="lm lm-ring" style="width:64px;height:64px"><img …></span>` |
| Switch | `<input type="checkbox" class="lm-switch">` |
| Slider | `<input type="range" class="lm-slider">` |
| Progress | `<div class="lm-progress" role="progressbar"><i style="--value:64%"></i></div>` |
| Text | `<h1 class="lm-text">` (`lm-text--dark` on light backgrounds) |

Variants: `lm--gold` (gold instead of chrome), `lm--light` (silver core for light pages), `lm--still` (no animation, good for long lists). Variants also work on a container, so `<section class="lm--gold">` turns everything inside gold.

Tuning:

```css
:root {
  --lm-speed-scale: 0.5;  /* lower = faster spin */
  --lm-rim-scale: 1.5;    /* thicker rims */
}
```

```js
import { setFlow } from 'liquid-glass-ui/metal';
setFlow(30); // ripple strength, default 22, 0 = none
```

Without the JS you still get animated chrome rims; the JS adds the liquid wobble, a highlight that follows the pointer, click ripples and the slider fill.

## Gradients

Mesh gradient backgrounds made from layered radial gradients. Pure CSS, crisp at any size. **Dusk** is the balance card from the original prototype.

```html
<link rel="stylesheet" href="src/gradients.css">

<div class="grad-dusk grad-card">
  <small>Left to spend this month</small>
  <strong>$1,284.60</strong>
</div>
```

Presets: `grad-dusk`, `grad-mint`, `grad-lagoon`, `grad-citrus`, `grad-orchid`, `grad-ember`, `grad-midnight`, `grad-cotton`, `grad-prism`. Each sets `--grad-fg` and `--grad-fg-muted` so text on top stays readable.

Modifiers: `grad--animate` (slow drifting light), `grad--grain` (film grain, uses `::after`), `grad-text` (clip the gradient to text), `grad-card` (ready-made balance card layout).

## Gotchas

- Glass only looks like glass over something interesting. Put it over images, gradients or scrolling content, not a flat background.
- Safari needs the `-webkit-` prefix and ignores CSS variables inside `-webkit-backdrop-filter`. The library sets backdrop filters inline for this reason.
- Each refractive surface costs one SVG filter. Dozens are fine; hundreds in a long list are not. Use `class="lg"` on chrome (bars, sheets, cards), not on every row.

## Run locally

```bash
npm run dev   # serves the repo at http://localhost:5173/demo/
```

Deployed on Vercel from `main`: every push redeploys [liquid-glass-ui-ruby.vercel.app](https://liquid-glass-ui-ruby.vercel.app).

## License

MIT
