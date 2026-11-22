let unsubscribe = null;
let activeStatus = 'Ready to Extract Text';
let activeProcessing = false;
let activeError = '';
let activeText = '';
let languages = [];
let selectedLanguage = '';
let enabled = true;

export function renderCopyText(container, settings) {
  enabled = settings.copyText?.enabled !== false;
  selectedLanguage = settings.copyText?.language || '';

  container.innerHTML = `
    <div class="view copy-text-view">
      <section class="copy-text-card">
        <div class="copy-text-intro">
          <div class="copy-text-icon" aria-hidden="true"><svg viewBox="0 0 48 48"><path d="M16 8H9a3 3 0 0 0-3 3v7M32 8h7a3 3 0 0 1 3 3v7M42 30v7a3 3 0 0 1-3 3h-7M16 40H9a3 3 0 0 1-3-3v-7M15 18v12m9-12v12m9-12v12M15 24h18"/></svg></div>
          <div class="copy-text-title">
            <h2 data-i18n="Copy Text From Anything">Copy Text From Anything</h2>
            <p data-i18n="Extract and copy text from any area on your screen using offline OCR.">Extract and copy text from any area on your screen using offline OCR.</p>
          </div>
        </div>
        <div class="copy-text-workflow">
          <div class="copy-text-illustration" aria-hidden="true">
            <div class="copy-text-selection"><span>T</span><i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i></div>
            <span class="copy-text-size">Select any screen area</span>
          </div>
          <div class="copy-text-actions">
            <div class="copy-text-statusline" id="copyTextStatusLine"><i></i><span id="copyTextStatus">${escapeHtml(activeStatus)}</span></div>
            <p class="copy-text-error" id="copyTextError" ${activeError ? '' : 'hidden'}>${escapeHtml(activeError)}</p>
            <div class="copy-text-buttons">
              <button class="btn copy-text-action" id="copyTextSelect" ${activeProcessing || !enabled ? 'disabled' : ''}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3M8 12h8m-4-4v8"/></svg>
                <span data-i18n="Select Area">Select Area</span>
              </button>
              <kbd>Ctrl <b>+</b> Alt <b>+</b> T</kbd>
            </div>
            <div class="copy-text-steps" id="copyTextSteps" ${activeProcessing ? '' : 'hidden'}>
              <span data-step="capture">Capture area</span><span data-step="recognize">Recognize text</span><span data-step="copy">Copy to clipboard</span>
            </div>
          </div>
        </div>
        <div class="copy-text-meta">
          <div><b class="copy-text-meta-icon windows">▦</b><span><strong>OCR Engine</strong><small>Windows OCR</small></span></div>
          <div><b class="copy-text-meta-icon">▱</b><span><strong>Processing</strong><small>Offline · on this device</small></span></div>
          <label class="copy-text-meta-language"><b class="copy-text-meta-icon">◎</b><span><strong>Language</strong><select id="copyTextLanguage" aria-label="OCR language"></select></span><i>›</i></label>
          <label class="copy-text-enabled"><input id="copyTextEnabled" type="checkbox" ${enabled ? 'checked' : ''}><span>Enabled</span></label>
        </div>
      </section>
      <section class="copy-text-result" id="copyTextResult" ${activeText ? '' : 'hidden'}>
        <div class="copy-text-result-head"><span><i>✓</i><b>Text copied successfully</b><small id="copyTextCount"></small></span><button class="copy-text-copy" id="copyTextCopy" title="Copy extracted text" aria-label="Copy extracted text">⧉</button></div>
        <pre id="copyTextPreview"></pre>
      </section>
    </div>`;

  const selectButton = container.querySelector('#copyTextSelect');
  selectButton?.addEventListener('click', () => window.api.helperSend({ cmd: 'copy-text-start' }));

  const enabledInput = container.querySelector('#copyTextEnabled');
  enabledInput?.addEventListener('change', async () => {
    enabled = enabledInput.checked;
    await window.api.setSettings({ copyText: { enabled, language: selectedLanguage } });
    window.api.helperSend({ cmd: 'copy-text-config', enabled, language: selectedLanguage });
    selectButton.disabled = activeProcessing || !enabled;
  });

  if (unsubscribe) unsubscribe();
  unsubscribe = window.api.onHelper((msg) => {
    if (!msg) return;
    if (msg.type === 'copy-text-languages') {
      languages = Array.isArray(msg.languages) ? msg.languages : [];
      enabled = msg.enabled !== false;
      if (typeof msg.selectedLanguage === 'string') selectedLanguage = msg.selectedLanguage;
      renderLanguageOptions(container);
      const toggle = container.querySelector('#copyTextEnabled');
      if (toggle) toggle.checked = enabled;
      if (selectButton) selectButton.disabled = activeProcessing || !enabled;
    }
    if (msg.type === 'copy-text-status') {
      if (msg.status === 'Select an Area') {
        activeText = '';
        activeError = '';
      }
      activeStatus = msg.status || (msg.ok ? 'Ready to Extract Text' : 'OCR Failed');
      activeProcessing = !!msg.processing;
      activeError = msg.error || '';
      if (typeof msg.text === 'string') activeText = msg.text;
      updateStatus(container, msg);
    }
  });

  container.querySelector('#copyTextCopy')?.addEventListener('click', () => window.api.helperSend({ cmd: 'copy-text-copy' }));
  renderLanguageOptions(container);
  updateStatus(container, { status: activeStatus, processing: activeProcessing, ok: !activeError, error: activeError, text: activeText });
  // The helper can start before this view is mounted, so request a fresh language/status snapshot.
  window.api.helperSend({ cmd: 'copy-text-config', enabled, language: selectedLanguage });
}

function updateStatus(container, msg) {
  container.querySelector('.copy-text-view')?.classList.toggle('has-result', !!activeText);
  const status = container.querySelector('#copyTextStatus');
  const line = container.querySelector('#copyTextStatusLine');
  if (status) status.textContent = activeStatus;
  if (line) {
    line.classList.toggle('error', !msg.ok);
    line.classList.toggle('working', activeProcessing);
  }
  const error = container.querySelector('#copyTextError');
  if (error) { error.textContent = activeError; error.hidden = !activeError; }
  const button = container.querySelector('#copyTextSelect');
  if (button) button.disabled = activeProcessing || !enabled;
  const steps = container.querySelector('#copyTextSteps');
  if (steps) {
    steps.hidden = !activeProcessing;
    const current = msg.status === 'Capturing Screen' ? 'capture' : msg.status === 'Recognizing Text' ? 'recognize' : msg.status === 'Copying to Clipboard' ? 'copy' : '';
    steps.querySelectorAll('[data-step]').forEach((step) => {
      const order = ['capture', 'recognize', 'copy'];
      const i = order.indexOf(step.dataset.step);
      const c = order.indexOf(current);
      step.classList.toggle('done', c > i);
      step.classList.toggle('current', c === i);
    });
  }
  const result = container.querySelector('#copyTextResult');
  if (result) result.hidden = !activeText;
  const preview = container.querySelector('#copyTextPreview');
  if (preview) preview.textContent = activeText;
  const count = container.querySelector('#copyTextCount');
  if (count) count.textContent = activeText ? `${activeText.length} characters extracted` : '';
  const tabButton = document.querySelector('.tab-btn[data-tab="copy-text"]');
  tabButton?.classList.toggle('processing', activeProcessing);
}

function renderLanguageOptions(container) {
  const select = container.querySelector('#copyTextLanguage');
  if (!select) return;
  const options = ['<option value="">Automatic (installed languages)</option>', ...languages.map((language) =>
    `<option value="${escapeHtml(language.tag)}">${escapeHtml(language.displayName)} (${escapeHtml(language.tag)})</option>`
  )];
  select.innerHTML = options.join('');
  select.value = selectedLanguage;
  select.onchange = async () => {
    selectedLanguage = select.value;
    await window.api.setSettings({ copyText: { enabled, language: selectedLanguage } });
    window.api.helperSend({ cmd: 'copy-text-config', enabled, language: selectedLanguage });
  };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}
