// Shared helpers for the demo pages (not part of the library).

/** Copy text, falling back to selecting it if the clipboard is blocked. */
export async function copyText(text, selectEl) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (selectEl) {
      const r = document.createRange();
      r.selectNodeContents(selectEl);
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(r);
    }
    return false;
  }
}

function flash(btn, ok) {
  btn.textContent = ok ? 'Copied' : 'Press ⌘C';
  clearTimeout(btn._t);
  btn._t = setTimeout(() => { btn.textContent = 'Copy'; }, 1600);
}

/** Give every code block on the page a Copy button. */
export function addCopyButtons(root = document) {
  root.querySelectorAll('pre:not([data-copy-ready])').forEach((pre) => {
    pre.dataset.copyReady = '';
    let wrap = pre.parentElement;
    if (!wrap.classList.contains('code-wrap')) {
      wrap = document.createElement('div');
      wrap.className = 'code-wrap';
      pre.replaceWith(wrap);
      wrap.appendChild(pre);
    }
    if (wrap.querySelector('.copy-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-btn';
    btn.textContent = 'Copy';
    btn.setAttribute('aria-label', 'Copy code');
    btn.addEventListener('click', async () => flash(btn, await copyText(pre.innerText.trim(), pre)));
    wrap.appendChild(btn);
  });
}

/** Wire a simple pressed-state segmented control (.seg). Calls onChange(value). */
export function bindSeg(seg, onChange) {
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-value]');
    if (!b) return;
    seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    onChange(b.dataset.value);
  });
}

/** Collapse/expand a controls panel. */
export function bindCollapse(panel) {
  const btn = panel.querySelector('[data-collapse]');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const collapsed = panel.toggleAttribute('data-collapsed');
    btn.textContent = collapsed ? 'Show' : 'Hide';
    btn.setAttribute('aria-expanded', String(!collapsed));
  });
}

addCopyButtons();
