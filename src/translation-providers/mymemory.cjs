const ENDPOINT = 'https://api.mymemory.translated.net/get';
const MAX_QUERY_BYTES = 500;

function splitText(text, maxBytes = MAX_QUERY_BYTES) {
  const leading = String(text).match(/^\s*/u)?.[0] || '';
  const trailing = String(text).slice(leading.length).match(/\s*$/u)?.[0] || '';
  const core = String(text).slice(leading.length, String(text).length - trailing.length);
  if (!core) return [{ text: '', separator: leading + trailing }];

  const chunks = [];
  if (leading) chunks.push({ text: '', separator: leading });
  let remaining = core;
  while (Buffer.byteLength(remaining, 'utf8') > maxBytes) {
    let end = 0;
    let byteCount = 0;
    let lastWhitespace = -1;
    for (const character of remaining) {
      const nextBytes = Buffer.byteLength(character, 'utf8');
      if (byteCount + nextBytes > maxBytes) break;
      byteCount += nextBytes;
      end += character.length;
      if (/\s/u.test(character)) lastWhitespace = end - character.length;
    }

    if (end === 0) throw new Error('Text contains a character that MyMemory cannot accept.');
    const useWordBoundary = lastWhitespace >= Math.floor(end * 0.6);
    const cut = useWordBoundary ? lastWhitespace : end;
    const chunk = remaining.slice(0, cut);
    if (!chunk) throw new Error('Text could not be split for the fallback translation provider.');

    let separator = '';
    let consumed = cut;
    if (useWordBoundary) {
      while (consumed < remaining.length && /\s/u.test(remaining[consumed])) consumed++;
      separator = remaining.slice(cut, consumed);
    }
    chunks.push({ text: chunk, separator });
    remaining = remaining.slice(consumed);
  }

  if (remaining) chunks.push({ text: remaining, separator: '' });
  chunks[chunks.length - 1].separator += trailing;
  return chunks;
}

async function translate({ text, sourceLanguage, targetLanguage, signal, fetchImpl = globalThis.fetch }) {
  const chunks = splitText(text);
  const translated = [];
  let detectedLanguage = sourceLanguage === 'auto' ? 'und' : sourceLanguage;
  let detectionPending = sourceLanguage === 'auto';

  for (const chunk of chunks) {
    if (!chunk.text) {
      translated.push(chunk.separator);
      continue;
    }

    const url = new URL(ENDPOINT);
    url.searchParams.set('q', chunk.text);
    url.searchParams.set('langpair', `${detectionPending ? 'autodetect' : detectedLanguage}|${targetLanguage}`);
    url.searchParams.set('mt', '1');

    let response;
    try { response = await fetchImpl(url, { method: 'GET', signal }); }
    catch (error) { throw error; }

    if (response.status === 429) throw new Error('MyMemory is rate-limiting requests. Wait a moment and retry.');
    if (!response.ok) throw new Error(httpMessage(response.status));

    let payload;
    try { payload = await response.json(); } catch {
      throw new Error('MyMemory returned an unreadable response.');
    }
    if (payload?.quotaFinished) throw new Error('MyMemory free daily quota is used up. Add a Groq key in Settings or try again tomorrow.');
    if (payload?.responseStatus !== 200) {
      if (/distinct languages/i.test(String(payload?.responseDetails || ''))) {
        throw new Error('The detected source language matches the target language. Choose a different target language.');
      }
      throw new Error('MyMemory could not translate this language pair.');
    }

    const result = payload?.responseData?.translatedText;
    if (typeof result !== 'string' || !result.trim()) throw new Error('MyMemory returned an empty translation.');
    if (/^PLEASE SELECT TWO DISTINCT LANGUAGES$/i.test(result.trim())) {
      throw new Error('The detected source language matches the target language. Choose a different target language.');
    }

    if (detectionPending) {
      detectedLanguage = normalizeDetectedLanguage(payload?.responseData?.detectedLanguage) || 'und';
      detectionPending = false;
    }
    translated.push(result + chunk.separator);
  }

  return {
    translation: translated.join(''),
    detectedLanguage,
    sourceLanguageAmbiguous: detectedLanguage === 'und'
  };
}

function normalizeDetectedLanguage(value) {
  return String(value || '').trim().toLowerCase().replace('_', '-').split('-')[0];
}

function httpMessage(status) {
  if (status === 400 || status === 413) return 'MyMemory rejected this text or language pair.';
  if (status === 408 || status === 504) return 'MyMemory timed out. Try again with shorter text.';
  if (status >= 500) return 'MyMemory is temporarily unavailable. Try again shortly.';
  return `MyMemory returned an error (${status}).`;
}

module.exports = { ENDPOINT, MAX_QUERY_BYTES, splitText, translate, httpMessage };
