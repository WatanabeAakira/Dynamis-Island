const test = require('node:test');
const assert = require('node:assert/strict');
const { romanizeLines } = require('../src/romaji');

test('romanizes Japanese kanji and kana while preserving timestamps and foreign lines', async () => {
  const lines = [
    { t: 15200, text: '君の名は' },
    { t: 18000, text: 'カタカナとひらがな' },
    { t: 22000, text: 'English and Indonesian' },
    { t: 22000, text: '次の歌' }
  ];
  const result = await romanizeLines(lines, { song: { title: 'test', artist: 'artist' } });
  assert.equal(result[0].romaji, 'kimi no na wa');
  assert.match(result[1].romaji, /katakana/);
  assert.equal(result[2].romaji, lines[2].text);
  assert.equal(result[3].romaji, 'tsugi no uta');
  assert.deepEqual(result.map((line) => line.t), lines.map((line) => line.t));
});

test('does not process lines without Japanese text', async () => {
  const lines = [{ t: 0, text: 'English' }, { t: 1000, text: 'Bahasa Indonesia' }];
  assert.deepEqual(await romanizeLines(lines, { song: { title: 'non-Japanese' } }), lines);
});

test('supports all three Kuroshiro romanization systems', async () => {
  const lines = [{ t: 0, text: 'しんぶん' }];
  const systems = await Promise.all(['hepburn', 'nippon', 'passport'].map((system) =>
    romanizeLines(lines, { song: { title: system }, system })));
  assert.deepEqual(systems.map((result) => result[0].romaji), ['shinbun', 'sinbun', 'shimbun']);
});
