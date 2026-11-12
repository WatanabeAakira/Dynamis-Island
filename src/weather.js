// Data cuaca (Open-Meteo), pencarian lokasi, dan lokasi otomatis (Windows lewat helper, cadangan lewat IP).
const { net } = require('electron');
const helper = require('./helper');

const UA = 'WindowsIsland/0.5';
const cache = new Map(); // "lat,lon" -> { at, data }
const TTL_MS = 5 * 60000;

async function jget(url, ms = 9000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await net.fetch(url, { headers: { 'User-Agent': UA }, signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(timer); }
}

async function reverseName(lat, lon) {
  try {
    const j = await jget(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=id`, 6000);
    return j.city || j.locality || j.principalSubdivision || 'Lokasi saya';
  } catch { return 'Lokasi saya'; }
}

// 1) Lokasi Windows (Geolocator di helper C#); 2) cadangan: perkiraan dari alamat IP
async function locate() {
  try {
    const r = await helper.request({ cmd: 'location' }, 'location', 10000);
    if (r && r.ok) return { ok: true, lat: r.lat, lon: r.lon, name: await reverseName(r.lat, r.lon), source: 'windows' };
  } catch {}
  try {
    const j = await jget('https://ipwho.is/', 7000);
    if (j && j.success !== false && j.latitude != null) return { ok: true, lat: j.latitude, lon: j.longitude, name: j.city || j.region || 'Lokasi saya', source: 'ip' };
  } catch {}
  return { ok: false };
}

async function search(q) {
  q = String(q || '').trim();
  if (q.length < 2) return [];
  try {
    const j = await jget(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: q, count: '6', language: 'id', format: 'json' })}`, 7000);
    return (j.results || []).map((r) => ({
      name: r.name,
      admin: [r.admin1, r.country].filter(Boolean).join(', '),
      lat: r.latitude,
      lon: r.longitude
    }));
  } catch { return []; }
}

function normalize(j, lat, lon) {
  if (!j || !j.current) throw new Error('Data cuaca tidak lengkap');
  const c = j.current, h = j.hourly || {}, d = j.daily || {};
  const hourly = (h.time || []).map((t, i) => ({
    t, temp: h.temperature_2m[i], code: h.weather_code[i], isDay: h.is_day[i] === 1,
    pop: h.precipitation_probability ? h.precipitation_probability[i] : null
  }));
  const daily = (d.time || []).map((date, i) => ({
    date, code: d.weather_code[i], max: d.temperature_2m_max[i], min: d.temperature_2m_min[i],
    pop: d.precipitation_probability_max ? d.precipitation_probability_max[i] : null,
    uv: d.uv_index_max ? d.uv_index_max[i] : 0, sunrise: d.sunrise[i], sunset: d.sunset[i]
  }));
  return {
    lat, lon, tz: j.timezone, offset: j.utc_offset_seconds || 0, fetchedAt: Date.now(),
    current: {
      temp: c.temperature_2m, feels: c.apparent_temperature, humidity: c.relative_humidity_2m, code: c.weather_code,
      isDay: c.is_day === 1, wind: c.wind_speed_10m, windDir: c.wind_direction_10m, gust: c.wind_gusts_10m,
      pressure: c.pressure_msl, cloud: c.cloud_cover, precip: c.precipitation
    },
    hourly, daily
  };
}

async function get({ lat, lon } = {}, force = false) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { error: 'Koordinat tidak valid' };
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < TTL_MS) return hit.data;
  try {
    const params = new URLSearchParams({
      latitude: String(lat), longitude: String(lon), timezone: 'auto', forecast_days: '7', wind_speed_unit: 'kmh',
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day',
      hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max'
    });
    const data = normalize(await jget(`https://api.open-meteo.com/v1/forecast?${params}`), lat, lon);
    cache.set(key, { at: Date.now(), data });
    return data;
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

module.exports = { locate, search, get };
