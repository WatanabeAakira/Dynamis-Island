// Bunyi pengingat dibuat langsung dengan WebAudio (tanpa file audio).

let ctx = null;

function note(oscs, f, t, o, vol) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = o.type || 'sine';
  osc.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.peak * vol), t + (o.attack || 0.015));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.decay);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + o.decay + 0.05);
  oscs.push(osc);
}

// Satu putaran tiap jenis bunyi: [lama putaran (detik), fungsi pembuat nada]
const KINDS = {
  chime: [1.6, (add) => [880, 1318.5, 1046.5, 1568].forEach((f, i) => add(f, i * 0.22, { peak: 0.28, decay: 0.55 }))],
  bell: [3.0, (add) => [0, 1.0].forEach((s) => {
    add(523.25, s, { peak: 0.3, decay: 1.8 });
    add(1046.5, s, { peak: 0.16, decay: 1.1 });
    add(1568, s, { peak: 0.09, decay: 0.8 });
    add(2093, s, { peak: 0.05, decay: 0.5 });
  })],
  digital: [1.4, (add) => [0, 1, 2, 3].forEach((i) => add(1760, i * 0.22, { type: 'square', peak: 0.1, attack: 0.005, decay: 0.12 }))],
  pulse: [1.5, (add) => [523.25, 659.25, 783.99].forEach((f, i) => add(f, i * 0.3, { type: 'triangle', peak: 0.3, decay: 0.5 }))]
};

// Mengembalikan fungsi untuk menghentikan bunyi yang sedang dimainkan.
export function playSound(kind = 'chime', { volume = 0.7, rounds = 1 } = {}) {
  try {
    ctx = ctx || new AudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    const [len, build] = KINDS[kind] || KINDS.chime;
    const vol = Math.max(0, Math.min(1, volume)) / 0.7;
    const oscs = [];
    for (let r = 0; r < rounds; r++) {
      const base = ctx.currentTime + r * len;
      build((f, dt, o) => note(oscs, f, base + dt, o, vol));
    }
    return () => oscs.forEach((o) => { try { o.stop(); } catch {} });
  } catch {
    return () => {};
  }
}

export const playChime = (rounds = 3) => playSound('chime', { rounds });
