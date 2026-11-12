// Fungsi murni untuk tampilan cuaca (tanpa DOM).

// Waktu dari API berupa waktu lokal lokasi ("2026-11-05T14:00"); dibaca sebagai UTC supaya mudah dibandingkan
export const toMs = (iso) => Date.parse(iso + 'Z');
export const locNow = (data, now = Date.now()) => now + data.offset * 1000;
export const hhmm = (iso) => iso.slice(11, 16);

// n jam ke depan, dimulai dari jam sekarang di lokasi tersebut
export function pickHours(data, n = 7, now = Date.now()) {
  const base = Math.floor(locNow(data, now) / 3600000) * 3600000;
  const i = data.hourly.findIndex((h) => toMs(h.t) >= base);
  return i < 0 ? [] : data.hourly.slice(i, i + n);
}

// Posisi matahari (siang) atau bulan (malam) di sepanjang busur, 0..1
export function sunProgress(data, now = Date.now()) {
  const d0 = data.daily[0];
  const sr = toMs(d0.sunrise), ss = toMs(d0.sunset);
  const t = locNow(data, now);
  if (t >= sr && t <= ss) return { day: true, p: (t - sr) / (ss - sr) };
  if (t > ss) {
    const nr = data.daily[1] ? toMs(data.daily[1].sunrise) : sr + 86400000;
    return { day: false, p: Math.min(1, (t - ss) / (nr - ss)) };
  }
  const ps = ss - 86400000; // kira-kira terbenam kemarin
  return { day: false, p: Math.max(0, (t - ps) / (sr - ps)) };
}

// Busur berbentuk kurva Bezier kuadrat; hasil titik pada posisi p (0..1)
export const ARC = { w: 594, y0: 78, peak: 12, pad: 28 };
export const arcPath = ({ w, y0, peak, pad } = ARC) => `M${pad} ${y0} Q${w / 2} ${2 * peak - y0} ${w - pad} ${y0}`;
export function arcPoint(p, { w, y0, peak, pad } = ARC) {
  const cy = 2 * peak - y0, u = 1 - p;
  return { x: u * u * pad + 2 * u * p * (w / 2) + p * p * (w - pad), y: u * u * y0 + 2 * u * p * cy + p * p * y0 };
}

export const fmtTemp = (c, units) => (c == null ? '--°' : `${Math.round(units === 'f' ? (c * 9) / 5 + 32 : c)}°`);

const DIRS = ['Utara', 'Timur Laut', 'Timur', 'Tenggara', 'Selatan', 'Barat Daya', 'Barat', 'Barat Laut'];
export const compass = (deg) => (deg == null ? '' : DIRS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]);

export const uvLevel = (uv) => (uv < 3 ? 'Rendah' : uv < 6 ? 'Sedang' : uv < 8 ? 'Tinggi' : uv < 11 ? 'Sangat tinggi' : 'Ekstrem');

const DAY = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
export const dayName = (isoDate) => DAY[new Date(isoDate + 'T00:00:00Z').getUTCDay()];

export function distKm(a, b) {
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
