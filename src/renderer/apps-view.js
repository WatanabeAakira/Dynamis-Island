// Tab Pintasan Aplikasi: grid atau daftar aplikasi, cari, urut (seret), menu klik kanan, dan pemilih aplikasi terpasang.
import { BACK_BTN } from './timer-view.js';
import { pickColors } from './color.js';

const island = document.getElementById('island');
const svg = (b) => `<svg viewBox="0 0 24 24" aria-hidden="true">${b}</svg>`;
const I = {
  logo: '<rect x="4" y="4" width="7" height="7" rx="2" fill="currentColor"/><rect x="13" y="4" width="7" height="7" rx="2" fill="currentColor"/><rect x="4" y="13" width="7" height="7" rx="2" fill="currentColor"/><rect x="13" y="13" width="7" height="7" rx="2" fill="currentColor"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  sort: '<path d="M8 4v16M4 8l4-4 4 4M16 20V4M12 16l4 4 4-4"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  list: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8z"/>',
  open: '<path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
  shield: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/>',
  folder: '<path d="M3.5 7.5a2.5 2.5 0 0 1 2.5-2.5h3.6l2 2.4H18a2.5 2.5 0 0 1 2.5 2.5v7.6A2.5 2.5 0 0 1 18 19.5H6a2.5 2.5 0 0 1-2.5-2.5z"/>',
  edit: '<path d="M4 20h4l10-10-4-4L4 16zM13.5 6.5l4 4"/>',
  image: '<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M5 17l5-5 4 4 2-2 3 3"/>',
  undo: '<path d="M9 7L4 12l5 5M4 12h10a5 5 0 0 1 0 10"/>',
  trash: '<path d="M5 7h14M9 7V4.5h6V7M7 7l1 12.5h8L17 7M10.5 11v5M13.5 11v5"/>',
  pin: '<path d="M9 4h6l-1 5 3 3v2H7v-2l3-3zM12 14v6"/>',
  more: '<circle cx="6" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="18" cy="12" r="1.5" fill="currentColor"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>'
};
const esc = (t) => String(t).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const APPS_DEFAULTS = { view: 'grid', size: 'md', style: 'default', sort: 'manual', favCount: 4, favFirst: true, compactLabels: false, compactMode: 'icons' };
const SORTS = [['manual', 'Urutan saya'], ['name', 'Nama (A-Z)'], ['recent', 'Terakhir dipakai']];
const SORT_FN = {
  manual: (a, b) => a.order - b.order,
  name: (a, b) => a.name.localeCompare(b.name, 'id', { sensitivity: 'base' }),
  recent: (a, b) => (b.lastUsed || 0) - (a.lastUsed || 0) || a.order - b.order
};
const hue = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
const iconHtml = (it) => (it.icon
  ? `<img src="${it.icon}" alt="" draggable="false">`
  : `<span class="lt" style="background:hsl(${hue(it.name)} 40% 32%)">${esc((it.name || '?').trim().charAt(0).toUpperCase())}</span>`);

// Warna dominan ikon untuk gaya "Aksen" (dihitung sekali per ikon)
const domCache = new Map();
function dominant(url) {
  return new Promise((res) => {
    if (typeof Image === 'undefined') return res(null);
    const img = new Image();
    img.onload = () => {
      try {
        const cv = document.createElement('canvas');
        cv.width = cv.height = 24;
        const x = cv.getContext('2d', { willReadFrequently: true });
        x.drawImage(img, 0, 0, 24, 24);
        const cols = pickColors(x.getImageData(0, 0, 24, 24).data);
        res(cols ? `rgb(${cols[0].join(',')})` : null);
      } catch { res(null); }
    };
    img.onerror = () => res(null);
    img.src = url;
  });
}

// Pendengar IPC didaftarkan sekali, diteruskan ke tampilan yang aktif
let active = null;
let pendingFlash = null;
window.api.onDataChanged((d) => { if (d && d.kind === 'apps' && active) active.refresh(); });
window.api.onSettings((s) => { if (active) active.applyT(s); });
document.addEventListener('apps:flash', (e) => { if (active) active.flashAdd(e.detail); });

const addText = (r) => {
  if (!r) return '';
  const parts = [];
  if (r.added) parts.push(`${r.added} aplikasi ditambahkan`);
  if (r.duplicates) parts.push(`${r.duplicates} sudah ada`);
  if (r.skipped) parts.push(`${r.skipped} bukan aplikasi (.exe, .lnk, .bat, .cmd, .url)`);
  return parts.join(', ') || 'Tidak ada yang ditambahkan';
};

export function renderApps(c) {
  island.dataset.sub = '';
  c.innerHTML = `
    <div class="view ft ap sz-md v-grid st-default">
      <div class="ft-head">
        <div class="ft-id"><i class="ft-logo">${svg(I.logo)}</i><div><b>Pintasan Aplikasi</b><small id="ap-count">0 aplikasi</small></div></div>
        <div class="ft-sbox">${svg(I.search)}<input id="ap-q" type="text" placeholder="Cari aplikasi..." autocomplete="off" maxlength="60"></div>
        <div class="ft-ctl">
          <button class="ft-ib" id="ap-sort" aria-label="Urutkan" title="Urutkan">${svg(I.sort)}</button>
          <div class="ft-vs"><button data-v="grid" aria-label="Tampilan grid" title="Grid">${svg(I.grid)}</button><button data-v="list" aria-label="Tampilan daftar" title="Daftar">${svg(I.list)}</button></div>
          <button class="ft-add" id="ap-add" aria-label="Tambah aplikasi" title="Tambah aplikasi">${svg(I.plus)}</button>
        </div>
      </div>
      <div class="ft-body" id="ap-body"></div>
      <div class="ft-foot">${svg(I.pin)}<span id="ap-hint"></span><span class="grow"></span><span id="ap-n2"></span><button class="ft-ib sm" id="ap-more" aria-label="Lainnya">${svg(I.more)}</button></div>
      <div class="ft-flash" id="ap-flash" hidden></div>
    </div>`;

  const q = (s) => c.querySelector(s);
  const root = q('.ap'), body = q('#ap-body');
  let items = [], T = { ...APPS_DEFAULTS }, query = '', sig = '', menu = null, flashTimer = 0, dragId = null;

  const saveT = (patch) => window.api.setSettings({ apps: { ...T, ...patch } });
  const itemOf = (id) => items.find((i) => i.id === id);
  const canReorder = () => T.sort === 'manual' && !query.trim();

  async function refresh() { try { items = await window.api.appsList(); } catch { items = []; } paint(); }
  function applyT(s) { T = { ...APPS_DEFAULTS, ...((s && s.apps) || {}) }; sig = ''; paint(); }

  function visible() {
    const k = query.trim().toLowerCase();
    return items.filter((it) => !k || it.name.toLowerCase().includes(k))
      .sort((a, b) => (T.favFirst ? Number(b.favorite) - Number(a.favorite) : 0) || SORT_FN[T.sort](a, b));
  }

  // ---------- Tampilan ----------
  const badge = (it) => (!it.exists ? '<i class="bd bd-miss" title="File aplikasi tidak ditemukan">!</i>' : it.favorite ? `<i class="bd bd-pin" title="Favorit">${svg(I.star)}</i>` : '');
  const cls = (it) => `${it.exists ? '' : ' miss'}${it.favorite ? ' fav' : ''}`;
  const attrs = (it, drag) => `role="button" tabindex="0" draggable="${drag}" data-id="${it.id}" title="${esc(it.name)}&#10;${esc(it.path)}"`;
  const tile = (it, drag) => `<div class="it${cls(it)}" ${attrs(it, drag)}><span class="ic">${iconHtml(it)}${badge(it)}</span><span class="nm">${esc(it.name)}</span></div>`;
  const rowHtml = (it, drag) => `<div class="rw${cls(it)}" ${attrs(it, drag)}><span class="ic">${iconHtml(it)}${badge(it)}</span><div class="rn"><b>${esc(it.name)}</b><small>${esc(it.path)}</small></div><span class="rs">${it.exists ? '' : 'Hilang'}</span></div>`;
  const addTile = `<div class="it add" role="button" tabindex="0" data-act="add"><span class="plus">${svg(I.plus)}</span><span class="nm">Tambah aplikasi</span></div>`;

  function paint() {
    if (!root.isConnected) { if (active === api) active = null; return; }
    const list = visible();
    const n = `${items.length} aplikasi`;
    q('#ap-count').textContent = n;
    q('#ap-n2').textContent = n;
    q('#ap-hint').textContent = canReorder() ? 'Seret untuk mengurutkan, klik kanan untuk opsi lain' : 'Klik kanan untuk opsi lain';
    root.className = `view ft ap sz-${T.size} v-${T.view} st-${T.style}${root.classList.contains('over') ? ' over' : ''}`;
    root.querySelectorAll('.ft-vs button').forEach((b) => b.classList.toggle('on', b.dataset.v === T.view));

    const next = JSON.stringify([list.map((i) => [i.id, i.exists, i.favorite, i.name, i.icon && i.icon.length]), T.view, T.size, T.style, T.sort, T.favFirst, items.length, query]);
    if (next === sig) return; // tidak ada perubahan: jaga posisi gulir dan proses seret
    sig = next;
    const top = body.scrollTop;
    const drag = canReorder();
    body.classList.toggle('empty', !items.length || !list.length);
    if (!items.length) {
      body.innerHTML = `<div class="ft-empty"><div class="eic ap-eic">${svg(I.logo)}</div><b>Belum ada pintasan aplikasi</b><span>Seret file .exe atau .lnk ke sini, atau tambahkan lewat tombol di bawah</span><div class="eb"><button class="mbtn" data-act="browse">Jelajahi file</button><button class="mbtn" data-act="installed">Dari aplikasi terpasang</button></div></div>`;
    } else if (!list.length) {
      body.innerHTML = `<div class="ft-empty"><span>Tidak ada aplikasi bernama "${esc(query)}"</span></div>`;
    } else {
      body.innerHTML = list.map((it) => (T.view === 'grid' ? tile(it, drag) : rowHtml(it, drag))).join('') + (T.view === 'grid' && !query.trim() ? addTile : '');
    }
    body.scrollTop = top;
    if (T.style === 'accent') paintAccent();
  }

  function paintAccent() {
    body.querySelectorAll('[data-id]').forEach((el) => {
      const it = itemOf(el.dataset.id);
      if (!it || !it.icon) return;
      if (domCache.has(it.icon)) { const col = domCache.get(it.icon); if (col) el.style.setProperty('--tc', col); return; }
      dominant(it.icon).then((col) => { domCache.set(it.icon, col); if (col && el.isConnected) el.style.setProperty('--tc', col); });
    });
  }

  function flash(text) {
    const el = q('#ap-flash');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { el.hidden = true; }, 3000);
  }
  const flashAdd = (r) => { const t = addText(r); if (t) flash(t); };

  // ---------- Menu ----------
  function closeMenu() {
    if (!menu) return;
    menu.remove(); menu = null;
    document.removeEventListener('pointerdown', outside, true);
  }
  function outside(e) { if (menu && !menu.contains(e.target)) closeMenu(); }
  function showMenu(entries, x, y) {
    closeMenu();
    const m = document.createElement('div');
    m.className = 'ft-menu';
    m.setAttribute('role', 'menu');
    m.innerHTML = entries.map((e, i) => (e.sep
      ? '<div class="msep"></div>'
      : `<button class="mi${e.red ? ' red' : ''}" role="menuitem" data-i="${i}"${e.disabled ? ' disabled' : ''}>${e.icon ? svg(e.icon) : '<span class="mgap"></span>'}<span>${esc(e.label)}</span>${e.check ? svg(I.check) : ''}</button>`)).join('');
    root.append(m);
    const rb = root.getBoundingClientRect();
    m.style.left = `${Math.max(6, Math.min(x - rb.left, rb.width - m.offsetWidth - 6))}px`;
    m.style.top = `${Math.max(6, Math.min(y - rb.top, rb.height - m.offsetHeight - 6))}px`;
    m.addEventListener('click', (ev) => {
      const b = ev.target.closest('.mi');
      if (!b || b.disabled) return;
      if (entries[Number(b.dataset.i)].action(b) !== 'keep') closeMenu();
    });
    menu = m;
    setTimeout(() => { if (menu === m) document.addEventListener('pointerdown', outside, true); }, 0);
  }
  const below = (btn) => { const r = btn.getBoundingClientRect(); return [r.right - 214, r.bottom + 6]; };

  async function launch(it, admin) {
    const r = await window.api.appsLaunch(it.id, admin);
    if (r && !r.ok) flash(r.error === 'missing' ? 'File aplikasi tidak ditemukan. Klik kanan untuk menghapus pintasannya.' : 'Aplikasi ini tidak bisa dibuka');
  }
  function addMenu(x, y) {
    showMenu([
      { label: 'Jelajahi file...', icon: I.folder, action: () => window.api.appsAddDialog().then(flashAdd) },
      { label: 'Dari aplikasi terpasang...', icon: I.logo, action: () => drawPicker(c) }
    ], x, y);
  }
  function itemMenu(it, x, y) {
    showMenu([
      { label: 'Buka', icon: I.open, disabled: !it.exists, action: () => launch(it, false) },
      { label: 'Jalankan sebagai Administrator', icon: I.shield, disabled: !it.exists, action: () => launch(it, true) },
      { label: 'Buka lokasi file', icon: I.folder, disabled: !it.exists, action: () => window.api.appsReveal(it.id) },
      { sep: true },
      { label: 'Ganti nama', icon: I.edit, action: () => startRename(it.id) },
      { label: 'Ganti ikon...', icon: I.image, action: () => window.api.appsSetIcon(it.id) },
      ...(it.custom ? [{ label: 'Atur ulang ikon', icon: I.undo, action: () => window.api.appsResetIcon(it.id) }] : []),
      { label: it.favorite ? 'Hapus dari favorit' : 'Jadikan favorit', icon: I.star, action: () => window.api.appsFavorite(it.id, !it.favorite) },
      { sep: true },
      { label: 'Hapus pintasan', icon: I.trash, red: true, action: () => window.api.appsRemove(it.id) }
    ], x, y);
  }

  // Ganti nama langsung di tempat
  function startRename(id) {
    const it = itemOf(id);
    const host = body.querySelector(`[data-id="${id}"]`);
    const label = host && host.querySelector('.nm, .rn b');
    if (!it || !label) return;
    const input = document.createElement('input');
    input.type = 'text'; input.className = 'ap-rename'; input.value = it.name; input.maxLength = 60;
    host.draggable = false;
    label.replaceWith(input);
    window.api.focusWindow();
    input.focus(); input.select();
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      const v = input.value.trim();
      if (save && v && v !== it.name) window.api.appsRename(id, v); else { sig = ''; paint(); }
    };
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); });
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('blur', () => finish(true));
  }

  // ---------- Peristiwa ----------
  const idOf = (e) => { const el = e.target.closest('.it[data-id], .rw[data-id]'); return el ? el.dataset.id : null; };
  body.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (act) {
      if (act.dataset.act === 'browse') window.api.appsAddDialog().then(flashAdd);
      else if (act.dataset.act === 'installed') drawPicker(c);
      else { const [x, y] = below(act); addMenu(Math.min(x + 214, x + 214), y - 70); }
      return;
    }
    const it = itemOf(idOf(e));
    if (it) launch(it, false);
  });
  body.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target.tagName === 'INPUT') return;
    const it = itemOf(idOf(e));
    if (it) launch(it, false);
  });
  body.addEventListener('contextmenu', (e) => {
    const it = itemOf(idOf(e));
    if (!it) return;
    e.preventDefault();
    itemMenu(it, e.clientX, e.clientY);
  });

  // Urutkan dengan seret (hanya saat urutan manual dan tanpa pencarian)
  const dropInfo = (e) => {
    const t = e.target.closest('.it[data-id], .rw[data-id]');
    if (!t || t.dataset.id === dragId) return null;
    const r = t.getBoundingClientRect();
    const before = T.view === 'grid' ? e.clientX < r.left + r.width / 2 : e.clientY < r.top + r.height / 2;
    return { id: t.dataset.id, el: t, before };
  };
  const clearMarks = () => body.querySelectorAll('.drop-before, .drop-after, .dragging').forEach((el) => el.classList.remove('drop-before', 'drop-after', 'dragging'));
  body.addEventListener('dragstart', (e) => {
    const id = idOf(e);
    if (!id || !canReorder()) { e.preventDefault(); return; }
    dragId = id;
    e.dataTransfer.setData('text/x-island-app', id);
    e.dataTransfer.effectAllowed = 'move';
    e.target.closest('[data-id]').classList.add('dragging');
  });
  body.addEventListener('dragover', (e) => {
    if (!dragId) return;
    e.preventDefault();
    body.querySelectorAll('.drop-before, .drop-after').forEach((el) => el.classList.remove('drop-before', 'drop-after'));
    const d = dropInfo(e);
    if (d) d.el.classList.add(d.before ? 'drop-before' : 'drop-after');
  });
  body.addEventListener('drop', (e) => {
    if (!dragId) return;
    e.preventDefault();
    const d = dropInfo(e);
    const moving = dragId;
    dragId = null; clearMarks();
    if (!d) return;
    const ids = visible().map((i) => i.id).filter((id) => id !== moving);
    const at = ids.indexOf(d.id) + (d.before ? 0 : 1);
    ids.splice(at, 0, moving);
    window.api.appsReorder(ids);
  });
  body.addEventListener('dragend', () => { dragId = null; clearMarks(); });

  q('#ap-q').addEventListener('input', (e) => { query = e.target.value; paint(); });
  q('#ap-q').addEventListener('keydown', (e) => { if (e.key === 'Escape' && query) { query = ''; e.target.value = ''; sig = ''; paint(); } });
  q('#ap-sort').addEventListener('click', (e) => {
    const [x, y] = below(e.currentTarget);
    showMenu(SORTS.map(([v, t]) => ({ label: t, check: T.sort === v, action: () => saveT({ sort: v }) })), x, y);
  });
  root.querySelector('.ft-vs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) saveT({ view: b.dataset.v }); });
  q('#ap-add').addEventListener('click', (e) => { const [x, y] = below(e.currentTarget); addMenu(x, y); });
  q('#ap-more').addEventListener('click', (e) => {
    const [x, y] = below(e.currentTarget);
    showMenu([
      { label: 'Pengaturan Pintasan Aplikasi...', icon: I.gear, action: () => window.api.openSettings('apps') },
      { sep: true },
      { label: 'Hapus semua pintasan', icon: I.trash, red: true, disabled: !items.length, action: (b) => {
        if (!b.dataset.armed) { b.dataset.armed = '1'; b.querySelector('span').textContent = 'Yakin hapus semua?'; return 'keep'; }
        return window.api.appsClear().then(() => flash('Semua pintasan dihapus'));
      } }
    ], x, y);
  });
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu) { e.stopPropagation(); closeMenu(); } });

  const api = { refresh, applyT, flashAdd };
  active = api;
  window.api.getSettings().then(applyT);
  paint();
  refresh();
  if (pendingFlash) { flash(pendingFlash); pendingFlash = null; }
}

// ================= Pemilih aplikasi terpasang =================
function drawPicker(c) {
  island.dataset.sub = '';
  active = null;
  c.innerHTML = `
    <div class="view ft ap pk">
      ${BACK_BTN}
      <div class="pk-head"><b>Aplikasi terpasang</b><div class="ft-sbox">${svg(I.search)}<input id="pk-q" type="text" placeholder="Cari aplikasi..." autocomplete="off" maxlength="60"></div></div>
      <div class="pk-list" id="pk-list"></div>
      <div class="pk-foot"><span id="pk-n">Belum ada yang dipilih</span><button class="mbtn" id="pk-add" disabled>Tambah</button></div>
    </div>`;
  const q = (s) => c.querySelector(s);
  const root = q('.pk'), list = q('#pk-list');
  let rows = [], selected = new Set(), token = 0, timer = 0;

  function paintSel() {
    q('#pk-n').textContent = selected.size ? `${selected.size} aplikasi dipilih` : 'Belum ada yang dipilih';
    q('#pk-add').disabled = !selected.size;
    q('#pk-add').textContent = selected.size ? `Tambah ${selected.size}` : 'Tambah';
  }
  function paintList() {
    list.innerHTML = rows.length
      ? rows.map((a, i) => `<label class="pr${a.added ? ' added' : ''}"><input type="checkbox" data-i="${i}"${a.added ? ' disabled checked' : selected.has(a.path) ? ' checked' : ''}><span class="pi" data-p="${esc(a.path)}"><span class="lt" style="background:hsl(${hue(a.name)} 40% 32%)">${esc(a.name.charAt(0).toUpperCase())}</span></span><b>${esc(a.name)}</b><small>${a.added ? 'Sudah ditambahkan' : ''}</small></label>`).join('')
      : '<div class="ft-empty"><span>Tidak ada aplikasi yang cocok</span></div>';
    list.querySelectorAll('.pi').forEach((el, i) => {
      if (i >= 40) return; // ikon hanya dimuat untuk baris yang langsung terlihat
      window.api.appsIconForPath(el.dataset.p).then((url) => { if (url && el.isConnected) el.innerHTML = `<img src="${url}" alt="">`; });
    });
  }
  async function load(query) {
    const my = ++token;
    const res = await window.api.appsInstalled(query);
    if (my !== token || !root.isConnected) return;
    rows = res; paintList();
  }
  list.addEventListener('change', (e) => {
    const cb = e.target.closest('input[type=checkbox]');
    if (!cb) return;
    const a = rows[Number(cb.dataset.i)];
    if (cb.checked) selected.add(a.path); else selected.delete(a.path);
    paintSel();
  });
  q('#pk-q').addEventListener('input', (e) => { clearTimeout(timer); timer = setTimeout(() => load(e.target.value), 200); });
  q('#pk-q').addEventListener('keydown', (e) => { if (e.key === 'Escape') renderApps(c); });
  q('#sub-back').addEventListener('click', () => renderApps(c));
  q('#pk-add').addEventListener('click', async () => {
    const r = await window.api.appsAddInstalled([...selected]);
    pendingFlash = addText(r);
    renderApps(c);
  });
  paintSel();
  load('');
  window.api.focusWindow();
  setTimeout(() => { if (root.isConnected) q('#pk-q').focus(); }, 80);
}
