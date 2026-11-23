const DISPLAY_MODES = new Set(['primary', 'all', 'custom']);

function normalizeDisplayConfig(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const monitors = source.monitors && typeof source.monitors === 'object' && !Array.isArray(source.monitors) ? source.monitors : {};
  return {
    ...source,
    mode: DISPLAY_MODES.has(source.mode) ? source.mode : 'primary',
    monitors: Object.fromEntries(Object.entries(monitors).filter(([, visible]) => typeof visible === 'boolean'))
  };
}

function displayPreferenceKey(display) { return String(display.monitorId || display.id); }

function enrichDisplays(electronDisplays, nativeDisplays = [], primaryId) {
  const primary = String(primaryId);
  const sortedElectron = [...electronDisplays].sort((a, b) =>
    Number(String(b.id) === primary) - Number(String(a.id) === primary) || a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);
  const sortedNative = [...nativeDisplays].sort((a, b) =>
    Number(!!b.primary) - Number(!!a.primary) || (a.bounds?.x || 0) - (b.bounds?.x || 0) || (a.bounds?.y || 0) - (b.bounds?.y || 0));
  const nativeById = new Map();
  sortedElectron.forEach((display, index) => { if (sortedNative[index]) nativeById.set(String(display.id), sortedNative[index]); });
  return electronDisplays.map((display, index) => {
    const native = nativeById.get(String(display.id));
    return {
      ...display,
      id: String(display.id),
      monitorId: native?.monitorId || native?.id || String(display.id),
      name: display.label || native?.name || `Display ${index + 1}`,
      primary: String(display.id) === primary,
      refreshRate: display.displayFrequency || native?.refreshRate || null
    };
  });
}

function mergeSettings(current, patch, defaults) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError('Settings update must be an object.');
  const base = current && typeof current === 'object' && !Array.isArray(current) ? current : defaults;
  const next = { ...base, ...patch };
  if (Object.prototype.hasOwnProperty.call(patch, 'display')) next.display = normalizeDisplayConfig(patch.display);
  return next;
}

module.exports = { DISPLAY_MODES, normalizeDisplayConfig, displayPreferenceKey, enrichDisplays, mergeSettings };
