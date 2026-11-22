const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const cssPath = path.join(__dirname, '../src/renderer/styles.css');
const scriptPath = path.join(__dirname, '../src/renderer/scrollbars.js');

test('shared scrollbar tokens match the neutral minimal design', async () => {
  const css = await readFile(cssPath, 'utf8');
  assert.match(css, /--island-scrollbar-width:\s*4px/);
  assert.match(css, /--island-scrollbar-hover-width:\s*5px/);
  assert.match(css, /--island-scrollbar-track:\s*transparent/);
  assert.match(css, /--island-scrollbar-thumb:\s*rgba\(180, 180, 180, \.45\)/);
  assert.match(css, /--island-scrollbar-thumb-hover:\s*rgba\(220, 220, 220, \.8\)/);
  assert.match(css, /--island-scrollbar-radius:\s*999px/);
  assert.match(css, /--island-scrollbar-transition:\s*180ms ease/);
});

test('all browser scrollbars share one WebKit/Firefox style and stable vertical gutters', async () => {
  const css = await readFile(cssPath, 'utf8');
  assert.match(css, /:where\(\*\)::-webkit-scrollbar\s*\{/);
  assert.match(css, /:where\(\*\)::-webkit-scrollbar-track/);
  assert.match(css, /:where\(\*\)::-webkit-scrollbar-thumb\s*\{/);
  assert.match(css, /:where\(\*:hover, \[data-island-scrolling="true"\], \*:focus-within\)::-webkit-scrollbar-thumb/);
  assert.match(css, /:where\(\*\)\s*\{\s*scrollbar-width:\s*thin/);
  assert.match(css, /scrollbar-gutter:\s*stable/);
  assert.doesNotMatch(css, /::-webkit-scrollbar\s*\{\s*display:\s*none/);
  assert.doesNotMatch(css, /::-webkit-scrollbar\s*\{\s*width:\s*6px/);
});

test('scroll interaction reveal is delegated once and fades back after one second', async () => {
  const script = await readFile(scriptPath, 'utf8');
  const app = await readFile(path.join(__dirname, '../src/renderer/app.js'), 'utf8');
  const css = await readFile(cssPath, 'utf8');
  assert.match(script, /const HIDE_DELAY = 1000/);
  assert.match(script, /document\.addEventListener\('scroll', revealDuringScroll, \{ capture: true, passive: true \}\)/);
  assert.match(script, /data-island-scrolling/);
  assert.match(app, /import '\.\/scrollbars\.js'/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*:where\(\*\)::-webkit-scrollbar-thumb \{ transition: none;/);
});
