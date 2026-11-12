// Info lagu di mode collapse: saat lagu berganti, pill melebar sebentar menampilkan cover dan judul.

const island = document.getElementById('island');
const titleEl = document.getElementById('toast-title');
const artistEl = document.getElementById('toast-artist');
const artEl = document.getElementById('toast-art');
const cover = document.querySelector('.toast-cover');
const ctx = document.createElement('canvas').getContext('2d');
const SHOW_MS = 4200;
let timer = 0;

const FONT = '"Segoe UI Variable Text","Segoe UI",sans-serif';

function widthFor(title, artist) {
  ctx.font = `600 12.5px ${FONT}`;
  const a = ctx.measureText(title).width;
  ctx.font = `11.5px ${FONT}`;
  const b = ctx.measureText(artist).width;
  // padding kiri 8 + cover 32 + jarak 10 + padding kanan 14 + cadangan 4
  return Math.round(Math.min(340, Math.max(200, Math.max(a, b) + 68)));
}

function end() {
  clearTimeout(timer);
  timer = 0;
  island.classList.remove('toast', 'notice');
  cover.classList.remove('notice');
}

let enabled = true;
export function setToastEnabled(v) { enabled = !!v; if (!enabled) end(); }

export function showTrackToast({ title, artist, art }) {
  if (!enabled || (!title && !artist)) return;
  if (island.dataset.mode !== 'collapsed') return; // hanya saat island tertutup
  cover.classList.remove('notice');
  island.classList.remove('notice');
  titleEl.textContent = title || artist;
  artistEl.textContent = title ? artist || '' : '';
  artEl.hidden = !art;
  if (art) artEl.src = art;
  island.style.setProperty('--toast-w', widthFor(titleEl.textContent, artistEl.textContent) + 'px');
  island.classList.add('toast');
  clearTimeout(timer);
  timer = setTimeout(end, SHOW_MS);
}

// Island dibuka (hover/klik/drag): info lagu langsung ditutup
document.addEventListener('island:modechange', (e) => { if (e.detail.mode !== 'collapsed') end(); });

// Pengingat (mis. event kalender): banner singkat di mode collapse, ikon lonceng berwarna sesuai event
let noticeMs = 7000;
export function setNoticeMs(ms) { noticeMs = Math.max(3000, Math.min(15000, Number(ms) || 7000)); }

export function showNotice({ title, sub, color }) {
  if (island.dataset.mode !== 'collapsed') return;
  titleEl.textContent = title || 'Pengingat';
  artistEl.textContent = sub || '';
  artEl.hidden = true;
  cover.classList.add('notice');
  cover.style.setProperty('--nc', color || '#38bdf8');
  island.classList.add('notice');
  island.style.setProperty('--toast-w', widthFor(titleEl.textContent, artistEl.textContent) + 'px');
  island.classList.add('toast');
  clearTimeout(timer);
  timer = setTimeout(end, noticeMs);
}
document.addEventListener('island:notify', (e) => showNotice(e.detail || {}));
