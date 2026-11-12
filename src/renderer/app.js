import { TABS, ICONS, renderPlaceholder } from './tabs.js';
import { renderSettings } from './settings.js';
import { initMedia, renderMedia } from './media.js';
import { L, setLyricsMode, importDropped, reloadLyrics, setLyricsOffset } from './lyrics.js';
import { setToastEnabled } from './toast.js';
import { renderClock } from './clock.js';
import { renderTimeTab, openSub } from './timetab.js';
import { renderCalendar } from './calendar-view.js';
import { renderWeather } from './weather-view.js';
import { renderAudio } from './audio-view.js';
import { renderFiles } from './tray-view.js';
import { renderApps } from './apps-view.js';
import { renderNotif } from './notif-view.js';
import { renderAi } from './ai-view.js';
import { setNotifLimit } from './notifkeeper.js';
import { setNoticeMs } from './toast.js';
import './compact.js';
import { pillInfo, onAnyTimer } from './timekeeper.js';
import { localizeTree, tr } from './locale.js';

// Tab yang sudah punya tampilan sendiri (selain media dan pengaturan). Tab baru cukup ditambah di sini.
const VIEWS = { clock: renderClock, timer: renderTimeTab, calendar: renderCalendar, weather: renderWeather, audio: renderAudio, files: renderFiles, apps: renderApps, notif: renderNotif, ai: renderAi };
import { setAccentSettings } from './palette.js';

const island  = document.getElementById('island');
const tabbar  = document.getElementById('tabbar');
const content = document.getElementById('content');
const pillTime = document.getElementById('pill-time');

let settings = await window.api.getSettings();
let mode = 'collapsed';          // collapsed | hover | expanded
let activeTab = null;
let leaveTimer = null;
let pointerInside = false;
let pinnedOpen = false;

applySettings(settings);
initMedia();

function applySettings(s) {
  settings = s;
  document.documentElement.style.setProperty('--accent', s.accent);
  setAccentSettings(s.accentFromCover, s.accent);
  setLyricsOffset(s.lyricsOffset || 0);
  setToastEnabled(s.trackToast !== false);
  setNoticeMs(((s.notif && s.notif.noticeMs) || 7000));
  setNotifLimit((s.notif && s.notif.historyLimit) || 50);
}

// ---------- Mode ----------
// Event 'island:modechange' dipakai fitur lain (mis. mini lyrics saat pointerleave -> collapsed).
function setMode(next, reason) {
  if (next === mode) return;
  const prev = mode;
  mode = next;
  island.dataset.mode = next;
  document.dispatchEvent(new CustomEvent('island:modechange', { detail: { mode: next, prev, reason, tab: activeTab } }));
}

function scheduleCollapse(reason = 'pointerleave') {
  clearTimeout(leaveTimer);
  if (pinnedOpen || pointerInside) return;
  leaveTimer = setTimeout(() => {
    if (!pinnedOpen && !pointerInside) setMode('collapsed', reason);
  }, settings.collapseDelay);
}

function updatePinButton() {
  const button = tabbar.querySelector('[data-action="pin"]');
  if (!button) return;
  button.classList.toggle('active', pinnedOpen);
  button.setAttribute('aria-pressed', String(pinnedOpen));
  button.title = pinnedOpen ? 'Lepas pin island' : 'Pin island tetap terbuka';
  button.setAttribute('aria-label', button.title);
}

function setPinned(value) {
  pinnedOpen = value;
  updatePinButton();
  if (!pinnedOpen) scheduleCollapse();
}

// ---------- Tab bar ----------
function buildTabbar() {
  const language = settings.language === 'en' ? 'en' : 'id';
  const btn = (id, title) =>
    `<button class="tab-btn" data-tab="${id}" title="${tr(title, language)}" aria-label="${tr(title, language)}">${ICONS[id]}</button>`;
  tabbar.innerHTML =
    TABS.map(t => btn(t.id, t.title)).join('') +
    '<div class="tab-sep"></div>' +
    btn('settings', 'Pengaturan') +
    '<button class="tab-btn pin-btn" data-action="pin" aria-label="Pin island tetap terbuka" aria-pressed="false" title="Pin island tetap terbuka"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6l-1 5 3 3v2H7v-2l3-3zM12 14v6"/></svg></button>';
}
buildTabbar();

function selectTab(id) {
  // Klik tab yang sedang terbuka = kembali ke bar saja
  if (mode === 'expanded' && id === activeTab) {
    activeTab = null;
    markActive();
    setMode('hover', 'tab-toggle');
    return;
  }
  activeTab = id;
  markActive();
  renderActive();
  setMode('expanded', 'tab-select');
}

function markActive() {
  island.dataset.tab = activeTab || '';
  island.dataset.sub = '';
  tabbar.querySelectorAll('.tab-btn[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
}

function renderActive() {
  const view = VIEWS[activeTab];
  if (view) { view(content); localizeTree(content, settings.language); return; }
  if (activeTab === 'media') {
    renderMedia(content);
    localizeTree(content, settings.language);
    return;
  }
  if (activeTab === 'settings') {
    renderSettings(content, applySettings);
    localizeTree(content, settings.language);
    return;
  }
  const tab = TABS.find(t => t.id === activeTab);
  if (tab) renderPlaceholder(content, tab);
  localizeTree(content, settings.language);
}

tabbar.addEventListener('click', (e) => {
  const b = e.target.closest('.tab-btn');
  if (!b) return;
  if (b.dataset.action === 'pin') { setPinned(!pinnedOpen); return; }
  // Pengaturan dibuka di window terpisah; island hanya untuk melakukan sesuatu
  if (b.dataset.tab === 'settings') window.api.openSettings(); else selectTab(b.dataset.tab);
});

// ---------- Pointer: buka saat masuk, tutup saat keluar ----------
island.addEventListener('pointerenter', () => {
  pointerInside = true;
  clearTimeout(leaveTimer);
  if (mode === 'collapsed' && settings.openOnHover && !island.classList.contains('cmp-apps')) setMode(activeTab ? 'expanded' : 'hover', 'pointerenter');
});

island.addEventListener('pointerleave', () => {
  pointerInside = false;
  scheduleCollapse();
});

island.addEventListener('click', () => {
  if (mode === 'collapsed') setMode(activeTab ? 'expanded' : 'hover', 'click');
});

// ---------- Click-through: area transparan tembus ke aplikasi di bawah ----------
let overIsland = false;
function setOver(v) {
  if (v === overIsland) return;
  overIsland = v;
  window.api.setIgnoreMouse(!v);
}
document.addEventListener('mousemove', (e) => setOver(!!e.target.closest('#island')));
document.addEventListener('mouseleave', () => setOver(false));
// Klik di island selalu diteruskan ke island (tidak ke aplikasi di bawahnya)
document.addEventListener('pointerdown', (e) => { if (e.target.closest && e.target.closest('#island')) setOver(true); }, true);

// ---------- Pill collapse: jam, atau sisa waktu timer / sesi fokus yang berjalan ----------
const pill = document.getElementById('pill');
function tick() {
  const info = pillInfo();
  if (info) {
    pillTime.textContent = info.text;
    pill.dataset.kind = info.kind;
  } else {
    const d = new Date();
    pillTime.textContent = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).replace('.', ':');
  }
  pill.classList.toggle('timing', !!info);
}
tick();
setInterval(tick, 250);
onAnyTimer(tick);

// ---------- Laporkan area island ke main process (untuk deteksi kursor saat drag) ----------
const reportRect = () => {
  const r = island.getBoundingClientRect();
  window.api.reportRect({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) });
};
new ResizeObserver(reportRect).observe(island);
reportRect();

// ---------- Seret file ke island ----------
// Tujuan: panel lirik (jika tab Media dengan lirik sedang aktif dan ada lagu); selain itu File Tray.
const hasFiles = (e) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
let dragTimer = 0;
let dragKind = null;
const kindNow = () => (activeTab === 'apps' ? 'apps' : activeTab === 'media' && L.mode && L.key ? 'lyrics' : 'files');
const SEL = { lyrics: '.m-right', files: '.ft', apps: '.ap' };
const inTarget = (e, kind) => !!(e.target.closest && e.target.closest(SEL[kind]));
const targetEl = (kind) => content.querySelector(SEL[kind]);

function openForDrop(kind) {
  clearTimeout(leaveTimer);
  dragKind = kind;
  const tab = { lyrics: 'media', files: 'files', apps: 'apps' }[kind];
  if (kind === 'lyrics') setLyricsMode(true);
  if (!(mode === 'expanded' && activeTab === tab)) {
    activeTab = tab;
    markActive();
    renderActive();
    setMode('expanded', 'drag');
  }
  island.dataset.drag = kind;
  island.classList.add('dragging');
}

function endDrag(collapse) {
  clearTimeout(dragTimer);
  dragTimer = 0;
  island.classList.remove('dragging');
  delete island.dataset.drag;
  for (const k of ['lyrics', 'files', 'apps']) { const p = targetEl(k); if (p) p.classList.remove('over'); }
  dragKind = null;
  if (collapse) scheduleCollapse();
}

// preventDefault wajib, kalau tidak Electron akan membuka file yang dijatuhkan
document.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  openForDrop(kindNow());
});

document.addEventListener('dragover', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  const ok = !!dragKind && inTarget(e, dragKind);
  e.dataTransfer.dropEffect = ok ? 'copy' : 'none';
  const p = dragKind && targetEl(dragKind);
  if (p) p.classList.toggle('over', ok);
  // Jika drag keluar dari island, event berhenti datang: tutup overlay dan collapse
  clearTimeout(dragTimer);
  dragTimer = setTimeout(() => endDrag(true), 600);
});

document.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  const kind = dragKind;
  const ok = !!kind && inTarget(e, kind);
  endDrag(false);
  if (!ok) return;
  if (kind === 'lyrics') importDropped(e.dataTransfer.files);
  else if (kind === 'apps') addApps(e.dataTransfer.files);
  else addDropped(e.dataTransfer.files);
});

async function addApps(files) {
  const paths = [...files].map((f) => { try { return window.api.pathFor(f); } catch { return ''; } }).filter(Boolean);
  const r = await window.api.appsAdd(paths);
  document.dispatchEvent(new CustomEvent('apps:flash', { detail: r }));
}

async function addDropped(files) {
  const paths = [...files].map((f) => { try { return window.api.pathFor(f); } catch { return ''; } }).filter(Boolean);
  const r = await window.api.trayAdd(paths);
  document.dispatchEvent(new CustomEvent('tray:flash', { detail: r }));
}

// ---------- Hover dari main process (tetap jalan saat game fullscreen memegang mouse) ----------
const hoverEnter = () => {
  pointerInside = true;
  clearTimeout(leaveTimer);
  if (mode === 'collapsed' && settings.openOnHover && !island.classList.contains('cmp-apps')) setMode(activeTab ? 'expanded' : 'hover', 'pointerenter');
};
const hoverLeave = () => {
  pointerInside = false;
  scheduleCollapse();
};
window.api.onHover((inside) => {
  if (overIsland) return; // event mouse di window sudah menangani
  if (inside) hoverEnter(); else hoverLeave();
});

// Tray dapat menyembunyikan window saat hover/click-through sedang aktif.
// Saat ditampilkan lagi, mulai dari state bersih supaya klik tab berikutnya diproses.
window.api.onIslandShown(() => {
  clearTimeout(leaveTimer);
  clearTimeout(dragTimer);
  pointerInside = false;
  pinnedOpen = false;
  updatePinButton();
  overIsland = false;
  activeTab = null;
  markActive();
  setMode('collapsed', 'tray-show');
  setOver(false);
});

// ---------- Fokus keyboard hanya dipinjam saat mengetik di kolom teks/angka ----------
// Window island tidak mengambil fokus saat diklik, supaya game/aplikasi aktif tidak terganggu.
const isTextField = (el) => !!el && el.matches && el.matches('input[type="number"], input[type="text"], input:not([type]), textarea');
// Window dibuat bisa aktif SEBELUM kolom diklik (saat kursor lewat), karena klik pada window yang tidak bisa aktif tidak memberi fokus keyboard
document.addEventListener('pointerover', (e) => { if (isTextField(e.target)) window.api.allowFocus(); });
document.addEventListener('focusin', (e) => {
  if (!isTextField(e.target)) return;
  window.api.focusWindow();
  setTimeout(() => { if (isTextField(document.activeElement) && !document.hasFocus()) window.api.focusWindow(); }, 180);
});
document.addEventListener('focusout', () => {
  setTimeout(() => { if (!isTextField(document.activeElement)) window.api.releaseFocus(); }, 80);
});

// ---------- Perubahan dari window Pengaturan ----------
window.api.onSettings((s) => {
  const languageChanged = settings.language !== s.language;
  applySettings(s);
  if (languageChanged) {
    buildTabbar();
    if (activeTab) renderActive();
    else localizeTree(document.body, s.language);
  }
});
window.api.onLyricsChanged(reloadLyrics);

// ---------- Buka tab dari notifikasi (mis. klik notifikasi timer membuka tab Timer) ----------
document.addEventListener('island:open-tab', (e) => {
  const d = e.detail || {};
  if (!d.tab) return;
  clearTimeout(leaveTimer);
  if (d.sub) openSub(d.sub);
  activeTab = d.tab;
  markActive();
  renderActive();
  setMode('expanded', 'open-tab');
});
