const { DISPLAY_MODES, displayPreferenceKey } = require('./display-config.cjs');

// Owns Island BrowserWindows while the main process owns the shared services/data.
// Window contexts deliberately contain only transient interaction state.
class IslandWindowManager {
  constructor({ create, onPrimaryChanged = () => {} }) {
    this.createWindow = create;
    this.onPrimaryChanged = onPrimaryChanged;
    this.instances = new Map();
    this.displays = [];
    this.pending = new Set();
  }

  id(display) { return String(display.id); }
  preferenceId(display) { return displayPreferenceKey(display); }
  get(id) { return this.instances.get(String(id)); }
  isVisibleDisplay(id) { const context = this.get(id); return !!context && !context.serviceOnly; }
  values() { return [...this.instances.values()]; }
  broadcast(channel, payload) {
    for (const context of this.instances.values()) {
      if (!context.window.isDestroyed()) context.window.webContents.send(channel, payload);
    }
  }
  primary() { return this.instances.get(this.id(this.displays.find((d) => d.primary) || {})) || null; }

  holdForConfirmation(display) {
    const id = this.id(display);
    this.pending.add(id);
  }

  decide(displayId, show) {
    const id = String(displayId);
    this.pending.delete(id);
    void show; // The persistent display preference is updated by the caller.
    return true;
  }

  sync(displays = this.displays, config = {}) {
    const before = this.primary()?.display?.id;
    this.displays = [...displays];
    const mode = DISPLAY_MODES.has(config.mode) ? config.mode : 'primary';
    const visibility = config.monitors || {};
    const available = new Set(this.displays.map((d) => this.id(d)));
    for (const id of this.instances.keys()) {
      if (!available.has(id)) this.close(id);
    }
    for (const id of this.pending) if (!available.has(id)) this.pending.delete(id);

    const targets = this.displays.filter((d) => {
      const id = this.id(d);
      if (this.pending.has(id)) return false;
      if (config.alarmTakeover) return true;
      if (mode === 'all') return true;
      if (mode === 'custom') return visibility[this.preferenceId(d)] === true || visibility[id] === true;
      return !!d.primary;
    });
    const targetIds = new Set(targets.map((d) => this.id(d)));
    const effectiveTargets = [...targets];
    const primaryDisplay = this.displays.find((d) => d.primary);
    if (primaryDisplay && !targetIds.has(this.id(primaryDisplay))) effectiveTargets.push(primaryDisplay);
    const effectiveIds = new Set(effectiveTargets.map((d) => this.id(d)));
    for (const id of this.instances.keys()) if (!effectiveIds.has(id)) this.close(id);
    for (const display of effectiveTargets) {
      const id = this.id(display);
      const existing = this.instances.get(id);
      if (existing) {
        existing.display = display;
        existing.serviceOnly = !targetIds.has(id);
        existing.window.setBounds(this.bounds(display));
      } else {
        const context = { id, display, serviceOnly: !targetIds.has(id), readyToShow: false, window: null, rect: null, rendererOver: false, ignoring: true, lastIgnoreAt: 0, hoverInside: false, hoverCount: 0, focusAllowed: false };
        context.window = this.createWindow(display, context);
        context.window.setBounds(this.bounds(display));
        this.instances.set(id, context);
      }
    }
    const after = this.primary()?.display?.id;
    if (before !== after) this.onPrimaryChanged(this.primary());
    return this.values();
  }

  bounds(display) {
    const b = display.bounds;
    const width = Math.min(700, b.width);
    return { x: Math.round(b.x + (b.width - width) / 2), y: b.y, width, height: 400 };
  }

  close(displayId) {
    const id = String(displayId);
    const context = this.instances.get(id);
    if (!context) return false;
    this.instances.delete(id);
    if (!context.window.isDestroyed()) context.window.destroy();
    return true;
  }

  forget(displayId, window) {
    const context = this.instances.get(String(displayId));
    if (!context || context.window !== window) return false;
    this.instances.delete(String(displayId));
    return true;
  }

  closeAll() { for (const id of [...this.instances.keys()]) this.close(id); }
}

module.exports = { IslandWindowManager };

