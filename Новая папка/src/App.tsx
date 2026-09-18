import { useEffect, useRef, useState } from 'react';
import { Game } from './game/Game';
import type { HudSnapshot } from './game/Game';
import { initAudio, setMuted as setAudioMuted, isMuted, sfx, startAmbience } from './game/audio';
import { addScore, getScores, updateScore } from './game/storage';
import type { ScoreRow } from './game/storage';
import { onSpritesReady } from './game/sprites';
import HUD from './components/HUD';
import TouchControls from './components/TouchControls';
import {
  StartScreen, PauseOverlay, LevelClear, GameOver, Victory, Banner,
} from './components/Screens';
import type { ShopItem, Stats, WeaponItem } from './components/Screens';

type Screen = 'start' | 'playing' | 'paused' | 'levelclear' | 'gameover' | 'victory';
type BannerData = { title: string; sub: string; tone: 'acid' | 'amber' | 'red'; key: number };

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const bannerTimer = useRef<number | null>(null);

  const [screen, setScreen] = useState<Screen>('start');
  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [shop, setShop] = useState<ShopItem[]>([]);
  const [weapons, setWeapons] = useState<WeaponItem[]>([]);
  const [scores, setScores] = useState<ScoreRow[]>(() => getScores());
  const [stats, setStats] = useState<Stats | null>(null);
  const [clearLevel, setClearLevel] = useState(1);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [name, setName] = useState('HERO');
  const [banner, setBanner] = useState<BannerData | null>(null);
  const [muted, setMuted] = useState(isMuted());
  const [hint, setHint] = useState(false);
  const hintTimer = useRef<number | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [gunArt, setGunArt] = useState<Record<string, string | null>>({});
  useEffect(() => onSpritesReady((p) => {
    setAvatar(p.hero.portrait);
    setGunArt({ ...p.guns.urls });
  }), []);
  const [isTouch] = useState(
    () => typeof window !== 'undefined' &&
      (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window),
  );

  useEffect(() => {
    if (!canvasRef.current) return;
    const game = new Game(canvasRef.current, (e) => {
      switch (e.type) {
        case 'hud':
          setHud(e.hud);
          break;
        case 'banner': {
          setBanner({ title: e.title, sub: e.sub, tone: e.tone, key: Date.now() });
          if (bannerTimer.current) window.clearTimeout(bannerTimer.current);
          bannerTimer.current = window.setTimeout(() => setBanner(null), 2150);
          break;
        }
        case 'paused':
          if (e.paused) { setShop(game.getShop()); setWeapons(game.getWeapons()); setScreen('paused'); }
          else setScreen('playing');
          break;
        case 'levelclear':
          setClearLevel(e.level + 1);
          setStats(game.getStats());
          setShop(game.getShop());
          setWeapons(game.getWeapons());
          setScreen('levelclear');
          break;
        case 'victory': {
          const s = game.getStats();
          setStats(s);
          const row = addScore({ name: 'HERO', score: s.score, level: s.level, kills: s.kills });
          setPendingId(row.id); setName('HERO'); setScores(getScores());
          setScreen('victory');
          break;
        }
        case 'gameover': {
          const s = game.getStats();
          setStats(s);
          const row = addScore({ name: 'HERO', score: s.score, level: s.level, kills: s.kills });
          setPendingId(row.id); setName('HERO'); setScores(getScores());
          setScreen('gameover');
          break;
        }
      }
    });
    gameRef.current = game;

    const onVis = () => {
      if (document.hidden) game.setPaused(true);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      game.destroy();
      gameRef.current = null;
    };
  }, []);

  const startGame = () => {
    initAudio();
    startAmbience();
    sfx.ui();
    gameRef.current?.newGame();
    setScreen('playing');
    setHint(true);
    if (hintTimer.current) window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHint(false), 7000);
  };

  const goMenu = () => {
    sfx.ui();
    gameRef.current?.enterAmbient();
    setScreen('start');
    setScores(getScores());
  };

  const resume = () => { sfx.ui(); gameRef.current?.setPaused(false); };
  const pause = () => { sfx.ui(); gameRef.current?.togglePause(); };

  const buy = (id: ShopItem['id']) => {
    const g = gameRef.current;
    if (!g) return;
    g.buyUpgrade(id);
    setShop(g.getShop());
    setWeapons(g.getWeapons());
    setStats(g.getStats());
  };

  const pickWeapon = (id: WeaponItem['id']) => {
    const g = gameRef.current;
    if (!g) return;
    g.buyWeapon(id);
    setShop(g.getShop());
    setWeapons(g.getWeapons());
    setStats(g.getStats());
  };

  const cycleWeapon = (dir: number) => {
    const g = gameRef.current;
    if (!g) return;
    g.cycleWeapon(dir);
  };

  const reload = () => { gameRef.current?.reload(); };

  const continueNext = () => {
    sfx.ui();
    gameRef.current?.continueAfterShop();
    setScreen('playing');
  };

  const rename = (n: string) => {
    setName(n);
    if (pendingId) {
      updateScore(pendingId, { name: n || 'HERO' });
      setScores(getScores());
    }
  };

  const toggleMute = () => {
    initAudio();
    startAmbience();
    const m = !muted;
    setAudioMuted(m);
    setMuted(m);
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#04070a] select-none">
      <div className="absolute inset-0">
        <canvas ref={canvasRef} className="w-full h-full block cursor-crosshair" />
      </div>

      {screen === 'playing' && hint && (
        <div className="absolute inset-x-0 bottom-[14%] z-20 flex justify-center pointer-events-none px-4">
          <div className="hud-chip rounded-full px-4 py-2 text-[11px] sm:text-xs font-bold tracking-widest text-[#cfe8c8] anim-pop text-center"
            style={{ animation: 'fadeUp .3s both, riseFade 7s ease forwards' }}>
            {isTouch
              ? 'LEFT STICK MOVE · RIGHT STICK FIRE · TAP THE GUN PANEL TO SWAP · KILL THE HIVE'
              : 'WASD MOVE · MOUSE AIM · HOLD CLICK OR SPACE TO FIRE · R RELOAD · 1-6 SWAP GUN · KILL THE HIVE'}
          </div>
        </div>
      )}

      {screen === 'playing' && hud && (
        <HUD hud={hud} muted={muted} onPause={pause} onMute={toggleMute}
          onCycleWeapon={cycleWeapon} onReload={reload} isTouch={isTouch} avatar={avatar} gunArt={gunArt} />
      )}
      {isTouch && screen === 'playing' && <TouchControls gameRef={gameRef} />}

      <Banner banner={banner} />

      {screen === 'start' && (
        <StartScreen scores={scores} isTouch={isTouch} muted={muted} onStart={startGame} onMute={toggleMute} />
      )}
      {screen === 'paused' && (
        <PauseOverlay
          shop={shop} weapons={weapons} gunArt={gunArt} coins={hud?.coins ?? 0} muted={muted}
          onResume={resume} onRestart={startGame} onMenu={goMenu}
          onBuy={buy} onWeapon={pickWeapon} onMute={toggleMute}
        />
      )}
      {screen === 'levelclear' && stats && (
        <LevelClear
          level={clearLevel} stats={stats} shop={shop} weapons={weapons} gunArt={gunArt}
          onBuy={buy} onWeapon={pickWeapon} onContinue={continueNext}
        />
      )}
      {screen === 'gameover' && stats && (
        <GameOver
          stats={stats} rows={scores} highlightId={pendingId} name={name}
          onName={rename} onRetry={startGame} onMenu={goMenu}
        />
      )}
      {screen === 'victory' && stats && (
        <Victory
          stats={stats} rows={scores} highlightId={pendingId} name={name}
          onName={rename} onRetry={startGame} onMenu={goMenu}
        />
      )}
    </div>
  );
}
