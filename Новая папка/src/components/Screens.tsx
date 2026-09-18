import { useEffect, useState } from 'react';
import type { Game } from '../game/Game';
import { LEVEL_COUNT } from '../game/Game';
import type { ScoreRow } from '../game/storage';
import { onSpritesReady } from '../game/sprites';
import {
  IconCoin, IconPlay, IconRestart, IconHome, IconLair, IconTrophy, IconSkull,
  IconBunker, iconByName, IconSoundOn, IconSoundOff, weaponIcon, IconBullet,
} from './Icons';

type ShopItem = ReturnType<Game['getShop']>[number];
type WeaponItem = ReturnType<Game['getWeapons']>[number];
type Stats = ReturnType<Game['getStats']>;

/* ---------------- weapon armory ---------------- */

export type GunArt = Record<string, string | null>;

const GUN_TAG: Record<string, string> = {
  sidearm: '9MM SERVICE PISTOL', smg: 'COMPACT PDW', shotgun: '12GA PUMP-ACTION',
  rifle: '7.62 MARKSMAN', minigun: 'ROTARY CANNON', railgun: 'COILGUN PROTOTYPE',
};

export function WeaponGrid({ items, coins, art, onPick }: {
  items: WeaponItem[]; coins: number; art: GunArt; onPick: (id: WeaponItem['id']) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
      {items.map((w) => {
        const afford = coins >= w.cost;
        const state = w.equipped ? 'equipped' : w.owned ? 'owned' : afford ? 'buy' : 'poor';
        const img = art[w.id];
        return (
          <button
            key={w.id}
            onClick={() => onPick(w.id)}
            className={'panel relative rounded-xl p-2.5 text-left transition-all duration-150 active:scale-[.97] overflow-hidden ' +
              (state === 'poor' ? 'opacity-60 ' : 'hover:-translate-y-0.5 ') +
              (w.equipped ? 'border-[#56e3ff77] shadow-[0_0_24px_rgba(86,227,255,.18)] ' : state === 'buy' ? 'border-[#ffd24a44] ' : '')}
          >
            {/* glow wash behind an equipped / affordable gun */}
            <div className="absolute inset-0 pointer-events-none" style={{
              background: w.equipped
                ? 'radial-gradient(ellipse at 50% 60%, rgba(86,227,255,.14), transparent 70%)'
                : state === 'buy'
                  ? 'radial-gradient(ellipse at 50% 60%, rgba(255,210,74,.10), transparent 70%)'
                  : 'none',
            }} />

            <div className="relative flex items-start gap-2">
              <div className={'shrink-0 w-9 h-9 rounded-lg bg-black/40 border flex items-center justify-center ' +
                (w.equipped ? 'border-[#56e3ff88] text-[#56e3ff]' : 'border-[#ffb13d33] text-[#ffb13d]')}>
                {weaponIcon(w.icon, 20)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-display text-[12px] sm:text-[13px] tracking-wider text-[#e6efe2] leading-tight truncate">{w.name}</div>
                <div className="text-[9px] tracking-[.18em] text-[#7d9278] font-bold truncate">{GUN_TAG[w.id] ?? `SLOT ${w.slot}`}</div>
              </div>
              {w.equipped ? (
                <span className="text-[9px] font-bold tracking-[.15em] px-1.5 py-0.5 rounded bg-[#56e3ff22] text-[#56e3ff] border border-[#56e3ff55]">IN HAND</span>
              ) : (
                <span className="text-[9px] font-bold tracking-[.15em] px-1.5 py-0.5 rounded bg-black/40 text-[#7d9278] border border-white/5">SLOT {w.slot}</span>
              )}
            </div>

            <div className="relative h-[92px] sm:h-[104px] my-1 flex items-center justify-center">
              {img ? (
                <img
                  key={w.equipped ? 'eq' : 'no'}
                  src={img} alt={w.name} draggable={false}
                  className={'max-h-full max-w-[92%] object-contain select-none pointer-events-none drop-shadow-[0_10px_14px_rgba(0,0,0,.6)] ' +
                    (w.equipped ? 'anim-pop' : '')}
                  style={{ filter: state === 'poor' ? 'grayscale(.7) brightness(.75)' : 'none' }}
                />
              ) : (
                <span className="text-[#56e3ff]">{weaponIcon(w.icon, 56)}</span>
              )}
              {state === 'poor' && (
                <span className="absolute bottom-0 right-1 text-[9px] font-bold tracking-[.2em] text-[#9d6b6b]">LOCKED</span>
              )}
            </div>

            <p className="relative text-[11px] text-[#8fa588] leading-snug min-h-[28px]">{w.desc}</p>
            <div className="relative flex items-center gap-2 mt-1 text-[10px] font-bold text-[#9fb898]">
              <span className="text-[#ffd24a]">{w.dps} DPS</span>
              {w.pellets > 1 && <span>×{w.pellets} PELLET</span>}
              {w.pierce > 0 && <span className="text-[#c9a6ff]">PIERCE {w.pierce + 1}</span>}
            </div>
            <div className={'relative mt-1.5 rounded-md px-2 py-1.5 flex items-center justify-center gap-1.5 text-xs font-bold tracking-wider ' +
              (w.equipped ? 'bg-[#56e3ff18] text-[#56e3ff] border border-[#56e3ff33]'
                : w.owned ? 'bg-black/40 text-[#cfe8c8] border border-[#9dff4f33]'
                  : afford ? 'bg-[#ffd24a22] text-[#ffd24a] border border-[#ffd24a44]'
                    : 'bg-black/40 text-[#9d6b6b]')}>
              {w.equipped ? <span>EQUIPPED</span>
                : w.owned ? <span>EQUIP</span>
                  : (<><IconCoin size={13} /> {w.cost}</>)}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- shared bits ---------------- */

export function HighScoreTable({ rows, highlightId, compact }: { rows: ScoreRow[]; highlightId?: string | null; compact?: boolean }) {
  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-2 justify-center">
        <IconTrophy size={18} className="text-[#ffd24a]" />
        <h3 className="font-display tracking-[.25em] text-sm text-[#ffd24a] text-glow-gold">LOCAL RECORDS</h3>
      </div>
      <div className="rounded-lg overflow-hidden border border-[#ffd24a22]">
        <div className="grid grid-cols-[2.2rem_1fr_auto_auto] gap-2 px-3 py-1.5 text-[10px] tracking-[.2em] text-[#93a88c] font-bold bg-black/40">
          <span>RANK</span><span>SURVIVOR</span><span className="text-right">SCORE</span><span className="text-right w-10">LV</span>
        </div>
        {rows.length === 0 && (
          <div className="px-3 py-4 text-center text-sm text-[#7d9278] italic">No records yet — be the first to survive.</div>
        )}
        {rows.slice(0, compact ? 5 : 8).map((r, i) => (
          <div
            key={r.id}
            className={'grid grid-cols-[2.2rem_1fr_auto_auto] gap-2 items-center px-3 py-1.5 text-sm font-bold tabular-nums ' +
              (r.id === highlightId
                ? 'bg-[#ffd24a1f] outline outline-1 outline-[#ffd24a66]'
                : i % 2 ? 'bg-white/[.03]' : 'bg-transparent')}
          >
            <span className={i === 0 ? 'text-[#ffd24a]' : i === 1 ? 'text-[#cfe0ff]' : i === 2 ? 'text-[#e0a070]' : 'text-[#7d9278]'}>
              {i + 1}
            </span>
            <span className="text-[#dce8d6] truncate">{r.name}</span>
            <span className="text-right text-[#c8ffb0]">{r.score.toLocaleString()}</span>
            <span className="text-right w-10 text-[#8fbf75]">{r.level}/{LEVEL_COUNT}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Pips({ level, max }: { level: number; max: number }) {
  if (max === Infinity) return <span className="text-[9px] tracking-[.2em] text-[#7d9278] font-bold">REPEATABLE</span>;
  return (
    <div className="flex gap-1">
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} className="w-2 h-2 rounded-sm" style={{
          background: i < level ? '#9dff4f' : 'rgba(255,255,255,.12)',
          boxShadow: i < level ? '0 0 6px rgba(157,255,79,.7)' : 'none',
        }} />
      ))}
    </div>
  );
}

export function ShopGrid({ items, onBuy }: { items: ShopItem[]; onBuy: (id: ShopItem['id']) => void }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => onBuy(it.id)}
          disabled={!it.canBuy}
          className={'panel rounded-xl p-2.5 text-left transition-transform active:scale-[.97] ' + (it.canBuy ? 'hover:border-[#9dff4f55]' : 'opacity-60')}
        >
          <div className="flex items-start gap-2">
            <div className="shrink-0 w-10 h-10 rounded-lg bg-black/40 border border-[#9dff4f25] flex items-center justify-center text-[#9dff4f]">
              {iconByName(it.icon, 22)}
            </div>
            <div className="min-w-0">
              <div className="font-display text-[11px] sm:text-xs tracking-wider text-[#dce8d6] leading-tight">{it.name}</div>
              <Pips level={it.level} max={it.max} />
            </div>
          </div>
          <p className="text-[11px] text-[#8fa588] leading-snug mt-1.5 min-h-[28px]">{it.desc}</p>
          <div className={'mt-1.5 rounded-md px-2 py-1 flex items-center justify-center gap-1.5 text-xs font-bold ' +
            (it.maxed ? 'bg-black/40 text-[#7d9278]' : it.canBuy ? 'bg-[#ffd24a22] text-[#ffd24a] border border-[#ffd24a44]' : 'bg-black/40 text-[#9d6b6b]')}>
            {it.maxed
              ? <span>{it.id === 'repair' ? 'FULL INTEGRITY' : 'MAXED'}</span>
              : (<><IconCoin size={13} /> {it.cost}</>)}
          </div>
        </button>
      ))}
    </div>
  );
}

/** Fortifications and personal gear, each with its own header */
function UpgradeSections({ items, coins, onBuy }: { items: ShopItem[]; coins: number; onBuy: (id: ShopItem['id']) => void }) {
  const base = items.filter((i) => i.group === 'base');
  const hero = items.filter((i) => i.group === 'hero');
  const Head = ({ title, color, icon }: { title: string; color: string; icon: React.ReactNode }) => (
    <div className="flex items-center justify-center gap-2 mt-5 mb-2">
      <span style={{ color }}>{icon}</span>
      <h3 className="font-display tracking-[.25em] text-sm" style={{ color }}>{title}</h3>
      <span className="hud-chip rounded-full px-3 py-1 flex items-center gap-1.5 text-[#ffd24a] font-bold text-sm">
        <IconCoin size={14} /> {coins}
      </span>
    </div>
  );
  return (
    <>
      <Head title="BUNKER FORTIFICATIONS" color="#56e39a" icon={<IconBunker size={16} />} />
      <ShopGrid items={base} onBuy={onBuy} />
      <Head title="FIELD GEAR" color="#ffd24a" icon={<IconBullet size={16} />} />
      <ShopGrid items={hero} onBuy={onBuy} />
    </>
  );
}

function StatChip({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: React.ReactNode; color: string }) {
  return (
    <div className="hud-chip rounded-xl px-3 py-2 flex flex-col items-center min-w-[5.5rem]">
      <span style={{ color }}>{icon}</span>
      <span className="text-lg font-bold tabular-nums" style={{ color }}>{value}</span>
      <span className="text-[9px] tracking-[.25em] text-[#7d9278] font-bold">{label}</span>
    </div>
  );
}

function StatRow({ stats }: { stats: Stats }) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      <StatChip icon={<IconTrophy size={18} />} label="SCORE" value={stats.score.toLocaleString()} color="#ffd24a" />
      <StatChip icon={<IconCoin size={18} />} label="COINS" value={stats.coins} color="#ffd24a" />
      <StatChip icon={<IconSkull size={18} />} label="KILLS" value={stats.kills} color="#9dff4f" />
      <StatChip icon={<IconLair size={18} />} label="BEST COMBO" value={String(stats.maxCombo)} color="#ffb13d" />
      <StatChip icon={<IconBunker size={18} />} label="SECTOR" value={stats.level + '/' + LEVEL_COUNT} color="#56e3ff" />
    </div>
  );
}

function CornerMute({ muted, onMute }: { muted: boolean; onMute: () => void }) {
  return (
    <button onClick={onMute}
      className="absolute top-3 right-3 z-10 hud-chip rounded-lg w-10 h-10 flex items-center justify-center text-[#cfe8c8] active:scale-90">
      {muted ? <IconSoundOff size={18} /> : <IconSoundOn size={18} />}
    </button>
  );
}

function Shell({ children, tone = 'acid' }: { children: React.ReactNode; tone?: 'acid' | 'red' | 'gold' }) {
  const grad = tone === 'red'
    ? 'radial-gradient(ellipse at 50% 30%, rgba(80,10,10,.72), rgba(4,7,10,.92))'
    : tone === 'gold'
      ? 'radial-gradient(ellipse at 50% 30%, rgba(70,60,15,.72), rgba(4,7,10,.92))'
      : 'radial-gradient(ellipse at 50% 30%, rgba(30,60,20,.55), rgba(4,7,10,.92))';
  return (
    <div className="absolute inset-0 z-30 overflow-y-auto" style={{ background: grad }}>
      <div className="min-h-full flex items-center justify-center p-3 sm:p-6">{children}</div>
    </div>
  );
}

/* ---------------- start screen ---------------- */

export function StartScreen({ scores, isTouch, muted, onStart, onMute }: {
  scores: ScoreRow[]; isTouch: boolean; muted: boolean; onStart: () => void; onMute: () => void;
}) {
  const sectors = ['I · OUTBREAK', 'II · ESCALATION', 'III · ONSLAUGHT', 'IV · OVERRUN', 'V · APOCALYPSE'];
  const sectorTone = ['border-[#9dff4f44] text-[#b6ff80]', 'border-[#c8e05555] text-[#dcf08a]',
    'border-[#ffb13d55] text-[#ffc980]', 'border-[#ff8a4455] text-[#ffb08a]', 'border-[#ff555555] text-[#ff8a8a]'];
  const [art, setArt] = useState<{ hero: string | null; zombie: string | null }>({ hero: null, zombie: null });
  useEffect(() => onSpritesReady((p) => setArt({ hero: p.hero.portraitSide ?? p.hero.portrait, zombie: p.zombie.portrait })), []);
  return (
    <Shell>
      <CornerMute muted={muted} onMute={onMute} />
      <div className="w-full max-w-2xl flex flex-col items-center text-center anim-fade-up">
        <div className="relative flex items-end justify-center gap-6 sm:gap-14 mb-1 h-36 sm:h-44">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-44 h-36 rounded-full blur-2xl bg-[#9dff4f2a]" />
          {art.hero && (
            <img src={art.hero} alt="Survivor"
              className="relative h-32 sm:h-40 w-auto anim-float drop-shadow-[0_8px_18px_rgba(0,0,0,.65)] select-none pointer-events-none"
              style={{ imageRendering: 'auto' }} />
          )}
          <span className="relative font-display text-2xl sm:text-3xl text-[#ff5a5a] text-glow-red pb-10 sm:pb-14 anim-flicker">VS</span>
          {art.zombie ? (
            <img src={art.zombie} alt="Infected"
              className="relative h-32 sm:h-40 w-auto anim-float drop-shadow-[0_8px_18px_rgba(0,0,0,.65)] select-none pointer-events-none"
              style={{ transform: 'scaleX(-1)', animationDelay: '-1.7s' }} />
          ) : (
            <div className="relative w-20 h-20 rounded-full border-2 border-[#9dff4f66] bg-black/50 flex items-center justify-center text-[#9dff4f]">
              <IconLair size={48} />
            </div>
          )}
        </div>
        <div className="text-[10px] sm:text-xs tracking-[.5em] text-[#8fbf75] font-bold mb-1 anim-flicker">CLASSIFIED · CONTAINMENT PROTOCOL</div>
        <h1 className="font-display title-shimmer text-5xl sm:text-7xl leading-none">HIVE BREAKER</h1>
        <p className="mt-2 text-sm sm:text-base text-[#a9c9a0] tracking-widest font-bold">A ZOMBIE BASE SIEGE</p>

        <div className="flex gap-2 mt-4 flex-wrap justify-center">
          {sectors.map((s, i) => (
            <span key={s} className={'px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-bold tracking-widest border bg-black/30 ' + sectorTone[i]}>
              {s}
            </span>
          ))}
        </div>

        <div className="panel rounded-xl px-4 py-3 mt-4 text-left w-full">
          <div className="text-[10px] tracking-[.3em] text-[#8fbf75] font-bold mb-1.5 text-center">BRIEFING</div>
          <p className="text-[13px] sm:text-sm text-[#c2d4bc] leading-relaxed text-center">
            The hive spawns endless infected. <span className="text-[#b6ff80] font-bold">Gun down the horde, shoot the glowing core to destroy each hive</span>,
            bank the coins, then buy heavier guns and fortify your bunker between sectors. Survive all {LEVEL_COUNT} sectors — or be overrun.
          </p>
          <div className="grid grid-cols-2 gap-2 mt-3 text-[11px] sm:text-xs text-[#9fb898]">
            {isTouch ? (
              <>
                <div className="flex gap-2 items-start"><span className="text-[#9dff4f]">●</span> Left stick — move</div>
                <div className="flex gap-2 items-start"><span className="text-[#ffb13d]">●</span> Right stick — aim &amp; fire</div>
                <div className="flex gap-2 items-start"><span className="text-[#ffd24a]">●</span> Coins vacuum to you</div>
                <div className="flex gap-2 items-start"><span className="text-[#56e3ff]">●</span> Spend coins between sectors</div>
              </>
            ) : (
              <>
                <div className="flex gap-2 items-start"><span className="text-[#9dff4f] font-bold">WASD</span> Move</div>
                <div className="flex gap-2 items-start"><span className="text-[#ffb13d] font-bold">MOUSE</span> Aim · hold click to fire</div>
                <div className="flex gap-2 items-start"><span className="text-[#c8ffb0] font-bold">SPACE</span> Auto-target fire</div>
                <div className="flex gap-2 items-start"><span className="text-[#c8ffb0] font-bold">1-6 / Q E</span> Swap gun · <span className="text-[#c8ffb0] font-bold">R</span> Reload</div>
                <div className="flex gap-2 items-start"><span className="text-[#c8ffb0] font-bold">P / ESC</span> Pause</div>
              </>
            )}
          </div>
        </div>

        <button onClick={onStart}
          className="btn btn-primary mt-5 px-10 py-4 text-xl sm:text-2xl flex items-center gap-3">
          <IconPlay size={24} /> DEPLOY
        </button>

        <div className="w-full max-w-md mt-5">
          <HighScoreTable rows={scores} compact />
        </div>
      </div>
    </Shell>
  );
}

/* ---------------- pause ---------------- */

export function PauseOverlay({ shop, weapons, gunArt, coins, onResume, onRestart, onMenu, onBuy, onWeapon, onMute, muted }: {
  shop: ShopItem[]; weapons: WeaponItem[]; gunArt: GunArt; coins: number;
  onResume: () => void; onRestart: () => void; onMenu: () => void;
  onBuy: (id: ShopItem['id']) => void; onWeapon: (id: WeaponItem['id']) => void; onMute: () => void; muted: boolean;
}) {
  return (
    <Shell>
      <div className="w-full max-w-3xl anim-fade-up">
        <h2 className="font-display text-4xl text-center text-[#b6ff80] text-glow-acid tracking-widest">PAUSED</h2>
        <div className="flex flex-wrap justify-center gap-2 mt-4">
          <button onClick={onResume} className="btn btn-primary px-6 py-3 flex items-center gap-2"><IconPlay size={18} /> RESUME</button>
          <button onClick={onRestart} className="btn btn-amber px-6 py-3 flex items-center gap-2"><IconRestart size={18} /> RESTART</button>
          <button onClick={onMenu} className="btn btn-ghost px-5 py-3 flex items-center gap-2"><IconHome size={18} /> MENU</button>
          <button onClick={onMute} className="btn btn-ghost px-4 py-3">{muted ? <IconSoundOff size={18} /> : <IconSoundOn size={18} />}</button>
        </div>
        <div className="flex items-center justify-center gap-2 mt-5 mb-2">
          <IconBullet size={16} className="text-[#56e3ff]" />
          <h3 className="font-display tracking-[.25em] text-sm text-[#56e3ff]">GUN LOCKER</h3>
          <span className="hud-chip rounded-full px-3 py-1 flex items-center gap-1.5 text-[#ffd24a] font-bold text-sm">
            <IconCoin size={14} /> {coins}
          </span>
        </div>
        <WeaponGrid items={weapons} coins={coins} art={gunArt} onPick={onWeapon} />
        <UpgradeSections items={shop} coins={coins} onBuy={onBuy} />
      </div>
    </Shell>
  );
}

/* ---------------- level clear ---------------- */

export function LevelClear({ level, stats, shop, weapons, gunArt, onBuy, onWeapon, onContinue }: {
  level: number; stats: Stats; shop: ShopItem[]; weapons: WeaponItem[]; gunArt: GunArt;
  onBuy: (id: ShopItem['id']) => void; onWeapon: (id: WeaponItem['id']) => void; onContinue: () => void;
}) {
  return (
    <Shell tone="gold">
      <div className="w-full max-w-3xl anim-fade-up text-center">
        <div className="text-[10px] tracking-[.45em] text-[#8fbf75] font-bold anim-flicker">SECTOR SECURED</div>
        <h2 className="font-display text-4xl sm:text-5xl text-[#ffd24a] text-glow-gold mt-1">{'SECTOR ' + level + ' CLEARED'}</h2>
        <p className="text-sm text-[#c2d4bc] mt-1 tracking-wider">Reinforce the bunker. The next hive hits harder.</p>
        <div className="mt-4"><StatRow stats={stats} /></div>
        <div className="flex items-center justify-center gap-2 mt-5 mb-2">
          <IconBullet size={16} className="text-[#56e3ff]" />
          <h3 className="font-display tracking-[.25em] text-sm text-[#56e3ff]">GUN LOCKER</h3>
          <span className="hud-chip rounded-full px-3 py-1 flex items-center gap-1.5 text-[#ffd24a] font-bold text-sm">
            <IconCoin size={14} /> {stats.coins}
          </span>
        </div>
        <WeaponGrid items={weapons} coins={stats.coins} art={gunArt} onPick={onWeapon} />
        <UpgradeSections items={shop} coins={stats.coins} onBuy={onBuy} />
        <button onClick={onContinue} className="btn btn-primary mt-5 px-10 py-4 text-xl">
          {'ADVANCE TO SECTOR ' + (level + 1)}
        </button>
      </div>
    </Shell>
  );
}

/* ---------------- game over / victory ---------------- */

function RecordSection({ rows, highlightId, name, onName }: {
  rows: ScoreRow[]; highlightId: string | null; name: string; onName: (n: string) => void;
}) {
  return (
    <div className="w-full max-w-md mt-4 anim-pop">
      <div className="flex items-center justify-center gap-2 mb-2 flex-wrap">
        <input
          className="name-input"
          value={name}
          maxLength={12}
          onChange={(e) => onName(e.target.value.toUpperCase().replace(/[^A-Z0-9 -]/g, '').slice(0, 12))}
          aria-label="Your name"
        />
        <span className="text-xs tracking-[.2em] text-[#8fbf75] font-bold">SAVED TO RECORDS</span>
      </div>
      <HighScoreTable rows={rows} highlightId={highlightId} />
    </div>
  );
}

export function GameOver({ stats, rows, highlightId, name, onName, onRetry, onMenu }: {
  stats: Stats; rows: ScoreRow[]; highlightId: string | null; name: string;
  onName: (n: string) => void; onRetry: () => void; onMenu: () => void;
}) {
  return (
    <Shell tone="red">
      <div className="w-full flex flex-col items-center text-center anim-fade-up">
        <IconSkull size={64} className="text-[#ff5a5a] anim-warn" />
        <h2 className="font-display text-5xl sm:text-6xl text-[#ff5a5a] text-glow-red mt-2 tracking-wider">
          {stats.reason === 'base' ? 'BUNKER OVERRUN' : 'K.I.A.'}
        </h2>
        <p className="text-sm text-[#d8a0a0] mt-1 tracking-widest">
          {stats.reason === 'base' ? 'The horde tore through your walls.' : 'The horde claimed another survivor.'}
        </p>
        <div className="mt-4"><StatRow stats={stats} /></div>
        <div className="flex gap-2 mt-5 flex-wrap justify-center">
          <button onClick={onRetry} className="btn btn-primary px-8 py-4 text-xl flex items-center gap-2"><IconRestart size={22} /> INSTANT RETRY</button>
          <button onClick={onMenu} className="btn btn-ghost px-5 py-4 flex items-center gap-2"><IconHome size={20} /> MENU</button>
        </div>
        <RecordSection rows={rows} highlightId={highlightId} name={name} onName={onName} />
      </div>
    </Shell>
  );
}

export function Victory({ stats, rows, highlightId, name, onName, onRetry, onMenu }: {
  stats: Stats; rows: ScoreRow[]; highlightId: string | null; name: string;
  onName: (n: string) => void; onRetry: () => void; onMenu: () => void;
}) {
  return (
    <Shell tone="gold">
      <div className="w-full flex flex-col items-center text-center anim-fade-up">
        <div className="relative anim-float">
          <div className="absolute inset-0 blur-2xl bg-[#ffd24a44]" />
          <IconLair size={64} className="relative text-[#9dff4f]" />
        </div>
        <div className="text-[10px] tracking-[.5em] text-[#8fbf75] font-bold mt-2 anim-flicker">ALL HIVES ERADICATED</div>
        <h2 className="font-display title-shimmer text-5xl sm:text-6xl mt-1">VICTORY</h2>
        <p className="text-sm text-[#d8cba0] mt-1 tracking-widest">The dead zone falls silent. You held the line.</p>
        <div className="mt-4"><StatRow stats={stats} /></div>
        <div className="flex gap-2 mt-5 flex-wrap justify-center">
          <button onClick={onRetry} className="btn btn-primary px-8 py-4 text-xl flex items-center gap-2"><IconRestart size={22} /> PLAY AGAIN</button>
          <button onClick={onMenu} className="btn btn-ghost px-5 py-4 flex items-center gap-2"><IconHome size={20} /> MENU</button>
        </div>
        <RecordSection rows={rows} highlightId={highlightId} name={name} onName={onName} />
      </div>
    </Shell>
  );
}

/* ---------------- level banner ---------------- */

export function Banner({ banner }: { banner: { title: string; sub: string; tone: 'acid' | 'amber' | 'red'; key: number } | null }) {
  if (!banner) return null;
  const color = banner.tone === 'red' ? '#ff7a6a' : banner.tone === 'amber' ? '#ffc980' : '#b6ff80';
  return (
    <div key={banner.key} className="absolute inset-x-0 top-[22%] z-20 flex flex-col items-center pointer-events-none">
      <div className="anim-banner text-center">
        <div className="font-display text-3xl sm:text-5xl tracking-[.14em]" style={{ color, textShadow: '0 0 22px ' + color + '99, 0 3px 0 rgba(0,0,0,.7)' }}>
          {banner.title}
        </div>
        <div className="text-xs sm:text-sm tracking-[.5em] font-bold text-white/80 mt-1">{banner.sub}</div>
      </div>
    </div>
  );
}

export type { ShopItem, Stats, WeaponItem };
