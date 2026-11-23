// Mesin alarm: penyimpanan, penjadwalan, bunyi berulang, tunda, dan berhenti.
import { playSound } from './sound.js';

const pad = (n) => String(n).padStart(2, '0');
const load = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export const DAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
export const SOUNDS = { chime: 'Chime', bell: 'Lonceng', digital: 'Digital', pulse: 'Pulse' };
export const SNOOZE_MIN = 5;
const BURST_MS = { chime: 1900, bell: 3200, digital: 1500, pulse: 1700 }; // jeda antar ulangan bunyi
const GRACE_MS = 120000;     // alarm masih dibunyikan jika terlambat maksimal 2 menit (mis. komputer baru bangun)
const RING_MAX_MS = 120000;  // berhenti sendiri jika tidak direspons

// Array ini dipakai bersama oleh tampilan; selalu diubah di tempat (tidak diganti objeknya)
export const alarms = load('alarms', []);
export const ring = { active: null }; // { alarm, since }
let alarmLeader = false;
export const isAlarmLeader = () => alarmLeader;
window.api?.islandInstance?.().then((instance) => {
  alarmLeader = !!instance?.alarmLeader;
  if (instance?.alarmTakeover?.active) {
    applyTakeover(instance.alarmTakeover);
    if (alarmLeader && instance.alarmTakeover.alarm?.alarm) {
      startSound(instance.alarmTakeover.alarm.alarm);
      ringTimer = setTimeout(stopRing, RING_MAX_MS);
    }
  }
}).catch(() => { alarmLeader = true; });
window.api?.onIslandRole?.((role) => {
  const wasLeader = alarmLeader;
  alarmLeader = !!role?.alarmLeader;
  if (wasLeader && !alarmLeader) { stopSound(); clearTimeout(ringTimer); ringTimer = 0; }
  else if (!wasLeader && alarmLeader && ring.active) {
    startSound(ring.active.alarm);
    clearTimeout(ringTimer);
    ringTimer = setTimeout(stopRing, RING_MAX_MS);
  }
});

const subs = new Set();
export const onAlarms = (f) => { subs.add(f); return () => subs.delete(f); };
const emit = () => subs.forEach((f) => f());
const persist = () => save('alarms', alarms);

export const dayIdx = (d) => (d.getDay() + 6) % 7; // Senin = 0

export function newAlarm() {
  const a = {
    id: Math.random().toString(36).slice(2, 9),
    h: (new Date().getHours() + 1) % 24, m: 0,
    days: [false, false, false, false, false, false, false],
    enabled: true, sound: 'chime', volume: 0.7, snooze: true, armedAt: Date.now()
  };
  alarms.push(a);
  persist(); emit();
  return a;
}

export function updateAlarm(id, patch) {
  const a = alarms.find((x) => x.id === id);
  if (!a) return;
  Object.assign(a, patch);
  // Mengubah waktu/hari atau menyalakan ulang berarti dijadwalkan dari sekarang
  if ('h' in patch || 'm' in patch || 'days' in patch || patch.enabled === true) a.armedAt = Date.now();
  persist(); emit();
}

export function removeAlarm(id) {
  const i = alarms.findIndex((x) => x.id === id);
  if (i < 0) return;
  alarms.splice(i, 1);
  snoozes = snoozes.filter((s) => s.id !== id);
  if (ring.active && ring.active.alarm.id === id) { stopRing(); return; }
  persist(); emit();
}

// Kemunculan berikutnya setelah waktu `from` (tanpa memperhatikan apakah alarm aktif)
export function nextOccurrence(a, from = new Date()) {
  const any = a.days.some(Boolean);
  for (let off = 0; off < 8; off++) {
    const d = new Date(from);
    d.setDate(d.getDate() + off);
    d.setHours(a.h, a.m, 0, 0);
    if (d <= from) continue;
    if (!any || a.days[dayIdx(d)]) return d;
  }
  return null;
}

export function nextInfo() {
  let best = null;
  for (const a of alarms) {
    if (!a.enabled) continue;
    const at = nextOccurrence(a);
    if (at && (!best || at < best.at)) best = { alarm: a, at, ms: at - Date.now() };
  }
  return best;
}

export function repeatLabel(a) {
  const on = a.days.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  if (!on.length) return 'Sekali';
  if (on.length === 7) return 'Setiap hari';
  if (on.join() === '0,1,2,3,4') return 'Sen-Jum';
  if (on.join() === '5,6') return 'Akhir pekan';
  return on.map((i) => DAYS[i]).join(', ');
}

// ---------- Bunyi berulang selama alarm berdering ----------
let stops = [];
let loopTimer = 0;
let ringTimer = 0;

function startSound(a) {
  stopSound();
  const burst = () => { stops.push(playSound(a.sound, { volume: a.volume, rounds: 1 })); if (stops.length > 6) stops.shift(); };
  burst();
  loopTimer = setInterval(burst, BURST_MS[a.sound] || 1900);
}
function stopSound() {
  clearInterval(loopTimer);
  loopTimer = 0;
  stops.forEach((s) => s());
  stops = [];
}

let snoozes = []; // { id, at }
const fired = new Map(); // id -> waktu terjadwal terakhir yang sudah dibunyikan

function fire(a, fromSnooze = false) {
  stopSound();
  clearTimeout(ringTimer);
  ring.active = { alarm: a, since: Date.now() };
  startSound(a);
  ringTimer = setTimeout(stopRing, RING_MAX_MS);
  if (!fromSnooze && !a.days.some(Boolean)) { a.enabled = false; persist(); } // alarm sekali pakai
  emit();
  window.api?.setAlarmState?.({ active: true, alarm: ring.active });
  document.dispatchEvent(new CustomEvent('island:alert', {
    detail: { tab: 'timer', sub: 'alarm', title: `Alarm ${pad(a.h)}:${pad(a.m)}`, persist: true }
  }));
}

export function stopRing() {
  if (ring.active) window.api?.alarmAction?.({ type: 'dismiss' });
  stopRingLocal();
}

function stopRingLocal() {
  stopSound();
  clearTimeout(ringTimer);
  ring.active = null;
  emit();
}

export function snoozeRing() {
  const r = ring.active;
  if (!r) return;
  window.api?.alarmAction?.({ type: 'snooze', alarm: r.alarm, at: Date.now() + SNOOZE_MIN * 60000 });
}

function applyTakeover({ active, alarm }) {
  if (!active) { if (ring.active) stopRingLocal(); return; }
  if (!alarm) return;
  ring.active = alarm;
  emit();
  document.dispatchEvent(new CustomEvent('island:alert', { detail: { tab: 'timer', sub: 'alarm', title: `Alarm ${pad(alarm.alarm?.h)}:${pad(alarm.alarm?.m)}`, persist: true } }));
}
window.api?.onAlarmTakeover?.(applyTakeover);

window.api?.onAlarmAction?.((action) => {
  if (action?.type === 'snooze' && action.alarm) {
    snoozes.push({ id: action.alarm.id, at: Number(action.at) || Date.now() + SNOOZE_MIN * 60000 });
    stopRingLocal();
  } else if (action?.type === 'dismiss') stopRingLocal();
});

window.addEventListener('storage', (event) => {
  if (event.key !== 'alarms') return;
  const latest = load('alarms', []);
  alarms.splice(0, alarms.length, ...latest);
  emit();
});

export function checkAlarms(now = Date.now()) {
  for (const a of alarms) {
    if (!a.enabled) continue;
    const d = new Date(now);
    d.setHours(a.h, a.m, 0, 0);
    const t = d.getTime();
    const any = a.days.some(Boolean);
    if (any && !a.days[dayIdx(d)]) continue;
    if (t < (a.armedAt || 0)) continue;
    if (now >= t && now - t < GRACE_MS && fired.get(a.id) !== t) { fired.set(a.id, t); fire(a); }
  }
  for (const s of [...snoozes]) {
    if (now < s.at) continue;
    snoozes = snoozes.filter((x) => x !== s);
    const a = alarms.find((x) => x.id === s.id);
    if (a) fire(a, true);
  }
}

setInterval(() => { if (alarmLeader) checkAlarms(); }, 1000);
