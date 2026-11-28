const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

let sizing;
async function loadSizing() {
  if (!sizing) {
    const source = await readFile(path.join(__dirname, '../src/renderer/layout-sizing.js'), 'utf8');
    sizing = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  }
  return sizing;
}

test('expanded layout sizes stay within global CSS pixel bounds', async () => {
  const module = await loadSizing();
  assert.deepEqual(module.EXPANDED_HEIGHT, { min: 200, default: 260, max: 360 });
  for (const requested of [-100, 200, 260, 300, 340, 360, 500]) {
    const resolved = module.clampExpandedHeight(requested);
    assert.ok(resolved >= 200 && resolved <= 360);
  }
  assert.equal(module.clampExpandedHeight(Number.NaN), 260);
});

test('feature sizing starts at the reviewed targets and clamps requests', async () => {
  const module = await loadSizing();
  assert.deepEqual(module.FEATURE_HEIGHTS, {
    media: 260, audio: 260, timer: 240, focus: 260, clock: 260,
    'copy-text': 310, translate: 330, calendar: 300, ai: 310,
    notif: 330, files: 330, apps: 300, weather: 300, settings: 260,
    'network-monitor': 260, 'battery-power': 260
  });
  assert.equal(module.preferredExpandedHeight('media'), 260);
  assert.equal(module.preferredExpandedHeight('clock'), 260);
  assert.equal(module.preferredExpandedHeight('copy-text'), 310);
  assert.equal(module.preferredExpandedHeight('translate'), 330);
  assert.equal(module.preferredExpandedHeight('timer', 'alarm-edit'), 300);
  assert.equal(module.preferredExpandedHeight('notif', '', 400), 360);
  assert.equal(module.preferredExpandedHeight('quick-settings'), 260);
  assert.equal(module.preferredExpandedHeight('system-monitor'), 260);
  assert.equal(module.preferredExpandedHeight('network-monitor'), 260);
  assert.equal(module.preferredExpandedHeight('battery-power'), 260);
  assert.equal(module.preferredExpandedHeight('unknown'), 260);
});

test('sizing remains a renderer concern and global expanded width is retained', async () => {
  const css = await readFile(path.join(__dirname, '../src/renderer/styles.css'), 'utf8');
  const app = await readFile(path.join(__dirname, '../src/renderer/app.js'), 'utf8');
  const audio = await readFile(path.join(__dirname, '../src/renderer/audio-view.js'), 'utf8');
  const quickSettings = await readFile(path.join(__dirname, '../src/renderer/quick-settings-view.js'), 'utf8');
  const systemMonitor = await readFile(path.join(__dirname, '../src/renderer/system-monitor-view.js'), 'utf8');
  assert.match(css, /#island\[data-mode="expanded"\]\s*\{[^}]*--w:\s*650px;[^}]*--h:\s*260px;/s);
  assert.doesNotMatch(css, /#island\[data-mode="expanded"\]\[data-tab="(?:audio|copy-text|translate)"\]\s*\{[^}]*--w:/s);
  assert.match(css, /#island\[data-mode="hover"\].*--h:\s*46px/);
  assert.match(css, /#island\[data-mode="expanded"\] \.content\s*\{[^}]*pointer-events:\s*auto/s);
  assert.doesNotMatch(css, /#island\[data-mode="expanded"\]\[data-content-ready="true"\] \.content\s*\{[^}]*pointer-events:\s*auto/s);
  assert.match(css, /tab-more-menu/);
  assert.match(css, /\.au-list[^\n]*overflow-y:\s*auto/);
  assert.match(css, /\.au-row \{[^}]*height:\s*38px/s);
  assert.match(css, /\.nt-list[^\n]*overflow-y:\s*auto/);
  assert.match(css, /\.ai-log[^\n]*overflow-y:\s*auto/);
  assert.match(app, /island:layoutrequest/);
  assert.match(audio, /el\.className = 'au-row'/);
  assert.match(app, /'quick-settings': renderQuickSettings/);
  assert.match(app, /'system-monitor': renderSystemMonitor/);
  assert.doesNotMatch(quickSettings, /--(?:w|h)\s*:/);
  assert.doesNotMatch(systemMonitor, /--(?:w|h)\s*:/);
});
