const crypto = require('crypto');
const path = require('path');

const cache = new Map();
let enginePromise = null;
let queue = Promise.resolve();
const JAPANESE = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/u;
const KANA = /[\u3040-\u30ff]/u;

function engine() {
  if (!enginePromise) {
    enginePromise = (async () => {
      const Kuroshiro = require('kuroshiro');
      const KuromojiAnalyzer = require('kuroshiro-analyzer-kuromoji');
      const kuroshiro = new Kuroshiro();
      const dictPath = path.join(path.dirname(require.resolve('kuromoji')), '..', 'dict') + path.sep;
      await kuroshiro.init(new KuromojiAnalyzer({ dictPath }));
      return kuroshiro;
    })().catch((error) => {
      enginePromise = null;
      throw error;
    });
  }
  return enginePromise;
}

function cacheKey(lines, song, system) {
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(lines.map((line) => [line.text, line.words?.map((word) => word.text)])));
  hash.update('\0' + [song?.source, song?.artist, song?.title, song?.album].join('|'));
  hash.update('\0' + system);
  return hash.digest('hex');
}

async function romanizeLines(lines, { song, system = 'hepburn' } = {}) {
  const selected = ['hepburn', 'nippon', 'passport'].includes(system) ? system : 'hepburn';
  const key = cacheKey(lines, song, selected);
  if (cache.has(key)) return cache.get(key).map((line) => ({ ...line }));

  if (!lines.some((line) => JAPANESE.test(line.text || ''))) return lines;
  const kuroshiro = await engine();
  const result = [];
  // A single queue keeps the shared Kuromoji tokenizer predictable and avoids
  // competing work when several IPC requests arrive during rapid track changes.
  const run = async () => {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const text = String(line.text || '');
      // Han-only text is ambiguous (for example, Chinese), so only infer it
      // from Japanese kana on this or an immediately adjacent lyric line.
      const hasJapaneseContext = KANA.test(text)
        || KANA.test(lines[i - 1]?.text || '')
        || KANA.test(lines[i + 1]?.text || '');
      const isJapanese = JAPANESE.test(text) && hasJapaneseContext;
      const romaji = isJapanese
        ? await kuroshiro.convert(text, { to: 'romaji', mode: 'spaced', romajiSystem: selected })
        : text;
      result.push({ ...line, romaji });
    }
    return result;
  };
  const task = queue.then(run, run);
  queue = task.then(() => undefined, () => undefined);
  const converted = await task;
  if (cache.size >= 300) cache.delete(cache.keys().next().value);
  cache.set(key, converted.map((line) => ({ ...line })));
  return converted;
}

module.exports = { romanizeLines };
