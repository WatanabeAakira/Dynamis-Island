// Tab Weather: busur matahari, jam lokasi, kondisi sekarang, dan panel prakiraan (jam, 7 hari, detail).
import { icon, label } from './weather-icons.js';
import { toMs, hhmm, pickHours, sunProgress, arcPath, arcPoint, fmtTemp, compass, uvLevel, dayName, distKm } from './weather-core.js';
import { BACK_BTN } from './timer-view.js';
import { getLanguage } from './locale.js';

const island = document.getElementById('island');
const svg = (b) => `<svg viewBox="0 0 24 24" aria-hidden="true">${b}</svg>`;
const PIN = '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.4"/>';
const SEARCH = '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>';
const ARROW = '<path d="M12 4v16M6 10l6-6 6 6"/>';
const esc = (t) => String(t).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

const STALE_MS = 10 * 60000;
const st = { screen: 'main', mode: 'hour', units: 'c', loc: null, auto: true, recent: [], data: null, fetchedAt: 0, lastTry: 0, loading: false, locating: false, error: null };
let autoChecked = false;

const subs = new Set();
const emit = () => subs.forEach((f) => f());
const onWx = (f) => { subs.add(f); return () => subs.delete(f); };

const ready = (async () => {
  try {
    const w = (await window.api.getSettings()).weather;
    if (w) { st.loc = w.loc || null; st.auto = w.auto !== false; st.units = w.units || 'c'; st.recent = w.recent || []; }
  } catch {}
})();
const saveCfg = () => window.api.setSettings({ weather: { loc: st.loc, auto: st.auto, units: st.units, recent: st.recent } });

// ---------- Data ----------
async function load(force = false) {
  if (st.loading || st.locating) return;
  if (!st.loc) { await autoLocate(); return; } // setLoc() di dalamnya sudah memicu pengambilan data
  if (!force && st.data && Date.now() - st.fetchedAt < STALE_MS) return;
  if (!force && st.error && Date.now() - st.lastTry < 60000) return; // jangan mengulang tiap detik saat gagal
  st.loading = true; st.error = null; st.lastTry = Date.now(); emit();
  try {
    const d = await window.api.weatherGet({ lat: st.loc.lat, lon: st.loc.lon });
    if (!d || d.error) throw new Error((d && d.error) || 'gagal');
    st.data = d; st.fetchedAt = Date.now();
  } catch {
    st.error = 'Tidak bisa memuat cuaca. Periksa koneksi internet.';
  }
  st.loading = false; emit();
}

async function autoLocate() {
  st.locating = true; st.error = null; emit();
  const r = await window.api.weatherLocate();
  st.locating = false;
  if (r && r.ok) setLoc({ lat: r.lat, lon: r.lon, name: r.name }, true);
  else { st.error = 'Lokasi tidak bisa ditentukan. Cari lokasi secara manual.'; emit(); }
}

function setLoc(loc, auto) {
  st.loc = loc; st.auto = auto;
  if (!auto) st.recent = [loc, ...st.recent.filter((r) => !(Math.abs(r.lat - loc.lat) < 0.01 && Math.abs(r.lon - loc.lon) < 0.01))].slice(0, 5);
  saveCfg();
  st.data = null; st.error = null;
  emit();
  load(true);
}

export async function renderWeather(c) {
  await ready;
  if (island.dataset.tab !== 'weather') return; // pengguna sudah pindah tab
  draw(c);
  // Mode otomatis: cek sekali per sesi apakah lokasi Windows berubah jauh
  if (st.auto && st.loc && !autoChecked) {
    autoChecked = true;
    window.api.weatherLocate().then((r) => { if (r && r.ok && distKm(st.loc, r) > 10) setLoc({ lat: r.lat, lon: r.lon, name: r.name }, true); });
  }
}
function draw(c) { return st.screen === 'search' ? drawSearch(c) : drawMain(c); }

// ================= Tampilan utama =================
function drawMain(c) {
  island.dataset.sub = 'weather';
  c.innerHTML = `
    <div class="view wx">
      <div class="wx-sky">
        <svg class="wx-svg" viewBox="0 0 594 120" aria-hidden="true">
          <defs>
            <radialGradient id="wxg"><stop offset="0" stop-color="#ffd60a" stop-opacity=".55"/><stop offset="1" stop-color="#ffd60a" stop-opacity="0"/></radialGradient>
            <radialGradient id="wxgm"><stop offset="0" stop-color="#9db4ff" stop-opacity=".45"/><stop offset="1" stop-color="#9db4ff" stop-opacity="0"/></radialGradient>
            <mask id="wxm" maskUnits="userSpaceOnUse" x="-20" y="-20" width="40" height="40"><rect x="-20" y="-20" width="40" height="40" fill="#fff"/><circle cx="6.5" cy="-4" r="11" fill="#000"/></mask>
          </defs>
          <path id="wx-arc" class="arc-bg" pathLength="100"/>
          <path id="wx-arcp" class="arc-fg" pathLength="100"/>
          <g id="wx-sun"><circle r="36" fill="url(#wxg)"/><circle r="15.5" fill="#ffd60a"/><g id="wx-rays"></g></g>
          <g id="wx-moon" style="display:none"><circle r="32" fill="url(#wxgm)"/><circle r="13" fill="#e8eefc" mask="url(#wxm)"/></g>
        </svg>
        <div class="wx-sr"><small>Terbit</small><b id="wx-rise">--:--</b></div>
        <div class="wx-now"><span id="wx-ico"></span><b id="wx-temp">--°</b><span class="wx-cond" id="wx-cond"></span></div>
        <div class="wx-clock" id="wx-clock">--:--</div>
        <div class="wx-ss"><small>Terbenam</small><b id="wx-set">--:--</b></div>
      </div>
      <div class="wx-top">
        <div class="wx-id">
          <div class="wx-date" id="wx-date"></div>
          <button class="wx-loc" id="wx-loc" title="Ganti lokasi">${svg(PIN)}<span id="wx-name">Mencari lokasi</span></button>
        </div>
        <div class="wx-ctl">
          <div class="wx-seg" id="wx-seg">
            <button data-m="hour">Jam</button><button data-m="day">7 Hari</button><button data-m="info">Detail</button>
          </div>
          <button class="wx-ic" id="wx-unit" title="Ganti satuan suhu"></button>
          <button class="wx-ic" id="wx-search" title="Cari lokasi" aria-label="Cari lokasi">${svg(SEARCH)}</button>
        </div>
      </div>
      <div class="wx-panel" id="wx-panel"></div>
      <div class="wx-state" id="wx-state" hidden><span id="wx-msg"></span><button class="wx-retry" id="wx-retry">Coba lagi</button></div>
    </div>`;

  const q = (s) => c.querySelector(s);
  const root = q('.wx');
  const arcBg = q('#wx-arc'), arcFg = q('#wx-arcp'), sunG = q('#wx-sun'), moonG = q('#wx-moon');
  arcBg.setAttribute('d', arcPath());
  arcFg.setAttribute('d', arcPath());
  let rays = '';
  for (let i = 0; i < 8; i++) {
    const a = ((i * 45 + 14) * Math.PI) / 180, r = i % 2 ? 24.5 : 27;
    rays += `<circle cx="${(Math.cos(a) * r).toFixed(1)}" cy="${(Math.sin(a) * r).toFixed(1)}" r="2.2" fill="#ffd60a"/>`;
  }
  q('#wx-rays').innerHTML = rays;

  const cache = {};
  const txt = (k, node, v) => { if (cache[k] !== v) { cache[k] = v; node.textContent = v; } };
  const html = (k, node, v) => { if (cache[k] !== v) { cache[k] = v; node.innerHTML = v; } };

  function paintSky() {
    const d = st.data;
    if (!d) return;
    const { day, p } = sunProgress(d);
    const pt = arcPoint(p);
    arcFg.style.strokeDasharray = `${(p * 100).toFixed(2)} 100`;
    const tr = `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})`;
    sunG.setAttribute('transform', tr);
    moonG.setAttribute('transform', tr);
    sunG.style.display = day ? '' : 'none';
    moonG.style.display = day ? 'none' : '';
    root.classList.toggle('night', !day);
  }

  function panelHtml() {
    const d = st.data, u = st.units, c0 = d.current, d0 = d.daily[0];
    if (st.mode === 'hour') {
      return '<div class="wx-cells">' + pickHours(d, 7).map((h, i) =>
        `<div class="hc"><span class="hc-t">${i === 0 ? 'Kini' : hhmm(h.t)}</span>${icon(h.code, h.isDay)}<b>${fmtTemp(h.temp, u)}</b><i class="hc-p">${h.pop >= 30 ? h.pop + '%' : ''}</i></div>`).join('') + '</div>';
    }
    if (st.mode === 'day') {
      return '<div class="wx-cells">' + d.daily.slice(0, 7).map((x, i) =>
        `<div class="hc"><span class="hc-t">${i === 0 ? 'Hari ini' : dayName(x.date)}</span>${icon(x.code, true)}<b>${fmtTemp(x.max, u)}<s>${fmtTemp(x.min, u)}</s></b><i class="hc-p">${x.pop >= 30 ? x.pop + '%' : ''}</i></div>`).join('') + '</div>';
    }
    const tiles = [
      ['Terasa', fmtTemp(c0.feels, u), label(c0.code)],
      ['Angin', `${Math.round(c0.wind)}<small> km/j</small>`, `<span class="arr" style="transform:rotate(${((c0.windDir || 0) + 180) % 360}deg)">${svg(ARROW)}</span>${compass(c0.windDir)}`],
      ['Lembap', `${Math.round(c0.humidity)}<small>%</small>`, `Awan ${Math.round(c0.cloud)}%`],
      ['Indeks UV', `${Math.round(d0.uv || 0)}`, uvLevel(d0.uv || 0)],
      ['Hujan', `${d0.pop == null ? 0 : d0.pop}<small>%</small>`, `${(c0.precip || 0).toFixed(1)} mm`],
      ['Tekanan', `${Math.round(c0.pressure)}`, 'hPa']
    ];
    return '<div class="wx-cells">' + tiles.map((t) => `<div class="it"><span class="it-l">${t[0]}</span><b>${t[1]}</b><span class="it-s">${t[2]}</span></div>`).join('') + '</div>';
  }

  function paintAll() {
    if (!root.isConnected) return off();
    const stateEl = q('#wx-state');
    const d = st.data;
    txt('name', q('#wx-name'), st.loc ? st.loc.name : 'Mencari lokasi');
    q('#wx-unit').textContent = st.units === 'f' ? '°F' : '°C';
    q('#wx-seg').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.m === st.mode));

    if (!d) {
      stateEl.hidden = false;
      q('#wx-msg').textContent = st.error || (st.locating ? 'Mencari lokasi...' : 'Memuat cuaca...');
      q('#wx-retry').hidden = !st.error;
      return;
    }
    stateEl.hidden = true;
    const c0 = d.current;
    html('ico', q('#wx-ico'), icon(c0.code, c0.isDay));
    txt('temp', q('#wx-temp'), fmtTemp(c0.temp, st.units));
    txt('cond', q('#wx-cond'), label(c0.code));
    txt('rise', q('#wx-rise'), hhmm(d.daily[0].sunrise));
    txt('set', q('#wx-set'), hhmm(d.daily[0].sunset));
    html('panel', q('#wx-panel'), panelHtml());
    paintSky();
    tickClock(true);
  }

  // Jam dan tanggal di lokasi (zona waktu lokasi, bukan komputer)
  let lastMin = -1, lastSky = 0;
  function tickClock(force) {
    const d = st.data;
    if (!d) return;
    const now = new Date();
    txt('clock', q('#wx-clock'), now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: d.tz }));
    txt('date', q('#wx-date'), now.toLocaleDateString(getLanguage() === 'en' ? 'en-US' : 'id-ID', { weekday: 'long', day: 'numeric', month: 'short', timeZone: d.tz }));
    const m = Math.floor(Date.now() / 60000);
    if (force || m !== lastMin) { lastMin = m; if (st.mode === 'hour') html('panel', q('#wx-panel'), panelHtml()); }
    if (force || Date.now() - lastSky > 20000) { lastSky = Date.now(); paintSky(); }
  }

  const off = onWx(paintAll);
  const iv = setInterval(() => {
    if (!root.isConnected) return clearInterval(iv);
    tickClock(false);
    if (st.data && Date.now() - st.fetchedAt > STALE_MS) load(false);
  }, 1000);
  paintAll();
  load(false);

  q('#wx-seg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { st.mode = b.dataset.m; paintAll(); } });
  q('#wx-unit').addEventListener('click', () => { st.units = st.units === 'c' ? 'f' : 'c'; saveCfg(); paintAll(); });
  const openSearch = () => { st.screen = 'search'; draw(c); };
  q('#wx-search').addEventListener('click', openSearch);
  q('#wx-loc').addEventListener('click', openSearch);
  q('#wx-retry').addEventListener('click', () => { if (st.loc) load(true); else autoLocate().then(() => load(true)); });
}

// ================= Cari lokasi =================
function drawSearch(c) {
  island.dataset.sub = 'weather-search';
  c.innerHTML = `
    <div class="view wxs">
      ${BACK_BTN}
      <div class="wxs-top">
        <input class="wxs-in" id="wxs-in" type="text" placeholder="Cari kota atau daerah" autocomplete="off" maxlength="60">
        <button class="wxs-gps" id="wxs-gps">${svg(PIN)}Lokasi Windows</button>
      </div>
      <div class="wxs-note" id="wxs-note"></div>
      <div class="wxs-list" id="wxs-list"></div>
    </div>`;
  const q = (s) => c.querySelector(s);
  const input = q('#wxs-in'), list = q('#wxs-list'), note = q('#wxs-note');
  let items = [], timer = 0, token = 0;

  function paintList(rows, emptyText) {
    items = rows;
    list.innerHTML = rows.length
      ? rows.map((r, i) => `<button class="wxs-row" data-i="${i}"><b>${esc(r.name)}</b><span>${esc(r.admin || '')}</span></button>`).join('')
      : `<div class="wxs-empty">${emptyText || ''}</div>`;
  }
  function showRecent() {
    note.textContent = st.recent.length ? 'Terakhir dipakai' : '';
    paintList(st.recent.map((r) => ({ ...r, admin: `${r.lat.toFixed(2)}, ${r.lon.toFixed(2)}` })), 'Ketik nama kota untuk mencari, atau pakai lokasi Windows');
  }
  showRecent();

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const v = input.value.trim();
    if (v.length < 2) return showRecent();
    note.textContent = 'Mencari...';
    timer = setTimeout(async () => {
      const my = ++token;
      const res = await window.api.weatherSearch(v);
      if (my !== token || !input.isConnected) return;
      note.textContent = res.length ? 'Hasil pencarian' : '';
      paintList(res, 'Lokasi tidak ditemukan');
    }, 350);
  });

  const back = () => { st.screen = 'main'; draw(c); };
  list.addEventListener('click', (e) => {
    const b = e.target.closest('.wxs-row');
    const r = b && items[Number(b.dataset.i)];
    if (!r) return;
    setLoc({ lat: r.lat, lon: r.lon, name: r.name }, false);
    back();
  });
  q('#wxs-gps').addEventListener('click', async () => {
    note.textContent = 'Mencari lokasi Windows...';
    const r = await window.api.weatherLocate();
    if (!input.isConnected) return;
    if (r && r.ok) { setLoc({ lat: r.lat, lon: r.lon, name: r.name }, true); back(); }
    else note.textContent = 'Lokasi tidak bisa dibaca. Aktifkan Layanan Lokasi di Windows, atau cari manual.';
  });
  q('#sub-back').addEventListener('click', back);
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') back(); });
  window.api.focusWindow();
  setTimeout(() => { if (input.isConnected) input.focus(); }, 80);
}
