import { sfx, setAmbience, tickAmbience } from './audio';
import { loadSprites, zombieSprites, heroSprites, gunSprites } from './sprites';
import type { ZAnim, HeroAnim, GunId } from './sprites';

/* ============================================================
   HIVE BREAKER — canvas game engine
   Fixed-timestep sim, responsive world, juicy particles/ffx
   ============================================================ */

const TAU = Math.PI * 2;
const STEP = 1 / 60;
/** zombie swipe: total length and the moment the claws connect */
const ATTACK_DUR = 0.55;
const ATTACK_HIT = 0.3;
const MAX_CORPSES = 36;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1));
const clamp = (v: number, a: number, b: number) => v < a ? a : v > b ? b : v;
const dist2 = (ax: number, ay: number, bx: number, by: number) => {
  const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy;
};
const angLerp = (a: number, b: number, t: number) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
};

type ZType = 'walker' | 'runner' | 'tank' | 'brute';

interface ZDef { hp: number; speed: number; dmg: number; r: number; score: number; coin: [number, number]; }
const ZDEFS: Record<ZType, ZDef> = {
  walker: { hp: 30, speed: 42, dmg: 9, r: 14, score: 100, coin: [4, 7] },
  runner: { hp: 20, speed: 94, dmg: 6, r: 11, score: 150, coin: [3, 6] },
  tank:   { hp: 135, speed: 30, dmg: 18, r: 21, score: 300, coin: [10, 15] },
  brute:  { hp: 270, speed: 38, dmg: 26, r: 26, score: 500, coin: [18, 28] },
};

interface LevelCfg {
  name: string; lairHp: number; interval: number; cap: number; rush: number;
  hpMul: number; dmgMul: number; spdMul: number; r: number;
  weights: [ZType, number][];
}
const LEVELS: LevelCfg[] = [
  { name: 'OUTBREAK',    lairHp: 170, interval: 1.90, cap: 16, rush: 15,  hpMul: 1,    dmgMul: 1,    spdMul: 1,    r: 56, weights: [['walker', .92], ['runner', .08]] },
  { name: 'ESCALATION',  lairHp: 300, interval: 1.60, cap: 19, rush: 13,  hpMul: 1.2,  dmgMul: 1.08, spdMul: 1.04, r: 62, weights: [['walker', .72], ['runner', .22], ['tank', .06]] },
  { name: 'ONSLAUGHT',   lairHp: 450, interval: 1.35, cap: 22, rush: 11,  hpMul: 1.45, dmgMul: 1.18, spdMul: 1.10, r: 68, weights: [['walker', .55], ['runner', .3], ['tank', .15]] },
  { name: 'OVERRUN',     lairHp: 640, interval: 1.15, cap: 25, rush: 9.5, hpMul: 1.75, dmgMul: 1.3,  spdMul: 1.16, r: 74, weights: [['walker', .44], ['runner', .31], ['tank', .16], ['brute', .09]] },
  { name: 'APOCALYPSE',  lairHp: 900, interval: 0.95, cap: 28, rush: 8,   hpMul: 2.15, dmgMul: 1.45, spdMul: 1.24, r: 82, weights: [['walker', .34], ['runner', .3], ['tank', .2], ['brute', .16]] },
];
export const LEVEL_COUNT = LEVELS.length;

/* ---------------- weapons ---------------- */
export type WeaponId = GunId;

/** how each gun sits in the hand + its visual signature */
interface GunMeta {
  len: number;                 // drawn length in world px
  grip: [number, number];      // rear-hand anchor inside the sprite box (fractions)
  fore: [number, number];      // off-hand anchor (foregrip / pump / support)
  muzzle: [number, number];    // muzzle point inside the sprite box
  eject: [number, number];     // ejection port
  casing: 'brass' | 'shell' | 'none';
  heat: number;                // heat added per shot (0 = never overheats)
  trail: number;               // lingering tracer life (s), 0 = none
  trailW: number;
  kick: number;                // hero body recoil nudge (px)
}
const GUN_META: Record<WeaponId, GunMeta> = {
  sidearm: { len: 20, grip: [0.30, 0.68], fore: [0.42, 0.74], muzzle: [1, 0.30], eject: [0.45, 0.28], casing: 'brass', heat: 0,     trail: 0,    trailW: 0,   kick: 1.2 },
  smg:     { len: 27, grip: [0.48, 0.55], fore: [0.70, 0.64], muzzle: [1, 0.32], eject: [0.55, 0.30], casing: 'brass', heat: 0.05,  trail: 0,    trailW: 0,   kick: 1.0 },
  shotgun: { len: 38, grip: [0.36, 0.52], fore: [0.62, 0.60], muzzle: [1, 0.36], eject: [0.42, 0.42], casing: 'shell', heat: 0,     trail: 0.06, trailW: 2,   kick: 3.4 },
  rifle:   { len: 44, grip: [0.40, 0.60], fore: [0.62, 0.66], muzzle: [1, 0.48], eject: [0.46, 0.50], casing: 'brass', heat: 0,     trail: 0.14, trailW: 2.2, kick: 2.2 },
  minigun: { len: 40, grip: [0.34, 0.52], fore: [0.60, 0.64], muzzle: [1, 0.46], eject: [0.30, 0.78], casing: 'brass', heat: 0.045, trail: 0,    trailW: 0,   kick: 0.45 },
  railgun: { len: 42, grip: [0.36, 0.60], fore: [0.62, 0.66], muzzle: [1, 0.46], eject: [0.40, 0.30], casing: 'none',  heat: 0,     trail: 0.32, trailW: 5,   kick: 4.5 },
};

/** where the hero's hanging rear hand and far shoulder sit inside his frame (fractions) */
const HERO_HAND: [number, number] = [0.615, 0.575];
const HERO_SHOULDER: [number, number] = [0.42, 0.33];
const HERO_WAIST = 0.52;

export interface WeaponDef {
  id: WeaponId; name: string; desc: string; icon: string; cost: number;
  dmg: number; interval: number; pellets: number; spread: number;
  speed: number; pierce: number; life: number; color: string;
  shake: number; sound: 'shoot' | 'shotgun' | 'sniper' | 'rail' | 'minigun';
  /** magazine size (0 = no reload) and reload time in seconds */
  mag: number; reload: number;
}

const MAGS: Record<WeaponId, { mag: number; reload: number }> = {
  sidearm: { mag: 15, reload: 1.0 },
  smg:     { mag: 32, reload: 1.5 },
  shotgun: { mag: 6,  reload: 1.9 },
  rifle:   { mag: 8,  reload: 1.7 },
  minigun: { mag: 120, reload: 3.2 },
  railgun: { mag: 4,  reload: 2.2 },
};

/** muzzle distance from the grip, per weapon (world px) */
const BARREL: Record<WeaponId, number> = {
  sidearm: 17, smg: 23, shotgun: 27, rifle: 33, minigun: 27, railgun: 34,
};

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  sidearm: { id: 'sidearm', name: 'Sidearm',     desc: 'Reliable service pistol. 15-round mag, quick reload.',   icon: 'pistol',  cost: 0,    dmg: 10, interval: 0.230, pellets: 1, spread: 0.030, speed: 660,  pierce: 0, life: 1.0, color: '#ffd27a', shake: 0.55, sound: 'shoot',   ...MAGS.sidearm },
  smg:     { id: 'smg',     name: 'Riot SMG',    desc: 'Blistering fire rate, low damage. Shreds runners.',       icon: 'smg',     cost: 220,  dmg: 7,  interval: 0.098, pellets: 1, spread: 0.070, speed: 700,  pierce: 0, life: 0.9, color: '#ffe08a', shake: 0.4,  sound: 'minigun', ...MAGS.smg },
  shotgun: { id: 'shotgun', name: 'Breacher',    desc: '4-pellet blast. Brutal point-blank on the horde.',        icon: 'shotgun', cost: 380,  dmg: 9,  interval: 0.600, pellets: 4, spread: 0.150, speed: 620,  pierce: 0, life: 0.6, color: '#ffbe6b', shake: 3.2,  sound: 'shotgun', ...MAGS.shotgun },
  rifle:   { id: 'rifle',   name: 'DMR-7',       desc: 'Hard-hitting rounds that punch through one body.',        icon: 'rifle',   cost: 560,  dmg: 34, interval: 0.330, pellets: 1, spread: 0.012, speed: 980,  pierce: 1, life: 1.3, color: '#b8f0ff', shake: 1.6,  sound: 'sniper',  ...MAGS.rifle },
  minigun: { id: 'minigun', name: 'Hive Sweeper', desc: 'Spins up into a wall of lead. Slow to swing around.',    icon: 'minigun', cost: 980,  dmg: 9,  interval: 0.055, pellets: 1, spread: 0.110, speed: 820,  pierce: 0, life: 0.9, color: '#ffdc9b', shake: 0.7,  sound: 'minigun', ...MAGS.minigun },
  railgun: { id: 'railgun', name: 'Rail Driver', desc: 'Charged hypervelocity slug skewers 5 targets at once.',   icon: 'railgun', cost: 1500, dmg: 95, interval: 0.880, pellets: 1, spread: 0.004, speed: 1500, pierce: 4, life: 1.6, color: '#c9a6ff', shake: 5.5,  sound: 'rail',    ...MAGS.railgun },
};
export const WEAPON_ORDER: WeaponId[] = ['sidearm', 'smg', 'shotgun', 'rifle', 'minigun', 'railgun'];

type ShopId = 'repair' | 'walls' | 'damage' | 'firerate' | 'multishot' | 'turret' | 'speed' | 'tesla' | 'barricade' | 'medbay';
export type { ShopId };
const SHOP_DEFS: Record<ShopId, { name: string; desc: string; base: number; growth: number; max: number; icon: string; group: 'base' | 'hero' }> = {
  repair:    { name: 'Field Repair',     desc: 'Restore 35% bunker integrity',                 base: 45,  growth: 1.5,  max: Infinity, icon: 'wrench', group: 'base' },
  walls:     { name: 'Armor Plating',    desc: '+30 max integrity, bolts plate onto the hull',  base: 60,  growth: 1.6,  max: 5,  icon: 'shield',    group: 'base' },
  barricade: { name: 'Razor Barricade',  desc: 'Wire line that slows & cuts anything crossing', base: 90,  growth: 1.7,  max: 3,  icon: 'wire',      group: 'base' },
  turret:    { name: 'Sentry Tower',     desc: 'Raise a turret tower on the bunker flank',      base: 130, growth: 1.7,  max: 2,  icon: 'turret',    group: 'base' },
  tesla:     { name: 'Tesla Emitter',    desc: 'Arc coil chains lightning through the horde',   base: 260, growth: 1.9,  max: 3,  icon: 'bolt',      group: 'base' },
  medbay:    { name: 'Med Station',      desc: 'Heals you fast while standing near the bunker', base: 120, growth: 1.8,  max: 2,  icon: 'cross',     group: 'base' },
  damage:    { name: 'HP Rounds',        desc: '+30% bullet damage',                            base: 55,  growth: 1.42, max: 8,  icon: 'bullet',    group: 'hero' },
  firerate:  { name: 'Rapid Fire',       desc: '+14% fire rate',                                base: 50,  growth: 1.42, max: 8,  icon: 'gauge',     group: 'hero' },
  multishot: { name: 'Multi-Shot',       desc: '+1 projectile per volley',                      base: 95,  growth: 1.6,  max: 3,  icon: 'spread',    group: 'hero' },
  speed:     { name: 'Combat Boots',     desc: '+9% move speed',                                base: 45,  growth: 1.5,  max: 4,  icon: 'boots',     group: 'hero' },
};

interface Bullet {
  x: number; y: number; px: number; py: number; vx: number; vy: number;
  dmg: number; life: number; color: string; turret?: boolean;
  pierce: number; hits: Zombie[]; big?: boolean;
  trail?: number; trailW?: number;
}
interface Casing {
  x: number; y: number; vx: number; vy: number; rot: number; vr: number;
  ground: number; life: number; rest: boolean; kind: 'brass' | 'shell';
}
interface Trail { x1: number; y1: number; x2: number; y2: number; life: number; max: number; color: string; w: number; }
interface Zombie {
  x: number; y: number; kx: number; ky: number; r: number; hp: number; maxHp: number;
  speed: number; dmg: number; type: ZType; face: number; atkCd: number; hitFlash: number;
  phase: number; wob: number; score: number; coinMin: number; coinMax: number;
  anim: ZAnim; animT: number;
  /** 0..1 rise-out-of-the-ground intro */
  spawnT: number;
  /** -1 when not attacking, else seconds into the wind-up/swipe */
  attackT: number; struck: boolean; atkTarget: 'player' | 'base';
  dead?: boolean; flee?: boolean; ambient?: boolean; tx: number; ty: number; retarget: number;
}
interface Corpse {
  x: number; y: number; frame: HTMLCanvasElement | null; w: number; h: number;
  flip: boolean; dir: number; t: number; r: number; tint: string;
}
interface Coin { x: number; y: number; vx: number; vy: number; value: number; phase: number; t: number; }
interface Particle {
  x: number; y: number; vx: number; vy: number; life: number; max: number; size: number;
  color: string; grav: number; drag: number; glow: boolean; grow: number;
}
interface Ring { x: number; y: number; r: number; vr: number; life: number; max: number; color: string; w: number; }
interface FloatText { x: number; y: number; vy: number; life: number; max: number; text: string; color: string; size: number; }
interface Turret { ox: number; x: number; y: number; ang: number; cd: number; recoil: number; heat: number; build: number; }
interface Upgrades {
  repair: number; walls: number; damage: number; firerate: number; multishot: number;
  turret: number; speed: number; tesla: number; barricade: number; medbay: number;
}
interface Arc { pts: { x: number; y: number }[]; life: number; max: number; w: number; }
const freshUpgrades = (): Upgrades => ({
  repair: 0, walls: 0, damage: 0, firerate: 0, multishot: 0, turret: 0, speed: 0, tesla: 0, barricade: 0, medbay: 0,
});

export type WeaponChip = { id: WeaponId; name: string; icon: string; slot: number };

export type HudSnapshot = {
  playerHp: number; playerMax: number; baseHp: number; baseMax: number;
  lairHp: number; lairMax: number; lairAlive: boolean;
  coins: number; score: number; kills: number; combo: number; comboMult: number; comboT: number;
  level: number; levelName: string; turrets: number;
  weapon: WeaponChip; owned: WeaponChip[];
  ammo: number; mag: number; reload: number; charge: number; spin: number;
  tesla: number; teslaCharge: number; medbay: boolean;
};

export type GameEvent =
  | { type: 'hud'; hud: HudSnapshot }
  | { type: 'banner'; title: string; sub: string; tone: 'acid' | 'amber' | 'red' }
  | { type: 'paused'; paused: boolean }
  | { type: 'levelclear'; level: number }
  | { type: 'victory' }
  | { type: 'gameover'; reason: 'base' | 'player' };

type Mode = 'ambient' | 'playing' | 'clear' | 'over' | 'intermission' | 'dead' | 'paused';

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private emit: (e: GameEvent) => void;

  private raf = 0;
  private last = 0;
  private acc = 0;
  private time = 0;
  private destroyed = false;

  mode: Mode = 'ambient';
  private world = { w: 960, h: 600 };
  private cssW = 0; private cssH = 0; private viewScale = 1; private ox = 0; private oy = 0;
  private dpr = 1;
  private ground: HTMLCanvasElement | null = null;
  private lairArt: HTMLCanvasElement | null = null;
  private lairArtCx = 0; private lairArtCy = 0;

  level = 0;
  private cfg: LevelCfg = LEVELS[0];
  private stats = { score: 0, coins: 0, kills: 0, combo: 0, comboT: 0, maxCombo: 0 };

  private player = {
    x: 480, y: 400, vx: 0, vy: 0, hp: 100, maxHp: 100, r: 13, aim: -Math.PI / 2,
    fireT: 0, recoil: 0, hurtFlash: 0, invul: 0, regenT: 0, muzzle: 0,
    anim: 'idle' as HeroAnim, animT: 0, facingLeft: false, legsLeft: false, deadT: -1,
    heat: 0, swapT: 0, stepT: 0, muzzleLight: 0,
    /** ammo in the current magazine, per weapon */
    ammo: { sidearm: 15, smg: 32, shotgun: 6, rifle: 8, minigun: 120, railgun: 4 } as Record<WeaponId, number>,
    reloadT: 0, reloadTotal: 0,
    /** minigun spin-up 0..1 and railgun charge 0..1 */
    spin: 0, charge: 0, chargeSnd: 0,
    /** smoothed torso aim so the gun swings with weight */
    aimVis: -Math.PI / 2,
    /** shoulder-aim blend: 0 hip, 1 shouldered */
    shoulder: 0,
    breathe: 0, landT: 0, wasMoving: false,
  };
  private corpses: Corpse[] = [];
  private casings: Casing[] = [];
  private trails: Trail[] = [];
  private arcs: Arc[] = [];
  private base = {
    x: 480, y: 520, r: 46, hp: 120, maxHp: 120, flash: 0, smokeT: 0,
    alarm: 0, teslaCd: 0, teslaCharge: 0, medPulse: 0, buildT: 0,
  };
  private lair = {
    x: 480, y: 96, r: 58, hp: 180, maxHp: 180, alive: true, deadT: 0,
    spawnT: 1.2, rushT: 16, telegraph: 0, burst: 0, hitFlash: 0, pulse: 0, goopT: 0, burp: 0,
    bumps: [] as { x: number; y: number; r: number; ph: number }[],
  };
  private turrets: Turret[] = [];
  private owned: Record<WeaponId, boolean> = {
    sidearm: true, smg: false, shotgun: false, rifle: false, minigun: false, railgun: false,
  };
  weapon: WeaponId = 'sidearm';
  private bullets: Bullet[] = [];
  private zombies: Zombie[] = [];
  private coins: Coin[] = [];
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private texts: FloatText[] = [];
  private upgrades: Upgrades = freshUpgrades();

  private shake = 0;
  private flashA = 0; private flashColor = '255,60,60';
  private slowmo = 0;
  private clearT = 0; private overT = 0; private overReason: 'base' | 'player' = 'base'; private burstT = 0;
  private dustT = 0;
  private hudAcc = 0;

  private keys = new Set<string>();
  private input = {
    moveX: 0, moveY: 0,
    touchAimX: 0, touchAimY: 0, touchAim: false,
    mouseX: 480, mouseY: 200, mouse: false, firing: false, space: false, reload: false,
  };

  constructor(canvas: HTMLCanvasElement, emit: (e: GameEvent) => void) {
    this.canvas = canvas;
    this.emit = emit;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('no 2d context');
    this.ctx = ctx;

    window.addEventListener('resize', this.resize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('mouseup', this.onMouseUp);
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('mousedown', this.onMouseDown);
    canvas.addEventListener('contextmenu', this.onContext);

    this.resize();
    this.enterAmbient();
    loadSprites();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('mouseup', this.onMouseUp);
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('contextmenu', this.onContext);
  }

  /* ---------------- input ---------------- */
  private onContext = (e: Event) => e.preventDefault();
  private onBlur = () => { this.keys.clear(); this.input.firing = false; this.input.space = false; };
  private onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && t.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'spacebar'].includes(k)) e.preventDefault();
    if (k === 'escape' || k === 'p') { this.togglePause(); return; }
    if (k === 'q') { this.cycleWeapon(-1); return; }
    if (k === 'e' || k === 'tab') { this.cycleWeapon(1); return; }
    if (k === 'r') { this.input.reload = true; return; }
    const slot = '123456'.indexOf(k);
    if (slot >= 0) this.equipWeapon(WEAPON_ORDER[slot]);
    this.keys.add(k);
    if (k === ' ') this.input.space = true;
  };
  private onKeyUp = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    this.keys.delete(k);
    if (k === ' ') this.input.space = false;
  };
  private onMouseMove = (e: MouseEvent) => {
    const p = this.toWorld(e.clientX, e.clientY);
    this.input.mouseX = p.x; this.input.mouseY = p.y; this.input.mouse = true;
  };
  private onMouseDown = (e: MouseEvent) => {
    if (e.button === 0) {
      const p = this.toWorld(e.clientX, e.clientY);
      this.input.mouseX = p.x; this.input.mouseY = p.y;
      this.input.mouse = true; this.input.firing = true;
    }
  };
  private onMouseUp = () => { this.input.firing = false; };

  setMove(x: number, y: number) { this.input.moveX = x; this.input.moveY = y; }
  setTouchAim(x: number | null, y: number | null) {
    if (x === null || y === null) { this.input.touchAim = false; return; }
    this.input.touchAimX = x; this.input.touchAimY = y; this.input.touchAim = true;
  }

  togglePause() {
    if (this.mode === 'playing') {
      this.mode = 'paused'; this.keys.clear();
      this.input.firing = false; this.input.space = false;
      this.emit({ type: 'paused', paused: true });
    }
    else if (this.mode === 'paused') { this.mode = 'playing'; this.emit({ type: 'paused', paused: false }); }
  }
  setPaused(p: boolean) {
    if (p && this.mode === 'playing') {
      this.mode = 'paused'; this.keys.clear();
      this.input.firing = false; this.input.space = false;
      this.emit({ type: 'paused', paused: true });
    }
    else if (!p && this.mode === 'paused') { this.mode = 'playing'; this.emit({ type: 'paused', paused: false }); }
  }

  /* ---------------- layout ---------------- */
  private resize = () => {
    const parent = this.canvas.parentElement;
    const w = parent ? parent.clientWidth : window.innerWidth;
    const h = parent ? parent.clientHeight : window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cssW = w; this.cssH = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;

    const aspect = w / h;
    let wh = 600, ww = 600 * aspect;
    if (ww < 420) { ww = 420; wh = ww / aspect; }
    if (ww > 1150) { ww = 1150; wh = ww / aspect; }
    this.world.w = Math.round(ww);
    this.world.h = Math.round(wh);

    this.viewScale = Math.min(w / this.world.w, h / this.world.h);
    this.ox = (w - this.world.w * this.viewScale) / 2;
    this.oy = (h - this.world.h * this.viewScale) / 2;

    this.base.x = this.world.w / 2;
    this.base.y = this.world.h - 92;
    this.lair.x = this.world.w / 2;
    this.lair.y = 96;
    this.player.x = clamp(this.player.x, 28, this.world.w - 28);
    this.player.y = clamp(this.player.y, 80, this.world.h - 48);
    this.syncTurrets(true);
    this.prerenderGround();
  };

  private toWorld(cx: number, cy: number) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (cx - rect.left - this.ox) / this.viewScale,
      y: (cy - rect.top - this.oy) / this.viewScale,
    };
  }

  /* ---------------- prerendered ground ---------------- */
  private prerenderGround() {
    const { w, h } = this.world;
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const g = off.getContext('2d')!;

    // deterministic layout so a resize never reshuffles the floor
    let seed = 1337;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const rr = (a: number, b: number) => a + rnd() * (b - a);

    g.fillStyle = '#0b0e11';
    g.fillRect(0, 0, w, h);

    /* ---- industrial grate floor ---- */
    const T = 80;
    const cols = Math.ceil(w / T), rows = Math.ceil(h / T);
    const ox = Math.round((w - cols * T) / 2), oy = Math.round((h - rows * T) / 2);
    const m = 7;              // frame width
    const n = 5;              // grate cells per tile
    for (let ty = 0; ty < rows; ty++) {
      for (let tx = 0; tx < cols; tx++) {
        const x = ox + tx * T, y = oy + ty * T;
        const v = rnd();
        const kind = v < 0.68 ? 'grate' : v < 0.86 ? 'plate' : 'broken';
        const tone = rr(-10, 10);

        // frame with bevel
        g.fillStyle = `rgb(${30 + tone},${37 + tone},${42 + tone})`;
        g.fillRect(x, y, T, T);
        g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(x, y, T, 2); g.fillRect(x, y, 2, T);
        g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x, y + T - 2, T, 2); g.fillRect(x + T - 2, y, 2, T);

        const ix = x + m, iy = y + m, iw = T - m * 2;
        if (kind === 'plate') {
          g.fillStyle = `rgb(${38 + tone},${46 + tone},${51 + tone})`;
          g.fillRect(ix, iy, iw, iw);
          // tread scratches + rivets
          g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 1;
          for (let s = 0; s < 4; s++) {
            const sx = ix + rr(4, iw - 4), sy = iy + rr(4, iw - 4);
            g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + rr(-14, 14), sy + rr(-6, 6)); g.stroke();
          }
          for (const [cx, cy] of [[ix + 5, iy + 5], [ix + iw - 5, iy + 5], [ix + 5, iy + iw - 5], [ix + iw - 5, iy + iw - 5]]) {
            g.fillStyle = '#4a555c'; g.beginPath(); g.arc(cx, cy, 2.4, 0, TAU); g.fill();
            g.fillStyle = 'rgba(0,0,0,.5)'; g.beginPath(); g.arc(cx + 0.6, cy + 0.6, 1.1, 0, TAU); g.fill();
          }
        } else {
          // the dark pit beneath the grating
          g.fillStyle = '#05070a';
          g.fillRect(ix, iy, iw, iw);
          const cell = iw / n, bw = 3.2;
          const bar = `rgb(${46 + tone},${56 + tone},${62 + tone})`;
          const missing = new Set<number>();
          if (kind === 'broken') { const k = 1 + Math.floor(rnd() * 3); for (let i = 0; i < k; i++) missing.add(Math.floor(rnd() * (n * 2 + 2))); }
          for (let i = 0; i <= n; i++) {
            const p = ix + i * cell;
            if (!missing.has(i)) { g.fillStyle = bar; g.fillRect(p - bw / 2, iy, bw, iw); }
            if (!missing.has(n + 1 + i)) {
              g.fillStyle = bar; g.fillRect(ix, p - bw / 2, iw, bw);
              g.fillStyle = 'rgba(255,255,255,.09)'; g.fillRect(ix, p - bw / 2, iw, 1);
            }
          }
          if (kind === 'broken') {
            // a torn hole with bent bars
            const hx = ix + rr(8, iw - 22), hy = iy + rr(8, iw - 22);
            g.fillStyle = '#020304'; g.beginPath(); g.ellipse(hx + 8, hy + 8, 13, 9, rr(0, 3), 0, TAU); g.fill();
            g.strokeStyle = bar; g.lineWidth = 2.6; g.lineCap = 'round';
            g.beginPath(); g.moveTo(hx - 2, hy + 6); g.lineTo(hx + 6, hy + 14); g.lineTo(hx + 4, hy + 20); g.stroke();
          }
        }
        // grime / oil variation
        if (rnd() < 0.55) {
          g.fillStyle = `rgba(0,0,0,${rr(.06, .24)})`;
          g.beginPath(); g.ellipse(x + rr(10, T - 10), y + rr(10, T - 10), rr(14, 34), rr(8, 22), rr(0, TAU), 0, TAU); g.fill();
        }
        // rust bleeding down from the frame
        if (rnd() < 0.3) {
          const sx = x + rr(6, T - 6);
          const rg2 = g.createLinearGradient(0, y, 0, y + rr(20, 50));
          rg2.addColorStop(0, 'rgba(150,80,30,.28)'); rg2.addColorStop(1, 'rgba(150,80,30,0)');
          g.fillStyle = rg2; g.fillRect(sx - rr(1.5, 4), y, rr(3, 8), 50);
        }
      }
    }

    /* ---- ambient light: toxic top, cool bottom ---- */
    let rg = g.createRadialGradient(w / 2, 100, 10, w / 2, 100, 360);
    rg.addColorStop(0, 'rgba(90,220,80,.16)'); rg.addColorStop(1, 'rgba(90,220,80,0)');
    g.fillStyle = rg; g.fillRect(0, 0, w, 420);
    rg = g.createRadialGradient(w / 2, h - 90, 10, w / 2, h - 90, 340);
    rg.addColorStop(0, 'rgba(70,180,220,.10)'); rg.addColorStop(1, 'rgba(70,180,220,0)');
    g.fillStyle = rg; g.fillRect(0, h - 420, w, 420);

    /* ---- bunker cabling ---- */
    const bx = w / 2, by = h - 92;
    const cable = (x2: number, y2: number, cx: number, cy: number, core: string) => {
      g.lineCap = 'round';
      g.strokeStyle = '#0a0c0e'; g.lineWidth = 5;
      g.beginPath(); g.moveTo(bx + rr(-20, 20), by + 10); g.quadraticCurveTo(cx, cy, x2, y2); g.stroke();
      g.strokeStyle = core; g.lineWidth = 2;
      g.stroke();
    };
    cable(bx - 120, h + 10, bx - 60, by + 40, '#b8262a');
    cable(bx + 140, h + 10, bx + 70, by + 30, '#2a7ab8');
    cable(bx + 90, h + 10, bx + 30, by + 60, '#1c1f22');
    cable(-10, h - 40, bx - 200, by + 40, '#b8262a');

    /* ---- painted caution markings near the bunker ---- */
    g.save();
    g.globalAlpha = 0.28;
    g.strokeStyle = '#d9b341'; g.lineWidth = 4; g.setLineDash([16, 12]);
    g.beginPath(); g.arc(bx, by, 96, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
    g.setLineDash([]);
    g.restore();

    /* ---- old blood ---- */
    const splat = (x: number, y: number, s: number, a: number, col: string) => {
      g.fillStyle = col; g.globalAlpha = a;
      g.beginPath(); g.ellipse(x, y, s, s * rr(.55, .9), rr(0, TAU), 0, TAU); g.fill();
      const k = 6 + Math.floor(rnd() * 10);
      for (let i = 0; i < k; i++) {
        const an = rr(0, TAU), d = rr(s * .5, s * 1.9), r2 = rr(.8, s * .28);
        g.beginPath(); g.ellipse(x + Math.cos(an) * d, y + Math.sin(an) * d, r2, r2 * rr(.5, 1), an, 0, TAU); g.fill();
      }
      for (let i = 0; i < 2; i++) {
        const an = rr(0, TAU);
        g.beginPath(); g.ellipse(x + Math.cos(an) * s * 1.1, y + Math.sin(an) * s * 1.1, s * .8, 1.2, an, 0, TAU); g.fill();
      }
      g.globalAlpha = 1;
    };
    const bloods = ['#5a0d12', '#7a151a', '#4a0a10', '#8a1a1e'];
    for (let i = 0; i < 26; i++) {
      const y = rr(120, h - 40);
      splat(rr(20, w - 20), y, rr(5, 18), rr(.55, .9), bloods[Math.floor(rnd() * bloods.length)]);
    }
    for (let i = 0; i < 4; i++) splat(rr(w * .2, w * .8), rr(h * .45, h * .85), rr(20, 30), .8, '#5a0d12');

    /* ---- spent brass ---- */
    for (let i = 0; i < 70; i++) {
      const x = rr(10, w - 10), y = rr(140, h - 20);
      g.save(); g.translate(x, y); g.rotate(rr(0, TAU));
      g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(-2.6, -0.4, 5.2, 2.2);
      g.fillStyle = '#c9a24a'; g.fillRect(-2.6, -1, 5.2, 2);
      g.fillStyle = '#f1dc8c'; g.fillRect(-2.6, -1, 5.2, 0.7);
      g.restore();
    }

    /* ---- debris ---- */
    for (let i = 0; i < 5; i++) {
      const x = rr(30, w - 30), y = rr(150, h - 60), L = rr(24, 46);
      g.save(); g.translate(x, y); g.rotate(rr(0, TAU));
      g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(-L / 2 + 1, -2, L, 7);
      g.fillStyle = '#4d565c'; g.fillRect(-L / 2, -3, L, 6);
      g.fillStyle = '#6a747a'; g.fillRect(-L / 2, -3, L, 1.5);
      g.fillStyle = '#2a3136'; g.fillRect(-L / 2, -3, 3, 6); g.fillRect(L / 2 - 3, -3, 3, 6);
      g.restore();
    }
    for (let i = 0; i < 14; i++) {
      const x = rr(8, w - 8), y = rr(120, h - 8);
      g.fillStyle = '#3a444b'; g.beginPath(); g.arc(x, y, 2.2, 0, TAU); g.fill();
      g.fillStyle = 'rgba(0,0,0,.6)'; g.beginPath(); g.arc(x + .5, y + .5, 1, 0, TAU); g.fill();
    }
    // rusty barrels tucked in the margins
    const barrels = [[rr(22, 60), rr(h * .35, h * .55)], [w - rr(22, 60), rr(h * .3, h * .5)], [w - rr(24, 70), rr(h * .68, h * .8)]];
    for (const [x, y] of barrels) {
      g.fillStyle = 'rgba(0,0,0,.5)'; g.beginPath(); g.ellipse(x + 3, y + 4, 14, 12, 0, 0, TAU); g.fill();
      g.fillStyle = '#5a3a24'; g.beginPath(); g.arc(x, y, 13, 0, TAU); g.fill();
      g.fillStyle = '#7a4d2c'; g.beginPath(); g.arc(x, y, 10, 0, TAU); g.fill();
      g.strokeStyle = '#3a2416'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 11.5, 0, TAU); g.stroke();
      g.fillStyle = '#9dff4f'; g.globalAlpha = .55; g.beginPath(); g.arc(x - 3, y + 2, 4, 0, TAU); g.fill(); g.globalAlpha = 1;
    }
    // a few skulls
    for (let i = 0; i < 5; i++) {
      const x = rr(30, w - 30), y = rr(160, h - 170);
      g.save(); g.translate(x, y); g.rotate(rr(0, TAU)); g.globalAlpha = rr(.3, .5);
      g.fillStyle = '#c8d2b8';
      g.beginPath(); g.arc(0, 0, 4.5, 0, TAU); g.fill();
      g.fillRect(-2.5, 3, 5, 3);
      g.fillStyle = '#0b0e11';
      g.beginPath(); g.arc(-1.7, -0.5, 1.2, 0, TAU); g.arc(1.7, -0.5, 1.2, 0, TAU); g.fill();
      g.restore();
    }

    // edge vignette
    const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.42, w / 2, h / 2, Math.max(w, h) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.65)');
    g.fillStyle = vg; g.fillRect(0, 0, w, h);

    this.ground = off;
  }

  /** the hive's root network, baked once per level */
  private prerenderLairArt() {
    const r = this.lair.r;
    const S = Math.round(r * 7.5), cy = Math.round(r * 2.4);
    const off = document.createElement('canvas');
    off.width = S; off.height = Math.round(r * 5.6);
    const g = off.getContext('2d')!;
    const cx = S / 2;
    let seed = 99 + this.level * 17;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const rr = (a: number, b: number) => a + rnd() * (b - a);

    type Pt = { x: number; y: number };
    const tentacles: { pts: Pt[]; w0: number }[] = [];
    const N = 10;
    for (let i = 0; i < N; i++) {
      // spread around the orb, biased down and to the sides
      let a = (i / N) * TAU + rr(-0.18, 0.18);
      if (Math.sin(a) < -0.2) a += Math.PI * rr(0.6, 0.9);
      const L = r * rr(1.7, 3.1);
      const pts: Pt[] = [];
      let px = cx + Math.cos(a) * r * 0.35, py = cy + Math.sin(a) * r * 0.25;
      let dir = a;
      const segs = 14;
      for (let s = 0; s <= segs; s++) {
        pts.push({ x: px, y: py });
        dir += rr(-0.22, 0.22) + Math.sin(s * 0.9 + i) * 0.08;
        const step = L / segs;
        px += Math.cos(dir) * step; py += Math.sin(dir) * step * 0.78;
      }
      tentacles.push({ pts, w0: r * rr(0.32, 0.46) });
    }
    // ground shadow
    for (const t of tentacles) this.strokeTentacle(g, t.pts, t.w0 * 1.25, 'rgba(0,0,0,.45)', 0, 3, 4);
    // body: outline → flesh → highlight
    for (const t of tentacles) this.strokeTentacle(g, t.pts, t.w0 * 1.18, '#1b1210', 0, 0, 0);
    for (const t of tentacles) this.strokeTentacle(g, t.pts, t.w0, '#4a3128', 0, 0, 0);
    for (const t of tentacles) this.strokeTentacle(g, t.pts, t.w0 * 0.42, '#6b4a3c', -1.5, -2, 0);
    // suckers / pustules along the roots
    for (const t of tentacles) {
      for (let s = 2; s < t.pts.length - 1; s += 2) {
        const p = t.pts[s];
        const k = 1 - s / t.pts.length;
        g.fillStyle = 'rgba(20,12,10,.6)'; g.beginPath(); g.arc(p.x + rr(-3, 3), p.y + rr(-2, 2), t.w0 * 0.16 * k + 1, 0, TAU); g.fill();
        if (rnd() < 0.35) { g.fillStyle = 'rgba(157,255,79,.55)'; g.beginPath(); g.arc(p.x, p.y, t.w0 * 0.1 * k + 0.8, 0, TAU); g.fill(); }
      }
    }
    // fleshy base mound under the orb
    g.fillStyle = '#3d2a28';
    g.beginPath(); g.ellipse(cx, cy + r * 0.18, r * 0.98, r * 0.5, 0, 0, TAU); g.fill();
    g.fillStyle = '#2a1c1b';
    g.beginPath(); g.ellipse(cx, cy + r * 0.3, r * 0.8, r * 0.3, 0, 0, TAU); g.fill();

    this.lairArt = off; this.lairArtCx = cx; this.lairArtCy = cy;
  }

  private strokeTentacle(g: CanvasRenderingContext2D, pts: { x: number; y: number }[], w0: number, color: string, dx: number, dy: number, blur: number) {
    g.save();
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = color;
    if (blur) { g.shadowColor = color; g.shadowBlur = blur; }
    for (let i = 0; i < pts.length - 1; i++) {
      const k = 1 - i / (pts.length - 1);
      g.lineWidth = Math.max(1.5, w0 * (0.15 + 0.85 * k * k));
      g.beginPath();
      g.moveTo(pts[i].x + dx, pts[i].y + dy);
      g.lineTo(pts[i + 1].x + dx, pts[i + 1].y + dy);
      g.stroke();
    }
    g.restore();
  }

  /* ---------------- game flow ---------------- */
  enterAmbient() {
    this.mode = 'ambient';
    this.level = 0; this.cfg = LEVELS[0];
    this.stats = { score: 0, coins: 0, kills: 0, combo: 0, comboT: 0, maxCombo: 0 };
    this.upgrades = freshUpgrades();
    this.player.hp = this.player.maxHp;
    this.base.hp = this.base.maxHp = 120;
    this.setupLair(0);
    this.lair.alive = true;
    this.bullets = []; this.coins = []; this.particles = []; this.rings = []; this.texts = [];
    this.zombies = []; this.corpses = []; this.casings = []; this.trails = []; this.arcs = [];
    this.player.deadT = -1; this.player.anim = 'idle'; this.player.vx = this.player.vy = 0;
    this.player.x = this.world.w / 2; this.player.y = this.base.y - 118;
    this.player.reloadT = 0; this.player.spin = 0; this.player.charge = 0;
    for (let i = 0; i < 7; i++) this.spawnAmbientZombie();
    this.syncTurrets(true);
    setAmbience(0.15, 0, true);
  }

  newGame() {
    this.level = 0;
    this.stats = { score: 0, coins: 0, kills: 0, combo: 0, comboT: 0, maxCombo: 0 };
    this.upgrades = freshUpgrades();
    this.owned = { sidearm: true, smg: false, shotgun: false, rifle: false, minigun: false, railgun: false };
    this.weapon = 'sidearm';
    this.player.maxHp = 100; this.player.hp = 100;
    this.base.maxHp = 120; this.base.hp = 120;
    this.coins = []; this.bullets = [];
    this.shake = 0; this.flashA = 0; this.slowmo = 0;
    for (const id of WEAPON_ORDER) this.player.ammo[id] = WEAPONS[id].mag;
    this.startLevel(0, true);
  }

  private setupLair(level: number) {
    const cfg = LEVELS[level];
    this.cfg = cfg;
    this.lair.r = cfg.r;
    this.lair.maxHp = cfg.lairHp; this.lair.hp = cfg.lairHp;
    this.lair.alive = true; this.lair.deadT = 0;
    this.lair.spawnT = 1.1; this.lair.rushT = cfg.rush + 2.5;
    this.lair.telegraph = 0; this.lair.burst = 0; this.lair.hitFlash = 0;
    this.lair.bumps = [];
    for (let i = 0; i < 7; i++) {
      const a = rand(0, TAU), rr = rand(cfg.r * 0.35, cfg.r * 0.95);
      this.lair.bumps.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr * 0.8, r: rand(10, 22), ph: rand(0, TAU) });
    }
    this.prerenderLairArt();
  }

  private startLevel(level: number, first = false) {
    this.level = level;
    this.cfg = LEVELS[level];
    this.setupLair(level);
    // coins intentionally persist so post-victory vacuum rewards carry over
    this.bullets = []; this.zombies = []; this.corpses = [];
    this.casings = []; this.trails = []; this.arcs = [];
    this.particles = []; this.rings = []; this.texts = [];
    this.player.heat = 0; this.player.swapT = 0;
    this.player.reloadT = 0; this.player.spin = 0; this.player.charge = 0; this.player.shoulder = 0;
    this.player.aimVis = -Math.PI / 2;
    for (const id of WEAPON_ORDER) this.player.ammo[id] = WEAPONS[id].mag;
    this.base.alarm = 0; this.base.teslaCd = 1;
    this.player.deadT = -1; this.player.anim = 'idle'; this.player.animT = 0;
    this.player.facingLeft = false; this.player.aim = -Math.PI / 2;
    this.player.x = this.world.w / 2;
    this.player.y = this.base.y - 118;
    this.player.vx = this.player.vy = 0;
    this.player.hp = this.player.maxHp;
    this.player.invul = 1.2;
    this.syncTurrets(true);
    this.mode = 'playing';
    this.emit({
      type: 'banner',
      title: first ? 'LEVEL 1' : `LEVEL ${level + 1}`,
      sub: LEVELS[level].name,
      tone: level >= 4 ? 'red' : level >= 2 ? 'amber' : 'acid',
    });
    this.emitHud();
  }

  continueAfterShop() {
    if (this.level >= LEVELS.length - 1) return;
    this.base.hp = Math.min(this.base.maxHp, this.base.hp + this.base.maxHp * 0.25);
    this.startLevel(this.level + 1);
  }

  getStats() {
    return { ...this.stats, level: this.level + 1, reason: this.overReason };
  }

  /* ---------------- shop / upgrades ---------------- */
  getWeapons() {
    return WEAPON_ORDER.map((id, i) => {
      const w = WEAPONS[id];
      const owned = this.owned[id];
      return {
        id, name: w.name, desc: w.desc, icon: w.icon, cost: w.cost,
        owned, equipped: this.weapon === id,
        dps: Math.round((w.dmg * w.pellets) / w.interval),
        pellets: w.pellets, pierce: w.pierce,
        slot: i + 1,
        canBuy: !owned && this.stats.coins >= w.cost,
      };
    });
  }

  buyWeapon(id: WeaponId) {
    if (this.owned[id]) { this.equipWeapon(id); return true; }
    const w = WEAPONS[id];
    if (this.stats.coins < w.cost) { sfx.ui(); return false; }
    this.stats.coins -= w.cost;
    this.owned[id] = true;
    this.weapon = id;
    sfx.buy();
    this.addText(this.player.x, this.player.y - 34, `${w.name} ACQUIRED`, w.color, 18);
    this.burstSpark(this.player.x, this.player.y - 10, 22, '255,210,74', true);
    this.emitHud();
    return true;
  }

  equipWeapon(id: WeaponId) {
    if (!this.owned[id] || this.weapon === id) return;
    this.weapon = id;
    this.player.fireT = Math.max(this.player.fireT, WEAPONS[id].interval * 0.5);
    this.player.swapT = 0.32;
    this.player.heat = 0; this.player.reloadT = 0; this.player.spin = 0; this.player.charge = 0;
    const g = this.heroGeom();
    this.burstSpark(g.gx, g.gy, 8, '200,235,255', true);
    sfx.swap();
    this.addText(this.player.x, this.player.y - 30, WEAPONS[id].name.toUpperCase(), WEAPONS[id].color, 15);
    this.emitHud();
  }

  cycleWeapon(dir: number) {
    const avail = WEAPON_ORDER.filter((id) => this.owned[id]);
    if (avail.length < 2) return;
    const i = avail.indexOf(this.weapon);
    this.equipWeapon(avail[(i + dir + avail.length) % avail.length]);
  }

  getShop() {
    const u = this.upgrades;
    const levelOf = (id: ShopId) => id === 'repair' ? u.repair : u[id];
    return (Object.keys(SHOP_DEFS) as ShopId[]).map((id) => {
      const d = SHOP_DEFS[id];
      const lvl = levelOf(id);
      const cost = Math.round((d.base * Math.pow(d.growth, lvl)) / 5) * 5;
      const maxed = lvl >= d.max;
      const full = id === 'repair' && this.base.hp >= this.base.maxHp;
      return {
        id, name: d.name, desc: d.desc, icon: d.icon, cost, group: d.group,
        level: lvl, max: d.max, maxed: maxed || full,
        canBuy: !maxed && !full && this.stats.coins >= cost,
      };
    });
  }

  buyUpgrade(id: ShopId) {
    if (this.mode !== 'paused' && this.mode !== 'intermission' && this.mode !== 'playing') return false;
    const d = SHOP_DEFS[id];
    const lvl = id === 'repair' ? this.upgrades.repair : this.upgrades[id];
    if (lvl >= d.max) return false;
    const cost = Math.round((d.base * Math.pow(d.growth, lvl)) / 5) * 5;
    if (this.stats.coins < cost) { sfx.ui(); return false; }
    this.stats.coins -= cost;
    switch (id) {
      case 'repair':
        this.upgrades.repair++;
        this.base.hp = Math.min(this.base.maxHp, this.base.hp + this.base.maxHp * 0.35);
        this.burstSpark(this.base.x, this.base.y - 20, 14, '110,230,255', true);
        sfx.repair();
        break;
      case 'walls':
        this.upgrades.walls++; this.base.maxHp += 30; this.base.hp += 30;
        this.burstSpark(this.base.x, this.base.y - 24, 18, '140,200,230', true);
        sfx.buy(); break;
      case 'damage': this.upgrades.damage++; sfx.buy(); break;
      case 'firerate': this.upgrades.firerate++; sfx.buy(); break;
      case 'multishot': this.upgrades.multishot++; sfx.buy(); break;
      case 'turret':
        this.upgrades.turret++; this.syncTurrets(false); sfx.build();
        this.burstSpark(this.base.x, this.base.y - 20, 20, '120,255,170', true);
        this.base.buildT = 0.6;
        break;
      case 'tesla':
        this.upgrades.tesla++; sfx.build(); sfx.teslaCharge();
        this.burstSpark(this.base.x, this.base.y - 50, 26, '140,220,255', true);
        this.base.buildT = 0.6;
        break;
      case 'barricade':
        this.upgrades.barricade++; sfx.build();
        this.burstSpark(this.base.x, this.base.y - 96, 20, '200,200,200', false);
        this.base.buildT = 0.6;
        break;
      case 'medbay':
        this.upgrades.medbay++; sfx.build(); sfx.repair();
        this.burstSpark(this.base.x - 44, this.base.y + 10, 18, '120,255,160', true);
        this.base.buildT = 0.6;
        break;
      case 'speed': this.upgrades.speed++; sfx.buy(); break;
    }
    this.emitHud();
    return true;
  }

  /** the wire line in front of the bunker */
  private barricadeY() { return this.base.y - 88; }

  private syncTurrets(reset: boolean) {
    const n = this.upgrades.turret;
    const want = [
      { ox: -66 }, { ox: 66 },
    ].slice(0, n);
    if (reset || this.turrets.length !== n) {
      this.turrets = want.map((w) => {
        const old = this.turrets.find((t) => Math.abs(t.ox - w.ox) < 2);
        return old ?? {
          ox: w.ox, x: this.base.x + w.ox, y: this.base.y + 6, ang: -Math.PI / 2, cd: 0,
          recoil: 0, heat: 0, build: reset ? 1 : 0,
        };
      });
    }
    for (const t of this.turrets) { t.x = this.base.x + t.ox; t.y = this.base.y + 6; }
  }

  private dmgMul() { return 1 + 0.3 * this.upgrades.damage; }
  private speedMul() { return 1 + 0.09 * this.upgrades.speed; }
  /** sprite height as a multiple of the collision radius, shared by draw + hit tests */
  private static zScale(type: ZType) {
    return type === 'runner' ? 4.4 : type === 'brute' ? 5.1 : 4.7;
  }

  /** hero sprite placement + hand/shoulder anchors, shared by aim, fire and render */
  private heroGeom() {
    const p = this.player;
    const H = 66;
    const fw = heroSprites.fw || 60, fh = heroSprites.fh || 128;
    const W = H * (fw / fh);
    const bottom = p.y + p.r * 0.55;
    const dir = p.facingLeft ? -1 : 1;
    const moving = p.anim !== 'idle' && p.deadT < 0;
    // torso bob: two bounces per 8-frame cycle while moving, slow breath when still,
    // plus a settle dip right after stopping
    const land = p.landT > 0 ? Math.sin((1 - p.landT / 0.22) * Math.PI) * 2.2 : 0;
    const bob = (moving
      ? -Math.abs(Math.sin(p.animT * Math.PI / 4)) * (p.anim === 'run' ? 2.4 : 1.3)
      : Math.sin(p.breathe) * 0.5) + land;
    const top = bottom - H + bob;
    // shouldered stance lifts the grip up toward the shoulder line
    const sh = p.shoulder;
    const gripY = HERO_HAND[1] - sh * 0.11;
    const gripX = HERO_HAND[0] - sh * 0.06;
    // reload: gun tilts down and the grip drops as he works the action
    const rl = p.reloadT > 0 ? Math.sin(Math.min(1, 1 - p.reloadT / p.reloadTotal) * Math.PI) : 0;
    return {
      H, W, bottom, dir, bob,
      gx: p.x + dir * (gripX - 0.5) * W, gy: top + (gripY + rl * 0.06) * H,
      sx: p.x + dir * (HERO_SHOULDER[0] - 0.5) * W, sy: top + HERO_SHOULDER[1] * H,
      aim: p.aimVis + (dir > 0 ? rl * 0.55 : -rl * 0.55) - p.recoil * 0.06 * dir,
    };
  }

  /** sprite box of the held gun in gun-local space (x forward, y down when facing right) */
  private gunBox() {
    const meta = GUN_META[this.weapon];
    const spr = gunSprites.hand[this.weapon];
    const L = meta.len;
    const H = spr ? L * (spr.height / spr.width) : L * 0.42;
    return { meta, spr, L, H, ax: meta.grip[0] * L, ay: meta.grip[1] * H };
  }

  /** gun-local point (fractions of the sprite box) → world, following the drawn aim */
  private gunPoint(fx: number, fy: number) {
    const g = this.heroGeom();
    const b = this.gunBox();
    const lx = fx * b.L - b.ax;
    const ly = (fy * b.H - b.ay) * (g.dir < 0 ? -1 : 1);
    const cs = Math.cos(g.aim), sn = Math.sin(g.aim);
    return { x: g.gx + lx * cs - ly * sn, y: g.gy + lx * sn + ly * cs };
  }

  private muzzle() {
    if (gunSprites.hand[this.weapon]) {
      const m = GUN_META[this.weapon].muzzle;
      return this.gunPoint(m[0], m[1]);
    }
    const g = this.heroGeom();
    const len = BARREL[this.weapon];
    return { x: g.gx + Math.cos(g.aim) * len, y: g.gy + Math.sin(g.aim) * len };
  }

  /* ---------------- spawning ---------------- */
  private pickType(): ZType {
    const r = Math.random();
    let acc = 0;
    for (const [t, w] of this.cfg.weights) { acc += w; if (r <= acc) return t; }
    return 'walker';
  }

  private spawnZombie(type?: ZType, atLair = true) {
    const t = type ?? this.pickType();
    const d = ZDEFS[t];
    let x = this.world.w / 2, y = this.lair.y + this.lair.r * 0.6;
    if (atLair) {
      // crawl out from under the orb's rim, along the lower half
      const a = rand(Math.PI * 0.08, Math.PI * 0.92);
      x = this.lair.x + Math.cos(a) * this.lair.r * rand(0.7, 1.0);
      y = this.lair.y + Math.abs(Math.sin(a)) * this.lair.r * 0.72 + this.lair.r * 0.2;
    }
    this.zombies.push({
      x, y, kx: 0, ky: 0, r: d.r,
      hp: d.hp * this.cfg.hpMul, maxHp: d.hp * this.cfg.hpMul,
      speed: d.speed * this.cfg.spdMul, dmg: d.dmg * this.cfg.dmgMul,
      type: t, face: Math.PI / 2, atkCd: 0, hitFlash: 0,
      phase: rand(0, TAU), wob: rand(0.8, 1.4), score: d.score,
      coinMin: d.coin[0], coinMax: d.coin[1], tx: x, ty: y + 100, retarget: 0,
      anim: 'walk', animT: rand(0, 4),
      spawnT: atLair ? 0 : 1, attackT: -1, struck: false, atkTarget: 'base',
    });
    if (atLair) {
      this.lair.burp = 1;
      if (Math.random() < 0.5) sfx.spawn();
      for (let i = 0; i < 5; i++) this.addParticle({
        x: x + rand(-8, 8), y: y + rand(-4, 4), vx: rand(-40, 40), vy: rand(-90, -20),
        life: rand(.3, .6), max: .6, size: rand(2, 5), color: 'rgba(120,220,90,.85)',
        grav: 260, drag: 1.5, glow: true, grow: -1,
      });
    }
  }

  private spawnAmbientZombie() {
    const d = ZDEFS.walker;
    const a = rand(0, TAU), rr = rand(this.lair.r * 1.2, this.lair.r * 2.6);
    this.zombies.push({
      x: this.lair.x + Math.cos(a) * rr, y: this.lair.y + Math.sin(a) * rr * 0.7 + 30,
      kx: 0, ky: 0, r: d.r, hp: 1, maxHp: 1, speed: 14, dmg: 0, type: 'walker',
      face: Math.PI / 2, atkCd: 0, hitFlash: 0, phase: rand(0, TAU), wob: 1, score: 0,
      coinMin: 0, coinMax: 0, ambient: true,
      tx: this.lair.x, ty: this.lair.y + 60, retarget: rand(1, 4),
      anim: 'idle', animT: rand(0, 4),
      spawnT: 1, attackT: -1, struck: false, atkTarget: 'base',
    });
  }

  /* ---------------- fx helpers ---------------- */
  private addParticle(p: Partial<Particle> & { x: number; y: number }) {
    if (this.particles.length > 460) this.particles.shift();
    this.particles.push({
      vx: 0, vy: 0, life: 0.5, max: 0.5, size: 3, color: '#fff',
      grav: 0, drag: 2, glow: false, grow: 0, ...p,
    });
  }

  private gore(x: number, y: number, n: number, color = '90,180,70', power = 1) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), sp = rand(30, 220) * power;
      this.addParticle({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
        life: rand(.3, .75), max: .75, size: rand(2, 5.5),
        color: `rgba(${color},1)`, grav: 520, drag: 1.6, glow: false, grow: -2,
      });
    }
    for (let i = 0; i < n / 3; i++) {
      const a = rand(0, TAU), sp = rand(40, 160) * power;
      this.addParticle({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 100,
        life: rand(.5, 1), max: 1, size: rand(3, 7),
        color: 'rgba(40,60,30,.9)', grav: 300, drag: 1.2, glow: false, grow: 4,
      });
    }
  }

  private burstSpark(x: number, y: number, n: number, color = '255,210,80', glow = true) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), sp = rand(50, 260);
      this.addParticle({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(.2, .55), max: .55, size: rand(1.5, 3.4),
        color: `rgba(${color},1)`, grav: 120, drag: 3, glow, grow: -2,
      });
    }
  }

  private explosion(x: number, y: number, big = false) {
    const n = big ? 34 : 18;
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), sp = rand(60, big ? 420 : 260);
      const hot = Math.random() < 0.55;
      this.addParticle({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(.25, big ? .8 : .5), max: .8, size: rand(3, big ? 9 : 6),
        color: hot ? `rgba(255,${randInt(150, 230)},60,1)` : 'rgba(90,90,80,.8)',
        grav: 160, drag: 2.2, glow: hot, grow: hot ? -4 : 6,
      });
    }
    this.rings.push({ x, y, r: 6, vr: big ? 520 : 300, life: big ? .55 : .38, max: big ? .55 : .38, color: big ? '255,190,90' : '255,140,70', w: big ? 6 : 3 });
    sfx.boom();
    this.shake = Math.min(26, this.shake + (big ? 15 : 7));
  }

  private addText(x: number, y: number, text: string, color: string, size = 15) {
    this.texts.push({ x, y, vy: -46, life: .85, max: .85, text, color, size });
  }

  /* ---------------- combat ---------------- */
  private fire() {
    const p = this.player;
    const w = WEAPONS[this.weapon];
    const n = w.pellets + this.upgrades.multishot;
    const dmg = w.dmg * this.dmgMul();
    const m = this.muzzle();
    const meta = GUN_META[w.id];
    for (let k = 0; k < n; k++) {
      const off = (k - (n - 1) / 2) * w.spread + rand(-0.015, 0.015);
      const a = p.aim + off;
      this.bullets.push({
        x: m.x, y: m.y,
        px: m.x, py: m.y, vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed,
        dmg, life: w.life, color: w.color, pierce: w.pierce, hits: [], big: w.pierce > 1,
        trail: meta.trail || undefined, trailW: meta.trailW || undefined,
      });
    }
    p.fireT = w.interval / (1 + 0.14 * this.upgrades.firerate);
    p.recoil = 1 + Math.min(1.6, w.shake * 0.35); p.muzzle = 0.06 + w.shake * 0.008;
    p.muzzleLight = 1;
    p.heat = Math.min(1, p.heat + meta.heat);
    if (w.mag > 0) {
      p.ammo[w.id]--;
      // action sounds after the shot
      if (w.id === 'shotgun') sfx.pump();
      else if (w.id === 'rifle') sfx.boltCycle();
      if (Math.random() < 0.35) sfx.casing();
    }
    if (w.id === 'railgun') sfx.hiveCrack();
    // body kick opposite the shot
    p.vx -= Math.cos(p.aim) * meta.kick * 26;
    p.vy -= Math.sin(p.aim) * meta.kick * 26;

    // brass
    if (meta.casing !== 'none') this.ejectCasing(meta.casing);

    // weapon signatures
    if (w.id === 'shotgun') {
      this.rings.push({ x: m.x, y: m.y, r: 4, vr: 260, life: .22, max: .22, color: '255,190,110', w: 3 });
      for (let i = 0; i < 6; i++) this.addParticle({
        x: m.x, y: m.y, vx: Math.cos(p.aim) * rand(40, 120) + rand(-30, 30), vy: Math.sin(p.aim) * rand(40, 120) + rand(-30, 30) - 20,
        life: rand(.35, .7), max: .7, size: rand(4, 7), color: 'rgba(120,120,110,.55)', grav: -30, drag: 2, glow: false, grow: 9,
      });
    } else if (w.id === 'railgun') {
      this.flashColor = '190,150,255'; this.flashA = Math.max(this.flashA, 0.16);
      this.rings.push({ x: m.x, y: m.y, r: 3, vr: 420, life: .3, max: .3, color: '201,166,255', w: 4 });
      this.slowmo = Math.max(this.slowmo, 0.03);
      for (let i = 0; i < 10; i++) {
        const a = p.aim + rand(-0.5, 0.5);
        this.addParticle({
          x: m.x, y: m.y, vx: Math.cos(a) * rand(120, 420), vy: Math.sin(a) * rand(120, 420),
          life: rand(.15, .4), max: .4, size: rand(1.5, 3), color: 'rgba(201,166,255,1)', grav: 0, drag: 3, glow: true, grow: -3,
        });
      }
    }
    const mx = m.x + Math.cos(p.aim) * 4, my = m.y + Math.sin(p.aim) * 4;
    const puff = 3 + Math.min(5, Math.round(n + w.shake));
    for (let i = 0; i < puff; i++) {
      const col = w.color === '#c9a6ff' ? 'rgba(200,160,255,1)'
        : w.color === '#b8f0ff' ? 'rgba(180,240,255,1)' : 'rgba(255,210,120,1)';
      this.addParticle({
        x: mx, y: my, vx: Math.cos(p.aim) * rand(80, 260) + rand(-50, 50),
        vy: Math.sin(p.aim) * rand(80, 260) + rand(-50, 50),
        life: rand(.08, .2), max: .2, size: rand(2, 5), color: col,
        grav: 0, drag: 6, glow: true, grow: -6,
      });
    }
    this.shake = Math.min(12, this.shake + w.shake);
    switch (w.sound) {
      case 'shotgun': sfx.shotgun(); break;
      case 'sniper': sfx.sniper(); break;
      case 'rail': sfx.rail(); break;
      case 'minigun': sfx.minigun(); break;
      default: sfx.shoot();
    }
  }

  reload() { this.input.reload = true; }

  private startReload() {
    const p = this.player, w = WEAPONS[this.weapon];
    if (p.reloadT > 0 || w.mag === 0) return;
    p.reloadT = w.reload; p.reloadTotal = w.reload;
    p.spin = 0; p.charge = 0;
    sfx.reload();
    // drop the empty mag
    const g = this.heroGeom();
    if (this.casings.length > 70) this.casings.shift();
    this.casings.push({
      x: g.gx, y: g.gy + 4, vx: -g.dir * rand(10, 30), vy: rand(-40, -10), rot: 0, vr: rand(-6, 6),
      ground: g.bottom + rand(-2, 6), life: 3, rest: false, kind: 'brass',
    });
  }

  private ejectCasing(kind: 'brass' | 'shell') {
    if (this.casings.length > 70) this.casings.shift();
    const g = this.heroGeom();
    const meta = GUN_META[this.weapon];
    const port = gunSprites.hand[this.weapon]
      ? this.gunPoint(meta.eject[0], meta.eject[1])
      : { x: g.gx, y: g.gy - 4 };
    // pop out sideways from the port, away from the aim line
    const side = this.player.aim + (g.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
    const sp = rand(60, 130);
    this.casings.push({
      x: port.x, y: port.y,
      vx: Math.cos(side) * sp + rand(-30, 30) - Math.cos(this.player.aim) * 20,
      vy: Math.sin(side) * sp - rand(90, 170),
      rot: rand(0, TAU), vr: rand(-18, 18),
      ground: g.bottom + rand(-4, 10), life: rand(2.2, 3.2), rest: false, kind,
    });
  }

  private turretFire(t: Turret, z: Zombie) {
    const hy = t.y - 22;  // head height on the tower
    const a = Math.atan2(z.y - hy, z.x - t.x) + rand(-0.03, 0.03);
    t.ang = a; t.cd = 0.36; t.recoil = 1; t.heat = Math.min(1, t.heat + 0.12);
    const mx = t.x + Math.cos(a) * 18, my = hy + Math.sin(a) * 18;
    this.bullets.push({
      x: mx, y: my, px: mx, py: my, vx: Math.cos(a) * 640, vy: Math.sin(a) * 640,
      dmg: 9, life: 0.8, color: '#7dffe0', turret: true, pierce: 0, hits: [],
    });
    for (let i = 0; i < 2; i++) this.addParticle({
      x: mx, y: my,
      vx: Math.cos(a) * rand(60, 140) + rand(-30, 30), vy: Math.sin(a) * rand(60, 140) + rand(-30, 30),
      life: rand(.06, .14), max: .14, size: rand(2, 3.5), color: 'rgba(140,255,230,1)', grav: 0, drag: 6, glow: true, grow: -6,
    });
    // brass off the side of the mount
    if (this.casings.length < 70) this.casings.push({
      x: t.x, y: hy, vx: rand(-50, 50), vy: rand(-90, -40), rot: rand(0, TAU), vr: rand(-12, 12),
      ground: t.y + rand(6, 12), life: rand(1.5, 2.5), rest: false, kind: 'brass',
    });
    sfx.turret();
  }

  private autoAim(): number {
    let best: Zombie | null = null; let bd = 460 * 460;
    for (const z of this.zombies) {
      if (z.dead || z.flee || z.ambient) continue;
      const d = dist2(z.x, z.y, this.player.x, this.player.y);
      if (d < bd) { bd = d; best = z; }
    }
    if (best) return Math.atan2(best.y - this.player.y, best.x - this.player.x);
    if (this.lair.alive) return Math.atan2(this.lair.y - this.player.y, this.lair.x - this.player.x);
    return -Math.PI / 2;
  }

  private killZombie(z: Zombie, burned = false, overkill = false) {
    if (z.dead) return;
    z.dead = true;
    if (!burned) {
      this.stats.combo++;
      this.stats.comboT = 2.4;
      this.stats.maxCombo = Math.max(this.stats.maxCombo, this.stats.combo);
      if (this.stats.combo >= 3) sfx.combo(this.stats.combo);
    }
    const mult = 1 + Math.min(8, Math.floor(this.stats.combo / 5));
    const pts = burned ? Math.round(z.score * 0.5 * mult) : Math.round(z.score * mult * (overkill ? 1.25 : 1));
    this.stats.score += pts;
    this.stats.kills++;
    const big = z.type === 'brute';
    const mid = z.type === 'tank' || big;
    const cy = z.y - z.r * 1.3;
    this.gore(z.x, cy, big ? 26 : mid ? 18 : 12, big ? '120,70,150' : '90,180,70', big ? 1.5 : 1);
    if (overkill && !big) {
      // gibbed: body bursts instead of falling
      this.gore(z.x, cy, 16, '150,40,50', 1.4);
      this.rings.push({ x: z.x, y: cy, r: 4, vr: 240, life: .28, max: .28, color: '200,80,80', w: 3 });
      for (let i = 0; i < 6; i++) this.addParticle({
        x: z.x, y: cy, vx: rand(-160, 160), vy: rand(-260, -60), life: rand(.5, .9), max: .9,
        size: rand(3, 6), color: 'rgba(96,130,70,1)', grav: 620, drag: 1.2, glow: false, grow: -1,
      });
    }
    const coinTotal = randInt(z.coinMin, z.coinMax);
    const pieces = clamp(Math.round(coinTotal / 4), 1, 5);
    for (let i = 0; i < pieces; i++) {
      const a = rand(0, TAU), sp = rand(40, 150);
      this.coins.push({
        x: z.x, y: z.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 90,
        value: i === pieces - 1 ? coinTotal - (pieces - 1) : Math.floor(coinTotal / pieces),
        phase: rand(0, TAU), t: 0,
      });
    }
    if (coinTotal > 0) this.addText(z.x, z.y - z.r - 6, `+${coinTotal}`, '#ffd24a', big ? 19 : 14);
    this.shake = Math.min(12, this.shake + (big ? 3.6 : mid ? 1.8 : 0.9));
    if (big) {
      this.explosion(z.x, z.y, true);
      this.slowmo = Math.max(this.slowmo, 0.09);
      sfx.bruteDie();
    } else {
      if (overkill) sfx.gib(); else sfx.die();
      if (!burned && !overkill) this.dropCorpse(z);
    }
  }

  /** the body keels over away from the shot and soaks into the dirt */
  private dropCorpse(z: Zombie) {
    if (!zombieSprites.ready) return;
    const frames = zombieSprites.frames[z.type][z.anim];
    const frame = frames.length ? frames[Math.floor(z.animT) % frames.length] : null;
    const h = z.r * Game.zScale(z.type);
    const w = h * ((zombieSprites.fw || 60) / (zombieSprites.fh || 128));
    const facingLeft = Math.cos(z.face) < 0;
    // fall away from the knockback direction; default: forward
    const kick = Math.hypot(z.kx, z.ky) > 20 ? Math.sign(z.kx) || 1 : (facingLeft ? -1 : 1);
    if (this.corpses.length >= MAX_CORPSES) this.corpses.shift();
    this.corpses.push({
      x: z.x, y: z.y, frame, w, h, flip: facingLeft, dir: kick, t: 0, r: z.r,
      tint: z.type === 'tank' ? 'rgba(40,20,20,.35)' : 'rgba(30,10,20,.3)',
    });
  }

  private hurtPlayer(amount: number, sx: number, sy: number) {
    const p = this.player;
    if (p.invul > 0 || this.mode !== 'playing') return;
    p.hp -= amount;
    p.invul = 0.55; p.hurtFlash = 0.5; p.regenT = 4;
    const a = Math.atan2(p.y - sy, p.x - sx);
    p.vx += Math.cos(a) * 180; p.vy += Math.sin(a) * 180;
    this.gore(p.x, p.y, 7, '200,60,50', 0.8);
    this.shake = Math.min(14, this.shake + 5);
    this.flashColor = '255,50,50'; this.flashA = Math.max(this.flashA, 0.28);
    sfx.hurt();
    if (p.hp <= 0) { p.hp = 0; this.beginOver('player'); }
  }

  private hurtBase(amount: number, x: number, y: number) {
    if (this.mode !== 'playing') return;
    const b = this.base;
    b.hp -= amount; b.flash = 0.4;
    this.burstSpark(x, y, 8, '170,180,170', false);
    for (let i = 0; i < 4; i++) this.addParticle({
      x, y, vx: rand(-30, 30), vy: rand(-90, -30), life: rand(.4, .9), max: .9,
      size: rand(4, 8), color: 'rgba(90,90,85,.8)', grav: -40, drag: 1, glow: false, grow: 6,
    });
    this.shake = Math.min(16, this.shake + 3.4);
    this.flashColor = '255,90,50'; this.flashA = Math.max(this.flashA, 0.18);
    sfx.baseHit();
    if (b.hp / b.maxHp < 0.35 && b.alarm <= 0) { b.alarm = 2.4; sfx.alarm(); }
    if (b.hp <= 0) { b.hp = 0; this.beginOver('base'); }
  }

  private destroyLair() {
    if (!this.lair.alive) return;
    this.lair.alive = false; this.lair.deadT = 0;
    this.mode = 'clear'; this.clearT = 2.8; this.burstT = 0;
    const bonus = 500 * (this.level + 1);
    this.stats.score += bonus;
    this.addText(this.lair.x, this.lair.y - 30, `HIVE BONUS +${bonus}`, '#9dff4f', 22);
    this.explosion(this.lair.x, this.lair.y, true);
    this.slowmo = 0.4;
    this.flashColor = '160,255,90'; this.flashA = 0.35;
    for (const z of this.zombies) z.flee = true;
  }

  private beginOver(reason: 'base' | 'player') {
    if (this.mode === 'over') return;
    this.overReason = reason;
    this.mode = 'over'; this.overT = 1.9; this.burstT = 0;
    this.player.vx = this.player.vy = 0;
    if (reason === 'player') { this.player.deadT = 0; sfx.playerDie(); }
    const x = reason === 'base' ? this.base.x : this.player.x;
    const y = reason === 'base' ? this.base.y : this.player.y;
    this.explosion(x, y, true);
    this.slowmo = 0.55;
    this.flashColor = '255,60,40'; this.flashA = 0.4;
    sfx.gameOver();
  }

  /* ---------------- update: playing ---------------- */
  private updatePlay(dt: number) {
    const p = this.player;
    // movement: touch stick > keyboard
    let mx = this.input.moveX, my = this.input.moveY;
    if (mx === 0 && my === 0) {
      let kx = 0, ky = 0;
      if (this.keys.has('w') || this.keys.has('arrowup')) ky -= 1;
      if (this.keys.has('s') || this.keys.has('arrowdown')) ky += 1;
      if (this.keys.has('a') || this.keys.has('arrowleft')) kx -= 1;
      if (this.keys.has('d') || this.keys.has('arrowright')) kx += 1;
      if (kx || ky) { const l = Math.hypot(kx, ky); mx = kx / l; my = ky / l; }
    }
    const spd = 238 * this.speedMul();
    p.vx += (mx * spd - p.vx) * Math.min(1, dt * 14);
    p.vy += (my * spd - p.vy) * Math.min(1, dt * 14);
    p.x = clamp(p.x + p.vx * dt, 24, this.world.w - 24);
    p.y = clamp(p.y + p.vy * dt, this.lair.y + this.lair.r * 1.02, this.world.h - 46);

    // aim (measured from the gun grip so shots land under the cursor)
    if (this.input.touchAim) {
      p.aim = Math.atan2(this.input.touchAimY, this.input.touchAimX);
    } else if (this.input.space) {
      p.aim = this.autoAim();
    } else if (this.input.mouse) {
      const g = this.heroGeom();
      p.aim = Math.atan2(this.input.mouseY - g.gy, this.input.mouseX - g.gx);
    }
    // facing with a little hysteresis so aiming straight up never flickers
    const cx = Math.cos(p.aim);
    if (cx < -0.1) p.facingLeft = true;
    else if (cx > 0.1) p.facingLeft = false;
    // legs follow the direction of travel (torso keeps facing the aim → strafing)
    if (Math.abs(p.vx) > 40) p.legsLeft = p.vx < 0;
    else if (Math.hypot(p.vx, p.vy) < 45) p.legsLeft = p.facingLeft;
    const wantFire = this.input.firing || this.input.space || this.input.touchAim;
    const w = WEAPONS[this.weapon];

    // reload state machine
    if (p.reloadT > 0) {
      p.reloadT -= dt;
      if (p.reloadT <= 0) { p.reloadT = 0; p.ammo[this.weapon] = w.mag; }
    } else if (w.mag > 0 && p.ammo[this.weapon] <= 0) {
      this.startReload();
    } else if (this.input.reload && p.ammo[this.weapon] < w.mag) {
      this.startReload();
    }
    this.input.reload = false;

    // minigun spins up before it fires; railgun charges then releases
    const canFire = p.reloadT <= 0 && (w.mag === 0 || p.ammo[this.weapon] > 0);
    if (this.weapon === 'minigun') {
      p.spin = clamp(p.spin + (wantFire && canFire ? dt / 0.55 : -dt / 0.9), 0, 1);
      if (wantFire && canFire && p.spin < 1 && Math.random() < dt * 22) sfx.minigunSpin(p.spin);
      if (wantFire && canFire && p.spin >= 1 && p.fireT <= 0) this.fire();
    } else if (this.weapon === 'railgun') {
      if (wantFire && canFire && p.fireT <= 0) {
        if (p.charge === 0) sfx.railCharge();
        p.charge = Math.min(1, p.charge + dt / 0.45);
        if (p.charge >= 1) { this.fire(); p.charge = 0; }
      } else if (!wantFire) {
        p.charge = Math.max(0, p.charge - dt * 4);
      }
    } else {
      p.spin = 0;
      if (wantFire && canFire && p.fireT <= 0) this.fire();
    }
    // shoulder the weapon while firing / charging, relax when idle
    const wantShoulder = (wantFire && canFire) || p.charge > 0 || p.fireT > 0 ? 1 : 0;
    p.shoulder += (wantShoulder - p.shoulder) * Math.min(1, dt * (wantShoulder ? 10 : 3));

    p.fireT -= dt;
    p.recoil = Math.max(0, p.recoil - dt * 9);
    p.muzzle = Math.max(0, p.muzzle - dt);
    p.hurtFlash = Math.max(0, p.hurtFlash - dt * 2);
    p.invul = Math.max(0, p.invul - dt);
    p.regenT -= dt;
    // med station: rapid heal near the bunker
    const nearBase = this.upgrades.medbay > 0 && dist2(p.x, p.y, this.base.x, this.base.y) < 150 * 150;
    if (nearBase && p.hp < p.maxHp) {
      p.hp = Math.min(p.maxHp, p.hp + dt * (6 + this.upgrades.medbay * 6));
      this.base.medPulse += dt;
      if (Math.random() < dt * 6) this.addParticle({
        x: p.x + rand(-10, 10), y: p.y - rand(0, 30), vx: 0, vy: -30, life: .6, max: .6, size: 2.5,
        color: 'rgba(120,255,160,.9)', grav: 0, drag: 1, glow: true, grow: -2,
      });
    } else if (p.regenT <= 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + dt * 4.5);

    this.updateLairDirector(dt);
    this.updateTurrets(dt);
    this.updateZombies(dt, false);
    this.updateBullets(dt);
    this.updateCoins(dt);
  }

  private updateClear(dt: number) {
    this.clearT -= dt;
    this.lair.deadT += dt;
    this.burstT -= dt;
    if (this.burstT <= 0 && this.lair.deadT < 1.4) {
      this.burstT = 0.2;
      this.explosion(
        this.lair.x + rand(-30, 30),
        this.lair.y + rand(-20, 20),
        false,
      );
    }
    const p = this.player;
    let mx = this.input.moveX, my = this.input.moveY;
    if (mx === 0 && my === 0) {
      let kx = 0, ky = 0;
      if (this.keys.has('w') || this.keys.has('arrowup')) ky -= 1;
      if (this.keys.has('s') || this.keys.has('arrowdown')) ky += 1;
      if (this.keys.has('a') || this.keys.has('arrowleft')) kx -= 1;
      if (this.keys.has('d') || this.keys.has('arrowright')) kx += 1;
      if (kx || ky) { const l = Math.hypot(kx, ky); mx = kx / l; my = ky / l; }
    }
    const spd = 238 * this.speedMul();
    p.vx += (mx * spd - p.vx) * Math.min(1, dt * 14);
    p.vy += (my * spd - p.vy) * Math.min(1, dt * 14);
    p.x = clamp(p.x + p.vx * dt, 24, this.world.w - 24);
    p.y = clamp(p.y + p.vy * dt, this.lair.y + this.lair.r * 1.02, this.world.h - 46);
    p.recoil = Math.max(0, p.recoil - dt * 9);
    this.updateTurrets(dt);
    this.updateZombies(dt, true);
    this.updateBullets(dt);
    this.updateCoins(dt);
    if (this.clearT <= 0) {
      // any stragglers dissolve into coin rewards
      for (const z of this.zombies) if (!z.dead) this.killZombie(z, true);
      this.zombies = [];
      this.mode = 'intermission';
      if (this.level >= LEVELS.length - 1) { sfx.victory(); this.emit({ type: 'victory' }); }
      else { sfx.levelClear(); this.emit({ type: 'levelclear', level: this.level }); }
    }
  }

  private updateOver(dt: number) {
    this.overT -= dt;
    this.burstT -= dt;
    const tx = this.overReason === 'base' ? this.base.x : this.player.x;
    const ty = this.overReason === 'base' ? this.base.y : this.player.y;
    if (this.burstT <= 0 && this.overT > 0.6) {
      this.burstT = 0.22;
      this.explosion(tx + rand(-26, 26), ty + rand(-26, 26), false);
    }
    if (this.overT <= 0) {
      this.mode = 'dead';
      this.emit({ type: 'gameover', reason: this.overReason });
    }
  }

  private updateLairDirector(dt: number) {
    const L = this.lair;
    if (!L.alive) return;
    const ratio = L.hp / L.maxHp;
    L.spawnT -= dt;
    if (L.spawnT <= 0 && this.zombies.filter((z) => !z.ambient && !z.dead).length < this.cfg.cap) {
      this.spawnZombie();
      L.spawnT = this.cfg.interval * (0.65 + 0.45 * ratio) * rand(0.85, 1.2);
    }
    L.rushT -= dt;
    if (L.rushT <= 0 && L.telegraph <= 0) {
      L.telegraph = 1;
      L.burst = 3 + this.level + randInt(0, 2);
      sfx.rush();
      L.rushT = this.cfg.rush;
    }
    if (L.telegraph > 0) {
      L.telegraph -= dt / 0.95;
      if (L.telegraph <= 0 && L.burst > 0) {
        const n = L.burst;
        for (let i = 0; i < n; i++) this.spawnZombie();
        this.burstSpark(L.x, L.y + L.r * 0.4, 16, '157,255,79', true);
        this.shake = Math.min(10, this.shake + 3);
        L.burst = 0;
      }
    }
    L.hitFlash = Math.max(0, L.hitFlash - dt * 4);
    L.goopT -= dt;
    if (L.goopT <= 0) {
      L.goopT = 0.35;
      this.addParticle({
        x: L.x + rand(-L.r * 0.6, L.r * 0.6), y: L.y + rand(-L.r * 0.2, L.r * 0.5),
        vx: rand(-8, 8), vy: rand(20, 60), life: rand(.5, 1), max: 1,
        size: rand(2, 5), color: 'rgba(120,220,90,.7)', grav: 60, drag: 1, glow: true, grow: 2,
      });
    }
  }

  private updateTurrets(dt: number) {
    for (const t of this.turrets) {
      t.recoil = Math.max(0, t.recoil - dt * 8);
      t.heat = Math.max(0, t.heat - dt * 0.4);
      if (t.build < 1) { t.build = Math.min(1, t.build + dt / 0.6); continue; }
      let best: Zombie | null = null; let bd = 300 * 300;
      for (const z of this.zombies) {
        if (z.dead || z.ambient || z.spawnT < 1) continue;
        const d = dist2(z.x, z.y, t.x, t.y);
        if (d < bd) { bd = d; best = z; }
      }
      t.cd -= dt;
      if (best) {
        const want = Math.atan2(best.y - (t.y - 22), best.x - t.x);
        t.ang = angLerp(t.ang, want, Math.min(1, dt * 8));
        if (t.cd <= 0 && Math.abs(angLerp(t.ang, want, 1) - t.ang) < 0.25) this.turretFire(t, best);
      } else {
        // idle scan sweep
        t.ang = angLerp(t.ang, -Math.PI / 2 + Math.sin(this.time * 0.8 + t.ox) * 0.5, Math.min(1, dt * 2));
      }
    }
    this.updateTesla(dt);
    this.updateBarricade(dt);
  }

  /** arc coil on the bunker roof: chain lightning through up to N nearby zombies */
  private updateTesla(dt: number) {
    const lvl = this.upgrades.tesla;
    if (lvl <= 0) return;
    const b = this.base;
    // top sphere of the coil (matches drawTesla: roof - mast - rings)
    const H = 58 + this.upgrades.walls * 2;
    const cx = b.x, cy = b.y - H / 2 - 4 - 30 - lvl * 5;
    b.teslaCd -= dt;
    const period = 2.6 - lvl * 0.4;
    b.teslaCharge = clamp(1 - b.teslaCd / period, 0, 1);
    if (b.teslaCd > 0) return;
    const range = 150 + lvl * 25;
    const chain = 2 + lvl;
    const dmg = 14 + lvl * 8;
    // nearest first, then hop to the nearest un-hit neighbour
    const pool = this.zombies.filter((z) => !z.dead && !z.ambient && z.spawnT >= 1 && dist2(z.x, z.y, cx, cy) < range * range);
    if (!pool.length) { b.teslaCd = 0.25; return; }
    b.teslaCd = period;
    let fromX = cx, fromY = cy;
    const hit: Zombie[] = [];
    for (let i = 0; i < chain && pool.length; i++) {
      let best = -1, bd = Infinity;
      for (let k = 0; k < pool.length; k++) {
        const d = dist2(pool[k].x, pool[k].y, fromX, fromY);
        if (d < bd && (i === 0 || d < 120 * 120)) { bd = d; best = k; }
      }
      if (best < 0) break;
      const z = pool.splice(best, 1)[0];
      const tx = z.x, ty = z.y - z.r * 1.2;
      this.arcs.push({ pts: this.lightningPath(fromX, fromY, tx, ty), life: 0.22, max: 0.22, w: 3 - i * 0.4 });
      z.hp -= dmg; z.hitFlash = 0.14;
      z.kx += rand(-40, 40); z.ky += rand(-40, 40);
      this.burstSpark(tx, ty, 6, '150,220,255', true);
      this.addText(tx, ty - 14, String(dmg), '#9ad8ff', 12);
      if (z.hp <= 0) this.killZombie(z);
      hit.push(z);
      fromX = tx; fromY = ty;
    }
    if (hit.length) {
      sfx.tesla();
      this.shake = Math.min(8, this.shake + 1.2);
      this.flashColor = '140,200,255'; this.flashA = Math.max(this.flashA, 0.06);
    }
  }

  private lightningPath(x1: number, y1: number, x2: number, y2: number) {
    const pts = [{ x: x1, y: y1 }];
    const segs = 7;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      const off = rand(-1, 1) * len * 0.09 * Math.sin(t * Math.PI);
      pts.push({ x: x1 + dx * t + nx * off, y: y1 + dy * t + ny * off });
    }
    pts.push({ x: x2, y: y2 });
    return pts;
  }

  /** razor wire: slows and shreds anything crossing the line */
  private updateBarricade(dt: number) {
    const lvl = this.upgrades.barricade;
    if (lvl <= 0) return;
    const y = this.barricadeY();
    const half = 70 + lvl * 24;
    for (const z of this.zombies) {
      if (z.dead || z.ambient) continue;
      if (Math.abs(z.y - y) < 10 && Math.abs(z.x - this.base.x) < half) {
        z.y -= z.speed * dt * 0.55;              // wading through wire
        z.hp -= (5 + lvl * 4) * dt;
        if (Math.random() < dt * 6) {
          this.gore(z.x, z.y, 2, '110,200,80', 0.4);
          if (Math.random() < 0.3) sfx.ricochet();
        }
        if (z.hp <= 0) this.killZombie(z);
      }
    }
  }

  private updateZombies(dt: number, fleeing: boolean) {
    const p = this.player, b = this.base;
    for (const z of this.zombies) {
      if (z.dead) continue;
      z.phase += dt * z.wob * (z.type === 'runner' ? 2.2 : 1.2);
      z.hitFlash = Math.max(0, z.hitFlash - dt * 6);
      z.atkCd -= dt;

      // --- animation state machine ---
      const attacking = z.attackT >= 0;
      const wantAnim: ZAnim = z.flee ? 'run'
        : attacking ? 'attack'
          : z.spawnT < 1 ? 'idle'
            : z.type === 'runner' ? 'run' : 'walk';
      if (wantAnim !== z.anim) { z.anim = wantAnim; z.animT = 0; }
      const attackFrames = zombieSprites.counts.attack || 8;
      const fps = z.anim === 'attack' ? attackFrames / ATTACK_DUR
        : z.anim === 'run' ? 15 * (z.speed / 94)
          : z.anim === 'walk' ? 9 * Math.max(0.6, z.speed / 42) : 5;
      z.animT += dt * fps;

      // knockback
      z.x += z.kx * dt; z.y += z.ky * dt;
      z.kx *= Math.pow(0.0008, dt); z.ky *= Math.pow(0.0008, dt);

      // rising out of the hive: no movement or attacks yet
      if (z.spawnT < 1) {
        z.spawnT = Math.min(1, z.spawnT + dt / 0.45);
        z.face = angLerp(z.face, Math.PI / 2, Math.min(1, dt * 4));
        continue;
      }

      // committed swipe: hold position, land the hit mid-animation
      if (attacking && !fleeing) {
        z.attackT += dt;
        if (!z.struck && z.attackT >= ATTACK_HIT) {
          z.struck = true;
          if (z.atkTarget === 'player') {
            if (dist2(z.x, z.y, p.x, p.y) < (z.r + p.r + 16) ** 2) {
              this.hurtPlayer(z.dmg * 0.5, z.x, z.y);
            }
            z.kx -= Math.cos(z.face) * 50; z.ky -= Math.sin(z.face) * 50;
          } else if (dist2(z.x, z.y, b.x, b.y) < (z.r + b.r + 18) ** 2) {
            const hx = z.x + Math.cos(z.face) * (z.r + 6);
            const hy = z.y + Math.sin(z.face) * (z.r + 6);
            this.hurtBase(z.dmg, hx, hy);
            z.kx -= Math.cos(z.face) * 40; z.ky -= Math.sin(z.face) * 40;
          }
        }
        if (z.attackT >= ATTACK_DUR) { z.attackT = -1; z.atkCd = 0.42; }
        continue;
      }

      if (fleeing && z.flee) {
        // burning rout back into the hive
        z.hp -= 30 * dt;
        if (Math.random() < dt * 14) this.addParticle({
          x: z.x + rand(-6, 6), y: z.y + rand(-8, 4), vx: rand(-16, 16), vy: rand(-70, -20),
          life: .35, max: .35, size: rand(2, 5), color: Math.random() < .5 ? 'rgba(157,255,79,1)' : 'rgba(255,160,60,1)',
          grav: -30, drag: 2, glow: true, grow: 2,
        });
        const a = -Math.PI / 2 + Math.sin(z.phase * 1.7) * 0.5;
        z.x += Math.cos(a) * z.speed * 1.5 * dt;
        z.y += Math.sin(a) * z.speed * 1.5 * dt;
        z.face = angLerp(z.face, a, Math.min(1, dt * 8));
        if (z.hp <= 0) this.killZombie(z, true);
        if (z.y < -60) z.dead = true;
        continue;
      }

      // pick target: nearby player aggro, otherwise the bunker
      z.retarget -= dt;
      const dPlayer = dist2(z.x, z.y, p.x, p.y);
      let tx = b.x, ty = b.y;
      if (dPlayer < 150 * 150) { tx = p.x; ty = p.y; }
      else if (z.retarget <= 0) z.retarget = 0.4;
      let dx = tx - z.x, dy = ty - z.y;
      let dl = Math.hypot(dx, dy) || 1;
      const wobble = Math.sin(z.phase) * 0.22;
      const wx = -dy / dl * wobble, wy = dx / dl * wobble;
      let ux = (dx / dl) + wx, uy = (dy / dl) + wy;

      // separation from the horde
      for (const o of this.zombies) {
        if (o === z || o.dead || o.ambient) continue;
        const sx = z.x - o.x, sy = z.y - o.y;
        const sd = sx * sx + sy * sy;
        const rr = z.r + o.r;
        if (sd < rr * rr && sd > 0.01) {
          const sl = Math.sqrt(sd);
          const push = (rr - sl) / rr * 2.6;
          ux += (sx / sl) * push; uy += (sy / sl) * push;
        }
      }
      const ul = Math.hypot(ux, uy) || 1;
      z.x += (ux / ul) * z.speed * dt;
      z.y += (uy / ul) * z.speed * dt;
      z.x = clamp(z.x, 16, this.world.w - 16);
      z.face = angLerp(z.face, Math.atan2(dy, dx), Math.min(1, dt * 6));
      if (z.type === 'runner' && Math.random() < dt * 5) this.addParticle({
        x: z.x + rand(-4, 4), y: z.y + z.r * 0.5, vx: -(ux / ul) * rand(10, 30), vy: rand(-18, -6),
        life: rand(.25, .45), max: .45, size: rand(2, 3.5), color: 'rgba(150,140,120,.3)', grav: -10, drag: 2, glow: false, grow: 7,
      });

      // in range → commit to a telegraphed swipe
      if (z.atkCd <= 0) {
        if (dPlayer < (z.r + p.r + 6) ** 2) {
          z.attackT = 0; z.struck = false; z.atkTarget = 'player';
          z.face = Math.atan2(p.y - z.y, p.x - z.x);
          sfx.zombieAttack();
        } else if (dist2(z.x, z.y, b.x, b.y) < (z.r + b.r) ** 2) {
          z.attackT = 0; z.struck = false; z.atkTarget = 'base';
          z.face = Math.atan2(b.y - z.y, b.x - z.x);
          sfx.zombieAttack();
        }
      }
      // ambient moaning from whoever is closest
      if (dPlayer < 220 * 220 && Math.random() < dt * 0.25) sfx.groan();
    }
    this.zombies = this.zombies.filter((z) => !z.dead);
  }

  private updateBullets(dt: number) {
    const L = this.lair;
    for (const b of this.bullets) {
      b.px = b.x; b.py = b.y;
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      let hit = false;
      if (b.trail) {
        if (this.trails.length > 240) this.trails.shift();
        this.trails.push({ x1: b.px, y1: b.py, x2: b.x, y2: b.y, life: b.trail, max: b.trail, color: b.color, w: b.trailW ?? 2 });
      }

      for (const z of this.zombies) {
        if (z.dead || z.ambient) continue;
        if (b.hits.indexOf(z) >= 0) continue;
        const headY = z.y - Game.zScale(z.type) * z.r * 0.86;
        const bodyHit = dist2(b.x, b.y, z.x, z.y - z.r * 1.4) < (z.r * 1.5) * (z.r * 1.5)
          || dist2(b.x, b.y, z.x, z.y) < (z.r + 6) * (z.r + 6);
        const headHit = dist2(b.x, b.y, z.x, headY) < (z.r * 0.85) * (z.r * 0.85);
        if (bodyHit || headHit) {
          const head = headHit && !bodyHit;
          const dealt = b.dmg * (head ? 2 : 1);
          z.hp -= dealt;
          z.hitFlash = 0.1;
          const a = Math.atan2(b.vy, b.vx);
          z.kx += Math.cos(a) * (b.turret ? 50 : b.big ? 190 : 95);
          z.ky += Math.sin(a) * (b.turret ? 50 : b.big ? 190 : 95);
          this.gore(b.x, b.y, b.turret ? 3 : b.big ? 9 : 5,
            b.turret ? '90,255,210' : head ? '220,90,70' : '110,200,80', b.big ? 1.1 : 0.6);
          // impact sparks along the bullet direction
          for (let i = 0; i < (b.big ? 5 : 2); i++) this.addParticle({
            x: b.x, y: b.y, vx: -Math.cos(a) * rand(40, 160) + rand(-60, 60), vy: -Math.sin(a) * rand(40, 160) + rand(-60, 60),
            life: rand(.1, .25), max: .25, size: rand(1.2, 2.4), color: b.turret ? 'rgba(160,255,235,1)' : 'rgba(255,230,160,1)',
            grav: 200, drag: 3, glow: true, grow: -4,
          });
          if (head || dealt >= 20) {
            this.addText(b.x + rand(-6, 6), b.y - 12, String(Math.round(dealt)), head ? '#ff7a5a' : '#ffe9b0', head ? 15 : 11);
          }
          if (head) sfx.headshot(); else sfx.hit();
          if (z.hp <= 0) this.killZombie(z, false, dealt >= z.maxHp * 1.2 || !!b.big);
          b.hits.push(z);
          if (b.pierce > 0) { b.pierce--; }
          else { hit = true; }
          break;
        }
      }
      if (!hit && L.alive) {
        const rr = L.r * 0.78;
        if (dist2(b.x, b.y, L.x, L.y) < rr * rr && b.y < L.y + L.r) {
          L.hp -= b.dmg;
          L.hitFlash = 0.12;
          this.burstSpark(b.x, b.y, 4, '157,255,79', true);
          // glass splinters + goo drip
          for (let i = 0; i < 3; i++) this.addParticle({
            x: b.x, y: b.y, vx: rand(-90, 90), vy: rand(-140, -20), life: rand(.3, .6), max: .6,
            size: rand(1.5, 3), color: 'rgba(200,255,190,.95)', grav: 520, drag: 1, glow: true, grow: -2,
          });
          this.shake = Math.min(8, this.shake + 0.4);
          if (b.big || Math.random() < 0.25) sfx.hiveCrack(); else sfx.hiveHit();
          if (L.hp <= 0) { L.hp = 0; this.destroyLair(); }
          hit = true;
        }
      }
      if (!hit && b.life <= 0 && !b.turret && b.y > 60 && b.y < this.world.h - 10) {
        // spent round skips off the grating
        this.burstSpark(b.x, b.y, 3, '255,230,160', true);
        if (Math.random() < 0.35) sfx.ricochet();
      }
      if (hit || b.life <= 0 || b.x < -20 || b.x > this.world.w + 20 || b.y < -20 || b.y > this.world.h + 20) {
        b.life = 0;
      }
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
  }

  private updateCoins(dt: number) {
    const p = this.player;
    for (const c of this.coins) {
      c.t += dt; c.phase += dt * 5;
      if (c.t < 0.35) {
        c.vy += 700 * dt;
        c.x += c.vx * dt; c.y += c.vy * dt;
        c.vx *= Math.pow(0.02, dt);
      } else {
        const dx = p.x - c.x, dy = p.y - c.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < 120) {
          const pull = 1500 * (1 - d / 160);
          c.vx += (dx / d) * pull * dt;
          c.vy += (dy / d) * pull * dt;
        }
        c.vx *= Math.pow(0.06, dt); c.vy *= Math.pow(0.06, dt);
        c.x += c.vx * dt; c.y += c.vy * dt;
        if (d < 22) {
          this.stats.coins += c.value;
          this.stats.score += c.value * 2;
          c.t = -1;
          this.burstSpark(p.x, p.y, 3, '255,210,74', true);
          sfx.coin();
        }
      }
    }
    this.coins = this.coins.filter((c) => c.t >= 0);
  }

  /* ---------------- ambient / cosmetic ---------------- */
  private updateAmbient(dt: number) {
    for (const z of this.zombies) {
      if (!z.ambient) continue;
      z.phase += dt * 0.8;
      z.retarget -= dt;
      if (z.retarget <= 0) {
        z.retarget = rand(2, 5);
        const a = rand(0, TAU), rr = rand(this.lair.r * 1.2, this.lair.r * 2.7);
        z.tx = this.lair.x + Math.cos(a) * rr;
        z.ty = this.lair.y + 40 + Math.sin(a) * rr * 0.6;
      }
      const dx = z.tx - z.x, dy = z.ty - z.y;
      const d = Math.hypot(dx, dy) || 1;
      const moving = d > 8;
      const wantAnim: ZAnim = moving ? 'walk' : 'idle';
      if (wantAnim !== z.anim) { z.anim = wantAnim; z.animT = 0; }
      z.animT += dt * (moving ? 7 : 4.5);
      z.x += (dx / d) * z.speed * dt + Math.sin(z.phase) * 6 * dt;
      z.y += (dy / d) * z.speed * dt;
      z.face = angLerp(z.face, Math.atan2(dy, dx), dt * 4);
    }
    this.lair.goopT -= dt;
    if (this.lair.goopT <= 0) {
      this.lair.goopT = 0.5;
      this.addParticle({
        x: this.lair.x + rand(-this.lair.r * 0.6, this.lair.r * 0.6),
        y: this.lair.y + rand(-this.lair.r * 0.2, this.lair.r * 0.5),
        vx: rand(-8, 8), vy: rand(15, 45), life: rand(.6, 1.2), max: 1.2,
        size: rand(2, 5), color: 'rgba(120,220,90,.6)', grav: 40, drag: 1, glow: true, grow: 2,
      });
    }
  }

  /** hero animation: idle / walk / run, reversed when back-pedalling from the aim */
  private tickHero(dt: number) {
    const p = this.player;
    if (p.deadT >= 0) { p.deadT += dt; return; }
    const live = this.mode === 'playing' || this.mode === 'clear';
    const sp = live ? Math.hypot(p.vx, p.vy) : 0;
    const want: HeroAnim = sp > 150 ? 'run' : sp > 45 ? 'walk' : 'idle';
    if (want !== p.anim) {
      // coming to a stop: little settle bounce
      if (want === 'idle' && p.anim === 'run') p.landT = 0.22;
      p.anim = want; p.animT = 0;
    }
    // stride rate tracks ground speed so the feet never slide
    const fps = want === 'run' ? 11 + (sp / 240) * 4 : want === 'walk' ? 6 + (sp / 150) * 4 : 6;
    p.animT += dt * fps;
    if (p.animT > 4096) p.animT -= 4096;
    p.landT = Math.max(0, p.landT - dt);
    p.breathe += dt * (p.hp / p.maxHp < 0.3 ? 4.2 : 2.2);

    // the visible aim lags the true aim: heavier guns swing slower
    const w = GUN_META[this.weapon];
    const weight = w.len > 40 ? 9 : w.len > 30 ? 13 : 20;
    const k = Math.min(1, dt * weight);
    p.aimVis = angLerp(p.aimVis, p.aim, k);
  }

  private updateCorpses(dt: number) {
    for (const c of this.corpses) c.t += dt;
    if (this.corpses.length && this.corpses[0].t > 9) this.corpses.shift();
  }

  private updateCasings(dt: number) {
    for (const k of this.casings) {
      if (k.rest) { k.life -= dt; continue; }
      k.vy += 980 * dt;
      k.x += k.vx * dt; k.y += k.vy * dt; k.rot += k.vr * dt;
      if (k.y >= k.ground && k.vy > 0) {
        k.y = k.ground;
        if (k.vy < 60) { k.rest = true; k.vr = 0; continue; }
        k.vy = -k.vy * 0.38; k.vx *= 0.55; k.vr *= 0.5;
      }
    }
    this.casings = this.casings.filter((k) => k.life > 0);
  }

  private updateTrails(dt: number) {
    for (const t of this.trails) t.life -= dt;
    this.trails = this.trails.filter((t) => t.life > 0);
  }

  /** gun heat, swap bounce, running footsteps */
  private updateHeroFx(dt: number) {
    const p = this.player;
    p.swapT = Math.max(0, p.swapT - dt);
    p.muzzleLight = Math.max(0, p.muzzleLight - dt * 14);
    p.heat = Math.max(0, p.heat - dt * 0.28);
    if (p.heat > 0.45 && p.deadT < 0 && Math.random() < dt * (6 + p.heat * 14)) {
      const m = this.muzzle();
      this.addParticle({
        x: m.x + rand(-2, 2), y: m.y + rand(-2, 2), vx: rand(-10, 10), vy: rand(-45, -20),
        life: rand(.4, .9), max: .9, size: rand(2, 4), color: `rgba(140,140,135,${0.25 + p.heat * 0.3})`,
        grav: -20, drag: 1.5, glow: false, grow: 7,
      });
    }
    if ((p.anim === 'run' || p.anim === 'walk') && p.deadT < 0 && (this.mode === 'playing' || this.mode === 'clear')) {
      p.stepT -= dt;
      if (p.stepT <= 0) {
        const run = p.anim === 'run';
        p.stepT = (run ? 0.17 : 0.3) / this.speedMul();
        const g = this.heroGeom();
        sfx.step(run);
        this.addParticle({
          x: p.x + rand(-4, 4) - g.dir * 6, y: g.bottom - 1, vx: -g.dir * rand(10, 30) + rand(-8, 8), vy: rand(-22, -8),
          life: rand(.3, .5), max: .5, size: rand(2, 4), color: 'rgba(150,140,120,.35)', grav: -10, drag: 2, glow: false, grow: 8,
        });
      }
    }
    // minigun barrel whine + railgun charge glow particles
    if (p.charge > 0 && p.deadT < 0) {
      const m = this.muzzle();
      if (Math.random() < dt * 40 * p.charge) {
        const a = rand(0, TAU), d = 14 + rand(0, 10);
        this.addParticle({
          x: m.x + Math.cos(a) * d, y: m.y + Math.sin(a) * d, vx: -Math.cos(a) * 90, vy: -Math.sin(a) * 90,
          life: .18, max: .18, size: rand(1.5, 2.6), color: 'rgba(201,166,255,1)', grav: 0, drag: 1, glow: true, grow: -4,
        });
      }
    }
  }

  private updateCosmetic(dt: number) {
    this.time += dt;
    this.lair.pulse += dt;
    this.lair.burp = Math.max(0, this.lair.burp - dt * 3.2);
    this.base.alarm = Math.max(0, this.base.alarm - dt);
    this.base.buildT = Math.max(0, this.base.buildT - dt);
    this.tickHero(dt);
    this.updateHeroFx(dt);
    this.updateCorpses(dt);
    this.updateCasings(dt);
    this.updateTrails(dt);
    for (const a of this.arcs) a.life -= dt;
    this.arcs = this.arcs.filter((a) => a.life > 0);

    // ambience follows the fight
    const live = this.mode === 'playing' || this.mode === 'clear';
    const horde = this.zombies.filter((z) => !z.ambient && !z.dead).length;
    const intensity = live ? clamp(0.35 + horde / 18, 0.35, 1) : this.mode === 'ambient' ? 0.15 : 0.25;
    const danger = live ? Math.max(
      this.player.hp / this.player.maxHp < 0.3 ? 1 - (this.player.hp / this.player.maxHp) / 0.3 : 0,
      this.base.hp / this.base.maxHp < 0.3 ? 0.7 * (1 - (this.base.hp / this.base.maxHp) / 0.3) : 0,
    ) : 0;
    setAmbience(intensity, danger, this.lair.alive);
    tickAmbience(dt);
    // keep coins vacuuming during cinematics / menus
    if (this.mode === 'intermission' || this.mode === 'dead' || this.mode === 'over' || this.mode === 'ambient') {
      this.updateCoins(dt);
    }
    this.base.flash = Math.max(0, this.base.flash - dt * 2.5);
    this.base.smokeT -= dt;
    if (this.base.hp / this.base.maxHp < 0.4 && this.base.smokeT <= 0 && this.mode !== 'ambient') {
      this.base.smokeT = 0.18;
      this.addParticle({
        x: this.base.x + rand(-20, 20), y: this.base.y - 26, vx: rand(-12, 12), vy: rand(-70, -40),
        life: rand(.6, 1.2), max: 1.2, size: rand(5, 9), color: 'rgba(70,70,65,.7)',
        grav: -30, drag: 1, glow: false, grow: 8,
      });
    }
    // floating toxic dust
    this.dustT -= dt;
    if (this.dustT <= 0 && this.particles.length < 380) {
      this.dustT = 0.12;
      this.addParticle({
        x: rand(0, this.world.w), y: rand(0, this.world.h), vx: rand(-8, 8), vy: rand(-14, -4),
        life: rand(1.6, 3.2), max: 3.2, size: rand(1, 2.4),
        color: Math.random() < 0.5 ? 'rgba(140,220,110,.16)' : 'rgba(120,180,200,.12)',
        grav: 0, drag: 0.4, glow: false, grow: 0.4,
      });
    }
    // combo timer
    if (this.stats.comboT > 0) {
      this.stats.comboT -= dt;
      if (this.stats.comboT <= 0) this.stats.combo = 0;
    }

    for (const p of this.particles) {
      p.life -= dt;
      p.vy += p.grav * dt;
      const dragF = Math.pow(0.5, p.drag * dt);
      p.vx *= dragF; p.vy *= dragF;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.size = Math.max(0.2, p.size + p.grow * dt);
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const r of this.rings) { r.life -= dt; r.r += r.vr * dt; r.vr *= Math.pow(0.2, dt); }
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const t of this.texts) { t.life -= dt; t.y += t.vy * dt; t.vy *= Math.pow(0.2, dt); }
    this.texts = this.texts.filter((t) => t.life > 0);

    this.shake = Math.max(0, this.shake - dt * 26);
    if (this.shake < 0.08) this.shake = 0;
    this.flashA = Math.max(0, this.flashA - dt * 1.6);
    this.slowmo = Math.max(0, this.slowmo - dt);
  }

  /* ---------------- main loop ---------------- */
  private loop = (now: number) => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    let dtReal = (now - this.last) / 1000;
    this.last = now;
    if (dtReal > 0.1) dtReal = 0.1;

    if (this.mode !== 'paused') {
      const scale = this.slowmo > 0 ? 0.28 : 1;
      this.acc += dtReal * scale;
      let steps = 0;
      while (this.acc >= STEP && steps < 5) {
        this.step(STEP);
        this.acc -= STEP; steps++;
      }
    }
    this.render();

    this.hudAcc += dtReal;
    if (this.hudAcc >= 0.1) {
      this.hudAcc = 0;
      if (this.mode !== 'ambient') this.emitHud();
    }
  };

  private step(dt: number) {
    switch (this.mode) {
      case 'playing': this.updatePlay(dt); this.updateCosmetic(dt); break;
      case 'clear': this.updateClear(dt); this.updateCosmetic(dt); break;
      case 'over': this.updateOver(dt); this.updateCosmetic(dt); break;
      case 'ambient': this.updateAmbient(dt); this.updateCosmetic(dt); break;
      case 'intermission':
      case 'dead': this.updateCosmetic(dt); break;
      case 'paused': break;
    }
  }

  private emitHud() {
    const mult = 1 + Math.min(8, Math.floor(this.stats.combo / 5));
    this.emit({
      type: 'hud',
      hud: {
        playerHp: Math.max(0, Math.ceil(this.player.hp)), playerMax: this.player.maxHp,
        baseHp: Math.max(0, Math.ceil(this.base.hp)), baseMax: this.base.maxHp,
        lairHp: Math.max(0, this.lair.hp), lairMax: this.lair.maxHp, lairAlive: this.lair.alive,
        coins: this.stats.coins, score: this.stats.score, kills: this.stats.kills,
        combo: this.stats.combo, comboMult: mult, comboT: Math.max(0, this.stats.comboT / 2.4),
        level: this.level + 1, levelName: this.cfg.name, turrets: this.upgrades.turret,
        weapon: {
          id: this.weapon, name: WEAPONS[this.weapon].name,
          icon: WEAPONS[this.weapon].icon, slot: WEAPON_ORDER.indexOf(this.weapon) + 1,
        },
        owned: WEAPON_ORDER.filter((id) => this.owned[id]).map((id) => ({
          id, name: WEAPONS[id].name, icon: WEAPONS[id].icon,
          slot: WEAPON_ORDER.indexOf(id) + 1,
        })),
        ammo: this.player.ammo[this.weapon], mag: WEAPONS[this.weapon].mag,
        reload: this.player.reloadT > 0 ? 1 - this.player.reloadT / this.player.reloadTotal : 0,
        charge: this.player.charge, spin: this.player.spin,
        tesla: this.upgrades.tesla, teslaCharge: this.base.teslaCharge, medbay: this.upgrades.medbay > 0,
      },
    });
  }

  /* ============================================================
     RENDER
     ============================================================ */
  private render() {
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#04070a';
    ctx.fillRect(0, 0, this.cssW, this.cssH);

    ctx.setTransform(
      this.dpr * this.viewScale, 0, 0, this.dpr * this.viewScale,
      this.dpr * this.ox, this.dpr * this.oy,
    );
    const sx = this.shake > 0 ? rand(-1, 1) * this.shake : 0;
    const sy = this.shake > 0 ? rand(-1, 1) * this.shake : 0;
    ctx.save();
    ctx.translate(sx, sy);

    if (this.ground) ctx.drawImage(this.ground, 0, 0);

    this.drawCorpses();
    this.drawCasings();
    this.drawLair();
    this.drawBase();
    this.drawCoins();
    this.drawActors();
    this.drawTrails();
    this.drawArcs();
    this.drawBullets();
    this.drawParticles();
    this.drawRings();
    this.drawTexts();

    ctx.restore();

    // screen-space overlays
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.flashA > 0) {
      ctx.fillStyle = `rgba(${this.flashColor},${this.flashA * 0.5})`;
      ctx.fillRect(0, 0, this.cssW, this.cssH);
    }
    const baseRatio = this.base.hp / this.base.maxHp;
    const playerRatio = this.player.hp / this.player.maxHp;
    let danger = 0;
    if (this.mode === 'playing' || this.mode === 'clear') {
      if (baseRatio < 0.3) danger = Math.max(danger, (0.3 - baseRatio) * 1.6);
      if (playerRatio < 0.3) danger = Math.max(danger, (0.3 - playerRatio) * 1.3);
    }
    if (danger > 0) {
      const pulse = 0.55 + 0.45 * Math.sin(this.time * 9);
      const a = Math.min(0.5, danger * pulse);
      const grd = ctx.createRadialGradient(this.cssW / 2, this.cssH / 2, this.cssH * 0.3, this.cssW / 2, this.cssH / 2, this.cssH * 0.75);
      grd.addColorStop(0, 'rgba(255,30,30,0)');
      grd.addColorStop(1, `rgba(255,30,30,${a})`);
      ctx.fillStyle = grd; ctx.fillRect(0, 0, this.cssW, this.cssH);
    }
  }

  private rr(x: number, y: number, w: number, h: number, r: number) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  private drawLair() {
    const c = this.ctx, L = this.lair, t = this.time;
    const r = L.r;
    const hot = L.telegraph > 0;
    const pulse0 = 0.5 + 0.5 * Math.sin(t * 2.4);

    // light spilling onto the floor, under everything
    if (L.alive) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      const gl = c.createRadialGradient(L.x, L.y + r * 0.4, 4, L.x, L.y + r * 0.4, r * 2.2);
      gl.addColorStop(0, hot ? `rgba(255,120,60,${0.22 + pulse0 * 0.08})` : `rgba(90,255,90,${0.18 + pulse0 * 0.08})`);
      gl.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gl;
      c.beginPath(); c.ellipse(L.x, L.y + r * 0.4, r * 2.2, r * 1.4, 0, 0, TAU); c.fill();
      c.restore();
    }

    // root network (baked) — breathes slowly, withers after the kill
    if (this.lairArt) {
      const breathe = 1 + Math.sin(t * 1.1) * 0.012;
      c.save();
      c.translate(L.x, L.y);
      if (!L.alive) c.globalAlpha = Math.max(0.25, 1 - L.deadT * 0.35);
      c.scale(breathe, 1 + (breathe - 1) * 0.6);
      c.drawImage(this.lairArt, -this.lairArtCx, -this.lairArtCy);
      c.restore();
    }

    c.save();
    c.translate(L.x, L.y);
    if (!L.alive) {
      // shattered orb: crater + green shards
      const sink = Math.min(1, L.deadT * 1.4);
      c.fillStyle = '#0a0d08';
      c.beginPath(); c.ellipse(0, 6, r * 0.9, r * 0.5, 0, 0, TAU); c.fill();
      c.fillStyle = 'rgba(40,90,30,.45)';
      c.beginPath(); c.ellipse(0, 4, r * 0.6, r * 0.3, 0, 0, TAU); c.fill();
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU + 0.4, d = r * (0.3 + (i % 3) * 0.2) * (0.6 + sink * 0.4);
        c.save(); c.translate(Math.cos(a) * d, Math.sin(a) * d * 0.55); c.rotate(a * 1.7);
        c.fillStyle = 'rgba(120,230,110,.75)';
        c.beginPath(); c.moveTo(-5, 3); c.lineTo(0, -7); c.lineTo(5, 3); c.closePath(); c.fill();
        c.restore();
      }
      c.restore();
      return;
    }

    const R = r * 0.78;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
    // squash when it spits something out
    c.scale(1 + L.burp * 0.07, 1 - L.burp * 0.09);

    // socket shadow
    c.fillStyle = 'rgba(0,0,0,.5)';
    c.beginPath(); c.ellipse(0, R * 0.9, R * 1.05, R * 0.32, 0, 0, TAU); c.fill();

    // sphere body
    const body = c.createRadialGradient(-R * 0.32, -R * 0.35, R * 0.05, 0, 0, R);
    if (hot) {
      body.addColorStop(0, '#ffe0a8'); body.addColorStop(0.3, '#ff9a40');
      body.addColorStop(0.72, '#a83a18'); body.addColorStop(1, '#3a1208');
    } else {
      body.addColorStop(0, '#c8ffb8'); body.addColorStop(0.28, '#5ce85a');
      body.addColorStop(0.72, '#1c8f30'); body.addColorStop(1, '#0a3a16');
    }
    c.fillStyle = body;
    c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();

    // inside: drifting spores + the beating core
    c.save();
    c.beginPath(); c.arc(0, 0, R * 0.97, 0, TAU); c.clip();
    for (let i = 0; i < 7; i++) {
      const ph = (t * 0.25 + i * 0.37) % 1;
      const bx = Math.sin(i * 2.1 + t * 0.6) * R * 0.5;
      const by = R * 0.8 - ph * R * 1.6;
      const br = 2 + (i % 3) * 1.6;
      c.fillStyle = `rgba(220,255,210,${0.12 + 0.25 * (1 - ph)})`;
      c.beginPath(); c.arc(bx, by, br, 0, TAU); c.fill();
    }
    c.globalCompositeOperation = 'lighter';
    const coreR = R * (0.34 + pulse * 0.1) * (hot ? 1.3 : 1);
    const core = c.createRadialGradient(0, R * 0.05, 1, 0, R * 0.05, coreR);
    core.addColorStop(0, hot ? 'rgba(255,240,200,.95)' : 'rgba(240,255,210,.95)');
    core.addColorStop(0.5, hot ? 'rgba(255,140,60,.55)' : 'rgba(157,255,79,.55)');
    core.addColorStop(1, 'rgba(120,255,80,0)');
    c.fillStyle = core;
    c.beginPath(); c.arc(0, R * 0.05, coreR, 0, TAU); c.fill();
    // veins radiating from the core
    c.strokeStyle = hot ? 'rgba(255,200,120,.35)' : 'rgba(200,255,170,.28)';
    c.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05 + Math.sin(t * 0.7 + i) * 0.1;
      c.beginPath(); c.moveTo(Math.cos(a) * coreR * 0.5, R * 0.05 + Math.sin(a) * coreR * 0.5);
      c.quadraticCurveTo(Math.cos(a + 0.3) * R * 0.6, Math.sin(a + 0.3) * R * 0.6, Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95);
      c.stroke();
    }
    c.restore();

    // rush telegraph flicker + hit flash
    if (hot) {
      const fl = 0.5 + 0.5 * Math.sin(t * 26);
      c.fillStyle = `rgba(255,80,40,${0.12 + fl * 0.22 * L.telegraph})`;
      c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
    }
    if (L.hitFlash > 0) {
      c.fillStyle = `rgba(230,255,220,${L.hitFlash * 0.7})`;
      c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
    }

    // glass: rim, specular, fresnel
    c.lineWidth = 3;
    c.strokeStyle = hot ? 'rgba(120,40,10,.9)' : 'rgba(10,60,20,.9)';
    c.beginPath(); c.arc(0, 0, R - 1, 0, TAU); c.stroke();
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.strokeStyle = hot ? 'rgba(255,180,100,.35)' : 'rgba(160,255,140,.35)';
    c.lineWidth = 2;
    c.beginPath(); c.arc(0, 0, R - 4, Math.PI * 0.9, Math.PI * 1.75); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.34)';
    c.beginPath(); c.ellipse(-R * 0.38, -R * 0.42, R * 0.26, R * 0.15, -0.7, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,.18)';
    c.beginPath(); c.ellipse(-R * 0.15, -R * 0.62, R * 0.08, R * 0.05, -0.7, 0, TAU); c.fill();
    c.restore();
    c.restore();

    // small world hp bar
    if (L.alive && L.hp < L.maxHp) {
      const w = 110;
      c.fillStyle = 'rgba(0,0,0,.6)';
      this.rr(L.x - w / 2 - 2, L.y - L.r - 22, w + 4, 9, 4); c.fill();
      c.fillStyle = '#3a5a22';
      this.rr(L.x - w / 2, L.y - L.r - 20, w * (L.hp / L.maxHp), 5, 2.5); c.fill();
    }
  }

  private drawBase() {
    const c = this.ctx, b = this.base, t = this.time;
    c.save();
    c.translate(b.x, b.y);
    // shadow
    c.fillStyle = 'rgba(0,0,0,.45)';
    c.beginPath(); c.ellipse(0, 20, 62, 20, 0, 0, TAU); c.fill();

    // sandbag arc facing the hive
    for (let row = 0; row < 3; row++) {
      const rad = 46 + row * 9, count = 10 + row;
      for (let i = 0; i < count; i++) {
        const a = Math.PI * 1.08 + (Math.PI * 0.84) * ((i + (row % 2 ? 0.5 : 0)) / count);
        const x = Math.cos(a) * rad, y = Math.sin(a) * rad * 0.9;
        c.save();
        c.translate(x, y); c.rotate(a);
        c.fillStyle = 'rgba(0,0,0,.35)';
        c.beginPath(); c.ellipse(1, 2, 8, 6, 0, 0, TAU); c.fill();
        c.fillStyle = row === 1 ? '#4f5a2c' : '#5d6b3a';
        c.beginPath(); c.ellipse(0, 0, 8, 6, 0, 0, TAU); c.fill();
        c.fillStyle = 'rgba(160,180,110,.35)';
        c.beginPath(); c.ellipse(-1.5, -1.8, 5, 2.4, 0, 0, TAU); c.fill();
        c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = 1; c.beginPath(); c.ellipse(0, 0, 8, 6, 0, 0, TAU); c.stroke();
        // stitching seam
        c.strokeStyle = 'rgba(0,0,0,.3)'; c.setLineDash([1.5, 1.5]);
        c.beginPath(); c.moveTo(-6, 0); c.lineTo(6, 0); c.stroke();
        c.setLineDash([]);
        c.restore();
      }
    }

    // build pulse: whole structure pops when something new is bolted on
    const build = b.buildT > 0 ? 1 + Math.sin((1 - b.buildT / 0.6) * Math.PI) * 0.05 : 1;
    c.scale(build, build);

    // ---- bunker body ----
    const flash = b.flash;
    const ratio = b.hp / b.maxHp;
    const plating = this.upgrades.walls;
    const W = 78 + plating * 3, H = 58 + plating * 2;
    // concrete base slab
    c.fillStyle = '#2c3438';
    this.rr(-W / 2 - 6, -H / 2 - 2, W + 12, H + 10, 8); c.fill();
    c.fillStyle = 'rgba(0,0,0,.35)';
    this.rr(-W / 2 - 6, H / 2 + 2, W + 12, 6, 3); c.fill();
    // hull
    const hull = c.createLinearGradient(0, -H / 2, 0, H / 2);
    hull.addColorStop(0, flash > 0 ? '#9aa8b0' : '#5e6e78');
    hull.addColorStop(1, flash > 0 ? '#6a7880' : '#3e4b54');
    c.fillStyle = hull;
    this.rr(-W / 2, -H / 2, W, H, 10); c.fill();
    c.strokeStyle = '#1f272c'; c.lineWidth = 3; c.stroke();
    // panel seams
    c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 1.5;
    for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(i * 25, -H / 2 + 4); c.lineTo(i * 25, H / 2 - 4); c.stroke(); }
    c.beginPath(); c.moveTo(-W / 2 + 3, 2); c.lineTo(W / 2 - 3, 2); c.stroke();
    // bolted armor plates (one per plating level)
    for (let i = 0; i < plating; i++) {
      const px = -W / 2 + 8 + (i % 3) * 24, py = i < 3 ? -H / 2 + 14 : H / 2 - 24;
      c.fillStyle = '#6f7f88'; this.rr(px, py, 20, 12, 2); c.fill();
      c.strokeStyle = '#26303a'; c.lineWidth = 1.5; c.stroke();
      c.fillStyle = '#c8d2d8';
      for (const [rx, ry] of [[px + 3, py + 3], [px + 17, py + 3], [px + 3, py + 9], [px + 17, py + 9]]) {
        c.beginPath(); c.arc(rx, ry, 1.3, 0, TAU); c.fill();
      }
    }
    // hazard stripes on the front lip
    c.save();
    c.beginPath(); this.rr(-W / 2, -H / 2, W, 8, 6); c.clip();
    for (let i = -5; i < 9; i++) {
      c.fillStyle = i % 2 ? '#d9b341' : '#262a2e';
      c.save(); c.translate(i * 12, -H / 2); c.rotate(-0.5); c.fillRect(0, 0, 7, 30); c.restore();
    }
    c.restore();
    // blast door with warning lamps
    c.fillStyle = '#161d22';
    this.rr(-11, -H / 2 - 2, 22, 20, 4); c.fill();
    c.strokeStyle = '#3b4a54'; c.lineWidth = 2; c.stroke();
    c.fillStyle = '#2b353c'; c.fillRect(-8, -H / 2 + 6, 16, 2); c.fillRect(-8, -H / 2 + 11, 16, 2);
    const lampOn = b.alarm > 0 ? Math.sin(t * 22) > 0 : Math.sin(t * 4) > 0;
    c.fillStyle = lampOn ? '#ffb13d' : '#5a3a10';
    c.fillRect(-16, -H / 2 + 2, 4, 4); c.fillRect(12, -H / 2 + 2, 4, 4);
    // viewports glow
    const vg = 0.55 + 0.2 * Math.sin(t * 2);
    c.fillStyle = `rgba(86,227,255,${vg})`;
    c.fillRect(-30, 10, 12, 8); c.fillRect(18, 10, 12, 8);
    c.save(); c.globalCompositeOperation = 'lighter';
    c.fillStyle = `rgba(86,227,255,${vg * 0.25})`;
    c.fillRect(-32, 8, 16, 12); c.fillRect(16, 8, 16, 12);
    c.restore();
    // vent with exhaust
    c.fillStyle = '#1b2227'; this.rr(-6, 8, 12, 14, 2); c.fill();
    c.strokeStyle = '#3b4a54'; c.lineWidth = 1;
    for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-4, 11 + i * 3); c.lineTo(4, 11 + i * 3); c.stroke(); }
    // rooftop: antenna + beacon
    c.strokeStyle = '#3b4a54'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(30, -H / 2 + 2); c.lineTo(30, -H / 2 - 22); c.stroke();
    c.beginPath(); c.moveTo(26, -H / 2 - 14); c.lineTo(34, -H / 2 - 14); c.stroke();
    const beacon = b.alarm > 0 ? Math.sin(t * 22) > 0 : Math.sin(t * 4) > 0;
    c.fillStyle = beacon ? '#ff5555' : '#662222';
    c.beginPath(); c.arc(30, -H / 2 - 24, 3, 0, TAU); c.fill();
    if (beacon) {
      c.save(); c.globalCompositeOperation = 'lighter';
      c.fillStyle = 'rgba(255,60,60,.25)'; c.beginPath(); c.arc(30, -H / 2 - 24, 9, 0, TAU); c.fill();
      c.restore();
    }
    // alarm: rotating red wash
    if (b.alarm > 0) {
      c.save(); c.globalCompositeOperation = 'lighter';
      const a = (t * 6) % TAU;
      const g = c.createConicGradient ? c.createConicGradient(a, 0, -H / 2 - 24) : null;
      if (g) {
        g.addColorStop(0, 'rgba(255,40,40,.35)'); g.addColorStop(0.12, 'rgba(255,40,40,0)');
        g.addColorStop(0.5, 'rgba(255,40,40,0)'); g.addColorStop(0.5, 'rgba(255,40,40,.35)'); g.addColorStop(0.62, 'rgba(255,40,40,0)');
        c.fillStyle = g; c.beginPath(); c.arc(0, -H / 2 - 24, 90, 0, TAU); c.fill();
      }
      c.restore();
    }

    // ---- tesla emitter on the roof ----
    if (this.upgrades.tesla > 0) this.drawTesla(0, -H / 2 - 4);

    // ---- med station on the left flank ----
    if (this.upgrades.medbay > 0) this.drawMedStation(-W / 2 - 24, 6);

    // battle damage
    if (ratio < 0.66) {
      c.strokeStyle = 'rgba(10,12,14,.75)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(-20, -10); c.lineTo(-12, 2); c.lineTo(-18, 14); c.stroke();
    }
    if (ratio < 0.33) {
      c.strokeStyle = 'rgba(10,12,14,.85)'; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(14, -18); c.lineTo(22, -4); c.lineTo(16, 12); c.lineTo(24, 24); c.stroke();
      c.fillStyle = 'rgba(0,0,0,.4)';
      c.beginPath(); c.ellipse(-30, 16, 10, 6, .4, 0, TAU); c.fill();
      // exposed sparking wiring
      if (Math.random() < 0.08) this.burstSpark(b.x + 20, b.y - 4, 3, '255,220,120', true);
    }
    if (flash > 0) {
      c.fillStyle = `rgba(255,220,180,${flash * 0.5})`;
      this.rr(-W / 2, -H / 2, W, H, 10); c.fill();
    }
    c.restore();

    // ---- razor barricade line ----
    if (this.upgrades.barricade > 0) this.drawBarricade();

    // ---- sentry towers ----
    for (const t2 of this.turrets) this.drawTurret(t2);

    // integrity bar
    const bw = 86;
    c.fillStyle = 'rgba(0,0,0,.6)';
    this.rr(b.x - bw / 2 - 2, b.y - 72 - plating, bw + 4, 10, 5); c.fill();
    const col = ratio > 0.5 ? '#56e39a' : ratio > 0.25 ? '#ffb13d' : '#ff4d4d';
    c.fillStyle = col;
    this.rr(b.x - bw / 2, b.y - 70 - plating, bw * clamp(ratio, 0, 1), 6, 3); c.fill();
  }

  private drawTesla(x: number, y: number) {
    const c = this.ctx, b = this.base, t = this.time;
    const lvl = this.upgrades.tesla;
    const ch = b.teslaCharge;
    c.save();
    c.translate(x, y);
    // mast + coil rings
    c.fillStyle = '#2a3238'; this.rr(-4, -26, 8, 26, 2); c.fill();
    c.strokeStyle = '#20282d'; c.lineWidth = 1; c.stroke();
    for (let i = 0; i < 3 + lvl; i++) {
      const ry = -8 - i * 5;
      c.fillStyle = i % 2 ? '#8a5a2a' : '#c9852f';
      this.rr(-7, ry - 2, 14, 3.5, 1.5); c.fill();
    }
    // top sphere
    const top = -30 - lvl * 5;
    const glow = 0.35 + ch * 0.65;
    c.fillStyle = '#c8d8e0'; c.beginPath(); c.arc(0, top, 6, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,.5)'; c.beginPath(); c.arc(-2, top - 2, 2, 0, TAU); c.fill();
    c.save(); c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(0, top, 1, 0, top, 16 + ch * 10);
    g.addColorStop(0, `rgba(160,220,255,${glow})`); g.addColorStop(1, 'rgba(160,220,255,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, top, 16 + ch * 10, 0, TAU); c.fill();
    // crawling mini arcs as it charges
    if (ch > 0.5) {
      c.strokeStyle = `rgba(190,235,255,${(ch - 0.5) * 1.6})`; c.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) {
        const a = t * 9 + i * 2.1;
        c.beginPath(); c.moveTo(0, top);
        c.lineTo(Math.cos(a) * 8, top + Math.sin(a) * 8);
        c.lineTo(Math.cos(a + 0.5) * 12, top + Math.sin(a + 0.5) * 12);
        c.stroke();
      }
    }
    c.restore();
    c.restore();
  }

  private drawMedStation(x: number, y: number) {
    const c = this.ctx, t = this.time;
    const pulse = 0.5 + 0.5 * Math.sin(t * 3);
    c.save();
    c.translate(x, y);
    c.fillStyle = 'rgba(0,0,0,.4)'; c.beginPath(); c.ellipse(0, 12, 16, 6, 0, 0, TAU); c.fill();
    c.fillStyle = '#e8ecef'; this.rr(-12, -10, 24, 20, 3); c.fill();
    c.strokeStyle = '#2c3438'; c.lineWidth = 1.5; c.stroke();
    c.fillStyle = '#e03c3c';
    c.fillRect(-2.5, -7, 5, 14); c.fillRect(-7, -2.5, 14, 5);
    // heal field ring on the floor
    c.save(); c.globalCompositeOperation = 'lighter';
    c.strokeStyle = `rgba(120,255,160,${0.12 + pulse * 0.15 + Math.min(0.3, this.base.medPulse * 0.1)})`;
    c.lineWidth = 2; c.setLineDash([6, 8]); c.lineDashOffset = -t * 20;
    c.beginPath(); c.ellipse(24, 4, 150 * 0.98, 150 * 0.62, 0, 0, TAU); c.stroke();
    c.restore();
    c.restore();
    this.base.medPulse = Math.max(0, this.base.medPulse - 0.02);
  }

  private drawBarricade() {
    const c = this.ctx, b = this.base;
    const lvl = this.upgrades.barricade;
    const y = this.barricadeY();
    const half = 70 + lvl * 24;
    c.save();
    // posts
    for (let x = -half; x <= half; x += 34) {
      c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(b.x + x - 2, y + 2, 5, 4);
      c.fillStyle = '#4a4238'; c.fillRect(b.x + x - 2, y - 12, 4, 16);
      c.fillStyle = '#7a6a54'; c.fillRect(b.x + x - 2, y - 12, 1.5, 16);
    }
    // wire coils
    c.strokeStyle = '#8c959b'; c.lineWidth = 1.3;
    for (let row = 0; row < lvl + 1; row++) {
      const ry = y - 3 - row * 4;
      c.beginPath();
      for (let x = -half; x <= half; x += 3) {
        const yy = ry + Math.sin(x * 0.9 + row) * 2.6;
        if (x === -half) c.moveTo(b.x + x, yy); else c.lineTo(b.x + x, yy);
      }
      c.stroke();
    }
    // barbs
    c.fillStyle = '#c8d0d4';
    for (let x = -half + 4; x <= half; x += 9) c.fillRect(b.x + x, y - 8 - (x % 2) * 3, 1.5, 3);
    c.restore();
  }

  private drawTurret(t: Turret) {
    const c = this.ctx;
    const rise = 1 - Math.pow(1 - t.build, 3);
    const headY = -22;
    c.save();
    c.translate(t.x, t.y);
    // shadow
    c.fillStyle = 'rgba(0,0,0,.45)'; c.beginPath(); c.ellipse(0, 6, 15, 6, 0, 0, TAU); c.fill();
    c.save();
    c.translate(0, (1 - rise) * 30);
    if (rise < 1) { c.beginPath(); c.rect(-30, -60 - (1 - rise) * 30, 60, 66 + (1 - rise) * 30); c.clip(); }
    // sandbag ring around the base
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      c.fillStyle = i % 2 ? '#4f5a2c' : '#5d6b3a';
      c.beginPath(); c.ellipse(Math.cos(a) * 13, 2 + Math.sin(a) * 6, 6, 4, a, 0, TAU); c.fill();
    }
    // tower: legs + platform
    c.strokeStyle = '#3a444b'; c.lineWidth = 3; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-9, 2); c.lineTo(-6, headY + 6); c.moveTo(9, 2); c.lineTo(6, headY + 6); c.stroke();
    c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(-8, -6); c.lineTo(8, -12); c.moveTo(8, -6); c.lineTo(-8, -12); c.stroke();
    c.fillStyle = '#4a565e'; this.rr(-12, headY + 3, 24, 5, 2); c.fill();
    c.strokeStyle = '#20282d'; c.lineWidth = 1; c.stroke();
    // head housing
    c.fillStyle = '#39464e';
    c.beginPath(); c.arc(0, headY, 9, 0, TAU); c.fill();
    c.strokeStyle = '#20282d'; c.lineWidth = 2; c.stroke();
    // twin barrels, recoiling
    c.save();
    c.translate(0, headY); c.rotate(t.ang);
    c.translate(-t.recoil * 3, 0);
    c.fillStyle = '#2a3630'; this.rr(-4, -5, 12, 10, 2); c.fill();
    c.fillStyle = t.heat > 0.5 ? '#c86a4a' : '#8fe7d3';
    this.rr(4, -4.2, 16, 3, 1.2); c.fill(); this.rr(4, 1.2, 16, 3, 1.2); c.fill();
    if (t.heat > 0.3) {
      c.save(); c.globalCompositeOperation = 'lighter';
      c.fillStyle = `rgba(255,120,60,${(t.heat - 0.3) * 0.6})`; c.fillRect(10, -5, 10, 10);
      c.restore();
    }
    c.restore();
    // sensor eye tracks the target
    c.fillStyle = '#56e3ff';
    c.beginPath(); c.arc(Math.cos(t.ang) * 4, headY + Math.sin(t.ang) * 4, 2.6, 0, TAU); c.fill();
    c.save(); c.globalCompositeOperation = 'lighter';
    c.fillStyle = 'rgba(86,227,255,.35)'; c.beginPath(); c.arc(Math.cos(t.ang) * 4, headY + Math.sin(t.ang) * 4, 6, 0, TAU); c.fill();
    c.restore();
    c.restore();
    c.restore();
  }

  private drawArcs() {
    if (!this.arcs.length) return;
    const c = this.ctx;
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const a of this.arcs) {
      const k = a.life / a.max;
      c.globalAlpha = k;
      c.strokeStyle = 'rgba(120,190,255,.55)'; c.lineWidth = a.w * 3;
      c.beginPath(); a.pts.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.stroke();
      c.strokeStyle = '#eaf6ff'; c.lineWidth = a.w * 0.9;
      c.stroke();
    }
    c.restore();
    c.globalAlpha = 1;
  }

  /* ---------------- actors: hero + horde, depth sorted ---------------- */

  private drawActors() {
    const n = this.zombies.length;
    const order = new Array<number>(n);
    for (let i = 0; i < n; i++) order[i] = i;
    order.sort((a, b) => this.zombies[a].y - this.zombies[b].y);
    const py = this.player.y;
    let heroDrawn = false;
    for (let k = 0; k < n; k++) {
      const z = this.zombies[order[k]];
      if (!heroDrawn && z.y > py) { this.drawPlayer(); heroDrawn = true; }
      this.drawZombie(z);
    }
    if (!heroDrawn) this.drawPlayer();
  }

  private drawCasings() {
    const c = this.ctx;
    for (const k of this.casings) {
      const a = k.rest ? Math.min(1, k.life / 0.6) : 1;
      c.save();
      c.globalAlpha = a;
      c.translate(k.x, k.y);
      c.rotate(k.rot);
      if (k.kind === 'shell') {
        c.fillStyle = '#c8302a'; c.fillRect(-3.2, -1.4, 6.4, 2.8);
        c.fillStyle = '#d8b25a'; c.fillRect(-3.2, -1.4, 1.8, 2.8);
      } else {
        c.fillStyle = '#d9b358'; c.fillRect(-2.4, -0.9, 4.8, 1.8);
        c.fillStyle = '#fff1b0'; c.fillRect(-2.4, -0.9, 4.8, 0.6);
      }
      c.restore();
    }
    c.globalAlpha = 1;
  }

  private drawTrails() {
    if (!this.trails.length) return;
    const c = this.ctx;
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';
    for (const t of this.trails) {
      const a = t.life / t.max;
      c.globalAlpha = a * 0.9;
      c.strokeStyle = t.color;
      c.lineWidth = t.w * (0.4 + a * 0.6);
      c.beginPath(); c.moveTo(t.x1, t.y1); c.lineTo(t.x2, t.y2); c.stroke();
      if (t.w >= 4) {
        c.globalAlpha = a * 0.35;
        c.lineWidth = t.w * 3 * a;
        c.stroke();
      }
    }
    c.restore();
    c.globalAlpha = 1;
  }

  private drawCorpses() {
    const c = this.ctx;
    for (const k of this.corpses) {
      const fall = Math.min(1, k.t / 0.42);
      const ease = 1 - Math.pow(1 - fall, 3);
      const fade = k.t > 6.5 ? Math.max(0, 1 - (k.t - 6.5) / 2.5) : 1;
      const pool = Math.min(1, k.t / 1.6);
      // blood pool spreads under the body
      c.globalAlpha = fade * 0.55;
      c.fillStyle = '#4a0f16';
      c.beginPath();
      c.ellipse(k.x + k.dir * k.r * 0.8 * ease, k.y + k.r * 0.4, k.r * (0.6 + pool * 1.5), k.r * (0.25 + pool * 0.5), 0, 0, TAU);
      c.fill();
      if (!k.frame) { c.globalAlpha = 1; continue; }
      c.save();
      c.globalAlpha = fade;
      c.translate(k.x, k.y + k.r * 0.55);
      c.rotate(k.dir * ease * (Math.PI / 2 - 0.12));
      c.scale(k.flip ? -1 : 1, 1);
      c.drawImage(k.frame, -k.w / 2, -k.h, k.w, k.h);
      c.restore();
    }
    c.globalAlpha = 1;
  }

  private drawZombie(z: Zombie) {
    const c = this.ctx;
    const r = z.r;
    const ready = zombieSprites.ready;
    const fw = zombieSprites.fw || 64;
    const fh = zombieSprites.fh || 128;
    const drawH = r * Game.zScale(z.type);
    const drawW = drawH * (fw / fh);
    const facingLeft = Math.cos(z.face) < 0;
    const sheet = ready ? zombieSprites.frames[z.type][z.anim] : null;
    const frames = sheet && sheet.length ? sheet : null;
    const fi = frames ? Math.floor(z.animT) % frames.length : 0;

    // spawn: rise out of the hive with a squash-and-stretch pop
    const sp = z.spawnT;
    const rise = sp < 1 ? 1 - Math.pow(1 - sp, 3) : 1;
    const overshoot = sp < 1 ? 1 + Math.sin(sp * Math.PI) * 0.18 : 1;
    // attack lunge follows the wind-up → swipe curve
    let lunge = 0;
    if (z.attackT >= 0) {
      const t = z.attackT / ATTACK_DUR;
      lunge = t < 0.5 ? -0.12 * (t / 0.5) : 0.34 * Math.sin((t - 0.5) / 0.5 * Math.PI);
    } else if (z.anim === 'run') lunge = 0.06;
    // hit reaction: quick squash
    const hf = z.hitFlash;
    const sqX = 1 + hf * 1.2, sqY = 1 - hf * 0.9;

    // grounded shadow
    c.fillStyle = `rgba(0,0,0,${0.42 * rise})`;
    c.beginPath();
    c.ellipse(z.x, z.y + r * 0.5, r * 1.05 * rise, r * 0.36 * rise, 0, 0, TAU);
    c.fill();

    c.save();
    c.translate(z.x + (facingLeft ? -lunge : lunge) * r, z.y + r * 0.55);
    c.rotate(Math.sin(z.phase) * (z.anim === 'run' ? 0.08 : 0.03) + (z.flee ? -0.2 : 0));
    c.scale((facingLeft ? -1 : 1) * sqX * overshoot, sqY * (2 - overshoot));

    if (frames) {
      if (z.flee) c.globalAlpha = 0.85;
      if (sp < 1) {
        // emerge: clip at the ground line, then slide the body up out of the dirt
        c.beginPath(); c.rect(-drawW, -drawH - 6, drawW * 2, drawH + 6); c.clip();
        c.translate(0, drawH * (1 - rise));
      }
      c.drawImage(frames[fi], -drawW / 2, -drawH, drawW, drawH);
      if (hf > 0) {
        const fl = zombieSprites.flash[z.anim];
        if (fl && fl.length) {
          c.globalAlpha = Math.min(1, hf * 8);
          c.drawImage(fl[fi % fl.length], -drawW / 2, -drawH, drawW, drawH);
        }
      }
      // attack telegraph: red glint during wind-up
      if (z.attackT >= 0 && z.attackT < ATTACK_HIT) {
        c.globalAlpha = 0.35 * (z.attackT / ATTACK_HIT);
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = '#ff3b3b';
        c.beginPath(); c.arc(0, -drawH * 0.82, r * 0.5, 0, TAU); c.fill();
      }
    } else {
      c.fillStyle = z.type === 'brute' ? '#6b4170' : '#5f8f4c';
      c.beginPath(); c.ellipse(0, -r * 0.7, r * 0.7, r * 1.1, 0, 0, TAU); c.fill();
    }
    c.restore();

    if ((z.type === 'tank' || z.type === 'brute') && z.hp < z.maxHp) {
      const bw = r * 2.1;
      const by = z.y - drawH + r * 0.4;
      c.fillStyle = 'rgba(0,0,0,.55)';
      c.fillRect(z.x - bw / 2, by, bw, 4);
      c.fillStyle = z.type === 'brute' ? '#c065d8' : '#d8a23a';
      c.fillRect(z.x - bw / 2, by, bw * (z.hp / z.maxHp), 4);
    }
  }

  private drawPlayer() {
    const c = this.ctx, p = this.player, t = this.time;
    const g = this.heroGeom();
    const ready = heroSprites.ready;
    const dying = p.deadT >= 0;
    const fall = dying ? 1 - Math.pow(1 - Math.min(1, p.deadT / 0.5), 3) : 0;
    const legAnim: HeroAnim = ready && heroSprites.anims[p.anim].length ? p.anim : 'idle';
    const legFrames = ready ? heroSprites.anims[legAnim] : null;
    const idleFrames = ready ? heroSprites.anims.idle : null;
    const fw = heroSprites.fw || 60, fh = heroSprites.fh || 128;
    const legLen = legFrames ? legFrames.length : 1;
    const legFi = ((Math.floor(p.animT) % legLen) + legLen) % legLen;
    const idleLen = idleFrames ? idleFrames.length : 1;
    const torsoFi = Math.floor(t * 5) % idleLen;
    const moving = legAnim !== 'idle';
    const hurtA = dying ? 0.45 : Math.min(1, p.hurtFlash * 1.3);
    const blink = !dying && p.invul > 0 && Math.floor(t * 18) % 2 === 0;

    // shadow (shrinks as he goes down)
    c.fillStyle = `rgba(0,0,0,${0.4 - fall * 0.15})`;
    c.beginPath();
    c.ellipse(p.x + g.dir * fall * 6, p.y + p.r * 0.5, p.r * 1.1 * (1 + fall * 0.6), p.r * 0.42, 0, 0, TAU);
    c.fill();
    if (dying) {
      c.globalAlpha = Math.min(0.6, p.deadT * 0.4);
      c.fillStyle = '#4a0f16';
      c.beginPath();
      c.ellipse(p.x - g.dir * 8, p.y + p.r * 0.45, p.r * (0.8 + Math.min(1, p.deadT) * 1.4), p.r * 0.45, 0, 0, TAU);
      c.fill();
      c.globalAlpha = 1;
    }

    if (!legFrames || !legFrames.length || !idleFrames || !idleFrames.length) {
      // fallback body until the sheet is sliced
      c.save();
      c.translate(p.x, g.bottom);
      c.fillStyle = '#5a2a2a';
      this.rr(-8, -g.H * 0.95, 16, g.H * 0.95, 6); c.fill();
      c.fillStyle = '#f0c9a0';
      c.beginPath(); c.arc(0, -g.H * 0.85, 7, 0, TAU); c.fill();
      c.restore();
      if (!dying) this.drawGun(g.gx, g.gy, g.dir);
      return;
    }

    const drawLayer = (frame: HTMLCanvasElement, hurtFrame: HTMLCanvasElement | undefined, sy: number, sh: number, dy: number, dh: number) => {
      c.drawImage(frame, 0, sy, fw, sh, -g.W / 2, dy, g.W, dh);
      if (hurtA > 0 && hurtFrame) {
        c.globalAlpha = hurtA;
        c.drawImage(hurtFrame, 0, sy, fw, sh, -g.W / 2, dy, g.W, dh);
        c.globalAlpha = 1;
      }
    };

    if (dying || !moving) {
      // whole frame: falling over, or standing still (legs + torso share the pose)
      c.save();
      c.translate(p.x, g.bottom);
      if (dying) c.rotate(-g.dir * fall * (Math.PI / 2 - 0.1));
      if (blink) c.globalAlpha = 0.45;
      c.scale(g.dir, 1);
      const fi = dying ? legFi : torsoFi;
      const fr = dying ? legFrames[fi] : idleFrames[fi];
      const hf = (dying ? heroSprites.hurt[legAnim] : heroSprites.hurt.idle)[fi];
      drawLayer(fr, hf, 0, fh, -g.H + (dying ? 0 : g.bob), g.H);
      c.restore();
    } else {
      // split at the waist: legs follow travel, torso follows the aim
      const cutSrc = Math.round(fh * HERO_WAIST);
      const cutDst = g.H * HERO_WAIST;
      const legDir = p.legsLeft ? -1 : 1;
      const lean = Math.sign(p.vx) * (legAnim === 'run' ? 0.09 : 0.045);
      c.save();
      if (blink) c.globalAlpha = 0.45;
      // legs
      c.save();
      c.translate(p.x, g.bottom);
      c.scale(legDir, 1);
      drawLayer(legFrames[legFi], heroSprites.hurt[legAnim][legFi], cutSrc, fh - cutSrc, -g.H + cutDst, g.H - cutDst);
      c.restore();
      // torso (breathing idle pose, so the hand stays on the grip), leaning into the run
      c.save();
      c.translate(p.x, g.bottom - g.H + cutDst + g.bob);
      c.rotate(lean);
      c.scale(g.dir, 1);
      drawLayer(idleFrames[torsoFi], heroSprites.hurt.idle[torsoFi], 0, cutSrc + 2, -cutDst, cutDst + 2 * (g.H / fh));
      c.restore();
      c.restore();
    }

    if (!dying) {
      const meta = GUN_META[this.weapon];
      const fore = this.gunPoint(meta.fore[0], meta.fore[1]);
      // recoil pulls the support hand back with the weapon
      const kick = p.recoil * 3;
      let fx = fore.x - Math.cos(g.aim) * kick, fy = fore.y - Math.sin(g.aim) * kick;
      // reload: the off hand leaves the foregrip, drops to the mag well and slaps it home
      if (p.reloadT > 0) {
        const k = 1 - p.reloadT / p.reloadTotal;
        const dip = Math.sin(Math.min(1, k * 1.15) * Math.PI);
        const mag = this.gunPoint(meta.grip[0] + 0.12, 1.0);
        fx = fx + (mag.x - fx) * dip; fy = fy + (mag.y + 9 * dip - fy) * dip;
      }
      this.drawOffArm(g.sx, g.sy, fx, fy, g.dir);
      this.drawGun(g.gx, g.gy, g.dir);
      this.drawGloves(g.gx, g.gy, fx, fy);
      // charge / spin readouts hover over the muzzle
      if (p.charge > 0 || (this.weapon === 'minigun' && p.spin > 0 && p.spin < 1)) {
        const m = this.muzzle();
        c.save();
        c.globalCompositeOperation = 'lighter';
        const v = p.charge > 0 ? p.charge : p.spin;
        c.strokeStyle = p.charge > 0 ? `rgba(201,166,255,${0.4 + v * 0.6})` : `rgba(255,200,120,${0.3 + v * 0.5})`;
        c.lineWidth = 2.2;
        c.beginPath(); c.arc(m.x, m.y, 9 + (1 - v) * 10, -Math.PI / 2, -Math.PI / 2 + v * TAU); c.stroke();
        c.restore();
      }
    }
  }

  /** the far arm crossing the chest to support the weapon (drawn behind the gun) */
  private drawOffArm(sx: number, sy: number, fx: number, fy: number, dir: number) {
    const c = this.ctx;
    const mx = (sx + fx) / 2, my = (sy + fy) / 2;
    // elbow sags down and slightly back
    const ex = mx - dir * 3, ey = my + 7;
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = '#120a0d'; c.lineWidth = 7.5;
    c.beginPath(); c.moveTo(sx, sy); c.quadraticCurveTo(ex, ey, fx, fy); c.stroke();
    c.strokeStyle = '#3a2028'; c.lineWidth = 5.2;
    c.stroke();
    // rim light along the top of the sleeve
    c.strokeStyle = 'rgba(190,80,80,.35)'; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(sx, sy - 1.5); c.quadraticCurveTo(ex, ey - 1.5, fx, fy - 1.5); c.stroke();
    // bandaged forearm
    const bt = 0.72;
    const bx = (1 - bt) * (1 - bt) * sx + 2 * (1 - bt) * bt * ex + bt * bt * fx;
    const by = (1 - bt) * (1 - bt) * sy + 2 * (1 - bt) * bt * ey + bt * bt * fy;
    c.strokeStyle = '#d8d0c0'; c.lineWidth = 5.2; c.lineCap = 'butt';
    const ang = Math.atan2(fy - by, fx - bx);
    c.beginPath(); c.moveTo(bx - Math.cos(ang) * 2.5, by - Math.sin(ang) * 2.5); c.lineTo(bx + Math.cos(ang) * 2.5, by + Math.sin(ang) * 2.5); c.stroke();
    c.restore();
  }

  /** gloved hands wrapped over the grip and foregrip (drawn in front of the gun) */
  private drawGloves(gx: number, gy: number, fx: number, fy: number) {
    const c = this.ctx;
    const glove = (x: number, y: number, r: number) => {
      c.fillStyle = '#0d0c10';
      c.beginPath(); c.arc(x, y, r + 1, 0, TAU); c.fill();
      c.fillStyle = '#1e1c22';
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,255,255,.12)';
      c.beginPath(); c.arc(x - r * 0.3, y - r * 0.35, r * 0.45, 0, TAU); c.fill();
      // knuckle line
      c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(x - r * 0.6, y + r * 0.15); c.lineTo(x + r * 0.6, y + r * 0.15); c.stroke();
    };
    glove(fx, fy, 3.6);
    glove(gx, gy, 3.4);
  }

  /** weapon held at the grip, always right-side-up; sprite when loaded, vector fallback otherwise */
  private drawGun(gx: number, gy: number, dir: number) {
    const c = this.ctx, p = this.player;
    const w = WEAPONS[this.weapon];
    const box = this.gunBox();
    const len = box.spr ? box.L - box.ax : BARREL[this.weapon];
    const swap = p.swapT > 0 ? 1 + Math.sin((1 - p.swapT / 0.32) * Math.PI) * 0.22 : 1;
    const g = this.heroGeom();
    c.save();
    c.translate(gx, gy);
    c.rotate(g.aim);
    if (dir < 0) c.scale(1, -1);
    c.scale(swap, swap);
    c.translate(-p.recoil * 3, 0);
    // minigun barrels shake while spinning up
    if (this.weapon === 'minigun' && p.spin > 0) c.translate(0, Math.sin(this.time * 90) * p.spin * 0.8);

    if (box.spr) {
      c.drawImage(box.spr, -box.ax, -box.ay, box.L, box.H);
      const mx = box.L - box.ax, my = box.meta.muzzle[1] * box.H - box.ay;
      // spin-up blur streak on the minigun barrels
      if (this.weapon === 'minigun' && p.spin > 0.15) {
        c.save(); c.globalCompositeOperation = 'lighter';
        c.globalAlpha = p.spin * 0.35;
        c.fillStyle = '#ffe9c0';
        c.fillRect(mx - box.L * 0.5, my - 4, box.L * 0.5, 8);
        c.restore();
      }
      // railgun charge: coils light up in sequence
      if (this.weapon === 'railgun' && p.charge > 0) {
        c.save(); c.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 4; i++) {
          const lit = clamp(p.charge * 4 - i, 0, 1);
          c.fillStyle = `rgba(201,166,255,${lit * 0.85})`;
          c.beginPath(); c.arc(-box.ax + box.L * (0.42 + i * 0.13), my - 1, 2.5 + lit * 1.5, 0, TAU); c.fill();
        }
        c.restore();
      }
      // hot barrel glow after sustained fire
      if (p.heat > 0.3) {
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = (p.heat - 0.3) * 0.9;
        const gr = c.createLinearGradient(mx - box.L * 0.45, 0, mx, 0);
        gr.addColorStop(0, 'rgba(255,90,20,0)'); gr.addColorStop(1, 'rgba(255,140,40,.9)');
        c.fillStyle = gr;
        c.fillRect(mx - box.L * 0.45, my - 2.5, box.L * 0.45, 5);
        c.restore();
      }
      if (w.id === 'railgun') {
        const charge = Math.max(0, 1 - p.fireT / w.interval);
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = `rgba(201,166,255,${0.15 + charge * 0.55})`;
        for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(-box.ax + box.L * (0.45 + i * 0.12), my - 1, 2 + charge * 1.6, 0, TAU); c.fill(); }
        c.restore();
      }
      this.drawMuzzleFlash(len, box.meta.muzzle[1] * box.H - box.ay, w.id);
      c.restore();
      return;
    }

    const metal = '#2b3138', hi = '#4b555e', wood = '#6b4a2b';
    switch (w.id) {
      case 'sidearm':
        c.fillStyle = metal; this.rr(-2, -3, 14, 6, 2); c.fill();
        c.fillStyle = hi; this.rr(8, -2, 9, 4, 2); c.fill();
        c.fillStyle = metal; this.rr(-1, 2, 5, 7, 1.5); c.fill();
        break;
      case 'smg':
        c.fillStyle = metal; this.rr(-4, -4, 20, 8, 2); c.fill();
        c.fillStyle = hi; this.rr(14, -2, 9, 4, 2); c.fill();
        c.fillStyle = metal; this.rr(4, 3, 5, 9, 1.5); c.fill();
        c.fillStyle = '#1b2024'; this.rr(-10, -3, 7, 5, 1.5); c.fill();
        break;
      case 'shotgun':
        c.fillStyle = wood; this.rr(-12, -4, 11, 8, 2); c.fill();
        c.fillStyle = metal; this.rr(-2, -3.5, 29, 7, 2); c.fill();
        c.fillStyle = wood; this.rr(8, 1, 9, 5, 1.5); c.fill();
        c.fillStyle = hi; this.rr(16, -3, 11, 3, 1); c.fill();
        break;
      case 'rifle':
        c.fillStyle = wood; this.rr(-13, -4, 12, 8, 2); c.fill();
        c.fillStyle = metal; this.rr(-2, -3.5, 26, 7, 2); c.fill();
        c.fillStyle = hi; this.rr(22, -2, 12, 3.5, 1.5); c.fill();
        c.fillStyle = '#1b2024'; this.rr(4, -8, 12, 3.5, 1.5); c.fill();
        c.fillStyle = metal; this.rr(6, 3, 5, 8, 1.5); c.fill();
        break;
      case 'minigun': {
        const spin = (this.time * 40) % TAU;
        c.fillStyle = '#1b2024'; this.rr(-8, -8, 14, 16, 4); c.fill();
        for (let i = 0; i < 3; i++) {
          const off = Math.sin(spin + i * 2.09) * 4.5;
          c.fillStyle = i === 1 ? hi : metal;
          this.rr(4, off - 1.6, 24, 3.2, 1.2); c.fill();
        }
        c.fillStyle = metal; this.rr(24, -6, 3, 12, 1); c.fill();
        break;
      }
      case 'railgun': {
        const charge = Math.max(0, 1 - p.fireT / w.interval);
        c.fillStyle = '#3a2d55'; this.rr(-10, -4, 12, 8, 2); c.fill();
        c.fillStyle = '#5a3f8a'; this.rr(-2, -4.5, 26, 9, 3); c.fill();
        c.fillStyle = '#2b2140'; this.rr(22, -2.5, 13, 5, 2); c.fill();
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = `rgba(201,166,255,${0.25 + charge * 0.7})`;
        for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(3 + i * 6, 0, 2.2 + charge * 1.2, 0, TAU); c.fill(); }
        c.restore();
        break;
      }
    }

    this.drawMuzzleFlash(len, 0, w.id);
    c.restore();
  }

  /** flash + light cone at the muzzle, in gun-local space */
  private drawMuzzleFlash(len: number, my: number, id: WeaponId) {
    const c = this.ctx, p = this.player;
    if (p.muzzle <= 0 && p.muzzleLight <= 0) return;
    c.save();
    c.globalCompositeOperation = 'lighter';
    const size = id === 'shotgun' ? 18 : id === 'railgun' ? 22 : id === 'rifle' ? 14 : id === 'minigun' ? 12 : 10;
    const col = id === 'railgun' ? [210, 180, 255] : id === 'rifle' ? [200, 240, 255] : [255, 220, 130];
    // soft light pool
    if (p.muzzleLight > 0) {
      const R = size * 3.2;
      const gr = c.createRadialGradient(len, my, 1, len, my, R);
      gr.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${0.55 * p.muzzleLight})`);
      gr.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
      c.fillStyle = gr;
      c.beginPath(); c.arc(len, my, R, 0, TAU); c.fill();
    }
    if (p.muzzle > 0) {
      const jitter = 0.85 + Math.random() * 0.3;
      const s = size * jitter;
      c.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},.95)`;
      c.beginPath();
      c.moveTo(len - 2, my); c.lineTo(len + s, my - s * 0.45);
      c.lineTo(len + s * 0.72, my); c.lineTo(len + s, my + s * 0.45);
      c.closePath(); c.fill();
      // side petals
      c.beginPath();
      c.moveTo(len, my); c.lineTo(len + s * 0.35, my - s * 0.7); c.lineTo(len + s * 0.15, my);
      c.lineTo(len + s * 0.35, my + s * 0.7); c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,255,255,.9)';
      c.beginPath(); c.arc(len, my, s * 0.28, 0, TAU); c.fill();
    }
    c.restore();
  }

  private drawBullets() {
    const c = this.ctx;
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';
    for (const b of this.bullets) {
      c.strokeStyle = b.turret ? 'rgba(125,255,224,.9)' : 'rgba(255,210,120,.95)';
      c.lineWidth = b.turret ? 2.6 : 3.4;
      c.beginPath();
      c.moveTo(b.px, b.py);
      c.lineTo(b.x, b.y);
      c.stroke();
      c.strokeStyle = b.turret ? 'rgba(220,255,245,.9)' : 'rgba(255,250,230,1)';
      c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(b.x - (b.vx * 0.012), b.y - (b.vy * 0.012)); c.lineTo(b.x, b.y); c.stroke();
    }
    c.restore();
  }

  private drawCoins() {
    const c = this.ctx;
    for (const co of this.coins) {
      const sx = Math.abs(Math.cos(co.phase));
      c.save();
      c.translate(co.x, co.y);
      c.scale(Math.max(0.15, sx), 1);
      c.fillStyle = 'rgba(0,0,0,.35)';
      c.beginPath(); c.ellipse(0, 1, 6, 2.5, 0, 0, TAU); c.fill();
      const g = c.createLinearGradient(-5, -5, 5, 5);
      g.addColorStop(0, '#fff0a8'); g.addColorStop(0.5, '#ffd24a'); g.addColorStop(1, '#c8881e');
      c.fillStyle = g;
      c.beginPath(); c.arc(0, 0, 6, 0, TAU); c.fill();
      c.strokeStyle = '#8a5a10'; c.lineWidth = 1.4; c.stroke();
      c.fillStyle = '#8a5a10';
      c.fillRect(-1.2, -3.2, 2.4, 6.4);
      c.restore();
      // glint
      if (sx > 0.8) {
        c.fillStyle = 'rgba(255,240,180,.9)';
        c.beginPath(); c.arc(co.x - 2, co.y - 2, 1.1, 0, TAU); c.fill();
      }
    }
  }

  private drawParticles() {
    const c = this.ctx;
    // normal
    for (const p of this.particles) {
      if (p.glow) continue;
      c.globalAlpha = clamp(p.life / p.max, 0, 1);
      c.fillStyle = p.color;
      c.beginPath(); c.arc(p.x, p.y, p.size, 0, TAU); c.fill();
    }
    // additive glow batch
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      if (!p.glow) continue;
      c.globalAlpha = clamp(p.life / p.max, 0, 1);
      c.fillStyle = p.color;
      c.beginPath(); c.arc(p.x, p.y, p.size, 0, TAU); c.fill();
    }
    c.restore();
    c.globalAlpha = 1;
  }

  private drawRings() {
    const c = this.ctx;
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (const r of this.rings) {
      const a = r.life / r.max;
      c.strokeStyle = `rgba(${r.color},${a * 0.8})`;
      c.lineWidth = r.w * a + 0.5;
      c.beginPath(); c.arc(r.x, r.y, r.r, 0, TAU); c.stroke();
    }
    c.restore();
  }

  private drawTexts() {
    const c = this.ctx;
    c.textAlign = 'center';
    for (const t of this.texts) {
      const a = clamp(t.life / t.max, 0, 1);
      c.globalAlpha = a;
      c.font = `700 ${t.size}px Rajdhani, sans-serif`;
      c.lineWidth = 3.5; c.strokeStyle = 'rgba(0,0,0,.8)';
      c.strokeText(t.text, t.x, t.y);
      c.fillStyle = t.color;
      c.fillText(t.text, t.x, t.y);
    }
    c.globalAlpha = 1;
  }
}
