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
  assert.match(main, /ipcMain\.on\('island:rect',[^\n]*islandContext\(e\.sender\)[^\n]*applyIgnore\(ctx\); pollHover\(ctx\)/);
  assert.match(css, /#island-dropdown-portal\s*\{[^}]*z-index:\s*10000/);
  assert.match(css, /\.island-dropdown-menu\s*\{[^}]*pointer-events:\s*auto/);
});

test('Media session trigger shrinks to the space beside the source badge', async () => {
  const css = await read('src/renderer/styles.css');
  assert.match(css, /\.island-dropdown-trigger\.m-session\s*\{[^}]*flex:\s*1 1 0%[^}]*min-width:\s*0[^}]*max-width:\s*180px/);
  assert.match(css, /\.m-src-row\s*\{[^}]*min-width:\s*0[^}]*max-width:\s*100%/);
});

test('settings renderer retains a valid settings object when an update response is empty', async () => {
  const source = await read('src/settings-window/settings.js');
  assert.match(source, /async function save\(patch\)[\s\S]*if \(saved && typeof saved === 'object'\) S = saved;[\s\S]*return S;/);
  assert.match(source, /if \(!s \|\| typeof s !== 'object'\)[\s\S]*ignored empty settings update/);
  assert.match(source, /if \(!S \|\| typeof S !== 'object'\) S = \{ language: 'id', accent: '#ff9f0a' \};/);
  assert.match(source, /Unable to load display information: \$\{error\?\.message/);
});

test('Island tab actions are captured on pointerup without duplicate click activation', async () => {
  const source = await read('src/renderer/app.js');
  assert.match(source, /tabbar\.addEventListener\('pointerup',[\s\S]*activateTabbarTarget\(e\)/);
  assert.match(source, /lastPointerActivation\.target === e\.target\.closest\('button'\)[\s\S]*return;/);
  assert.match(source, /tabbar\.addEventListener\('click',[\s\S]*activateTabbarTarget\(e\)/);
});

test('Island windows are shown after renderer load and startup screen reconciliation', async () => {
  const source = await read('src/main.js');
  assert.match(source, /island\.webContents\.on\('did-finish-load',[\s\S]*revealIsland\(context\)/);
  assert.match(source, /setTimeout\(\(\) => refreshIslandWindows\(\), 250\)/);
  assert.match(source, /function revealIsland\(context\)[\s\S]*showInactive\(\)[\s\S]*moveTop\(\)/);
});
