// System tray native Electron. Menu native nggak bikin BrowserWindow tambahan,
// jadi status fokus dan click-through island nggak saling ganggu.
const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');

let tray = null;
let opts = null;

function trayImage() {
  const dir = path.join(__dirname, 'assets');
  const image = nativeImage.createFromPath(path.join(dir, 'tray-64.png'));
  return image.resize({ width: 16, height: 16 });
}

function openMenu() {
  if (!tray || !opts) return;

  const state = opts.state();
  const menu = Menu.buildFromTemplate([
    {
      label: state.visible ? 'Sembunyikan island' : 'Tampilkan island',
      click: () => opts.toggleIsland()
    },
    { type: 'separator' },
    { label: 'Pengaturan', click: () => opts.openSettings() },
    {
      label: 'Jalankan saat Windows menyala',
      type: 'checkbox',
      checked: !!state.autoStart,
      click: () => opts.toggleAutoStart()
    },
    { type: 'separator' },
    { label: `Dynamis Island ${app.getVersion()}`, enabled: false },
    { label: 'Keluar', click: () => opts.quit() }
  ]);

  if (typeof opts.onMenuClosed === 'function') {
    menu.on('menu-will-close', opts.onMenuClosed);
  }
  tray.popUpContextMenu(menu);
}

function init(options) {
  opts = options;
  tray = new Tray(trayImage());
  tray.setToolTip('Dynamis Island');
  tray.on('click', () => opts.toggleIsland());
  tray.on('right-click', openMenu);
}

function destroy() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
  opts = null;
}

module.exports = { init, destroy, openMenu };
