// Data kalender (event) dan mesin pengingat. Event disimpan lokal di localStorage.
import { playSound } from './sound.js';

const pad = (n) => String(n).padStart(2, '0');
const load = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export const COLORS = ['#f43f5e', '#f59e0b', '#10b981', '#38bdf8', '#8b5cf6', '#ec4899'];
export const REMINDERS = [
  { v: -1, t: 'Tanpa' }, { v: 0, t: 'Tepat' }, { v: 5, t: '5 mnt' },
  { v: 15, t: '15 mnt' }, { v: 30, t: '30 mnt' }, { v: 60, t: '1 jam' }
];
const GRACE_MS = 10 * 60000;     // pengingat masih ditampilkan jika terlambat maksimal 10 menit
const ALLDAY_HOUR = 8;           // event seharian diingatkan pukul 08:00

export const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Array dipakai bersama oleh tampilan; selalu diubah di tempat
export const events = load('events', []);
let fired = load('events.fired', {});

const subs = new Set();
export const onEvents = (f) => { subs.add(f); return () => subs.delete(f); };
const emit = () => subs.forEach((f) => f());
const persist = () => save('events', events);

export function addEvent(ev) {
  const e = { id: Math.random().toString(36).slice(2, 9), title: '', note: '', date: ymd(new Date()), time: null, color: COLORS[0], remind: -1, ...ev, armedAt: Date.now() };
  events.push(e);
  persist(); emit();
  return e;
}

export function updateEvent(id, patch) {
  const e = events.find((x) => x.id === id);
  if (!e) return;
  Object.assign(e, patch);
  if ('date' in patch || 'time' in patch || 'remind' in patch) e.armedAt = Date.now();
  persist(); emit();
}

export function removeEvent(id) {
  const i = events.findIndex((x) => x.id === id);
  if (i < 0) return;
  events.splice(i, 1);
  persist(); emit();
}

export const eventsOn = (ds) => events.filter((e) => e.date === ds).sort((a, b) => (a.time || '').localeCompare(b.time || ''));

export function startOf(e) {
  const [y, m, d] = e.date.split('-').map(Number);
  const [h, mi] = e.time ? e.time.split(':').map(Number) : [ALLDAY_HOUR, 0];
  return new Date(y, m - 1, d, h, mi, 0, 0).getTime();
}

const remMin = (v) => (v >= 60 ? `${v / 60} jam` : `${v} mnt`);
export function remindText(e) {
  if (!e.time) return 'Hari ini';
  return e.remind === 0 ? `Sekarang, ${e.time}` : `${remMin(e.remind)} lagi, ${e.time}`;
}

function notify(e) {
  playSound('pulse', { volume: 0.55, rounds: 1 });
  // Hook untuk sistem notifikasi island (tahap 8 akan menampung ini di tab Notifikasi)
  document.dispatchEvent(new CustomEvent('island:notify', { detail: { title: e.title, sub: remindText(e), color: e.color, source: 'calendar' } }));
}

export function checkEvents(now = Date.now()) {
  let changed = false;
  for (const e of events) {
    if (e.remind < 0) continue;
    const trig = startOf(e) - e.remind * 60000;
    if (trig < (e.armedAt || 0)) continue; // pengingat yang sudah lewat saat event dibuat tidak dibunyikan
    const key = `${e.id}|${e.date}|${e.time || '*'}|${e.remind}`;
    if (now >= trig && now - trig < GRACE_MS && !fired[key]) { fired[key] = now; changed = true; notify(e); }
  }
  if (changed) {
    const ids = new Set(events.map((e) => e.id));
    fired = Object.fromEntries(Object.entries(fired).filter(([k]) => ids.has(k.split('|')[0])));
    save('events.fired', fired);
  }
}

setInterval(() => checkEvents(), 5000);
