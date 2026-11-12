// Tab AI: asisten ringan (Groq). Streaming, alat untuk timer/alarm/event/musik, aksi cepat dari clipboard.
import { MODELS, DEFAULT_MODEL, TOOLS, QUICK, validate, mergeToolCalls, contextText, buildMessages, trimHistory } from './ai-core.js';
import { mediaNow } from './media.js';
import { eventsOn, addEvent, ymd } from './calkeeper.js';
import { timerSet, timerStart } from './timekeeper.js';
import { newAlarm, updateAlarm } from './alarmkeeper.js';
import { label as wxLabel } from './weather-icons.js';

const island = document.getElementById('island');
const svg = (b) => `<svg viewBox="0 0 24 24" aria-hidden="true">${b}</svg>`;
const I = {
  orb: '<circle cx="12" cy="12" r="8" fill="none"/><path d="M8 12c1.2-2.4 2.6-3.6 4-3.6s2.8 1.2 4 3.6"/>',
  trash: '<path d="M5 7h14M9 7V4.5h6V7M7 7l1 12.5h8L17 7"/>',
  send: '<path d="M4 12l15-7-5 15-2.6-5.4z"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>',
  ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  err: '<path d="M6 6l12 12M18 6L6 18"/>'
};
const STARTERS = ['Apa jadwal saya hari ini?', 'Atur timer 10 menit', 'Terjemahkan "good morning" ke Indonesia'];
const LIMIT_KEY = 'ai.chat';
const esc = (t) => String(t).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

let S = { ai: {} };
let history = [];          // pesan untuk API (user, assistant, tool) + field 'shown' untuk tampilan
let busy = false;
let pending = null;        // { id } permintaan yang sedang berjalan
let hasKey = false;
let active = null;
let quickMsg = '';

const cfg = () => ({
  model: (S.ai && S.ai.model) || DEFAULT_MODEL,
  limit: (S.ai && S.ai.historyLimit) || 20,
  ctxMedia: !S.ai || S.ai.ctxMedia !== false,
  ctxWeather: !S.ai || S.ai.ctxWeather !== false,
  ctxSchedule: !S.ai || S.ai.ctxSchedule !== false
});

function loadHistory() {
  try { history = JSON.parse(localStorage.getItem(LIMIT_KEY) || '[]'); } catch { history = []; }
}
function saveHistory() {
  history = trimHistory(history, cfg().limit * 2);
  try { localStorage.setItem(LIMIT_KEY, JSON.stringify(history)); } catch {}
}

// ---------- Konteks ringan ----------
const raceTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);
async function buildContext() {
  const c = cfg();
  const now = new Date().toLocaleString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false });
  const m = c.ctxMedia ? mediaNow() : null;
  const media = m && m.active && m.title ? { title: m.title, artist: m.artist } : null;
  let weather = null;
  if (c.ctxWeather && S.weather && S.weather.loc) {
    const d = await raceTimeout(window.api.weatherGet({ lat: S.weather.loc.lat, lon: S.weather.loc.lon }), 1500);
    if (d && !d.error && d.current) weather = { temp: Math.round(d.current.temp), label: wxLabel(d.current.code) };
  }
  const events = c.ctxSchedule ? eventsOn(ymd(new Date())).map((e) => ({ time: e.time, title: e.title })) : null;
  return contextText({ now, media, weather, events });
}

// ---------- Alat (dijalankan di renderer, memakai fitur yang sudah ada) ----------
function runTool(call) {
  const name = call.function && call.function.name;
  let args;
  try { args = JSON.parse(call.function.arguments || '{}'); } catch { return { ok: false, error: 'argumen tidak bisa dibaca' }; }
  const v = validate(name, args);
  if (!v.ok) return { ok: false, error: v.error };
  const a = v.value;
  switch (name) {
    case 'set_timer':
      timerSet(a.minutes * 60000);
      timerStart();
      return { ok: true, text: `Timer ${a.minutes} menit dimulai` };
    case 'set_alarm': {
      const [h, m] = a.time.split(':').map(Number);
      const al = newAlarm();
      updateAlarm(al.id, { h, m, enabled: true });
      return { ok: true, text: `Alarm diatur pukul ${a.time}` };
    }
    case 'add_event':
      addEvent({ title: a.title, date: a.date, time: a.time, remind: a.time ? 15 : -1 });
      return { ok: true, text: `Event "${a.title}" ditambahkan` };
    case 'media_control':
      window.api.helperSend({ cmd: a.action });
      return { ok: true, text: { toggle: 'Musik diputar/dijeda', next: 'Lagu berikutnya', prev: 'Lagu sebelumnya' }[a.action] };
    default:
      return { ok: false, error: 'alat tidak dikenal' };
  }
}

// ---------- Streaming satu putaran ----------
function streamOnce(messages, onText) {
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2, 10);
    let text = '';
    const calls = [];
    let settled = false;
    const off = window.api.onAiEvent((ev) => {
      if (!ev || ev.id !== id || settled) return;
      if (ev.kind === 'text') { text += ev.text; onText(text); }
      else if (ev.kind === 'tool') mergeToolCalls(calls, ev.calls);
      else if (ev.kind === 'error') { settled = true; off(); pending = null; resolve({ text, calls: [], error: ev.message }); }
      else if (ev.kind === 'done') { settled = true; off(); pending = null; resolve({ text, calls: calls.filter((c) => c.function && c.function.name), error: null }); }
    });
    // Pembatalan langsung menyelesaikan permintaan di sisi renderer, tidak menunggu balasan main process
    pending = { id, stop: () => { if (settled) return; settled = true; off(); pending = null; resolve({ text, calls: [], error: null }); } };
    window.api.aiChat({ id, messages, tools: TOOLS, model: cfg().model });
  });
}

// ---------- Tampilan ----------
export function renderAi(c) {
  island.dataset.sub = 'ai';
  c.innerHTML = `
    <div class="view ai">
      <header class="ai-top">
        <span class="ai-orb" id="ai-orb"><i></i></span>
        <div class="ai-tt"><b>Asisten</b><small id="ai-sub">Ringan · Groq</small></div>
        <button class="ai-ib" id="ai-clear" aria-label="Hapus percakapan" title="Hapus percakapan">${svg(I.trash)}</button>
      </header>
      <div class="ai-nokey" id="ai-nokey" hidden>
        <p>Asisten butuh kunci API Groq. Tambahkan di Pengaturan, dan kunci disimpan terenkripsi di perangkat ini.</p>
        <button class="ai-go" id="ai-gear">${svg(I.gear)}Buka Pengaturan AI</button>
      </div>
      <div class="ai-log" id="ai-log"></div>
      <div class="ai-quick" id="ai-quick"></div>
      <form class="ai-bar" id="ai-form" autocomplete="off">
        <input id="ai-in" type="text" maxlength="800" placeholder="Tanya yang ringan-ringan...">
        <button class="ai-send" id="ai-send" type="submit" aria-label="Kirim">${svg(I.send)}</button>
      </form>
    </div>`;
  const q = (s) => c.querySelector(s);
  const root = q('.ai'), log = q('#ai-log'), input = q('#ai-in'), send = q('#ai-send'), quick = q('#ai-quick');

  function paintQuick() {
    quick.innerHTML = Object.entries(QUICK).map(([k, v]) => `<button class="ai-chip" data-q="${k}">${v.label}</button>`).join('');
  }
  function bubble(role, text) {
    const d = document.createElement('div');
    d.className = `am ${role}`;
    d.innerHTML = `<div class="am-b"></div>`;
    d.querySelector('.am-b').textContent = text;
    log.append(d);
    log.scrollTop = log.scrollHeight;
    return d;
  }
  function typing() {
    const d = document.createElement('div');
    d.className = 'am bot typing';
    d.innerHTML = '<div class="am-b"><span></span><span></span><span></span></div>';
    log.append(d);
    log.scrollTop = log.scrollHeight;
    return d;
  }
  function toolChip(res, name) {
    const d = document.createElement('div');
    d.className = `ai-tool ${res.ok ? 'ok' : 'err'}`;
    d.innerHTML = `${svg(res.ok ? I.ok : I.err)}<span></span>`;
    d.querySelector('span').textContent = res.ok ? res.text : `Gagal: ${res.error}`;
    log.append(d);
    log.scrollTop = log.scrollHeight;
  }

  function restore() {
    log.innerHTML = '';
    const shown = history.filter((m) => m.role === 'user' || (m.role === 'assistant' && m.content));
    if (!shown.length) {
      const g = document.createElement('div');
      g.className = 'ai-hello';
      g.innerHTML = `<b>Halo</b><span>Tanya hal ringan, atau minta tolong kecil. Contoh:</span>`;
      const row = document.createElement('div');
      row.className = 'ai-starters';
      row.innerHTML = STARTERS.map((s) => `<button class="ai-chip" data-s="${esc(s)}">${esc(s)}</button>`).join('');
      g.append(row);
      log.append(g);
    }
    for (const m of shown) bubble(m.role === 'user' ? 'me' : 'bot', m.shown || m.content);
  }

  function setBusy(v) {
    busy = v;
    root.classList.toggle('busy', v);
    send.innerHTML = svg(v ? I.stop : I.send);
    send.setAttribute('aria-label', v ? 'Berhenti' : 'Kirim');
  }

  async function ask(apiText, shown) {
    if (busy) return;
    if (!hasKey) { q('#ai-nokey').hidden = false; return; }
    const g = log.querySelector('.ai-hello'); if (g) g.remove();
    setBusy(true);
    history.push({ role: 'user', content: apiText, shown });
    bubble('me', shown);
    for (let turn = 0; turn < 3; turn++) {
      const ctx = await buildContext();
      const apiMsgs = history.map(({ role, content, tool_calls, tool_call_id }) => {
        const m = { role, content: content ?? null };
        if (tool_calls) m.tool_calls = tool_calls;
        if (tool_call_id) m.tool_call_id = tool_call_id;
        return m;
      });
      const msgs = buildMessages(apiMsgs, ctx, cfg().limit * 2);
      const wait = typing();
      let botEl = null;
      const r = await streamOnce(msgs, (t) => {
        if (!botEl) { wait.remove(); botEl = bubble('bot', ''); }
        botEl.querySelector('.am-b').textContent = t;
        log.scrollTop = log.scrollHeight;
      });
      if (!botEl) wait.remove();
      if (r.error) {
        if (!botEl) botEl = bubble('bot', '');
        botEl.classList.add('err');
        botEl.querySelector('.am-b').textContent = r.error;
        break;
      }
      if (r.calls.length) {
        history.push({ role: 'assistant', content: r.text || null, tool_calls: r.calls });
        if (!r.text && botEl) botEl.remove();
        for (const call of r.calls) {
          const res = runTool(call);
          toolChip(res, call.function.name);
          history.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(res) });
        }
        continue; // kirim hasil alat ke model untuk jawaban akhir
      }
      history.push({ role: 'assistant', content: r.text || '(tidak ada jawaban)' });
      if (!botEl) bubble('bot', r.text || '(tidak ada jawaban)');
      break;
    }
    saveHistory();
    setBusy(false);
  }

  // Aksi clipboard: baca hanya saat tombol diklik
  async function quickAction(key) {
    const clip = (await window.api.aiClipboard()) || '';
    if (!clip.trim()) { flash('Clipboard kosong. Salin teks dulu.'); return; }
    const spec = QUICK[key];
    const preview = clip.trim().replace(/\s+/g, ' ').slice(0, 36);
    ask(spec.prompt(clip), `${spec.label}: "${preview}${clip.trim().length > 36 ? '…' : ''}"`);
  }
  let flashT = 0;
  function flash(t) {
    let el = root.querySelector('.ai-flash');
    if (!el) { el = document.createElement('div'); el.className = 'ai-flash'; root.append(el); }
    el.textContent = t; el.hidden = false;
    clearTimeout(flashT); flashT = setTimeout(() => { el.hidden = true; }, 2600);
  }

  // Peristiwa
  q('#ai-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (busy) return; // Enter saat menunggu jawaban tidak membatalkan
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    ask(text, text);
  });
  send.addEventListener('click', (e) => {
    if (busy) { e.preventDefault(); if (pending) { window.api.aiCancel(pending.id); pending.stop(); } }
  });
  log.addEventListener('click', (e) => {
    const s = e.target.closest('[data-s]');
    if (s) { ask(s.dataset.s, s.dataset.s); }
  });
  quick.addEventListener('click', (e) => {
    const b = e.target.closest('[data-q]');
    if (b) quickAction(b.dataset.q);
  });
  q('#ai-clear').addEventListener('click', () => {
    if (busy) return;
    history = [];
    saveHistory();
    restore();
  });
  q('#ai-gear').addEventListener('click', () => window.api.openSettings('ai'));

  const api = { refresh };
  active = api;
  function refresh() {
    if (!root.isConnected) return;
    q('#ai-nokey').hidden = hasKey;
    q('#ai-sub').textContent = `${MODELS[cfg().model] ? MODELS[cfg().model].label : 'Ringan'} · Groq`;
  }
  paintQuick();
  loadHistory();
  restore();
  refresh();
  window.api.aiHasKey().then((v) => { hasKey = !!v; refresh(); });
  window.api.getSettings().then((s) => { S = s; refresh(); });
}

// Pengaturan dan perubahan kunci dari window lain
window.api.onSettings((s) => { S = s; if (active) active.refresh(); });
