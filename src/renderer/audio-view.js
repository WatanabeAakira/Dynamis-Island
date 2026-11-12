// Tab Audio Control (desain baru): volume sistem, perangkat output, dan daftar aplikasi yang sedang bersuara.
import { audio, onAudio, watch, setMasterVolume, setMasterMute, setAppVolume, setAppMute } from './audio-link.js';
import { makeSlider } from './slider.js';

const island = document.getElementById('island');
const svg = (b) => `<svg viewBox="0 0 24 24" aria-hidden="true">${b}</svg>`;
const SPK = '<path d="M11 5L6.5 9H3v6h3.5L11 19z"/>';
const I = {
  logo: SPK + '<path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.5 6a8.5 8.5 0 0 1 0 12"/>',
  more: '<circle cx="6" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="18" cy="12" r="1.5" fill="currentColor"/>',
  head: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  refresh: '<path d="M4 11a8 8 0 0 1 14.3-4.9M20 13a8 8 0 0 1-14.3 4.9M18.5 3v4.5H14M5.5 21v-4.5H10"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  hide: '<path d="M3 3l18 18M10.6 5.6A9.5 9.5 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.6 3.4M6.6 6.7C4 8.6 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.7 0 3.2-.5 4.5-1.2"/>',
  mute: SPK + '<path d="M16 9l5 6M21 9l-5 6"/>',
  open: '<path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>'
};
const hiddenSet = () => { try { return new Set(JSON.parse(localStorage.getItem('audio.hidden') || '[]')); } catch { return new Set(); } };
const saveHidden = (set) => { try { localStorage.setItem('audio.hidden', JSON.stringify([...set])); } catch {} };
const esc = (t) => String(t).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const hue = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
const BAR_K = [0.55, 0.9, 1, 0.7]; // tinggi relatif 4 batang aktivitas

export function speaker(vol, mute) {
  const wave = mute || vol <= 0.001 ? '<path d="M16 9l5 6M21 9l-5 6"/>'
    : vol < 0.5 ? '<path d="M15.5 9a4.2 4.2 0 0 1 0 6"/>'
    : '<path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.5 6a8.5 8.5 0 0 1 0 12"/>';
  return svg(SPK + wave);
}

let showAll = false;

export function renderAudio(c) {
  island.dataset.sub = 'audio';
  c.innerHTML = `
    <div class="view au">
      <header class="au-top">
        <span class="au-logo">${svg(I.logo)}</span>
        <div class="au-tt"><b>Audio Control</b><small id="au-sub">Memuat...</small></div>
        <button class="au-ib" id="au-more" aria-label="Lainnya" title="Lainnya">${svg(I.more)}</button>
      </header>
      <div class="au-sys">
        <span class="au-si" id="au-si">${speaker(0.5, false)}</span>
        <span class="au-sl">Volume sistem</span>
        <div class="sl big au-msl" id="au-msl"><i class="fill"></i><i class="knob"></i></div>
        <span class="au-pct" id="au-pct">--%</span>
        <button class="au-mb" id="au-mmute" aria-label="Bisukan volume sistem">${svg(I.mute)}</button>
      </div>
      <div class="au-dev">
        <span class="au-di">${svg(I.head)}</span>
        <span class="au-dl">Perangkat output</span>
        <select class="au-dn" id="au-dev" aria-label="Pilih perangkat output"><option value="">Menunggu perangkat</option></select>
      </div>
      <small class="au-status" id="au-status" role="status" aria-live="polite" hidden></small>
      <div class="au-list" id="au-list"></div>
      <div class="au-empty" id="au-empty" hidden></div>
      <div class="au-menu-host"></div>
    </div>`;

  const q = (s) => c.querySelector(s);
  const root = q('.au'), list = q('#au-list'), empty = q('#au-empty');
  const msl = makeSlider(q('#au-msl'), {
    onInput: (v) => { setMasterVolume(v); paintSys(v, audio.master && audio.master.mute); }
  });
  const rows = new Map();
  let order = '', menu = null;
  const openedAt = performance.now();
  let deviceSignature = '';
  let statusTimer = 0;
  const status = q('#au-status');

  function showStatus(text, error = false) {
    clearTimeout(statusTimer);
    status.textContent = text;
    status.classList.toggle('error', error);
    status.hidden = !text;
    if (text) statusTimer = setTimeout(() => { status.hidden = true; }, 4000);
  }

  const offHelper = window.api.onHelper((m) => {
    if (m && m.type === 'audio-output-result') {
      showStatus(m.ok ? 'Perangkat output diganti.' : (m.error || 'Perangkat output tidak dapat diganti.'), !m.ok);
    } else if (m && m.type === 'audio-open-result') {
      showStatus(m.ok ? 'Aplikasi dibuka.' : (m.error || 'Aplikasi tidak dapat dibuka.'), !m.ok);
    }
  });

  function paintSys(vol, mute) {
    q('#au-pct').textContent = `${Math.round(vol * 100)}%`;
    q('#au-si').innerHTML = speaker(vol, mute);
    q('#au-mmute').innerHTML = speaker(vol, mute);
    q('#au-mmute').classList.toggle('on', !!mute);
    q('#au-mmute').setAttribute('aria-label', mute ? 'Bunyikan volume sistem' : 'Bisukan volume sistem');
    root.classList.toggle('mm', !!mute);
  }

  // ---------- Menu kecil (dipakai juga oleh tombol ... di tiap baris) ----------
  function closeMenu() {
    if (!menu) return;
    menu.remove(); menu = null;
    document.removeEventListener('pointerdown', outside, true);
  }
  function outside(e) { if (menu && !menu.contains(e.target)) closeMenu(); }
  function openMenu(entries, anchor) {
    closeMenu();
    const m = document.createElement('div');
    m.className = 'ft-menu au-pop';
    m.innerHTML = entries.map((e, i) => (e.sep
      ? '<div class="msep"></div>'
      : `<button class="mi${e.red ? ' red' : ''}" role="menuitem" data-i="${i}">${e.icon ? svg(e.icon) : '<span class="mgap"></span>'}<span>${esc(e.label)}</span>${e.check ? svg(I.check) : ''}</button>`)).join('');
    root.append(m);
    const rb = root.getBoundingClientRect();
    const r = anchor.getBoundingClientRect();
    m.style.left = `${Math.max(6, Math.min(r.right - rb.left - m.offsetWidth, rb.width - m.offsetWidth - 6))}px`;
    m.style.top = `${Math.min(r.bottom - rb.top + 4, rb.height - m.offsetHeight - 6)}px`;
    m.addEventListener('click', (ev) => {
      const b = ev.target.closest('.mi');
      if (!b) return;
      entries[Number(b.dataset.i)].action();
      closeMenu();
    });
    menu = m;
    setTimeout(() => { if (menu === m) document.addEventListener('pointerdown', outside, true); }, 0);
  }

  // ---------- Baris aplikasi ----------
  function makeRow(g) {
    const el = document.createElement('div');
    el.className = 'ar';
    el.dataset.key = g.key;
    el.innerHTML = `
      <span class="ar-ico"></span>
      <div class="ar-nm"><b class="ar-name"></b><small class="ar-st"></small></div>
      <span class="ar-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
      <div class="sl ar-sl"><i class="fill"></i><i class="knob"></i></div>
      <span class="ar-pct"></span>
      <button class="ar-mb" aria-label="Bisukan"></button>
      <button class="ar-more" aria-label="Opsi lainnya">${svg(I.more)}</button>`;
    const r = {
      el, key: g.key, exe: null, vol: g.vol, mute: false, peak: 0, lvl: 0, k: '', name: g.name,
      nm: el.querySelector('.ar-name'), st: el.querySelector('.ar-st'), pct: el.querySelector('.ar-pct'),
      ico: el.querySelector('.ar-ico'), btn: el.querySelector('.ar-mb'), bars: [...el.querySelectorAll('.ar-bars i')]
    };
    r.slider = makeSlider(el.querySelector('.ar-sl'), {
      onInput: (v) => { r.vol = v; setAppVolume(g.key, v); r.pct.textContent = `${Math.round(v * 100)}%`; paintMute(r); }
    });
    r.btn.addEventListener('click', () => { r.mute = !r.mute; setAppMute(g.key, r.mute); paintMute(r); });
    el.querySelector('.ar-more').addEventListener('click', (e) => {
      const hidden = hiddenSet().has(g.key);
      openMenu([
        { label: r.mute ? 'Bunyikan' : 'Bisukan', icon: I.mute, action: () => { r.mute = !r.mute; setAppMute(g.key, r.mute); paintMute(r); } },
        ...(r.exe ? [{ label: 'Buka aplikasi', icon: I.open, action: () => {
          window.api.audioOpen(g.key).then((result) => {
            if (!result || !result.ok) showStatus(result && result.error || 'Aplikasi tidak dapat dibuka.', true);
          }).catch(() => showStatus('Aplikasi tidak dapat dibuka.', true));
        } }] : []),
        { sep: true },
        hidden
          ? { label: 'Tampilkan lagi di daftar', icon: I.eye, action: () => { const s = hiddenSet(); s.delete(g.key); saveHidden(s); order = ''; paint(); } }
          : { label: 'Sembunyikan dari daftar', icon: I.hide, red: true, action: () => { const s = hiddenSet(); s.add(g.key); saveHidden(s); order = ''; paint(); } }
      ], e.currentTarget);
    });
    return r;
  }

  function paintMute(r) {
    const k = r.mute || r.vol <= 0.001 ? 'm' : r.vol < 0.5 ? 'l' : 'h';
    if (r.k !== k) { r.k = k; r.btn.innerHTML = speaker(r.vol, r.mute); }
    r.btn.setAttribute('aria-label', r.mute ? 'Bunyikan' : 'Bisukan');
    r.el.classList.toggle('muted', r.mute);
  }

  function setIcon(r, g) {
    if (r.exe === g.exe) return;
    r.exe = g.exe;
    const letter = (g.name || '?').trim().charAt(0).toUpperCase();
    r.ico.innerHTML = `<span class="lt" style="background:hsl(${hue(g.name || '?')} 40% 32%)">${esc(letter)}</span>`;
    if (g.exe) {
      window.api.audioIcon(g.exe).then((url) => {
        if (url && r.exe === g.exe) r.ico.innerHTML = `<img src="${url}" alt="">`;
      });
    }
  }

  function visibleGroups() {
    const hidden = hiddenSet();
    return audio.sessions
      .filter((g) => (showAll ? true : g.active && !hidden.has(g.key)))
      .sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name, 'id', { sensitivity: 'base' }));
  }

  function paint() {
    if (!root.isConnected) {
      off();
      offHelper();
      clearTimeout(statusTimer);
      return;
    }
    const m = audio.master;
    if (m) {
      const devices = Array.isArray(audio.outputDevices) ? audio.outputDevices : [];
      const signature = JSON.stringify(devices.map((d) => [d.id, d.name]));
      if (signature !== deviceSignature) {
        deviceSignature = signature;
        const select = q('#au-dev');
        select.replaceChildren(...devices.map((d) => {
          const option = document.createElement('option');
          option.value = d.id;
          option.textContent = d.name;
          return option;
        }));
      }
      q('#au-dev').value = m.id || '';
      if (!msl.busy()) { msl.set(m.vol); paintSys(m.vol, m.mute); }
      else paintSys(m.vol, m.mute);
    }
    const gs = visibleGroups();
    q('#au-sub').textContent = `${audio.sessions.filter((g) => g.active).length} aplikasi aktif`;

    const keys = gs.map((g) => g.key);
    for (const [k, r] of rows) if (!keys.includes(k)) { r.el.remove(); rows.delete(k); }
    for (const g of gs) {
      let r = rows.get(g.key);
      if (!r) { r = makeRow(g); rows.set(g.key, r); }
      r.nm.textContent = g.name;
      r.vol = g.vol; r.mute = g.mute; r.peak = g.peak;
      if (!r.slider.busy()) { r.slider.set(g.vol); r.pct.textContent = `${Math.round(g.vol * 100)}%`; }
      const live = !g.mute && g.peak > 0.01;
      r.st.textContent = g.mute ? 'Dibisukan' : live ? 'Sedang bunyi' : g.active ? 'Aktif' : 'Hening';
      r.st.classList.toggle('on', live);
      r.el.classList.toggle('inactive', !g.active);
      paintMute(r);
      setIcon(r, g);
    }
    const ord = keys.join('|');
    if (ord !== order) { order = ord; list.append(...gs.map((g) => rows.get(g.key).el)); }

    const none = gs.length === 0;
    list.hidden = none;
    empty.hidden = !none;
    if (none) {
      const waiting = !m && performance.now() - openedAt > 2500;
      empty.textContent = waiting
        ? 'Menunggu data audio. Pastikan helper sudah di-build ulang (npm run build:helper).'
        : 'Belum ada aplikasi yang bersuara. Putar musik atau video untuk melihatnya di sini.';
    }
  }

  // Animasi: batang aktivitas mengikuti puncak suara, naik cepat dan turun pelan
  (function frame() {
    if (!root.isConnected) return;
    const fresh = performance.now() - audio.at < 1000;
    for (const r of rows.values()) {
      const target = fresh && !r.mute ? Math.sqrt(r.peak || 0) : 0;
      r.lvl = Math.max(target, r.lvl - 0.05);
      r.bars.forEach((b, i) => { b.style.transform = `scaleY(${Math.max(0.18, Math.min(1, r.lvl * BAR_K[i] + (r.lvl > 0.02 ? 0.12 : 0))).toFixed(3)})`; });
    }
    requestAnimationFrame(frame);
  })();

  // ---------- Menu header ----------
  q('#au-more').addEventListener('click', (e) => {
    const gs = visibleGroups();
    openMenu([
      { label: 'Bisukan semua aplikasi', icon: I.mute, action: () => gs.forEach((g) => setAppMute(g.key, true)) },
      { label: 'Bunyikan semua aplikasi', icon: I.mute, action: () => gs.forEach((g) => setAppMute(g.key, false)) },
      { sep: true },
      { label: 'Segarkan daftar', icon: I.refresh, action: () => window.api.helperSend({ cmd: 'audio-watch', mode: 'full' }) },
      { label: 'Tampilkan yang tidak aktif', icon: I.eye, check: showAll, action: () => { showAll = !showAll; order = ''; paint(); } },
      { label: 'Tampilkan lagi yang disembunyikan', icon: I.eye, disabled: !hiddenSet().size, action: () => { saveHidden(new Set()); order = ''; paint(); } }
    ], e.currentTarget);
  });
  q('#au-mmute').addEventListener('click', () => { if (audio.master) { setMasterMute(!audio.master.mute); paint(); } });
  q('#au-dev').addEventListener('change', (e) => {
    if (!e.currentTarget.value || e.currentTarget.value === (audio.master && audio.master.id)) return;
    const id = e.currentTarget.value;
    showStatus('Mengganti perangkat output...');
    window.api.audioSetOutput(id).then((result) => {
      if (!result || !result.ok) {
        q('#au-dev').value = audio.master && audio.master.id || '';
        showStatus(result && result.error || 'Perangkat output tidak dapat diganti.', true);
      }
    }).catch(() => showStatus('Perangkat output tidak dapat diganti.', true));
  });

  const off = onAudio(paint);
  watch('audio', 'full', root);
  paint();
  const waitTimer = setInterval(() => {
    if (!root.isConnected) {
      clearInterval(waitTimer);
      off();
      offHelper();
      clearTimeout(statusTimer);
    } else if (!audio.master) paint();
  }, 1000);
}
