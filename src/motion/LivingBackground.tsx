import { useEffect, useRef } from 'react';
import { simulations, type Pointer, type Variant } from './simulations';
import { useMotionEnabled } from './prefs';

export function variantFor(route: string): Variant {
  if (route === '/' || route === '/courses' || route === '/course-library' || route === '/library' || route === '/resources' || route.startsWith('/course/') || route.startsWith('/learn/')) return 'constellation';
  if (route === '/practice' || route.startsWith('/practice/')) return 'tags';
  if (route === '/training' || route === '/training-dashboard' || route.startsWith('/apply/')) return 'orbits';
  if (route === '/services') return 'flow';
  if (route === '/about' || route === '/contact') return 'boids';
  return 'grid';
}

// A fixed canvas behind the whole page that runs the route's simulation.
// With motion off it paints a single still frame so the page still has texture.
export function LivingBackground({ route }: { route: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const motion = useMotionEnabled();
  const variant = variantFor(route);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const pointer: Pointer = { x: 0, y: 0, active: false, burst: [] };
    const sim = simulations[variant](pointer);
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let frame = 0, last = performance.now(), start = last;

    const resize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sim.resize(w, h);
      if (!motion) for (let i = 0; i < 90; i++) sim.step(ctx, 1, i / 60);
    };
    resize();
    if (!motion) return;

    const loop = (now: number) => {
      const dt = Math.min((now - last) / 16.67, 3);
      last = now;
      if (!document.hidden) sim.step(ctx, dt, (now - start) / 1000);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    const move = (event: PointerEvent) => { pointer.x = event.clientX; pointer.y = event.clientY; pointer.active = event.pointerType === 'mouse'; };
    const leave = () => { pointer.active = false; };
    const down = (event: PointerEvent) => pointer.burst.push({ x: event.clientX, y: event.clientY, t: (performance.now() - start) / 1000 });
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerdown', down, { passive: true });
    document.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', down);
      document.removeEventListener('pointerleave', leave);
    };
  }, [variant, motion]);

  return <div className="living-bg" data-variant={variant} aria-hidden="true"><canvas ref={canvasRef} /><span className="living-bg-glow" /></div>;
}
