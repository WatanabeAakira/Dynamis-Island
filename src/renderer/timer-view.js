// Tampilan Timer: cincin progres, kartu sisa waktu, preset, dan tombol kontrol.
import { timer, onTimer, timerStart, timerPause, timerReset, timerSet, timerLoop, parts, fmtClock, fmtShort, fmtWords } from './timekeeper.js';

export const BACK_BTN = '<button class="sub-back" id="sub-back" aria-label="Kembali ke menu" title="Kembali"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>';
const PRESETS = [1, 5, 10, 25, 60];
const R = 70;
const C = 2 * Math.PI * R;

const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none"/><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none"/></svg>',
  reset: '<svg viewBox="0 0 24 24"><path d="M4 11a8 8 0 1 1 2.3 5.7M4 5v6h6"/></svg>',
  loop: '<svg viewBox="0 0 24 24"><path d="M4 11V9a3 3 0 0 1 3-3h13M17 3l3 3-3 3M20 13v2a3 3 0 0 1-3 3H4M7 21l-3-3 3-3"/></svg>'
};

export function renderTimer(container, onBack) {
  container.innerHTML = `
    <div class="view tm">
      ${BACK_BTN}
      <div class="tm-ring">
        <svg viewBox="-80 -80 160 160" aria-hidden="true">
          <circle r="${R}" class="trk"/>
          <circle r="${R}" class="arc" id="tm-arc" transform="rotate(-90)"/>
          <circle r="5.5" class="knob" id="tm-knob"/>
        </svg>
        <div class="tm-center">
          <div class="tm-status"><i></i><span id="tm-status">SIAP</span></div>
          <div class="tm-digits" id="tm-digits">00:05:00</div>
          <div class="tm-units">JJ : MM : DD</div>
        </div>
      </div>
      <div class="tm-side">
        <div class="tm-card">
          <div class="tm-lab">SISA WAKTU</div>
          <div class="tm-row"><div class="tm-words" id="tm-words"></div><div class="tm-total" id="tm-total"></div></div>
        </div>
        <div class="tm-presets" id="tm-presets">
          ${PRESETS.map((m) => `<button class="chip" data-m="${m}">${m} mnt</button>`).join('')}
          <button class="chip" id="tm-custom">Atur</button>
        </div>
        <div class="tm-set" id="tm-set" hidden>
          <label><input id="tm-h" type="number" min="0" max="99"><span>jam</span></label>
          <label><input id="tm-m" type="number" min="0" max="999"><span>mnt</span></label>
          <label><input id="tm-s" type="number" min="0" max="999"><span>dtk</span></label>
          <button class="chip ok" id="tm-ok">OK</button>
        </div>
        <div class="tm-actions">
          <button class="tb start" id="tm-start">${ICON.play}MULAI</button>
          <button class="tb pause" id="tm-pause">${ICON.pause}JEDA</button>
          <button class="tb reset" id="tm-reset">${ICON.reset}RESET</button>
          <button class="tb loop" id="tm-loop" title="Ulangi otomatis" aria-label="Ulangi otomatis">${ICON.loop}</button>
        </div>
      </div>
    </div>`;

  const q = (s) => container.querySelector(s);
  const root = q('.tm');
  const arc = q('#tm-arc'), knob = q('#tm-knob');
  const el = {
    status: q('#tm-status'), digits: q('#tm-digits'), words: q('#tm-words'), total: q('#tm-total'),
    presets: q('#tm-presets'), set: q('#tm-set'), start: q('#tm-start'), pause: q('#tm-pause'),
    reset: q('#tm-reset'), loop: q('#tm-loop')
  };
  arc.style.strokeDasharray = `${C} ${C}`;
  const cache = {};
  const txt = (k, node, v) => { if (cache[k] !== v) { cache[k] = v; node.textContent = v; } };

  function paint() {
    if (!root.isConnected) return off();
    const f = timer.total ? timer.remaining / timer.total : 0;
    arc.style.strokeDasharray = `${(f * C).toFixed(1)} ${C.toFixed(1)}`;
    const a = (f * 360 - 90) * (Math.PI / 180);
    knob.setAttribute('cx', (R * Math.cos(a)).toFixed(2));
    knob.setAttribute('cy', (R * Math.sin(a)).toFixed(2));
    knob.style.opacity = f > 0.003 ? 1 : 0;

    txt('digits', el.digits, fmtClock(timer.remaining));
    txt('words', el.words, timer.done ? 'Selesai!' : fmtWords(timer.remaining));
    txt('total', el.total, `dari ${fmtShort(timer.total)} total`);
    txt('status', el.status, timer.done ? 'SELESAI' : timer.running ? 'MENGHITUNG MUNDUR' : timer.remaining < timer.total ? 'JEDA' : 'SIAP');

    root.classList.toggle('run', timer.running);
    root.classList.toggle('done', timer.done);
    root.classList.toggle('long', parts(timer.remaining).h > 0);
    el.start.disabled = timer.running;
    el.pause.disabled = !timer.running;
    el.reset.disabled = !timer.running && !timer.done && timer.remaining === timer.total;
    el.loop.classList.toggle('on', timer.loop);
    container.querySelectorAll('.chip[data-m]').forEach((c) => c.classList.toggle('on', timer.total === Number(c.dataset.m) * 60000));
  }
  const off = onTimer(paint);
  paint();

  q('#sub-back').addEventListener('click', onBack);
  el.start.addEventListener('click', timerStart);
  el.pause.addEventListener('click', timerPause);
  el.reset.addEventListener('click', timerReset);
  el.loop.addEventListener('click', () => timerLoop(!timer.loop));
  container.querySelectorAll('.chip[data-m]').forEach((c) => c.addEventListener('click', () => timerSet(Number(c.dataset.m) * 60000)));

  // Durasi sendiri (jam, menit, detik)
  const inH = q('#tm-h'), inM = q('#tm-m'), inS = q('#tm-s');
  const toggleSet = (open) => {
    el.set.hidden = !open;
    el.presets.hidden = open;
    if (open) {
      const p = parts(timer.total);
      inH.value = p.h; inM.value = p.m; inS.value = p.s;
      window.api.focusWindow();
      inM.focus(); inM.select();
    }
  };
  q('#tm-custom').addEventListener('click', () => toggleSet(true));
  const apply = () => {
    const sec = (Number(inH.value) || 0) * 3600 + (Number(inM.value) || 0) * 60 + (Number(inS.value) || 0);
    if (sec > 0) timerSet(Math.min(sec, 99 * 3600) * 1000);
    toggleSet(false);
  };
  q('#tm-ok').addEventListener('click', apply);
  el.set.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') apply();
    if (e.key === 'Escape') toggleSet(false);
  });
}
