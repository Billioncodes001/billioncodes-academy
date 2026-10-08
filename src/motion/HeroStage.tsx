import { useEffect, useRef, useState } from 'react';
import type { HeroEngine, HeroStats } from './heroEngine';
import { canUseWebGL, useMotionEnabled } from './prefs';

const messages = ['Tap or click a glowing bug to fix it.', 'Nice fix. Keep going.', 'Combo! Bugs fear you.', 'Level up. They move faster now.'];

// The homepage's playable 3D scene. Three.js loads as a separate chunk after
// first paint, so the headline and buttons never wait for it.
export function HeroStage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<HeroEngine | null>(null);
  const motion = useMotionEnabled();
  const [stats, setStats] = useState<HeroStats>({ fixed: 0, level: 1, combo: 0 });
  const [state, setState] = useState<'loading' | 'ready' | 'fallback'>('loading');
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!canUseWebGL()) { setState('fallback'); return; }
    import('./heroEngine').then(({ createHeroEngine }) => {
      if (cancelled || !canvasRef.current) return;
      try {
        engineRef.current = createHeroEngine(canvasRef.current, { animate: motion, onStats: setStats, onHover: setHovering });
        setState('ready');
      } catch { setState('fallback'); }
    }).catch(() => !cancelled && setState('fallback'));
    return () => { cancelled = true; engineRef.current?.dispose(); engineRef.current = null; };
  }, [motion]);

  // Stop rendering while the hero is off screen.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new IntersectionObserver(([entry]) => engineRef.current?.setRunning(entry.isIntersecting), { threshold: .05 });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [state]);

  const message = stats.fixed === 0 ? messages[0] : stats.fixed % 5 === 0 ? messages[3] : stats.combo > 1 ? messages[2] : messages[1];

  return <div className={`hero-stage hero-stage-${state}${hovering ? ' is-targeting' : ''}`} ref={stageRef}>
    <canvas ref={canvasRef} aria-hidden="true" />
    <div className="hero-stage-veil" aria-hidden="true" />
    {state === 'ready' && motion && <div className="hero-hud">
      <div className="hud-title"><span className="hud-dot" />BUG HUNT · LIVE</div>
      <div className="hud-stats" aria-live="polite">
        <div><span>BUGS FIXED</span><strong>{String(stats.fixed).padStart(2, '0')}</strong></div>
        <div><span>LEVEL</span><strong>{String(stats.level).padStart(2, '0')}</strong></div>
        <div><span>COMBO</span><strong>×{Math.max(stats.combo, 1)}</strong></div>
      </div>
      <p className="hud-message">{message}</p>
      <div className="hud-actions">
        <button type="button" onClick={() => engineRef.current?.squashNearest()}>Fix a bug for me</button>
        {stats.fixed > 0 && <button type="button" onClick={() => engineRef.current?.reset()}>Restart</button>}
      </div>
    </div>}
    {state === 'ready' && !motion && <p className="hero-hud hud-paused">Motion is paused. Turn motion on in the header to play Bug Hunt.</p>}
  </div>;
}
