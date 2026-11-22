const groq = require('./translation-providers/groq.cjs');
const { BY_CODE, normalizeLanguage } = require('./translate-languages.cjs');

const MAX_TRANSLATION_CHARACTERS = 10000;
const REQUEST_TIMEOUT_MS = 45_000;
const PROVIDERS = Object.freeze({ groq });
const running = new Map();

function characterCount(text) {
  return Array.from(String(text || '')).length;
}

function validateRequest(request) {
  if (!request || typeof request !== 'object') return { ok: false, error: 'Translation request is invalid.' };
  if (typeof request.id !== 'string' || !/^[\w-]{1,64}$/.test(request.id)) return { ok: false, error: 'Translation request ID is invalid.' };
  if (typeof request.text !== 'string' || !request.text.trim()) return { ok: false, error: 'Enter text to translate.' };
  const count = characterCount(request.text);
  if (count > MAX_TRANSLATION_CHARACTERS) return { ok: false, error: `Text is too long (${count.toLocaleString()} characters). Limit: ${MAX_TRANSLATION_CHARACTERS.toLocaleString()}. Nothing was cut off.` };

  const sourceLanguage = normalizeLanguage(request.sourceLanguage || 'auto');
  const targetLanguage = normalizeLanguage(request.targetLanguage);
  if (!sourceLanguage) return { ok: false, error: 'Choose a supported source language or Auto-detect.' };
  if (!targetLanguage || !BY_CODE[targetLanguage]) return { ok: false, error: 'Choose a supported target language.' };
  const provider = typeof request.provider === 'string' ? request.provider : 'groq';
  if (!PROVIDERS[provider]) return { ok: false, error: 'The selected translation provider is not available.' };
  return { ok: true, value: { id: request.id, text: request.text, sourceLanguage, targetLanguage, provider, count } };
}

function register(ipcMain, { getApiKey }) {
  ipcMain.on('translate:request', (event, request) => {
    void runTranslation(event.sender, request, getApiKey);
  });
  ipcMain.on('translate:cancel', (event, id) => {
    if (typeof id !== 'string') return;
    running.get(requestKey(event.sender, id))?.controller.abort('cancelled');
  });
}

async function runTranslation(sender, request, getApiKey) {
  const checked = validateRequest(request);
  if (!checked.ok) {
    send(sender, request?.id, { kind: 'error', message: checked.error, status: 'Translation Failed' });
    return;
  }

  const { id, text, sourceLanguage, targetLanguage, provider: providerName, count } = checked.value;
  const key = requestKey(sender, id);
  running.get(key)?.controller.abort('replaced');

  const provider = PROVIDERS[providerName];
  if (sourceLanguage === targetLanguage) {
    send(sender, id, {
      kind: 'done', status: 'Translation Completed', text, translation: text,
      sourceLanguage, targetLanguage, sourceLanguageAmbiguous: false, alreadyTargetLanguage: true
    });
    return;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    send(sender, id, { kind: 'error', status: 'Translation Failed', message: 'Groq API key is missing. Add one in Settings → AI.' });
    return;
  }

  const controller = new AbortController();
  const state = { controller, sender, timeout: null, timedOut: false };
  state.timeout = setTimeout(() => { state.timedOut = true; controller.abort('timeout'); }, REQUEST_TIMEOUT_MS);
  running.set(key, state);
  send(sender, id, { kind: 'status', status: 'Translating Text', characterCount: count });

  try {
    const result = await provider.translate({
      text,
      sourceLanguage,
      targetLanguage,
      apiKey,
      signal: controller.signal
    });
    if (controller.signal.aborted) return;
    const detectedLanguage = sourceLanguage === 'auto'
      ? normalizeLanguage(result.detectedLanguage) || 'und'
      : sourceLanguage;
    send(sender, id, {
      kind: 'done',
      status: 'Translation Completed',
      text,
      translation: result.translation,
      sourceLanguage: detectedLanguage,
      targetLanguage,
      sourceLanguageAmbiguous: result.sourceLanguageAmbiguous || detectedLanguage === 'und',
      provider: providerName
    });
  } catch (error) {
    if (controller.signal.aborted && !state.timedOut) return;
    let message = error?.message || 'Translation failed.';
    if (state.timedOut || error?.name === 'AbortError') message = 'Translation timed out. Try again or use shorter text.';
    else if (error instanceof TypeError) message = 'Network unavailable. Check your internet connection and retry.';
    send(sender, id, { kind: 'error', status: state.timedOut ? 'Translation Timed Out' : 'Translation Failed', message });
  } finally {
    clearTimeout(state.timeout);
    if (running.get(key) === state) running.delete(key);
  }
}

function requestKey(sender, id) {
  return `${sender?.id ?? 'destroyed'}:${String(id || '')}`;
}

function send(sender, id, payload) {
  if (sender && !sender.isDestroyed()) sender.send('translate:event', { id, ...payload });
}

module.exports = {
  MAX_TRANSLATION_CHARACTERS,
  REQUEST_TIMEOUT_MS,
  characterCount,
  validateRequest,
  runTranslation,
  register
};
