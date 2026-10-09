import { useEffect, useRef, useState } from 'react';
import type Lenis from 'lenis';
import { setMotion, useMotionEnabled } from './prefs';

// Motion helpers used on every page. They deliberately avoid the Motion animation library,
// which only the homepage needs, so lesson and practice pages stay light on mobile data.

let lenis: Lenis | null = null;
export function scrollToTop() { if (lenis) lenis.scrollTo(0, { immediate: true, force: true }); else window.scrollTo(0, 0); }

// Inertia scrolling for wheel and trackpad. Native touch scrolling is left alone.
// Lenis loads after first paint, so it never delays the page.
export function SmoothScroll() {
  const enabled = useMotionEnabled();
  useEffect(() => {
    if (!enabled) return;
    let frame = 0, cancelled = false;
    import('lenis').then(({ default: Lenis }) => {
      if (cancelled) return;
      lenis = new Lenis({ duration: 1.1, smoothWheel: true, prevent: node => Boolean(node.closest?.('textarea, pre, select, [data-lenis-prevent]')) });
      const raf = (time: number) => { lenis?.raf(time); frame = requestAnimationFrame(raf); };
      frame = requestAnimationFrame(raf);
    }).catch(() => { /* Native scrolling is a fine fallback. */ });
    return () => { cancelled = true; cancelAnimationFrame(frame); lenis?.destroy(); lenis = null; };
  }, [enabled]);
  return null;
}

// Reading-progress bar along the top edge, eased towards the real scroll position.
export function ScrollProgress() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let shown = 0, frame = 0;
    const target = () => { const max = document.documentElement.scrollHeight - window.innerHeight; return max > 0 ? Math.min(1, window.scrollY / max) : 0; };
    const tick = () => {
      const goal = target();
      shown += (goal - shown) * .2;
      ref.current?.style.setProperty('transform', `scaleX(${shown})`);
      frame = Math.abs(goal - shown) > .001 ? requestAnimationFrame(tick) : 0;
    };
    const wake = () => { if (!frame) frame = requestAnimationFrame(tick); };
    wake();
    window.addEventListener('scroll', wake, { passive: true });
    window.addEventListener('resize', wake);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', wake); window.removeEventListener('resize', wake); };
  }, []);
  return <div className="scroll-progress" ref={ref} aria-hidden="true" />;
}

export function MotionToggle() {
  const enabled = useMotionEnabled();
  return <button type="button" className="motion-toggle" aria-pressed={enabled} onClick={() => setMotion(!enabled)}>
    <span className="motion-toggle-track" aria-hidden="true"><span /></span>{enabled ? 'Motion on' : 'Motion off'}
  </button>;
}

// Cursor spotlight and gentle 3D tilt for any element with data-tilt, site-wide.
export function useSpotlightTilt(route: string) {
  const enabled = useMotionEnabled();
  useEffect(() => {
    if (!enabled || !window.matchMedia('(pointer: fine)').matches) return;
    let active: HTMLElement | null = null;
    const move = (event: PointerEvent) => {
      const card = (event.target as HTMLElement | null)?.closest?.<HTMLElement>('[data-tilt]') ?? null;
      if (active && active !== card) { active.style.removeProperty('transform'); active = null; }
      if (!card) return;
      active = card;
      const rect = card.getBoundingClientRect(), px = (event.clientX - rect.left) / rect.width, py = (event.clientY - rect.top) / rect.height;
      card.style.setProperty('--spot-x', `${px * 100}%`);
      card.style.setProperty('--spot-y', `${py * 100}%`);
      if (card.dataset.tilt !== 'flat') card.style.setProperty('transform', `perspective(900px) rotateX(${(.5 - py) * 7}deg) rotateY(${(px - .5) * 9}deg) translateY(-4px)`);
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => { window.removeEventListener('pointermove', move); active?.style.removeProperty('transform'); };
  }, [enabled, route]);
}

// Reveals the main building blocks of every page as they enter the viewport,
// without each page needing its own animation code.
const REVEAL_SELECTOR = ['.page-heading', '.reader-heading', '.form-intro > *', '.platform-panel', '.portal-card', '.course-card', '.built-in-primer', '.service-list > div', '.expectation-list > div', '.policy-copy section', '.about-layout > *', '.contact-panel', '.empty-state', '.catalog-heading', '.lab-card', '.workspace-grid > *', '.studio-frame > *', '.account-intro', '.enquiry-form', '.form-card'].join(',');

export function useAutoReveal(route: string) {
  const enabled = useMotionEnabled();
  useEffect(() => {
    const main = document.getElementById('main');
    if (!main || !enabled) { document.querySelectorAll('.auto-reveal').forEach(el => el.classList.add('is-revealed')); return; }
    // Plain geometry instead of IntersectionObserver: Chrome measures a clipped
    // element by its clipped box, so a tall unrevealed form would never "intersect".
    let pending: HTMLElement[] = [];
    let frame = 0;
    const check = () => {
      frame = 0;
      const bottomEdge = window.innerHeight * .94;
      pending = pending.filter(el => {
        const rect = el.getBoundingClientRect();
        if (!el.isConnected) return false;
        if (rect.top < bottomEdge && rect.bottom > 0) { el.classList.add('is-revealed'); return false; }
        return true;
      });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(check); };
    const seen = new WeakSet<Element>();
    const scan = () => {
      main.querySelectorAll<HTMLElement>(REVEAL_SELECTOR).forEach((el, index) => {
        if (seen.has(el) || el.classList.contains('is-revealed') || el.closest('.bc-home')) return;
        seen.add(el);
        el.classList.add('auto-reveal');
        el.style.setProperty('--reveal-delay', `${Math.min(index % 6, 5) * 70}ms`);
        pending.push(el);
      });
      schedule();
    };
    scan();
    const mutations = new MutationObserver(scan);
    mutations.observe(main, { childList: true, subtree: true });
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    // The next run picks up anything this one tagged but never revealed.
    return () => { cancelAnimationFrame(frame); mutations.disconnect(); window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); };
  }, [route, enabled]);
}

// A glowing cursor: a precise dot plus a lagging ring that swells over anything clickable.
export function Cursor() {
  const dot = useRef<HTMLDivElement>(null), ring = useRef<HTMLDivElement>(null);
  const enabled = useMotionEnabled();
  useEffect(() => {
    if (!enabled || !window.matchMedia('(pointer: fine)').matches) return;
    document.documentElement.classList.add('has-cursor');
    let x = -100, y = -100, rx = -100, ry = -100, frame = 0;
    const move = (event: PointerEvent) => {
      x = event.clientX; y = event.clientY;
      const target = event.target as HTMLElement | null;
      ring.current?.classList.toggle('is-hover', Boolean(target?.closest?.('a, button, input, select, textarea, label, [data-tilt]')));
      ring.current?.classList.toggle('is-game', Boolean(target?.closest?.('.hero-mode-playing')));
    };
    const down = () => ring.current?.classList.add('is-down');
    const up = () => ring.current?.classList.remove('is-down');
    const tick = () => {
      rx += (x - rx) * .18; ry += (y - ry) * .18;
      dot.current?.style.setProperty('transform', `translate(${x}px, ${y}px)`);
      ring.current?.style.setProperty('transform', `translate(${rx}px, ${ry}px)`);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerdown', down); window.addEventListener('pointerup', up);
    return () => { cancelAnimationFrame(frame); document.documentElement.classList.remove('has-cursor'); window.removeEventListener('pointermove', move); window.removeEventListener('pointerdown', down); window.removeEventListener('pointerup', up); };
  }, [enabled]);
  if (!enabled) return null;
  return <><div className="cursor-ring" ref={ring} aria-hidden="true"><span /></div><div className="cursor-dot" ref={dot} aria-hidden="true" /></>;
}

// A blue panel sweeps across the screen whenever the route changes.
export function RouteCurtain({ route }: { route: string }) {
  const enabled = useMotionEnabled();
  const first = useRef(true);
  const [run, setRun] = useState(0);
  useEffect(() => { if (first.current) { first.current = false; return; } setRun(value => value + 1); }, [route]);
  if (!enabled || !run) return null;
  return <div className="route-curtain" key={run} aria-hidden="true"><span className="curtain-mark">&lt;/&gt;</span></div>;
}
