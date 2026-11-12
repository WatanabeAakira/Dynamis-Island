// Tab Notifikasi: daftar notifikasi island, filter, cari, tandai dibaca, hapus, dan buka sumbernya.
import { notifs, onNotifs, markRead, markAll, removeNotif, clearAll, unreadCount, SOURCES } from './notifkeeper.js';

const island = document.getElementById('island');
const svg = (b) => `<svg viewBox="0 0 24 24" aria-hidden="true">${b}</svg>`;
const I = {
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 6.5 2.5 8 2.5 8h-17S6 15.5 6 9"/><path d="M10 21h4"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  check: '<path d="M3.5 12.5l4.5 4.5L15 9.5M12 16.5l1.6 1.6L20.5 11"/>',
  trash: '<path d="M5 7h14M9 7V4.5h6V7M7 7l1 12.5h8L17 7M10.5 11v5M13.5 11v5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  open: '<path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
  dot: '<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>',
  timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 1.5M9.5 2.5h5M12 2.5v3"/>',
  focus: '<path d="M12 3c1 3.6 5.2 5.6 5.2 10.2a5.2 5.2 0 0 1-10.4 0c0-2.1 1-3.7 2.3-4.8.2 1.7 1 2.6 2.1 2.8C10.6 8.8 10.8 5.6 12 3z"/>',
  alarm: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4.2l2.6 1.6M4.3 5.6l2.6-2.1M19.7 5.6l-2.6-2.1"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="17" rx="3.5"/><path d="M16 2.5v4M8 2.5v4M3 10h18"/>'
};
const SRC_ICON = { timer: I.timer, focus: I.focus, alarm: I.alarm, calendar: I.calendar, system: I.bell };
const esc = (t) => String(t).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

let filter = 'all';
let query = '';
let showBody = true;
let active = null;
let menu = null;

window.api.onNotifCleared?.(() => { clearAll(); });
window.api.getSettings().then((s) => { showBody = !s.notif || s.notif.showBody !== false; if (active) active.paint(); });
window.api.onSettings((s) => { showBody = !s.notif || s.notif.showBody !== false; if (active) active.paint(); });

const fmtTime = (ts) => {
  const d = new Date(ts), n = new Date();
  const same = d.toDateString() === n.toDateString();
  return same
    ? d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false })
    : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
};

export function renderNotif(c) {
  island.dataset.sub = 'notif';
  c.innerHTML = `
    <div class="view nt">
      <header class="nt-top">
        <span class="nt-logo">${svg(I.bell)}</span>
        <div class="nt-tt"><b>Notifikasi</b><small id="nt-sub"></small></div>
        <div class="nt-sbox">${svg(I.search)}<input id="nt-q" type="text" placeholder="Cari notifikasi..." autocomplete="off" maxlength="60" value="${esc(query)}"></div>
        <button class="nt-ib" id="nt-all" aria-label="Tandai semua dibaca" title="Tandai semua dibaca">${svg(I.check)}</button>
        <button class="nt-ib" id="nt-clear" aria-label="Hapus semua" title="Hapus semua">${svg(I.trash)}</button>
        <button class="nt-ib gear" id="nt-gear" aria-label="Pengaturan notifikasi" title="Pengaturan notifikasi">${svg(I.gear)}</button>
      </header>
      <div class="nt-chips" id="nt-chips"></div>
      <div class="nt-list" id="nt-list"></div>
      <div class="nt-empty" id="nt-empty" hidden></div>
    </div>`;
  const q = (s) => c.querySelector(s);
  const root = q('.nt'), list = q('#nt-list'), chips = q('#nt-chips'), empty = q('#nt-empty');
  let confirmTimer = 0;

  function visible() {
    const k = query.trim().toLowerCase();
    return notifs.filter((n) => {
      if (filter === 'unread' && n.read) return false;
      if (filter !== 'all' && filter !== 'unread' && n.source !== filter) return false;
      if (k && !(n.title.toLowerCase().includes(k) || n.body.toLowerCase().includes(k))) return false;
      return true;
    });
  }

  function paintChips() {
    const counts = {};
    for (const n of notifs) counts[n.source] = (counts[n.source] || 0) + 1;
    const unread = unreadCount();
    const pill = (f, label, n, extra = '') => `<button class="nt-chip${filter === f ? ' on' : ''}" data-f="${f}">${extra}<span>${label}</span><b>${n}</b></button>`;
    let h = pill('all', 'Semua', notifs.length) + pill('unread', 'Belum dibaca', unread, '<i class="nt-dot"></i>');
    for (const k of Object.keys(SOURCES)) if (counts[k]) h += pill(k, SOURCES[k].label, counts[k], `<em style="--c:${SOURCES[k].color}">${svg(SRC_ICON[k])}</em>`);
    chips.innerHTML = h;
    if (filter !== 'all' && filter !== 'unread' && !counts[filter]) filter = 'all';
  }

  function paintList() {
    const top = list.scrollTop;
    const items = visible();
    list.innerHTML = items.map((n) => {
      const src = SOURCES[n.source] || SOURCES.system;
      return `<div class="nc${n.read ? '' : ' unread'}" role="button" tabindex="0" data-id="${n.id}" style="--c:${n.color || src.color}">
        <span class="nc-ico">${svg(SRC_ICON[n.source] || I.bell)}</span>
        <div class="nc-main">
          <div class="nc-h"><span class="nc-app">${esc(src.label)}</span><span class="nc-t">${fmtTime(n.ts)}</span>${n.read ? '' : '<i class="nc-dot"></i>'}</div>
          <b>${esc(n.title)}</b>
          ${showBody && n.body ? `<small>${esc(n.body)}</small>` : ''}
        </div>
        <button class="nc-x" aria-label="Hapus notifikasi">${svg(I.x)}</button>
      </div>`;
    }).join('');
    list.scrollTop = top;
    const total = notifs.length;
    empty.hidden = items.length > 0;
    if (!items.length) {
      empty.textContent = total === 0
        ? 'Belum ada notifikasi. Pengingat timer, alarm, fokus, dan kalender akan muncul di sini.'
        : 'Tidak ada notifikasi yang cocok dengan filter atau pencarian.';
    }
  }

  function paint() {
    if (!root.isConnected) { if (active === api) active = null; return; }
    const unread = unreadCount();
    q('#nt-sub').textContent = `${unread} belum dibaca · ${notifs.length} total`;
    paintChips();
    paintList();
  }

  // Menu klik kanan
  function closeMenu() { if (menu) { menu.remove(); menu = null; document.removeEventListener('pointerdown', outside, true); } }
  function outside(e) { if (menu && !menu.contains(e.target)) closeMenu(); }
  function openMenu(entries, x, y) {
    closeMenu();
    const m = document.createElement('div');
    m.className = 'ft-menu nt-menu';
    m.innerHTML = entries.map((e, i) => (e.sep ? '<div class="msep"></div>'
      : `<button class="mi${e.red ? ' red' : ''}" data-i="${i}">${e.icon ? svg(e.icon) : '<span class="mgap"></span>'}<span>${esc(e.label)}</span></button>`)).join('');
    c.querySelector('.nt').append(m);
    const rb = c.querySelector('.nt').getBoundingClientRect();
    m.style.left = `${Math.max(6, Math.min(x - rb.left, rb.width - m.offsetWidth - 6))}px`;
    m.style.top = `${Math.max(6, Math.min(y - rb.top, rb.height - m.offsetHeight - 6))}px`;
    m.addEventListener('click', (ev) => {
      const b = ev.target.closest('.mi');
      if (!b) return;
      entries[Number(b.dataset.i)].action();
      closeMenu();
    });
    menu = m;
    setTimeout(() => { if (menu === m) document.addEventListener('pointerdown', outside, true); }, 0);
  }
  const itemMenu = (n, x, y) => openMenu([
    ...(n.tab ? [{ label: 'Buka', icon: I.open, action: () => openSource(n) }] : []),
    { label: n.read ? 'Tandai belum dibaca' : 'Tandai sudah dibaca', icon: I.dot, action: () => markRead(n.id, !n.read) },
    { sep: true },
    { label: 'Hapus', icon: I.x, red: true, action: () => removeNotif(n.id) }
  ], x, y);

  function openSource(n) {
    if (!n.tab) return;
    document.dispatchEvent(new CustomEvent('island:open-tab', { detail: { tab: n.tab, sub: n.sub } }));
  }

  // Peristiwa
  chips.addEventListener('click', (e) => {
    const b = e.target.closest('.nt-chip');
    if (b) { filter = b.dataset.f; paint(); }
  });
  list.addEventListener('click', (e) => {
    const card = e.target.closest('.nc');
    if (!card) return;
    const n = notifs.find((x) => x.id === card.dataset.id);
    if (!n) return;
    if (e.target.closest('.nc-x')) { removeNotif(n.id); return; }
    markRead(n.id, true);
    openSource(n);
  });
  list.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const card = e.target.closest('.nc');
    const n = card && notifs.find((x) => x.id === card.dataset.id);
    if (n) { markRead(n.id, true); openSource(n); }
  });
  list.addEventListener('contextmenu', (e) => {
    const card = e.target.closest('.nc');
    const n = card && notifs.find((x) => x.id === card.dataset.id);
    if (!n) return;
    e.preventDefault();
    itemMenu(n, e.clientX, e.clientY);
  });
  q('#nt-q').addEventListener('input', (e) => { query = e.target.value; paint(); });
  q('#nt-q').addEventListener('keydown', (e) => { if (e.key === 'Escape' && query) { query = ''; e.target.value = ''; paint(); } });
  q('#nt-all').addEventListener('click', () => markAll());
  q('#nt-clear').addEventListener('click', (e) => {
    const b = e.currentTarget;
    if (!notifs.length) return;
    if (b.dataset.armed !== '1') {
      b.dataset.armed = '1';
      b.classList.add('arm');
      confirmTimer = setTimeout(() => { b.dataset.armed = ''; b.classList.remove('arm'); }, 2500);
      return;
    }
    clearTimeout(confirmTimer);
    b.dataset.armed = ''; b.classList.remove('arm');
    clearAll();
  });
  q('#nt-gear').addEventListener('click', () => window.api.openSettings('notif'));
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu) { e.stopPropagation(); closeMenu(); } });

  const off = onNotifs(() => { if (!root.isConnected) return off(); paint(); });
  const api = { paint };
  active = api;
  paint();
}
