// State lirik, panel 3 baris untuk tab Media, dan mini lyrics untuk mode collapse.

export const L = { mode: false, key: '', status: 'idle', lines: [], synced: false, source: '', flash: '', displayMode: 'original', animationPreset: 'smooth' };
const subs = new Set();
let token = 0;
let lastTrack = null;
const emit = () => subs.forEach((f) => f());
export const onLyrics = (f) => { subs.add(f); return () => subs.delete(f); };

const LEAD_MS = 120; // sedikit lebih awal supaya terasa pas
let offsetMs = 0;     // penyesuaian dari Pengaturan (positif = lirik lebih awal)
export const setLyricsOffset = (ms) => { offsetMs = Number(ms) || 0; };

const LYRIC_ANIMATION_PRESETS = {
  subtle: { duration: 180, distance: 4, intensity: 0.35 },
  smooth: { duration: 420, distance: 12, intensity: 0.7 },
  kinetic: { duration: 260, distance: 22, intensity: 0.9 },
  elastic: { duration: 620, distance: 12, intensity: 0.85 },
  morph: { duration: 360, distance: 8, intensity: 0.65 },
  wave: { duration: 460, distance: 14, intensity: 0.7 },
  cinematic: { duration: 700, distance: 18, intensity: 0.8 }
};
let lyricAnimation = { preset: 'smooth', ...LYRIC_ANIMATION_PRESETS.smooth };

function applyLyricAnimation(el) {
  if (!el) return;
  el.dataset.animation = lyricAnimation.preset;
  el.style.setProperty('--lyric-duration', `${lyricAnimation.duration}ms`);
  el.style.setProperty('--lyric-distance', `${lyricAnimation.distance}px`);
  el.style.setProperty('--lyric-intensity', String(lyricAnimation.intensity));
  el.style.setProperty('--lyric-start-opacity', String(1 - lyricAnimation.intensity * 0.45));
}

export function setLyricsDisplaySettings(settings = {}) {
  const displayMode = ['original', 'romaji', 'both'].includes(settings.lyricsDisplayMode) ? settings.lyricsDisplayMode : 'original';
  const system = ['hepburn', 'nippon', 'passport'].includes(settings.romajiSystem) ? settings.romajiSystem : 'hepburn';
  const preset = Object.hasOwn(LYRIC_ANIMATION_PRESETS, settings.lyricsAnimationPreset) || settings.lyricsAnimationPreset === 'custom'
    ? settings.lyricsAnimationPreset : 'smooth';
  const base = LYRIC_ANIMATION_PRESETS[preset] || LYRIC_ANIMATION_PRESETS.smooth;
  lyricAnimation = preset === 'custom' ? {
    preset,
    duration: Math.max(100, Math.min(1000, Number(settings.lyricsAnimationDurationMs) || 420)),
    distance: Math.max(0, Math.min(32, Number(settings.lyricsAnimationDistancePx ?? 12))),
    intensity: Math.max(0, Math.min(100, Number(settings.lyricsAnimationIntensity ?? 70))) / 100
  } : { preset, ...base };
  L.animationPreset = preset;
  applyLyricAnimation(document.querySelector('.l-track'));
  applyLyricAnimation(document.getElementById('pill-lyric'));
  const displayChanged = L.displayMode !== displayMode || L.romajiSystem !== system;
  if (!displayChanged) return;
  L.displayMode = displayMode;
  L.romajiSystem = system;
  if (lastTrack && L.status !== 'idle') reloadLyrics();
  else emit();
}

// Dipanggil tiap ada state media baru
export function trackChanged(st) {
  const has = st.active && (st.title || st.artist);
  const key = has ? `${st.source}|${st.title}|${st.artist}|${st.album}` : '';
  if (key === L.key) return;
  L.key = key;
  token++;
  L.lines = []; L.synced = false; L.source = '';
  L.status = 'idle';
  lastTrack = has ? { title: st.title, artist: st.artist, album: st.album, durationMs: st.durationMs } : null;
  if (L.mode) load(); else emit();
}

export function setLyricsMode(on, persist = true) {
  L.mode = on;
  if (persist) window.api.setSettings({ lyricsMode: on }); // diingat setelah aplikasi dibuka ulang
  if (on && L.status === 'idle') load(); else emit();
}

// Muat ulang lirik lagu yang sedang diputar (dipakai setelah salinan lirik dihapus)
export function reloadLyrics() {
  if (!lastTrack) return;
  token++;
  L.status = 'idle'; L.lines = []; L.synced = false; L.source = '';
  if (L.mode) load(); else emit();
}

function load() {
  if (!lastTrack) { L.status = 'idle'; emit(); return; }
  const my = ++token;
  L.since = Date.now();
  L.status = 'loading';
  emit();
  window.api.getLyrics(lastTrack).then((r) => {
    if (my !== token) return;
    L.status = r.status;
    L.lines = r.lines || [];
    L.synced = !!r.synced;
    L.source = r.source || '';
    emit();
  }).catch(() => { if (my === token) { L.status = 'error'; emit(); } });
}

export function indexAt(pos) {
  if (!L.synced || !L.lines.length) return -1;
  const p = pos + LEAD_MS + offsetMs;
  let lo = 0, hi = L.lines.length - 1, ans = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (L.lines[m].t <= p) { ans = m; lo = m + 1; } else hi = m - 1;
  }
  return ans;
}

// Cari kata terakhir yang timestamp-nya sudah dilewati dalam Enhanced LRC.
// Binary search membuat update karaoke murah walau satu baris berisi banyak kata.
export function activeWordAt(words, positionMs) {
  if (!Array.isArray(words) || !words.length) return -1;
  let lo = 0, hi = words.length - 1, answer = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid].t <= positionMs) { answer = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return answer;
}

const NOTES = {
  loading: 'Mencari lirik...',
  none: 'Belum ada lirik untuk lagu ini',
  instrumental: 'Lagu instrumental',
  plain: 'Lirik ini tidak punya timestamp',
  error: 'Lirik tidak bisa dimuat'
};

let flashTimer = 0;
function flash(text) {
  L.flash = text;
  emit();
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { L.flash = ''; emit(); }, 3200);
}

// Pilih file .lrc: disalin ke folder project dan dinamai sesuai lagu yang sedang diputar
function applyImported(r, key) {
  if (!r) return; // dialog dibatalkan
  if (r.status !== 'ok') { flash('File ini tidak punya timestamp'); return; }
  if (key !== L.key) return; // lagu sudah berganti; file tetap tersimpan
  token++;
  L.status = 'ok'; L.lines = r.lines; L.synced = true; L.source = 'local';
  flash('Lirik disimpan untuk lagu ini');
}

export async function importFile() {
  if (!lastTrack) return;
  const key = L.key;
  applyImported(await window.api.importLyrics(lastTrack), key);
}

// ---------- Drag and drop file lirik ----------
async function decodeText(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf).replace(/^\uFEFF/, '');
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder('utf-16be').decode(buf).replace(/^\uFEFF/, '');
  return new TextDecoder('utf-8').decode(buf).replace(/^\uFEFF/, '');
}

export async function importDropped(fileList) {
  if (!lastTrack) { flash('Putar lagu dulu'); return; }
  const f = [...fileList].find((x) => /\.(lrc|elrc|txt)$/i.test(x.name));
  if (!f) { flash('Gunakan file .lrc, .elrc, atau .txt'); return; }
  if (f.size > 2 * 1024 * 1024) { flash('File terlalu besar'); return; }
  const key = L.key;
  try {
    applyImported(await window.api.importLyricsText(lastTrack, await decodeText(f), f.name), key);
  } catch { flash('File tidak bisa dibaca'); }
}

// ---------- Panel kanan: tiga baris ----------
const FILE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>';

export function createPanel(root, opts = {}) {
  root.innerHTML = `
    <div class="l-note" hidden>
      <span class="l-msg"></span>
      <button class="btn l-pick">Pilih file .lrc</button>
    </div>
    <div class="l-track">
      <div class="l-slot prev"></div><div class="l-slot cur"></div><div class="l-slot next"></div>
    </div>
    <button class="l-swap" title="Ganti dengan file .lrc" aria-label="Ganti dengan file .lrc">${FILE_ICON}</button>
    <div class="l-flash" hidden></div>`;
  const q = (c) => root.querySelector(c);
  const note = q('.l-note'), msg = q('.l-msg'), pick = q('.l-pick'), swap = q('.l-swap');
  const flashEl = q('.l-flash'), track = q('.l-track');
  applyLyricAnimation(track);
  const [prev, cur, next] = track.querySelectorAll('.l-slot');
  pick.addEventListener('click', importFile);
  swap.addEventListener('click', importFile);

  // Klik baris lirik untuk lompat ke posisi itu
  [['prev', prev], ['cur', cur], ['next', next]].forEach(([k, el]) => el.addEventListener('click', () => {
    const l = slotLines[k];
    if (l && l.t != null && opts.canSeek && opts.canSeek()) opts.seek(l.t);
  }));
  let lastIdx = -99, lastKey = '', lastLines = null, lastFlash = '', spans = [], curLine = null, activeWord = -1;
  let slotLines = {}, lastSeekable = null;

  const setSimple = (el, line) => {
    el.replaceChildren();
    if (!line) return;
    const original = document.createElement('span');
    original.className = 'l-original';
    original.textContent = line.text || '';
    el.append(original);
    if (L.displayMode === 'both' && line.romaji && line.romaji !== line.text) {
      const romaji = document.createElement('span');
      romaji.className = 'l-romaji'; romaji.textContent = line.romaji; el.append(romaji);
    } else if (L.displayMode === 'romaji') original.textContent = line.romaji || line.text || '';
  };

  function slide(direction = 1) {
    track.dataset.direction = direction < 0 ? 'up' : 'down';
    const signedDistance = (direction < 0 ? -1 : 1) * lyricAnimation.distance;
    track.style.setProperty('--lyric-shift', `${signedDistance}px`);
    track.style.setProperty('--lyric-half-shift', `${signedDistance * 0.5}px`);
    track.style.setProperty('--lyric-overshoot', `${signedDistance * -0.12}px`);
    track.classList.remove('is-moving');
    void track.offsetWidth;
    track.classList.add('is-moving');
  }

  function setCur(line) {
    curLine = line;
    spans = []; activeWord = -1;
    cur.replaceChildren();
    if (!line) { cur.textContent = '\u266A'; return; }
    const original = document.createElement('span');
    original.className = 'l-original';
    cur.append(original);
    if (L.displayMode !== 'romaji' && line.words && line.words.length) {
      for (const w of line.words) {
        const s = document.createElement('span');
        s.className = 'w';
        s.textContent = w.text;
        s.style.setProperty('--f', '0%');
        original.appendChild(s);
        spans.push(s);
      }
    } else {
      original.textContent = L.displayMode === 'romaji' ? (line.romaji || line.text || '\u266A') : (line.text || '\u266A');
    }
    if (L.displayMode === 'both' && line.romaji && line.romaji !== line.text) {
      const romaji = document.createElement('span');
      romaji.className = 'l-romaji'; romaji.textContent = line.romaji; cur.append(romaji);
    }
  }

  return {
    update(pos) {
      if (L.flash !== lastFlash) { lastFlash = L.flash; flashEl.textContent = L.flash; flashEl.hidden = !L.flash; }
      const showNote = L.status !== 'ok';
      note.hidden = !showNote;
      track.hidden = showNote;
      swap.hidden = showNote;
      if (showNote) {
        // Saat memuat, tahan teks 350 ms supaya tidak berkedip ketika lirik cepat ketemu
        const quiet = L.status === 'idle' || (L.status === 'loading' && Date.now() - (L.since || 0) < 350);
        msg.textContent = quiet ? '' : !L.key ? 'Tidak ada lagu yang diputar' : (NOTES[L.status] || '');
        pick.hidden = quiet || !L.key || L.status === 'loading' || L.status === 'instrumental';
        return;
      }
      const idx = indexAt(pos);
      const seekable = !!(opts.canSeek && opts.canSeek());
      if (seekable !== lastSeekable) { lastSeekable = seekable; track.classList.toggle('seekable', seekable); }
      if (idx !== lastIdx || L.key !== lastKey || L.lines !== lastLines) {
        const previousIdx = lastIdx;
        const first = lastIdx === -99 || L.key !== lastKey || L.lines !== lastLines;
        lastIdx = idx; lastKey = L.key; lastLines = L.lines;
        slotLines = { prev: idx > 0 ? L.lines[idx - 1] : null, cur: idx >= 0 ? L.lines[idx] : null, next: L.lines[idx + 1] || null };
        setSimple(prev, slotLines.prev);
        setCur(slotLines.cur);
        setSimple(next, slotLines.next);
        const delta = idx - previousIdx;
        // A normal next/previous line gets a directional glide. Seeking across
        // several lines swaps directly so the animation does not trail behind.
        if (!first && Math.abs(delta) === 1) slide(Math.sign(delta));
      }
      // Karaoke per kata (Enhanced LRC)
      if (curLine && curLine.words && L.displayMode !== 'romaji') {
        const t = pos + LEAD_MS + offsetMs;
        const wordIndex = activeWordAt(curLine.words, t);
        if (wordIndex !== activeWord) {
          activeWord = wordIndex;
          spans.forEach((span, i) => {
            span.classList.toggle('done', i < wordIndex);
            if (i !== wordIndex) span.style.setProperty('--f', i < wordIndex ? '100%' : '0%');
          });
        }
        if (wordIndex >= 0) {
          const word = curLine.words[wordIndex];
          const duration = Math.max(1, (word.end ?? word.t + 150) - word.t);
          const fill = Math.round(Math.max(0, Math.min(1, (t - word.t) / duration)) * 100);
          if (spans[wordIndex].style.getPropertyValue('--f') !== `${fill}%`) spans[wordIndex].style.setProperty('--f', `${fill}%`);
          spans[wordIndex].classList.toggle('done', t >= word.end);
        }
      }
    }
  };
}

// ---------- Mini lyrics: tampil di mode collapse ----------
// Aktif jika: tab Media terbuka + ikon lirik ditekan + island collapse karena pointerleave.
export function initMini({ getPos }) {
  const island = document.getElementById('island');
  const lyric = document.getElementById('pill-lyric');
  const ctx = document.createElement('canvas').getContext('2d');
  const originalEl = document.createElement('span');
  const romajiEl = document.createElement('span');
  originalEl.className = 'mini-original'; romajiEl.className = 'mini-romaji';
  lyric.replaceChildren(originalEl, romajiEl);
  const MIN_W = 188, MAX_W = 440;
  let armed = false, raf = 0, lastText = null;

  document.addEventListener('island:modechange', (e) => {
    const d = e.detail;
    armed = d.mode === 'collapsed' && d.reason === 'pointerleave' && d.tab === 'media' && L.mode;
    sync();
  });
  onLyrics(sync);

  const active = () => armed && L.mode && L.status === 'ok' && L.synced;

  function sync() {
    if (active()) {
      island.classList.add('mini');
      if (!raf) tick();
    } else {
      cancelAnimationFrame(raf);
      raf = 0;
      lastText = null;
      island.classList.remove('mini');
    }
  }

  function widthFor(text) {
    ctx.font = '600 12.5px "Segoe UI Variable Text","Segoe UI",sans-serif';
    const reserve = 66; // padding + ikon musik + jarak
    return Math.round(Math.min(MAX_W, Math.max(MIN_W, ctx.measureText(text).width + reserve)));
  }

  function tick() {
    raf = requestAnimationFrame(tick);
    const idx = indexAt(getPos());
    const line = idx >= 0 ? L.lines[idx] : null;
    const original = (line && line.text.trim()) || '\u266A';
    const romaji = line?.romaji || original;
    const display = L.displayMode === 'romaji' ? romaji : original;
    const showRomaji = L.displayMode === 'both' && romaji !== original;
    const text = `${display}\0${showRomaji ? romaji : ''}`;
    if (text === lastText) return;
    lastText = text;
    originalEl.textContent = display;
    romajiEl.textContent = showRomaji ? romaji : '';
    romajiEl.hidden = !showRomaji;
    const measured = showRomaji ? (ctx.measureText(display).width > ctx.measureText(romaji).width ? display : romaji) : display;
    island.style.setProperty('--mini-w', widthFor(measured) + 'px');
    applyLyricAnimation(lyric);
    lyric.classList.remove('swap');
    void lyric.offsetWidth;
    lyric.classList.add('swap');
  }
}
