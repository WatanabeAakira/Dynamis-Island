// AI (Groq) di sisi main process: kunci API disimpan terenkripsi (safeStorage), dan permintaan streaming diteruskan ke renderer.
const { net, safeStorage, app, clipboard } = require('electron');
const fs = require('fs');
const path = require('path');

const URL_CHAT = 'https://api.groq.com/openai/v1/chat/completions';
const keyFile = () => path.join(app.getPath('userData'), 'ai-key.bin');
const running = new Map(); // id -> AbortController

function getKey() {
  try {
    if (!fs.existsSync(keyFile()) || !safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(fs.readFileSync(keyFile()));
  } catch { return null; }
}
function setKey(key) {
  const k = String(key || '').trim();
  if (!k) return { ok: false, error: 'Kunci kosong' };
  if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: 'Penyimpanan aman Windows tidak tersedia, kunci tidak disimpan' };
  try {
    fs.writeFileSync(keyFile(), safeStorage.encryptString(k));
    return { ok: true };
  } catch { return { ok: false, error: 'Gagal menyimpan kunci' }; }
}
function clearKey() { try { fs.unlinkSync(keyFile()); } catch {} return true; }
const hasKey = () => !!getKey();

const HUMAN = {
  401: 'Kunci API tidak valid. Periksa kembali di Pengaturan.',
  403: 'Akses ditolak untuk kunci ini.',
  429: 'Batas pemakaian tercapai. Coba lagi sebentar lagi.',
  400: 'Permintaan ditolak oleh layanan. Coba kalimat lain.'
};

// Membaca stream SSE (baris "data: {...}") dan mengembalikan objek JSON per event
function makeSSEParser(onEvent) {
  let buf = '';
  return (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') { onEvent({ done: true }); continue; }
      try { onEvent(JSON.parse(data)); } catch {}
    }
  };
}

async function chat(sender, { id, messages, tools, model }) {
  const key = getKey();
  if (!key) { send(sender, id, { kind: 'error', message: 'Kunci API Groq belum diatur di Pengaturan.' }); return; }
  const ctrl = new AbortController();
  running.set(id, ctrl);
  const body = { model, messages, stream: true, temperature: 0.6, max_tokens: 700 };
  if (Array.isArray(tools) && tools.length) body.tools = tools;
  let finish = null;
  try {
    const res = await net.fetch(URL_CHAT, {
      method: 'POST', signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).error?.message || ''; } catch {}
      send(sender, id, { kind: 'error', message: HUMAN[res.status] || `Layanan AI gagal (${res.status})${detail ? ': ' + detail : ''}` });
      return;
    }
    const parse = makeSSEParser((ev) => {
      if (ev.done) return;
      if (ev.error) { send(sender, id, { kind: 'error', message: ev.error.message || 'Terjadi kesalahan' }); return; }
      const c = ev.choices && ev.choices[0];
      if (!c) return;
      const d = c.delta || {};
      if (d.content) send(sender, id, { kind: 'text', text: d.content });
      if (Array.isArray(d.tool_calls) && d.tool_calls.length) send(sender, id, { kind: 'tool', calls: d.tool_calls });
      if (c.finish_reason) finish = c.finish_reason;
    });
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      parse(dec.decode(value, { stream: true }));
    }
    send(sender, id, { kind: 'done', finish: finish || 'stop' });
  } catch (e) {
    if (e && e.name === 'AbortError') send(sender, id, { kind: 'done', finish: 'cancel' });
    else send(sender, id, { kind: 'error', message: 'Tidak bisa terhubung ke layanan AI. Periksa koneksi internet.' });
  } finally {
    running.delete(id);
  }
}

function send(sender, id, payload) {
  if (sender && !sender.isDestroyed()) sender.send('ai:event', { id, ...payload });
}

function register(ipcMain) {
  ipcMain.handle('ai:has-key', () => hasKey());
  ipcMain.handle('ai:set-key', (_e, key) => setKey(key));
  ipcMain.handle('ai:clear-key', () => clearKey());
  ipcMain.handle('ai:clipboard', () => { try { return clipboard.readText().slice(0, 4000); } catch { return ''; } });
  ipcMain.on('ai:chat', (e, req) => { if (req && req.id) chat(e.sender, req); });
  ipcMain.on('ai:cancel', (_e, id) => { const c = running.get(id); if (c) c.abort(); });
}

module.exports = { register, makeSSEParser, hasKey };
