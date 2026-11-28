// Several independent Island renderers share one native helper process.
// Aggregate their subscriptions so one renderer cannot stop work another needs.
class SharedServiceCoordinator {
  constructor(send) {
    this.send = send;
    this.audio = new Map();
    this.systemMonitor = new Map();
    this.networkPower = new Map();
    this.lastAudio = null;
    this.lastMonitor = '';
    this.lastNetworkPower = '';
  }

  setAudio(id, mode) {
    this.audio.set(String(id), ['off', 'master', 'full'].includes(mode) ? mode : 'off');
    const values = [...this.audio.values()];
    const aggregate = values.includes('full') ? 'full' : values.includes('master') ? 'master' : 'off';
    if (aggregate === this.lastAudio) return;
    this.lastAudio = aggregate;
    this.send({ cmd: 'audio-watch', mode: aggregate });
  }

  setSystemMonitor(id, request, settings = {}) {
    this.systemMonitor.set(String(id), { mode: request?.mode || 'hidden', activeTab: request?.activeTab || '' });
    this.updateSystemMonitor(settings);
  }

  updateSystemMonitor(settings = {}) {
    const priority = { hidden: 0, compact: 1, hover: 2, expanded: 3 };
    const request = [...this.systemMonitor.values()].sort((a, b) => (priority[b.mode] || 0) - (priority[a.mode] || 0))[0] || { mode: 'hidden', activeTab: '' };
    const config = settings || {};
    const payload = {
      cmd: 'system-monitor-config', mode: request.mode, activeTab: request.activeTab,
      intervalMs: config.intervalMs || 1000, processCount: config.processCount || 5,
      processMonitoring: config.processMonitoring !== false, sort: config.sort || 'cpu',
      compactMetric: config.compactMetric || 'cpu', metrics: config.metrics || {},
      alertsEnabled: config.alertsEnabled === true, cpuThreshold: config.cpuThreshold || 95,
      ramThreshold: config.ramThreshold || 90
    };
    const signature = JSON.stringify(payload);
    if (signature === this.lastMonitor) return;
    this.lastMonitor = signature;
    this.send(payload);
  }

  setNetworkPower(id, request, settings = {}) {
    const mode = ['hidden', 'compact', 'hover', 'expanded'].includes(request?.mode) ? request.mode : 'hidden';
    const activeTab = ['network-monitor', 'battery-power'].includes(request?.activeTab) ? request.activeTab : '';
    this.networkPower.set(String(id), { mode, activeTab });
    this.updateNetworkPower(settings);
  }

  updateNetworkPower(settings = {}) {
    const priority = { hidden: 0, compact: 1, hover: 2, expanded: 3 };
    const request = [...this.networkPower.values()].sort((a, b) => (priority[b.mode] || 0) - (priority[a.mode] || 0))[0] || { mode: 'hidden', activeTab: '' };
    const network = settings.networkMonitor || {};
    const battery = settings.batteryPower || {};
    const payload = {
      cmd: 'network-power-config', mode: request.mode, activeTab: request.activeTab,
      networkEnabled: network.enabled !== false, batteryEnabled: battery.enabled !== false,
      batteryNotifications: battery.notifications !== false,
      lowBatteryThreshold: Number.isFinite(Number(battery.lowThreshold)) ? Math.max(5, Math.min(50, Number(battery.lowThreshold))) : 20,
      criticalBatteryThreshold: Number.isFinite(Number(battery.criticalThreshold)) ? Math.max(5, Math.min(20, Number(battery.criticalThreshold))) : 10,
      monthlyAccounting: network.monthlyAccounting !== false,
      networkNotifications: network.notifications !== false,
      preferredWifiId: network.preferredWifiId || null,
      monthlyLimitGb: Number.isFinite(Number(network.monthlyLimitGb)) && Number(network.monthlyLimitGb) > 0 ? Number(network.monthlyLimitGb) : null,
      retainHistory: network.retainHistory !== false
    };
    const signature = JSON.stringify(payload);
    if (signature === this.lastNetworkPower) return;
    this.lastNetworkPower = signature;
    this.send(payload);
  }

  release(id, settings = {}) {
    this.audio.delete(String(id));
    this.systemMonitor.delete(String(id));
    this.networkPower.delete(String(id));
    const values = [...this.audio.values()];
    const aggregate = values.includes('full') ? 'full' : values.includes('master') ? 'master' : 'off';
    if (aggregate !== this.lastAudio) { this.lastAudio = aggregate; this.send({ cmd: 'audio-watch', mode: aggregate }); }
    this.updateSystemMonitor(settings?.systemMonitor || settings);
    if (settings?.networkMonitor || settings?.batteryPower) this.updateNetworkPower(settings);
  }
}

module.exports = { SharedServiceCoordinator };
