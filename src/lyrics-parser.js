// Parser lirik: .lrc, .elrc, dan Enhanced LRC (timestamp per kata <mm:ss.xx>).
// Hasil: { synced, lines: [{ t, text, words?: [{ t, end, text }] }] }  (t dalam ms)

const toMs = (m, s, f) =>
  Number(m) * 60000 + Number(s) * 1000 + (f ? Math.round(parseFloat('0.' + f) * 1000) : 0);

const LEAD = /^(?:\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\])+/;
const TS = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const WT = /<(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?>/g;
const META = /^\[(ar|ti|al|au|by|offset|length|re|ve|la|tool|#):(.*)\]$/i;

function parseWords(rest, lineT) {
  WT.lastIndex = 0;
  const marks = [];
  let m;
  while ((m = WT.exec(rest))) marks.push({ i: m.index, len: m[0].length, t: toMs(m[1], m[2], m[3]) });
  if (!marks.length) return null;

  const words = [];
  const pre = rest.slice(0, marks[0].i);
  if (pre.trim()) words.push({ t: lineT, end: marks[0].t, text: pre });
  marks.forEach((mk, k) => {
    const from = mk.i + mk.len;
    const to = k + 1 < marks.length ? marks[k + 1].i : rest.length;
    const text = rest.slice(from, to);
    if (!text.trim()) return; // tag penutup: hanya menandai akhir kata sebelumnya
    words.push({ t: mk.t, end: k + 1 < marks.length ? marks[k + 1].t : null, text });
  });
  return words.length ? words : null;
}

function parseLrc(input) {
  const text = String(input || '').replace(/^\uFEFF/, '');
  let offset = 0;
  const lines = [];
  const plain = [];
  let synced = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    const meta = META.exec(line);
    if (meta) {
      if (meta[1].toLowerCase() === 'offset') offset = parseInt(meta[2], 10) || 0;
      continue;
    }

    const lead = LEAD.exec(line);
    if (!lead) { plain.push(line.replace(WT, '').trim()); continue; }

    synced = true;
    const rest = line.slice(lead[0].length);
    const clean = rest.replace(WT, '').replace(/\s+/g, ' ').trim();
    TS.lastIndex = 0;
    let m;
    while ((m = TS.exec(lead[0]))) {
      const t = toMs(m[1], m[2], m[3]);
      const words = parseWords(rest, t);
      lines.push({ t, text: clean, words: words ? words.map((w) => ({ ...w })) : undefined });
    }
  }

  if (!synced) return { synced: false, lines: plain.map((t) => ({ t: null, text: t })) };

  // Terapkan offset ([offset:+300] = lirik tampil lebih awal 300 ms)
  for (const l of lines) {
    l.t = Math.max(0, l.t - offset);
    if (l.words) for (const w of l.words) { w.t = Math.max(0, w.t - offset); if (w.end != null) w.end = Math.max(0, w.end - offset); }
  }
  lines.sort((a, b) => a.t - b.t);

  // Lengkapi waktu akhir tiap kata
  lines.forEach((l, i) => {
    if (!l.words) return;
    const lineEnd = i + 1 < lines.length ? lines[i + 1].t : l.t + 4000;
    l.words.forEach((w, k) => {
      if (w.end == null) w.end = k + 1 < l.words.length ? l.words[k + 1].t : lineEnd;
      if (w.end <= w.t) w.end = w.t + 150;
    });
  });

  return { synced: true, lines };
}

module.exports = { parseLrc };
