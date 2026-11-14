// Pill compact: setelah island menutup dari tab File Tray, Pintasan Aplikasi, atau Audio Control.
import { compactIcon } from './tray-icons.js';
import { audio, onAudio, watch } from './audio-link.js';
import { speaker } from './audio-view.js';
import { unreadCount, lastArrival, onNotifs } from './notifkeeper.js';

const svg = (b) => `<svg viewBox="0 0 24 24" aria-hidden="true">${b}</svg>`;
const BELL = '<path d="M6 9a6 6 0 0 1 12 0c0 6.5 2.5 8 2.5 8h-17S6 15.5 6 9"/><path d="M10 21h4"/>';

const island = document.getElementById('island');
const cmp = document.getElementById('cmp');
const CHEV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
const GRID = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="2" fill="currentColor"/><rect x="13" y="4" width="7" height="7" rx="2" fill="currentColor"/><rect x="4" y="13" width="7" height="7" rx="2" fill="currentColor"/><rect x="13" y="13" width="7" height="7" rx="2" fill="currentColor"/></svg>';
const APPS_DEFAULTS = { favCount: 4, favFirst: true, compactMode: 'icons', compactLabels: false };
const esc = (t) => String(t).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

let kind = null; // 'files' | 'apps' | 'audio' | null
let count = 0, variant = 'outline', apps = [], A = { ...APPS_DEFAULTS };

function shown() {
  const list = A.favFirst ? [...apps.filter((x) => x.favorite), ...apps.filter((x) => !x.favorite)] : [...apps];
  return list.slice(0, Math.max(1, Math.min(8, Number(A.favCount) || 4)));
}

function renderApps() {
  if (A.compactMode === 'count') {
    cmp.innerHTML = `<span class="cp-grid">${GRID}</span><b>${apps.length}</b><i class="cp-sep"></i><span class="cp-chev">${CHEV}</span>`;
    island.style.setProperty('--cmp-w', '156px');
    return;
  }
  const list = shown();
  const rest = apps.length - list.length;
  const labels = !!A.compactLabels && list.length <= 3;
  cmp.innerHTML = `<span class="cp-grid" title="Buka Pintasan Aplikasi">${GRID}</span>`
    + list.map((a) => `<button class="cp-app" data-id="${a.id}" title="${esc(a.name)}" aria-label="Buka ${esc(a.name)}">${a.icon ? `<img src="${a.icon}" alt="">` : `<span class="lt">${esc(a.name.charAt(0).toUpperCase())}</span>`}${labels ? `<span class="cl">${esc(a.name)}</span>` : ''}</button>`).join('')
    + (rest > 0 ? `<span class="cp-more">+${rest}</span>` : '');
  const w = 24 + 34 + list.reduce((s, a) => s + (labels ? 44 + Math.min(96, a.name.length * 7) : 42), 0) + (rest > 0 ? 52 : 0);
  island.style.setProperty('--cmp-w', `${Math.min(560, w)}px`);
}

// Pill audio: ikon speaker, persen, bar volume, dan batang aktivitas (sama dengan tab)
let compactAudio = null;
function renderAudio() {
  const m = audio.master;
  const muted = m.mute || m.vol <= 0.001;
  const pct = muted ? 0 : Math.round(m.vol * 100);
  const lvl = Math.sqrt(Math.max(0, m.peak || 0));
  const K = [0.55, 0.9, 1, 0.7];
  if (!compactAudio || !compactAudio.icon.isConnected) {
    cmp.innerHTML = '<span class="ca-ico"></span>'
      + '<span class="ca-pct"></span>'
      + '<span class="ca-bar"><i></i></span>'
      + '<span class="ca-eq"><i></i><i></i><i></i><i></i></span>';
    compactAudio = {
      icon: cmp.querySelector('.ca-ico'),
      pct: cmp.querySelector('.ca-pct'),
      bar: cmp.querySelector('.ca-bar i'),
      eq: cmp.querySelectorAll('.ca-eq i')
    };
  }

  compactAudio.icon.classList.toggle('mute', muted);
  const icon = speaker(m.vol, m.mute);
  if (compactAudio.icon.innerHTML !== icon) compactAudio.icon.innerHTML = icon;
  compactAudio.pct.textContent = `${pct}%`;
  compactAudio.bar.style.setProperty('--v', muted ? 0 : m.vol.toFixed(3));
  compactAudio.eq[0].parentElement.classList.toggle('off', muted);
  compactAudio.eq.forEach((bar, i) => {
    const value = muted ? 0.25 : Math.max(0.18, Math.min(1, lvl * K[i] + (lvl > 0.02 ? 0.12 : 0)));
    bar.style.transform = `scaleY(${value.toFixed(3)})`;
  });
}

function renderNotif(unread) {
  const pulse = Date.now() - lastArrival() < 4000;
  cmp.innerHTML = `<span class="cn-ico${pulse ? ' pulse' : ''}">${svg(BELL)}${pulse ? '<i class="cn-new"></i>' : ''}</span><b>${unread > 99 ? '99+' : unread}</b>`;
}

function sync() {
  const onFiles = kind === 'files' && count > 0;
  const onApps = kind === 'apps' && apps.length > 0;
  const onAudio_ = kind === 'audio' && !!audio.master;
  const unread = unreadCount();
  const timing = !!document.getElementById('pill')?.classList.contains('timing');
  const collapsed = island.dataset.mode === 'collapsed';
  const onNotif = !onFiles && !onApps && !onAudio_ && collapsed && unread > 0 && !timing;
  island.classList.toggle('cmp-files', onFiles);
  island.classList.toggle('cmp-apps', onApps);
  island.classList.toggle('cmp-audio', onAudio_);
  island.classList.toggle('cmp-notif', onNotif);
  cmp.classList.toggle('apps', onApps);
  cmp.classList.toggle('audio', onAudio_);
  cmp.classList.toggle('notif', onNotif);
  if (onFiles) {
    cmp.innerHTML = `<span class="cp-ico">${compactIcon(variant)}</span><b>${count}</b><i class="cp-sep"></i><span class="cp-chev">${CHEV}</span>`;
  } else if (onApps) renderApps();
  else if (onAudio_) renderAudio();
  else if (onNotif) renderNotif(unread);
  cmp.hidden = !(onFiles || onApps || onAudio_ || onNotif);
  watch('compact-audio', kind === 'audio' ? 'master' : 'off', cmp);
  // Ikon berdenyut sebentar setelah notifikasi baru masuk
  clearTimeout(pulseTimer);
  if (onNotif && Date.now() - lastArrival() < 4000) pulseTimer = setTimeout(sync, 4100 - (Date.now() - lastArrival()));
}
let pulseTimer = 0;

async function refreshTray() { try { count = (await window.api.trayList()).length; } catch { count = 0; } sync(); }
async function refreshApps() { try { apps = await window.api.appsList(); } catch { apps = []; } sync(); }
function readSettings(s) {
  variant = ((s && s.tray) || {}).compactIcon || 'outline';
  A = { ...APPS_DEFAULTS, ...((s && s.apps) || {}) };
}

document.addEventListener('island:modechange', (e) => {
  const d = e.detail;
  const left = d.mode === 'collapsed' && d.reason === 'pointerleave';
  kind = left && d.tab === 'files' ? 'files' : left && d.tab === 'apps' ? 'apps' : left && d.tab === 'audio' ? 'audio' : null;
  if (kind === 'files') refreshTray(); else if (kind === 'apps') refreshApps(); else sync();
});
window.api.onDataChanged((d) => {
  if (!d) return;
  if (d.kind === 'tray' && kind === 'files') refreshTray();
  if (d.kind === 'apps' && kind === 'apps') refreshApps();
});
onAudio(() => { if (kind === 'audio') sync(); });
onNotifs(() => sync());
// Pill waktu (timer/fokus/alarm) menandai dirinya dengan kelas 'timing'; pill notifikasi harus mundur saat itu terjadi
const pillEl = document.getElementById('pill');
if (pillEl) new MutationObserver(() => sync()).observe(pillEl, { attributes: true, attributeFilter: ['class'] });
window.api.onSettings((s) => { readSettings(s); sync(); });
window.api.getSettings().then(readSettings);

// Klik ikon favorit langsung membuka aplikasi; tidak ikut membuka island
cmp.addEventListener('click', (e) => {
  const b = e.target.closest('.cp-app');
  if (!b) return;
  e.stopPropagation();
  window.api.appsLaunch(b.dataset.id, false);
});
