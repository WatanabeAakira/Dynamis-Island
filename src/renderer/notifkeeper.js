// Notifikasi internal island: timer, fokus, alarm, dan kalender (AI dan sistem menyusul). Disimpan lokal.
const load = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export const SOURCES = {
  timer: { label: 'Timer', color: '#f43f5e', body: 'Hitung mundur selesai' },
  focus: { label: 'Fokus', color: '#f59e0b', body: 'Sesi fokus selesai' },
  alarm: { label: 'Alarm', color: '#a78bfa', body: 'Alarm berbunyi' },
  calendar: { label: 'Kalender', color: '#22d3ee', body: 'Pengingat event' },
  system: { label: 'Sistem', color: '#94a3b8', body: '' }
};

export const notifs = load('notifs', []); // terbaru di depan
let limit = 50;
let arrivedAt = 0;
const subs = new Set();
export const onNotifs = (f) => { subs.add(f); return () => subs.delete(f); };
const emit = () => subs.forEach((f) => f());
const persist = () => save('notifs', notifs);
const prune = () => { if (notifs.length > limit) notifs.splice(limit); };
export const lastArrival = () => arrivedAt;
export const unreadCount = () => notifs.reduce((s, n) => s + (n.read ? 0 : 1), 0);

export function setNotifLimit(n) {
  limit = Math.max(10, Math.min(200, Number(n) || 50));
  prune(); persist(); emit();
}

export function addNotif({ source = 'system', title = '', body = '', tab = null, sub = null, color } = {}) {
  const src = SOURCES[source] ? source : 'system';
  const n = {
    id: Math.random().toString(36).slice(2, 9), source: src,
    title: String(title || SOURCES[src].label).slice(0, 120),
    body: String(body || SOURCES[src].body || '').slice(0, 240),
    ts: Date.now(), read: false, tab, sub, color: color || SOURCES[src].color
  };
  notifs.unshift(n);
  prune(); persist();
  arrivedAt = Date.now();
  emit();
  return n;
}

export function markRead(id, v = true) {
  const n = notifs.find((x) => x.id === id);
  if (n) { n.read = !!v; persist(); emit(); }
}
export function markAll() { notifs.forEach((n) => { n.read = true; }); persist(); emit(); }
export function removeNotif(id) {
  const i = notifs.findIndex((x) => x.id === id);
  if (i >= 0) { notifs.splice(i, 1); persist(); emit(); }
}
export function clearAll() { const n = notifs.length; notifs.length = 0; persist(); emit(); return n; }

// ---- Sumber peristiwa yang sudah ada di island ----
document.addEventListener('island:notify', (e) => {
  const d = e.detail || {};
  addNotif({ source: 'calendar', title: d.title || 'Pengingat', body: d.sub || '', color: d.color });
});
document.addEventListener('island:alert', (e) => {
  const d = e.detail || {};
  if (!d.title) return;
  const source = d.sub === 'focus' ? 'focus' : d.sub === 'alarm' ? 'alarm' : 'timer';
  addNotif({ source, title: d.title, tab: d.tab || null, sub: d.sub || null });
});
