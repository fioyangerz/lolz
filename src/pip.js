// The reference tile (picture-in-picture): drag to move, size + see-through sliders,
// double-click to reset. Remembered per browser.
//
// Position is stored as fractions of the free space (fx, fy in 0..1), so the tile stays in
// the same relative spot (e.g. top-right) when the stage resizes for focus mode or rotation.

const KEY = 'dougie-coach.pip.v1';
const INSET = 12; // px gap from the stage edge
const SNAP = 24; // px: drop this close to an edge and it sticks to it
const DEFAULTS = { fx: 0.5, fy: 0, scale: 1, opacity: 1 };
const LIMITS = { scale: [0.75, 2.5], opacity: [0.2, 1], fx: [0, 1], fy: [0, 1] };

const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    const out = { ...DEFAULTS };
    for (const k of Object.keys(DEFAULTS)) {
      if (Number.isFinite(saved[k])) out[k] = clamp(saved[k], LIMITS[k]);
    }
    return out;
  } catch {
    return { ...DEFAULTS };
  }
}

function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage blocked: fine */ }
}

/**
 * @param {{pip:HTMLElement, area:HTMLElement, scaleInputs:HTMLInputElement[],
 *          opacityInputs:HTMLInputElement[], resetButton?:HTMLElement}} o
 */
export function initPip({ pip, area, scaleInputs, opacityInputs, resetButton }) {
  const state = load();

  const free = () => ({
    x: Math.max(0, area.clientWidth - pip.offsetWidth - 2 * INSET),
    y: Math.max(0, area.clientHeight - pip.offsetHeight - 2 * INSET),
  });

  function apply() {
    pip.style.setProperty('--pip-scale', String(state.scale));
    pip.style.opacity = String(state.opacity);
    const f = free(); // measured after the new scale is applied
    pip.style.left = `${INSET + state.fx * f.x}px`;
    pip.style.top = `${INSET + state.fy * f.y}px`;
    for (const i of scaleInputs) i.value = String(state.scale);
    for (const i of opacityInputs) i.value = String(state.opacity);
  }

  function set(patch) {
    for (const [k, v] of Object.entries(patch)) state[k] = clamp(Number(v), LIMITS[k]);
    apply();
    save(state);
  }

  // ---- dragging ----
  let drag = null;
  pip.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, left: pip.offsetLeft, top: pip.offsetTop, moved: false, id: e.pointerId };
    pip.setPointerCapture(e.pointerId);
  });
  pip.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return; // a tap, not a drag
    drag.moved = true;
    pip.classList.add('dragging');
    const f = free();
    pip.style.left = `${clamp(drag.left + dx, [INSET, INSET + f.x])}px`;
    pip.style.top = `${clamp(drag.top + dy, [INSET, INSET + f.y])}px`;
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = drag.moved;
    drag = null;
    pip.classList.remove('dragging');
    if (!moved) return;
    const f = free();
    const x = pip.offsetLeft - INSET, y = pip.offsetTop - INSET;
    const snap = (pos, span) => (pos < SNAP ? 0 : span - pos < SNAP ? 1 : span ? pos / span : 0.5);
    set({ fx: snap(x, f.x), fy: snap(y, f.y) });
  };
  pip.addEventListener('pointerup', endDrag);
  pip.addEventListener('pointercancel', endDrag);

  // double-click / double-tap: back to top-center
  pip.addEventListener('dblclick', () => set({ fx: DEFAULTS.fx, fy: DEFAULTS.fy }));

  // ---- sliders ----
  for (const i of scaleInputs) i.addEventListener('input', () => set({ scale: i.value }));
  for (const i of opacityInputs) i.addEventListener('input', () => set({ opacity: i.value }));
  resetButton?.addEventListener('click', () => set({ ...DEFAULTS }));

  // keep it in place when the stage resizes (focus mode, window resize, rotation)
  new ResizeObserver(() => apply()).observe(area);
  apply();

  return { apply, set, get state() { return { ...state }; } };
}
