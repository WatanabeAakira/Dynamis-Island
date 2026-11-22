let LANGUAGES = [];
let LANGUAGE_BY_CODE = new Map();
const languageDefaults = window.api.translateDefaults().then((defaults) => {
  LANGUAGES = defaults?.languages || [];
  LANGUAGE_BY_CODE = new Map(LANGUAGES.map((item) => [item.code, item]));
  return defaults;
}).catch(() => null);
const MAX_TRANSLATION_CHARACTERS = 10000;
const ICONS = {
  translate: '<path d="M4 6h11M9.5 4v2m4 0c-.6 3.8-3.7 6.7-7.5 8m1-5c1 2 2.8 3.7 5 4.7M14 20l3.5-8 3.5 8m-5.8-2.8h4.6"/><path d="M17 4l3 3m0-3-3 3"/>',
  paste: '<path d="M8 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2M8 5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v2H8zM13 12h8m-4-4 4 4-4 4"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  area: '<path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3M8 12h8m-4-4v8"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  swap: '<path d="M7 7h13l-3-3m3 3-3 3M17 17H4l3 3m-3-3 3-3"/>',
  clear: '<path d="m6 6 12 12M18 6 6 18"/>',
  send: '<path d="M4 12l16-8-5 17-3-7zM12 14l8-10"/>'
};

let state = {
  original: '', translated: '', sourceLanguage: 'auto', targetLanguage: '',
  detectedLanguage: '', ambiguous: false, status: 'Ready to Translate', error: '',
  processing: false, provider: 'auto', providerUsed: '', autoTranslate: true, autoDetect: true
};
let requestSequence = 0;
let activeRequestId = '';
let pendingTimer = 0;
let lastSignature = '';
let offTranslate = null;
let helperHandler = null;
let settingsHandler = null;
let systemTarget = 'id';

const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
const countChars = (text) => Array.from(text).length;
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

export function renderTranslate(container, settings) {
  const cfg = settings.translation || {};
  state.sourceLanguage = cfg.autoDetect === false ? (cfg.sourceLanguage || 'en') : 'auto';
  state.targetLanguage = cfg.targetLanguage || systemTarget;
  state.autoDetect = cfg.autoDetect !== false;
  state.autoTranslate = cfg.autoTranslate !== false;
  state.provider = cfg.provider || 'auto';

  container.innerHTML = `
    <div class="view translate-view">
      <header class="translate-heading">
        <span class="translate-icon">${icon('translate')}</span>
        <span><b>Translate Anything</b><small>Side by side, right in your notch. It finds the language for you.</small></span>
      </header>
      <div class="translate-languagebar">
        <label class="translate-lang-select"><span>From</span><select id="translateSource"></select></label>
        <button class="translate-swap" id="translateSwap" type="button" title="Swap languages" aria-label="Swap languages">${icon('swap')}</button>
        <label class="translate-lang-select"><span>To</span><select id="translateTarget"></select></label>
      </div>
      <div class="translate-panels">
        <section class="translate-panel source-panel">
          <header><span><b>Original text</b><small id="translateDetected">Auto-detect</small></span><button id="translateClear" class="translate-icon-btn" type="button" title="Clear text" aria-label="Clear text">${icon('clear')}</button></header>
          <textarea id="translateInput" spellcheck="true" placeholder="Type or paste text here…"></textarea>
          <footer>
            <div class="translate-tools">
              <button type="button" id="translatePaste" title="Paste from clipboard">${icon('paste')}</button>
              <button type="button" id="translateImage" title="Import image">${icon('image')}</button>
              <button type="button" id="translateArea" title="Select screen area">${icon('area')}</button>
            </div>
            <span class="translate-counter" id="translateCounter">0 / ${MAX_TRANSLATION_CHARACTERS.toLocaleString()}</span>
          </footer>
        </section>
        <section class="translate-panel result-panel">
          <header><span><b>Translation</b><small id="translateTargetLabel"></small></span><button id="translateCopy" class="translate-icon-btn" type="button" title="Copy translation" aria-label="Copy translation" disabled>${icon('copy')}</button></header>
          <div class="translate-output" id="translateOutput" aria-live="polite" tabindex="0"></div>
          <footer><button id="translateManual" class="translate-manual" type="button">${icon('send')}Translate now</button><span class="translate-status" id="translateStatus" role="status">Ready to Translate</span></footer>
        </section>
      </div>
      <div class="translate-error" id="translateError" role="alert" hidden></div>
      <div class="translate-note">OCR stays local. Text goes to Groq if its key is set; otherwise it uses MyMemory (free daily quota).</div>
    </div>`;

  const source = container.querySelector('#translateSource');
  const target = container.querySelector('#translateTarget');
  const input = container.querySelector('#translateInput');
  const output = container.querySelector('#translateOutput');
  fillLanguages(source, true);
  fillLanguages(target, false);
  source.value = state.sourceLanguage;
  target.value = state.targetLanguage;
  updateView(container);
  languageDefaults.then((defaults) => {
    if (!defaults || !container.querySelector('.translate-view')) return;
    systemTarget = resolveSystemLanguage(defaults.systemLanguage || navigator.language);
    if (!cfg.targetLanguage) state.targetLanguage = systemTarget;
    fillLanguages(source, true);
    fillLanguages(target, false);
    source.value = state.sourceLanguage;
    target.value = state.targetLanguage;
    updateView(container);
  });

  source.addEventListener('change', () => {
    state.sourceLanguage = source.value;
    state.autoDetect = source.value === 'auto';
    void saveSettings();
    scheduleTranslation(false);
  });
  target.addEventListener('change', () => {
    state.targetLanguage = target.value;
    void saveSettings();
    scheduleTranslation(false);
  });
  container.querySelector('#translateSwap').addEventListener('click', () => {
    const detected = state.sourceLanguage === 'auto' ? state.detectedLanguage : state.sourceLanguage;
    if (!detected || !LANGUAGE_BY_CODE.has(detected)) return;
    state.sourceLanguage = state.targetLanguage;
    state.autoDetect = false;
    state.targetLanguage = detected;
    source.value = state.sourceLanguage;
    target.value = state.targetLanguage;
    void saveSettings();
    scheduleTranslation(false);
  });
  input.value = state.original;
  input.addEventListener('input', () => {
    state.original = input.value;
    state.error = '';
    state.detectedLanguage = '';
    state.ambiguous = false;
    updateView(container);
    scheduleTranslation(false);
  });
  container.querySelector('#translateClear').addEventListener('click', () => {
    state.original = '';
    state.translated = '';
    state.error = '';
    state.detectedLanguage = '';
    state.status = 'Ready to Translate';
    input.value = '';
    cancelActiveRequest();
    lastSignature = '';
    updateView(container);
    input.focus();
  });
  container.querySelector('#translatePaste').addEventListener('click', async () => {
    const result = await window.api.translateClipboard();
    if (!result?.ok) { state.error = result?.error || 'Clipboard could not be read.'; updateView(container); return; }
    if (!result.text.trim()) { state.error = 'Clipboard is empty.'; updateView(container); return; }
    input.value = result.text;
    state.original = result.text;
    state.error = '';
    state.detectedLanguage = '';
    state.ambiguous = false;
    updateView(container);
    scheduleTranslation(false);
  });
  container.querySelector('#translateImage').addEventListener('click', async () => {
    state.error = '';
    state.status = 'Choose an image';
    updateView(container);
    const result = await window.api.translatePickImage();
    if (!result?.ok && !result?.cancelled) { state.error = result?.error || 'Image could not be opened.'; state.status = 'Translation Failed'; updateView(container); }
  });
  container.querySelector('#translateArea').addEventListener('click', () => {
    state.error = '';
    state.status = 'Select an Area';
    updateView(container);
    window.api.helperSend({ cmd: 'translate-start' });
  });
  container.querySelector('#translateManual').addEventListener('click', () => scheduleTranslation(true));
  container.querySelector('#translateCopy').addEventListener('click', async () => {
    if (!state.translated) return;
    const result = await window.api.translateCopy(state.translated);
    state.status = result?.ok ? 'Translation copied' : 'Copy failed';
    updateView(container);
  });

  if (offTranslate) offTranslate();
  offTranslate = window.api.onTranslate((event) => handleTranslationEvent(container, event));
  if (helperHandler) window.removeEventListener('translate:helper', helperHandler);
  helperHandler = (event) => handleHelperEvent(container, event.detail);
  window.addEventListener('translate:helper', helperHandler);
  if (settingsHandler) window.removeEventListener('island:settings', settingsHandler);
  settingsHandler = (event) => {
    const next = event.detail?.translation || {};
    const nextSource = next.autoDetect === false ? (next.sourceLanguage || 'en') : 'auto';
    const nextTarget = next.targetLanguage || systemTarget;
    const changed = state.sourceLanguage !== nextSource || state.targetLanguage !== nextTarget;
    state.sourceLanguage = nextSource;
    state.targetLanguage = nextTarget;
    state.autoDetect = next.autoDetect !== false;
    state.autoTranslate = next.autoTranslate !== false;
    state.provider = next.provider || 'auto';
    updateView(container);
    if (changed) scheduleTranslation(false);
  };
  window.addEventListener('island:settings', settingsHandler);
}

function fillLanguages(select, source) {
  const options = source ? [['auto', 'Auto-detect', 'Auto-detect'], ...LANGUAGES.map((x) => [x.code, x.name, x.native])] : LANGUAGES.map((x) => [x.code, x.name, x.native]);
  select.innerHTML = options.map(([code, name, native]) => `<option value="${code}">${escapeHtml(name)} · ${escapeHtml(native)}</option>`).join('');
}

function handleHelperEvent(container, message) {
  if (!message) return;
  if (message.type === 'translate-status') {
    state.status = message.status || state.status;
    state.error = message.error || '';
    state.processing = !!message.processing;
    updateView(container);
  }
  if (message.type === 'translate-input' && typeof message.text === 'string') {
    const input = container.querySelector('#translateInput');
    state.original = message.text;
    state.sourceLanguage = 'auto';
    state.autoDetect = true;
    state.detectedLanguage = '';
    state.ambiguous = false;
    if (input) input.value = message.text;
    state.error = '';
    updateView(container);
    void saveSettings();
    scheduleTranslation(false);
  }
}

function handleTranslationEvent(container, event) {
  if (!event || event.id !== activeRequestId) return;
  if (event.kind === 'status') {
    state.status = event.status || 'Translating Text';
    state.processing = true;
  } else if (event.kind === 'error') {
    state.status = event.status || 'Translation Failed';
    state.error = event.message || 'Translation failed.';
    state.processing = false;
    activeRequestId = '';
  } else if (event.kind === 'done') {
    state.translated = String(event.translation || '');
    state.detectedLanguage = event.sourceLanguage || '';
    state.ambiguous = !!event.sourceLanguageAmbiguous;
    state.providerUsed = event.provider || '';
    state.status = event.alreadyTargetLanguage ? 'Already in target language' : event.provider === 'mymemory' ? 'Translated with MyMemory' : 'Translated with Groq';
    state.error = state.ambiguous ? 'Source language may be ambiguous. Choose it manually if the result looks wrong.' : '';
    state.processing = false;
    activeRequestId = '';
  } else return;
  updateView(container);
}

function scheduleTranslation(manual) {
  clearTimeout(pendingTimer);
  state.error = '';
  if (countChars(state.original) > MAX_TRANSLATION_CHARACTERS) {
    cancelActiveRequest();
    state.processing = false;
    state.status = 'Text is too long';
    state.error = `Limit is ${MAX_TRANSLATION_CHARACTERS.toLocaleString()} characters. Text has not been shortened.`;
    updateCurrentView();
    return;
  }
  if (!state.original.trim()) {
    cancelActiveRequest();
    state.translated = '';
    state.status = 'Ready to Translate';
    state.processing = false;
    updateCurrentView();
    return;
  }
  cancelActiveRequest();
  if (!manual && !state.autoTranslate) {
    state.translated = '';
    state.detectedLanguage = '';
    state.ambiguous = false;
    state.processing = false;
    state.status = 'Ready to Translate';
    lastSignature = '';
    updateCurrentView();
    return;
  }
  const signature = [state.original, state.sourceLanguage, state.targetLanguage, state.provider].join('\u0000');
  if (signature === lastSignature && state.translated) return;
  state.translated = '';
  state.processing = true;
  state.status = state.sourceLanguage === 'auto' ? 'Detecting Language' : 'Translating Text';
  updateCurrentView();
  pendingTimer = setTimeout(() => sendTranslation(signature), manual ? 0 : 500);
}

function sendTranslation(signature) {
  const id = `${Date.now().toString(36)}-${(++requestSequence).toString(36)}`;
  activeRequestId = id;
  lastSignature = signature;
  state.status = 'Translating Text';
  updateCurrentView();
  window.api.translate({
    id,
    text: state.original,
    sourceLanguage: state.sourceLanguage,
    targetLanguage: state.targetLanguage,
    provider: state.provider
  });
}

function cancelActiveRequest() {
  if (activeRequestId) window.api.translateCancel(activeRequestId);
  activeRequestId = '';
}

async function saveSettings() {
  const current = await window.api.getSettings();
  await window.api.setSettings({
    translation: {
      ...(current.translation || {}),
      sourceLanguage: state.autoDetect ? 'auto' : state.sourceLanguage,
      targetLanguage: state.targetLanguage === systemTarget ? '' : state.targetLanguage,
      autoDetect: state.autoDetect,
      autoTranslate: state.autoTranslate,
      provider: state.provider
    }
  });
}

function updateCurrentView() {
  const container = document.querySelector('#content');
  if (container?.querySelector('.translate-view')) updateView(container);
}

function updateView(container) {
  const input = container.querySelector('#translateInput');
  const sourceSelect = container.querySelector('#translateSource');
  const targetSelect = container.querySelector('#translateTarget');
  const output = container.querySelector('#translateOutput');
  const counter = container.querySelector('#translateCounter');
  const status = container.querySelector('#translateStatus');
  const error = container.querySelector('#translateError');
  const copy = container.querySelector('#translateCopy');
  if (input && input.value !== state.original) input.value = state.original;
  if (sourceSelect && sourceSelect.value !== state.sourceLanguage) sourceSelect.value = state.sourceLanguage;
  if (targetSelect && targetSelect.value !== state.targetLanguage) targetSelect.value = state.targetLanguage;
  if (output) {
    output.textContent = state.translated;
    output.classList.toggle('empty', !state.translated);
    if (!state.translated) output.textContent = state.processing ? 'Translating…' : 'Your translation will appear here.';
  }
  if (counter) {
    const count = countChars(state.original);
    counter.textContent = `${count.toLocaleString()} / ${MAX_TRANSLATION_CHARACTERS.toLocaleString()}`;
    counter.classList.toggle('over-limit', count > MAX_TRANSLATION_CHARACTERS);
  }
  const detected = container.querySelector('#translateDetected');
  if (detected) {
    const language = LANGUAGE_BY_CODE.get(state.detectedLanguage);
    detected.textContent = state.sourceLanguage === 'auto'
      ? language ? `Detected · ${language.name}` : 'Auto-detect'
      : LANGUAGE_BY_CODE.get(state.sourceLanguage)?.name || 'Choose source language';
  }
  const targetLabel = container.querySelector('#translateTargetLabel');
  if (targetLabel) targetLabel.textContent = LANGUAGE_BY_CODE.get(state.targetLanguage)?.name || '';
  if (status) status.textContent = state.status;
  if (error) { error.textContent = state.error; error.hidden = !state.error; }
  if (copy) copy.disabled = !state.translated;
  container.querySelector('#translateManual')?.toggleAttribute('disabled', state.processing || !state.original.trim() || countChars(state.original) > MAX_TRANSLATION_CHARACTERS);
  container.querySelector('.translate-view')?.classList.toggle('processing', state.processing);
  container.querySelector('.translate-view')?.classList.toggle('has-result', !!state.translated);
}

function resolveSystemLanguage(locale) {
  const code = String(locale || '').toLowerCase().split(/[-_]/)[0];
  return LANGUAGE_BY_CODE.has(code) ? code : 'id';
}
