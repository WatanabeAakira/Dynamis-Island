// Mesin waktu bersama (timer sekarang; focus dan alarm menyusul). Terus berjalan walau island tertutup.
import { playChime } from './sound.js';
import { ring, onAlarms, isAlarmLeader } from './alarmkeeper.js';

const pad = (n) => String(n).padStart(2, '0');
export function parts(ms) {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return { h: Math.floor(t / 3600), m: Math.floor((t % 3600) / 60), s: t % 60 };
}
export const fmtClock = (ms) => { const { h, m, s } = parts(ms); return `${pad(h)}:${pad(m)}:${pad(s)}`; };
export const fmtShort = (ms) => { const { h, m, s } = parts(ms); return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`; };
export const fmtWords = (ms) => {
  const { h, m, s } = parts(ms);
  return [h ? `${h} jam` : '', h || m ? `${m} mnt` : '', `${s} dtk`].filter(Boolean).join(' ');
};

const load = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

const total0 = load('timer.total', 5 * 60000);
export const timer = { total: total0, remaining: total0, running: false, endsAt: 0, loop: load('timer.loop', false), done: false, ...load('timer.state', {}) };
const saveTimer = () => save('timer.state', { total: timer.total, remaining: timer.remaining, running: timer.running, endsAt: timer.endsAt, loop: timer.loop, done: timer.done });

const subs = new Set();
export const onTimer = (f) => { subs.add(f); return () => subs.delete(f); };
const emit = () => subs.forEach((f) => f());

let stopSound = () => {};
export function stopAlert() { stopSound(); stopSound = () => {}; }

function finish() {
  timer.running = false;
  timer.remaining = 0;
  timer.done = true;
  saveTimer();
  emit();
  stopAlert();
  stopSound = playChime(3);
  document.dispatchEvent(new CustomEvent('island:alert', { detail: { tab: 'timer', sub: 'timer', title: 'Timer selesai' } }));
  if (timer.loop) setTimeout(() => { if (timer.done && timer.loop) timerStart(); }, 4800);
}

setInterval(() => {
  if (!timer.running) return;
  timer.remaining = Math.max(0, timer.endsAt - Date.now());
  if (timer.remaining <= 0 && isAlarmLeader()) finish(); else emit();
}, 200);

export function timerStart() {
  stopAlert();
  if (timer.done || timer.remaining <= 0) { timer.remaining = timer.total; timer.done = false; }
  timer.endsAt = Date.now() + timer.remaining;
  timer.running = true;
  timer.done = false; saveTimer();
  emit();
}
export function timerPause() {
  if (!timer.running) return;
  timer.remaining = Math.max(0, timer.endsAt - Date.now());
  timer.running = false;
  saveTimer();
  emit();
}
export function timerReset() {
  stopAlert();
  timer.running = false; timer.done = false; timer.remaining = timer.total;
  saveTimer();
  emit();
}
export function timerSet(ms) {
  stopAlert();
  timer.total = ms; timer.remaining = ms; timer.running = false; timer.done = false;
  save('timer.total', ms);
  saveTimer();
  emit();
}
export function timerLoop(on) { timer.loop = on; save('timer.loop', on); saveTimer(); emit(); }

// ---------- Focus: sesi fokus dan istirahat ----------
const F_LIMIT = { focus: [1, 120], short: [1, 30], long: [1, 60] };
const dur0 = { focus: 25, short: 5, long: 15, ...load('focus.dur', {}) };
const today = new Date().toDateString();
if (load('focus.day', '') !== today) { save('focus.day', today); save('focus.sessions', 0); } // hitungan sesi per hari

export const focus = {
  mode: 'focus', dur: dur0, total: dur0.focus * 60000, remaining: dur0.focus * 60000,
  running: false, endsAt: 0, done: false,
  sessions: load('focus.sessions', 0), auto: load('focus.auto', false)
};
Object.assign(focus, load('focus.state', {}));
const saveFocus = () => save('focus.state', { mode: focus.mode, dur: focus.dur, total: focus.total, remaining: focus.remaining, running: focus.running, endsAt: focus.endsAt, done: focus.done, sessions: focus.sessions, auto: focus.auto });

const fSubs = new Set();
export const onFocus = (f) => { fSubs.add(f); return () => fSubs.delete(f); };
const fEmit = () => fSubs.forEach((f) => f());
let fStop = () => {};

function fLoadMode(m) {
  focus.mode = m;
  focus.total = focus.dur[m] * 60000;
  focus.remaining = focus.total;
  focus.running = false;
  focus.done = false;
}

function fFinish() {
  focus.running = false;
  focus.remaining = 0;
  focus.done = true;
  if (focus.mode === 'focus') { focus.sessions++; save('focus.sessions', focus.sessions); }
  fEmit();
  saveFocus();
  fStop();
  fStop = playChime(3);
  document.dispatchEvent(new CustomEvent('island:alert', {
    detail: { tab: 'timer', sub: 'focus', title: focus.mode === 'focus' ? 'Sesi fokus selesai' : 'Istirahat selesai' }
  }));
  // Setelah nada selesai, siapkan sesi berikutnya (istirahat panjang setiap 4 sesi fokus)
  const next = focus.mode === 'focus' ? (focus.sessions % 4 === 0 ? 'long' : 'short') : 'focus';
  setTimeout(() => {
    if (!focus.done) return; // pengguna sudah mengatur sendiri
    fLoadMode(next); saveFocus();
    fEmit();
    if (focus.auto) focusStart();
  }, 4800);
}

setInterval(() => {
  if (!focus.running) return;
  focus.remaining = Math.max(0, focus.endsAt - Date.now());
  if (focus.remaining <= 0 && isAlarmLeader()) fFinish(); else fEmit();
}, 200);

export function focusStart() {
  fStop();
  if (focus.done || focus.remaining <= 0) fLoadMode(focus.mode);
  focus.endsAt = Date.now() + focus.remaining;
  focus.running = true;
  saveFocus();
  fEmit();
}
export function focusPause() {
  if (!focus.running) return;
  focus.remaining = Math.max(0, focus.endsAt - Date.now());
  focus.running = false;
  saveFocus();
  fEmit();
}
export function focusReset() { fStop(); fLoadMode(focus.mode); saveFocus(); fEmit(); }
export function focusMode(m) { fStop(); fLoadMode(m); saveFocus(); fEmit(); }
export function focusSkip() { fStop(); fLoadMode(focus.mode === 'focus' ? 'short' : 'focus'); saveFocus(); fEmit(); }
export function focusAdjust(m, delta) {
  const [lo, hi] = F_LIMIT[m];
  focus.dur[m] = Math.min(hi, Math.max(lo, focus.dur[m] + delta));
  save('focus.dur', focus.dur);
  if (focus.mode === m) { fStop(); fLoadMode(m); }
  saveFocus(); fEmit();
}
export function focusAuto(on) { focus.auto = on; save('focus.auto', on); saveFocus(); fEmit(); }

window.addEventListener('storage', (event) => {
  if (event.key === 'timer.state') {
    const state = load('timer.state', {});
    if (timer.done && !state.done) stopAlert();
    Object.assign(timer, state); emit();
  }
  else if (event.key === 'focus.state') {
    const state = load('focus.state', {});
    if (focus.done && !state.done) fStop();
    Object.assign(focus, state); fEmit();
  }
});

// ---------- Untuk pill di mode collapse ----------
export function pillInfo() {
  if (ring.active) return { text: `Alarm ${pad(ring.active.alarm.h)}:${pad(ring.active.alarm.m)}`, kind: 'alarm' };
  if (timer.running) return { text: fmtShort(timer.remaining), kind: 'timer' };
  if (focus.running) return { text: fmtShort(focus.remaining), kind: 'focus-' + focus.mode };
  return null;
}
export function onAnyTimer(f) {
  const a = onTimer(f), b = onFocus(f), c = onAlarms(f);
  return () => { a(); b(); c(); };
}
