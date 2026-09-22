type P = { size?: number; className?: string; style?: React.CSSProperties };

const S = ({ size = 20, className, style, children }: P & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    {children}
  </svg>
);

export const IconCoin = (p: P) => (
  <S {...p}><circle cx="12" cy="12" r="8.5" fill="rgba(255,210,74,.2)" /><path d="M12 7.5v9M9.7 9.8h3.4a1.9 1.9 0 010 3.8H10a1.9 1.9 0 000 3.8h4.3" /></S>
);
export const IconHeart = (p: P) => (
  <S {...p}><path d="M12 20.5C12 20.5 3.5 15.4 3.5 9.7 3.5 7 5.6 5 8 5c1.7 0 3.2.9 4 2.3C12.8 5.9 14.3 5 16 5c2.4 0 4.5 2 4.5 4.7 0 5.7-8.5 10.8-8.5 10.8z" fill="currentColor" stroke="none" /></S>
);
export const IconBunker = (p: P) => (
  <S {...p}><path d="M12 3l8 3v6c0 4.6-3.4 7.7-8 9-4.6-1.3-8-4.4-8-9V6z" /><path d="M9.5 9.5h5v5h-5z" fill="currentColor" stroke="none" /></S>
);
export const IconLair = (p: P) => (
  <S {...p}><circle cx="12" cy="12" r="8.5" /><circle cx="9.5" cy="11" r="1.4" fill="currentColor" stroke="none" /><circle cx="14.5" cy="11" r="1.4" fill="currentColor" stroke="none" /><path d="M9.5 15.5h5M12 15.5v2" /></S>
);
export const IconPause = (p: P) => (
  <S {...p}><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" /><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" /></S>
);
export const IconPlay = (p: P) => (
  <S {...p}><path d="M7 5l12 7-12 7z" fill="currentColor" stroke="none" /></S>
);
export const IconSoundOn = (p: P) => (
  <S {...p}><path d="M4 9.5v5h4l5 4V5.5L8 9.5z" fill="currentColor" stroke="none" /><path d="M16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11" /></S>
);
export const IconSoundOff = (p: P) => (
  <S {...p}><path d="M4 9.5v5h4l5 4V5.5L8 9.5z" fill="currentColor" stroke="none" /><path d="M16 9.5l5 5M21 9.5l-5 5" /></S>
);
export const IconRestart = (p: P) => (
  <S {...p}><path d="M20 12a8 8 0 11-2.3-5.6" /><path d="M20 3v4.5h-4.5" fill="currentColor" stroke="none" /></S>
);
export const IconHome = (p: P) => (
  <S {...p}><path d="M4 11l8-7 8 7" /><path d="M6 9.5V20h12V9.5" /><path d="M10 20v-5h4v5" /></S>
);
export const IconWrench = (p: P) => (
  <S {...p}><path d="M14.7 6.3a3.8 3.8 0 00-5 4.4L4 16.4 7.6 20l5.7-5.7a3.8 3.8 0 004.4-5l-2.2 2.2-2.4-.6-.6-2.4z" /></S>
);
export const IconShield = (p: P) => (
  <S {...p}><path d="M12 3l8 3v6c0 4.6-3.4 7.7-8 9-4.6-1.3-8-4.4-8-9V6z" /><path d="M9 12l2 2 4-4.5" /></S>
);
export const IconBullet = (p: P) => (
  <S {...p}><path d="M12 3v13" /><path d="M9 16h6l-1.2 4h-3.6z" fill="currentColor" stroke="none" /><path d="M12 3c1.8 1 1.8 2.6 1.8 4h-3.6C10.2 5.6 10.2 4 12 3z" fill="currentColor" stroke="none" /></S>
);
export const IconGauge = (p: P) => (
  <S {...p}><path d="M4 15a8 8 0 1116 0" /><path d="M12 15l4-4.5" /><circle cx="12" cy="15" r="1.6" fill="currentColor" stroke="none" /></S>
);
export const IconSpread = (p: P) => (
  <S {...p}><path d="M12 12V4M12 12L5 6M12 12l7-6M12 12v8" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /></S>
);
export const IconTurret = (p: P) => (
  <S {...p}>
    {/* Tripod legs */}
    <path d="M12 11l-7 10M12 11l7 10M12 11v10" strokeWidth={2.2} />
    {/* Tripod brace */}
    <path d="M8.5 16h7" strokeWidth={1.8} />
    {/* Swivel mount / gun body */}
    <rect x="7" y="8" width="9" height="5" rx="1.5" fill="currentColor" />
    {/* Heavy machine gun barrel with muzzle brake */}
    <path d="M16 10.5h6M21 9v3" strokeWidth={2.2} />
    {/* Ammo can on side */}
    <rect x="5.5" y="11" width="4" height="4" rx="0.5" fill="currentColor" stroke="none" />
  </S>
);
export const IconBoots = (p: P) => (
  <S {...p}><path d="M8 4v9l5 2v3h4.5a2 2 0 002-2v-2.5L12 11V4z" /><path d="M8 4H6.5v9" /></S>
);
export const IconPistol = (p: P) => (
  <S {...p}><path d="M4 8h14v3h-4l-1.5 5h-3l1-5H8a4 4 0 01-4-3z" /><path d="M4 8V6h11" /></S>
);
export const IconSmg = (p: P) => (
  <S {...p}><path d="M3 9h17v3h-3l-1 4h-3l.6-4H9l-1 6H5l1-6H3z" /><path d="M6 9V6h5v3" /></S>
);
export const IconShotgun = (p: P) => (
  <S {...p}><path d="M2 10h20M4 10l2 6h3l-1.5-6M14 10l1.5 4h3" /><path d="M2 8.5h6" /></S>
);
export const IconRifle = (p: P) => (
  <S {...p}><path d="M2 11h18l2-2M5 11l1.5 6h3L8.5 11M13 11l1 3" /><path d="M7 11V8h6v3" /></S>
);
export const IconMinigun = (p: P) => (
  <S {...p}><rect x="3" y="9" width="14" height="6" rx="2" /><path d="M17 10.5h4M17 13.5h4M7 9V6h5" /></S>
);
export const IconRailgun = (p: P) => (
  <S {...p}><path d="M2 12h14l4-3M5 12l1.5 6h3L8 12M12 12l1 3" /><path d="M6 8.5l4-4M9 12l6-6" /></S>
);

export function weaponIcon(name: string, size = 20) {
  const map: Record<string, (p: P) => React.ReactElement> = {
    pistol: IconPistol, smg: IconSmg, shotgun: IconShotgun,
    rifle: IconRifle, minigun: IconMinigun, railgun: IconRailgun,
  };
  const C = map[name] ?? IconPistol;
  return <C size={size} />;
}
export const IconTrophy = (p: P) => (
  <S {...p}><path d="M7 4h10v4a5 5 0 01-10 0z" /><path d="M7 5H4.5a2.5 2.5 0 003 3M17 5h2.5a2.5 2.5 0 01-3 3M12 13v4M8.5 20h7M10 17h4v3h-4z" /></S>
);
export const IconSkull = (p: P) => (
  <S {...p}><path d="M12 3.5a8 8 0 00-8 8c0 2.6 1.2 4.4 3 5.5V20h10v-3c1.8-1.1 3-2.9 3-5.5a8 8 0 00-8-8z" /><circle cx="9" cy="11.5" r="1.6" fill="currentColor" stroke="none" /><circle cx="15" cy="11.5" r="1.6" fill="currentColor" stroke="none" /></S>
);

export const IconBolt = (p: P) => (
  <S {...p}><path d="M13 2L4.5 13.5H11l-1 8.5 8.5-11.5H12z" fill="currentColor" stroke="none" /></S>
);
export const IconWire = (p: P) => (
  <S {...p}><path d="M3 12c2-4 4 4 6 0s4 4 6 0 4 4 6 0" /><path d="M6 8l2 2M12 8l2 2M18 8l2 2M6 16l2-2M12 16l2-2M18 16l2-2" /></S>
);
export const IconCross = (p: P) => (
  <S {...p}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M12 8v8M8 12h8" strokeWidth={3} /></S>
);
export const IconReload = (p: P) => (
  <S {...p}><path d="M20 12a8 8 0 11-2.3-5.6" /><path d="M20 3v4.5h-4.5" fill="currentColor" stroke="none" /><rect x="10" y="10" width="4" height="6" rx="1" fill="currentColor" stroke="none" /></S>
);

export function iconByName(name: string, size = 26) {
  const map: Record<string, (p: P) => React.ReactElement> = {
    wrench: IconWrench, shield: IconShield, bullet: IconBullet, gauge: IconGauge,
    spread: IconSpread, turret: IconTurret, boots: IconBoots,
    bolt: IconBolt, wire: IconWire, cross: IconCross,
  };
  const C = map[name] ?? IconShield;
  return <C size={size} />;
}
