import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, useInView, useScroll, useSpring, useTransform, type MotionValue } from 'motion/react';
import { useMotionEnabled } from './prefs';

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

