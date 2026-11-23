const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const read = (file) => readFile(path.join(__dirname, '..', file), 'utf8');

test('renderer select controls use the in-window Island dropdown in all three features', async () => {
  const [dropdown, media, audio, copyText, translate] = await Promise.all([
    read('src/renderer/dropdown.js'), read('src/renderer/media.js'),
    read('src/renderer/audio-view.js'), read('src/renderer/copy-text-view.js'),
    read('src/renderer/translate-view.js')
  ]);
  assert.match(media, /createIslandDropdown\(sessionPicker/);
  assert.match(audio, /createIslandDropdown\(q\('#au-dev'\)/);
  assert.match(copyText, /createIslandDropdown\(container\.querySelector\('#copyTextLanguage'\)/);
  assert.match(translate, /createIslandDropdown\(source,/);
  assert.match(translate, /createIslandDropdown\(target,/);
  assert.match(dropdown, /select\.classList\.add\('island-dropdown-source'\)/);
  assert.match(dropdown, /dispatchEvent\(new Event\('change', \{ bubbles: true \}\)\)/);
  assert.match(dropdown, /island\.append\(portal\)/);
});

test('dropdown popup stays in the Island hit-test region and above clipped content', async () => {
  const [renderer, main, css] = await Promise.all([
    read('src/renderer/app.js'), read('src/main.js'), read('src/renderer/styles.css')
  ]);
  assert.match(renderer, /island-dropdown-portal \.island-dropdown-menu:not\(\[hidden\]\)/);
  assert.match(main, /ipcMain\.on\('island:rect',[^\n]*applyIgnore\(\); pollHover\(\)/);
  assert.match(css, /#island-dropdown-portal\s*\{[^}]*z-index:\s*10000/);
  assert.match(css, /\.island-dropdown-menu\s*\{[^}]*pointer-events:\s*auto/);
});

test('Media session trigger shrinks to the space beside the source badge', async () => {
  const css = await read('src/renderer/styles.css');
  assert.match(css, /\.island-dropdown-trigger\.m-session\s*\{[^}]*flex:\s*1 1 0%[^}]*min-width:\s*0[^}]*max-width:\s*180px/);
  assert.match(css, /\.m-src-row\s*\{[^}]*min-width:\s*0[^}]*max-width:\s*100%/);
});
