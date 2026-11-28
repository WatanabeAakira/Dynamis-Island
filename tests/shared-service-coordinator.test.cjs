const test = require('node:test');
const assert = require('node:assert/strict');
const { SharedServiceCoordinator } = require('../src/shared-service-coordinator.cjs');

function fixture() { const sent = []; return { sent, coordinator: new SharedServiceCoordinator((command) => sent.push(command)) }; }

test('audio watch aggregates renderer requests and a closing Island cannot stop another active request', () => {
  const { sent, coordinator } = fixture();
  coordinator.setAudio(1, 'off');
  coordinator.setAudio(2, 'full');
  coordinator.setAudio(3, 'master');
  const audioModes = () => sent.filter((x) => x.cmd === 'audio-watch').map((x) => x.mode);
  assert.deepEqual(audioModes(), ['off', 'full']);
  coordinator.release(2);
  assert.equal(audioModes().at(-1), 'master');
  coordinator.release(3);
  assert.equal(audioModes().at(-1), 'off');
});

test('system monitor chooses the most active renderer and retains global settings', () => {
  const { sent, coordinator } = fixture();
  const settings = { intervalMs: 1500, processCount: 7, alertsEnabled: true, cpuThreshold: 90 };
  coordinator.setSystemMonitor(1, { mode: 'expanded', activeTab: 'system-monitor' }, settings);
  coordinator.setSystemMonitor(2, { mode: 'hidden', activeTab: '' }, settings);
  assert.equal(sent.at(-1).mode, 'expanded');
  assert.equal(sent.at(-1).intervalMs, 1500);
  assert.equal(sent.at(-1).processCount, 7);
  coordinator.release(1, settings);
  assert.equal(sent.at(-1).mode, 'hidden');
  assert.equal(sent.at(-1).alertsEnabled, true);
});

test('shared system monitor preferences update without overriding an active display mode', () => {
  const { sent, coordinator } = fixture();
  coordinator.setSystemMonitor(1, { mode: 'compact', activeTab: 'system-monitor' }, { intervalMs: 1000 });
  coordinator.updateSystemMonitor({ intervalMs: 2500, metrics: { cpu: false } });
  assert.equal(sent.at(-1).mode, 'compact');
  assert.equal(sent.at(-1).intervalMs, 2500);
  assert.deepEqual(sent.at(-1).metrics, { cpu: false });
});

test('network and battery monitoring share one adaptive request and preserve their own settings', () => {
  const { sent, coordinator } = fixture();
  const settings = {
    networkMonitor: { enabled: true, monthlyAccounting: true, monthlyLimitGb: 150, preferredWifiId: 'wifi-1', retainHistory: false, notifications: false },
    batteryPower: { enabled: true, notifications: false, lowThreshold: 25, criticalThreshold: 10 }
  };
  coordinator.setNetworkPower(1, { mode: 'expanded', activeTab: 'network-monitor' }, settings);
  coordinator.setNetworkPower(2, { mode: 'compact', activeTab: 'battery-power' }, settings);
  const config = sent.at(-1);
  assert.equal(config.cmd, 'network-power-config');
  assert.equal(config.mode, 'expanded');
  assert.equal(config.activeTab, 'network-monitor');
  assert.equal(config.monthlyAccounting, true);
  assert.equal(config.monthlyLimitGb, 150);
  assert.equal(config.preferredWifiId, 'wifi-1');
  assert.equal(config.retainHistory, false);
  assert.equal(config.networkNotifications, false);
  assert.equal(config.batteryNotifications, false);
  coordinator.release(1, settings);
  assert.equal(sent.at(-1).mode, 'compact');
});
