import type { HudSnapshot } from '../game/Game';
import {
  IconHeart, IconBunker, IconCoin, IconLair, IconPause, IconSoundOn, IconSoundOff,
  IconTrophy, IconSkull, weaponIcon, IconReload, IconBolt,
} from './Icons';

function Bar({ value, max, color, glow, height = 10 }: { value: number; max: number; color: string; glow: string; height?: number }) {
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <div className="bar-track rounded-full overflow-hidden" style={{ height }}>
      <div
        className="h-full rounded-full transition-[width] duration-150 ease-linear"
        style={{
          width: `${pct * 100}%`,
          background: `linear-gradient(180deg, ${color}, ${color}bb)`,
          boxShadow: `0 0 10px ${glow}`,
        }}
      />
    </div>
  );
}

export default function HUD({
  hud, muted, onPause, onMute, onCycleWeapon, onReload, isTouch, avatar, gunArt,
}: {
  hud: HudSnapshot;
  muted: boolean;
  onPause: () => void;
  onMute: () => void;
  onCycleWeapon: (dir: number) => void;
  onReload: () => void;
  isTouch: boolean;
  avatar: string | null;
  gunArt: Record<string, string | null>;
}) {
  const heldArt = gunArt[hud.weapon.id];
  const ammoPct = hud.mag > 0 ? hud.ammo / hud.mag : 1;
  const lowAmmo = hud.mag > 0 && hud.ammo <= Math.max(1, Math.floor(hud.mag * 0.2));
  const reloading = hud.reload > 0;
  const barPct = reloading ? hud.reload : hud.charge > 0 ? hud.charge : hud.spin > 0 && hud.spin < 1 ? hud.spin : ammoPct;
  const barColor = reloading ? '#56e3ff' : hud.charge > 0 ? '#c9a6ff' : hud.spin > 0 && hud.spin < 1 ? '#ffb13d' : lowAmmo ? '#ff4d4d' : '#ffd24a';
  const barLabel = reloading ? 'RELOADING' : hud.charge > 0 ? 'CHARGING' : hud.spin > 0 && hud.spin < 1 ? 'SPIN-UP' : null;
  const baseColor = hud.baseHp / hud.baseMax > 0.5 ? '#56e39a' : hud.baseHp / hud.baseMax > 0.25 ? '#ffb13d' : '#ff4d4d';
  const lowHp = hud.playerHp / hud.playerMax < 0.3;
  return (
    <div className="absolute inset-0 z-20 pointer-events-none font-hud">
      <div className="flex items-start justify-between gap-2 p-2 sm:p-3">
        {/* left cluster */}
        <div className="flex flex-col gap-1.5 min-w-0">
          <div className="hud-chip rounded-lg px-2 py-1.5 sm:px-3 flex items-center gap-2">
            {avatar ? (
              <span className={'w-8 h-8 rounded-full overflow-hidden border shrink-0 bg-black/50 ' + (lowHp ? 'border-[#ff4d4d] anim-warn' : 'border-[#ffb13d66]')}>
                <img src={avatar} alt="" className="w-full h-full object-cover" style={{ objectPosition: '50% 8%', transform: 'scale(2.1)', transformOrigin: '50% 12%' }} />
              </span>
            ) : (
              <span className="text-[#ffb13d]"><IconHeart size={15} /></span>
            )}
            <div className="w-20 sm:w-36"><Bar value={hud.playerHp} max={hud.playerMax} color="#ffb13d" glow="rgba(255,177,61,.5)" height={9} /></div>
            <span className="text-[11px] sm:text-xs font-bold text-amber-200/90 w-12 text-right">{hud.playerHp}/{hud.playerMax}</span>
          </div>
          <div className="hud-chip rounded-lg px-2 py-1.5 sm:px-3 flex items-center gap-2">
            <span className="text-[#56e3ff]"><IconBunker size={15} /></span>
            <div className="w-20 sm:w-36"><Bar value={hud.baseHp} max={hud.baseMax} color={baseColor} glow={`${baseColor}80`} height={9} /></div>
            <span className="text-[11px] sm:text-xs font-bold w-12 text-right" style={{ color: baseColor }}>{hud.baseHp}/{hud.baseMax}</span>
          </div>
        </div>

        {/* right cluster */}
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-1.5">
            <button onClick={onMute} className="pointer-events-auto hud-chip rounded-lg w-9 h-9 flex items-center justify-center text-[#cfe8c8] active:scale-90 transition" aria-label="Mute">
              {muted ? <IconSoundOff size={17} /> : <IconSoundOn size={17} />}
            </button>
            <button onClick={onPause} className="pointer-events-auto hud-chip rounded-lg w-9 h-9 flex items-center justify-center text-[#cfe8c8] active:scale-90 transition" aria-label="Pause">
              <IconPause size={17} />
            </button>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <div className="hud-chip rounded-lg px-2 py-1 flex items-center gap-1.5">
              <span className="text-[#ffd24a]"><IconCoin size={15} /></span>
              <span className="text-sm sm:text-base font-bold text-glow-gold text-[#ffd24a] tabular-nums">{hud.coins}</span>
            </div>
            <div className="hud-chip rounded-lg px-2 py-1 flex items-center gap-1.5">
              <span className="text-[#9dff4f]"><IconTrophy size={14} /></span>
              <span className="text-sm sm:text-base font-bold text-[#c8ffb0] tabular-nums">{hud.score.toLocaleString()}</span>
            </div>
            <div className="hud-chip rounded-lg px-2 py-1 hidden sm:flex items-center gap-1.5">
              <span className="text-[#a9c9a0]"><IconSkull size={14} /></span>
              <span className="text-sm font-bold text-[#c8ddc0] tabular-nums">{hud.kills}</span>
            </div>
            {hud.tesla > 0 && (
              <div className="hud-chip rounded-lg px-2 py-1 flex items-center gap-1.5" title="Tesla emitter charge">
                <span className={hud.teslaCharge >= 1 ? 'text-[#9ad8ff] anim-warn' : 'text-[#5a86a0]'}><IconBolt size={14} /></span>
                <div className="w-10 bar-track rounded-full h-1.5 overflow-hidden">
                  <div className="h-full rounded-full bg-[#9ad8ff]" style={{ width: `${hud.teslaCharge * 100}%`, boxShadow: '0 0 6px rgba(154,216,255,.7)' }} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* hive boss bar */}
      {hud.lairAlive && (
        <div className="absolute top-[64px] sm:top-[70px] left-1/2 -translate-x-1/2 w-[min(440px,72vw)] anim-pop">
          <div className="flex items-center justify-center gap-2 mb-1">
            <span className="text-[#9dff4f]"><IconLair size={15} /></span>
            <span className="font-display text-[11px] sm:text-xs tracking-[.25em] text-[#b6ff80] text-glow-acid">
              ZOMBIE HIVE · LV {hud.level}
            </span>
            <span className="text-[#9dff4f]"><IconLair size={15} /></span>
          </div>
          <div className="bar-track rounded-full h-3 overflow-hidden border border-[#9dff4f33]">
            <div
              className="h-full rounded-full transition-[width] duration-150"
              style={{
                width: `${(hud.lairHp / hud.lairMax) * 100}%`,
                background: 'repeating-linear-gradient(45deg, #7fe23a 0 8px, #9dff4f 8px 16px)',
                boxShadow: '0 0 14px rgba(157,255,79,.6)',
              }}
            />
          </div>
          <p className="text-center text-[10px] sm:text-[11px] tracking-[.3em] text-[#8fbf75]/70 mt-0.5 font-bold">{hud.levelName}</p>
        </div>
      )}

      {/* weapon panel */}
      <div className="absolute bottom-2 left-2 sm:bottom-3 sm:left-3 flex items-end gap-1.5">
        <div className="flex flex-col gap-1">
          <button
            onClick={() => onCycleWeapon(1)}
            className="pointer-events-auto hud-chip rounded-xl px-2.5 py-1.5 flex items-center gap-2.5 active:scale-95 transition"
            aria-label="Swap weapon"
          >
            <span key={hud.weapon.id} className="w-16 sm:w-20 h-9 flex items-center justify-center anim-pop">
              {heldArt
                ? <img src={heldArt} alt="" draggable={false} className="max-w-full max-h-full object-contain drop-shadow-[0_4px_6px_rgba(0,0,0,.7)]" />
                : <span className="text-[#56e3ff]">{weaponIcon(hud.weapon.icon, 22)}</span>}
            </span>
            <span className="text-left leading-tight min-w-[6.5rem]">
              <span className="block font-display text-[11px] sm:text-xs tracking-wider text-[#dce8d6]">{hud.weapon.name}</span>
              <span className="flex items-baseline gap-1.5">
                <span className={'font-display text-base sm:text-lg tabular-nums leading-none ' + (lowAmmo && !reloading ? 'text-[#ff5a5a] anim-warn' : 'text-[#ffd24a]')}>
                  {hud.mag > 0 ? hud.ammo : '∞'}
                </span>
                {hud.mag > 0 && <span className="text-[10px] text-[#7d9278] font-bold tabular-nums">/ {hud.mag}</span>}
                <span className="text-[9px] tracking-[.18em] text-[#7d9278] font-bold ml-auto">
                  {barLabel ?? (isTouch ? 'TAP · SWAP' : `SLOT ${hud.weapon.slot}`)}
                </span>
              </span>
            </span>
          </button>
          {/* ammo / reload / charge bar */}
          <div className="bar-track rounded-full h-1.5 overflow-hidden mx-1">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(0, Math.min(1, barPct)) * 100}%`,
                background: barColor,
                boxShadow: `0 0 8px ${barColor}99`,
                transition: reloading || hud.charge > 0 ? 'none' : 'width .12s linear',
              }}
            />
          </div>
        </div>
        {hud.mag > 0 && (
          <button
            onClick={onReload}
            className={'pointer-events-auto hud-chip rounded-lg w-9 h-9 flex items-center justify-center active:scale-90 transition ' +
              (lowAmmo && !reloading ? 'text-[#ff5a5a] border-[#ff5a5a66]' : 'text-[#cfe8c8]')}
            aria-label="Reload"
            title="Reload (R)"
          >
            <IconReload size={17} className={reloading ? 'animate-spin' : ''} />
          </button>
        )}
        <div className="flex gap-1">
          {hud.owned.map((w) => {
            const a = gunArt[w.id];
            const held = w.id === hud.weapon.id;
            return (
              <button
                key={w.id}
                onClick={() => onCycleWeapon(w.slot - hud.weapon.slot)}
                title={w.name}
                className={'pointer-events-auto hud-chip rounded-lg w-9 h-7 sm:w-11 sm:h-8 flex items-center justify-center p-1 transition active:scale-90 ' +
                  (held ? 'border-[#56e3ffaa] text-[#56e3ff]' : 'text-[#6f8070]')}
              >
                {a
                  ? <img src={a} alt="" draggable={false} className="max-w-full max-h-full object-contain" style={{ filter: held ? 'none' : 'grayscale(.6) brightness(.7)' }} />
                  : weaponIcon(w.icon, 15)}
              </button>
            );
          })}
        </div>
      </div>

      {/* combo */}
      {hud.combo >= 3 && (
        <div className="absolute left-1/2 -translate-x-1/2 top-[30%] text-center pointer-events-none">
          <div key={hud.combo} className="anim-combo-pop font-display text-2xl sm:text-4xl text-[#ffd24a] text-glow-gold">
            {hud.comboMult > 1 ? `${hud.comboMult}× ` : ''}{hud.combo} COMBO
          </div>
          <div className="mx-auto mt-1 h-1 w-28 bar-track rounded-full overflow-hidden">
            <div className="h-full bg-[#ffd24a]" style={{ width: `${hud.comboT * 100}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
