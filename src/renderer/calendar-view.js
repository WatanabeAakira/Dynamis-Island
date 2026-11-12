// Tab Kalender bergaya kartu: deretan kartu hari yang bisa digeser (kartu di tengah = hari terpilih),
// daftar event hari itu, dan layar tambah/ubah event.
import { events, onEvents, ymd, eventsOn, addEvent, updateEvent, removeEvent, daysIn, MONTHS, COLORS, REMINDERS } from './calkeeper.js';
import { DAYS } from './alarmkeeper.js';
import { hold } from './alarm-view.js';
import { BACK_BTN } from './timer-view.js';

const island = document.getElementById('island');
const pad = (n) => String(n).padStart(2, '0');
const svg = (b) => `<svg viewBox="0 0 24 24" aria-hidden="true">${b}</svg>`;
const CHEV_L = '<path d="M15 5l-7 7 7 7"/>';
const CHEV_R = '<path d="M9 5l7 7-7 7"/>';
const UP = '<path d="M6 15l6-6 6 6"/>';
const DOWN = '<path d="M6 9l6 6 6-6"/>';
const MOON_STARS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.5 14.2A7.6 7.6 0 1 1 9.8 4.1a6.2 6.2 0 0 0 7.7 10.1z"/><path d="M18 3l.9 2.1L21 6l-2.1.9L18 9l-.9-2.1L15 6l2.1-.9z"/><path d="M21.2 10.6l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5z"/></svg>';

const CELL = 92;       // lebar kartu (px)
const GAP = 16;        // jarak antar kartu
const WIN = 400;       // jumlah hari yang disiapkan sebelum dan sesudah titik tengah
const DAY_MS = 86400000;

const t0 = new Date();
let cur = { sel: ymd(t0) };   // tanggal terpilih (kartu di tengah)
let draft = null;             // event yang sedang ditambah/diubah

const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return { y, m: m - 1, d }; };
const pdate = (s) => { const p = parse(s); return new Date(p.y, p.m, p.d); };
const dayDiff = (ds) => { const n = new Date(); return Math.round((pdate(ds) - new Date(n.getFullYear(), n.getMonth(), n.getDate())) / DAY_MS); };
const esc = (t) => String(t).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

export function renderCalendar(container) { draw(container); }
function draw(c) { return draft ? drawEdit(c) : drawMain(c); }

function openDraft(ev, ds) {
  if (ev) {
    const p = parse(ev.date);
    const [h, mi] = ev.time ? ev.time.split(':').map(Number) : [9, 0];
    draft = { id: ev.id, title: ev.title, note: ev.note || '', y: p.y, m: p.m, d: p.d, h, min: mi, allDay: !ev.time, color: ev.color, remind: ev.remind };
  } else {
    const now = new Date();
    const p = parse(ds);
    draft = { id: null, title: '', note: '', y: p.y, m: p.m, d: p.d, h: ds === ymd(now) ? (now.getHours() + 1) % 24 : 9, min: 0, allDay: false, color: COLORS[0], remind: 15 };
  }
}

// ================= Tampilan utama =================
function drawMain(c) {
  island.dataset.sub = 'cal';
  c.innerHTML = `
    <div class="view cal">
      <div class="cl-head">
        <button class="cl-today" id="cl-today">Hari ini</button>
        <span class="cl-moon">${MOON_STARS}</span>
        <div class="cl-mrow">
          <button class="cl-nav" id="cl-prev" aria-label="Bulan sebelumnya">${svg(CHEV_L)}</button>
          <b id="cl-title"></b><small id="cl-year"></small>
          <button class="cl-nav" id="cl-next" aria-label="Bulan berikutnya">${svg(CHEV_R)}</button>
        </div>
        <button class="cl-add" id="cl-add">+ Event</button>
      </div>
      <div class="cl-strip" id="cl-strip"></div>
      <div class="cl-agenda" id="cl-agenda"></div>
    </div>`;
  const q = (s) => c.querySelector(s);
  const root = q('.cal'), strip = q('#cl-strip'), agenda = q('#cl-agenda');

  // Jendela hari: titik tengah +/- WIN hari. Dibangun ulang bila lompatan melewati batasnya.
  let start = pdate(cur.sel);
  start.setDate(start.getDate() - WIN);
  const N = WIN * 2 + 1;
  const dateAt = (i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; };
  const indexOf = (ds) => Math.round((pdate(ds) - start) / DAY_MS);
  let idx = WIN, step = CELL + GAP, cells = [], prog = false, progTimer = 0;

  function build() {
    const by = new Map();
    for (const e of events) { if (!by.has(e.date)) by.set(e.date, []); by.get(e.date).push(e); }
    const todayS = ymd(new Date());
    let h = '';
    for (let i = 0; i < N; i++) {
      const d = dateAt(i);
      const wd = (d.getDay() + 6) % 7;
      const evs = by.get(ymd(d)) || [];
      const dots = evs.slice(0, 3).map((e) => `<i style="background:${e.color}"></i>`).join('');
      h += `<button class="cd${ymd(d) === todayS ? ' today' : ''}${wd >= 5 ? ' we' : ''}" data-i="${i}"><span class="cd-w">${DAYS[wd]}</span><b>${d.getDate()}</b>${d.getDate() === 1 ? `<em class="cd-m">${MONTHS[d.getMonth()].slice(0, 3)}</em>` : ''}<span class="cd-dots">${dots}</span><span class="cd-cap"></span></button>`;
    }
    strip.innerHTML = h;
    cells = [...strip.children];
  }

  // Kartu pertama dan terakhir juga harus bisa berada di tengah
  function layout() {
    strip.style.paddingInline = Math.max(0, (strip.clientWidth - CELL) / 2) + 'px';
    if (cells.length > 1) step = cells[1].offsetLeft - cells[0].offsetLeft || CELL + GAP;
  }

  function capText(ds) {
    const evs = eventsOn(ds);
    if (evs.length) return { ev: true, text: `${evs[0].time ? evs[0].time + ' ' : ''}${evs[0].title}${evs.length > 1 ? ` +${evs.length - 1}` : ''}` };
    const df = dayDiff(ds);
    return { ev: false, text: df === 0 ? 'Hari ini' : df === 1 ? 'Besok' : df === -1 ? 'Kemarin' : df > 0 ? `${df} hari lagi` : `${-df} hari lalu` };
  }

  function paintAgenda(ds) {
    const evs = eventsOn(ds);
    agenda.innerHTML = evs.length
      ? evs.map((e) => `<button class="ev" data-id="${e.id}" style="--ec:${e.color}"><span class="ev-t">${e.time || 'Seharian'}</span><span class="ev-n">${esc(e.title)}</span></button>`).join('')
      : '<span class="cl-none">Tidak ada event, klik dua kali kartu untuk menambah</span>';
  }

  // Sorot kartu di tengah dan redupkan yang menjauh
  function paintFocus(prev) {
    for (let k = -3; k <= 3; k++) { const el = cells[prev + k]; if (el) el.classList.remove('sel', 'n1', 'n2', 'n3'); }
    for (let k = -3; k <= 3; k++) { const el = cells[idx + k]; if (el) el.classList.add(k === 0 ? 'sel' : 'n' + Math.abs(k)); }
    const d = dateAt(idx);
    cur.sel = ymd(d);
    const cap = cells[idx].querySelector('.cd-cap');
    const t = capText(cur.sel);
    cap.textContent = t.text;
    cap.classList.toggle('ev', t.ev);
    q('#cl-title').textContent = MONTHS[d.getMonth()];
    q('#cl-year').textContent = d.getFullYear();
    paintAgenda(cur.sel);
  }

  function goTo(i, smooth) {
    i = Math.max(0, Math.min(N - 1, i));
    prog = true;
    clearTimeout(progTimer);
    const prev = idx;
    idx = i;
    paintFocus(prev);
    strip.scrollTo({ left: i * step, behavior: smooth ? 'smooth' : 'auto' });
    progTimer = setTimeout(() => { prog = false; }, smooth ? 650 : 60);
  }

  function rebuildAround(ds) {
    start = pdate(ds);
    start.setDate(start.getDate() - WIN);
    build(); layout();
    idx = WIN;
    paintFocus(-99);
    strip.scrollLeft = idx * step;
  }
  function jumpTo(ds) {
    const i = indexOf(ds);
    if (i < 40 || i > N - 41) rebuildAround(ds); else goTo(i, true);
  }
  const shiftMonth = (dm) => {
    const d = dateAt(idx);
    const t = new Date(d.getFullYear(), d.getMonth() + dm, 1);
    const n = new Date();
    jumpTo(t.getFullYear() === n.getFullYear() && t.getMonth() === n.getMonth() ? ymd(n) : ymd(t));
  };

  build(); layout();
  paintFocus(-99);
  requestAnimationFrame(() => { layout(); strip.scrollLeft = idx * step; });
  // Lebar island beranimasi saat dibuka: pusatkan ulang setelah ukurannya berubah
  new ResizeObserver(() => { layout(); strip.scrollLeft = idx * step; }).observe(strip);

  const off = onEvents(() => {
    if (!root.isConnected) return off();
    build(); layout();
    paintFocus(-99);
    strip.scrollLeft = idx * step;
  });

  q('#cl-prev').addEventListener('click', () => shiftMonth(-1));
  q('#cl-next').addEventListener('click', () => shiftMonth(1));
  q('#cl-today').addEventListener('click', () => jumpTo(ymd(new Date())));
  q('#cl-add').addEventListener('click', () => { openDraft(null, cur.sel); draw(c); });

  // Geser: roda mouse atau tarik; kartu terdekat otomatis menempel ke tengah
  const snap = () => {
    const i = Math.round(strip.scrollLeft / step);
    if (Math.abs(i * step - strip.scrollLeft) > 1) strip.scrollTo({ left: i * step, behavior: 'smooth' });
  };
  strip.addEventListener('scroll', () => {
    if (prog) return;
    const i = Math.max(0, Math.min(N - 1, Math.round(strip.scrollLeft / step)));
    if (i !== idx) { const prev = idx; idx = i; paintFocus(prev); }
  });
  strip.addEventListener('scrollend', () => { prog = false; if (!(down && down.moved)) snap(); });
  strip.addEventListener('wheel', (e) => {
    e.preventDefault();
    strip.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  }, { passive: false });

  let down = null;
  strip.addEventListener('pointerdown', (e) => { down = { x: e.clientX, sl: strip.scrollLeft, moved: false }; });
  strip.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - down.x;
    if (!down.moved && Math.abs(dx) > 5) { down.moved = true; try { strip.setPointerCapture(e.pointerId); } catch {} }
    if (down.moved) strip.scrollLeft = down.sl - dx;
  });
  strip.addEventListener('pointerup', () => { if (down && down.moved) snap(); setTimeout(() => { down = null; }, 0); });
  strip.addEventListener('click', (e) => {
    if (down && down.moved) return; // baru saja menarik, bukan klik
    const cell = e.target.closest('.cd');
    if (cell) goTo(Number(cell.dataset.i), true);
  });
  strip.addEventListener('dblclick', (e) => {
    const cell = e.target.closest('.cd');
    if (cell) { openDraft(null, ymd(dateAt(Number(cell.dataset.i)))); draw(c); }
  });

  agenda.addEventListener('click', (e) => {
    const b = e.target.closest('.ev');
    const ev = b && events.find((x) => x.id === b.dataset.id);
    if (ev) { openDraft(ev); draw(c); }
  });
}

// ================= Tambah / ubah event =================
const sp = (id, up, dn) => `<div class="ce-sp" id="${id}"><button class="up" aria-label="${up}">${svg(UP)}</button><b></b><button class="dn" aria-label="${dn}">${svg(DOWN)}</button></div>`;

function drawEdit(c) {
  island.dataset.sub = 'cal-edit';
  const isNew = !draft.id;
  c.innerHTML = `
    <div class="view ce">
      ${BACK_BTN}
      <div class="ae-top">
        <h2>${isNew ? 'Event baru' : 'Ubah event'}</h2>
        ${isNew ? '' : '<button class="ce-del" id="ce-del">Hapus</button>'}
        <button class="ae-done" id="ce-save">Simpan</button>
      </div>
      <div class="ce-body">
        <div class="ce-left">
          <input class="ce-in" id="ce-title" type="text" maxlength="60" placeholder="Nama event" autocomplete="off">
          <input class="ce-in" id="ce-note" type="text" maxlength="80" placeholder="Catatan (opsional)" autocomplete="off">
          <div class="ce-lab">Warna</div>
          <div class="ce-colors">${COLORS.map((col) => `<button class="ce-sw" data-c="${col}" style="--c:${col}" aria-label="Warna ${col}"></button>`).join('')}</div>
          <div class="ce-lab">Pengingat</div>
          <div class="ce-rem">${REMINDERS.map((r) => `<button class="ce-rc" data-v="${r.v}">${r.t}</button>`).join('')}</div>
        </div>
        <div class="ce-right">
          <div class="ce-card">
            <div class="ce-cl">Tanggal</div>
            <div class="ce-spins">${sp('sp-d', 'Tanggal naik', 'Tanggal turun')}${sp('sp-mo', 'Bulan berikutnya', 'Bulan sebelumnya')}${sp('sp-y', 'Tahun naik', 'Tahun turun')}</div>
          </div>
          <div class="ce-card" id="ce-time">
            <div class="ce-cl ce-clrow"><span>Waktu</span><label class="ce-all"><span>Seharian</span><span class="switch"><input type="checkbox" id="ce-allday"><span></span></span></label></div>
            <div class="ce-spins ce-tspins">${sp('sp-h', 'Jam naik', 'Jam turun')}<span class="ce-colon">:</span>${sp('sp-mi', 'Menit naik', 'Menit turun')}</div>
          </div>
        </div>
      </div>
    </div>`;
  const q = (s) => c.querySelector(s);
  const root = q('.ce');
  q('#ce-title').value = draft.title;
  q('#ce-note').value = draft.note;

  function paint() {
    const set = (id, v) => { q(`#${id} b`).textContent = v; };
    set('sp-d', pad(draft.d));
    set('sp-mo', MONTHS[draft.m].slice(0, 3));
    set('sp-y', draft.y);
    set('sp-h', pad(draft.h));
    set('sp-mi', pad(draft.min));
    q('#ce-allday').checked = draft.allDay;
    q('#ce-time').classList.toggle('off', draft.allDay);
    c.querySelectorAll('.ce-sw').forEach((b) => b.classList.toggle('on', b.dataset.c === draft.color));
    c.querySelectorAll('.ce-rc').forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === draft.remind));
  }
  paint();

  const setDate = (y, m, d) => { draft.y = y; draft.m = m; draft.d = Math.min(d, daysIn(y, m)); paint(); };
  const stepD = (dl) => { const n = daysIn(draft.y, draft.m); setDate(draft.y, draft.m, ((draft.d - 1 + dl + n) % n) + 1); };
  const stepMo = (dl) => setDate(draft.y, (draft.m + dl + 12) % 12, draft.d);
  const stepY = (dl) => setDate(Math.min(2100, Math.max(2000, draft.y + dl)), draft.m, draft.d);
  const stepH = (dl) => { draft.h = (draft.h + dl + 24) % 24; paint(); };
  const stepMi = (dl) => { draft.min = (draft.min + dl + 60) % 60; paint(); };
  [['sp-d', stepD], ['sp-mo', stepMo], ['sp-y', stepY], ['sp-h', stepH], ['sp-mi', stepMi]].forEach(([id, fn]) => {
    hold(q(`#${id} .up`), () => fn(1));
    hold(q(`#${id} .dn`), () => fn(-1));
    q(`#${id}`).addEventListener('wheel', (e) => { e.preventDefault(); fn(e.deltaY < 0 ? 1 : -1); }, { passive: false });
  });

  q('#ce-allday').addEventListener('change', (e) => { draft.allDay = e.target.checked; paint(); });
  c.querySelectorAll('.ce-sw').forEach((b) => b.addEventListener('click', () => { draft.color = b.dataset.c; paint(); }));
  c.querySelectorAll('.ce-rc').forEach((b) => b.addEventListener('click', () => { draft.remind = Number(b.dataset.v); paint(); }));
  q('#ce-title').addEventListener('input', (e) => { draft.title = e.target.value; });
  q('#ce-note').addEventListener('input', (e) => { draft.note = e.target.value; });

  const cancel = () => { draft = null; draw(c); };
  const save = () => {
    const data = {
      title: draft.title.trim() || 'Event baru',
      note: draft.note.trim(),
      date: `${draft.y}-${pad(draft.m + 1)}-${pad(draft.d)}`,
      time: draft.allDay ? null : `${pad(draft.h)}:${pad(draft.min)}`,
      color: draft.color,
      remind: draft.remind
    };
    if (draft.id) updateEvent(draft.id, data); else addEvent(data);
    cur = { sel: data.date }; // kartu hari event tersebut berada di tengah
    draft = null;
    draw(c);
  };
  q('#sub-back').addEventListener('click', cancel);
  q('#ce-save').addEventListener('click', save);
  c.querySelector('.ce-body').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') cancel();
  });

  const del = q('#ce-del');
  if (del) {
    let armed = 0;
    del.addEventListener('click', () => {
      if (!armed) {
        del.textContent = 'Yakin hapus?';
        del.classList.add('arm');
        armed = setTimeout(() => { armed = 0; del.textContent = 'Hapus'; del.classList.remove('arm'); }, 2500);
        return;
      }
      clearTimeout(armed);
      removeEvent(draft.id);
      draft = null;
      draw(c);
    });
  }
  if (isNew) {
    window.api.focusWindow();
    setTimeout(() => { if (root.isConnected) q('#ce-title').focus(); }, 80);
  }
}
