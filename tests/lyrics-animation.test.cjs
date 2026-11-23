const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

let lyrics;
async function loadLyrics() {
  if (!lyrics) {
    const source = await readFile(path.join(__dirname, '../src/renderer/lyrics.js'), 'utf8');
    lyrics = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  }
  return lyrics;
}

test('Enhanced LRC karaoke finds the active word at timestamp boundaries', async () => {
  const { activeWordAt } = await loadLyrics();
  const words = [{ t: 100, end: 220 }, { t: 240, end: 390 }, { t: 450, end: 700 }];
  assert.equal(activeWordAt(words, 99), -1);
  assert.equal(activeWordAt(words, 100), 0);
  assert.equal(activeWordAt(words, 239), 0);
  assert.equal(activeWordAt(words, 300), 1);
  assert.equal(activeWordAt(words, 450), 2);
  assert.equal(activeWordAt(words, 900), 2);
  assert.equal(activeWordAt([], 100), -1);
});

test('lyrics transitions follow playback direction and respect reduced motion', async () => {
  const [renderer, css] = await Promise.all([
    readFile(path.join(__dirname, '../src/renderer/lyrics.js'), 'utf8'),
    readFile(path.join(__dirname, '../src/renderer/styles.css'), 'utf8')
  ]);
  assert.match(renderer, /Math\.abs\(delta\) === 1\) slide\(Math\.sign\(delta\)\)/);
  assert.match(renderer, /span\.classList\.toggle\('done', i < wordIndex\)/);
  assert.match(renderer, /classList\.toggle\('done', t >= word\.end\)/);
  assert.match(css, /\.l-slot \.w\.done\s*\{[^}]*color:\s*rgba\(236, 240, 255, \.52\)/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)\s*\{\s*\.l-track/);
  assert.match(css, /#pill-lyric\.swap\s*\{\s*animation:\s*none !important/);
});

test('expanded paired lyrics wrap to two lines inside the existing track', async () => {
  const [css, renderer] = await Promise.all([
    readFile(path.join(__dirname, '../src/renderer/styles.css'), 'utf8'),
    readFile(path.join(__dirname, '../src/renderer/lyrics.js'), 'utf8')
  ]);
  assert.match(css, /\.l-track\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\) minmax\(0,\s*2fr\) minmax\(0,\s*1fr\)/);
  assert.match(css, /\.l-slot\.cur\s*\{[^}]*font-size:\s*15px[^}]*\}/);
  assert.doesNotMatch(css.match(/\.l-slot\.cur\s*\{[^}]*\}/)?.[0] || '', /transform:\s*scale/);
  assert.match(css, /\.l-slot \.l-original\s*\{[^}]*-webkit-line-clamp:\s*2/);
  assert.match(css, /\.l-slot \.l-romaji\s*\{[^}]*white-space:\s*nowrap/);
  assert.match(css, /\.l-slot \.w\.done\s*\{[^}]*color:\s*rgba\(236, 240, 255, \.52\)/);
  assert.match(css, /\.media\.lyrics \.m-right\s*\{[^}]*overflow:\s*hidden/);
  assert.match(renderer, /function setCur\(line\)\s*\{\s*curLine = line;\s*spans = \[\]; activeWord = -1;\s*cur\.replaceChildren\(\);/);
});
