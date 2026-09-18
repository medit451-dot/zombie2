import { useRef } from 'react';
import type { Game } from '../game/Game';

type Zone = 'left' | 'right';
type Ptr = { id: number; zone: Zone; ox: number; oy: number };

const R = 56;
const DEAD = 10;

export default function TouchControls({ gameRef }: { gameRef: React.MutableRefObject<Game | null> }) {
  const layer = useRef<HTMLDivElement>(null);
  const left = useRef<HTMLDivElement>(null);
  const leftKnob = useRef<HTMLDivElement>(null);
  const right = useRef<HTMLDivElement>(null);
  const rightKnob = useRef<HTMLDivElement>(null);
  const ptrs = useRef<Map<number, Ptr>>(new Map());
  const activeZone = useRef<Record<Zone, number | null>>({ left: null, right: null });

  const show = (zone: Zone, x: number, y: number) => {
    const base = zone === 'left' ? left.current : right.current;
    const knob = zone === 'left' ? leftKnob.current : rightKnob.current;
    if (base) {
      base.style.opacity = '1';
      base.style.transform = `translate3d(${x - 64}px, ${y - 64}px, 0)`;
    }
    if (knob) knob.style.transform = 'translate3d(0,0,0)';
  };
  const hide = (zone: Zone) => {
    const base = zone === 'left' ? left.current : right.current;
    const knob = zone === 'left' ? leftKnob.current : rightKnob.current;
    if (base) base.style.opacity = '0';
    if (knob) knob.style.transform = 'translate3d(0,0,0)';
  };

  const onDown = (e: React.PointerEvent) => {
    const zone: Zone = e.clientX < window.innerWidth * 0.48 ? 'left' : 'right';
    if (activeZone.current[zone] !== null) return;
    activeZone.current[zone] = e.pointerId;
    ptrs.current.set(e.pointerId, { id: e.pointerId, zone, ox: e.clientX, oy: e.clientY });
    layer.current?.setPointerCapture(e.pointerId);
    show(zone, e.clientX, e.clientY);
  };

  const onMove = (e: React.PointerEvent) => {
    const p = ptrs.current.get(e.pointerId);
    if (!p) return;
    let dx = e.clientX - p.ox, dy = e.clientY - p.oy;
    const d = Math.hypot(dx, dy);
    const clamped = Math.min(d, R);
    const nx = d > 0 ? dx / d * clamped : 0;
    const ny = d > 0 ? dy / d * clamped : 0;
    const knob = p.zone === 'left' ? leftKnob.current : rightKnob.current;
    if (knob) knob.style.transform = `translate3d(${nx}px,${ny}px,0)`;
    const g = gameRef.current;
    if (!g) return;
    if (p.zone === 'left') {
      if (d < DEAD) g.setMove(0, 0);
      else g.setMove(dx / d, dy / d);
    } else {
      if (d < DEAD) g.setTouchAim(null, null);
      else g.setTouchAim(dx / d, dy / d);
    }
  };

  const onUp = (e: React.PointerEvent) => {
    const p = ptrs.current.get(e.pointerId);
    if (!p) return;
    ptrs.current.delete(e.pointerId);
    activeZone.current[p.zone] = null;
    hide(p.zone);
    const g = gameRef.current;
    if (!g) return;
    if (p.zone === 'left') g.setMove(0, 0);
    else g.setTouchAim(null, null);
  };

  const stick = (baseRef: React.RefObject<HTMLDivElement | null>, knobRef: React.RefObject<HTMLDivElement | null>, color: string, label: string) => (
    <div
      ref={baseRef}
      className="absolute left-0 top-0 pointer-events-none opacity-0 transition-opacity duration-100"
      style={{ width: 128, height: 128 }}
    >
      <div
        className="absolute inset-4 rounded-full"
        style={{
          border: `2px solid ${color}55`,
          background: `radial-gradient(circle, ${color}14, rgba(0,0,0,.25))`,
        }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[10px] tracking-[.3em] font-bold" style={{ color: `${color}88` }}>{label}</span>
      </div>
      <div
        ref={knobRef}
        className="absolute rounded-full"
        style={{
          left: 64 - 26, top: 64 - 26, width: 52, height: 52,
          background: `radial-gradient(circle at 35% 30%, #ffffff55, ${color}cc 60%, ${color}55)`,
          border: `2px solid ${color}`,
          boxShadow: `0 0 18px ${color}66`,
        }}
      />
    </div>
  );

  return (
    <div
      ref={layer}
      className="absolute inset-0 z-10"
      style={{ touchAction: 'none' }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {/* ghost hints */}
      <div className="absolute rounded-full pointer-events-none"
        style={{ left: '5%', bottom: '8%', width: 96, height: 96, border: '2px solid rgba(157,255,79,.14)', background: 'radial-gradient(circle, rgba(157,255,79,.05), transparent 70%)' }} />
      <div className="absolute rounded-full pointer-events-none"
        style={{ right: '5%', bottom: '8%', width: 96, height: 96, border: '2px solid rgba(255,177,61,.14)', background: 'radial-gradient(circle, rgba(255,177,61,.05), transparent 70%)' }} />
      {stick(left, leftKnob, '#9dff4f', 'MOVE')}
      {stick(right, rightKnob, '#ffb13d', 'FIRE')}
    </div>
  );
}
