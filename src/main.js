const { app, BrowserWindow, screen, ipcMain, dialog, shell, clipboard } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const helper = require('./helper');
const lyrics = require('./lyrics');
const weather = require('./weather');
const tray = require('./tray');
const shortcuts = require('./shortcuts');
const aiMain = require('./ai-main');
const translateMain = require('./translate-main');
const { LANGUAGES, normalizeLanguage, resolveSystemLanguage } = require('./translate-languages.cjs');
const trayIcon = require('./tray-icon');
const { IslandWindowManager } = require('./island-window-manager.cjs');
const { normalizeDisplayConfig, mergeSettings, enrichDisplays } = require('./display-config.cjs');
const { SharedServiceCoordinator } = require('./shared-service-coordinator.cjs');

// Ukuran window tetap = ukuran mode terbesar. Animasi dikerjakan di CSS.
const WIN_W = 700;
const WIN_H = 400;

const DEFAULT_SETTINGS = {
  language: 'id',
  ai: { model: 'llama-3.1-8b-instant', historyLimit: 20, ctxMedia: true, ctxWeather: true, ctxSchedule: true }, // asisten AI (kunci API disimpan terpisah)
  notif: { noticeMs: 7000, historyLimit: 50, showBody: true, captureWindows: true }, // pengaturan Notifikasi
  accent: '#8b9bff',
  clock: { timeFormat: '24h', dateFormat: 'long', showSeconds: true, showAdditionalInfo: true, analogSecondHand: true },
  accentFromCover: false,
  trackToast: true,     // info lagu saat berganti (mode collapse)
  lyricsOffset: 0,      // penyesuaian waktu lirik (ms), positif = lebih awal
  tray: { view: 'grid', sort: 'recent', size: 'md', compactIcon: 'outline', showPinned: true, showRef: false, pinnedFirst: true },
  apps: { view: 'grid', size: 'md', style: 'default', sort: 'manual', favCount: 4, favFirst: true, compactLabels: false, compactMode: 'icons' },
  weather: null,        // { loc, auto, units, recent }
  lyricsMode: false,    // tampilan lirik tetap aktif setelah aplikasi dibuka ulang
  lyricsDisplayMode: 'original',
  romajiSystem: 'hepburn',
  collapseDelay: 350,   // ms sebelum island menutup setelah pointer keluar
  openOnHover: true,    // false = harus klik dulu untuk membuka
  autoFullClosed: true, // sembunyikan island saat aplikasi foreground memenuhi layar
  autoStart: false,
  lyricsDir: '',        // folder file .lrc / .elrc lokal
  copyText: { enabled: true, language: '' },
  translation: { sourceLanguage: 'auto', targetLanguage: '', autoDetect: true, autoTranslate: true, provider: 'auto' },
  clipboard: { enabled: true, capture: true, maxItems: 200 },
  notes: { enabled: true, autosave: true },
  quickSettings: { enabled: true, compactStatus: true, controls: { wifi: true, bluetooth: true, airplane: true, doNotDisturb: true, battery: true, microphone: true, brightness: true, nightLight: true, theme: true, volume: true } },
  systemMonitor: { enabled: true, intervalMs: 1000, graphHistorySeconds: 60, processMonitoring: true, processCount: 5, sort: 'cpu', compactMetric: 'cpu', alertsEnabled: false, cpuThreshold: 95, ramThreshold: 90, metrics: { cpu: true, ram: true, gpu: true, disk: true, temperature: true, network: true } },
  display: { mode: 'primary', monitors: {} }
};

let islandManager = null;
let nativeDisplays = [];
let islandTrayHidden = false;
let alarmTakeover = null;
const sharedServices = new SharedServiceCoordinator((payload) => helper.send(payload));
let settings = { ...DEFAULT_SETTINGS };
let audioSessionApps = new Map();
let audioOutputDeviceIds = new Set();
let windowsNotificationsStatus = { enabled: false, available: false };
let notificationCount = 0;

const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try {
    settings = { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) };
    settings.display = normalizeDisplayConfig(settings.display);
  } catch {
    settings = { ...DEFAULT_SETTINGS };
    settings.display = normalizeDisplayConfig(settings.display);
  }
}

function saveSettings() {
  try { fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2)); } catch {}
}

function applyAutoStart() {
  if (!app.isPackaged) return; // jangan daftarkan electron.exe saat development
  app.setLoginItemSettings({ openAtLogin: !!settings.autoStart });
}

function createIslandWindow(display, context) {
  const island = new BrowserWindow({
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

  island.setAlwaysOnTop(true, 'screen-saver');
  island.setVisibleOnAllWorkspaces(true);
  // Awalnya tembus klik; renderer yang mengatur saat pointer berada di atas island.
  island.setIgnoreMouseEvents(true, { forward: true });
  island.setBounds(islandManager.bounds(display));
  context.senderId = island.webContents.id;

  island.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  island.once('ready-to-show', () => {
    context.readyToShow = true;
    if (!island.isDestroyed() && !context.serviceOnly && (!islandTrayHidden || alarmTakeover)) revealIsland(context);
  });
  island.webContents.on('did-finish-load', () => {
    context.readyToShow = true;
    if (!island.isDestroyed() && !context.serviceOnly && (!islandTrayHidden || alarmTakeover) && !island.isVisible()) revealIsland(context);
  });
  island.on('closed', () => { islandManager?.forget(context.id, island); releaseIslandRequests(context); });
  return island;
}

function revealIsland(context) {
  const { window: island, display } = context;
  if (island.isDestroyed() || context.serviceOnly || (islandTrayHidden && !alarmTakeover)) return;
  island.setBounds(islandManager.bounds(display));
  island.setAlwaysOnTop(true, 'screen-saver');
  if (!island.isVisible()) island.showInactive();
  island.moveTop();
}

function refreshIslandWindows(displays = islandDisplayList()) {
  if (!islandManager) return;
  islandManager.sync(displays, { ...settings.display, alarmTakeover: !!alarmTakeover });
  for (const context of islandManager.values()) context.window.webContents.send('island:role', { primary: !!context.display.primary, alarmLeader: context === islandManager.primary() });
  for (const context of islandManager.values()) {
    if ((islandTrayHidden && !alarmTakeover) || context.serviceOnly) context.window.hide();
    else if (context.readyToShow && !context.window.isVisible()) revealIsland(context);
  }
  broadcast('displays:changed', islandDisplayList());
}

function islandDisplayList() {
  return enrichDisplays(screen.getAllDisplays(), nativeDisplays, screen.getPrimaryDisplay().id);
}

function migrateMonitorPreferences(previous, current) {
  const prefs = { ...(settings.display?.monitors || {}) };
  let changed = false;
  for (const display of current) {
    const old = previous.find((entry) => entry.id === display.id);
    if (!old) continue;
    const oldKey = old.monitorId || old.id, newKey = display.monitorId || display.id;
    if (oldKey !== newKey && prefs[oldKey] !== undefined && prefs[newKey] === undefined) {
      prefs[newKey] = prefs[oldKey]; delete prefs[oldKey]; changed = true;
    }
  }
  if (changed) { settings.display = { ...settings.display, monitors: prefs }; saveSettings(); }
}

async function handleDisplayAdded(_event, nativeDisplay) {
  if (!islandManager) return;
  const display = islandDisplayList().find((item) => item.id === String(nativeDisplay.id));
  if (!display) return;
  islandManager.holdForConfirmation(display);
  refreshIslandWindows();
  const result = await dialog.showMessageBox({
    type: 'info', buttons: ['Show Island', 'Keep Hidden'], defaultId: 0, cancelId: 1,
    title: 'New Display Detected',
    message: 'A new monitor has been connected. Would you like to display Dynamis Island on this monitor?'
  });
  const show = result.response === 0;
  const previousMode = settings.display?.mode || 'primary';
  const monitors = { ...(settings.display?.monitors || {}) };
  for (const item of islandDisplayList()) {
    const key = item.monitorId || item.id;
    if (monitors[key] === undefined) monitors[key] = previousMode === 'all' || (previousMode === 'primary' && item.primary);
  }
  settings.display = { ...(settings.display || {}), mode: 'custom', monitors: { ...monitors, [display.monitorId]: show } };
  saveSettings();
  islandManager.decide(display.id, show);
  refreshIslandWindows();
  broadcast('settings:changed', settings);
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
    islandManager = new IslandWindowManager({ create: createIslandWindow });
    refreshIslandWindows();
    // Reconcile after Electron has completed initial screen setup and the first
    // renderer load. This prevents first-run instances staying hidden until a
    // settings or display event happens to refresh them.
    setTimeout(() => refreshIslandWindows(), 250);
    trayIcon.init({
      toggleIsland: () => {
        const contexts = islandManager?.values() || [];
        if (!contexts.length) return;
        islandTrayHidden = !islandTrayHidden;
        for (const ctx of contexts) {
          if (ctx.serviceOnly) { ctx.window.hide(); continue; }
          if (islandTrayHidden) ctx.window.hide();
          else { resetIslandInteraction(ctx); ctx.window.showInactive(); ctx.window.webContents.send('island:shown'); }
          ctx.ignoring = null; applyIgnore(ctx);
        }
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
        for (const ctx of islandManager?.values() || []) {
          try { ctx.window.setFocusable(false); } catch {}
          resetIslandInteraction(ctx);
          ctx.window.webContents.send('island:shown');
          ctx.ignoring = null; applyIgnore(ctx);
          if (ctx.window.isVisible()) { ctx.window.setAlwaysOnTop(true, 'screen-saver'); ctx.window.moveTop(); }
        }
      },
      state: () => ({ visible: !!(islandManager?.values().some((ctx) => !ctx.window.isDestroyed() && ctx.window.isVisible())), autoStart: !!settings.autoStart, version: app.getVersion() })
    });
    setInterval(() => {
      const cursor = screen.getCursorScreenPoint();
      for (const ctx of islandManager?.values() || []) { applyIgnore(ctx, cursor); pollHover(ctx, cursor); }
    }, 40);
    // Game fullscreen sering merebut urutan paling atas; tegaskan lagi posisi island tiap detik
    setInterval(() => {
      // Jangan ganggu window saat sedang dipakai mengetik
      if (!settingsWin || settingsWin.isDestroyed()) for (const ctx of islandManager?.values() || []) {
        if (!ctx.window.isDestroyed() && ctx.window.isVisible() && !ctx.window.isFocused() && !ctx.focusAllowed) { ctx.window.setAlwaysOnTop(true, 'screen-saver'); ctx.window.moveTop(); }
      }
    }, 1000);
    helper.start((msg) => {
      if (msg && msg.type === 'audio') {
        audioSessionApps = new Map((Array.isArray(msg.sessions) ? msg.sessions : [])
          .filter((s) => s && typeof s.key === 'string' && typeof s.exe === 'string' && s.exe)
          .map((s) => [s.key, s.exe]));
        audioOutputDeviceIds = new Set((Array.isArray(msg.outputDevices) ? msg.outputDevices : [])
          .map((d) => d && d.id).filter((id) => typeof id === 'string'));
      }
      if (msg && msg.type === 'windows-notifications-status') {
        windowsNotificationsStatus = msg;
        broadcast('windows-notifications:status', msg);
      }
      if (msg?.type === 'displays' && Array.isArray(msg.monitors)) {
        const previous = islandDisplayList();
        nativeDisplays = msg.monitors;
        const current = islandDisplayList();
        migrateMonitorPreferences(previous, current);
        refreshIslandWindows();
        broadcast('displays:changed', current);
      }
      sendToIslands('helper:msg', msg);
      if (msg?.type === 'alarm-takeover') setAlarmTakeover(!!msg.active);
    }, app.getPath('userData'));
    helper.send({ cmd: 'windows-notifications', enabled: settings.notif?.captureWindows !== false });
    helper.send({ cmd: 'copy-text-config', enabled: settings.copyText?.enabled !== false, language: settings.copyText?.language || '' });
    helper.send({ cmd: 'companion-init' });
    helper.send({ cmd: 'clipboard-config', enabled: settings.clipboard?.enabled !== false, capture: settings.clipboard?.capture !== false, maxItems: settings.clipboard?.maxItems || 200 });
    sharedServices.updateSystemMonitor(settings.systemMonitor);
    screen.on('display-metrics-changed', () => refreshIslandWindows());
    screen.on('display-removed', () => refreshIslandWindows());
    screen.on('display-added', (event, display) => handleDisplayAdded(event, display));
    setupAutoUpdates();
  });
}

// Update hanya dicek di versi installer. Build development tidak punya feed GitHub.
function setupAutoUpdates() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  // Kalau pengguna menunda restart dari dialog, pasang update saat aplikasi
  // ditutup berikutnya. Tanpa ini, update yang sudah diunduh akan tetap pending.
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('error', (error) => console.error('[updater] Gagal cek/download update:', error.message));
  autoUpdater.on('update-downloaded', async (info) => {
    const result = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Restart sekarang', 'Nanti'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update Dynamis Island siap',
      message: `Versi ${info.version} sudah diunduh. Restart sekarang untuk memasang update, atau pilih Nanti dan update akan dipasang saat aplikasi ditutup.`
    });
    if (result.response === 0) autoUpdater.quitAndInstall();
  });
  const check = () => autoUpdater.checkForUpdates().catch((error) => {
    console.error('[updater] Gagal cek update:', error.message);
  });
  setTimeout(check, 15_000);
  setInterval(check, 4 * 60 * 60 * 1000);
}

app.on('window-all-closed', () => { if (process.platform !== 'win32') app.quit(); });
app.on('before-quit', () => { islandManager?.closeAll(); helper.stop(); trayIcon.destroy(); });

// ---------- Per-window hit testing and focus ----------
function resetIslandInteraction(context) {
  context.rendererOver = false; context.hoverInside = false; context.hoverCount = 0;
}

function cursorInsideIsland(context, cursor = screen.getCursorScreenPoint()) {
  if (!context.rect || context.window.isDestroyed() || !context.window.isVisible() || context.serviceOnly) return false;
  const p = cursor;
  const b = context.window.getBounds();
  const x = p.x - b.x, y = p.y - b.y, r = context.rect;
  return x >= r.x && x <= r.x + r.w && y >= r.y - 2 && y <= r.y + r.h;
}

function applyIgnore(context, cursor) {
  if (!context || context.window.isDestroyed() || !context.window.isVisible() || context.serviceOnly) return;
  const want = !(context.rendererOver || cursorInsideIsland(context, cursor));
  if (want === context.ignoring && Date.now() - context.lastIgnoreAt <= 1000) return;
  context.ignoring = want; context.lastIgnoreAt = Date.now();
  if (want) context.window.setIgnoreMouseEvents(true, { forward: true });
  else context.window.setIgnoreMouseEvents(false);
}

function pollHover(context, cursor) {
  if (!context || context.window.isDestroyed() || !context.window.isVisible() || context.serviceOnly) return;
  if (cursorInsideIsland(context, cursor)) {
    context.hoverCount++;
    if (!context.hoverInside && context.hoverCount >= 2) { context.hoverInside = true; context.window.webContents.send('island:hover', true); }
  } else {
    context.hoverCount = 0;
    if (context.hoverInside) { context.hoverInside = false; context.window.webContents.send('island:hover', false); }
  }
}

function islandContext(sender) {
  return islandManager?.values().find((context) => context.window.webContents === sender) || null;
}

function sendToIslands(channel, payload) {
  islandManager?.broadcast(channel, payload);
}

function setAlarmTakeover(active, payload = null) {
  alarmTakeover = active ? payload : null;
  refreshIslandWindows();
  sendToIslands('alarm:takeover', { active, alarm: payload });
}

function routeIslandHelperCommand(sender, command) {
  if (command?.cmd === 'audio-watch') {
    sharedServices.setAudio(sender.id, command.mode || 'off');
  } else if (command?.cmd === 'system-monitor-config') {
    sharedServices.setSystemMonitor(sender.id, command, settings.systemMonitor);
  } else helper.send(command);
}

function releaseIslandRequests(context) {
  if (context.requestsReleased) return;
  context.requestsReleased = true;
  const senderId = context.senderId;
  sharedServices.release(senderId, settings.systemMonitor);
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
    title: 'Pengaturan Dynamis Island', autoHideMenuBar: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  // Island normally sits at the screen-saver topmost level. Lower it while
  // Settings is open so it cannot cover the separate configuration window.
  for (const ctx of islandManager?.values() || []) if (!ctx.window.isDestroyed()) ctx.window.setAlwaysOnTop(false);
  settingsWin.setMenuBarVisibility(false);
  settingsWin.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) console.error(`[settings renderer] ${message} (${sourceId}:${line})`);
  });
  settingsWin.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error(`[settings window] failed to load ${url}: ${description} (${code})`);
  });
  settingsWin.once('ready-to-show', () => {
    if (!settingsWin || settingsWin.isDestroyed()) return;
    settingsWin.show();
    settingsWin.focus();
  });
  settingsWin.loadFile(path.join(__dirname, 'settings-window', 'index.html'), page ? { hash: page } : undefined).catch((error) => {
    console.error('[settings window] load failed:', error);
  });
  settingsWin.on('closed', () => {
    settingsWin = null;
    for (const ctx of islandManager?.values() || []) if (!ctx.serviceOnly) revealIsland(ctx);
  });
}

// ---------- IPC ----------
tray.register(ipcMain, broadcast);
shortcuts.register(ipcMain, broadcast);
aiMain.register(ipcMain);
translateMain.register(ipcMain, { getApiKey: aiMain.getKey });
ipcMain.on('island:set-ignore', (e, ignore) => { const ctx = islandContext(e.sender); if (ctx) { ctx.rendererOver = !ignore; applyIgnore(ctx); } });
ipcMain.on('island:rect', (e, r) => { const ctx = islandContext(e.sender); if (ctx) { ctx.rect = r; applyIgnore(ctx); pollHover(ctx); } });

ipcMain.on('island:focus', (e) => { const ctx = islandContext(e.sender); if (ctx) { ctx.focusAllowed = true; ctx.window.setFocusable(true); ctx.window.focus(); } });
ipcMain.on('island:allow-focus', (e) => { const ctx = islandContext(e.sender); if (ctx) { ctx.focusAllowed = true; ctx.window.setFocusable(true); } });
ipcMain.on('island:release-focus', (e) => { const ctx = islandContext(e.sender); if (ctx) { ctx.focusAllowed = false; ctx.window.blur(); ctx.window.setFocusable(false); } });
ipcMain.handle('island:instance', (e) => {
  const ctx = islandContext(e.sender);
  return { id: ctx?.id || '', primary: !!ctx?.display.primary, alarmLeader: !!ctx && ctx === islandManager?.primary(), alarmTakeover: { active: !!alarmTakeover, alarm: alarmTakeover } };
});
ipcMain.handle('displays:list', () => islandDisplayList().map((display) => ({
  ...display,
  visible: !!islandManager?.isVisibleDisplay(display.id)
})));
ipcMain.on('alarm:state', (e, state) => {
  const ctx = islandContext(e.sender);
  if (!ctx || ctx !== islandManager?.primary()) return;
  setAlarmTakeover(!!state?.active, state?.alarm || null);
});
ipcMain.on('alarm:action', (_e, action) => {
  setAlarmTakeover(false);
  sendToIslands('alarm:action', action);
});

ipcMain.handle('settings:get', () => settings && typeof settings === 'object' ? settings : { ...DEFAULT_SETTINGS, display: normalizeDisplayConfig(DEFAULT_SETTINGS.display) });

ipcMain.handle('settings:set', (_e, patch) => {
  settings = mergeSettings(settings, patch, DEFAULT_SETTINGS);
  saveSettings();
  if (Object.prototype.hasOwnProperty.call(patch, 'display')) refreshIslandWindows();
  applyAutoStart();
  broadcast('settings:changed', settings); // island dan window pengaturan ikut diperbarui
  if (patch.notif && Object.prototype.hasOwnProperty.call(patch.notif, 'captureWindows')) {
    helper.send({ cmd: 'windows-notifications', enabled: settings.notif.captureWindows !== false });
  }
  if (patch.copyText) {
    helper.send({ cmd: 'copy-text-config', enabled: settings.copyText.enabled !== false, language: settings.copyText.language || '' });
  }
  if (patch.clipboard) helper.send({ cmd: 'clipboard-config', enabled: settings.clipboard?.enabled !== false, capture: settings.clipboard?.capture !== false, maxItems: settings.clipboard?.maxItems || 200 });
  if (patch.systemMonitor) sharedServices.updateSystemMonitor(settings.systemMonitor);
  return settings && typeof settings === 'object' ? settings : { ...DEFAULT_SETTINGS, display: normalizeDisplayConfig(DEFAULT_SETTINGS.display) };
});

ipcMain.handle('windows-notifications:status', () => windowsNotificationsStatus);
ipcMain.handle('notif:count', () => notificationCount);
ipcMain.on('notif:count-update', (_e, count) => {
  notificationCount = Math.max(0, Math.min(200, Number(count) || 0));
  broadcast('notif:count-changed', notificationCount);
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
ipcMain.handle('app:check-updates', async () => {
  if (!app.isPackaged) return { ok: false, message: 'Updates are available in the installed app.' };
  try {
    const result = await autoUpdater.checkForUpdates();
    return { ok: true, message: result?.updateInfo?.version && result.updateInfo.version !== app.getVersion() ? `Update ${result.updateInfo.version} found; downloading.` : 'You are up to date.' };
  } catch (error) {
    console.error('[updater] Manual update check failed:', error.message);
    return { ok: false, message: 'Could not check for updates. Try again later.' };
  }
});
ipcMain.on('app:open-data', () => shell.openPath(app.getPath('userData')));

ipcMain.on('helper:send', (event, obj) => {
  if (islandContext(event.sender)) routeIslandHelperCommand(event.sender, obj);
  else helper.send(obj);
});
ipcMain.handle('helper:status', () => helper.status());

ipcMain.handle('translate:defaults', () => ({
  systemLanguage: resolveSystemLanguage(app.getLocale(), 'id'),
  maxCharacters: translateMain.MAX_TRANSLATION_CHARACTERS,
  languages: LANGUAGES
}));
ipcMain.handle('translate:clipboard', () => {
  const text = clipboard.readText();
  const characters = translateMain.characterCount(text);
  if (characters > translateMain.MAX_TRANSLATION_CHARACTERS) {
    return { ok: false, error: `Clipboard text is too long (${characters.toLocaleString()} characters). Limit: ${translateMain.MAX_TRANSLATION_CHARACTERS.toLocaleString()}. Nothing was cut off.` };
  }
  return { ok: true, text };
});
ipcMain.handle('translate:copy', (_event, value) => {
  if (typeof value !== 'string' || !value) return { ok: false };
  clipboard.writeText(value);
  return { ok: true };
});
ipcMain.handle('translate:pick-image', async (event) => {
  const owner = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(owner, {
    title: 'Choose an image to translate',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'tif', 'tiff'] }]
  });
  if (result.canceled || !result.filePaths.length) return { ok: false, cancelled: true };
  const imagePath = result.filePaths[0];
  const extension = path.extname(imagePath).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.bmp', '.gif', '.tif', '.tiff'].includes(extension)) return { ok: false, error: 'Unsupported image format.' };
  let stat;
  try { stat = fs.statSync(imagePath); } catch { return { ok: false, error: 'The selected image could not be read.' }; }
  if (!stat.isFile() || stat.size > 20 * 1024 * 1024) return { ok: false, error: 'Image is too large. Choose an image under 20 MB.' };
  const sent = helper.send({ cmd: 'translate-image', path: imagePath });
  return sent ? { ok: true } : { ok: false, error: 'The OCR helper is not running. Restart Dynamis Island and retry.' };
});

ipcMain.handle('lyrics:get', (_e, q) => lyrics.get(q, settings.lyricsDir, settings.lyricsDisplayMode, settings.romajiSystem));
ipcMain.handle('lyrics:import', (_e, q) => lyrics.importFile(q, settings.lyricsDisplayMode, settings.romajiSystem));
ipcMain.handle('lyrics:import-text', (_e, q, text, name) => lyrics.importText(q, text, name, settings.lyricsDisplayMode, settings.romajiSystem));
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
