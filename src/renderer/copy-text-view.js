let unsubscribe = null;
let activeStatus = 'Ready to Extract Text';
let activeProcessing = false;
let languages = [];
let selectedLanguage = '';
let enabled = true;

export function renderCopyText(container, settings) {
  enabled = settings.copyText?.enabled !== false;
  selectedLanguage = settings.copyText?.language || '';

  container.innerHTML = `
    <div class="view copy-text-view">
      <div class="copy-text-heading">
        <div>
          <h2 data-i18n="Copy Text From Anything">Copy Text From Anything</h2>
          <p data-i18n="Extract text from any visible screen area">Extract text from any visible screen area</p>
        </div>
        <span class="copy-text-status" id="copyTextStatus">${escapeHtml(activeStatus)}</span>
      </div>
      <div class="copy-text-controls">
        <button class="btn copy-text-action" id="copyTextSelect" ${activeProcessing ? 'disabled' : ''}>
          <span data-i18n="Select Area">Select Area</span>
          <kbd>Ctrl + Alt + T</kbd>
        </button>
        <label class="copy-text-toggle">
          <span data-i18n="Enabled">Enabled</span>
          <span class="switch"><input id="copyTextEnabled" type="checkbox" ${enabled ? 'checked' : ''}><span></span></span>
        </label>
        <label class="copy-text-language">
          <span data-i18n="OCR language">OCR language</span>
          <select id="copyTextLanguage"></select>
        </label>
      </div>
      ${activeProcessing ? '<div class="copy-text-progress" aria-label="Processing"><i></i><i></i><i></i></div>' : ''}
    </div>`;

  const selectButton = container.querySelector('#copyTextSelect');
  selectButton?.addEventListener('click', () => window.api.helperSend({ cmd: 'copy-text-start' }));

  const enabledInput = container.querySelector('#copyTextEnabled');
  enabledInput?.addEventListener('change', async () => {
    enabled = enabledInput.checked;
    await window.api.setSettings({ copyText: { enabled, language: selectedLanguage } });
    window.api.helperSend({ cmd: 'copy-text-config', enabled, language: selectedLanguage });
  });

  renderLanguageOptions(container.query);

  if (unsubscribe) unsubscribe();
  unsubscribe = window.api.onHelper((msg) => {
    if (!msg) return;
    if (msg.type === 'copy-text-languages') {
      languages = Array.isArray(msg.languages) ? msg.languages : [];
      enabled = msg.enabled !== false;
      if (typeof msg.selectedLanguage === 'string' && msg.selectedLanguage) selectedLanguage = msg.selectedLanguage;
      renderLanguageOptions(container.querySelector.bind(container));
      const enabledInput = container.querySelector('#copyTextEnabled');
      if (enabledInput) enabledInput.checked = enabled;
    }
    if (msg.type === 'copy-text-status') {
      activeStatus = msg.status || (msg.ok ? 'Ready to Extract Text' : 'OCR Failed');
      activeProcessing = !!msg.processing;
      const status = container.querySelector('#copyTextStatus');
      if (status) {
        status.textContent = activeStatus;
        status.classList.toggle('error', !msg.ok);
      }
      const button = container.querySelector('#copyTextSelect');
      if (button) button.disabled = activeProcessing;
      container.querySelector('.copy-text-progress')?.remove();
      if (activeProcessing) {
        const progress = document.createElement('div');
        progress.className = 'copy-text-progress';
        progress.setAttribute('aria-label', 'Processing');
        progress.innerHTML = '<i></i><i></i><i></i>';
        container.querySelector('.copy-text-view')?.append(progress);
      }
      const tabButton = document.querySelector('.tab-btn[data-tab="copy-text"]');
      tabButton?.classList.toggle('processing', activeProcessing);
    }
  });
}

function renderLanguageOptions(query) {
  const select = typeof query === 'function' ? query('#copyTextLanguage') : null;
  if (!select) return;
  select.innerHTML = '<option value="">Automatic (installed languages)</option>' + languages.map((language) =>
    `<option value="${escapeHtml(language.tag)}" ${language.tag === selectedLanguage ? 'selected' : ''}>${escapeHtml(language.displayName)} (${escapeHtml(language.tag)})</option>`
  ).join('');
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
