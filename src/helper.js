// Mengelola proses helper C#. Dipakai main process.
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const { app } = require('electron');

let proc = null;
let onMsg = () => {};
let stopped = false;
let lastError = null;
const waiters = new Map(); // jenis pesan -> fungsi penerima balasan

function exePath() {
  const base = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
  return path.join(base, 'helper-bin', 'IslandHelper.exe');
}

function launch() {
  const exe = exePath();
  if (!fs.existsSync(exe)) {
    lastError = 'Helper belum di-build. Jalankan "npm run build:helper" lalu mulai ulang aplikasi.';
    onMsg({ type: 'error', message: lastError });
    return;
  }
  lastError = null;
  proc = spawn(exe, [], { windowsHide: true });
  readline.createInterface({ input: proc.stdout }).on('line', (line) => {
    try {
      const m = JSON.parse(line);
      const w = waiters.get(m.type);
      if (w) w(m); else onMsg(m);
    } catch {}
  });
  proc.stderr.on('data', (d) => console.error('[helper]', d.toString()));
  proc.on('exit', () => {
    proc = null;
    if (!stopped) setTimeout(launch, 2000); // restart otomatis kalau crash
  });
}

module.exports = {
  start(cb) { onMsg = cb; stopped = false; launch(); },
  // Kirim perintah lalu tunggu satu balasan dengan jenis tertentu (batas waktu ms)
  request(obj, type, ms) {
    return new Promise((resolve, reject) => {
      if (!proc || !proc.stdin.writable) return reject(new Error('helper tidak aktif'));
      const timer = setTimeout(() => { waiters.delete(type); reject(new Error('timeout')); }, ms);
      waiters.set(type, (m) => { clearTimeout(timer); waiters.delete(type); resolve(m); });
      this.send(obj);
    });
  },
  send(obj) {
    if (!proc || !proc.stdin.writable) return false;
    try {
      proc.stdin.write(JSON.stringify(obj) + '\n');
      return true;
    } catch (error) {
      console.error('[helper] unable to send command:', error);
      return false;
    }
  },
  status() { return { error: lastError }; },
  stop() { stopped = true; if (proc) proc.kill(); }
};
