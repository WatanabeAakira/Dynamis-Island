// Tampilan Focus: waktu besar, progress, kontrol, dan tiga mode (fokus, istirahat pendek, istirahat panjang).
import { focus, onFocus, focusStart, focusPause, focusReset, focusMode, focusSkip, focusAdjust, focusAuto, fmtShort } from './timekeeper.js';
import { BACK_BTN } from './timer-view.js';

const svg = (b) => `<svg viewBox="0 0 24 24" aria-hidden="true">${b}</svg>`;
const MODES = {
  focus: { title: 'FOCUS TIME', name: 'FOKUS', icon: svg('<path d="M12 3c1 3.6 5.2 5.6 5.2 10.2a5.2 5.2 0 0 1-10.4 0c0-2.1 1-3.7 2.3-4.8.2 1.7 1 2.6 2.1 2.8C10.6 8.8 10.8 5.6 12 3z"/>') },
  short: { title: 'ISTIRAHAT', name: 'PENDEK', icon: svg('<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14"/><path d="M5 19c2-4 5-7 9-9"/>') },
  long: { title: 'ISTIRAHAT PANJANG', name: 'PANJANG', icon: svg('<path d="M3 9c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 3 2M3 15c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 3 2"/>') }
};
const SKIP = svg('<path d="M5 6v12l8-6z" fill="currentColor" stroke="none"/><path d="M15 6v12M19 6v12"/>');

export function renderFocus(container, onBack) {
  container.innerHTML = `
    <div class="view fm" data-mode="${focus.mode}">
      ${BACK_BTN}
      <div class="fm-main">
        <div class="fm-head">
          <div class="fm-title"><span class="fm-ico" id="fm-ico"></span><b id="fm-title"></b></div>
          <div class="fm-meta"><span id="fm-sess"></span><button class="fm-auto" id="fm-auto" title="Mulai sesi berikutnya otomatis">Auto</button></div>
        </div>
        <div class="fm-time" id="fm-time">25:00</div>
        <div class="fm-bar"><div class="fm-fill" id="fm-fill"></div></div>
        <div class="fm-actions">
          <button class="fb primary" id="fm-go">MULAI</button>
          <button class="fb ghost" id="fm-reset">RESET</button>
          <button class="fb ghost icon" id="fm-skip" title="Lewati ke sesi berikutnya" aria-label="Lewati">${SKIP}</button>
        </div>
      </div>
      <div class="fm-modes">
        ${Object.entries(MODES).map(([k, m]) => `
          <div class="fm-mode" data-mode="${k}">
            <button class="fm-pick"><span class="fm-mi">${m.icon}</span>${m.name}</button>
            <div class="fm-step">
              <button data-d="-5" aria-label="Kurangi 5 menit">--</button><button data-d="-1" aria-label="Kurangi 1 menit">-</button>
              <b></b>
              <button data-d="1" aria-label="Tambah 1 menit">+</button><button data-d="5" aria-label="Tambah 5 menit">++</button>
            </div>
          </div>`).join('')}
      </div>
    </div>`;

  const q = (s) => container.querySelector(s);
  const root = q('.fm');
  const el = { ico: q('#fm-ico'), title: q('#fm-title'), sess: q('#fm-sess'), time: q('#fm-time'), fill: q('#fm-fill'), go: q('#fm-go'), reset: q('#fm-reset'), auto: q('#fm-auto') };
  const cache = {};
  const set = (k, node, v) => { if (cache[k] !== v) { cache[k] = v; node.textContent = v; } };

  function paint() {
    if (!root.isConnected) return off();
    root.dataset.mode = focus.mode;
    if (cache.mode !== focus.mode) { cache.mode = focus.mode; el.ico.innerHTML = MODES[focus.mode].icon; }
    set('title', el.title, focus.done ? (focus.mode === 'focus' ? 'SESI SELESAI' : 'ISTIRAHAT SELESAI') : MODES[focus.mode].title);
    set('sess', el.sess, `Sesi ${focus.sessions}`);
    set('time', el.time, fmtShort(focus.remaining));
    el.fill.style.width = (focus.total ? (1 - focus.remaining / focus.total) * 100 : 0).toFixed(2) + '%';
    set('go', el.go, focus.running ? 'JEDA' : focus.remaining < focus.total && !focus.done ? 'LANJUT' : 'MULAI');
    el.reset.disabled = !focus.running && !focus.done && focus.remaining === focus.total;
    el.auto.classList.toggle('on', focus.auto);
    container.querySelectorAll('.fm-mode').forEach((r) => {
      const m = r.dataset.mode;
      r.classList.toggle('on', m === focus.mode);
      set('d' + m, r.querySelector('b'), `${focus.dur[m]}m`);
    });
  }
  const off = onFocus(paint);
  paint();

  q('#sub-back').addEventListener('click', onBack);
  el.go.addEventListener('click', () => (focus.running ? focusPause() : focusStart()));
  el.reset.addEventListener('click', focusReset);
  q('#fm-skip').addEventListener('click', focusSkip);
  el.auto.addEventListener('click', () => focusAuto(!focus.auto));
  container.querySelectorAll('.fm-mode').forEach((r) => {
    r.querySelector('.fm-pick').addEventListener('click', () => focusMode(r.dataset.mode));
    r.querySelectorAll('.fm-step button').forEach((b) => b.addEventListener('click', () => focusAdjust(r.dataset.mode, Number(b.dataset.d))));
  });
}
