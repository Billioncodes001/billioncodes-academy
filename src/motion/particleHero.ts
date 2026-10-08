import * as THREE from 'three';
import { drawBug } from './bugArt';

// The homepage hero. Idle: thousands of glowing particles morph between the
// headline words, flee the cursor and explode on click. Play: "Debug Defender",
// an arcade game where bugs swarm a code core and the visitor zaps them.

export type GameState = { mode: 'idle' | 'playing' | 'over'; score: number; best: number; wave: number; integrity: number; combo: number; banner: string };
export type HeroEngine = { dispose: () => void; setRunning: (running: boolean) => void; start: () => void; quit: () => void; zapNearest: () => void };
type Options = { animate: boolean; overlay: HTMLElement; onState: (state: GameState) => void };

type Bug = { x: number; y: number; tx: number; ty: number; speed: number; hp: number; boss: boolean; phase: number; sprite: THREE.Sprite; angle: number };
type Spark = { x: number; y: number; vx: number; vy: number; life: number; max: number; r: number; g: number; b: number };
type Wave = { x: number; y: number; t: number; power: number };

const WORDS_WIDE = [['BIG IDEAS.'], ['REAL SKILLS.'], ['BUILT BY YOU.'], ['</>']];
const WORDS_NARROW = [['BIG', 'IDEAS.'], ['REAL', 'SKILLS.'], ['BUILT', 'BY YOU.'], ['</>']];
const BEST_KEY = 'bc-debug-defender-best';

function readBest() { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; } }
function saveBest(value: number) { try { localStorage.setItem(BEST_KEY, String(value)); } catch { /* Storage may be unavailable. */ } }

// Sample pixel positions of text drawn on an offscreen canvas.
function sampleText(lines: string[], w: number, h: number, centerY: number, maxWidth: number, maxHeight: number, gap: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w); canvas.height = Math.ceil(h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  let size = 400;
  const fit = () => {
    ctx.font = `800 ${size}px "Bricolage Grotesque", "Space Grotesk", sans-serif`;
    const widest = Math.max(...lines.map(line => ctx.measureText(line).width));
    return widest <= maxWidth && size * lines.length * .92 <= maxHeight;
  };
  while (!fit() && size > 20) size -= 6;
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const lineHeight = size * .9, top = centerY - (lines.length - 1) * lineHeight / 2;
  lines.forEach((line, i) => ctx.fillText(line, w / 2, top + i * lineHeight));
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data, points: number[] = [];
  for (let y = 0; y < canvas.height; y += gap) for (let x = 0; x < canvas.width; x += gap) if (data[(y * canvas.width + x) * 4 + 3] > 128) points.push(x, y);
  return points;
}

function bugTexture(boss: boolean) {
  const size = 128, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  drawBug(canvas.getContext('2d')!, size / 2, size / 2, size, 0, boss);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // The camera's y axis points down (screen pixels), so canvas rows map straight across.
  texture.flipY = false;
  return texture;
}

const POINT_VERTEX = `
  attribute float size; attribute vec3 color; varying vec3 vColor; uniform float pixelRatio;
  void main() { vColor = color; gl_PointSize = size * pixelRatio * 2.6; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const POINT_FRAGMENT = `
  varying vec3 vColor;
  // A bright core plus a soft halo: the glow lives in the shader, so no bloom pass is needed.
  void main() { float d = length(gl_PointCoord - .5) * 2.0; float core = smoothstep(.4, .0, d); float halo = exp(-d * d * 6.0) * .45; gl_FragColor = vec4(vColor * (core * 1.35 + halo), core + halo); }`;

function pointCloud(count: number, pixelRatio: number) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('size', new THREE.BufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage));
  const material = new THREE.ShaderMaterial({ vertexShader: POINT_VERTEX, fragmentShader: POINT_FRAGMENT, uniforms: { pixelRatio: { value: pixelRatio } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const points = new THREE.Points(geometry, material);
  // Positions change every frame, so a cached bounding sphere would wrongly cull the cloud.
  points.frustumCulled = false;
  return points;
}

export function createParticleHero(canvas: HTMLCanvasElement, opts: Options): HeroEngine {
  const small = window.innerWidth < 760;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor('#02070f');
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 100);

  const COUNT = small ? 5200 : 13000, STARS = small ? 260 : 700, SPARKS = 900;
  const words = small ? WORDS_NARROW : WORDS_WIDE;
  const px = new Float32Array(COUNT), py = new Float32Array(COUNT), vx = new Float32Array(COUNT), vy = new Float32Array(COUNT);
  const hx = new Float32Array(COUNT), hy = new Float32Array(COUNT), corrupt = new Float32Array(COUNT), seed = new Float32Array(COUNT);
  const particles = pointCloud(COUNT, pixelRatio), stars = pointCloud(STARS, pixelRatio), sparkCloud = pointCloud(SPARKS, pixelRatio);
  scene.add(stars, particles, sparkCloud);
  const sx = new Float32Array(STARS), sy = new Float32Array(STARS), sz = new Float32Array(STARS);

  const bugTex = bugTexture(false), bossTex = bugTexture(true);
  const bugs: Bug[] = [], sparks: Spark[] = [], waves: Wave[] = [];
  let W = 1, H = 1, wordIndex = 0, nextMorph = 3.6, time = 0, last = performance.now(), frame = 0;
  let running = opts.animate, shake = 0;
  const pointer = { x: -9999, y: -9999, inside: false };
  const shapes: number[][] = [];
  let coreShape: number[] = [], coreY = 0;

  const state: GameState = { mode: 'idle', score: 0, best: readBest(), wave: 0, integrity: 100, combo: 0, banner: '' };
  let toSpawn = 0, spawnTimer = 0, lastKill = -9, waveBreak = 0;
  const emit = () => opts.onState({ ...state });


  function layout() {
    W = canvas.clientWidth || 1; H = canvas.clientHeight || 1;
    renderer.setSize(W, H, false);
    camera.left = 0; camera.right = W; camera.top = 0; camera.bottom = H; camera.updateProjectionMatrix();
    camera.scale.y = 1;
    const gap = small ? 4 : Math.max(4, Math.round(Math.sqrt((W * H * .16) / COUNT)));
    const centerY = small ? 250 : H * .33;
    shapes.length = 0;
    for (const lines of words) shapes.push(sampleText(lines, W, H, centerY, W * (small ? .9 : .84), small ? 300 : H * .4, gap));
    coreY = small ? H * .42 : H * .5;
    coreShape = sampleText(['</>'], W, H, coreY, W * (small ? .7 : .42), H * (small ? .24 : .36), gap);
    for (let i = 0; i < STARS; i++) { sx[i] = Math.random() * W; sy[i] = Math.random() * H; sz[i] = Math.random(); }
    assign(state.mode === 'playing' ? coreShape : shapes[wordIndex], false);
  }

  // Give every particle a home on the target shape.
  function assign(points: number[], kick: boolean) {
    const n = points.length / 2;
    if (!n) return;
    for (let i = 0; i < COUNT; i++) {
      const j = ((i * 7919) % n) * 2;
      hx[i] = points[j] + (Math.random() - .5) * 2.4; hy[i] = points[j + 1] + (Math.random() - .5) * 2.4;
      if (kick) { const a = Math.random() * Math.PI * 2, s = 4 + Math.random() * 14; vx[i] += Math.cos(a) * s; vy[i] += Math.sin(a) * s; }
    }
  }

  function scatterIn() {
    for (let i = 0; i < COUNT; i++) { px[i] = Math.random() * W; py[i] = Math.random() * H; seed[i] = Math.random() * 100; }
  }

  function burst(x: number, y: number, count: number, hot: boolean) {
    for (let k = 0; k < count && sparks.length < SPARKS; k++) {
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * (hot ? 11 : 7), life = .5 + Math.random() * .7;
      sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, r: hot ? 1 : .55, g: hot ? .55 + Math.random() * .4 : .85, b: hot ? .25 : 1 });
    }
  }

  function popText(x: number, y: number, text: string, kind = '') {
    const el = document.createElement('span');
    el.className = `hero-pop ${kind}`; el.textContent = text;
    el.style.setProperty('left', `${x}px`); el.style.setProperty('top', `${y}px`);
    opts.overlay.appendChild(el);
    window.setTimeout(() => el.remove(), 900);
  }

  function shockwave(x: number, y: number, power: number) { waves.push({ x, y, t: time, power }); }

  // ---------- Game ----------
  function startWave() {
    state.wave += 1;
    toSpawn = 4 + state.wave * 2 + (state.wave % 3 === 0 ? 1 : 0);
    spawnTimer = .4; waveBreak = 0;
    state.banner = state.wave % 3 === 0 ? `WAVE ${state.wave} · BOSS BUG` : `WAVE ${state.wave}`;
    emit();
    window.setTimeout(() => { if (state.banner.startsWith(`WAVE ${state.wave}`)) { state.banner = ''; emit(); } }, 1400);
  }

  function spawnBug() {
    const boss = state.wave % 3 === 0 && toSpawn === 1;
    const edge = Math.floor(Math.random() * 4), margin = 40;
    const x = edge === 0 ? -margin : edge === 1 ? W + margin : Math.random() * W;
    const y = edge === 2 ? -margin : edge === 3 ? H + margin : Math.random() * H;
    const j = Math.floor(Math.random() * (coreShape.length / 2)) * 2;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: boss ? bossTex : bugTex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    const size = (boss ? 110 : 64) * (small ? .85 : 1);
    sprite.scale.set(size, size, 1);
    scene.add(sprite);
    bugs.push({ x, y, tx: coreShape[j], ty: coreShape[j + 1], speed: (boss ? 38 : 62 + state.wave * 9) * (small ? .8 : 1) * (.8 + Math.random() * .4), hp: boss ? 4 : 1, boss, phase: Math.random() * 10, sprite, angle: 0 });
  }

  function removeBug(bug: Bug) {
    scene.remove(bug.sprite); (bug.sprite.material as THREE.Material).dispose();
    bugs.splice(bugs.indexOf(bug), 1);
  }

  function hitBug(bug: Bug) {
    bug.hp -= 1;
    burst(bug.x, bug.y, bug.hp > 0 ? 18 : bug.boss ? 160 : 70, true);
    shockwave(bug.x, bug.y, bug.boss && bug.hp <= 0 ? 2.6 : 1.3);
    if (bug.hp > 0) { popText(bug.x, bug.y - 30, `${bug.hp} HP`, 'pop-boss'); return; }
    state.combo = time - lastKill < 1.3 ? Math.min(state.combo + 1, 8) : 1;
    lastKill = time;
    const points = (bug.boss ? 100 : 10) * state.combo;
    state.score += points;
    popText(bug.x, bug.y - 26, state.combo > 1 ? `+${points} ×${state.combo}` : `+${points}`, bug.boss ? 'pop-boss' : '');
    removeBug(bug);
    shake = Math.max(shake, bug.boss ? 14 : 4);
    // Every fifth combo kill fires a refactor pulse that clears bugs near the core.
    if (state.combo === 5) {
      popText(W / 2, H * .3, 'REFACTOR PULSE', 'pop-big');
      shockwave(W / 2, coreY, 3.4);
      for (const other of [...bugs]) if (Math.hypot(other.x - W / 2, other.y - coreY) < Math.min(W, H) * .32 && !other.boss) { burst(other.x, other.y, 50, true); state.score += 10; removeBug(other); }
    }
    emit();
  }

  function damageCore(bug: Bug) {
    state.integrity = Math.max(0, state.integrity - (bug.boss ? 30 : 9));
    state.combo = 0;
    shake = 18;
    burst(bug.tx, bug.ty, 60, true);
    for (let i = 0; i < COUNT; i++) {
      const d = Math.hypot(px[i] - bug.tx, py[i] - bug.ty);
      if (d < 90) { corrupt[i] = 1; const k = (1 - d / 90) * 12; vx[i] += (px[i] - bug.tx) / (d + 1) * k; vy[i] += (py[i] - bug.ty) / (d + 1) * k; }
    }
    opts.overlay.classList.remove('is-hit'); void opts.overlay.offsetWidth; opts.overlay.classList.add('is-hit');
    removeBug(bug);
    if (state.integrity <= 0) gameOver();
    emit();
  }

  function gameOver() {
    state.mode = 'over';
    for (const bug of [...bugs]) removeBug(bug);
    for (let i = 0; i < COUNT; i++) { const a = Math.random() * Math.PI * 2, s = 6 + Math.random() * 22; vx[i] += Math.cos(a) * s; vy[i] += Math.sin(a) * s; corrupt[i] = 1; }
    if (state.score > state.best) { state.best = state.score; saveBest(state.best); }
    state.banner = '';
    window.setTimeout(() => { wordIndex = 2; assign(shapes[wordIndex], true); }, 900);
    emit();
  }

  function zapAt(x: number, y: number) {
    let target: Bug | null = null, best = small ? 56 : 46;
    for (const bug of bugs) { const d = Math.hypot(bug.x - x, bug.y - y) - (bug.boss ? 22 : 0); if (d < best) { best = d; target = bug; } }
    if (target) hitBug(target);
    else { shockwave(x, y, .6); burst(x, y, 10, false); if (state.combo > 0) { state.combo = 0; emit(); } }
  }

  // ---------- Input ----------
  function local(event: PointerEvent) { const r = canvas.getBoundingClientRect(); return { x: event.clientX - r.left, y: event.clientY - r.top }; }
  function onMove(event: PointerEvent) { const p = local(event); pointer.x = p.x; pointer.y = p.y; pointer.inside = true; }
  function onLeave() { pointer.inside = false; pointer.x = pointer.y = -9999; }
  function onDown(event: PointerEvent) {
    if (!running) return;
    const p = local(event);
    if (state.mode === 'playing') { zapAt(p.x, p.y); return; }
    shockwave(p.x, p.y, 2.2); burst(p.x, p.y, 40, false);
  }
  function onKey(event: KeyboardEvent) {
    if (state.mode !== 'playing') return;
    if (event.key === 'Escape') { engine.quit(); }
  }

  // ---------- Simulation ----------
  const pos = particles.geometry.getAttribute('position') as THREE.BufferAttribute;
  const col = particles.geometry.getAttribute('color') as THREE.BufferAttribute;
  const siz = particles.geometry.getAttribute('size') as THREE.BufferAttribute;
  const starPos = stars.geometry.getAttribute('position') as THREE.BufferAttribute, starCol = stars.geometry.getAttribute('color') as THREE.BufferAttribute, starSize = stars.geometry.getAttribute('size') as THREE.BufferAttribute;
  const sparkPos = sparkCloud.geometry.getAttribute('position') as THREE.BufferAttribute, sparkCol = sparkCloud.geometry.getAttribute('color') as THREE.BufferAttribute, sparkSize = sparkCloud.geometry.getAttribute('size') as THREE.BufferAttribute;

  function update(dt: number) {
    time += dt;
    const step = Math.min(dt * 60, 2.5);

    if (state.mode === 'idle' && time > nextMorph) {
      wordIndex = (wordIndex + 1) % shapes.length; assign(shapes[wordIndex], true); nextMorph = time + (wordIndex === shapes.length - 1 ? 2.6 : 3.8);
    }
    if (state.mode === 'playing') {
      if (toSpawn > 0) { spawnTimer -= dt; if (spawnTimer <= 0) { spawnBug(); toSpawn -= 1; spawnTimer = Math.max(.25, 1.1 - state.wave * .08) * (.6 + Math.random() * .8); } }
      else if (!bugs.length) { waveBreak += dt; if (waveBreak > 1.2) startWave(); }
      for (const bug of [...bugs]) {
        const dx = bug.tx - bug.x, dy = bug.ty - bug.y, d = Math.hypot(dx, dy);
        if (d < 12) { damageCore(bug); continue; }
        const wobble = Math.sin(time * 6 + bug.phase) * (bug.boss ? .25 : .55);
        const angle = Math.atan2(dy, dx) + wobble;
        bug.x += Math.cos(angle) * bug.speed * dt; bug.y += Math.sin(angle) * bug.speed * dt;
        bug.angle += (angle - bug.angle) * .2;
        bug.sprite.position.set(bug.x, bug.y, 5);
        (bug.sprite.material as THREE.SpriteMaterial).rotation = angle;
        const pulse = 1 + Math.sin(time * 14 + bug.phase) * .06, size = (bug.boss ? 110 : 64) * (small ? .85 : 1) * pulse;
        bug.sprite.scale.set(size, size, 1);
      }
    }

    while (waves.length && time - waves[0].t > 1.2) waves.shift();
    const repel = small ? 70 : 130, hot = state.mode === 'playing';
    for (let i = 0; i < COUNT; i++) {
      let ax = (hx[i] - px[i]) * .012, ay = (hy[i] - py[i]) * .012;
      ax += Math.sin(time * 1.3 + seed[i]) * .03; ay += Math.cos(time * 1.1 + seed[i] * 1.3) * .03;
      if (pointer.inside && !hot) {
        const dx = px[i] - pointer.x, dy = py[i] - pointer.y, d2 = dx * dx + dy * dy;
        if (d2 < repel * repel) { const d = Math.sqrt(d2) + .1, f = (1 - d / repel) ** 2 * 3.2; ax += dx / d * f; ay += dy / d * f; }
      }
      for (const w of waves) {
        const age = time - w.t, r = age * 900, dx = px[i] - w.x, dy = py[i] - w.y, d = Math.hypot(dx, dy) + .1, band = Math.abs(d - r);
        if (band < 60) { const f = (1 - band / 60) * (1 - age / 1.2) * w.power * 1.5 * Math.max(0, 1 - r / (420 + w.power * 160)); ax += dx / d * f; ay += dy / d * f; }
      }
      vx[i] = (vx[i] + ax * step) * .9; vy[i] = (vy[i] + ay * step) * .9;
      px[i] += vx[i] * step; py[i] += vy[i] * step;
      corrupt[i] = Math.max(0, corrupt[i] - dt * (hot ? .18 : .6));
      const speed = Math.min(1, Math.hypot(vx[i], vy[i]) / 9), t = px[i] / W, c = corrupt[i];
      // Cyan → white → brand blue across the word; hot orange where bugs hit; brighter when moving.
      const mid = Math.max(0, 1 - Math.abs(t - .5) * 2.2);
      let r = .3 + .7 * mid, g = .72 + .28 * mid, b = 1;
      r += speed * .5; g += speed * .25;
      r = r * (1 - c) + 1 * c; g = g * (1 - c) + .38 * c; b = b * (1 - c) + .2 * c;
      pos.setXYZ(i, px[i], py[i], 0); col.setXYZ(i, r * .62, g * .88, b);
      siz.setX(i, (small ? 1.9 : 2.1) + speed * 1.8 + c * 1.4);
    }
    pos.needsUpdate = col.needsUpdate = siz.needsUpdate = true;

    for (let i = 0; i < STARS; i++) {
      sy[i] -= (.08 + sz[i] * .35) * step; if (sy[i] < -4) { sy[i] = H + 4; sx[i] = Math.random() * W; }
      const twinkle = .25 + .25 * Math.sin(time * 2 + i);
      starPos.setXYZ(i, sx[i] + (pointer.inside ? (pointer.x - W / 2) * -.015 * sz[i] : 0), sy[i], -1);
      starCol.setXYZ(i, .3 * twinkle + .1, .55 * twinkle + .15, .9 * twinkle + .2); starSize.setX(i, .7 + sz[i] * 1.4);
    }
    starPos.needsUpdate = starCol.needsUpdate = starSize.needsUpdate = true;

    for (let k = sparks.length - 1; k >= 0; k--) {
      const s = sparks[k]; s.life -= dt; if (s.life <= 0) { sparks.splice(k, 1); continue; }
      s.vx *= .94; s.vy = s.vy * .94 + .12; s.x += s.vx * step; s.y += s.vy * step;
    }
    for (let k = 0; k < SPARKS; k++) {
      const s = sparks[k];
      if (s) { const a = s.life / s.max; sparkPos.setXYZ(k, s.x, s.y, 2); sparkCol.setXYZ(k, s.r * a, s.g * a, s.b * a); sparkSize.setX(k, 1.6 + a * 3.4); }
      else sparkSize.setX(k, 0);
    }
    sparkPos.needsUpdate = sparkCol.needsUpdate = sparkSize.needsUpdate = true;

    shake *= .86;
    camera.position.set((Math.random() - .5) * shake, (Math.random() - .5) * shake, 10);
  }

  function render() { renderer.render(scene, camera); }
  function loop(now: number) {
    const dt = Math.min((now - last) / 1000, .05); last = now;
    if (running && !document.hidden) { update(dt); render(); }
    frame = requestAnimationFrame(loop);
  }

  const resize = new ResizeObserver(() => { layout(); if (!opts.animate) { settle(); render(); } });
  function settle() { for (let i = 0; i < COUNT; i++) { px[i] = hx[i]; py[i] = hy[i]; vx[i] = vy[i] = 0; } update(0); }

  const engine: HeroEngine = {
    setRunning(next) { if (!opts.animate) return; running = next; last = performance.now(); },
    start() {
      if (!opts.animate) return;
      Object.assign(state, { mode: 'playing', score: 0, wave: 0, integrity: 100, combo: 0, banner: '' });
      for (const bug of [...bugs]) removeBug(bug);
      assign(coreShape, true); shockwave(W / 2, coreY, 2);
      startWave();
    },
    quit() {
      // Ending a run that scored goes to game over, so the points can still be submitted and shared.
      if (state.mode === 'playing' && state.score > 0) { gameOver(); return; }
      for (const bug of [...bugs]) removeBug(bug);
      if (state.score > state.best) { state.best = state.score; saveBest(state.best); }
      Object.assign(state, { mode: 'idle', banner: '', combo: 0 });
      wordIndex = 0; assign(shapes[0], true); nextMorph = time + 3.8; emit();
    },
    zapNearest() {
      if (state.mode !== 'playing') return;
      const target = [...bugs].sort((a, b) => Math.hypot(a.x - a.tx, a.y - a.ty) - Math.hypot(b.x - b.tx, b.y - b.ty))[0];
      if (target) hitBug(target);
    },
    dispose() {
      cancelAnimationFrame(frame); resize.disconnect();
      canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerleave', onLeave); canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
      for (const bug of [...bugs]) removeBug(bug);
      for (const cloud of [particles, stars, sparkCloud]) { cloud.geometry.dispose(); (cloud.material as THREE.Material).dispose(); }
      bugTex.dispose(); bossTex.dispose(); renderer.dispose();
    },
  };

  layout();
  if (opts.animate) { scatterIn(); frame = requestAnimationFrame(loop); } else settle();
  render();
  resize.observe(canvas);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('keydown', onKey);
  emit();
  return engine;
}
