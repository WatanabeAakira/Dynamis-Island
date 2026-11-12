// State lirik, panel 3 baris untuk tab Media, dan mini lyrics untuk mode collapse.

export const L = { mode: false, key: '', status: 'idle', lines: [], synced: false, source: '', flash: '' };
const subs = new Set();
let token = 0;
let lastTrack = null;
const emit = () => subs.forEach((f) => f());
export const onLyrics = (f) => { subs.add(f); return () => subs.delete(f); };

const LEAD_MS = 120; // sedikit lebih awal supaya terasa pas
let offsetMs = 0;     // penyesuaian dari Pengaturan (positif = lirik lebih awal)
export const setLyricsOffset = (ms) => { offsetMs = Number(ms) || 0; };

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
  const [prev, cur, next] = track.querySelectorAll('.l-slot');
  pick.addEventListener('click', importFile);
  swap.addEventListener('click', importFile);

  // Klik baris lirik untuk lompat ke posisi itu
  [['prev', prev], ['cur', cur], ['next', next]].forEach(([k, el]) => el.addEventListener('click', () => {
    const l = slotLines[k];
    if (l && l.t != null && opts.canSeek && opts.canSeek()) opts.seek(l.t);
  }));
  let lastIdx = -99, lastKey = '', lastLines = null, lastFlash = '', spans = [], fills = [], curLine = null;
  let slotLines = {}, lastSeekable = null;

  const setSimple = (el, line) => { el.textContent = line ? line.text : ''; };

  function slide() {
    track.style.transition = 'none';
    track.style.transform = 'translateY(16px)';
    track.style.opacity = '.4';
    void track.offsetWidth;
    track.style.transition = 'transform .45s cubic-bezier(.32,.72,0,1), opacity .45s';
    track.style.transform = '';
    track.style.opacity = '';
  }

  function setCur(line) {
    curLine = line;
    spans = []; fills = [];
    if (!line) { cur.textContent = '\u266A'; return; }
    if (line.words && line.words.length) {
      cur.textContent = '';
      for (const w of line.words) {
        const s = document.createElement('span');
        s.className = 'w';
        s.textContent = w.text;
        cur.appendChild(s);
        spans.push(s); fills.push(-1);
      }
    } else {
      cur.textContent = line.text || '\u266A';
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
        const first = lastIdx === -99 || L.key !== lastKey || L.lines !== lastLines;
        lastIdx = idx; lastKey = L.key; lastLines = L.lines;
        slotLines = { prev: idx > 0 ? L.lines[idx - 1] : null, cur: idx >= 0 ? L.lines[idx] : null, next: L.lines[idx + 1] || null };
        setSimple(prev, slotLines.prev);
        setCur(slotLines.cur);
        setSimple(next, slotLines.next);
        if (!first) slide();
      }
      // Karaoke per kata (Enhanced LRC)
      if (curLine && curLine.words) {
        const t = pos + LEAD_MS + offsetMs;
        curLine.words.forEach((w, i) => {
          const f = t >= w.end ? 100 : t <= w.t ? 0 : Math.round(((t - w.t) / (w.end - w.t)) * 100);
          if (f !== fills[i]) { fills[i] = f; spans[i].style.setProperty('--f', f + '%'); }
        });
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
    const text = (line && line.text.trim()) || '\u266A';
    if (text === lastText) return;
    lastText = text;
    lyric.textContent = text;
    island.style.setProperty('--mini-w', widthFor(text) + 'px');
    lyric.classList.remove('swap');
    void lyric.offsetWidth;
    lyric.classList.add('swap');
  }
}
