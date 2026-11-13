const { app, BrowserWindow, screen, ipcMain, dialog, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const helper = require('./helper');
const lyrics = require('./lyrics');
const weather = require('./weather');
const tray = require('./tray');
const shortcuts = require('./shortcuts');
const aiMain = require('./ai-main');
const trayIcon = require('./tray-icon');

// Ukuran window tetap = ukuran mode terbesar. Animasi dikerjakan di CSS.
const WIN_W = 700;
const WIN_H = 340;

const DEFAULT_SETTINGS = {
  language: 'id',
  ai: { model: 'llama-3.1-8b-instant', historyLimit: 20, ctxMedia: true, ctxWeather: true, ctxSchedule: true }, // asisten AI (kunci API disimpan terpisah)
  notif: { noticeMs: 7000, historyLimit: 50, showBody: true }, // pengaturan Notifikasi
  accent: '#8b9bff',
  clock: { timeFormat: '24h', dateFormat: 'long', showSeconds: true, showAdditionalInfo: true, analogSecondHand: true },
  accentFromCover: false,
  trackToast: true,     // info lagu saat berganti (mode collapse)
  lyricsOffset: 0,      // penyesuaian waktu lirik (ms), positif = lebih awal
  tray: { view: 'grid', sort: 'recent', size: 'md', compactIcon: 'outline', showPinned: true, showRef: false, pinnedFirst: true },
  apps: { view: 'grid', size: 'md', style: 'default', sort: 'manual', favCount: 4, favFirst: true, compactLabels: false, compactMode: 'icons' },
  weather: null,        // { loc, auto, units, recent }
  lyricsMode: false,    // tampilan lirik tetap aktif setelah aplikasi dibuka ulang
  collapseDelay: 350,   // ms sebelum island menutup setelah pointer keluar
  openOnHover: true,    // false = harus klik dulu untuk membuka
  autoStart: false,
  lyricsDir: ''         // folder file .lrc / .elrc lokal
};

let win = null;
let settings = { ...DEFAULT_SETTINGS };
let audioSessionApps = new Map();
let audioOutputDeviceIds = new Set();

const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try {
    settings = { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) };
  } catch {
    settings = { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  try { fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2)); } catch {}
}

function applyAutoStart() {
  if (!app.isPackaged) return; // jangan daftarkan electron.exe saat development
  app.setLoginItemSettings({ openAtLogin: !!settings.autoStart });
}

// Menempel di y = 0 (tepi atas monitor), rata tengah horizontal. Monitor tunggal.
function placeWindow() {
  if (!win) return;
  const b = screen.getPrimaryDisplay().bounds;
  win.setBounds({
    x: Math.round(b.x + (b.width - WIN_W) / 2),
    y: b.y,
    width: WIN_W,
    height: WIN_H
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: WIN_W,
    height: WIN_H,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false, // klik island tidak merebut fokus dari game/aplikasi yang sedang aktif
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required', // nada timer/alarm harus bisa bunyi tanpa klik
      backgroundThrottling: false // timer/alarm tetap akurat walau window tertutup game
    }
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true);
  // Awalnya tembus klik; renderer yang mengatur saat pointer berada di atas island.
  win.setIgnoreMouseEvents(true, { forward: true });
  placeWindow();

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.showInactive());
  // Fokus keyboard hanya dipinjam saat mengetik. Ditunda sedikit supaya blur sesaat saat window diaktifkan tidak membatalkannya.
  win.on('blur', () => {
    setTimeout(() => { if (win && !win.isDestroyed() && !win.isFocused()) { try { win.setFocusable(false); } catch {} } }, 300);
  });
}

// Jangan anggap window "tertutup" saat tertutup game fullscreen (supaya timer, alarm, dan hover tetap hidup)
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.whenReady().then(() => {
    loadSettings();
    applyAutoStart();
    createWindow();
    trayIcon.init({
      toggleIsland: () => {
        if (!win || win.isDestroyed()) return;
        if (win.isVisible()) {
          win.hide();
        } else {
          // Reset interaksi yang mungkin tertinggal saat window disembunyikan,
          // misalnya pointer masih dianggap berada di atas island.
          rendererOver = false;
          hoverInside = false;
          hoverCount = 0;
          win.showInactive();
          win.webContents.send('island:shown');
        }
        ignoring = null; applyIgnore(); // paksa pengaturan click-through ulang setelah window berubah status
      },
      openSettings: () => openSettings(),
      toggleAutoStart: () => {
        settings = { ...settings, autoStart: !settings.autoStart };
        saveSettings();
        applyAutoStart();
        broadcast('settings:changed', settings);
      },
      quit: () => app.quit(),
      onMenuClosed: () => {
        if (!win || win.isDestroyed()) return;
        try { win.setFocusable(false); } catch {}
        // Menu tray mengambil alih mouse di luar renderer, jadi pointer state
        // dari sebelum menu dibuka bisa tertinggal dan mengacaukan klik berikutnya.
        rendererOver = false;
        hoverInside = false;
        hoverCount = 0;
        win.webContents.send('island:shown');
        ignoring = null; applyIgnore(); // kembalikan klik-through sesuai kondisi kursor saat ini
        if (win.isVisible()) {
          win.setAlwaysOnTop(true, 'screen-saver');
          win.moveTop();
        }
      },
      state: () => ({ visible: !!(win && !win.isDestroyed() && win.isVisible()), autoStart: !!settings.autoStart, version: app.getVersion() })
    });
    setInterval(() => { applyIgnore(); pollHover(); }, 40);
    // Game fullscreen sering merebut urutan paling atas; tegaskan lagi posisi island tiap detik
    setInterval(() => {
      // Jangan ganggu window saat sedang dipakai mengetik
      if (win && !win.isDestroyed() && win.isVisible() && !win.isFocused()) { win.setAlwaysOnTop(true, 'screen-saver'); win.moveTop(); }
    }, 1000);
    helper.start((msg) => {
      if (msg && msg.type === 'audio') {
        audioSessionApps = new Map((Array.isArray(msg.sessions) ? msg.sessions : [])
          .filter((s) => s && typeof s.key === 'string' && typeof s.exe === 'string' && s.exe)
          .map((s) => [s.key, s.exe]));
        audioOutputDeviceIds = new Set((Array.isArray(msg.outputDevices) ? msg.outputDevices : [])
          .map((d) => d && d.id).filter((id) => typeof id === 'string'));
      }
      if (win && !win.isDestroyed()) win.webContents.send('helper:msg', msg);
    });
    screen.on('display-metrics-changed', placeWindow);
    screen.on('display-added', placeWindow);
    screen.on('display-removed', placeWindow);
    setupAutoUpdates();
  });
}

// Update hanya dicek di versi installer. Build development tidak punya feed GitHub.
function setupAutoUpdates() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on('error', (error) => console.error('[updater] Gagal cek/download update:', error.message));
  autoUpdater.on('update-downloaded', async (info) => {
    const result = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Restart sekarang', 'Nanti'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update Dynamis Island siap',
      message: `Versi ${info.version} sudah diunduh. Restart aplikasi untuk memasang update.`
    });
    if (result.response === 0) autoUpdater.quitAndInstall();
  });
  const check = () => autoUpdater.checkForUpdates().catch((error) => {
    console.error('[updater] Gagal cek update:', error.message);
  });
  setTimeout(check, 15_000);
  setInterval(check, 4 * 60 * 60 * 1000);
}

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { helper.stop(); trayIcon.destroy(); });

// ---------- Click-through ----------
// Window tembus klik tidak bisa menerima drop file dari Explorer. Karena itu main process
// memantau posisi kursor: island aktif jika renderer melaporkan pointer di atasnya
// ATAU kursor berada di dalam area island (termasuk saat sedang menyeret file).
let rendererOver = false;
let ignoring = true;
let lastIgnoreAt = 0;
let islandRect = null; // koordinat relatif window (DIP)

function cursorInsideIsland() {
  if (!islandRect || !win || win.isDestroyed()) return false;
  const p = screen.getCursorScreenPoint();
  const b = win.getBounds();
  const x = p.x - b.x, y = p.y - b.y;
  return x >= islandRect.x && x <= islandRect.x + islandRect.w && y >= islandRect.y - 2 && y <= islandRect.y + islandRect.h;
}

function applyIgnore() {
  if (!win || win.isDestroyed()) return;
  const want = !(rendererOver || cursorInsideIsland());
  // Status dikirim ulang berkala: kalau status sebenarnya di window sudah berbeda (mis. setelah disembunyikan/ditampilkan dari tray), klik tetap bisa diteruskan
  const stale = Date.now() - lastIgnoreAt > 1000;
  if (want === ignoring && !stale) return;
  ignoring = want;
  lastIgnoreAt = Date.now();
  if (want) win.setIgnoreMouseEvents(true, { forward: true });
  else win.setIgnoreMouseEvents(false);
}

// Hover dideteksi dari posisi kursor (bukan hanya event mouse di window), sehingga tetap bekerja
// ketika game fullscreen sedang memegang mouse atau window island tidak menerima event.
let hoverInside = false;
let hoverCount = 0;
function pollHover() {
  if (!win || win.isDestroyed()) return;
  if (cursorInsideIsland()) {
    hoverCount++;
    if (!hoverInside && hoverCount >= 2) { hoverInside = true; win.webContents.send('island:hover', true); }
  } else {
    hoverCount = 0;
    if (hoverInside) { hoverInside = false; win.webContents.send('island:hover', false); }
  }
}

// ---------- Window Pengaturan (terpisah dari island) ----------
function broadcast(channel, payload) {
  for (const w of BrowserWindow.getAllWindows()) { if (!w.isDestroyed()) w.webContents.send(channel, payload); }
}

let settingsWin = null;
function openSettings(page) {
  if (settingsWin && !settingsWin.isDestroyed()) {
    if (settingsWin.isMinimized()) settingsWin.restore();
    settingsWin.show();
    settingsWin.focus();
    if (page) settingsWin.webContents.send('settings:page', page);
    return;
  }
  settingsWin = new BrowserWindow({
    width: 980, height: 680, minWidth: 780, minHeight: 520,
    frame: false, transparent: true, backgroundColor: '#00000000', // bilah judul dibuat sendiri (gaya macOS)
    title: 'Pengaturan Dynamis Island', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  settingsWin.setMenuBarVisibility(false);
  settingsWin.loadFile(path.join(__dirname, 'settings-window', 'index.html'), page ? { hash: page } : undefined);
  settingsWin.on('closed', () => { settingsWin = null; });
}

// ---------- IPC ----------
tray.register(ipcMain, broadcast);
shortcuts.register(ipcMain, broadcast);
aiMain.register(ipcMain);
ipcMain.on('island:set-ignore', (_e, ignore) => { rendererOver = !ignore; applyIgnore(); });
ipcMain.on('island:rect', (_e, r) => { islandRect = r; });

ipcMain.on('island:focus', () => { if (win) { win.setFocusable(true); win.focus(); } });
ipcMain.on('island:allow-focus', () => { if (win) win.setFocusable(true); }); // diizinkan aktif sebelum kolom teks diklik
ipcMain.on('island:release-focus', () => { if (win) { win.blur(); win.setFocusable(false); } });

ipcMain.handle('settings:get', () => settings);

ipcMain.handle('settings:set', (_e, patch) => {
  settings = { ...settings, ...patch };
  saveSettings();
  applyAutoStart();
  broadcast('settings:changed', settings); // island dan window pengaturan ikut diperbarui
  return settings;
});

ipcMain.on('settings:open', (_e, page) => openSettings(page));
ipcMain.on('notif:clear', () => broadcast('notif:cleared'));
// Tombol tutup, kecilkan, dan perbesar window pengaturan
ipcMain.on('settings:win', (e, action) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w || w.isDestroyed()) return;
  if (action === 'close') w.close();
  else if (action === 'min') w.minimize();
  else if (action === 'max') (w.isMaximized() ? w.unmaximize() : w.maximize());
}); // hapus semua disiarkan ke island
ipcMain.handle('app:info', () => ({ version: app.getVersion(), dataDir: app.getPath('userData') }));
ipcMain.on('app:open-data', () => shell.openPath(app.getPath('userData')));

ipcMain.on('helper:send', (_e, obj) => helper.send(obj));
ipcMain.handle('helper:status', () => helper.status());

ipcMain.handle('lyrics:get', (_e, q) => lyrics.get(q, settings.lyricsDir));
ipcMain.handle('lyrics:import', (_e, q) => lyrics.importFile(q));
ipcMain.handle('lyrics:import-text', (_e, q, text, name) => lyrics.importText(q, text, name));
const iconCache = new Map();
ipcMain.handle('audio:icon', async (_e, exe) => {
  if (typeof exe !== 'string' || !exe) return null;
  if (iconCache.has(exe)) return iconCache.get(exe);
  try {
    const url = (await app.getFileIcon(exe, { size: 'normal' })).toDataURL();
    iconCache.set(exe, url);
    return url;
  } catch { return null; }
});
ipcMain.handle('audio:open', (_e, key) => {
  if (typeof key !== 'string' || !audioSessionApps.has(key)) {
    return { ok: false, error: 'Aplikasi ini tidak terdeteksi sedang mengeluarkan audio.' };
  }
  return helper.send({ cmd: 'audio-open', key })
    ? { ok: true }
    : { ok: false, error: 'Helper audio belum aktif.' };
});
ipcMain.handle('audio:set-output', (_e, id) => {
  if (typeof id !== 'string' || !audioOutputDeviceIds.has(id)) {
    return { ok: false, error: 'Perangkat output tidak tersedia.' };
  }
  return helper.send({ cmd: 'audio-output', id })
    ? { ok: true }
    : { ok: false, error: 'Helper audio belum aktif.' };
});
ipcMain.handle('weather:locate', () => weather.locate());
ipcMain.handle('weather:search', (_e, q) => weather.search(q));
ipcMain.handle('weather:get', (_e, p) => weather.get(p));
ipcMain.handle('lyrics:list', () => lyrics.listSaved());
ipcMain.handle('lyrics:delete', (_e, name) => { const ok = lyrics.deleteSaved(name); broadcast('lyrics:changed'); return ok; });
ipcMain.handle('lyrics:open-dir', () => lyrics.openSavedDir());
ipcMain.handle('lyrics:pick-dir', async () => {
  const r = await dialog.showOpenDialog({ title: 'Pilih folder lirik', properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.on('app:quit', () => app.quit());
