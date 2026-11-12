import { pickColors, fallbackColors, gradientCss, tintOf } from './color.js';

const island = document.getElementById('island');
const layers = [...island.querySelectorAll('.glow')];
let front = 0;          // lapisan yang sedang tampil
let lastUrl;            // undefined = belum pernah, null = dimatikan, 'fallback' = warna aksen
let token = 0;
let timer = 0;
let accentFromCover = false;
let fallbackAccent = '#8b9bff';
let currentColors = null;
let currentIsCover = false;

function show(css) {
  const next = 1 - front;
  layers[next].style.background = css;
  layers[next].classList.add('on');
  layers[front].classList.remove('on');
  front = next;
}

function apply(colors, isCover = false) {
  currentColors = colors;
  currentIsCover = isCover;
  show(gradientCss(colors));
  island.style.setProperty('--tint', tintOf(colors[0]));
  if (accentFromCover) setAccent(isCover ? tintOf(colors[0]) : fallbackAccent);
}

function clear() {
  layers.forEach((l) => l.classList.remove('on'));
}

function setAccent(color) {
  document.documentElement.style.setProperty('--accent', color);
}

let animArmed = false;

export function setAccentSettings(enabled, accent) {
  accentFromCover = enabled;
  fallbackAccent = accent;
  setAccent(enabled && currentIsCover && currentColors ? tintOf(currentColors[0]) : accent);
  // Gradient cadangan (lagu tanpa cover) ikut berubah saat warna aksen diganti
  if (lastUrl === 'fallback') apply(fallback());
  // Transisi warna aksen baru dinyalakan setelah pengaturan pertama diterapkan,
  // supaya saat startup tidak ada sapuan warna dari warna bawaan
  if (!animArmed) {
    animArmed = true;
    requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.add('accent-anim')));
  }
}

function fallback() {
  return fallbackColors(fallbackAccent);
}

async function fromUrl(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const N = 36;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, N, N);
  return pickColors(x.getImageData(0, 0, N, N).data);
}

// url = cover (data URL) atau null; active = ada media yang sedang diputar
export function setArt(url, active) {
  if (!active) {
    clearTimeout(timer); timer = 0;
    if (lastUrl !== null) {
      lastUrl = null; token++; currentColors = null; currentIsCover = false; clear();
      setAccent(fallbackAccent);
    }
    return;
  }
  if (url) {
    clearTimeout(timer); timer = 0;
    if (url === lastUrl) return;
    lastUrl = url;
    const my = ++token;
    fromUrl(url)
      .then((c) => { if (my === token) apply(c || fallback(), !!c); })
      .catch(() => { if (my === token) apply(fallback()); });
    return;
  }
  // Aktif tapi cover belum ada: tunggu sebentar (cover sering telat), baru pakai warna aksen
  if (!timer && lastUrl !== 'fallback') {
    timer = setTimeout(() => { timer = 0; lastUrl = 'fallback'; token++; apply(fallback()); }, 2500);
  }
}