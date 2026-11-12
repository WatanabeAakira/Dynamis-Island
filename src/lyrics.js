const { net, dialog, app, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { parseLrc } = require('./lyrics-parser');

const BASE = 'https://lrclib.net/api';
const UA = 'WindowsIsland/0.3';
const cache = new Map();

// ---------- File lokal ----------
const fileCache = new Map(); // dir -> { at, files }

// Salinan lirik hasil impor disimpan di folder project (dev) atau userData (setelah di-build)
function savedDir() {
  return app.isPackaged ? path.join(app.getPath('userData'), 'lyrics') : path.join(__dirname, '..', 'lyrics');
}

function listFiles(dir) {
  const hit = fileCache.get(dir);
  if (hit && Date.now() - hit.at < 30000) return hit.files;
  const out = [];
  (function walk(d, depth) {
    let ents;
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (depth < 3) walk(p, depth + 1); }
      else if (/\.(lrc|elrc)$/i.test(e.name)) out.push(p);
    }
  })(dir, 0);
  fileCache.set(dir, { at: Date.now(), files: out });
  return out;
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, '');

// Cocokkan berdasarkan nama file: "Artis - Judul.lrc", "Judul - Artis.lrc", atau "Judul.lrc"
function findLocal(dir, artist, title) {
  const nt = norm(title);
  const na = norm(artist);
  const na1 = norm(String(artist || '').split(/[,&;]|\bfeat\.?|\bft\.?/i)[0]);
  if (!nt) return null;
  const exact = new Set([na + nt, nt + na, nt, na1 + nt, nt + na1]);
  let best = null, loose = null;
  for (const f of listFiles(dir)) {
    const base = norm(path.basename(f).replace(/\.(lrc|elrc)$/i, ''));
    if (exact.has(base)) { if (!best || /\.elrc$/i.test(f)) best = f; }
    else if (!loose && base.includes(nt) && (!na1 || base.includes(na1))) loose = f;
  }
  return best || loose;
}

// ---------- LRCLIB ----------
async function jget(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await net.fetch(url, { headers: { 'User-Agent': UA }, signal: ctrl.signal });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(timer); }
}

async function fromLrclib({ title, artist, album, durationMs }) {
  const dur = durationMs > 0 ? durationMs / 1000 : 0;

  // 1) Pencocokan tepat (judul, artis, album, durasi) -> hasil paling akurat
  if (artist && album && dur) {
    const q = new URLSearchParams({ track_name: title, artist_name: artist, album_name: album, duration: String(Math.round(dur)) });
    const rec = await jget(`${BASE}/get?${q}`);
    if (rec) return rec;
  }

  // 2) Pencarian, pilih yang durasinya paling dekat
  const sp = new URLSearchParams({ track_name: title });
  if (artist) sp.set('artist_name', artist);
  const list = (await jget(`${BASE}/search?${sp}`)) || [];
  const near = (x) => (dur ? Math.abs((x.duration || 0) - dur) : 0);
  const ok = list.filter((x) => !dur || near(x) <= 4).sort((a, b) => near(a) - near(b));
  return ok.find((x) => x.syncedLyrics) || ok.find((x) => x.plainLyrics) || ok.find((x) => x.instrumental) || null;
}

// ---------- Gabungan ----------
async function get(q, localDir) {
  const title = String(q.title || '').trim();
  const artist = String(q.artist || '').trim();
  if (!title) return { status: 'none' };

  // Urutan: salinan di folder project -> folder lirik pilihan -> LRCLIB
  for (const dir of [savedDir(), localDir]) {
    if (!dir) continue;
    const f = findLocal(dir, artist, title);
    if (f) {
      try {
        const p = parseLrc(fs.readFileSync(f, 'utf8'));
        if (p.lines.length) return { status: p.synced ? 'ok' : 'plain', source: 'local', synced: p.synced, lines: p.lines };
      } catch {}
    }
  }

  const key = [artist, title, q.album, Math.round((q.durationMs || 0) / 1000)].join('|').toLowerCase();
  if (cache.has(key)) return cache.get(key);

  let res;
  try {
    const rec = await fromLrclib({ title, artist, album: q.album, durationMs: q.durationMs });
    if (!rec) res = { status: 'none' };
    else if (rec.syncedLyrics) {
      const p = parseLrc(rec.syncedLyrics);
      res = p.synced ? { status: 'ok', source: 'lrclib', synced: true, lines: p.lines } : { status: 'none' };
    } else if (rec.plainLyrics) {
      res = { status: 'plain', source: 'lrclib', synced: false, lines: parseLrc(rec.plainLyrics).lines };
    } else res = { status: rec.instrumental ? 'instrumental' : 'none' };
  } catch {
    return { status: 'error' }; // tidak di-cache supaya bisa dicoba lagi
  }
  if (cache.size > 60) cache.delete(cache.keys().next().value);
  cache.set(key, res);
  return res;
}

// ---------- Impor file .lrc untuk lagu yang sedang diputar ----------
const safeName = (artist, title) => {
  const clean = (s) => String(s || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim();
  const a = clean(artist), t = clean(title);
  return (a && t ? `${a} - ${t}` : t || a || 'lirik').slice(0, 150);
};

function readText(file) {
  const buf = fs.readFileSync(file);
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.toString('utf16le').replace(/^\uFEFF/, '');
  return buf.toString('utf8').replace(/^\uFEFF/, '');
}

// Validasi, salin ke folder lyrics/, dan namai sesuai lagu yang sedang diputar
function saveImported(q, text, ext) {
  const p = parseLrc(text);
  if (!p.synced || !p.lines.length) return { status: 'invalid' };

  const dir = savedDir();
  const base = safeName(q.artist, q.title);
  try {
    fs.mkdirSync(dir, { recursive: true });
    for (const e of ['.lrc', '.elrc']) { try { fs.unlinkSync(path.join(dir, base + e)); } catch {} }
    fs.writeFileSync(path.join(dir, base + ext), text.replace(/\r?\n/g, '\n'), 'utf8');
  } catch { return { status: 'invalid' }; }
  fileCache.delete(dir);

  return { status: 'ok', source: 'local', synced: true, lines: p.lines, saved: base + ext };
}

const extOf = (name) => (/\.elrc$/i.test(name) ? '.elrc' : '.lrc');

async function importFile(q) {
  const r = await dialog.showOpenDialog({
    title: 'Pilih file lirik',
    properties: ['openFile'],
    filters: [{ name: 'File lirik', extensions: ['lrc', 'elrc', 'txt'] }]
  });
  if (r.canceled || !r.filePaths[0]) return null;
  let text;
  try { text = readText(r.filePaths[0]); } catch { return { status: 'invalid' }; }
  return saveImported(q, text, extOf(r.filePaths[0]));
}

// File yang di-drop ke panel lirik (isi file dikirim dari renderer)
function importText(q, text, name) {
  if (!q || !q.title) return { status: 'invalid' };
  return saveImported(q, String(text || '').replace(/^\uFEFF/, ''), extOf(String(name || '')));
}

// ---------- Pengelola salinan lirik ----------
function listSaved() {
  const dir = savedDir();
  try {
    return fs.readdirSync(dir)
      .filter((n) => /\.(lrc|elrc)$/i.test(n))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ name, size: fs.statSync(path.join(dir, name)).size }));
  } catch { return []; }
}

function deleteSaved(name) {
  // Hanya nama file polos berekstensi lrc/elrc di folder salinan
  if (typeof name !== 'string' || name !== path.basename(name) || !/\.(lrc|elrc)$/i.test(name)) return false;
  try {
    fs.unlinkSync(path.join(savedDir(), name));
    fileCache.delete(savedDir());
    return true;
  } catch { return false; }
}

async function openSavedDir() {
  const dir = savedDir();
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  return shell.openPath(dir);
}

module.exports = { get, importFile, importText, listSaved, deleteSaved, openSavedDir };