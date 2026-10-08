import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { GameState, HeroEngine } from './particleHero';
import { canUseWebGL, useMotionEnabled } from './prefs';
import { startRun } from './arcadeApi';
import { BoardPanel, ScoreSubmit, TopChallenge } from './Leaderboard';

const initial: GameState = { mode: 'idle', score: 0, best: 0, wave: 0, integrity: 100, combo: 0, banner: '' };

// Full-screen particle hero with the Debug Defender game. Three.js loads as a
// separate chunk after first paint, so the copy never waits for it.
export function HeroStage({ children }: { children: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const engineRef = useRef<HeroEngine | null>(null);
  const motion = useMotionEnabled();
  const [game, setGame] = useState<GameState>(initial);
  const [ready, setReady] = useState<'loading' | 'ready' | 'fallback'>('loading');
  const [runId, setRunId] = useState<string | null>(null);
  const [boardOpen, setBoardOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!canUseWebGL()) { setReady('fallback'); return; }
    Promise.all([import('./particleHero'), document.fonts?.load('800 120px "Bricolage Grotesque"').catch(() => undefined)]).then(([{ createParticleHero }]) => {
      if (cancelled || !canvasRef.current || !overlayRef.current) return;
      try {
        engineRef.current = createParticleHero(canvasRef.current, { animate: motion, overlay: overlayRef.current, onState: setGame });
        setReady('ready');
      } catch { setReady('fallback'); }
    }).catch(() => !cancelled && setReady('fallback'));
    return () => { cancelled = true; engineRef.current?.dispose(); engineRef.current = null; };
  }, [motion]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new IntersectionObserver(([entry]) => engineRef.current?.setRunning(entry.isIntersecting), { threshold: .02 });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [ready]);

  const playing = game.mode === 'playing';
  const start = () => {
    engineRef.current?.start();
    // The server times each run so the leaderboard can reject impossible scores.
    // If it cannot be reached, the game still plays and the score stays on this device.
    setRunId(null);
    startRun().then(setRunId).catch(() => setRunId(null));
    // Bring the whole arena into view below the floating header.
    const stage = stageRef.current;
    if (stage) window.scrollTo({ top: Math.max(0, stage.getBoundingClientRect().top + window.scrollY - 96), behavior: 'smooth' });
  };

  return <section ref={stageRef} className={`bc-hero-stage hero-${ready} hero-mode-${game.mode}`} aria-labelledby="home-title">
    <canvas ref={canvasRef} className="hero-canvas" aria-hidden="true" />
    <div ref={overlayRef} className="hero-overlay" aria-hidden="true" />
    <div className="hero-vignette" aria-hidden="true" />
    <div className="bc-hero-copy">{children}</div>

    {ready === 'ready' && motion && game.mode === 'idle' && <div className="game-launch">
      <button type="button" className="game-play" onClick={start}><span className="game-play-icon" aria-hidden="true">▶</span><span><strong>Play Debug Defender</strong><small>Bugs are coming for your code. Zap them.</small></span></button>
      <div className="game-meta"><TopChallenge />{game.best > 0 && <span className="game-best">YOUR BEST {game.best}</span>}<button type="button" className="game-board-open" onClick={() => setBoardOpen(true)}>View leaderboard</button></div>
      <span className="hero-hint">Move your cursor through the words. Click to blast them.</span>
    </div>}

    {playing && <div className="game-hud" role="group" aria-label="Debug Defender">
      <div className="hud-cell"><span>SCORE</span><strong aria-live="polite">{game.score}</strong></div>
      <div className="hud-cell"><span>WAVE</span><strong>{game.wave}</strong></div>
      <div className="hud-cell hud-integrity"><span>CODE INTEGRITY {game.integrity}%</span><i style={{ transform: `scaleX(${game.integrity / 100})` }} className={game.integrity < 35 ? 'low' : ''} /></div>
      {game.combo > 1 && <div className="hud-combo" key={game.combo}>×{game.combo} COMBO</div>}
      <div className="hud-buttons"><button type="button" onClick={() => engineRef.current?.zapNearest()}>Zap nearest bug</button><button type="button" onClick={() => engineRef.current?.quit()}>Quit</button></div>
    </div>}
    {playing && game.banner && <p className="game-banner" key={game.banner}>{game.banner}</p>}
    {playing && game.wave === 1 && !game.score && <p className="game-tip">Click or tap the bugs before they reach your code.</p>}

    {game.mode === 'over' && <div className="game-over" role="dialog" aria-label="Game over">
      <p className="eyebrow">YOUR CODE WAS CORRUPTED</p>
      <h2>Score {game.score}</h2>
      <p>{game.score >= game.best && game.score > 0 ? 'New personal best. ' : `Best: ${game.best}. `}You reached wave {game.wave}. Real bugs are easier when you understand the code underneath.</p>
      <ScoreSubmit key={runId ?? 'offline'} runId={runId} score={game.score} wave={game.wave} />
      <div className="game-over-actions"><button type="button" className="button button-glow" onClick={start}>Play again <span aria-hidden="true">↻</span></button><a href="#/courses" className="button button-ghost">Learn to fix real bugs <span aria-hidden="true">↗</span></a><button type="button" className="text-link" onClick={() => engineRef.current?.quit()}>Back to the homepage</button></div>
    </div>}
    {boardOpen && <BoardPanel onClose={() => setBoardOpen(false)} />}
    {ready === 'ready' && !motion && <p className="hero-paused">Motion is off. Turn it on in the header to play Debug Defender.</p>}
    <span className="scroll-cue" aria-hidden="true"><span />SCROLL</span>
  </section>;
}
