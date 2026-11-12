// Tampilan Alarm: daftar alarm, layar atur alarm (dial, jam, hari, bunyi), dan layar saat alarm berdering.
import { alarms, ring, onAlarms, newAlarm, updateAlarm, removeAlarm, nextOccurrence, nextInfo, repeatLabel, snoozeRing, stopRing, SOUNDS, SNOOZE_MIN, DAYS } from './alarmkeeper.js';
import { playSound } from './sound.js';
import { BACK_BTN } from './timer-view.js';

const island = document.getElementById('island');
const pad = (n) => String(n).padStart(2, '0');
const svg = (b) => `<svg viewBox="0 0 24 24" aria-hidden="true">${b}</svg>`;

const BELL = '<path d="M6 9a6 6 0 0 1 12 0c0 6.5 2.5 8 2.5 8h-17S6 15.5 6 9"/><path d="M10 21h4"/>';
const MOON = '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>';
const SUN = '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M18.7 5.3L17 7M7 17l-1.7 1.7"/>';
const PLAY = '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>';

function star(cx, cy, R, r) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? r : R;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}
const MOON_ART = `<svg class="al-moon" viewBox="0 0 100 100" aria-hidden="true"><defs>
  <linearGradient id="mg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe2b0"/><stop offset="1" stop-color="#ff9a76"/></linearGradient>
  <mask id="mm"><rect width="100" height="100" fill="#fff"/><circle cx="64" cy="40" r="31" fill="#000"/></mask></defs>
  <circle cx="44" cy="54" r="34" fill="url(#mg)" mask="url(#mm)"/>
  <polygon points="${star(76, 30, 9, 4)}" fill="#ffd34d"/><polygon points="${star(88, 52, 5, 2.3)}" fill="#ffe27a"/><polygon points="${star(60, 16, 4.5, 2)}" fill="#ffd34d"/></svg>`;

let screen = 'list';
let editId = null;
let previewStop = () => {};

export function renderAlarm(container, onBack) { draw(container, onBack); }

function draw(c, onBack) {
  if (ring.active) return drawRing(c, onBack);
  if (screen === 'edit' && alarms.find((a) => a.id === editId)) return drawEdit(c, onBack);
  screen = 'list';
  return drawList(c, onBack);
}

// Waktu sampai alarm: hari/jam atau jam/menit
function untilParts(ms) {
  const mins = Math.max(0, Math.ceil(ms / 60000));
  return { d: Math.floor(mins / 1440), h: Math.floor((mins % 1440) / 60), m: mins % 60 };
}

// ================= Daftar alarm =================
function drawList(c, onBack) {
  island.dataset.sub = 'alarm';
  c.innerHTML = `
    <div class="view al">
      ${BACK_BTN}
      <div class="al-left">
        ${MOON_ART}
        <div class="al-next">
          <span class="al-lab" id="al-lab">Alarm berikutnya</span>
          <div class="al-big" id="al-big"></div>
          <span class="al-at" id="al-at"></span>
        </div>
        <button class="al-add" id="al-add">+ Tambah alarm</button>
      </div>
      <div class="al-list" id="al-list"></div>
    </div>`;
  const q = (s) => c.querySelector(s);
  const root = q('.al'), list = q('#al-list');
  const ringing = !!ring.active;

  function paintNext() {
    const n = nextInfo();
    if (!n) {
      q('#al-lab').textContent = 'Tidak ada alarm aktif';
      q('#al-big').innerHTML = '<span class="al-none">--</span>';
      q('#al-at').textContent = 'Nyalakan atau tambah alarm';
      return;
    }
    const p = untilParts(n.ms);
    q('#al-lab').textContent = 'Alarm berikutnya';
    q('#al-big').innerHTML = p.d > 0
      ? `${p.d}<small>hari</small>${p.h}<small>jam</small>`
      : `${pad(p.h)}<small>jam</small>${pad(p.m)}<small>mnt</small>`;
    const today = new Date().toDateString();
    const tomorrow = new Date(Date.now() + 86400000).toDateString();
    const day = n.at.toDateString() === today ? 'Hari ini' : n.at.toDateString() === tomorrow ? 'Besok' : DAYS[(n.at.getDay() + 6) % 7];
    q('#al-at').textContent = `${day} ${pad(n.alarm.h)}:${pad(n.alarm.m)}`;
  }

  function paintList() {
    const top = list.scrollTop;
    const sorted = [...alarms].sort((a, b) => a.h * 60 + a.m - (b.h * 60 + b.m));
    list.innerHTML = sorted.length
      ? sorted.map((a) => `
        <div class="al-card${a.enabled ? '' : ' off'}" data-id="${a.id}">
          <div class="al-ct"><b>${pad(a.h)}:${pad(a.m)}</b><span>${repeatLabel(a)}</span></div>
          <label class="switch al-sw"><input type="checkbox" ${a.enabled ? 'checked' : ''} aria-label="Aktifkan alarm ${pad(a.h)}:${pad(a.m)}"><span></span></label>
        </div>`).join('')
      : '<div class="al-empty"><b>Belum ada alarm</b><span>Tekan Tambah alarm untuk membuat yang pertama</span></div>';
    list.scrollTop = top;
  }

  paintNext(); paintList();
  const iv = setInterval(() => { if (!root.isConnected) clearInterval(iv); else paintNext(); }, 15000);
  const off = onAlarms(() => {
    if (!root.isConnected) return off();
    if (!!ring.active !== ringing) return draw(c, onBack);
    paintNext(); paintList();
  });

  q('#sub-back').addEventListener('click', onBack);
  q('#al-add').addEventListener('click', () => { editId = newAlarm().id; screen = 'edit'; draw(c, onBack); });
  list.addEventListener('change', (e) => {
    const card = e.target.closest('.al-card');
    if (card) updateAlarm(card.dataset.id, { enabled: e.target.checked });
  });
  list.addEventListener('click', (e) => {
    if (e.target.closest('.al-sw')) return;
    const card = e.target.closest('.al-card');
    if (card) { editId = card.dataset.id; screen = 'edit'; draw(c, onBack); }
  });
}

// ================= Atur alarm =================
const CIRC = 2 * Math.PI * 84;
function ticks() {
  let out = '';
  for (let i = 0; i < 60; i++) {
    const major = i % 5 === 0;
    const a = (i * 6 * Math.PI) / 180;
    const r1 = 66, r2 = major ? 54 : 60;
    out += `<line x1="${(Math.sin(a) * r1).toFixed(2)}" y1="${(-Math.cos(a) * r1).toFixed(2)}" x2="${(Math.sin(a) * r2).toFixed(2)}" y2="${(-Math.cos(a) * r2).toFixed(2)}" class="tk${major ? ' major' : ''}"/>`;
  }
  return out;
}

// Tekan dan tahan untuk mengulang
export function hold(btn, fn) {
  let t = 0, iv = 0;
  const stop = () => { clearTimeout(t); clearInterval(iv); };
  btn.addEventListener('pointerdown', () => { fn(); t = setTimeout(() => { iv = setInterval(fn, 110); }, 420); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => btn.addEventListener(ev, stop));
}

function drawEdit(c, onBack) {
  const a = alarms.find((x) => x.id === editId);
  island.dataset.sub = 'alarm-edit';
  const toList = () => { previewStop(); screen = 'list'; draw(c, onBack); };

  c.innerHTML = `
    <div class="view ae">
      ${BACK_BTN}
      <div class="ae-top"><h2>Atur alarm</h2><button class="ae-done" id="ae-done">Selesai</button></div>
      <div class="ae-body">
        <div class="ae-dial">
          <svg viewBox="-100 -100 200 200" aria-hidden="true">
            <circle r="84" class="trk"/>
            <circle r="84" class="arc" id="ae-arc" transform="rotate(-90)"/>
            ${ticks()}
            <g transform="translate(0 -84)"><circle r="12" class="ic-moon"/><g transform="translate(-5.8 -5.8) scale(.48)" class="ic-path">${MOON}</g></g>
            <g id="ae-end"><circle r="12" class="ic-bell"/><g transform="translate(-5.8 -5.8) scale(.48)" class="ic-path dark">${BELL}</g></g>
          </svg>
          <div class="ae-dc"><div class="ae-dh"><b id="ae-dh">07</b><small id="ae-du">jam</small></div><div class="ae-dm" id="ae-dm"></div></div>
        </div>
        <div class="ae-right">
          <div class="ae-time">
            <span class="ae-sun">${svg(SUN)}</span>
            <div class="ae-tl">Waktu<br>alarm</div>
            <div class="ae-spins">
              <div class="ae-spin" id="sp-h"><button class="up" aria-label="Jam naik">${svg('<path d="M6 15l6-6 6 6"/>')}</button><b id="v-h">07</b><button class="dn" aria-label="Jam turun">${svg('<path d="M6 9l6 6 6-6"/>')}</button></div>
              <span class="ae-colon">:</span>
              <div class="ae-spin" id="sp-m"><button class="up" aria-label="Menit naik">${svg('<path d="M6 15l6-6 6 6"/>')}</button><b id="v-m">30</b><button class="dn" aria-label="Menit turun">${svg('<path d="M6 9l6 6 6-6"/>')}</button></div>
            </div>
            <div class="ae-on"><label class="switch"><input type="checkbox" id="ae-on" aria-label="Alarm aktif"><span></span></label>Aktif</div>
          </div>
          <div class="ae-days">${DAYS.map((d, i) => `<button class="dchip" data-i="${i}">${d}</button>`).join('')}</div>
          <div class="ae-set">
            <div class="ae-row">
              <span class="ae-rl">Bunyi</span>
              <button class="cy" data-d="-1" aria-label="Bunyi sebelumnya">&lsaquo;</button><span class="ae-sn" id="ae-sn"></span><button class="cy" data-d="1" aria-label="Bunyi berikutnya">&rsaquo;</button>
              <button class="pv" id="ae-pv" title="Putar contoh" aria-label="Putar contoh">${svg(PLAY)}</button>
              <input type="range" id="ae-vol" min="0" max="100" aria-label="Volume">
            </div>
            <div class="ae-row">
              <span class="ae-rl wide">Tunda ${SNOOZE_MIN} menit</span>
              <label class="switch"><input type="checkbox" id="ae-sz"><span></span></label>
              <span class="grow"></span>
              <button class="ae-del" id="ae-del">Hapus alarm</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  const q = (s) => c.querySelector(s);
  const root = q('.ae');
  const arc = q('#ae-arc'), endG = q('#ae-end');
  const vol = q('#ae-vol');
  arc.style.strokeDasharray = `0 ${CIRC}`;
  const ringing = !!ring.active;

  function paintDial() {
    const nx = nextOccurrence(a);
    const ms = nx ? nx - Date.now() : 0;
    const f = Math.min(ms, 12 * 3600000) / (12 * 3600000);
    arc.style.strokeDasharray = `${(f * CIRC).toFixed(1)} ${CIRC.toFixed(1)}`;
    const ang = (f * 360 - 90) * (Math.PI / 180);
    endG.setAttribute('transform', `translate(${(84 * Math.cos(ang)).toFixed(2)} ${(84 * Math.sin(ang)).toFixed(2)})`);
    const p = untilParts(ms);
    if (p.d > 0) { q('#ae-dh').textContent = p.d; q('#ae-du').textContent = 'hari'; q('#ae-dm').textContent = `${p.h} jam`; }
    else { q('#ae-dh').textContent = pad(p.h); q('#ae-du').textContent = 'jam'; q('#ae-dm').textContent = `${pad(p.m)} mnt`; }
  }

  function paint() {
    if (!root.isConnected) return off();
    q('#v-h').textContent = pad(a.h);
    q('#v-m').textContent = pad(a.m);
    q('#ae-on').checked = a.enabled;
    q('#ae-sz').checked = a.snooze;
    q('#ae-sn').textContent = SOUNDS[a.sound];
    if (document.activeElement !== vol) vol.value = Math.round(a.volume * 100);
    vol.style.setProperty('--v', `${Math.round(a.volume * 100)}%`);
    c.querySelectorAll('.dchip').forEach((b) => b.classList.toggle('on', a.days[Number(b.dataset.i)]));
    paintDial();
  }
  const off = onAlarms(() => { if (root.isConnected && !!ring.active !== ringing) draw(c, onBack); else paint(); });
  const iv = setInterval(() => { if (!root.isConnected) clearInterval(iv); else paintDial(); }, 1000);
  paint();

  q('#sub-back').addEventListener('click', toList);
  q('#ae-done').addEventListener('click', toList);

  const stepH = (d) => updateAlarm(a.id, { h: (a.h + d + 24) % 24 });
  const stepM = (d) => updateAlarm(a.id, { m: (a.m + d + 60) % 60 });
  hold(q('#sp-h .up'), () => stepH(1)); hold(q('#sp-h .dn'), () => stepH(-1));
  hold(q('#sp-m .up'), () => stepM(1)); hold(q('#sp-m .dn'), () => stepM(-1));
  q('#sp-h').addEventListener('wheel', (e) => { e.preventDefault(); stepH(e.deltaY < 0 ? 1 : -1); }, { passive: false });
  q('#sp-m').addEventListener('wheel', (e) => { e.preventDefault(); stepM(e.deltaY < 0 ? 1 : -1); }, { passive: false });

  q('#ae-on').addEventListener('change', (e) => updateAlarm(a.id, { enabled: e.target.checked }));
  q('#ae-sz').addEventListener('change', (e) => updateAlarm(a.id, { snooze: e.target.checked }));
  c.querySelectorAll('.dchip').forEach((b) => b.addEventListener('click', () => {
    const days = [...a.days];
    days[Number(b.dataset.i)] = !days[Number(b.dataset.i)];
    updateAlarm(a.id, { days });
  }));

  const preview = () => { previewStop(); previewStop = playSound(a.sound, { volume: a.volume, rounds: 1 }); };
  const keys = Object.keys(SOUNDS);
  c.querySelectorAll('.cy').forEach((b) => b.addEventListener('click', () => {
    const i = (keys.indexOf(a.sound) + Number(b.dataset.d) + keys.length) % keys.length;
    updateAlarm(a.id, { sound: keys[i] });
    preview();
  }));
  q('#ae-pv').addEventListener('click', preview);
  vol.addEventListener('input', () => updateAlarm(a.id, { volume: Number(vol.value) / 100 }));
  vol.addEventListener('change', preview);

  q('#ae-del').addEventListener('click', () => { previewStop(); removeAlarm(a.id); toList(); });
}

// ================= Alarm berdering =================
function drawRing(c, onBack) {
  island.dataset.sub = 'alarm';
  const a = ring.active.alarm;
  c.innerHTML = `
    <div class="view ar">
      <div class="ar-bell">${svg(BELL)}</div>
      <div class="ar-time">${pad(a.h)}:${pad(a.m)}</div>
      <div class="ar-sub">${repeatLabel(a)}</div>
      <div class="ar-actions">
        ${a.snooze ? `<button class="ar-snooze" id="ar-snooze">Tunda ${SNOOZE_MIN} menit</button>` : ''}
        <button class="ar-stop" id="ar-stop">Berhenti</button>
      </div>
    </div>`;
  const root = c.querySelector('.ar');
  const off = onAlarms(() => { if (!root.isConnected) return off(); if (!ring.active) draw(c, onBack); });
  const sz = c.querySelector('#ar-snooze');
  if (sz) sz.addEventListener('click', snoozeRing);
  c.querySelector('#ar-stop').addEventListener('click', stopRing);
}
