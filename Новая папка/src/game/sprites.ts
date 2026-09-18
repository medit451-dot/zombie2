import zombieUrl from '../assets/zombie-sheet.png';
import heroUrl from '../assets/hero-sheet.png';
import gunsUrl from '../assets/guns-sheet.png';

export type ZAnim = 'idle' | 'walk' | 'run' | 'attack';
export type HeroAnim = 'idle' | 'walk' | 'run' | 'pose';
export type ZType = 'walker' | 'runner' | 'tank' | 'brute';
export type GunId = 'sidearm' | 'smg' | 'shotgun' | 'rifle' | 'minigun' | 'railgun';
export type Frames = HTMLCanvasElement[];

export const GUN_IDS: GunId[] = ['sidearm', 'smg', 'shotgun', 'rifle', 'minigun', 'railgun'];

export interface GunPack {
  ready: boolean;
  /** full-res trimmed art for the UI */
  art: Record<GunId, HTMLCanvasElement | null>;
  /** pre-shrunk copy for in-hand rendering */
  hand: Record<GunId, HTMLCanvasElement | null>;
  urls: Record<GunId, string | null>;
}

const emptyGuns = <T,>(v: T): Record<GunId, T> => ({
  sidearm: v, smg: v, shotgun: v, rifle: v, minigun: v, railgun: v,
});

export const gunSprites: GunPack = {
  ready: false,
  art: emptyGuns<HTMLCanvasElement | null>(null),
  hand: emptyGuns<HTMLCanvasElement | null>(null),
  urls: emptyGuns<string | null>(null),
};

const Z_ANIMS: ZAnim[] = ['idle', 'walk', 'run', 'attack'];
const H_ANIMS: HeroAnim[] = ['idle', 'walk', 'run', 'pose'];
const Z_TYPES: ZType[] = ['walker', 'runner', 'tank', 'brute'];

export interface ZombiePack {
  ready: boolean; fw: number; fh: number;
  frames: Record<ZType, Record<ZAnim, Frames>>;
  flash: Record<ZAnim, Frames>;
  counts: Record<ZAnim, number>;
  portrait: string | null;
}

export interface HeroPack {
  ready: boolean; fw: number; fh: number;
  anims: Record<HeroAnim, Frames>;
  hurt: Record<HeroAnim, Frames>;
  portrait: string | null;      // front-facing pose
  portraitSide: string | null;  // side idle
}

const emptyZ = (): Record<ZAnim, Frames> => ({ idle: [], walk: [], run: [], attack: [] });
const emptyH = (): Record<HeroAnim, Frames> => ({ idle: [], walk: [], run: [], pose: [] });

export const zombieSprites: ZombiePack = {
  ready: false, fw: 0, fh: 0,
  frames: { walker: emptyZ(), runner: emptyZ(), tank: emptyZ(), brute: emptyZ() },
  flash: emptyZ(),
  counts: { idle: 0, walk: 0, run: 0, attack: 0 },
  portrait: null,
};

export const heroSprites: HeroPack = {
  ready: false, fw: 0, fh: 0,
  anims: emptyH(), hurt: emptyH(),
  portrait: null, portraitSide: null,
};

export type Packs = { zombie: ZombiePack; hero: HeroPack; guns: GunPack };
const LOADS = 3;
const listeners: Array<(p: Packs) => void> = [];
let settled = 0;
let started = false;

const packs = (): Packs => ({ zombie: zombieSprites, hero: heroSprites, guns: gunSprites });

export function onSpritesReady(cb: (p: Packs) => void) {
  if (settled >= LOADS) cb(packs());
  else listeners.push(cb);
}

function settle() {
  settled++;
  if (settled >= LOADS) {
    for (const cb of listeners) cb(packs());
    listeners.length = 0;
  }
}

/* ============================================================
   image helpers
   ============================================================ */

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/**
 * Remove the flat backdrop. For a chroma-green backdrop we key globally
 * (so enclosed pockets between limbs vanish too); otherwise we flood-fill
 * from the image border so we never eat dark outlines.
 */
function stripBackground(g: CanvasRenderingContext2D, w: number, h: number) {
  const img = g.getImageData(0, 0, w, h);
  const p = img.data;

  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + (w - 1)) * 4];
  let br = 0, bg = 0, bb = 0, ba = 0;
  for (const o of corners) { br += p[o]; bg += p[o + 1]; bb += p[o + 2]; ba += p[o + 3]; }
  br /= 4; bg /= 4; bb /= 4; ba /= 4;

  const isChroma = ba > 200 && bg > 100 && bg > br + 40 && bg > bb + 40;

  if (isChroma) {
    for (let i = 0; i < p.length; i += 4) {
      const r = p[i], gc = p[i + 1], b = p[i + 2], a = p[i + 3];
      if (a === 0) continue;
      const maxRB = r > b ? r : b;
      const dom = gc - maxRB;
      if (dom > 26 && gc > 60 && gc > r * 1.12 && gc > b * 1.12) {
        const t = Math.min(1, (dom - 26) / 60);
        const bright = (r + gc + b) / 3;
        if (bright > 46) p[i + 3] = Math.round(a * (1 - t));
        else { p[i + 1] = maxRB; p[i + 3] = Math.round(a * (1 - t * 0.5)); }
      } else if (dom > 14 && gc > 40) {
        // despill soft edges
        p[i + 1] = Math.round(gc * 0.4 + maxRB * 0.6);
      }
    }
  } else {
    const tol = 40;
    const visited = new Uint8Array(w * h);
    const stack: number[] = [];
    const push = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const i = y * w + x;
      if (visited[i]) return;
      const o = i * 4;
      if (Math.abs(p[o] - br) > tol || Math.abs(p[o + 1] - bg) > tol ||
          Math.abs(p[o + 2] - bb) > tol || Math.abs(p[o + 3] - ba) > tol) return;
      visited[i] = 1;
      stack.push(x, y);
    };
    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
    while (stack.length) {
      const y = stack.pop()!, x = stack.pop()!;
      p[(y * w + x) * 4 + 3] = 0;
      push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
    }
  }
  g.putImageData(img, 0, 0);
}

interface Box { x: number; y: number; w: number; h: number; cx: number; cy: number; }

/** Locate every separate blob (= one frame) via a coarse dilated grid flood-fill. */
function detectBlobs(alpha: Uint8Array, w: number, h: number): Box[] {
  const cell = Math.max(3, Math.round(Math.min(w, h) / 256));
  const gw = Math.ceil(w / cell), gh = Math.ceil(h / cell);
  const occ = new Uint8Array(gw * gh);
  for (let y = 0; y < h; y++) {
    const gy = (y / cell) | 0;
    const row = y * w;
    for (let x = 0; x < w; x++) if (alpha[row + x]) occ[gy * gw + ((x / cell) | 0)] = 1;
  }
  const dil = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let any = 0;
      for (let dy = -1; dy <= 1 && !any; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const yy = gy + dy, xx = gx + dx;
          if (yy >= 0 && yy < gh && xx >= 0 && xx < gw && occ[yy * gw + xx]) { any = 1; break; }
        }
      }
      dil[gy * gw + gx] = any;
    }
  }
  const seen = new Uint8Array(gw * gh);
  const boxes: Box[] = [];
  const stack: number[] = [];
  for (let s = 0; s < gw * gh; s++) {
    if (!dil[s] || seen[s]) continue;
    let minX = gw, minY = gh, maxX = -1, maxY = -1;
    seen[s] = 1; stack.push(s);
    while (stack.length) {
      const j = stack.pop()!;
      const gx = j % gw, gy = (j / gw) | 0;
      if (occ[j]) {
        if (gx < minX) minX = gx; if (gx > maxX) maxX = gx;
        if (gy < minY) minY = gy; if (gy > maxY) maxY = gy;
      }
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const yy = gy + dy, xx = gx + dx;
          if (yy < 0 || yy >= gh || xx < 0 || xx >= gw) continue;
          const n = yy * gw + xx;
          if (dil[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
        }
      }
    }
    if (maxX < 0) continue;
    const bx = minX * cell, by = minY * cell;
    const bw = Math.min(w, (maxX + 1) * cell) - bx;
    const bh = Math.min(h, (maxY + 1) * cell) - by;
    boxes.push({ x: bx, y: by, w: bw, h: bh, cx: bx + bw / 2, cy: by + bh / 2 });
  }
  return boxes;
}

/** Shrink a box to its exact opaque bounds. Returns null when (near) empty. */
function tighten(alpha: Uint8Array, w: number, box: Box): (Box & { count: number }) | null {
  let minX = box.x + box.w, minY = box.y + box.h, maxX = -1, maxY = -1, count = 0;
  const x1 = Math.min(w - 1, box.x + box.w - 1);
  for (let y = box.y; y < box.y + box.h; y++) {
    const row = y * w;
    for (let x = box.x; x <= x1; x++) {
      if (!alpha[row + x]) continue;
      count++;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  return { x: minX, y: minY, w: bw, h: bh, cx: minX + bw / 2, cy: minY + bh / 2, count };
}

function median(v: number[]) {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : 0;
}

interface Sliced { rows: Frames[]; fw: number; fh: number; portrait: HTMLCanvasElement | null; }

/** Turn a sheet into rows of normalised, bottom-anchored frames. */
function sliceSheet(img: HTMLImageElement, maxRows: number): Sliced {
  const w = img.width, h = img.height;
  const work = makeCanvas(w, h);
  const g = work.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  stripBackground(g, w, h);

  const data = g.getImageData(0, 0, w, h).data;
  const alpha = new Uint8Array(w * h);
  for (let i = 0, j = 3; i < alpha.length; i++, j += 4) alpha[i] = data[j] > 28 ? 1 : 0;

  let boxes = detectBlobs(alpha, w, h)
    .map((b) => tighten(alpha, w, b))
    .filter((b): b is Box & { count: number } => !!b && b.count > 60 && b.h > 6);

  // drop text-like blobs (wide & short)
  boxes = boxes.filter((b) => b.w < b.h * 1.45);
  if (!boxes.length) return { rows: [], fw: 0, fh: 0, portrait: null };

  const medH = median(boxes.map((b) => b.h));
  const medW = median(boxes.map((b) => b.w));

  // an oversized blob is a portrait, tiny ones are noise
  let portraitBox: Box | null = null;
  boxes = boxes.filter((b) => {
    if (b.h > medH * 1.8) { if (!portraitBox || b.h > portraitBox.h) portraitBox = b; return false; }
    return b.h > medH * 0.5;
  });

  // frames that touched their neighbour merge into one wide blob: split it
  const split: Box[] = [];
  for (const b of boxes) {
    const n = Math.round(b.w / medW);
    if (n >= 2 && b.w > medW * 1.7) {
      const pw = b.w / n;
      for (let i = 0; i < n; i++) {
        const part = tighten(alpha, w, { x: Math.round(b.x + i * pw), y: b.y, w: Math.round(pw), h: b.h, cx: 0, cy: 0 });
        if (part && part.count > 60) split.push(part);
      }
    } else split.push(b);
  }

  // cluster into rows by vertical centre
  split.sort((a, b) => a.cy - b.cy);
  const rows: { cy: number; items: Box[] }[] = [];
  for (const b of split) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(b.cy - last.cy) < medH * 0.55) {
      last.items.push(b);
      last.cy = last.items.reduce((s, it) => s + it.cy, 0) / last.items.length;
    } else rows.push({ cy: b.cy, items: [b] });
  }
  // too many rows → the sparsest ones are stray blobs, not animations
  const kept = rows.slice();
  while (kept.length > maxRows) {
    let worst = 0;
    for (let i = 1; i < kept.length; i++) if (kept[i].items.length <= kept[worst].items.length) worst = i;
    kept.splice(worst, 1);
  }
  const useRows = kept
    .sort((a, b) => a.cy - b.cy)
    .map((r) => r.items.sort((a, b) => a.x - b.x));
  if (!useRows.length || !useRows.flat().length) return { rows: [], fw: 0, fh: 0, portrait: null };

  // uniform cell, anchored at the feet with the head kept centred
  const fwRaw = Math.max(...useRows.flat().map((b) => b.w));
  const fh = Math.max(...useRows.flat().map((b) => b.h));
  const fw = Math.round(fwRaw * 1.25);

  const frameOf = (b: Box) => {
    // centroid of the top 40% (head/shoulders) keeps walk cycles from swimming
    let sx = 0, n = 0;
    const yEnd = b.y + Math.max(1, Math.floor(b.h * 0.4));
    for (let y = b.y; y < yEnd; y++) {
      const row = y * w;
      for (let x = b.x; x < b.x + b.w; x++) if (alpha[row + x]) { sx += x; n++; }
    }
    const ax = n ? sx / n : b.cx;
    let ox = Math.round(fw / 2 - (ax - b.x));
    ox = Math.max(0, Math.min(fw - b.w, ox));
    const c = makeCanvas(fw, fh);
    c.getContext('2d')!.drawImage(work, b.x, b.y, b.w, b.h, ox, fh - b.h, b.w, b.h);
    return c;
  };

  const outRows = useRows.map((r) => r.map(frameOf));

  let portrait: HTMLCanvasElement | null = null;
  if (portraitBox) {
    const pb = portraitBox as Box;
    portrait = makeCanvas(pb.w, pb.h);
    portrait.getContext('2d')!.drawImage(work, pb.x, pb.y, pb.w, pb.h, 0, 0, pb.w, pb.h);
  }
  return { rows: outRows, fw, fh, portrait };
}

/** Slice a plain grid of `count` items into reading order (no aspect filtering). */
function sliceGrid(img: HTMLImageElement, count: number): HTMLCanvasElement[] {
  const w = img.width, h = img.height;
  const work = makeCanvas(w, h);
  const g = work.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  stripBackground(g, w, h);

  const data = g.getImageData(0, 0, w, h).data;
  const alpha = new Uint8Array(w * h);
  for (let i = 0, j = 3; i < alpha.length; i++, j += 4) alpha[i] = data[j] > 28 ? 1 : 0;

  type TB = Box & { count: number };
  const all = detectBlobs(alpha, w, h)
    .map((b) => tighten(alpha, w, b))
    .filter((b): b is TB => !!b && b.count > 40);
  if (!all.length) return [];

  all.sort((a, b) => b.count - a.count);
  const main: TB[] = all.slice(0, count);
  const rest = all.slice(count);

  // fold detached bits (scopes, muzzle tips) back into the nearest big item
  const pad = Math.max(10, Math.round(w * 0.02));
  for (const s of rest) {
    for (const m of main) {
      if (s.x < m.x + m.w + pad && s.x + s.w > m.x - pad && s.y < m.y + m.h + pad && s.y + s.h > m.y - pad) {
        const nx = Math.min(m.x, s.x), ny = Math.min(m.y, s.y);
        m.w = Math.max(m.x + m.w, s.x + s.w) - nx; m.h = Math.max(m.y + m.h, s.y + s.h) - ny;
        m.x = nx; m.y = ny; m.cx = m.x + m.w / 2; m.cy = m.y + m.h / 2;
        break;
      }
    }
  }

  // rows by vertical centre, then left → right
  const tol = Math.max(median(main.map((b) => b.h)) * 0.6, h * 0.12);
  main.sort((a, b) => a.cy - b.cy);
  const rows: TB[][] = [];
  for (const b of main) {
    const last = rows[rows.length - 1];
    if (last && Math.abs(b.cy - last[0].cy) < tol) last.push(b);
    else rows.push([b]);
  }
  const ordered = rows.flatMap((r) => r.sort((a, b) => a.x - b.x));

  return ordered.map((b) => {
    const c = makeCanvas(b.w, b.h);
    c.getContext('2d')!.drawImage(work, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
    return c;
  });
}

function shrink(src: HTMLCanvasElement, width: number): HTMLCanvasElement {
  const scale = width / src.width;
  const c = makeCanvas(width, src.height * scale);
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

/* ---------- colour variants (composite ops only: works everywhere) ---------- */

function silhouette(src: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const c = makeCanvas(src.width, src.height);
  const g = c.getContext('2d')!;
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

function overlay(src: HTMLCanvasElement, color: string, multiply?: string): HTMLCanvasElement {
  const c = makeCanvas(src.width, src.height);
  const g = c.getContext('2d')!;
  g.drawImage(src, 0, 0);
  if (multiply) {
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = multiply;
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(src, 0, 0);
  }
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

const Z_VARIANT: Record<ZType, (f: HTMLCanvasElement) => HTMLCanvasElement> = {
  walker: (f) => f,
  runner: (f) => overlay(f, 'rgba(210,255,120,.22)'),
  tank:   (f) => overlay(f, 'rgba(40,60,30,.18)', 'rgb(190,185,175)'),
  brute:  (f) => overlay(f, 'rgba(150,60,200,.42)', 'rgb(220,200,240)'),
};

function toDataUrl(c: HTMLCanvasElement | undefined | null) {
  if (!c) return null;
  try { return c.toDataURL('image/png'); } catch { return null; }
}

function loadImage(url: string, onDone: (img: HTMLImageElement | null) => void) {
  const img = new Image();
  img.onload = () => onDone(img);
  img.onerror = () => onDone(null);
  img.src = url;
}

/* ============================================================
   public loader
   ============================================================ */

export function loadSprites(): void {
  if (started) return;
  started = true;

  loadImage(zombieUrl, (img) => {
    if (img) {
      try {
        const s = sliceSheet(img, Z_ANIMS.length);
        if (s.rows.length) {
          const base = emptyZ();
          Z_ANIMS.forEach((a, i) => { base[a] = s.rows[i] ?? []; });
          // fallbacks so every anim has something to show
          if (!base.walk.length) base.walk = base.idle;
          if (!base.idle.length) base.idle = base.walk;
          if (!base.run.length) base.run = base.walk;
          if (!base.attack.length) base.attack = base.walk;
          for (const t of Z_TYPES) {
            for (const a of Z_ANIMS) zombieSprites.frames[t][a] = base[a].map(Z_VARIANT[t]);
          }
          for (const a of Z_ANIMS) {
            zombieSprites.flash[a] = base[a].map((f) => silhouette(f, '#ffffff'));
            zombieSprites.counts[a] = base[a].length;
          }
          zombieSprites.fw = s.fw; zombieSprites.fh = s.fh;
          zombieSprites.portrait = toDataUrl(s.portrait ?? base.idle[0]);
          zombieSprites.ready = true;
        }
      } catch { /* leave not-ready: engine falls back to shapes */ }
    }
    settle();
  });

  loadImage(heroUrl, (img) => {
    if (img) {
      try {
        const s = sliceSheet(img, H_ANIMS.length);
        if (s.rows.length) {
          const a = emptyH();
          H_ANIMS.forEach((name, i) => { a[name] = s.rows[i] ?? []; });
          if (!a.idle.length) a.idle = a.walk.length ? a.walk : a.run;
          if (!a.walk.length) a.walk = a.idle;
          if (!a.run.length) a.run = a.walk;
          if (!a.pose.length) a.pose = [a.idle[0]];
          heroSprites.anims = a;
          for (const name of H_ANIMS) heroSprites.hurt[name] = a[name].map((f) => silhouette(f, '#ff4040'));
          heroSprites.fw = s.fw; heroSprites.fh = s.fh;
          heroSprites.portrait = toDataUrl(s.portrait ?? a.pose[0] ?? a.idle[0]);
          heroSprites.portraitSide = toDataUrl(a.idle[0]);
          heroSprites.ready = true;
        }
      } catch { /* fallback handled by the engine */ }
    }
    settle();
  });

  loadImage(gunsUrl, (img) => {
    if (img) {
      try {
        const cells = sliceGrid(img, GUN_IDS.length);
        if (cells.length === GUN_IDS.length) {
          GUN_IDS.forEach((id, i) => {
            const art = cells[i];
            gunSprites.art[id] = art;
            gunSprites.hand[id] = shrink(art, 176);
            gunSprites.urls[id] = toDataUrl(art);
          });
          gunSprites.ready = true;
        }
      } catch { /* procedural guns remain */ }
    }
    settle();
  });
}
