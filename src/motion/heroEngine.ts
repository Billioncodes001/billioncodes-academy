import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// "Bug Hunt": a living city of code blocks that ripples under the cursor.
// Glowing bugs drift above it; squash them to send shockwaves through the city.

export type HeroStats = { fixed: number; level: number; combo: number };
export type HeroEngine = { dispose: () => void; setRunning: (running: boolean) => void; squashNearest: () => void; reset: () => void };

type Bug = { group: THREE.Group; hit: THREE.Mesh; seed: number; alive: boolean; respawnAt: number; pos: THREE.Vector3 };
type Wave = { x: number; z: number; t: number; strength: number };
type Burst = { points: THREE.Points; velocities: Float32Array; born: number };

const NAVY = new THREE.Color('#05182a');
const BASE = new THREE.Color('#0f3b5e');
const DEEP = new THREE.Color('#145f93');
const BLUE = new THREE.Color('#2a93d8');
const ICE = new THREE.Color('#8fd3ff');
const BUG = new THREE.Color('#ff7a45');

function glowTexture() {
  const size = 128, canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.25, 'rgba(255,170,120,.7)'); g.addColorStop(1, 'rgba(255,122,69,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

export function createHeroEngine(canvas: HTMLCanvasElement, opts: { animate: boolean; onStats: (stats: HeroStats) => void; onHover: (hovering: boolean) => void }): HeroEngine {
  const small = window.innerWidth < 760;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !small, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.background = NAVY;
  scene.fog = new THREE.Fog(NAVY, 34, 80);
  const camera = new THREE.PerspectiveCamera(small ? 55 : 42, 1, .1, 200);

  scene.add(new THREE.AmbientLight('#7fb6dd', 1.6));
  scene.add(new THREE.HemisphereLight('#bfe6ff', '#05182a', 1.1));
  const sun = new THREE.DirectionalLight('#e6f4ff', 2.4);
  sun.position.set(-12, 30, 10); scene.add(sun);
  const cursorLight = new THREE.PointLight('#5cc8ff', 60, 18, 1.6);
  scene.add(cursorLight);

  // The city: one instanced mesh, so thousands of blocks cost a single draw call.
  const N = small ? 26 : 40, SPACING = 1.12, half = (N - 1) * SPACING / 2;
  const blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: .35, metalness: .25 }), N * N);
  blocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const heat = new Float32Array(N * N);
  scene.add(blocks);
  const dummy = new THREE.Object3D(), color = new THREE.Color();

  // Bugs: glowing octahedra with a halo sprite and a generous invisible hit sphere.
  const halo = glowTexture();
  const bugGeo = new THREE.OctahedronGeometry(.42, 0);
  const bugMat = new THREE.MeshStandardMaterial({ color: BUG, emissive: BUG, emissiveIntensity: 2.4, roughness: .3 });
  const hitGeo = new THREE.SphereGeometry(1.5, 8, 8), hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const bugs: Bug[] = Array.from({ length: small ? 5 : 8 }, (_, i) => {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(bugGeo, bugMat));
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, color: BUG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sprite.scale.setScalar(2.6); group.add(sprite);
    const hit = new THREE.Mesh(hitGeo, hitMat); group.add(hit);
    scene.add(group);
    return { group, hit, seed: i * 17.3 + Math.random() * 10, alive: true, respawnAt: 0, pos: new THREE.Vector3() };
  });

  let composer: EffectComposer | null = null;
  if (!small) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), .85, .55, .62));
    composer.addPass(new OutputPass());
  }

  const stats: HeroStats = { fixed: 0, level: 1, combo: 0 };
  let lastSquash = -10;
  const waves: Wave[] = [], bursts: Burst[] = [];
  const pointer = new THREE.Vector2(9, 9), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), groundHit = new THREE.Vector3(999, 0, 999);
  const raycaster = new THREE.Raycaster();
  let parallaxX = 0, parallaxY = 0, running = opts.animate, frame = 0, time = 0, last = performance.now();

  function size() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    composer?.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  function bugPath(bug: Bug, t: number) {
    const s = bug.seed, speed = .18 + stats.level * .04;
    bug.pos.set(Math.sin(t * speed + s) * half * .78, 4.2 + Math.sin(t * 1.3 + s) * .9, Math.cos(t * speed * .8 + s * 1.7) * half * .7);
  }

  function burst(at: THREE.Vector3) {
    const count = 70, positions = new Float32Array(count * 3), velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions.set([at.x, at.y, at.z], i * 3);
      const theta = Math.random() * Math.PI * 2, phi = Math.acos(2 * Math.random() - 1), speed = 4 + Math.random() * 7;
      velocities.set([Math.sin(phi) * Math.cos(theta) * speed, Math.abs(Math.cos(phi)) * speed * .9 + 2, Math.sin(phi) * Math.sin(theta) * speed], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(geo, new THREE.PointsMaterial({ map: halo, color: '#ffb48a', size: .7, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(points);
    bursts.push({ points, velocities, born: time });
  }

  function squash(bug: Bug) {
    if (!bug.alive) return;
    bug.alive = false; bug.group.visible = false; bug.respawnAt = time + 1.4;
    burst(bug.pos.clone());
    waves.push({ x: bug.pos.x, z: bug.pos.z, t: time, strength: 3.2 });
    stats.combo = time - lastSquash < 2.2 ? stats.combo + 1 : 1;
    lastSquash = time;
    stats.fixed += 1;
    stats.level = 1 + Math.floor(stats.fixed / 5);
    if (stats.fixed % 5 === 0) waves.push({ x: 0, z: 0, t: time, strength: 5 });
    opts.onStats({ ...stats });
  }

  function pick(clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(bugs.filter(b => b.alive).map(b => b.hit), false);
    return hits.length ? bugs.find(b => b.hit === hits[0].object) ?? null : null;
  }

  function onMove(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    parallaxX = pointer.x; parallaxY = pointer.y;
    raycaster.setFromCamera(pointer, camera);
    if (!raycaster.ray.intersectPlane(ground, groundHit)) groundHit.set(999, 0, 999);
    if (running) opts.onHover(Boolean(pick(event.clientX, event.clientY)));
  }
  function onLeave() { groundHit.set(999, 0, 999); parallaxX = parallaxY = 0; opts.onHover(false); }
  function onDown(event: PointerEvent) {
    if (!running) return;
    const bug = pick(event.clientX, event.clientY);
    if (bug) squash(bug);
    else {
      raycaster.setFromCamera(pointer, camera);
      if (raycaster.ray.intersectPlane(ground, groundHit)) waves.push({ x: groundHit.x, z: groundHit.z, t: time, strength: 1.4 });
    }
  }

  function update(dt: number) {
    time += dt;
    // Camera: a slow orbit plus pointer parallax.
    const orbit = time * .05, radius = small ? 34 : 30;
    camera.position.set(Math.sin(orbit) * radius * .35 + parallaxX * 2.5, (small ? 26 : 19) + parallaxY * 1.5, Math.cos(orbit) * radius * .2 + radius);
    camera.lookAt(0, small ? -2 : 0, 0);
    cursorLight.position.set(groundHit.x, 3.5, groundHit.z);

    while (waves.length && time - waves[0].t > 3.5) waves.shift();
    for (let ix = 0; ix < N; ix++) {
      for (let iz = 0; iz < N; iz++) {
        const i = ix * N + iz, x = ix * SPACING - half, z = iz * SPACING - half;
        let h = 1.1 + Math.sin(x * .32 + time * .9) * Math.cos(z * .27 + time * .7) * 1.1 + Math.sin((x + z) * .12 + time * .4) * .8;
        const pd = Math.hypot(x - groundHit.x, z - groundHit.z);
        let glow = 0;
        if (pd < 6) { const k = 1 - pd / 6; h += k * k * 3.2; glow = k; }
        for (const wave of waves) {
          const age = time - wave.t, r = age * 13, band = Math.abs(Math.hypot(x - wave.x, z - wave.z) - r);
          if (band < 2.2) { const k = (1 - band / 2.2) * (1 - age / 3.5) * wave.strength; h += k * 1.6; glow = Math.max(glow, k * .7); }
        }
        heat[i] += (glow - heat[i]) * Math.min(1, dt * 8);
        h = Math.max(.25, h);
        dummy.position.set(x, h / 2, z); dummy.scale.set(1, h, 1); dummy.updateMatrix();
        blocks.setMatrixAt(i, dummy.matrix);
        const tone = Math.min(1, h / 5);
        color.copy(BASE).lerp(DEEP, Math.min(1, tone * 1.6)).lerp(BLUE, Math.max(0, tone - .35)).lerp(ICE, Math.min(1, heat[i]));
        blocks.setColorAt(i, color);
      }
    }
    blocks.instanceMatrix.needsUpdate = true;
    if (blocks.instanceColor) blocks.instanceColor.needsUpdate = true;

    for (const bug of bugs) {
      if (!bug.alive && time > bug.respawnAt) { bug.alive = true; bug.group.visible = true; bug.seed += 3.7; }
      bugPath(bug, time);
      bug.group.position.copy(bug.pos);
      bug.group.children[0].rotation.set(time * 1.8 + bug.seed, time * 2.3, 0);
      const pulse = 1 + Math.sin(time * 6 + bug.seed) * .12;
      bug.group.scale.setScalar(bug.alive ? pulse : 0);
    }

    for (let b = bursts.length - 1; b >= 0; b--) {
      const item = bursts[b], age = time - item.born;
      const pos = item.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        item.velocities[i * 3 + 1] -= 14 * dt;
        pos.setXYZ(i, pos.getX(i) + item.velocities[i * 3] * dt, Math.max(.2, pos.getY(i) + item.velocities[i * 3 + 1] * dt), pos.getZ(i) + item.velocities[i * 3 + 2] * dt);
      }
      pos.needsUpdate = true;
      (item.points.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - age / 1.3);
      if (age > 1.3) { scene.remove(item.points); item.points.geometry.dispose(); (item.points.material as THREE.Material).dispose(); bursts.splice(b, 1); }
    }
  }

  function render() { if (composer) composer.render(); else renderer.render(scene, camera); }

  function loop(now: number) {
    const dt = Math.min((now - last) / 1000, .05);
    last = now;
    if (running && !document.hidden) { update(dt); render(); }
    frame = requestAnimationFrame(loop);
  }

  const observer = new ResizeObserver(size);
  observer.observe(canvas);
  size();
  update(1.2); render();
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('pointerdown', onDown);
  if (opts.animate) frame = requestAnimationFrame(loop);

  return {
    setRunning(next) {
      if (!opts.animate) return;
      running = next; last = performance.now();
    },
    squashNearest() {
      const target = bugs.filter(b => b.alive).sort((a, b) => a.pos.lengthSq() - b.pos.lengthSq())[0];
      if (target) squash(target);
    },
    reset() { stats.fixed = 0; stats.level = 1; stats.combo = 0; opts.onStats({ ...stats }); waves.push({ x: 0, z: 0, t: time, strength: 4 }); },
    dispose() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onDown);
      scene.traverse(object => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(material) ? material : material ? [material] : []).forEach(m => m.dispose());
      });
      halo.dispose();
      composer?.dispose();
      renderer.dispose();
    },
  };
}
