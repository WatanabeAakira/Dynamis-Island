// Ekstraksi warna dari cover dan pembuatan gradient. Tanpa DOM supaya bisa dites.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (d) {
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

export function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let t;
  if (h < 60) t = [c, x, 0];
  else if (h < 120) t = [x, c, 0];
  else if (h < 180) t = [0, c, x];
  else if (h < 240) t = [0, x, c];
  else if (h < 300) t = [x, 0, c];
  else t = [c, 0, x];
  return t.map((v) => Math.round((v + m) * 255));
}

// Sesuaikan supaya enak dilihat di latar hitam: tidak terlalu gelap, tidak pudar
function normalize(rgb) {
  let [h, s, l] = rgbToHsl(...rgb);
  if (s < 0.12) l = clamp(l, 0.32, 0.62);          // cover hampir abu-abu: tetap netral
  else { s = clamp(s, 0.42, 0.88); l = clamp(l, 0.4, 0.6); }
  return hslToRgb(h, s, l);
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// data = RGBA (hasil getImageData). Mengembalikan 3 warna: dominan, lalu yang berbeda jauh.
export function pickColors(data) {
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const l = (mx + mn) / 510;
    if (l < 0.08 || l > 0.94) continue;              // abaikan hitam dan putih murni
    const s = mx === mn ? 0 : (mx - mn) / (255 - Math.abs(mx + mn - 255));
    const k = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    let e = buckets.get(k);
    if (!e) { e = { n: 0, r: 0, g: 0, b: 0, w: 0 }; buckets.set(k, e); }
    e.n++; e.r += r; e.g += g; e.b += b;
    e.w += 0.25 + s;                                 // warna jenuh diberi bobot lebih
  }
  const list = [...buckets.values()]
    .map((e) => ({ rgb: [e.r / e.n, e.g / e.n, e.b / e.n], score: e.w }))
    .sort((a, b) => b.score - a.score);

  const picked = [];
  for (const e of list) {
    if (picked.every((p) => dist(p, e.rgb) > 75)) picked.push(e.rgb);
    if (picked.length === 3) break;
  }
  if (!picked.length) return null;

  // Cover satu warna: turunkan variasi dari warna utama
  while (picked.length < 3) {
    const [h, s, l] = rgbToHsl(...picked[0]);
    const n = picked.length;
    picked.push(s > 0.15
      ? hslToRgb(h + (n === 1 ? 28 : -28), s, l)
      : hslToRgb(h, s, clamp(l + (n === 1 ? 0.14 : -0.14), 0.2, 0.75)));
  }
  return picked.map(normalize);
}

export function fallbackColors(hex) {
  const n = parseInt(hex.replace('#', '').trim(), 16);
  const [h] = rgbToHsl((n >> 16) & 255, (n >> 8) & 255, n & 255);
  return [0, 35, -35].map((d) => hslToRgb(h + d, 0.6, 0.5));
}

export function tintOf(rgb) {
  const [h, s] = rgbToHsl(...rgb);
  return `rgb(${hslToRgb(h, clamp(s, 0.5, 0.9), 0.74).join(',')})`;
}

// Gradient dari bawah ke atas: tiga cahaya warna di sisi bawah, memudar menjadi hitam di atas
export function gradientCss(c) {
  const a = (rgb, al) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${al})`;
  return [
    `radial-gradient(130% 95% at 12% 118%, ${a(c[0], 0.62)} 0%, transparent 62%)`,
    `radial-gradient(120% 90% at 88% 120%, ${a(c[1], 0.55)} 0%, transparent 62%)`,
    `radial-gradient(90% 70% at 50% 125%, ${a(c[2], 0.5)} 0%, transparent 58%)`,
    `linear-gradient(to top, ${a(c[0], 0.18)}, transparent 70%)`
  ].join(',');
}
