export const EXPANDED_HEIGHT = Object.freeze({ min: 200, default: 260, max: 360 });

export const FEATURE_HEIGHTS = Object.freeze({
  media: 260, audio: 260, timer: 240, focus: 260, clock: 260,
  'copy-text': 310, translate: 330, calendar: 300, ai: 310,
  notif: 330, files: 330, apps: 300, weather: 300, settings: 260
});

export function clampExpandedHeight(value, fallback = EXPANDED_HEIGHT.default) {
  const height = Number(value);
  const safe = Number.isFinite(height) ? height : fallback;
  return Math.round(Math.min(EXPANDED_HEIGHT.max, Math.max(EXPANDED_HEIGHT.min, safe)));
}

export function preferredExpandedHeight(tab, sub = '', request = null) {
  const subHeight = {
    'alarm-edit': 300, 'cal': 300, 'cal-edit': 320, focus: 260,
    'weather': 330, 'weather-search': 330, 'notif': 330, 'ai': 310
  }[sub];
  const base = FEATURE_HEIGHTS[tab] ?? EXPANDED_HEIGHT.default;
  return clampExpandedHeight(request ?? subHeight ?? base);
}
