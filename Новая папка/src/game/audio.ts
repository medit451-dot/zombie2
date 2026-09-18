// Synthesized sound engine — zero audio assets, everything via WebAudio.
// Signal path:  sfx → [dry] → master
//                    ↘ [send] → convolver(reverb) → master
//               ambience (wind + drone + hum) → ambBus → master

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let reverb: ConvolverNode | null = null;
let reverbGain: GainNode | null = null;
let ambBus: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;

/* ambience nodes */
let amb: {
  wind: GainNode; windFilter: BiquadFilterNode; drone: GainNode; droneOsc: OscillatorNode;
  droneOsc2: OscillatorNode; hum: GainNode; heart: GainNode; heartT: number;
  started: boolean; intensity: number; danger: number;
} | null = null;

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.55;

  // soft-clip limiter keeps stacked gunfire from clipping
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 18; comp.ratio.value = 6;
  comp.attack.value = 0.003; comp.release.value = 0.18;
  master.connect(comp); comp.connect(ctx.destination);

  // 1s of white noise reused by every percussive sfx
  const len = ctx.sampleRate;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

  // impulse response: 1.6s decaying noise = big concrete room
  const irLen = Math.floor(ctx.sampleRate * 1.6);
  const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < irLen; i++) {
      const t = i / irLen;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6) * (i < 400 ? i / 400 : 1);
    }
  }
  reverb = ctx.createConvolver(); reverb.buffer = ir;
  reverbGain = ctx.createGain(); reverbGain.gain.value = 0.22;
  reverb.connect(reverbGain); reverbGain.connect(master);

  ambBus = ctx.createGain(); ambBus.gain.value = 0;
  ambBus.connect(master);
}

export function setMuted(m: boolean) {
  muted = m;
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.55, ctx.currentTime, 0.01);
}
export function isMuted() { return muted; }

/* ------------------------------------------------------------ */
/* primitives                                                    */
/* ------------------------------------------------------------ */

type ToneOpts = {
  freq: number; freq2?: number; dur: number; type?: OscillatorType;
  vol?: number; delay?: number; detune?: number; send?: number; attack?: number;
};

function tone({ freq, freq2, dur, type = 'square', vol = 0.2, delay = 0, detune = 0, send = 0, attack = 0.008 }: ToneOpts) {
  if (!ctx || !master || muted) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freq2 !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freq2), t0 + dur);
  osc.detune.value = detune;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g); g.connect(master);
  if (send > 0 && reverb) { const s = ctx.createGain(); s.gain.value = send; g.connect(s); s.connect(reverb); }
  osc.start(t0); osc.stop(t0 + dur + 0.03);
}

type NoiseOpts = {
  dur: number; vol?: number; delay?: number; lp?: number; lp2?: number;
  hp?: number; q?: number; send?: number; attack?: number;
};

function noise({ dur, vol = 0.2, delay = 0, lp, lp2, hp, q = 0.8, send = 0, attack = 0.006 }: NoiseOpts) {
  if (!ctx || !master || !noiseBuf || muted) return;
  const t0 = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  src.loopStart = Math.random() * 0.5;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let head: AudioNode = src;
  if (hp) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; head.connect(f); head = f; }
  if (lp !== undefined) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = q;
    f.frequency.setValueAtTime(lp, t0);
    if (lp2 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, lp2), t0 + dur);
    head.connect(f); head = f;
  }
  head.connect(g); g.connect(master);
  if (send > 0 && reverb) { const s = ctx.createGain(); s.gain.value = send; g.connect(s); s.connect(reverb); }
  src.start(t0); src.stop(t0 + dur + 0.05);
}

/** short click transient — gives gunshots their "crack" */
function click(vol: number, delay = 0) {
  noise({ dur: 0.012, vol, delay, hp: 2000, attack: 0.001 });
}

let lastShoot = 0;
let lastCoin = 0;
let lastHit = 0;
let lastStep = 0;
let lastGroan = 0;

const gate = (last: number, ms: number) => performance.now() - last >= ms;

/* ------------------------------------------------------------ */
/* ambience                                                      */
/* ------------------------------------------------------------ */

export function startAmbience() {
  if (!ctx || !ambBus || !noiseBuf || amb?.started) return;
  const t0 = ctx.currentTime;

  // wind: filtered noise with a slow LFO on the filter
  const wsrc = ctx.createBufferSource(); wsrc.buffer = noiseBuf; wsrc.loop = true;
  const windFilter = ctx.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.frequency.value = 320; windFilter.Q.value = 0.7;
  const wind = ctx.createGain(); wind.gain.value = 0.09;
  wsrc.connect(windFilter); windFilter.connect(wind); wind.connect(ambBus);
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
  const lfoG = ctx.createGain(); lfoG.gain.value = 180;
  lfo.connect(lfoG); lfoG.connect(windFilter.frequency);
  lfo.start(t0); wsrc.start(t0);

  // hive drone: two detuned saws through a dark lowpass
  const droneOsc = ctx.createOscillator(); droneOsc.type = 'sawtooth'; droneOsc.frequency.value = 41;
  const droneOsc2 = ctx.createOscillator(); droneOsc2.type = 'sawtooth'; droneOsc2.frequency.value = 41.6;
  const dFilt = ctx.createBiquadFilter(); dFilt.type = 'lowpass'; dFilt.frequency.value = 160; dFilt.Q.value = 2;
  const drone = ctx.createGain(); drone.gain.value = 0.0;
  droneOsc.connect(dFilt); droneOsc2.connect(dFilt); dFilt.connect(drone); drone.connect(ambBus);
  const dl = ctx.createOscillator(); dl.frequency.value = 0.21;
  const dlG = ctx.createGain(); dlG.gain.value = 60;
  dl.connect(dlG); dlG.connect(dFilt.frequency); dl.start(t0);
  droneOsc.start(t0); droneOsc2.start(t0);

  // bunker generator hum
  const humOsc = ctx.createOscillator(); humOsc.type = 'triangle'; humOsc.frequency.value = 60;
  const humOsc2 = ctx.createOscillator(); humOsc2.type = 'sine'; humOsc2.frequency.value = 120;
  const hum = ctx.createGain(); hum.gain.value = 0.025;
  humOsc.connect(hum); humOsc2.connect(hum); hum.connect(ambBus);
  humOsc.start(t0); humOsc2.start(t0);

  const heart = ctx.createGain(); heart.gain.value = 1; heart.connect(ambBus);

  amb = { wind, windFilter, drone, droneOsc, droneOsc2, hum, heart, heartT: 0, started: true, intensity: 0, danger: 0 };
  ambBus.gain.setTargetAtTime(1, t0, 0.8);
}

/** intensity: 0 menu … 1 full siege · danger: 0..1 low-health heartbeat */
export function setAmbience(intensity: number, danger: number, hiveAlive: boolean) {
  if (!ctx || !amb) return;
  const t = ctx.currentTime;
  amb.intensity = intensity; amb.danger = danger;
  amb.drone.gain.setTargetAtTime(hiveAlive ? 0.05 + intensity * 0.07 : 0.0, t, 0.6);
  amb.droneOsc.frequency.setTargetAtTime(hiveAlive ? 41 + intensity * 6 : 30, t, 1.2);
  amb.wind.gain.setTargetAtTime(0.06 + intensity * 0.05, t, 0.8);
  amb.hum.gain.setTargetAtTime(0.02 + intensity * 0.015, t, 0.5);
}

/** call every frame; schedules heartbeat thumps when danger > 0 */
export function tickAmbience(dt: number) {
  if (!ctx || !amb || muted || amb.danger <= 0) return;
  amb.heartT -= dt;
  if (amb.heartT <= 0) {
    const bpm = 70 + amb.danger * 70;
    amb.heartT = 60 / bpm;
    const v = 0.12 + amb.danger * 0.2;
    tone({ freq: 62, freq2: 38, dur: 0.14, type: 'sine', vol: v, attack: 0.004 });
    tone({ freq: 56, freq2: 34, dur: 0.12, type: 'sine', vol: v * 0.7, delay: 0.16, attack: 0.004 });
  }
}

export function stopAmbience() {
  if (!ctx || !ambBus) return;
  ambBus.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
  if (amb) { amb.danger = 0; amb.intensity = 0; }
}

/* ------------------------------------------------------------ */
/* sfx                                                           */
/* ------------------------------------------------------------ */

export const sfx = {
  /* ---- weapons ---- */
  shoot() {
    if (!gate(lastShoot, 45)) return;
    lastShoot = performance.now();
    click(0.22);
    tone({ freq: 340 + Math.random() * 60, freq2: 150, dur: 0.07, type: 'square', vol: 0.07, send: 0.5 });
    noise({ dur: 0.07, vol: 0.09, hp: 900, lp: 4000, send: 0.6 });
    noise({ dur: 0.18, vol: 0.03, lp: 900, lp2: 200, delay: 0.02, send: 0.8 });
  },
  minigun() {
    if (!gate(lastShoot, 28)) return;
    lastShoot = performance.now();
    click(0.16);
    tone({ freq: 420 + Math.random() * 70, freq2: 180, dur: 0.05, type: 'square', vol: 0.055, send: 0.4 });
    noise({ dur: 0.045, vol: 0.06, hp: 1100, lp: 5200, send: 0.5 });
  },
  minigunSpin(rate: number) {
    // short whirr slice, called while spinning up
    tone({ freq: 90 + rate * 260, dur: 0.06, type: 'sawtooth', vol: 0.02 + rate * 0.02, attack: 0.02 });
  },
  shotgun() {
    click(0.3);
    noise({ dur: 0.26, vol: 0.3, lp: 3600, lp2: 260, q: 1.1, send: 0.9 });
    tone({ freq: 180, freq2: 48, dur: 0.22, type: 'square', vol: 0.16, send: 0.6 });
    tone({ freq: 90, freq2: 36, dur: 0.3, type: 'sine', vol: 0.22, delay: 0.01 });
    noise({ dur: 0.5, vol: 0.05, lp: 700, lp2: 120, delay: 0.05, send: 1 });
  },
  pump() {
    noise({ dur: 0.05, vol: 0.07, hp: 1500, lp: 5000 });
    noise({ dur: 0.05, vol: 0.09, hp: 900, lp: 3500, delay: 0.11 });
    tone({ freq: 700, freq2: 450, dur: 0.04, type: 'square', vol: 0.03, delay: 0.11 });
  },
  sniper() {
    click(0.3);
    noise({ dur: 0.16, vol: 0.18, hp: 500, lp: 5200, lp2: 900, send: 0.9 });
    tone({ freq: 520, freq2: 130, dur: 0.16, type: 'square', vol: 0.13, send: 0.7 });
    tone({ freq: 240, freq2: 70, dur: 0.26, type: 'sawtooth', vol: 0.1, delay: 0.04, send: 0.6 });
    noise({ dur: 0.6, vol: 0.04, lp: 500, lp2: 100, delay: 0.08, send: 1 });
  },
  boltCycle() {
    tone({ freq: 900, freq2: 700, dur: 0.03, type: 'square', vol: 0.035 });
    noise({ dur: 0.035, vol: 0.05, hp: 2500, delay: 0.09 });
  },
  rail() {
    tone({ freq: 1500, freq2: 180, dur: 0.42, type: 'sawtooth', vol: 0.15, send: 0.8 });
    tone({ freq: 2400, freq2: 300, dur: 0.34, type: 'sine', vol: 0.1, delay: 0.02, send: 0.6 });
    noise({ dur: 0.5, vol: 0.2, lp: 4200, lp2: 200, q: 1.3, send: 1 });
    tone({ freq: 70, freq2: 30, dur: 0.5, type: 'sine', vol: 0.22, delay: 0.05 });
  },
  railCharge() {
    tone({ freq: 220, freq2: 880, dur: 0.5, type: 'sine', vol: 0.045, attack: 0.05 });
    tone({ freq: 226, freq2: 900, dur: 0.5, type: 'triangle', vol: 0.03, attack: 0.05, detune: 12 });
  },
  turret() {
    click(0.1);
    tone({ freq: 620, freq2: 380, dur: 0.06, type: 'triangle', vol: 0.06, send: 0.4 });
  },
  tesla() {
    noise({ dur: 0.12, vol: 0.12, hp: 1800, lp: 8000, send: 0.5 });
    tone({ freq: 1800, freq2: 500, dur: 0.1, type: 'sawtooth', vol: 0.05 });
    tone({ freq: 90, freq2: 60, dur: 0.14, type: 'square', vol: 0.06 });
  },
  teslaCharge() {
    tone({ freq: 60, freq2: 140, dur: 0.6, type: 'sawtooth', vol: 0.03, attack: 0.1 });
  },
  reload() {
    noise({ dur: 0.04, vol: 0.06, hp: 1200, lp: 4000 });
    tone({ freq: 500, freq2: 380, dur: 0.05, type: 'square', vol: 0.035, delay: 0.14 });
    noise({ dur: 0.05, vol: 0.08, hp: 800, lp: 3000, delay: 0.3 });
  },
  swap() {
    noise({ dur: 0.05, vol: 0.06, hp: 1000, lp: 4000 });
    tone({ freq: 520, freq2: 720, dur: 0.06, type: 'square', vol: 0.04, delay: 0.05 });
    tone({ freq: 900, dur: 0.03, type: 'square', vol: 0.03, delay: 0.12 });
  },
  casing() {
    tone({ freq: 3200 + Math.random() * 1200, freq2: 2400, dur: 0.03, type: 'sine', vol: 0.025 });
  },
  dryFire() { tone({ freq: 800, freq2: 500, dur: 0.03, type: 'square', vol: 0.04 }); },

  /* ---- impacts ---- */
  hit() {
    if (!gate(lastHit, 35)) return;
    lastHit = performance.now();
    noise({ dur: 0.07, vol: 0.1, lp: 1400, lp2: 500 });
    tone({ freq: 150, freq2: 90, dur: 0.06, type: 'triangle', vol: 0.06 });
  },
  headshot() {
    noise({ dur: 0.09, vol: 0.14, lp: 2200, lp2: 400 });
    tone({ freq: 1400, freq2: 900, dur: 0.06, type: 'sine', vol: 0.06 });
    tone({ freq: 200, freq2: 80, dur: 0.1, type: 'triangle', vol: 0.08 });
  },
  ricochet() {
    tone({ freq: 2600 + Math.random() * 900, freq2: 600, dur: 0.16, type: 'sine', vol: 0.045, send: 0.7 });
  },
  die() {
    tone({ freq: 230, freq2: 45, dur: 0.2, type: 'sawtooth', vol: 0.12, send: 0.5 });
    noise({ dur: 0.2, vol: 0.14, lp: 1100, lp2: 200 });
  },
  gib() {
    noise({ dur: 0.28, vol: 0.2, lp: 1600, lp2: 150, q: 1.2, send: 0.6 });
    tone({ freq: 170, freq2: 40, dur: 0.26, type: 'sawtooth', vol: 0.12 });
    noise({ dur: 0.12, vol: 0.08, lp: 600, delay: 0.1 });
  },
  bruteDie() {
    tone({ freq: 160, freq2: 30, dur: 0.45, type: 'sawtooth', vol: 0.2, send: 0.7 });
    noise({ dur: 0.5, vol: 0.22, lp: 1600, lp2: 120, send: 0.8 });
  },
  groan() {
    if (!gate(lastGroan, 900)) return;
    lastGroan = performance.now();
    const f = 90 + Math.random() * 60;
    tone({ freq: f, freq2: f * 0.7, dur: 0.7, type: 'sawtooth', vol: 0.035, attack: 0.15, send: 0.8 });
    tone({ freq: f * 1.01, freq2: f * 0.68, dur: 0.7, type: 'triangle', vol: 0.03, attack: 0.15, detune: -8 });
  },
  zombieAttack() {
    noise({ dur: 0.18, vol: 0.09, hp: 500, lp: 2600, lp2: 900 });
    tone({ freq: 260, freq2: 120, dur: 0.16, type: 'sawtooth', vol: 0.06 });
  },
  spawn() {
    noise({ dur: 0.3, vol: 0.08, lp: 900, lp2: 300, q: 1.6, send: 0.7 });
    tone({ freq: 120, freq2: 260, dur: 0.25, type: 'sine', vol: 0.05, attack: 0.05 });
  },

  /* ---- player ---- */
  hurt() {
    tone({ freq: 170, freq2: 60, dur: 0.22, type: 'sawtooth', vol: 0.2 });
    noise({ dur: 0.16, vol: 0.14, lp: 900, lp2: 200 });
    tone({ freq: 520, freq2: 380, dur: 0.12, type: 'square', vol: 0.05, delay: 0.02 });
  },
  step(run: boolean) {
    if (!gate(lastStep, 90)) return;
    lastStep = performance.now();
    noise({ dur: run ? 0.05 : 0.04, vol: run ? 0.05 : 0.03, lp: 900, lp2: 250, hp: 120 });
    tone({ freq: 140, freq2: 80, dur: 0.035, type: 'sine', vol: run ? 0.05 : 0.03 });
  },
  playerDie() {
    tone({ freq: 220, freq2: 40, dur: 0.6, type: 'sawtooth', vol: 0.18, send: 0.8 });
    noise({ dur: 0.4, vol: 0.14, lp: 1200, lp2: 150, delay: 0.1, send: 0.6 });
  },

  /* ---- base / hive ---- */
  baseHit() {
    tone({ freq: 95, freq2: 55, dur: 0.16, type: 'sine', vol: 0.18 });
    noise({ dur: 0.14, vol: 0.16, lp: 600, lp2: 150, q: 1.4, send: 0.5 });
    tone({ freq: 1800, freq2: 1200, dur: 0.05, type: 'triangle', vol: 0.03 });
  },
  alarm() {
    tone({ freq: 660, dur: 0.18, type: 'square', vol: 0.05, send: 0.6 });
    tone({ freq: 520, dur: 0.18, type: 'square', vol: 0.05, delay: 0.2, send: 0.6 });
  },
  hiveHit() {
    noise({ dur: 0.08, vol: 0.08, lp: 3000, lp2: 800 });
    tone({ freq: 900 + Math.random() * 300, freq2: 400, dur: 0.08, type: 'sine', vol: 0.05, send: 0.6 });
  },
  hiveCrack() {
    noise({ dur: 0.18, vol: 0.14, hp: 1500, lp: 7000, send: 0.8 });
    tone({ freq: 2400, freq2: 700, dur: 0.14, type: 'triangle', vol: 0.07, send: 0.6 });
  },
  boom() {
    noise({ dur: 0.65, vol: 0.32, lp: 3200, lp2: 90, send: 1 });
    tone({ freq: 130, freq2: 34, dur: 0.55, type: 'sine', vol: 0.3 });
    tone({ freq: 70, freq2: 28, dur: 0.6, type: 'triangle', vol: 0.22 });
  },
  rush() {
    tone({ freq: 60, freq2: 150, dur: 0.55, type: 'sawtooth', vol: 0.12, detune: 8, send: 0.7 });
    tone({ freq: 62, freq2: 140, dur: 0.55, type: 'sawtooth', vol: 0.1, detune: -10, delay: 0.04, send: 0.7 });
    noise({ dur: 0.5, vol: 0.06, lp: 400, lp2: 900, delay: 0.1 });
  },

  /* ---- economy / ui ---- */
  coin() {
    if (!gate(lastCoin, 30)) return;
    lastCoin = performance.now();
    tone({ freq: 880, dur: 0.06, type: 'sine', vol: 0.08 });
    tone({ freq: 1320, dur: 0.09, type: 'sine', vol: 0.08, delay: 0.055 });
  },
  combo(step: number) {
    const base = 660 * Math.pow(1.06, Math.min(24, step));
    tone({ freq: base, dur: 0.07, type: 'triangle', vol: 0.07 });
    tone({ freq: base * 1.5, dur: 0.1, type: 'triangle', vol: 0.06, delay: 0.05 });
  },
  ui() { tone({ freq: 520, dur: 0.05, type: 'square', vol: 0.07 }); },
  buy() {
    tone({ freq: 520, dur: 0.08, type: 'triangle', vol: 0.12 });
    tone({ freq: 660, dur: 0.08, type: 'triangle', vol: 0.12, delay: 0.07 });
    tone({ freq: 880, dur: 0.12, type: 'triangle', vol: 0.12, delay: 0.14 });
  },
  repair() {
    tone({ freq: 320, freq2: 640, dur: 0.25, type: 'sine', vol: 0.1 });
    noise({ dur: 0.06, vol: 0.05, hp: 1500, delay: 0.05 });
    noise({ dur: 0.06, vol: 0.05, hp: 1500, delay: 0.2 });
  },
  build() {
    noise({ dur: 0.08, vol: 0.1, hp: 700, lp: 3000 });
    tone({ freq: 200, freq2: 120, dur: 0.12, type: 'square', vol: 0.06, delay: 0.02 });
    noise({ dur: 0.08, vol: 0.1, hp: 700, lp: 3000, delay: 0.16 });
    tone({ freq: 240, freq2: 140, dur: 0.12, type: 'square', vol: 0.06, delay: 0.18 });
  },
  levelClear() {
    [523, 659, 784, 1047].forEach((f, i) =>
      tone({ freq: f, dur: 0.16, type: 'triangle', vol: 0.14, delay: i * 0.1, send: 0.5 }));
  },
  gameOver() {
    [330, 247, 165, 110].forEach((f, i) =>
      tone({ freq: f, freq2: f * 0.94, dur: 0.34, type: 'sawtooth', vol: 0.14, delay: i * 0.18, send: 0.6 }));
  },
  victory() {
    [523, 659, 784, 1047, 1319].forEach((f, i) =>
      tone({ freq: f, dur: 0.22, type: 'triangle', vol: 0.15, delay: i * 0.12, send: 0.5 }));
  },
  countdown() { tone({ freq: 880, dur: 0.08, type: 'square', vol: 0.06 }); },
};
