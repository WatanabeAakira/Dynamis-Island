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
import { renderAi, sendAiText } from './ai-view.js';
import { renderCopyText } from './copy-text-view.js';
import { renderTranslate, setTranslateText } from './translate-view.js';
import { renderClipboard } from './clipboard-view.js';
import { renderNotes } from './notes-view.js';
import { renderQuickSettings } from './quick-settings-view.js';
import { renderSystemMonitor } from './system-monitor-view.js';
import { setNotifLimit } from './notifkeeper.js';
import { setNoticeMs } from './toast.js';
import './compact.js';
import './scrollbars.js';
import { pillInfo, onAnyTimer } from './timekeeper.js';
import { getLanguage, localizeTree, setLanguage, tr, watchLocale } from './locale.js';
import { EXPANDED_HEIGHT, preferredExpandedHeight } from './layout-sizing.js';

// Tab yang sudah punya tampilan sendiri (selain media dan pengaturan). Tab baru cukup ditambah di sini.
const VIEWS = { clock: renderClock, timer: renderTimeTab, calendar: renderCalendar, weather: renderWeather, audio: renderAudio, files: renderFiles, apps: renderApps, notif: renderNotif, ai: renderAi, 'copy-text': renderCopyText, translate: renderTranslate, clipboard: renderClipboard, notes: renderNotes, 'quick-settings': renderQuickSettings, 'system-monitor': renderSystemMonitor };
import { setAccentSettings } from './palette.js';

const island  = document.getElementById('island');
const tabbar  = document.getElementById('tabbar');
const content = document.getElementById('content');
const pillTime = document.getElementById('pill-time');

let settings = await window.api.getSettings();
let mode = 'collapsed';          // full-closed | collapsed | hover | expanded
let activeTab = null;
let fullscreenActive = false;
let leaveTimer = null;
let contentReadyTimer = null;
let pointerInside = false;
let pinnedOpen = false;
let requestedHeight = null;
let sizingFrame = 0;

applySettings(settings);
watchLocale(document.body, () => settings.language);
initMedia();

function applySettings(s) {
  settings = s;
  setLanguage(s.language);
  document.documentElement.lang = s.language === 'en' ? 'en' : 'id';
  document.documentElement.style.setProperty('--accent', s.accent);
  setAccentSettings(s.accentFromCover, s.accent);
  setLyricsOffset(s.lyricsOffset || 0);
  setToastEnabled(s.trackToast !== false);
  setNoticeMs(((s.notif && s.notif.noticeMs) || 7000));
  if (tabbar.childElementCount) buildTabbar();
  setNotifLimit((s.notif && s.notif.historyLimit) || 50);
}

function updateExpandedSize() {
  cancelAnimationFrame(sizingFrame);
  sizingFrame = requestAnimationFrame(() => {
    const sub = island.dataset.sub || '';
    if (mode !== 'expanded') {
      island.style.removeProperty('--h');
      return;
    }
    const height = preferredExpandedHeight(activeTab, sub, requestedHeight);
    if (island.style.getPropertyValue('--h') === `${height}px`) return;
    island.style.setProperty('--h', `${height}px`);
  });
}
document.addEventListener('island:layoutrequest', (event) => {
  const detail = event.detail || {};
  requestedHeight = detail.height != null && Number.isFinite(Number(detail.height)) ? Number(detail.height) : null;
  updateExpandedSize();
});
new MutationObserver(() => {
  requestedHeight = null;
  updateExpandedSize();
}).observe(island, { attributes: true, attributeFilter: ['data-tab', 'data-sub'] });
new MutationObserver(() => {
  if (mode === 'expanded') updateExpandedSize();
}).observe(content, { childList: true, subtree: true, characterData: true });

function scheduleContentReady() {
  clearTimeout(contentReadyTimer);
  island.removeAttribute('data-content-ready');
  if (mode !== 'expanded') return;

  contentReadyTimer = setTimeout(() => {
    contentReadyTimer = null;
    if (mode !== 'expanded') return;
    island.dataset.contentReadyTab = island.dataset.tab || '';
    island.dataset.contentReadySub = island.dataset.sub || '';
    island.dataset.contentReady = 'true';
    document.dispatchEvent(new Event('island:contentready'));
  }, 600);
}

// Tab dan subview bisa mengubah tinggi Island saat panel sudah terbuka.
new MutationObserver(scheduleContentReady).observe(island, {
  attributes: true,
  attributeFilter: ['data-tab', 'data-sub']
});

// ---------- Mode ----------
// Event 'island:modechange' dipakai fitur lain (mis. mini lyrics saat pointerleave -> collapsed).
function setMode(next, reason) {
  if (next === mode) return;
  const prev = mode;
  mode = next;
  island.dataset.mode = next;
  updateExpandedSize();
  // Tunggu sampai resize Island dan fade-in panel selesai sebelum kontrol menerima klik.
  scheduleContentReady();
  document.dispatchEvent(new CustomEvent('island:modechange', { detail: { mode: next, prev, reason, tab: activeTab } }));
}

function scheduleCollapse(reason = 'pointerleave') {
  clearTimeout(leaveTimer);
  if (pinnedOpen || pointerInside) return;
  leaveTimer = setTimeout(() => {
    if (!pinnedOpen && !pointerInside) setMode(restingMode(), reason);
  }, settings.collapseDelay);
}

function restingMode() {
  return settings.autoFullClosed !== false && fullscreenActive ? 'full-closed' : 'collapsed';
}

function syncFullscreenMode(reason = 'fullscreen-change') {
  const target = restingMode();
  if (target === 'full-closed') {
    clearTimeout(leaveTimer);
    pointerInside = false;
    // Masuk fullscreen selalu menutup island dan melepas pin yang aktif sebelumnya.
    pinnedOpen = false;
    updatePinButton();
    if (mode !== target) setMode(target, reason);
  } else if (mode === 'full-closed') {
    setMode('collapsed', reason);
  }
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
  const availableTabs = TABS.filter((t) => t.id !== 'clipboard' || settings.clipboard?.enabled !== false).filter((t) => t.id !== 'notes' || settings.notes?.enabled !== false).filter((t) => t.id !== 'quick-settings' || settings.quickSettings?.enabled !== false).filter((t) => t.id !== 'system-monitor' || settings.systemMonitor?.enabled !== false);
  const btn = (id, title) =>
    `<button class="tab-btn" data-tab="${id}" title="${tr(title, language)}" aria-label="${tr(title, language)}">${ICONS[id]}</button>`;
  tabbar.innerHTML =
    availableTabs.map(t => btn(t.id, t.title)).join('') +
    '<button class="tab-btn more-btn" data-action="more" aria-expanded="false" aria-label="Lainnya" title="Lainnya"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg></button>' +
    '<div class="tab-sep"></div>' +
    btn('settings', 'Pengaturan') +
    '<button class="tab-btn pin-btn" data-action="pin" aria-label="Pin island tetap terbuka" aria-pressed="false" title="Pin island tetap terbuka"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6l-1 5 3 3v2H7v-2l3-3zM12 14v6"/></svg></button>';
  const menu = document.createElement('div');
  menu.className = 'tab-more-menu';
  menu.id = 'tab-more-menu';
  menu.setAttribute('role', 'group');
  menu.setAttribute('aria-label', tr('Lainnya', language));
  menu.innerHTML = availableTabs.map(t => `<button class="more-entry" data-tab="${t.id}" title="${tr(t.title, language)}">${ICONS[t.id]}<span>${tr(t.title, language)}</span></button>`).join('');
  tabbar.append(menu);
  refreshHoverNavigation();
}
buildTabbar();
function refreshHoverNavigation() {
  const primary = new Set(['media', 'timer', 'calendar', 'clock']);
  tabbar.querySelectorAll('.tab-btn[data-tab]').forEach((button) => {
    const overflow = !primary.has(button.dataset.tab);
    button.dataset.overflow = String(overflow);
  });
  const menu = tabbar.querySelector('.tab-more-menu');
  if (menu) menu.querySelectorAll('.more-entry').forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === activeTab);
  });
}
function refreshTabbarOverflow() {
  const hasOverflow = tabbar.scrollWidth > tabbar.clientWidth + 1;
  tabbar.classList.toggle('has-overflow', hasOverflow);
  if (!hasOverflow) tabbar.scrollLeft = 0;
}
new ResizeObserver(refreshTabbarOverflow).observe(tabbar);
tabbar.addEventListener('wheel', (event) => {
  if (tabbar.scrollWidth <= tabbar.clientWidth + 1) return;
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (!delta) return;
  tabbar.scrollLeft += delta;
  event.preventDefault();
}, { passive: false });

function selectTab(id) {
  island.removeAttribute('data-more-open');
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
  refreshHoverNavigation();
}

function renderActive() {
  const view = VIEWS[activeTab];
  if (view) { view(content, settings); localizeTree(content, settings.language); return; }
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
  const more = e.target.closest('[data-action="more"]');
  if (more) {
    const open = island.dataset.moreOpen !== 'true';
    island.dataset.moreOpen = String(open);
    more.setAttribute('aria-expanded', String(open));
    return;
  }
  const b = e.target.closest('.tab-btn');
  const menuButton = e.target.closest('.more-entry');
  if (!b && !menuButton) return;
  const actionButton = b || menuButton;
  if (actionButton.dataset.action === 'pin') { setPinned(!pinnedOpen); return; }
  // Pengaturan dibuka di window terpisah; island hanya untuk melakukan sesuatu
  if (actionButton.dataset.tab === 'settings') window.api.openSettings(); else selectTab(actionButton.dataset.tab);
});

// ---------- Pointer: buka saat masuk, tutup saat keluar ----------
island.addEventListener('pointerenter', () => {
  pointerInside = true;
  clearTimeout(leaveTimer);
  if ((mode === 'collapsed' || mode === 'full-closed') && settings.openOnHover && !island.classList.contains('cmp-apps')) setMode(activeTab ? 'expanded' : 'hover', 'pointerenter');
});

island.addEventListener('pointerleave', () => {
  pointerInside = false;
  scheduleCollapse();
});

island.addEventListener('click', () => {
  if (mode === 'collapsed' || mode === 'full-closed') setMode(activeTab ? 'expanded' : 'hover', 'click');
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
    const locale = getLanguage() === 'en' ? 'en-US' : 'id-ID';
    pillTime.textContent = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false }).replace('.', ':');
  }
  pill.classList.toggle('timing', !!info);
}
tick();
setInterval(tick, 250);
onAnyTimer(tick);

// ---------- Laporkan area island ke main process (untuk deteksi kursor saat drag) ----------
const reportRect = () => {
  const r = island.getBoundingClientRect();
  const overlays = [...document.querySelectorAll('#island-dropdown-portal .island-dropdown-menu:not([hidden])')]
    .map((menu) => menu.getBoundingClientRect());
  const left = Math.min(r.left, ...overlays.map((rect) => rect.left));
  const top = Math.min(r.top, ...overlays.map((rect) => rect.top));
  const right = Math.max(r.right, ...overlays.map((rect) => rect.right));
  const bottom = Math.max(r.bottom, ...overlays.map((rect) => rect.bottom));
  window.api.reportRect({ x: Math.round(left), y: Math.round(top), w: Math.round(right - left), h: Math.round(bottom - top) });
};
new ResizeObserver(reportRect).observe(island);
document.addEventListener('island:dropdownchange', reportRect);
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
  if ((mode === 'collapsed' || mode === 'full-closed') && settings.openOnHover && !island.classList.contains('cmp-apps')) setMode(activeTab ? 'expanded' : 'hover', 'pointerenter');
};
const hoverLeave = () => {
  pointerInside = false;
  scheduleCollapse();
};
window.api.onHover((inside) => {
  if (overIsland) return; // event mouse di window sudah menangani
  if (inside) hoverEnter(); else hoverLeave();
});

window.api.onHelper((msg) => {
  if (!msg) return;
  if (msg.type === 'clipboard-history' || msg.type === 'quick-notes') window.dispatchEvent(new CustomEvent(`companion:${msg.type}`, { detail: msg.items || [] }));
  if (msg.type === 'quick-settings-state' || msg.type === 'quick-settings-error') window.dispatchEvent(new CustomEvent(msg.type, { detail: msg.state || msg }));
  if (msg.type === 'system-monitor-snapshot') window.dispatchEvent(new CustomEvent('system-monitor:snapshot', { detail: msg.snapshot }));
  if (msg.type === 'system-monitor-error' || msg.type === 'backend-error') window.dispatchEvent(new CustomEvent('system-monitor:error', { detail: msg }));
  if (msg.type === 'system-monitor-alert') document.dispatchEvent(new CustomEvent('island:system-alert', { detail: msg }));
  if (msg.type === 'translate-open') {
    if (activeTab !== 'translate') {
      activeTab = 'translate';
      markActive();
      renderActive();
    }
    if (mode !== 'expanded') setMode('expanded', 'translate-hotkey');
  }
  if (msg.type === 'translate-input' || msg.type === 'translate-status') {
    if (msg.type === 'translate-input' && activeTab !== 'translate') {
      activeTab = 'translate';
      markActive();
      renderActive();
      if (mode !== 'expanded') setMode('expanded', 'translate-result');
    }
    window.dispatchEvent(new CustomEvent('translate:helper', { detail: msg }));
  }
  if (msg.type === 'copy-text-status') {
    document.querySelector('.tab-btn[data-tab="copy-text"]')?.classList.toggle('processing', !!msg.processing);
  }
  if (msg.type !== 'fullscreen') return;
  const active = !!msg.active;
  if (active === fullscreenActive) return;
  fullscreenActive = active;
  syncFullscreenMode(active ? 'fullscreen-enter' : 'fullscreen-exit');
});
window.addEventListener('companion:ai', (event) => { activeTab='ai'; markActive(); renderActive(); setMode('expanded','companion-ai'); setTimeout(()=>sendAiText(event.detail),0); });
window.addEventListener('companion:translate', (event) => { activeTab='translate'; markActive(); renderActive(); setMode('expanded','companion-translate'); setTimeout(()=>setTranslateText(event.detail),0); });

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
  setMode(restingMode(), 'tray-show');
  setOver(false);
});

// Izinkan window menerima fokus sebelum kolom diklik. Klik itu sendiri membiarkan Chromium
// mengatur fokus kolom secara native, tanpa memanggil window.focus() lagi setelahnya.
const isTextField = (el) => !!el && el.matches && el.matches('input[type="number"], input[type="text"], input:not([type]), textarea');
document.addEventListener('pointerover', (e) => { if (isTextField(e.target)) window.api.allowFocus(); });
document.addEventListener('focusout', () => {
  setTimeout(() => { if (!isTextField(document.activeElement)) window.api.releaseFocus(); }, 80);
});

// ---------- Perubahan dari window Pengaturan ----------
window.api.onSettings((s) => {
  const languageChanged = settings.language !== s.language;
  const autoFullClosedChanged = (settings.autoFullClosed !== false) !== (s.autoFullClosed !== false);
  applySettings(s);
  window.dispatchEvent(new CustomEvent('island:settings', { detail: s }));
  if (autoFullClosedChanged) syncFullscreenMode('fullscreen-setting');
  if (languageChanged || activeTab === 'clock') {
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
