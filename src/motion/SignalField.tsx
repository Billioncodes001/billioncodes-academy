import { useEffect, useRef } from 'react';
import { finePointer, useMotionPaused, useReducedMotion } from './preferences';

// A dot-matrix "signal" field drawn on one 2D canvas. Cells brighten where
// three slow interference waves meet, where the pointer is, and (for the
// finale) inside a word rasterised into the grid. It is decorative,
// deterministic for a given time, throttled to ~30 fps, and stops off-screen,
// in hidden tabs, when paused and under reduced motion (one static frame).

type Variant = 'hero' | 'finale';
type Config = { cell: number; mobileCell: number; word?: string; focusX: number; quiet: number };

const configs: Record<Variant, Config> = {
  // `quiet` keeps the area behind the hero copy dim so text contrast is unaffected.
  hero: { cell: 15, mobileCell: 12, focusX: .78, quiet: .42 },
  finale: { cell: 11, mobileCell: 8, word: 'BUILD', focusX: .72, quiet: .38 },
};

const smooth = (edge0: number, edge1: number, x: number) => { const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0))); return t * t * (3 - 2 * t); };

function rasterise(word: string, cols: number, rows: number, narrow: boolean) {
  const canvas = document.createElement('canvas');
  canvas.width = cols; canvas.height = rows;
  const context = canvas.getContext('2d');
  if (!context) return new Float32Array(cols * rows);
  // Desktop: the word sits in the right half. Narrow: across the top band.
  const boxW = narrow ? cols * .92 : cols * .4, boxH = narrow ? rows * .32 : rows * .5;
  const left = narrow ? cols * .04 : cols * .57, top = narrow ? rows * .04 : rows * .25;
  context.fillStyle = '#fff';
  context.textBaseline = 'middle'; context.textAlign = 'center';
  let size = boxH;
  context.font = `800 ${size}px 'Bricolage Grotesque', sans-serif`;
  const measured = context.measureText(word).width;
  if (measured > boxW) { size = size * boxW / measured; context.font = `800 ${size}px 'Bricolage Grotesque', sans-serif`; }
  context.fillText(word, left + boxW / 2, top + boxH / 2);
  const pixels = context.getImageData(0, 0, cols, rows).data;
  const mask = new Float32Array(cols * rows);
  for (let index = 0; index < mask.length; index++) mask[index] = pixels[index * 4 + 3] / 255;
  return mask;
}

export function SignalField({ variant, spinTarget }: { variant: Variant; spinTarget?: React.RefObject<HTMLElement | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paused = useMotionPaused();
  const reduced = useReducedMotion();
  const still = paused || reduced;
  const timeRef = useRef(4);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const config = configs[variant];
    const host = canvas.parentElement;
    let width = 0, height = 0, ratio = 1, cols = 0, rows = 0, cell = config.cell;
    let mask = new Float32Array(0);
    let frame = 0, last = 0, lastDraw = 0, visible = false;
    let alive = true;
    const pointer = { x: -999, y: -999, tx: -999, ty: -999, energy: 0, target: 0 };

    const draw = () => {
      const time = timeRef.current;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      const narrow = width < 700;
      const pcx = pointer.x / cell, pcy = pointer.y / cell;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const wave = (Math.sin(col * .21 + time * 1.05) + Math.sin(row * .17 - time * .72) + Math.sin((col + row) * .105 + time * .48)) / 3;
          const n = (wave + 1) / 2;
          // Fade toward the copy column on wide screens; keep the field even on phones.
          const fx = col / cols;
          const focus = narrow ? .78 : config.quiet + (1 - config.quiet) * smooth(config.focusX - .55, config.focusX + .05, fx);
          let level = n * n * n * .62 * focus;
          const m = mask.length ? mask[row * cols + col] : 0;
          if (m > 0) level = Math.max(level, m * (.5 + .5 * n));
          if (pointer.energy > .01) {
            const dx = col - pcx, dy = row - pcy;
            level = Math.max(level, Math.exp(-(dx * dx + dy * dy) / 26) * .85 * pointer.energy);
          }
          if (level < .05) continue;
          const size = cell * (.16 + .56 * level);
          context.globalAlpha = Math.min(1, .14 + level * .9);
          context.fillStyle = level > .72 ? '#e8f3ff' : level > .4 ? '#69b4ff' : '#2f7bf0';
          context.fillRect(col * cell + (cell - size) / 2, row * cell + (cell - size) / 2, size, size);
        }
      }
      context.globalAlpha = 1;
      if (spinTarget?.current) spinTarget.current.style.setProperty('--spin', `${(time * 16) % 360}deg`);
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width; height = rect.height;
      ratio = Math.min(window.devicePixelRatio || 1, 2);
      cell = width < 700 ? config.mobileCell : config.cell;
      cols = Math.ceil(width / cell); rows = Math.ceil(height / cell);
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      mask = config.word ? rasterise(config.word, cols, rows, width < 700) : new Float32Array(0);
      draw();
    };

    const tick = (now: number) => {
      frame = 0;
      const delta = last ? Math.min((now - last) / 1000, .05) : 0;
      last = now;
      if (!still) timeRef.current += delta;
      pointer.x += (pointer.tx - pointer.x) * .18;
      pointer.y += (pointer.ty - pointer.y) * .18;
      pointer.energy += (pointer.target - pointer.energy) * .08;
      if (now - lastDraw > 32) { lastDraw = now; draw(); }
      const settling = Math.abs(pointer.target - pointer.energy) > .01;
      if (visible && !document.hidden && (!still || settling)) frame = requestAnimationFrame(tick);
      else { last = 0; draw(); }
    };
    const start = () => { if (!frame && visible && !document.hidden) frame = requestAnimationFrame(tick); };

    const sizeObserver = new ResizeObserver(resize);
    sizeObserver.observe(canvas);
    const visibility = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) start(); });
    visibility.observe(canvas);
    const onVisibility = () => start();
    document.addEventListener('visibilitychange', onVisibility);
    const onMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.tx = event.clientX - rect.left; pointer.ty = event.clientY - rect.top;
      if (pointer.x < -900) { pointer.x = pointer.tx; pointer.y = pointer.ty; }
      pointer.target = 1; start();
    };
    const onLeave = () => { pointer.target = 0; start(); };
    const tracking = finePointer() && !reduced && host;
    if (tracking) { host.addEventListener('pointermove', onMove); host.addEventListener('pointerleave', onLeave); }
    // Fonts change the rasterised word; redraw once they are ready.
    if (config.word) void document.fonts?.ready.then(() => { if (alive) resize(); });
    resize();
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      sizeObserver.disconnect(); visibility.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      if (tracking) { host.removeEventListener('pointermove', onMove); host.removeEventListener('pointerleave', onLeave); }
    };
  }, [variant, still, reduced, spinTarget]);

  return <canvas ref={canvasRef} className={`signal-canvas signal-${variant}`} aria-hidden="true" />;
}
