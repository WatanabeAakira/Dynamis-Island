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

let kind = null; // 'files' | 'apps' | 'audio' | 'translate' | null
let count = 0, variant = 'outline', apps = [], A = { ...APPS_DEFAULTS };
let monitorSnapshot=null,quickSnapshot=null,networkSnapshot=null,batterySnapshot=null,Q={compactStatus:true},SM={compactMetric:'cpu'};
const fmt=(n)=>{if(n==null||!Number.isFinite(Number(n)))return'—';const v=Number(n);return v>=1048576?`${(v/1048576).toFixed(1)} MB/s`:`${Math.round(v/1024)} KB/s`;};
let translationCompact = { processing: false, source: '', target: '', result: false };

function shown() {
  const list = A.favFirst ? [...apps.filter((x) => x.favorite), ...apps.filter((x) => !x.favorite)] : [...apps];
  return list.slice(0, Math.max(1, Math.min(8, Number(A.favCount) || 4)));
}

function renderApps() {
  if (A.compactMode === 'count') {
    cmp.innerHTML = `<span class="cp-grid">${GRID}</span><b>${apps.length}</b><i class="cp-sep"></i><span class="cp-chev">${CHEV}</span>`;
    island.style.setProperty('--cmp-w', '104px');
    return;
  }
  // Compact pill prioritizes a few launchable icons and summarizes the rest.
  // This keeps the collapsed island close to the Media Player footprint.
  const all = shown();
  const list = all.slice(0, A.compactLabels ? 2 : 3);
  const rest = apps.length - list.length;
  const labels = !!A.compactLabels && list.length <= 3;
  cmp.innerHTML = `<span class="cp-grid" title="Buka Pintasan Aplikasi">${GRID}</span>`
    + list.map((a) => `<button class="cp-app" data-id="${a.id}" title="${esc(a.name)}" aria-label="Buka ${esc(a.name)}">${a.icon ? `<img src="${a.icon}" alt="">` : `<span class="lt">${esc(a.name.charAt(0).toUpperCase())}</span>`}${labels ? `<span class="cl">${esc(a.name)}</span>` : ''}</button>`).join('')
    + (rest > 0 ? `<span class="cp-more">+${rest}</span>` : '');
  const w = 24 + 34 + list.reduce((s, a) => s + (labels ? 44 + Math.min(96, a.name.length * 7) : 42), 0) + (rest > 0 ? 52 : 0);
  island.style.setProperty('--cmp-w', `${Math.min(228, Math.max(188, w))}px`);
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

function renderTranslate() {
  if (translationCompact.processing) {
    cmp.innerHTML = '<span class="ct-spinner" aria-hidden="true"></span><b>Translating</b>';
  } else if (translationCompact.result) {
    const source = translationCompact.source.toUpperCase().slice(0, 2) || '??';
    const target = translationCompact.target.toUpperCase().slice(0, 2) || '??';
    cmp.innerHTML = `<span class="ct-check" aria-hidden="true">✓</span><b>${source} → ${target}</b>`;
  } else {
    cmp.innerHTML = '<span class="ct-icon" aria-hidden="true">文</span>';
  }
}

function sync() {
  const onFiles = kind === 'files' && count > 0;
  const onApps = kind === 'apps' && apps.length > 0;
  const onAudio_ = kind === 'audio' && !!audio.master;
  const onTranslate = kind === 'translate';
  const onQuick = kind === 'quick-settings';
  const onMonitor = kind === 'system-monitor';
  const onNetwork = kind === 'network-monitor';
  const onBattery = kind === 'battery-power';
  const unread = unreadCount();
  const timing = !!document.getElementById('pill')?.classList.contains('timing');
  const collapsed = island.dataset.mode === 'collapsed';
  const onNotif = !onFiles && !onApps && !onAudio_ && !onTranslate && !onQuick && !onMonitor && collapsed && unread > 0 && !timing;
  island.classList.toggle('cmp-files', onFiles);
  island.classList.toggle('cmp-apps', onApps);
  island.classList.toggle('cmp-audio', onAudio_);
  island.classList.toggle('cmp-notif', onNotif);
  island.classList.toggle('cmp-translate', onTranslate);
  island.classList.toggle('cmp-quick-settings', onQuick);
  island.classList.toggle('cmp-system-monitor', onMonitor);
  island.classList.toggle('cmp-network-monitor', onNetwork);
  island.classList.toggle('cmp-battery-power', onBattery);
  cmp.classList.toggle('apps', onApps);
  cmp.classList.toggle('audio', onAudio_);
  cmp.classList.toggle('notif', onNotif);
  cmp.classList.toggle('quick-settings',onQuick);
  cmp.classList.toggle('system-monitor',onMonitor);
  cmp.classList.toggle('network-monitor',onNetwork);
  cmp.classList.toggle('battery-power',onBattery);
  if (onFiles) {
    cmp.innerHTML = `<span class="cp-ico">${compactIcon(variant)}</span><b>${count}</b><i class="cp-sep"></i><span class="cp-chev">${CHEV}</span>`;
  } else if (onApps) renderApps();
  else if (onAudio_) renderAudio();
  else if (onNotif) renderNotif(unread);
  else if (onTranslate) renderTranslate();
  else if (onQuick) cmp.innerHTML = `<span class="cq-ico">${svg('<path d="M4 7h7m4 0h5M4 17h3m4 0h9"/><circle cx="13" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>')}</span><b>Quick Settings</b>${Q.compactStatus&&quickSnapshot?`<small>${quickSnapshot.wifiConnected?'Wi-Fi':quickSnapshot.bluetoothEnabled?'Bluetooth':'Ready'}</small>`:''}`;
  else if (onMonitor) { const ram=SM.compactMetric==='ram';const v=ram?monitorSnapshot?.memoryPercent:monitorSnapshot?.cpuPercent;cmp.innerHTML = `<span class="cm-ico">${svg('<path d="M2 13h4l3-8 5 14 3-8h5"/>')}</span><b>${ram?'RAM':'CPU'} ${v==null?'—':`${Math.round(v)}%`}</b>`; }
  else if (onNetwork) cmp.innerHTML=`<i class="nm-compact-status ${networkSnapshot?.status==='connected'?'connected':networkSnapshot?.status==='disconnected'?'disconnected':''}"></i><span class="cm-ico">${svg('<path d="M2 8.8a15 15 0 0 1 20 0M5 12a10.5 10.5 0 0 1 14 0m-11 3.2a5.7 5.7 0 0 1 8 0M12 19h.01"/>')}</span><b>↓ ${networkSnapshot?fmt(networkSnapshot.downloadBytesPerSecond):'—'} &nbsp; ↑ ${networkSnapshot?fmt(networkSnapshot.uploadBytesPerSecond):'—'}</b>`;
  else if (onBattery) cmp.innerHTML=`<span class="cm-ico">${svg('<rect x="3" y="6" width="17" height="12" rx="2.5"/><path d="M22 10v4"/>')}</span><b>${batterySnapshot?.percent==null?'No battery':`${batterySnapshot.percent}%`}${batterySnapshot?.charging?' ⚡':''}</b>`;
  cmp.hidden = !(onFiles || onApps || onAudio_ || onNotif || onTranslate || onQuick || onMonitor || onNetwork || onBattery);
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
  Q = { compactStatus: s?.quickSettings?.compactStatus !== false };
  SM = { compactMetric: s?.systemMonitor?.compactMetric === 'ram' ? 'ram' : 'cpu' };
}

document.addEventListener('island:modechange', (e) => {
  const d = e.detail;
  const left = d.mode === 'collapsed' && d.reason === 'pointerleave';
  kind = left && d.tab === 'files' ? 'files' : left && d.tab === 'apps' ? 'apps' : left && d.tab === 'audio' ? 'audio' : left && d.tab === 'translate' ? 'translate' : left && d.tab === 'quick-settings' ? 'quick-settings' : left && d.tab === 'system-monitor' ? 'system-monitor' : left && d.tab === 'network-monitor' ? 'network-monitor' : left && d.tab === 'battery-power' ? 'battery-power' : null;
  if (kind === 'files') refreshTray(); else if (kind === 'apps') refreshApps(); else sync();
});
window.api.onDataChanged((d) => {
  if (!d) return;
  if (d.kind === 'tray' && kind === 'files') refreshTray();
  if (d.kind === 'apps' && kind === 'apps') refreshApps();
});
onAudio(() => { if (kind === 'audio') sync(); });
onNotifs(() => sync());
window.addEventListener('quick-settings-state',(e)=>{quickSnapshot=e.detail||null;if(kind==='quick-settings')sync();});
window.addEventListener('system-monitor:snapshot',(e)=>{monitorSnapshot=e.detail||null;if(kind==='system-monitor')sync();});
window.addEventListener('network-monitor:snapshot',(e)=>{networkSnapshot=e.detail||null;if(kind==='network-monitor')sync();});
window.addEventListener('battery-power:snapshot',(e)=>{batterySnapshot=e.detail||null;if(kind==='battery-power')sync();});
// Pill waktu (timer/fokus/alarm) menandai dirinya dengan kelas 'timing'; pill notifikasi harus mundur saat itu terjadi
const pillEl = document.getElementById('pill');
if (pillEl) new MutationObserver(() => sync()).observe(pillEl, { attributes: true, attributeFilter: ['class'] });
window.api.onSettings((s) => { readSettings(s); sync(); });
window.api.getSettings().then(readSettings);

window.api.onHelper((message) => {
  if (!message || !String(message.type || '').startsWith('translate-')) return;
  if (message.type === 'translate-status') {
    translationCompact.processing = !!message.processing;
    if (message.status === 'Translation Completed') translationCompact.result = true;
    if (message.status === 'Ready to Translate' || message.status === 'No Text Detected') translationCompact.result = false;
  } else if (message.type === 'translate-input') {
    translationCompact.processing = true;
    translationCompact.result = false;
  }
  if (kind === 'translate') sync();
});

window.api.onTranslate((event) => {
  if (!event) return;
  if (event.kind === 'status') translationCompact.processing = true;
  if (event.kind === 'done') {
    translationCompact.processing = false;
    translationCompact.result = true;
    translationCompact.source = event.sourceLanguage || '';
    translationCompact.target = event.targetLanguage || '';
  }
  if (event.kind === 'error') translationCompact.processing = false;
  if (kind === 'translate') sync();
});

// Klik ikon favorit langsung membuka aplikasi; tidak ikut membuka island
cmp.addEventListener('click', (e) => {
  const b = e.target.closest('.cp-app');
  if (!b) return;
  e.stopPropagation();
  window.api.appsLaunch(b.dataset.id, false);
});
