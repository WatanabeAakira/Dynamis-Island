// Tab Media Player + state media yang dipakai juga oleh mode collapse.
import { setArt } from './palette.js';
import { speaker } from './audio-view.js';
import { audio, onAudio, watch, setMasterVolume, setMasterMute } from './audio-link.js';
import { makeSlider } from './slider.js';
import { showTrackToast } from './toast.js';
import { L, trackChanged, setLyricsMode, createPanel, initMini } from './lyrics.js';

const svg = (b) => `<svg viewBox="0 0 24 24" aria-hidden="true">${b}</svg>`;
const ICON = {
  play:    svg('<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>'),
  pause:   svg('<rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none"/><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none"/>'),
  prev:    svg('<path d="M18 6v12L9.5 12z" fill="currentColor" stroke="none"/><path d="M6 6v12"/>'),
  next:    svg('<path d="M6 6v12l8.5-6z" fill="currentColor" stroke="none"/><path d="M18 6v12"/>'),
  shuffle: svg('<path d="M3 7h3.5c5 0 5 10 10 10H21M3 17h3.5c1.6 0 2.7-.9 3.6-2M21 7h-4.5c-1.6 0-2.7.9-3.6 2M18.5 4.5 21 7l-2.5 2.5M18.5 14.5 21 17l-2.5 2.5"/>'),
  repeat:  svg('<path d="M4 11V9a3 3 0 0 1 3-3h13M17 3l3 3-3 3M20 13v2a3 3 0 0 1-3 3H4M7 21l-3-3 3-3"/>'),
  repeat1: svg('<path d="M4 11V9a3 3 0 0 1 3-3h13M17 3l3 3-3 3M20 13v2a3 3 0 0 1-3 3H4M7 21l-3-3 3-3"/><path d="M11 10.5l1.5-1v5"/>'),
  lyrics:  svg('<path d="M4 6.5h10M4 12h16M4 17.5h12"/><path d="M19 5v5.5" /><circle cx="17" cy="10.5" r="2" fill="currentColor" stroke="none"/>'),
  note:    svg('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>')
};

let st = { active: false };
export const mediaNow = () => st;
let art = null;
let helperError = null;
let toastPending = false;
let toastWait = 0;
const subs = new Set();

const pill = {
  art: document.getElementById('pill-art'),
  wave: document.getElementById('pill-wave')
};

function friendlySource(id = '') {
  const s = id.toLowerCase();
  const map = [
    ['spotify', 'Spotify'], ['msedge', 'Microsoft Edge'], ['chrome', 'Chrome'], ['firefox', 'Firefox'],
    ['brave', 'Brave'], ['opera', 'Opera'], ['vlc', 'VLC'], ['applemusic', 'Apple Music'],
    ['zunemusic', 'Media Player'], ['music.ui', 'Media Player'], ['youtube', 'YouTube Music'],
    ['foobar', 'foobar2000'], ['musicbee', 'MusicBee'], ['aimp', 'AIMP']
  ];
  for (const [k, v] of map) if (s.includes(k)) return v;
  const tail = id.split('!').pop().split('.').filter(Boolean);
  const name = (tail.length > 1 && tail[tail.length - 1].toLowerCase() === 'exe' ? tail[tail.length - 2] : tail[tail.length - 1]) || 'Aplikasi lain';
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// Teks panjang bergerak pelan (marquee), hanya jika memang tidak muat
function fit(el) {
  const span = el.firstChild;
  el.classList.remove('mq');
  const over = span.offsetWidth - el.clientWidth;
  if (over > 2) {
    el.style.setProperty('--mq', `-${over + 18}px`);
    el.style.setProperty('--mqt', `${Math.max(6, over / 22 + 4).toFixed(1)}s`);
    el.classList.add('mq');
  }
}
function setMq(el, text) {
  const span = el.firstChild;
  if (span.textContent === text) return;
  span.textContent = text;
  fit(el);
}

const fmt = (ms) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};

function livePos() {
  if (!st.active) return 0;
  let p = st.positionMs || 0;
  if (st.status === 'Playing') p += (performance.now() - st.recvAt) * (st.rate || 1);
  return Math.max(0, st.durationMs > 0 ? Math.min(p, st.durationMs) : p);
}

// Info lagu di mode collapse: tunggu cover sebentar supaya tampil lengkap
function fireToast() {
  if (!toastPending) return;
  toastPending = false;
  clearTimeout(toastWait);
  if (st.active) showTrackToast({ title: st.title, artist: st.artist, art });
}

function onMsg(m) {
  if (m.type === 'error') { helperError = m.message; }
  else if (m.type === 'state') {
    helperError = null;
    if (m.newTrack || !m.active) art = null;
    if (m.thumb) art = m.thumb;
    st = { ...m, recvAt: performance.now() };
    trackChanged(st);
    setArt(art, st.active && !!(st.title || st.artist));
    if (m.active && m.newTrack) {
      toastPending = true;
      clearTimeout(toastWait);
      toastWait = setTimeout(fireToast, 1200);
    }
    if (toastPending && art) fireToast();
  } else return;
  paintPill();
  subs.forEach((f) => f());
}

function paintPill() {
  const on = st.active && !!(st.title || st.artist);
  pill.art.hidden = !(on && art);
  if (art) pill.art.src = art;
  pill.wave.hidden = !on;
  pill.wave.classList.toggle('paused', st.status !== 'Playing');
}

export async function initMedia() {
  initMini({ getPos: livePos });
  window.api.getSettings().then((s) => { if (s.lyricsMode) setLyricsMode(true, false); });
  window.api.onHelper(onMsg);
  const s = await window.api.helperStatus();
  if (s && s.error) onMsg({ type: 'error', message: s.error });
}

export function renderMedia(container) {
  container.innerHTML = `
    <div class="view media" id="m-root">
      <div class="m-empty">
        <div class="big">${ICON.note}</div>
        <h2>Belum ada media yang diputar</h2>
        <p id="m-empty-msg">Putar lagu di Spotify, browser, atau pemutar lain di Windows.</p>
      </div>
      <div class="m-main">
        <div class="m-left">
          <div class="m-hero">
            <div class="m-cover">
              <img id="m-art" alt="" hidden>
              <div class="m-noart">${ICON.note}</div>
            </div>
            <div class="m-info">
              <div class="m-top">
                <div class="m-meta">
                  <div class="m-title" id="m-title"><span></span></div>
                  <div class="m-artist" id="m-artist"><span></span></div>
                  <div class="m-album" id="m-album"><span></span></div>
                </div>
                <div class="m-side">
                  <button class="ctl lyr" id="m-lyr" title="Lirik" aria-label="Lirik">${ICON.lyrics}</button>
                </div>
              </div>
              <div class="m-src-row"><span class="m-src" id="m-src"></span><select class="m-session" id="m-session" aria-label="Pilih sesi media" hidden></select></div>
              <div class="m-wave-row"><span class="wave" id="m-wave"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span></div>
            </div>
          </div>
          <div class="m-prog">
            <span id="m-cur">0:00</span>
            <div class="m-bar" id="m-bar"><div class="m-fill"></div><div class="m-knob"></div></div>
            <span id="m-dur">0:00</span>
          </div>
          <div class="m-foot">
            <div class="m-ctl">
              <button class="ctl" data-cmd="shuffle" title="Acak" aria-label="Acak">${ICON.shuffle}</button>
              <button class="ctl" data-cmd="prev" title="Sebelumnya" aria-label="Sebelumnya">${ICON.prev}</button>
              <button class="ctl main" data-cmd="toggle" id="m-play" title="Putar atau jeda" aria-label="Putar atau jeda">${ICON.play}</button>
              <button class="ctl" data-cmd="next" title="Berikutnya" aria-label="Berikutnya">${ICON.next}</button>
              <button class="ctl" data-cmd="repeat" title="Ulangi" aria-label="Ulangi">${ICON.repeat}</button>
            </div>
            <div class="vol">
              <button class="vbtn" id="vbtn" aria-label="Volume"></button>
              <div class="vpop"><div class="sl" id="vsl"><i class="fill"></i><i class="knob"></i></div><span id="vpct">--</span></div>
            </div>
          </div>
        </div>
        <div class="m-right" id="m-right"></div>
      </div>
    </div>`;

  const $ = (id) => container.querySelector(id);
  const root = $('#m-root'), bar = $('#m-bar'), sessionPicker = $('#m-session');
  const el = {
    art: $('#m-art'), title: $('#m-title'), artist: $('#m-artist'), album: $('#m-album'),
    src: $('#m-src'), wave: $('#m-wave'), cur: $('#m-cur'), dur: $('#m-dur'),
    play: $('#m-play'), msg: $('#m-empty-msg')
  };
  const btn = (c) => container.querySelector(`[data-cmd="${c}"]`);
  let playIcon = '';
  const panel = createPanel($('#m-right'), {
    canSeek: () => !!(st.controls && st.controls.seek),
    seek: (ms) => {
      st.positionMs = ms;
      st.recvAt = performance.now();
      window.api.helperSend({ cmd: 'seek', value: Math.round(ms) });
    }
  });
  const lyrBtn = $('#m-lyr');
  let sessionSignature = '';
  sessionPicker.addEventListener('change', () => window.api.helperSend({ cmd: 'media-select-session', sessionId: sessionPicker.value }));
  const syncLyr = () => { root.classList.toggle('lyrics', L.mode); lyrBtn.classList.toggle('on', L.mode); };
  syncLyr();
  lyrBtn.addEventListener('click', () => { setLyricsMode(!L.mode); syncLyr(); });

  function paint() {
    if (!root.isConnected) return subs.delete(paint);
    const has = st.active && !!(st.title || st.artist);
    root.classList.toggle('empty', !has);
    el.msg.textContent = helperError || 'Putar lagu di Spotify, browser, atau pemutar lain di Windows.';
    const sessions = Array.isArray(st.sessions) ? st.sessions : [];
    const nextSessionSignature = JSON.stringify([sessions, st.selectedSessionId || st.sessionId || '']);
    if (nextSessionSignature !== sessionSignature) {
      sessionSignature = nextSessionSignature;
      sessionPicker.replaceChildren(...sessions.map((s) => {
        const option = document.createElement('option');
        option.value = s.id;
        const app = friendlySource(s.source);
        option.textContent = [s.title, s.artist, app].filter(Boolean).join(' · ') || app;
        return option;
      }));
      sessionPicker.hidden = sessions.length < 2;
      sessionPicker.value = st.selectedSessionId || st.sessionId || '';
    }
    if (!has) return;

    setMq(el.title, st.title || 'Tanpa judul');
    setMq(el.artist, st.artist || '');
    setMq(el.album, st.album || '');
    el.src.textContent = friendlySource(st.source);
    el.art.hidden = !art;
    if (art && el.art.src !== art) el.art.src = art;
    el.wave.classList.toggle('paused', st.status !== 'Playing');

    const next = st.status === 'Playing' ? 'pause' : 'play';
    if (playIcon !== next) { el.play.innerHTML = ICON[next]; playIcon = next; }

    const c = st.controls || {};
    btn('shuffle').disabled = !c.shuffle;
    btn('repeat').disabled = !c.repeat;
    btn('prev').disabled = !c.prev;
    btn('next').disabled = !c.next;
    el.play.disabled = !(c.play || c.pause);
    btn('shuffle').classList.toggle('on', !!st.shuffle);
    btn('repeat').classList.toggle('on', st.repeat && st.repeat !== 'None');
    btn('repeat').innerHTML = st.repeat === 'Track' ? ICON.repeat1 : ICON.repeat;
    bar.classList.toggle('locked', !(c.seek && st.durationMs > 0));
  }
  subs.add(paint);
  paint();
  // Ukur ulang marquee saat lebar berubah (mis. membuka tampilan lirik)
  new ResizeObserver(() => [el.title, el.artist, el.album].forEach(fit)).observe(container.querySelector('.m-meta'));

  // Volume utama: popover muncul saat kursor di ikon speaker. Klik = bisukan, roda mouse = atur volume.
  const vbtn = $('#vbtn'), vpct = $('#vpct');
  const vsl = makeSlider($('#vsl'), { onInput: (v) => { setMasterVolume(v); paintVol(); } });
  function paintVol() {
    if (!root.isConnected) return offVol();
    const m = audio.master;
    const vol = m ? m.vol : 0, mute = m ? m.mute : false;
    if (!vsl.busy()) vsl.set(vol);
    vpct.textContent = m ? Math.round(vol * 100) + '%' : '--';
    const k = mute || vol <= 0.001 ? 'm' : vol < 0.5 ? 'l' : 'h';
    if (vbtn.dataset.k !== k) { vbtn.dataset.k = k; vbtn.innerHTML = speaker(vol, mute); }
  }
  const offVol = onAudio(paintVol);
  watch('media', 'master', root);
  paintVol();
  vbtn.addEventListener('click', () => { if (audio.master) setMasterMute(!audio.master.mute); paintVol(); });
  vbtn.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (audio.master) setMasterVolume(Math.min(1, Math.max(0, audio.master.vol + (e.deltaY < 0 ? 0.05 : -0.05))));
    paintVol();
  }, { passive: false });

  container.querySelectorAll('.ctl[data-cmd]').forEach((b) =>
    b.addEventListener('click', () => window.api.helperSend({ cmd: b.dataset.cmd })));

  // Seek: klik atau seret pada progress bar
  let drag = null;
  const ratio = (e) => {
    const r = bar.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  };
  bar.addEventListener('pointerdown', (e) => {
    if (bar.classList.contains('locked')) return;
    bar.setPointerCapture(e.pointerId);
    drag = ratio(e);
  });
  bar.addEventListener('pointermove', (e) => { if (drag !== null) drag = ratio(e); });
  bar.addEventListener('pointerup', () => {
    if (drag === null) return;
    const ms = Math.round(drag * st.durationMs);
    drag = null;
    st.positionMs = ms;
    st.recvAt = performance.now();
    window.api.helperSend({ cmd: 'seek', value: ms });
  });

  // Progress bar diinterpolasi tiap frame supaya mulus
  let lastCur = '', lastDur = '';
  let shownMode = L.mode;
  (function frame() {
    if (!root.isConnected) return;
    if (L.mode !== shownMode) { shownMode = L.mode; syncLyr(); }
    if (st.active) {
      const dur = st.durationMs || 0;
      const pos = drag !== null ? drag * dur : livePos();
      bar.style.setProperty('--p', dur ? (pos / dur).toFixed(4) : 0);
      const c = fmt(pos), d = dur ? fmt(dur) : '--:--';
      if (c !== lastCur) { el.cur.textContent = lastCur = c; }
      if (d !== lastDur) { el.dur.textContent = lastDur = d; }
      if (L.mode) panel.update(pos);
    }
    requestAnimationFrame(frame);
  })();
}
