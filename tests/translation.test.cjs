const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { LANGUAGES, normalizeLanguage, resolveSystemLanguage } = require('../src/translate-languages.cjs');
const translation = require('../src/translate-main.js');
const groq = require('../src/translation-providers/groq.cjs');

test('sandboxed preload only requires Electron and fetches language data over IPC', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');
  const imports = [...source.matchAll(/\brequire\s*\(\s*(['"])(.*?)\1\s*\)/g)].map((match) => match[2]);
  assert.deepEqual(imports, ['electron']);
  assert.match(source, /translateDefaults:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('translate:defaults'\)/);
});

test('advertised language codes are unique and normalize locale tags', () => {
  const codes = LANGUAGES.map((language) => language.code);
  assert.equal(new Set(codes).size, codes.length);
  assert.ok(codes.includes('id') && codes.includes('ja') && codes.includes('ko') && codes.includes('zh'));
  assert.equal(normalizeLanguage('pt-BR'), 'pt');
  assert.equal(normalizeLanguage('auto'), 'auto');
  assert.equal(normalizeLanguage('xx-ZZ'), '');
  assert.equal(resolveSystemLanguage('fr-CA'), 'fr');
  assert.equal(resolveSystemLanguage('xx-YY'), 'id');
});

test('translation request validation keeps Unicode intact and rejects truncation cases', () => {
  const valid = translation.validateRequest({
    id: 'req-1', text: 'こんにちは\nCafé 😀', sourceLanguage: 'auto', targetLanguage: 'id'
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.value.count, 12);
  assert.equal(valid.value.text, 'こんにちは\nCafé 😀');
  assert.equal(translation.validateRequest({ id: 'bad', text: 'x', sourceLanguage: 'auto', targetLanguage: 'xx' }).ok, false);
  assert.equal(translation.characterCount('😀'), 1);
  assert.equal(translation.validateRequest({
    id: 'long', text: '😀'.repeat(10001), sourceLanguage: 'auto', targetLanguage: 'id'
  }).ok, false);
});

test('Groq adapter sends secret only in authorization header and validates structured result', async () => {
  let request;
  const result = await groq.translate({
    text: 'Good morning.\nSee https://example.com', sourceLanguage: 'auto', targetLanguage: 'id', apiKey: 'test-secret',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ translation: 'Selamat pagi.\nLihat https://example.com', detectedLanguage: 'en', sourceLanguageAmbiguous: false }) } }] }) };
    }
  });
  assert.equal(request.url, groq.ENDPOINT);
  assert.equal(request.options.headers.Authorization, 'Bearer test-secret');
  assert.equal(request.options.body.includes('test-secret'), false);
  const body = JSON.parse(request.options.body);
  assert.equal(body.model, groq.MODEL);
  assert.equal(body.response_format.type, 'json_schema');
  assert.deepEqual(result, { translation: 'Selamat pagi.\nLihat https://example.com', detectedLanguage: 'en', sourceLanguageAmbiguous: false });
});

test('Groq adapter maps provider failures and rejects malformed/empty content', async () => {
  await assert.rejects(() => groq.translate({ fetchImpl: async () => ({ ok: false, status: 429 }) }), /rate limit/i);
  await assert.rejects(() => groq.translate({ fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'not json' } }] }) }) }), /malformed/i);
  await assert.rejects(() => groq.translate({ fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"translation":" "}' } }] }) }) }), /empty translation/i);
  assert.match(groq.statusMessage(401), /API key/i);
});

test('main process returns provider result and never loses original text', async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer test-key');
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ translation: 'Halo', detectedLanguage: 'en', sourceLanguageAmbiguous: false }) } }] }) };
  };
  const events = [];
  const sender = { id: 4, isDestroyed: () => false, send: (_channel, event) => events.push(event) };
  try {
    await translation.runTranslation(sender, { id: 'main-1', text: 'Hello', sourceLanguage: 'auto', targetLanguage: 'id' }, () => 'test-key');
  } finally { globalThis.fetch = oldFetch; }
  assert.equal(events.at(-1).kind, 'done');
  assert.equal(events.at(-1).text, 'Hello');
  assert.equal(events.at(-1).translation, 'Halo');
  assert.equal(events.at(-1).sourceLanguage, 'en');
});

test('same source and target is returned without making a provider request', async () => {
  const events = [];
  const sender = { id: 5, isDestroyed: () => false, send: (_channel, event) => events.push(event) };
  await translation.runTranslation(sender, { id: 'same', text: 'Halo', sourceLanguage: 'id', targetLanguage: 'id' }, () => 'key');
  assert.equal(events[0].alreadyTargetLanguage, true);
  assert.equal(events[0].translation, 'Halo');
});

test('network failures produce retryable errors and retain the original input', async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
  const events = [];
  const sender = { id: 6, isDestroyed: () => false, send: (_channel, event) => events.push(event) };
  try {
    await translation.runTranslation(sender, { id: 'offline', text: 'Keep this text', sourceLanguage: 'auto', targetLanguage: 'id' }, () => 'test-key');
  } finally { globalThis.fetch = oldFetch; }
  assert.equal(events.at(-1).kind, 'error');
  assert.match(events.at(-1).message, /Network unavailable/i);
  assert.equal(events.at(-1).text, undefined);
});

test('cancel IPC aborts the in-flight provider call without a stale completion', async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
  });
  const events = [];
  const sender = { id: 7, isDestroyed: () => false, send: (_channel, event) => events.push(event) };
  const listeners = new Map();
  const ipc = { on: (name, fn) => listeners.set(name, fn) };
  try {
    translation.register(ipc, { getApiKey: () => 'test-key' });
    listeners.get('translate:request')({ sender }, { id: 'cancel-me', text: 'Hello', sourceLanguage: 'auto', targetLanguage: 'id' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(events.some((event) => event.kind === 'status'));
    listeners.get('translate:cancel')({ sender }, 'cancel-me');
    await new Promise((resolve) => setImmediate(resolve));
  } finally { globalThis.fetch = oldFetch; }
  assert.equal(events.some((event) => event.kind === 'done' || event.kind === 'error'), false);
});
