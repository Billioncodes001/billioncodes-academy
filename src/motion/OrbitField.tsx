import { useEffect, useRef } from 'react';
import { finePointer, useMotionPaused, useReducedMotion } from './preferences';

// A small perspective renderer for the logo's orbital strokes. Rings are split
// into a back canvas (behind the artwork) and a front canvas (over it), so
// they appear to wrap around the photograph. No WebGL or 3D library is needed
// for a few hundred projected points, which keeps the homepage light.

type Ring = { radius: number; tiltX: number; tiltZ: number; color: string; speed: number; phase: number; glyphs: string[] };
type Scene = { centerX: number; centerY: number; scale: number; narrow?: { centerX: number; centerY: number; scale: number }; rings: Ring[]; stars: number; light: boolean; spin: number };

const deg = Math.PI / 180;
const scenes: Record<'hero' | 'finale', Scene> = {
  hero: {
    centerX: .52, centerY: .57, scale: .44, stars: 40, light: false, spin: .05,
    rings: [
      { radius: 1, tiltX: 73, tiltZ: -9, color: '#116aa4', speed: .11, phase: .6, glyphs: ['<h1>', '</>', '<p>'] },
      { radius: .88, tiltX: 68, tiltZ: 13, color: '#087f8c', speed: -.085, phase: 2.4, glyphs: ['{ }', '<a>'] },
      { radius: .7, tiltX: 77, tiltZ: -3, color: '#4c95c6', speed: .07, phase: 4.4, glyphs: ['JS'] },
    ],
  },
  finale: {
    centerX: .8, centerY: .55, scale: .33, narrow: { centerX: .56, centerY: .52, scale: .36 }, stars: 60, light: true, spin: .04,
    rings: [
      { radius: 1, tiltX: 76, tiltZ: -14, color: '#5fa8d3', speed: .08, phase: 1, glyphs: ['<main>', '</>'] },
      { radius: .8, tiltX: 70, tiltZ: 16, color: '#56c2cc', speed: -.06, phase: 3, glyphs: ['{ }'] },
      { radius: .6, tiltX: 82, tiltZ: -4, color: '#9fd0ef', speed: .05, phase: 5, glyphs: ['<p>'] },
    ],
  },
};

type Point = { x: number; y: number; z: number };

function rotate(point: Point, tiltX: number, tiltZ: number, yaw: number, pitch: number): Point {
  // Ring plane tilt (X, then Z), then the shared camera yaw (Y) and pitch (X).
  let { x, y, z } = point;
  let c = Math.cos(tiltX), s = Math.sin(tiltX);
  [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(tiltZ); s = Math.sin(tiltZ);
  [x, y] = [x * c - y * s, x * s + y * c];
  c = Math.cos(yaw); s = Math.sin(yaw);
  [x, z] = [x * c + z * s, -x * s + z * c];
  c = Math.cos(pitch); s = Math.sin(pitch);
  [y, z] = [y * c - z * s, y * s + z * c];
  return { x, y, z };
}

// Deterministic star positions on a sphere shell, so every render matches.
function starField(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const t = (index + .5) / count;
    const polar = Math.acos(1 - 2 * t);
    const azimuth = index * 2.399963;
    const radius = 1.05 + ((index * 37) % 11) / 30;
    return { x: Math.sin(polar) * Math.cos(azimuth) * radius, y: Math.cos(polar) * radius, z: Math.sin(polar) * Math.sin(azimuth) * radius, size: 1 + (index % 3) * .5 };
  });
}

export function OrbitField({ variant, spinTarget }: { variant: 'hero' | 'finale'; spinTarget?: React.RefObject<HTMLElement | null> }) {
  const backRef = useRef<HTMLCanvasElement>(null);
  const frontRef = useRef<HTMLCanvasElement>(null);
  const paused = useMotionPaused();
  const reduced = useReducedMotion();
  const still = paused || reduced;
  const timeRef = useRef(6);

  useEffect(() => {
    const back = backRef.current;
    if (!back) return;
    const front = frontRef.current;
    const scene = scenes[variant];
    const stars = starField(scene.stars);
    const layers = [back, front].filter((canvas): canvas is HTMLCanvasElement => Boolean(canvas)).map(canvas => ({ canvas, context: canvas.getContext('2d') }));
    if (layers.some(layer => !layer.context)) return;
    const host = back.parentElement;
    let width = 0, height = 0, ratio = 1, frame = 0, last = 0, visible = false;
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

    const draw = () => {
      const time = timeRef.current;
      const layout = scene.narrow && window.innerWidth <= 700 ? scene.narrow : scene;
      const radius = Math.min(width, height * 1.6) * layout.scale;
      const cx = width * layout.centerX, cy = height * layout.centerY;
      const distance = radius * 4.2;
      // Rings sway gently; glyphs travel along them. Stars drift around the axis.
      const yaw = Math.sin(time * .13) * .2 + pointer.x * .3;
      const pitch = pointer.y * .12;
      const project = (point: Point) => { const factor = distance / (distance - point.z * radius); return { x: cx + point.x * radius * factor, y: cy + point.y * radius * factor, z: point.z, factor }; };
      const [backLayer, frontLayer] = layers;
      for (const { canvas, context } of layers) { context!.setTransform(ratio, 0, 0, ratio, 0, 0); context!.clearRect(0, 0, canvas.width, canvas.height); }
      const contextFor = (z: number) => (z > 0 && frontLayer ? frontLayer.context! : backLayer.context!);

      for (const star of stars) {
        const p = project(rotate(star, 0, 0, time * scene.spin + yaw, pitch));
        const context = contextFor(p.z);
        const depth = (p.z + 1.4) / 2.8;
        context.globalAlpha = scene.light ? .18 + depth * .45 : (p.z > 0 ? .5 : .16 + depth * .4);
        context.fillStyle = scene.light ? '#cfe8f8' : '#116aa4';
        context.beginPath(); context.arc(p.x, p.y, star.size * p.factor, 0, Math.PI * 2); context.fill();
      }

      const tokens: { x: number; y: number; z: number; factor: number; text: string; color: string }[] = [];
      for (const ring of scene.rings) {
        const tiltX = ring.tiltX * deg, tiltZ = ring.tiltZ * deg;
        const steps = 140;
        let previous: ReturnType<typeof project> | undefined;
        for (const layer of layers) { const context = layer.context!; context.beginPath(); }
        const paths = new Map<CanvasRenderingContext2D, boolean>();
        for (let step = 0; step <= steps; step++) {
          const angle = (step / steps) * Math.PI * 2;
          const p = project(rotate({ x: Math.cos(angle) * ring.radius, y: Math.sin(angle) * ring.radius, z: 0 }, tiltX, tiltZ, yaw, pitch));
          if (previous) {
            const context = contextFor((p.z + previous.z) / 2);
            context.moveTo(previous.x, previous.y); context.lineTo(p.x, p.y);
            paths.set(context, true);
          }
          previous = p;
        }
        for (const { context } of layers) {
          if (!paths.has(context!)) continue;
          const isFront = frontLayer && context === frontLayer.context;
          context!.globalAlpha = scene.light ? (isFront || layers.length === 1 ? .55 : .3) : (isFront ? .78 : .4);
          context!.strokeStyle = ring.color;
          if (isFront) {
            // A soft halo keeps the front stroke legible over the photograph.
            const alpha = context!.globalAlpha;
            context!.globalAlpha = .35; context!.strokeStyle = scene.light ? '#092f46' : '#ffffff'; context!.lineWidth = 5; context!.stroke();
            context!.globalAlpha = alpha; context!.strokeStyle = ring.color;
          }
          context!.lineWidth = isFront ? 2 : 1.4;
          context!.stroke();
        }
        ring.glyphs.forEach((text, index) => {
          const angle = ring.phase + time * ring.speed + (index * Math.PI * 2) / ring.glyphs.length;
          const p = project(rotate({ x: Math.cos(angle) * ring.radius, y: Math.sin(angle) * ring.radius, z: 0 }, tiltX, tiltZ, yaw, pitch));
          tokens.push({ ...p, text, color: ring.color });
        });
      }

      tokens.sort((a, b) => a.z - b.z);
      for (const token of tokens) {
        const context = contextFor(token.z);
        const size = Math.max(9, 11.5 * token.factor);
        context.font = `${size}px 'IBM Plex Mono', monospace`;
        const textWidth = context.measureText(token.text).width;
        const padX = size * .7, boxW = textWidth + padX * 2, boxH = size * 2.05;
        const front = token.z > 0;
        context.globalAlpha = front ? 1 : .72;
        context.fillStyle = scene.light ? (front ? '#ffffff' : '#123f59') : (front ? '#ffffff' : '#edf6fc');
        context.strokeStyle = token.color;
        context.lineWidth = 1.2;
        context.beginPath();
        const left = token.x - boxW / 2, top = token.y - boxH / 2;
        if (context.roundRect) context.roundRect(left, top, boxW, boxH, boxH / 2); else context.rect(left, top, boxW, boxH);
        context.fill(); context.stroke();
        context.fillStyle = scene.light ? (front ? '#092f46' : '#cfe8f8') : (front ? '#092f46' : '#526577');
        context.textAlign = 'center'; context.textBaseline = 'middle';
        context.fillText(token.text, token.x, token.y + size * .05);
        context.beginPath(); context.arc(left - 6 * token.factor, token.y, 2.4 * token.factor, 0, Math.PI * 2);
        context.fillStyle = token.color; context.fill();
      }
      for (const { context } of layers) context!.globalAlpha = 1;
      if (spinTarget?.current) spinTarget.current.style.setProperty('--orbit-spin', `${(time * 18) % 360}deg`);
    };

    const resize = () => {
      const rect = back.getBoundingClientRect();
      width = rect.width; height = rect.height;
      ratio = Math.min(window.devicePixelRatio || 1, 2);
      for (const { canvas } of layers) { canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); }
      draw();
    };

    const tick = (now: number) => {
      frame = 0;
      const delta = last ? Math.min((now - last) / 1000, .05) : 0;
      last = now;
      if (!still) timeRef.current += delta;
      pointer.x += (pointer.tx - pointer.x) * .06;
      pointer.y += (pointer.ty - pointer.y) * .06;
      draw();
      const settling = Math.abs(pointer.tx - pointer.x) + Math.abs(pointer.ty - pointer.y) > .002;
      if (visible && !document.hidden && (!still || settling)) frame = requestAnimationFrame(tick);
      else last = 0;
    };
    const start = () => { if (!frame && visible && !document.hidden) frame = requestAnimationFrame(tick); };

    const observer = new ResizeObserver(resize);
    observer.observe(back);
    const visibility = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) start(); });
    visibility.observe(back);
    const onVisibility = () => start();
    document.addEventListener('visibilitychange', onVisibility);
    const onMove = (event: PointerEvent) => {
      if (reduced || !host) return;
      const rect = host.getBoundingClientRect();
      pointer.tx = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - .5) * 2));
      pointer.ty = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height - .5) * 2));
      start();
    };
    const onLeave = () => { pointer.tx = 0; pointer.ty = 0; start(); };
    const tracking = finePointer() && host;
    if (tracking) { host.addEventListener('pointermove', onMove); host.addEventListener('pointerleave', onLeave); }
    resize();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect(); visibility.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      if (tracking) { host.removeEventListener('pointermove', onMove); host.removeEventListener('pointerleave', onLeave); }
    };
  }, [variant, still, reduced, spinTarget]);

  return <>
    <canvas ref={backRef} className={`orbit-layer orbit-back orbit-${variant}`} aria-hidden="true" />
    {variant === 'hero' && <canvas ref={frontRef} className="orbit-layer orbit-front orbit-hero" aria-hidden="true" />}
  </>;
}
