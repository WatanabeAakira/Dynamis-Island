// Penghubung ke helper untuk audio Windows: menyimpan data terakhir, mengatur kapan helper memantau, dan perintah volume.

export const audio = { master: null, sessions: [], outputDevices: [], at: 0 };
const subs = new Set();
export const onAudio = (f) => { subs.add(f); return () => subs.delete(f); };

window.api.onHelper((m) => {
  if (!m || m.type !== 'audio') return;
  audio.master = m.master;
  if (Array.isArray(m.sessions)) audio.sessions = m.sessions;
  if (Array.isArray(m.outputDevices)) audio.outputDevices = m.outputDevices;
  audio.at = performance.now();
  subs.forEach((f) => f());
});

// Helper hanya memantau saat ada tampilan yang membutuhkan: "master" (volume utama) atau "full" (semua aplikasi)
const want = new Map();
let sent = 'off';
let sentAt = 0;
function sync() {
  let mode = 'off';
  for (const [owner, v] of want) {
    if (!v.root.isConnected) { want.delete(owner); continue; }
    if (v.mode === 'off') continue;
    if (v.mode === 'full') mode = 'full'; else if (mode === 'off') mode = 'master';
  }
  // Dikirim ulang tiap 5 detik supaya pulih sendiri bila helper sempat restart
  if (mode !== sent || performance.now() - sentAt > 5000) {
    sent = mode; sentAt = performance.now();
    window.api.helperSend({ cmd: 'audio-watch', mode });
  }
}
export function watch(owner, mode, root) { want.set(owner, { mode, root }); sync(); }
setInterval(sync, 1000);

export function setMasterVolume(v) { if (audio.master) audio.master.vol = v; window.api.helperSend({ cmd: 'audio-master', value: v }); }
export function setMasterMute(b) { if (audio.master) audio.master.mute = b; window.api.helperSend({ cmd: 'audio-mastermute', value: b }); }
export const setAppVolume = (key, v) => window.api.helperSend({ cmd: 'audio-vol', key, value: v });
export const setAppMute = (key, b) => window.api.helperSend({ cmd: 'audio-mute', key, value: b });
