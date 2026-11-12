// File Tray (main process): menyimpan REFERENSI path (file tidak disalin), plus buka, sematkan, seret keluar.
const { app, shell, clipboard, dialog, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

const file = () => path.join(app.getPath('userData'), 'tray.json');
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
    fs.renameSync(tmp, file()); // tulis atomik supaya data tidak rusak jika aplikasi tertutup mendadak
  } catch {}
}
const keyOf = (p) => path.resolve(p).toLowerCase();

// Ikon sistem disiapkan lebih dulu supaya siap saat item diseret keluar (startDrag butuh ikon langsung)
const iconCache = new Map();
const pending = new Set();
function ensureIcon(p) {
  if (iconCache.has(p) || pending.has(p)) return;
  pending.add(p);
  app.getFileIcon(p, { size: 'normal' }).then((img) => iconCache.set(p, img)).catch(() => {}).finally(() => pending.delete(p));
}
const FALLBACK_ICON = () => nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');

function list() {
  return load().map((it) => {
    let st = null;
    try { st = fs.statSync(it.path); } catch {}
    if (st) ensureIcon(it.path);
    return {
      id: it.id, path: it.path, name: path.basename(it.path) || it.path,
      dir: st ? st.isDirectory() : !!it.dir,
      ext: path.extname(it.path).slice(1).toLowerCase(),
      exists: !!st, pinned: !!it.pinned, addedAt: it.addedAt || 0,
      size: st && st.isFile() ? st.size : null
    };
  });
}

function add(paths) {
  const arr = load();
  const seen = new Set(arr.map((x) => keyOf(x.path)));
  let added = 0, duplicates = 0, skipped = 0;
  const base = Date.now();
  for (const p of Array.isArray(paths) ? paths : []) {
    if (typeof p !== 'string' || !p) { skipped++; continue; }
    let st;
    try { st = fs.statSync(p); } catch { skipped++; continue; }
    const k = keyOf(p);
    if (seen.has(k)) { duplicates++; continue; }
    seen.add(k);
    arr.push({ id: Math.random().toString(36).slice(2, 10), path: path.resolve(p), dir: st.isDirectory(), addedAt: base + added, pinned: false });
    added++;
  }
  if (added) persist();
  return { added, duplicates, skipped };
}

const find = (id) => load().find((x) => x.id === id);
function remove(id) { const i = load().findIndex((x) => x.id === id); if (i >= 0) { items.splice(i, 1); persist(); } return i >= 0; }
function pin(id, v) { const it = find(id); if (!it) return false; it.pinned = !!v; persist(); return true; }
function clear() { const n = load().length; items.length = 0; persist(); return n; }
function removeMissing() {
  const before = load().length;
  items = load().filter((x) => { try { fs.statSync(x.path); return true; } catch { return false; } });
  persist();
  return before - items.length;
}

async function openItem(id) {
  const it = find(id);
  if (!it) return { ok: false, error: 'tidak ada' };
  try { fs.statSync(it.path); } catch { return { ok: false, error: 'missing' }; }
  const err = await shell.openPath(it.path);
  return { ok: !err, error: err || null };
}
function reveal(id) { const it = find(id); if (it) shell.showItemInFolder(it.path); }
function copyPath(id) { const it = find(id); if (!it) return false; clipboard.writeText(it.path); return true; }
function startDrag(sender, id) {
  const it = find(id);
  if (!it) return;
  try { fs.statSync(it.path); } catch { return; }
  try { sender.startDrag({ file: it.path, icon: iconCache.get(it.path) || FALLBACK_ICON() }); } catch {}
}

function register(ipcMain, broadcast) {
  const changed = (r) => { broadcast('data:changed', { kind: 'tray' }); return r; };
  ipcMain.handle('tray:list', () => list());
  ipcMain.handle('tray:add', (_e, paths) => changed(add(paths)));
  ipcMain.handle('tray:add-dialog', async (_e, kind) => {
    const r = await dialog.showOpenDialog({
      title: kind === 'folder' ? 'Pilih folder untuk File Tray' : 'Pilih file untuk File Tray',
      properties: [kind === 'folder' ? 'openDirectory' : 'openFile', 'multiSelections']
    });
    if (r.canceled || !r.filePaths.length) return null;
    return changed(add(r.filePaths));
  });
  ipcMain.handle('tray:remove', (_e, id) => changed(remove(id)));
  ipcMain.handle('tray:pin', (_e, id, v) => changed(pin(id, v)));
  ipcMain.handle('tray:open', (_e, id) => openItem(id));
  ipcMain.on('tray:reveal', (_e, id) => reveal(id));
  ipcMain.handle('tray:copy', (_e, id) => copyPath(id));
  ipcMain.handle('tray:clear', () => changed(clear()));
  ipcMain.handle('tray:remove-missing', () => changed(removeMissing()));
  ipcMain.on('tray:drag', (e, id) => startDrag(e.sender, id));
}

module.exports = { register, list, add, remove, pin, clear, removeMissing, openItem, reveal, copyPath, startDrag };
