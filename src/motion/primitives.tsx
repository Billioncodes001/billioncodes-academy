import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useInView, useScroll, useSpring, useTransform, type MotionValue } from 'motion/react';
import Lenis from 'lenis';
import { setMotion, useMotionEnabled } from './prefs';

let lenis: Lenis | null = null;
export function scrollToTop() { if (lenis) lenis.scrollTo(0, { immediate: true, force: true }); else window.scrollTo(0, 0); }

// Inertia scrolling for wheel and trackpad. Native touch scrolling is left alone.
export function SmoothScroll() {
  const enabled = useMotionEnabled();
  useEffect(() => {
    if (!enabled) return;
    lenis = new Lenis({ duration: 1.1, smoothWheel: true, prevent: node => Boolean(node.closest?.('textarea, pre, select, [data-lenis-prevent]')) });
    let frame = 0;
    const raf = (time: number) => { lenis?.raf(time); frame = requestAnimationFrame(raf); };
    frame = requestAnimationFrame(raf);
    return () => { cancelAnimationFrame(frame); lenis?.destroy(); lenis = null; };
  }, [enabled]);
  return null;
}

export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: .3 });
  return <motion.div className="scroll-progress" style={{ scaleX }} aria-hidden="true" />;
}

export function MotionToggle() {
  const enabled = useMotionEnabled();
  return <button type="button" className="motion-toggle" aria-pressed={enabled} onClick={() => setMotion(!enabled)}>
    <span className="motion-toggle-track" aria-hidden="true"><span /></span>{enabled ? 'Motion on' : 'Motion off'}
  </button>;
}

// Fades and lifts content into place once it scrolls into view.
export function Reveal({ children, delay = 0, y = 34, className, as = 'div' }: { children: ReactNode; delay?: number; y?: number; className?: string; as?: 'div' | 'li' | 'section' }) {
  const enabled = useMotionEnabled();
  const Tag = motion[as];
  if (!enabled) { const Plain = as; return <Plain className={className}>{children}</Plain>; }
  return <Tag className={className} initial={{ opacity: 0, y, filter: 'blur(8px)' }} whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)', transitionEnd: { filter: 'none' } }} viewport={{ once: true, margin: '0px 0px -8% 0px' }} transition={{ duration: .9, delay, ease: [.16, 1, .3, 1] }}>{children}</Tag>;
}

// Headline whose lines rise out of a mask, one after another. The real text
// stays in the heading so screen readers and search engines read it normally.
export function SplitLines({ lines, className, delay = 0 }: { lines: ReactNode[]; className?: string; delay?: number }) {
  const enabled = useMotionEnabled();
  // The unclipped mask is what gets watched; Chrome treats the masked inner line as off screen.
  if (!enabled) return <>{lines.map((line, index) => <span className={`split-line ${className ?? ''}`} key={index}><span className="split-line-inner">{line}</span></span>)}</>;
  return <>{lines.map((line, index) => <motion.span className={`split-line ${className ?? ''}`} key={index} initial="hidden" whileInView="shown" viewport={{ once: true }}>
    <motion.span className="split-line-inner" variants={{ hidden: { y: '110%', rotate: 3 }, shown: { y: '0%', rotate: 0 } }} transition={{ duration: 1.05, delay: delay + index * .12, ease: [.16, 1, .3, 1] }}>{line}</motion.span>
  </motion.span>)}</>;
}

// Buttons and links that lean toward the cursor.
export function Magnetic({ children, strength = .35 }: { children: ReactNode; strength?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const enabled = useMotionEnabled();
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || !window.matchMedia('(pointer: fine)').matches) return;
    const move = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      el.style.setProperty('transform', `translate(${(event.clientX - rect.left - rect.width / 2) * strength}px, ${(event.clientY - rect.top - rect.height / 2) * strength}px)`);
    };
    const leave = () => el.style.setProperty('transform', 'translate(0, 0)');
    el.addEventListener('pointermove', move); el.addEventListener('pointerleave', leave);
    return () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); };
  }, [enabled, strength]);
  return <span className="magnetic" ref={ref}>{children}</span>;
}

export function CountUp({ to, suffix = '' }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const enabled = useMotionEnabled();
  const [value, setValue] = useState(enabled ? 0 : to);
  useEffect(() => {
    if (!inView || !enabled) { setValue(to); return; }
    let frame = 0; const start = performance.now();
    const tick = (now: number) => { const k = Math.min(1, (now - start) / 1400); setValue(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1) frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, enabled, to]);
  return <span ref={ref}>{value}{suffix}</span>;
}

export function Marquee({ items, reverse = false }: { items: ReactNode[]; reverse?: boolean }) {
  const row = items.map((item, index) => <span className="marquee-item" key={index}>{item}<i aria-hidden="true">✦</i></span>);
  return <div className={`marquee${reverse ? ' marquee-reverse' : ''}`}><div className="marquee-track"><div className="marquee-row">{row}</div><div className="marquee-row" aria-hidden="true">{row}</div></div></div>;
}

// Giant words that slide sideways as the section scrolls past.
export function KineticWords({ words }: { words: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const enabled = useMotionEnabled();
  return <div className="kinetic" ref={ref}>{words.map((word, index) => <KineticRow key={word} word={word} index={index} progress={scrollYProgress} enabled={enabled} />)}</div>;
}

function KineticRow({ word, index, progress, enabled }: { word: string; index: number; progress: MotionValue<number>; enabled: boolean }) {
  const direction = index % 2 === 0 ? 1 : -1;
  const x = useTransform(progress, [0, 1], [`${-12 * direction}%`, `${12 * direction}%`]);
  return <motion.p className={`kinetic-row kinetic-row-${index}`} style={enabled ? { x } : undefined}><span>{word}</span><span aria-hidden="true" className="kinetic-ghost" data-word={word} /><span aria-hidden="true">{word}</span></motion.p>;
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

// Decodes text from random glyphs when it scrolls into view. Screen readers
// get the real text immediately; the scrambling layer is hidden from them.
const GLYPHS = '<>/{}[]=+*#$%01ABCDEFXYZ';
export function Scramble({ text, className, dot = false }: { text: string; className?: string; dot?: boolean }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const enabled = useMotionEnabled();
  const [shown, setShown] = useState(text);
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) { setShown(text); return; }
    let frame = 0;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const k = Math.min(1, (now - start) / 900), done = Math.floor(k * text.length);
        setShown(text.slice(0, done) + [...text.slice(done)].map(ch => ch === ' ' ? ' ' : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]).join(''));
        if (k < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    });
    observer.observe(el);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [text, enabled]);
  return <p className={className} ref={ref}>{dot && <span />}<b className="sr-only">{text}</b><b className="scramble" aria-hidden="true">{shown}</b></p>;
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
