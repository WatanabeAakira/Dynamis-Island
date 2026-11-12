// Slider kustom: tarik, klik, roda mouse, dan tombol panah. Nilai 0..1 disimpan di CSS variable --v.

const clamp = (v) => Math.min(1, Math.max(0, v));
export const valueFromX = (x, left, width) => (width > 0 ? clamp((x - left) / width) : 0);

export function makeSlider(el, { onInput, onCommit, step = 0.02, minGap = 40 } = {}) {
  let drag = false, value = 0, lastSend = 0, pending = null, timer = 0, wheelTimer = 0, lastUser = -Infinity; // belum pernah disentuh
  el.setAttribute('role', 'slider');
  el.setAttribute('aria-valuemin', '0');
  el.setAttribute('aria-valuemax', '100');
  el.tabIndex = 0;

  const paint = (v) => { value = v; el.style.setProperty('--v', v); el.setAttribute('aria-valuenow', Math.round(v * 100)); };

  // Kirim perubahan paling cepat tiap minGap ms; nilai terakhir selalu terkirim
  const send = (v) => {
    lastUser = performance.now();
    const now = performance.now();
    if (now - lastSend >= minGap) { lastSend = now; pending = null; if (onInput) onInput(v); return; }
    pending = v;
    if (!timer) timer = setTimeout(() => { timer = 0; if (pending != null) { lastSend = performance.now(); const p = pending; pending = null; if (onInput) onInput(p); } }, minGap);
  };
  const finish = () => {
    clearTimeout(timer); timer = 0;
    if (pending != null) { const p = pending; pending = null; if (onInput) onInput(p); }
    lastUser = performance.now();
    if (onCommit) onCommit(value);
  };
  const at = (e) => { const r = el.getBoundingClientRect(); return valueFromX(e.clientX, r.left, r.width); };

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drag = true;
    el.classList.add('drag');
    try { el.setPointerCapture(e.pointerId); } catch {}
    const v = at(e); paint(v); send(v);
  });
  el.addEventListener('pointermove', (e) => { if (drag) { const v = at(e); paint(v); send(v); } });
  const end = () => { if (!drag) return; drag = false; el.classList.remove('drag'); finish(); };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    const v = clamp(value + (e.deltaY < 0 ? step : -step));
    paint(v); send(v);
    clearTimeout(wheelTimer); wheelTimer = setTimeout(finish, 150);
  }, { passive: false });

  el.addEventListener('keydown', (e) => {
    const d = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step }[e.key];
    if (d == null && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const v = e.key === 'Home' ? 0 : e.key === 'End' ? 1 : clamp(value + d);
    paint(v); send(v); finish();
  });

  return {
    // Dipakai saat data dari sistem datang; diabaikan saat pengguna sedang menarik atau baru selesai
    set(v) { if (!drag && !pending && performance.now() - lastUser > 600) paint(v); },
    busy() { return drag || pending != null || performance.now() - lastUser <= 600; }
  };
}
