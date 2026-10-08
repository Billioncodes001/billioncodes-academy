// Lightweight 2D simulations that live behind every page. Each one reacts to the
// pointer so the background feels alive, but stays faint enough to read over.

export type Pointer = { x: number; y: number; active: boolean; burst: { x: number; y: number; t: number }[] };
export type Simulation = { step: (ctx: CanvasRenderingContext2D, dt: number, time: number) => void; resize: (w: number, h: number) => void };
export type Variant = 'constellation' | 'tags' | 'orbits' | 'flow' | 'boids' | 'grid';

const BLUE = '92, 200, 255';
const SKY = '47, 143, 224';
const ICE = '200, 236, 255';
const rand = (min: number, max: number) => min + Math.random() * (max - min);

function density(w: number, h: number, per: number, cap: number) { return Math.min(cap, Math.max(18, Math.round((w * h) / per))); }

function fade(ctx: CanvasRenderingContext2D, w: number, h: number, amount: number) {
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = `rgba(0,0,0,${amount})`;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
}

function drawBursts(ctx: CanvasRenderingContext2D, pointer: Pointer, time: number) {
  pointer.burst = pointer.burst.filter(b => time - b.t < 1.1);
  for (const b of pointer.burst) {
    const age = (time - b.t) / 1.1;
    ctx.strokeStyle = `rgba(${BLUE}, ${0.35 * (1 - age)})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(b.x, b.y, 12 + age * 140, 0, Math.PI * 2); ctx.stroke();
  }
}

// A network of learning nodes. Nearby nodes link up; the cursor pulls them in.
function constellation(pointer: Pointer): Simulation {
  let w = 0, h = 0;
  let nodes: { x: number; y: number; vx: number; vy: number; r: number }[] = [];
  return {
    resize(nw, nh) {
      w = nw; h = nh;
      nodes = Array.from({ length: density(w, h, 16000, 120) }, () => ({ x: rand(0, w), y: rand(0, h), vx: rand(-.25, .25), vy: rand(-.25, .25), r: rand(1.2, 2.8) }));
    },
    step(ctx, dt, time) {
      ctx.clearRect(0, 0, w, h);
      for (const n of nodes) {
        if (pointer.active) {
          const dx = pointer.x - n.x, dy = pointer.y - n.y, d = Math.hypot(dx, dy);
          if (d < 220 && d > 1) { n.vx += dx / d * .012 * dt; n.vy += dy / d * .012 * dt; }
        }
        for (const b of pointer.burst) {
          const dx = n.x - b.x, dy = n.y - b.y, d = Math.hypot(dx, dy);
          if (d < 200 && time - b.t < .05) { n.vx += dx / (d + 1) * 3; n.vy += dy / (d + 1) * 3; }
        }
        n.vx *= .985; n.vy *= .985;
        n.x += n.vx * dt; n.y += n.vy * dt;
        if (n.x < -20) n.x = w + 20; if (n.x > w + 20) n.x = -20;
        if (n.y < -20) n.y = h + 20; if (n.y > h + 20) n.y = -20;
      }
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j], d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 130) { ctx.strokeStyle = `rgba(${SKY}, ${(1 - d / 130) * .28})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
        }
        if (pointer.active) {
          const d = Math.hypot(a.x - pointer.x, a.y - pointer.y);
          if (d < 180) { ctx.strokeStyle = `rgba(${BLUE}, ${(1 - d / 180) * .45})`; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(pointer.x, pointer.y); ctx.stroke(); }
        }
        const pulse = .55 + .45 * Math.sin(time * 1.7 + i);
        ctx.fillStyle = `rgba(${BLUE}, ${.35 + pulse * .3})`;
        ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2); ctx.fill();
      }
      drawBursts(ctx, pointer, time);
    },
  };
}

// Code tags drifting down like rain. The cursor parts them like water.
function tags(pointer: Pointer): Simulation {
  const glyphs = ['<div>', '</>', '{ }', '<h1>', '=>', '<a href>', '<p>', 'css', '<main>', '[ ]', '<li>', 'const', '<img>', '#id', '.class', '</body>'];
  let w = 0, h = 0;
  let drops: { x: number; y: number; z: number; g: string; vx: number; glow: number }[] = [];
  const spawn = (y?: number) => ({ x: rand(0, w), y: y ?? rand(-h, 0), z: rand(.35, 1), g: glyphs[Math.floor(Math.random() * glyphs.length)], vx: 0, glow: 0 });
  return {
    resize(nw, nh) { w = nw; h = nh; drops = Array.from({ length: density(w, h, 22000, 80) }, () => spawn(rand(0, h))); },
    step(ctx, dt, time) {
      ctx.clearRect(0, 0, w, h);
      for (const d of drops) {
        d.y += (0.35 + d.z * 0.9) * dt;
        if (pointer.active) {
          const dx = d.x - pointer.x, dy = d.y - pointer.y, dist = Math.hypot(dx, dy);
          if (dist < 140) { d.vx += (dx / (dist + 1)) * 0.5; d.glow = 1; }
        }
        d.vx *= .92; d.x += d.vx * dt; d.glow *= .96;
        if (Math.random() < .0006) d.glow = 1;
        if (d.y > h + 30) Object.assign(d, spawn(-30));
        const size = 11 + d.z * 9;
        ctx.font = `500 ${size}px "IBM Plex Mono", monospace`;
        ctx.fillStyle = d.glow > .05 ? `rgba(${BLUE}, ${.25 + d.glow * .6})` : `rgba(${SKY}, ${.12 + d.z * .2})`;
        ctx.fillText(d.g, d.x, d.y);
      }
      drawBursts(ctx, pointer, time);
    },
  };
}

// Particles orbiting a few gravity wells, like skills circling a goal.
function orbits(pointer: Pointer): Simulation {
  let w = 0, h = 0;
  let wells: { x: number; y: number }[] = [];
  let parts: { x: number; y: number; vx: number; vy: number; c: string }[] = [];
  return {
    resize(nw, nh) {
      w = nw; h = nh;
      wells = [{ x: w * .78, y: h * .3 }, { x: w * .2, y: h * .7 }, { x: w * .6, y: h * .82 }];
      parts = Array.from({ length: density(w, h, 5000, 320) }, () => {
        const well = wells[Math.floor(Math.random() * wells.length)], a = rand(0, Math.PI * 2), r = rand(40, 260);
        return { x: well.x + Math.cos(a) * r, y: well.y + Math.sin(a) * r, vx: -Math.sin(a) * rand(.8, 1.6), vy: Math.cos(a) * rand(.8, 1.6), c: [BLUE, SKY, ICE][Math.floor(Math.random() * 3)] };
      });
    },
    step(ctx, dt, time) {
      fade(ctx, w, h, .09);
      const all = pointer.active ? [...wells, { x: pointer.x, y: pointer.y }] : wells;
      wells[0].x = w * .78 + Math.sin(time * .2) * 60; wells[1].y = h * .7 + Math.cos(time * .17) * 50;
      for (const p of parts) {
        for (const well of all) {
          const dx = well.x - p.x, dy = well.y - p.y, d2 = dx * dx + dy * dy + 900, f = 260 / d2;
          p.vx += dx * f * .02 * dt; p.vy += dy * f * .02 * dt;
        }
        const speed = Math.hypot(p.vx, p.vy);
        if (speed > 3.2) { p.vx *= 3.2 / speed; p.vy *= 3.2 / speed; }
        const px = p.x, py = p.y;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.x < -100 || p.x > w + 100 || p.y < -100 || p.y > h + 100) { p.x = rand(0, w); p.y = rand(0, h); p.vx = rand(-1, 1); p.vy = rand(-1, 1); }
        ctx.strokeStyle = `rgba(${p.c}, .7)`; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(p.x, p.y); ctx.stroke();
      }
      drawBursts(ctx, pointer, time);
    },
  };
}

// Ink flowing through a slowly turning current. Moving the cursor stirs it.
function flow(pointer: Pointer): Simulation {
  let w = 0, h = 0;
  let parts: { x: number; y: number; life: number }[] = [];
  const angle = (x: number, y: number, t: number) => Math.sin(x * .0042 + t * .25) * 1.6 + Math.cos(y * .0051 - t * .2) * 1.6 + Math.sin((x + y) * .0021) * 1.2;
  return {
    resize(nw, nh) { w = nw; h = nh; parts = Array.from({ length: density(w, h, 3500, 520) }, () => ({ x: rand(0, w), y: rand(0, h), life: rand(60, 260) })); },
    step(ctx, dt, time) {
      fade(ctx, w, h, .035);
      ctx.lineWidth = 1.6;
      for (const p of parts) {
        let a = angle(p.x, p.y, time);
        if (pointer.active) {
          const dx = p.x - pointer.x, dy = p.y - pointer.y, d = Math.hypot(dx, dy);
          if (d < 160) a += (1 - d / 160) * 2.4;
        }
        const px = p.x, py = p.y;
        p.x += Math.cos(a) * 1.4 * dt; p.y += Math.sin(a) * 1.4 * dt; p.life -= dt;
        if (p.life < 0 || p.x < 0 || p.x > w || p.y < 0 || p.y > h) { p.x = rand(0, w); p.y = rand(0, h); p.life = rand(60, 260); continue; }
        ctx.strokeStyle = `rgba(${p.x / w > .5 ? BLUE : SKY}, .55)`;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(p.x, p.y); ctx.stroke();
      }
      drawBursts(ctx, pointer, time);
    },
  };
}

// A flock that swims together and scatters away from the cursor.
function boids(pointer: Pointer): Simulation {
  let w = 0, h = 0;
  let flock: { x: number; y: number; vx: number; vy: number }[] = [];
  return {
    resize(nw, nh) { w = nw; h = nh; flock = Array.from({ length: density(w, h, 9000, 160) }, () => ({ x: rand(0, w), y: rand(0, h), vx: rand(-1, 1), vy: rand(-1, 1) })); },
    step(ctx, dt, time) {
      ctx.clearRect(0, 0, w, h);
      for (const b of flock) {
        let cx = 0, cy = 0, ax = 0, ay = 0, sx = 0, sy = 0, n = 0;
        for (const o of flock) {
          if (o === b) continue;
          const dx = o.x - b.x, dy = o.y - b.y, d = dx * dx + dy * dy;
          if (d < 4900) { cx += o.x; cy += o.y; ax += o.vx; ay += o.vy; n++; if (d < 400) { sx -= dx; sy -= dy; } }
        }
        if (n) { b.vx += ((cx / n - b.x) * .0006 + (ax / n - b.vx) * .045) * dt; b.vy += ((cy / n - b.y) * .0006 + (ay / n - b.vy) * .045) * dt; }
        b.vx += sx * .004 * dt; b.vy += sy * .004 * dt;
        if (pointer.active) {
          const dx = b.x - pointer.x, dy = b.y - pointer.y, d = Math.hypot(dx, dy);
          if (d < 150) { b.vx += dx / d * .35 * dt; b.vy += dy / d * .35 * dt; }
        }
        const s = Math.hypot(b.vx, b.vy), max = 2.6, min = 1.1;
        if (s > max) { b.vx *= max / s; b.vy *= max / s; } else if (s < min) { b.vx *= min / (s || 1); b.vy *= min / (s || 1); }
        b.x = (b.x + b.vx * dt + w) % w; b.y = (b.y + b.vy * dt + h) % h;
        const a = Math.atan2(b.vy, b.vx);
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(a);
        ctx.fillStyle = `rgba(${BLUE}, .42)`;
        ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, 4); ctx.lineTo(-3, 0); ctx.lineTo(-5, -4); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      drawBursts(ctx, pointer, time);
    },
  };
}

// A dot matrix with travelling waves. The cursor drops pebbles into it.
function grid(pointer: Pointer): Simulation {
  let w = 0, h = 0;
  const gap = 28;
  const waves: { x: number; y: number; t: number }[] = [];
  let next = 0;
  return {
    resize(nw, nh) { w = nw; h = nh; },
    step(ctx, _dt, time) {
      ctx.clearRect(0, 0, w, h);
      if (time > next) { waves.push({ x: rand(0, w), y: rand(0, h), t: time }); next = time + rand(1.2, 2.6); }
      for (const b of pointer.burst) if (!waves.some(v => v.t === b.t)) waves.push({ x: b.x, y: b.y, t: b.t });
      while (waves.length && time - waves[0].t > 4) waves.shift();
      for (let y = gap / 2; y < h; y += gap) {
        for (let x = gap / 2; x < w; x += gap) {
          let lift = 0;
          for (const v of waves) {
            const r = (time - v.t) * 260, d = Math.hypot(x - v.x, y - v.y), band = Math.abs(d - r);
            if (band < 40) lift += (1 - band / 40) * (1 - (time - v.t) / 4);
          }
          if (pointer.active) { const d = Math.hypot(x - pointer.x, y - pointer.y); if (d < 120) lift += (1 - d / 120) * .9; }
          lift = Math.min(lift, 1.4);
          ctx.fillStyle = `rgba(${lift > .05 ? BLUE : SKY}, ${.16 + lift * .5})`;
          ctx.fillRect(x - 1 - lift * 1.5, y - 1 - lift * 1.5, 2 + lift * 3, 2 + lift * 3);
        }
      }
    },
  };
}

export const simulations: Record<Variant, (pointer: Pointer) => Simulation> = { constellation, tags, orbits, flow, boids, grid };
