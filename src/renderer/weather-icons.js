// Ikon cuaca (SVG 24x24) bergaya awan lembut, dan nama kondisi dalam bahasa Indonesia.

const CLOUD = 'M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z';
const MOON = 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z';
const cloud = (fill, tx, ty, s) => `<path transform="translate(${tx} ${ty}) scale(${s})" d="${CLOUD}" fill="${fill}"/>`;
const sun = (cx, cy, r) => {
  let rays = '';
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4, r1 = r + 1.8, r2 = r + 3.4;
    rays += `<path d="M${(cx + Math.cos(a) * r1).toFixed(2)} ${(cy + Math.sin(a) * r1).toFixed(2)}L${(cx + Math.cos(a) * r2).toFixed(2)} ${(cy + Math.sin(a) * r2).toFixed(2)}" stroke="#ffd60a" stroke-width="1.5" stroke-linecap="round"/>`;
  }
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffd60a"/>${rays}`;
};
const moon = (tx, ty, s) => `<path transform="translate(${tx} ${ty}) scale(${s})" d="${MOON}" fill="#e3eaf8"/>`;
const drops = (xs, color = '#6cc4ff', y = 18.2) => xs.map((x) => `<path d="M${x} ${y}l-1.1 2.8" stroke="${color}" stroke-width="1.7" stroke-linecap="round"/>`).join('');
const flakes = (xs) => xs.map((x, i) => `<circle cx="${x}" cy="${19.6 + (i % 2) * 1.6}" r="1.25" fill="#ffffff"/>`).join('');
const BOLT = '<path d="M12.6 14.5l-2.8 4.4h2.2l-.9 3.6 3.4-4.8h-2.2z" fill="#ffd60a"/>';

const LIGHT = '#b9cfee', MID = '#8fa3c8', DARK = '#6a7a9c';

const ICONS = {
  clearDay: () => sun(12, 12, 5.2),
  clearNight: () => moon(0, 0, 1),
  mainlyDay: () => sun(16, 8, 4.2) + cloud(LIGHT, 1.5, 5.5, 0.78),
  mainlyNight: () => moon(7, -2.5, 0.62) + cloud(LIGHT, 1.5, 5.5, 0.78),
  partlyDay: () => sun(16.5, 7.5, 4) + cloud(LIGHT, 1, 4.5, 0.86),
  partlyNight: () => moon(7.5, -3, 0.58) + cloud(LIGHT, 1, 4.5, 0.86),
  cloudy: () => cloud(DARK, 6, -1.5, 0.66) + cloud(LIGHT, 0.5, 3.5, 0.9),
  overcast: () => cloud('#55627f', 6, -1.5, 0.66) + cloud(MID, 0.5, 3.5, 0.9),
  fog: () => cloud(LIGHT, 2, 0, 0.8) + '<path d="M4 18.4h16M6.5 21.4h13" stroke="#b9cfee" stroke-width="1.6" stroke-linecap="round" opacity=".85"/>',
  drizzle: () => cloud(MID, 2, -1, 0.8) + drops([8.5, 12.5, 16.5], '#8fd0ff', 17.6),
  rain: () => cloud(MID, 2, -1.6, 0.8) + drops([8, 12, 16]),
  heavy: () => cloud(DARK, 2, -2, 0.8) + drops([7, 10.4, 13.8, 17.2], '#4fb0ff', 16.8),
  thunder: () => cloud(DARK, 2, -2.5, 0.8) + BOLT,
  snow: () => cloud('#aebde0', 2, -1.6, 0.8) + flakes([8, 12, 16]),
  sleet: () => cloud(MID, 2, -1.6, 0.8) + drops([8.5, 15.5]) + flakes([12]),
  showers: () => sun(17, 6.5, 3.6) + cloud(MID, 1, 2.5, 0.8) + drops([8.5, 12.5, 16.5], '#6cc4ff', 17.6)
};

// Kode cuaca WMO -> [kunci ikon siang, kunci ikon malam, nama]
function entry(code) {
  if (code === 0) return ['clearDay', 'clearNight', 'Cerah'];
  if (code === 1) return ['mainlyDay', 'mainlyNight', 'Cerah berawan'];
  if (code === 2) return ['partlyDay', 'partlyNight', 'Berawan sebagian'];
  if (code === 3) return ['overcast', 'overcast', 'Mendung'];
  if (code === 45 || code === 48) return ['fog', 'fog', 'Berkabut'];
  if (code >= 51 && code <= 55) return ['drizzle', 'drizzle', 'Gerimis'];
  if (code === 56 || code === 57) return ['sleet', 'sleet', 'Gerimis beku'];
  if (code === 61) return ['rain', 'rain', 'Hujan ringan'];
  if (code === 63) return ['rain', 'rain', 'Hujan'];
  if (code === 65) return ['heavy', 'heavy', 'Hujan lebat'];
  if (code === 66 || code === 67) return ['sleet', 'sleet', 'Hujan beku'];
  if (code >= 71 && code <= 77) return ['snow', 'snow', 'Salju'];
  if (code >= 80 && code <= 82) return ['showers', 'rain', 'Hujan lokal'];
  if (code === 85 || code === 86) return ['snow', 'snow', 'Salju lokal'];
  if (code >= 95) return ['thunder', 'thunder', code === 95 ? 'Badai petir' : 'Badai petir dan es'];
  return ['cloudy', 'cloudy', 'Berawan'];
}

export const label = (code) => entry(code)[2];
export function icon(code, isDay = true) {
  const e = entry(code);
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[isDay ? e[0] : e[1]]()}</svg>`;
}
export const ALL_ICON_KEYS = Object.keys(ICONS);
export const iconByKey = (k) => `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">${ICONS[k]()}</svg>`;
