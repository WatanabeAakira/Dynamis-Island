// Tab File Tray: grid atau daftar referensi file/folder, pencarian, urutan, menu klik kanan, dan seret keluar.
import { fileIcon, compactIcon } from './tray-icons.js';
import { focusWhenReady } from './input-focus.js';

const island = document.getElementById('island');
const svg = (b) => `<svg viewBox="0 0 24 24" aria-hidden="true">${b}</svg>`;
const I = {
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  sort: '<path d="M8 4v16M4 8l4-4 4 4M16 20V4M12 16l4 4 4-4"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  list: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8z"/>',
  open: '<path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
  folder: '<path d="M3.5 7.5a2.5 2.5 0 0 1 2.5-2.5h3.6l2 2.4H18a2.5 2.5 0 0 1 2.5 2.5v7.6A2.5 2.5 0 0 1 18 19.5H6a2.5 2.5 0 0 1-2.5-2.5z"/>',
  copy: '<rect x="8" y="8" width="11" height="12" rx="2"/><path d="M5 16V6a2 2 0 0 1 2-2h8"/>',
  trash: '<path d="M5 7h14M9 7V4.5h6V7M7 7l1 12.5h8L17 7M10.5 11v5M13.5 11v5"/>',
  pin: '<path d="M9 4h6l-1 5 3 3v2H7v-2l3-3zM12 14v6"/>',
  more: '<circle cx="6" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="18" cy="12" r="1.5" fill="currentColor"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>'
};
const esc = (t) => String(t).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const TRAY_DEFAULTS = { view: 'grid', sort: 'recent', size: 'md', compactIcon: 'outline', showPinned: true, showRef: false, pinnedFirst: true };
const SORTS = [['recent', 'Terbaru ditambahkan'], ['name', 'Nama (A-Z)'], ['type', 'Jenis']];

const fmtSize = (n) => (n == null ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(1)} GB`);
const SORT_FN = {
  recent: (a, b) => b.addedAt - a.addedAt,
  name: (a, b) => a.name.localeCompare(b.name, 'id', { sensitivity: 'base' }),
  type: (a, b) => (a.dir !== b.dir ? (a.dir ? -1 : 1) : a.ext.localeCompare(b.ext) || a.name.localeCompare(b.name, 'id', { sensitivity: 'base' }))
};

// Pendengar IPC didaftarkan sekali; diteruskan ke tampilan yang sedang aktif
let active = null;
window.api.onDataChanged((d) => { if (d && d.kind === 'tray' && active) active.refresh(); });
window.api.onSettings((s) => { if (active) active.applyT(s); });
document.addEventListener('tray:flash', (e) => { if (active) active.flashAdd(e.detail); });

export function renderFiles(c) {
  island.dataset.sub = '';
  c.innerHTML = `
    <div class="view ft sz-md v-grid">
      <div class="ft-head">
        <div class="ft-id"><i class="ft-logo">${compactIcon('filled')}</i><div><b>File Tray</b><small id="ft-count">0 item</small></div></div>
        <div class="ft-sbox" id="ft-sbox" hidden>${svg(I.search)}<input id="ft-q" type="text" placeholder="Cari nama atau lokasi file" autocomplete="off" maxlength="60"><button class="ft-ib sm" id="ft-sx" aria-label="Tutup pencarian">${svg(I.x)}</button></div>
        <div class="ft-ctl">
          <button class="ft-ib" id="ft-search" aria-label="Cari" title="Cari">${svg(I.search)}</button>
          <button class="ft-ib" id="ft-sort" aria-label="Urutkan" title="Urutkan">${svg(I.sort)}</button>
          <div class="ft-vs"><button data-v="grid" aria-label="Tampilan grid" title="Grid">${svg(I.grid)}</button><button data-v="list" aria-label="Tampilan daftar" title="Daftar">${svg(I.list)}</button></div>
          <button class="ft-add" id="ft-add" aria-label="Tambah" title="Tambah file atau folder">${svg(I.plus)}</button>
        </div>
      </div>
      <div class="ft-body" id="ft-body"></div>
      <div class="ft-foot">${svg(I.pin)}<span>Seret dan lepas file atau folder untuk menambahkan</span><span class="grow"></span><span id="ft-n2"></span><button class="ft-ib sm" id="ft-more" aria-label="Lainnya">${svg(I.more)}</button></div>
      <div class="ft-flash" id="ft-flash" hidden></div>
    </div>`;

  const q = (s) => c.querySelector(s);
  const root = q('.ft'), body = q('#ft-body');
  let items = [], T = { ...TRAY_DEFAULTS }, query = '', searching = false, sig = '', menu = null, flashTimer = 0;

  const saveT = (patch) => window.api.setSettings({ tray: { ...T, ...patch } });

  // ---------- Data ----------
  async function refresh() { try { items = await window.api.trayList(); } catch { items = []; } paint(); }
  function applyT(s) { T = { ...TRAY_DEFAULTS, ...((s && s.tray) || {}) }; sig = ''; paint(); }

  function visible() {
    const k = query.trim().toLowerCase();
    return items
      .filter((it) => !k || it.name.toLowerCase().includes(k) || it.path.toLowerCase().includes(k))
      .sort((a, b) => (T.pinnedFirst ? Number(b.pinned) - Number(a.pinned) : 0) || SORT_FN[T.sort](a, b));
  }

  // ---------- Tampilan ----------
  function badges(it) {
    let out = '';
    if (!it.exists) out += '<i class="bd bd-miss" title="File tidak ditemukan">!</i>';
    else if (it.pinned && T.showPinned) out += `<i class="bd bd-pin" title="Tersemat">${svg(I.star)}</i>`;
    if (T.showRef) out += `<i class="bd bd-ref" title="Disimpan sebagai referensi">${svg(I.link)}</i>`;
    return out;
  }
  const cls = (it) => `${it.exists ? '' : ' miss'}${it.pinned ? ' pin' : ''}`;
  const tile = (it) => `<div class="it${cls(it)}" role="button" tabindex="0" draggable="true" data-id="${it.id}" title="${esc(it.path)}"><span class="ic">${fileIcon(it)}${badges(it)}</span><span class="nm">${esc(it.name)}</span></div>`;
  const rowHtml = (it) => `<div class="rw${cls(it)}" role="button" tabindex="0" draggable="true" data-id="${it.id}" title="${esc(it.path)}"><span class="ic">${fileIcon(it)}${badges(it)}</span><div class="rn"><b>${esc(it.name)}</b><small>${esc(it.path)}</small></div><span class="rs">${it.exists ? (it.dir ? 'Folder' : fmtSize(it.size)) : 'Hilang'}</span></div>`;

  function paint() {
    if (!root.isConnected) { if (active === api) active = null; return; }
    const list = visible();
    q('#ft-count').textContent = `${items.length} item`;
    q('#ft-n2').textContent = `${items.length} item`;
    root.className = `view ft sz-${T.size} v-${T.view}${searching ? ' searching' : ''}${root.classList.contains('over') ? ' over' : ''}`;
    q('#ft-sbox').hidden = !searching;
    q('.ft-id').hidden = searching;
    q('.ft-ctl').querySelectorAll('.ft-vs button').forEach((b) => b.classList.toggle('on', b.dataset.v === T.view));

    const next = JSON.stringify([list.map((i) => [i.id, i.exists, i.pinned, i.name, i.size]), T.view, T.size, T.showPinned, T.showRef, items.length, query]);
    if (next === sig) return; // tidak ada yang berubah: jangan menimpa DOM (menjaga posisi gulir)
    sig = next;
    const top = body.scrollTop;
    body.classList.toggle('empty', !items.length || !list.length);
    if (!items.length) {
      body.innerHTML = `<div class="ft-empty"><div class="eic">${fileIcon({ dir: true })}</div><b>File Tray masih kosong</b><span>Seret file atau folder ke sini untuk menyimpannya sementara</span><div class="eb"><button class="mbtn" data-act="addfile">Tambah file</button><button class="mbtn" data-act="addfolder">Tambah folder</button></div></div>`;
    } else if (!list.length) {
      body.innerHTML = `<div class="ft-empty"><span>Tidak ada hasil untuk "${esc(query)}"</span></div>`;
    } else {
      body.innerHTML = list.map(T.view === 'grid' ? tile : rowHtml).join('');
    }
    body.scrollTop = top;
  }

  function flash(text) {
    const el = q('#ft-flash');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { el.hidden = true; }, 2800);
  }
  function flashAdd(r) {
    if (!r) return;
    const parts = [];
    if (r.added) parts.push(`${r.added} item ditambahkan`);
    if (r.duplicates) parts.push(`${r.duplicates} sudah ada`);
    if (r.skipped) parts.push(`${r.skipped} tidak bisa dibaca`);
    flash(parts.join(', ') || 'Tidak ada yang ditambahkan');
  }

  // ---------- Menu (klik kanan, urutan, tambah, lainnya) ----------
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
    const left = Math.max(6, Math.min(x - rb.left, rb.width - m.offsetWidth - 6));
    const top = Math.max(6, Math.min(y - rb.top, rb.height - m.offsetHeight - 6));
    m.style.left = `${left}px`;
    m.style.top = `${top}px`;
    m.addEventListener('click', (ev) => {
      const b = ev.target.closest('.mi');
      if (!b || b.disabled) return;
      const e = entries[Number(b.dataset.i)];
      if (e.action(b) !== 'keep') closeMenu();
    });
    menu = m;
    setTimeout(() => { if (menu === m) document.addEventListener('pointerdown', outside, true); }, 0);
  }
  const below = (btn) => { const r = btn.getBoundingClientRect(); return [r.right - 214, r.bottom + 6]; };

  const itemOf = (id) => items.find((i) => i.id === id);
  function itemMenu(it, x, y) {
    showMenu([
      { label: 'Buka', icon: I.open, disabled: !it.exists, action: () => open(it) },
      { label: 'Buka lokasi file', icon: I.folder, disabled: !it.exists, action: () => window.api.trayReveal(it.id) },
      { label: 'Salin path', icon: I.copy, action: () => window.api.trayCopy(it.id).then(() => flash('Path disalin')) },
      { sep: true },
      { label: it.pinned ? 'Lepas sematan' : 'Sematkan di atas', icon: I.star, action: () => window.api.trayPin(it.id, !it.pinned) },
      { label: 'Hapus referensi', icon: I.trash, red: true, action: () => window.api.trayRemove(it.id) }
    ], x, y);
  }
  async function open(it) {
    const r = await window.api.trayOpen(it.id);
    if (!r || r.ok) return;
    flash(r.error === 'missing' ? 'File tidak ditemukan. Klik kanan untuk menghapus referensinya.' : 'Item ini tidak bisa dibuka');
  }

  // ---------- Peristiwa ----------
  const idOf = (e) => { const el = e.target.closest('.it, .rw'); return el ? el.dataset.id : null; };
  body.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (act) { window.api.trayAddDialog(act.dataset.act === 'addfolder' ? 'folder' : 'file').then(flashAdd); return; }
    const it = itemOf(idOf(e));
    if (it) open(it);
  });
  body.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const it = itemOf(idOf(e));
    if (it) open(it);
  });
  body.addEventListener('contextmenu', (e) => {
    const it = itemOf(idOf(e));
    if (!it) return;
    e.preventDefault();
    itemMenu(it, e.clientX, e.clientY);
  });
  // Seret item keluar ke aplikasi lain (seret asli Windows, file tidak dipindah oleh tray)
  body.addEventListener('dragstart', (e) => {
    const id = idOf(e);
    if (!id) return;
    e.preventDefault();
    window.api.trayDrag(id);
  });

  q('#ft-search').addEventListener('click', () => {
    searching = true; paint();
    focusWhenReady(q('#ft-q'));
  });
  const closeSearch = () => { searching = false; query = ''; q('#ft-q').value = ''; sig = ''; paint(); };
  q('#ft-sx').addEventListener('click', closeSearch);
  q('#ft-q').addEventListener('input', (e) => { query = e.target.value; paint(); });
  q('#ft-q').addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSearch(); });

  q('#ft-sort').addEventListener('click', (e) => {
    const b = e.currentTarget;
    const [x, y] = below(b);
    showMenu(SORTS.map(([v, t]) => ({ label: t, check: T.sort === v, action: () => saveT({ sort: v }) })), x, y);
  });
  q('.ft-vs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) saveT({ view: b.dataset.v }); });
  q('#ft-add').addEventListener('click', (e) => {
    const [x, y] = below(e.currentTarget);
    showMenu([
      { label: 'Tambah file...', icon: I.open, action: () => window.api.trayAddDialog('file').then(flashAdd) },
      { label: 'Tambah folder...', icon: I.folder, action: () => window.api.trayAddDialog('folder').then(flashAdd) }
    ], x, y);
  });
  q('#ft-more').addEventListener('click', (e) => {
    const [x, y] = below(e.currentTarget);
    const missing = items.filter((i) => !i.exists).length;
    showMenu([
      { label: `Hapus yang hilang (${missing})`, icon: I.trash, disabled: !missing, action: () => window.api.trayRemoveMissing().then((n) => flash(`${n} referensi dihapus`)) },
      { label: 'Hapus semua referensi', icon: I.trash, red: true, action: (b) => {
        if (!b.dataset.armed) { b.dataset.armed = '1'; b.querySelector('span').textContent = 'Yakin hapus semua?'; return 'keep'; }
        return window.api.trayClear().then(() => flash('Semua referensi dihapus'));
      } }
    ], x, y);
  });
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu) { e.stopPropagation(); closeMenu(); } });

  const api = { refresh, applyT, flashAdd };
  active = api;
  window.api.getSettings().then(applyT);
  paint();
  refresh();
  const iv = setInterval(() => { if (!root.isConnected) { clearInterval(iv); if (active === api) active = null; } else refresh(); }, 4000);
}
