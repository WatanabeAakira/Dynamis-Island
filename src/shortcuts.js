// Pintasan Aplikasi (main process): daftar aplikasi yang bisa dibuka cepat, ikon, urutan, favorit, dan peluncuran.
const { app, shell, dialog, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const file = () => path.join(app.getPath('userData'), 'shortcuts.json');
const iconDir = () => path.join(app.getPath('userData'), 'app-icons');
const ALLOWED = new Set(['.exe', '.lnk', '.bat', '.cmd', '.url', '.com']);
const IMG_RE = /\.(png|jpe?g|webp|bmp|gif|ico)$/i;
const keyOf = (p) => path.resolve(p).toLowerCase();

let items = null;
function load() {
  if (items) return items;
  try {
    const j = JSON.parse(fs.readFileSync(file(), 'utf8'));
    items = Array.isArray(j) ? j.filter((x) => x && typeof x.path === 'string' && typeof x.id === 'string') : [];
  } catch { items = []; }
  return items;
}
function persist() {
  try {
    const tmp = file() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(items));
    fs.renameSync(tmp, file());
  } catch {}
}
const find = (id) => load().find((x) => x.id === id);
const nextOrder = () => load().reduce((m, x) => Math.max(m, x.order || 0), 0) + 1;

// ---------- Ikon ----------
const iconCache = new Map();

function resolveTarget(p) {
  if (path.extname(p).toLowerCase() === '.lnk') {
    try { const l = shell.readShortcutLink(p); if (l.target && fs.existsSync(l.target)) return l.target; } catch {}
  }
  return p;
}
async function shellIcon(p) {
  try { const t = await nativeImage.createThumbnailFromPath(p, { width: 96, height: 96 }); if (t && !t.isEmpty()) return t.toDataURL(); } catch {}
  try { return (await app.getFileIcon(p, { size: 'normal' })).toDataURL(); } catch { return null; }
}
async function iconOf(it) {
  const custom = it.icon && fs.existsSync(it.icon) ? it.icon : null;
  const key = `${it.path}|${custom || ''}`;
  if (iconCache.has(key)) return iconCache.get(key);
  let url = null;
  try {
    if (custom && IMG_RE.test(custom)) {
      const img = nativeImage.createFromPath(custom);
      if (!img.isEmpty()) url = img.resize({ width: 96, height: 96, quality: 'best' }).toDataURL();
    }
    if (!url) url = await shellIcon(custom ? resolveTarget(custom) : resolveTarget(it.path));
  } catch {}
  iconCache.set(key, url);
  return url;
}

// ---------- Daftar ----------
async function list() {
  const arr = [...load()].sort((a, b) => (a.order || 0) - (b.order || 0));
  return Promise.all(arr.map(async (it) => ({
    id: it.id, name: it.name, path: it.path, exists: fs.existsSync(it.path), favorite: !!it.favorite,
    order: it.order || 0, lastUsed: it.lastUsed || 0, custom: !!it.icon, icon: await iconOf(it)
  })));
}

function add(paths) {
  const arr = load();
  const seen = new Set(arr.map((x) => keyOf(x.path)));
  let added = 0, duplicates = 0, skipped = 0;
  const base = Date.now();
  let order = nextOrder();
  for (const p of Array.isArray(paths) ? paths : []) {
    if (typeof p !== 'string' || !p || !ALLOWED.has(path.extname(p).toLowerCase())) { skipped++; continue; }
    let st;
    try { st = fs.statSync(p); } catch { skipped++; continue; }
    if (!st.isFile()) { skipped++; continue; }
    const k = keyOf(p);
    if (seen.has(k)) { duplicates++; continue; }
    seen.add(k);
    arr.push({ id: Math.random().toString(36).slice(2, 10), name: path.basename(p, path.extname(p)), path: path.resolve(p), favorite: false, order: order++, addedAt: base + added, lastUsed: 0, uses: 0, icon: null });
    added++;
  }
  if (added) persist();
  return { added, duplicates, skipped };
}

function remove(id) {
  const i = load().findIndex((x) => x.id === id);
  if (i < 0) return false;
  const [it] = items.splice(i, 1);
  if (it.icon) { try { fs.unlinkSync(it.icon); } catch {} }
  persist();
  return true;
}
function rename(id, name) {
  const it = find(id);
  const n = String(name || '').trim().slice(0, 60);
  if (!it || !n) return false;
  it.name = n; persist();
  return true;
}
function favorite(id, v) { const it = find(id); if (!it) return false; it.favorite = !!v; persist(); return true; }
function reorder(ids) {
  if (!Array.isArray(ids)) return false;
  let n = 1;
  for (const id of ids) { const it = find(id); if (it) it.order = n++; }
  for (const it of [...load()].sort((a, b) => (a.order || 0) - (b.order || 0))) if (!ids.includes(it.id)) it.order = n++;
  persist();
  return true;
}
function clear() { const n = load().length; for (const it of items) if (it.icon) { try { fs.unlinkSync(it.icon); } catch {} } items.length = 0; persist(); return n; }

// ---------- Ikon sendiri ----------
async function setIcon(id) {
  const it = find(id);
  if (!it) return null;
  const r = await dialog.showOpenDialog({
    title: 'Pilih ikon', properties: ['openFile'],
    filters: [{ name: 'Gambar atau program', extensions: ['png', 'jpg', 'jpeg', 'ico', 'webp', 'bmp', 'exe', 'dll'] }]
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const src = r.filePaths[0];
  let stored = src;
  try { // salin supaya ikon tetap ada walau file aslinya dipindah
    fs.mkdirSync(iconDir(), { recursive: true });
    stored = path.join(iconDir(), `${id}${path.extname(src).toLowerCase()}`);
    if (it.icon && it.icon !== stored) { try { fs.unlinkSync(it.icon); } catch {} }
    fs.copyFileSync(src, stored);
  } catch { stored = src; }
  it.icon = stored; iconCache.clear(); persist();
  return true;
}
function resetIcon(id) {
  const it = find(id);
  if (!it || !it.icon) return false;
  try { fs.unlinkSync(it.icon); } catch {}
  it.icon = null; iconCache.clear(); persist();
  return true;
}

// ---------- Peluncuran ----------
async function launch(id, admin) {
  const it = find(id);
  if (!it) return { ok: false, error: 'tidak ada' };
  if (!fs.existsSync(it.path)) return { ok: false, error: 'missing' };
  it.lastUsed = Date.now(); it.uses = (it.uses || 0) + 1; persist();
  if (admin) {
    try {
      const ps = cp.spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', `Start-Process -FilePath '${it.path.replace(/'/g, "''")}' -Verb RunAs`], { windowsHide: true, detached: true, stdio: 'ignore' });
      ps.unref();
      return { ok: true };
    } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
  }
  const err = await shell.openPath(it.path);
  return { ok: !err, error: err || null };
}
function reveal(id) { const it = find(id); if (it) shell.showItemInFolder(resolveTarget(it.path)); }

// ---------- Aplikasi terpasang (dari Start Menu) ----------
const SKIP_RE = /uninstall|readme|release notes|\bhelp\b|manual|documentation|license|website|changelog/i;
let scanCache = { at: 0, list: [] };
function scanStartMenu() {
  if (Date.now() - scanCache.at < 60000) return scanCache.list;
  const roots = [
    path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs')
  ];
  const byName = new Map();
  const walk = (dir, depth) => {
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (depth < 4) walk(p, depth + 1); continue; }
      if (path.extname(e.name).toLowerCase() !== '.lnk') continue;
      const name = path.basename(e.name, '.lnk');
      if (SKIP_RE.test(name)) continue;
      const k = name.toLowerCase();
      if (!byName.has(k)) byName.set(k, { name, path: p });
    }
  };
  for (const r of roots) if (r) walk(r, 0);
  scanCache = { at: Date.now(), list: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, 'id', { sensitivity: 'base' })) };
  return scanCache.list;
}
function installed(query) {
  const q = String(query || '').trim().toLowerCase();
  const have = new Set(load().map((x) => keyOf(x.path)));
  return scanStartMenu().filter((a) => !q || a.name.toLowerCase().includes(q)).slice(0, 80).map((a) => ({ ...a, added: have.has(keyOf(a.path)) }));
}
const pathIconCache = new Map();
async function iconForPath(p) {
  if (typeof p !== 'string' || !p) return null;
  if (pathIconCache.has(p)) return pathIconCache.get(p);
  const url = await shellIcon(resolveTarget(p));
  pathIconCache.set(p, url);
  return url;
}

function register(ipcMain, broadcast) {
  const changed = (r) => { broadcast('data:changed', { kind: 'apps' }); return r; };
  ipcMain.handle('apps:list', () => list());
  ipcMain.handle('apps:add', (_e, paths) => changed(add(paths)));
  ipcMain.handle('apps:add-dialog', async () => {
    const r = await dialog.showOpenDialog({
      title: 'Pilih aplikasi untuk Pintasan Aplikasi', properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Aplikasi dan pintasan', extensions: ['exe', 'lnk', 'bat', 'cmd', 'url'] }]
    });
    if (r.canceled || !r.filePaths.length) return null;
    return changed(add(r.filePaths));
  });
  ipcMain.handle('apps:installed', (_e, q) => installed(q));
  ipcMain.handle('apps:add-installed', (_e, paths) => changed(add(paths)));
  ipcMain.handle('apps:icon-for-path', (_e, p) => iconForPath(p));
  ipcMain.handle('apps:remove', (_e, id) => changed(remove(id)));
  ipcMain.handle('apps:rename', (_e, id, name) => changed(rename(id, name)));
  ipcMain.handle('apps:favorite', (_e, id, v) => changed(favorite(id, v)));
  ipcMain.handle('apps:reorder', (_e, ids) => changed(reorder(ids)));
  ipcMain.handle('apps:set-icon', async (_e, id) => { const r = await setIcon(id); return r ? changed(r) : r; });
  ipcMain.handle('apps:reset-icon', (_e, id) => changed(resetIcon(id)));
  ipcMain.handle('apps:launch', async (_e, id, admin) => { const r = await launch(id, !!admin); broadcast('data:changed', { kind: 'apps' }); return r; });
  ipcMain.on('apps:reveal', (_e, id) => reveal(id));
  ipcMain.handle('apps:clear', () => changed(clear()));
}

module.exports = { register, list, add, remove, rename, favorite, reorder, clear, setIcon, resetIcon, launch, reveal, installed, iconForPath };
