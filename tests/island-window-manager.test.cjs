const test = require('node:test');
const assert = require('node:assert/strict');
const { IslandWindowManager } = require('../src/island-window-manager.cjs');

function fixture() {
  const created = [];
  const closed = [];
  const manager = new IslandWindowManager({
    create(display) {
      const window = { bounds: null, dead: false, setBounds(value) { this.bounds = value; }, isDestroyed() { return this.dead; }, destroy() { this.dead = true; closed.push(String(display.id)); } };
      created.push({ display, window });
      return window;
    }
  });
  return { manager, created, closed };
}

const displays = [
  { id: 11, primary: true, bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
  { id: 22, primary: false, bounds: { x: -1280, y: 120, width: 1280, height: 1024 } },
  { id: 33, primary: false, bounds: { x: 300, y: -900, width: 1600, height: 900 } }
];

test('primary mode creates one window and follows primary changes', () => {
  const { manager, created, closed } = fixture();
  manager.sync(displays, { mode: 'primary' });
  assert.deepEqual(manager.values().map((c) => c.id), ['11']);
  const updated = displays.map((d) => ({ ...d, primary: d.id === 22 }));
  manager.sync(updated, { mode: 'primary' });
  assert.deepEqual(manager.values().map((c) => c.id), ['22']);
  assert.deepEqual(closed, ['11']);
  assert.equal(created[1].window.bounds.x, -990);
});

test('all mode creates independent contexts and keeps negative/vertical coordinates', () => {
  const { manager } = fixture();
  manager.sync(displays, { mode: 'all' });
  assert.equal(manager.values().length, 3);
  const [a, b, c] = manager.values();
  assert.notEqual(a, b);
  a.rect = { x: 1 }; a.rendererOver = true; a.focusAllowed = true;
  assert.equal(b.rect, null); assert.equal(b.rendererOver, false); assert.equal(c.focusAllowed, false);
  assert.equal(manager.get('22').window.bounds.x, -990);
  assert.equal(manager.get('33').window.bounds.y, -900);
});

test('custom mode retains only saved visible displays', () => {
  const { manager } = fixture();
  manager.sync(displays, { mode: 'custom', monitors: { 22: true } });
  assert.deepEqual(manager.values().filter((c) => !c.serviceOnly).map((c) => c.id), ['22']);
  assert.equal(manager.get('11').serviceOnly, true);
  manager.sync(displays, { mode: 'all', monitors: { 22: true } });
  assert.equal(manager.values().length, 3);
  manager.sync(displays, { mode: 'custom', monitors: { 22: true } });
  assert.deepEqual(manager.values().filter((c) => !c.serviceOnly).map((c) => c.id), ['22']);
});

test('custom mode with every Island hidden keeps one hidden background renderer for shared timers and alarms', () => {
  const { manager } = fixture();
  manager.sync(displays, { mode: 'custom', monitors: {} });
  assert.equal(manager.values().length, 1);
  assert.equal(manager.primary().serviceOnly, true);
  assert.equal(manager.isVisibleDisplay('11'), false);
});

test('monitor removal destroys only its window and forgets its transient state', () => {
  const { manager, closed } = fixture();
  manager.sync(displays, { mode: 'all' });
  manager.get('22').hoverInside = true;
  manager.sync([displays[0], displays[2]], { mode: 'all' });
  assert.deepEqual(closed, ['22']);
  assert.equal(manager.get('22'), undefined);
  assert.deepEqual(manager.values().map((c) => c.id), ['11', '33']);
});

test('hotplug confirmation keeps a monitor pending until choice and asks again after reconnect', () => {
  const { manager, created } = fixture();
  manager.sync([displays[0]], { mode: 'all' });
  manager.holdForConfirmation(displays[1]);
  manager.sync(displays.slice(0, 2), { mode: 'all' });
  assert.equal(manager.get('22'), undefined);
  manager.decide('22', true);
  manager.sync(displays.slice(0, 2), { mode: 'all' });
  assert.ok(manager.get('22'));
  manager.sync([displays[0]], { mode: 'all' });
  manager.holdForConfirmation(displays[1]);
  manager.sync(displays.slice(0, 2), { mode: 'all' });
  assert.equal(manager.get('22'), undefined);
  assert.equal(created.filter((x) => String(x.display.id) === '22').length, 1);
});

test('primary mode can temporarily include hidden displays for alarm takeover', () => {
  const { manager } = fixture();
  manager.sync(displays, { mode: 'primary' });
  manager.sync(displays, { mode: 'primary', alarmTakeover: true });
  assert.equal(manager.values().length, 3);
  manager.sync(displays, { mode: 'primary', alarmTakeover: false });
  assert.deepEqual(manager.values().map((c) => c.id), ['11']);
});

test('one shared data update is broadcast to every live Island renderer', () => {
  const { manager } = fixture();
  manager.sync(displays, { mode: 'all' });
  const received = [];
  for (const context of manager.values()) context.window.webContents = { send: (channel, payload) => received.push([context.id, channel, payload]) };
  const shared = { volume: 37, track: 'Shared session' };
  manager.broadcast('data:changed', shared);
  assert.equal(received.length, 3);
  assert.deepEqual(received.map((entry) => entry[2]), [shared, shared, shared]);
});

test('display settings normalize safely and retain stable monitor preferences across restart', () => {
  const { normalizeDisplayConfig, displayPreferenceKey, enrichDisplays, mergeSettings } = require('../src/display-config.cjs');
  const original = normalizeDisplayConfig({ mode: 'custom', monitors: { 'MONITOR\\ACME123': true, 'temp-id': false, ignored: 'yes' } });
  const restarted = normalizeDisplayConfig(JSON.parse(JSON.stringify(original)));
  assert.equal(restarted.mode, 'custom');
  assert.deepEqual(restarted.monitors, { 'MONITOR\\ACME123': true, 'temp-id': false });
  assert.equal(displayPreferenceKey({ id: 11, monitorId: 'MONITOR\\ACME123' }), 'MONITOR\\ACME123');
  assert.equal(normalizeDisplayConfig({ mode: 'unknown', monitors: [] }).mode, 'primary');
  const current = { language: 'id', accent: '#abcdef', display: original };
  const updated = mergeSettings(current, { display: { mode: 'all', monitors: original.monitors } }, { language: 'en' });
  assert.equal(updated.language, 'id');
  assert.equal(updated.accent, '#abcdef');
  assert.equal(updated.display.mode, 'all');
  assert.throws(() => mergeSettings(current, undefined, {}), /must be an object/);
});

test('Electron displays are enriched with primary and native monitor IDs before mode selection', () => {
  const { enrichDisplays } = require('../src/display-config.cjs');
  const electron = [
    { id: 101, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 },
    { id: 202, bounds: { x: 1920, y: 0, width: 2560, height: 1440 }, scaleFactor: 1.5 }
  ];
  const native = [
    { id: 'DISPLAY\\B', monitorId: 'PNP-B', primary: false, bounds: { x: 1920, y: 0, width: 2560, height: 1440 } },
    { id: 'DISPLAY\\A', monitorId: 'PNP-A', primary: true, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }
  ];
  const enriched = enrichDisplays(electron, native, 101);
  assert.equal(enriched.find((d) => d.id === '101').primary, true);
  assert.equal(enriched.find((d) => d.id === '202').monitorId, 'PNP-B');

  const { manager } = fixture();
  manager.sync(enriched, { mode: 'primary' });
  assert.deepEqual(manager.values().filter((c) => !c.serviceOnly).map((c) => c.id), ['101']);
  manager.sync(enriched, { mode: 'custom', monitors: { 'PNP-B': true } });
  assert.deepEqual(manager.values().filter((c) => !c.serviceOnly).map((c) => c.id), ['202']);
});
