import { drawBug } from './bugArt';

// 1200 × 630 share card: the standard large-preview size for X, LinkedIn,
// WhatsApp and Facebook. Drawn locally from the player's real result.
export type CardData = { score: number; wave: number; name?: string; rank?: number } | { generic: true };
export const CARD_W = 1200, CARD_H = 630;

const HEADING = '"Bricolage Grotesque", "Space Grotesk", sans-serif';
const MONO = '"IBM Plex Mono", monospace';

function loadImage(src: string) {
  return new Promise<HTMLImageElement | null>(resolve => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

// Seeded random so the same result always produces the same card.
function seeded(seed: number) {
  let value = seed % 2147483647 || 1;
  return () => (value = value * 16807 % 2147483647) / 2147483647;
}

function fitText(ctx: CanvasRenderingContext2D, text: string, weight: number, maxWidth: number, start: number, family = HEADING) {
  let size = start;
  do { ctx.font = `${weight} ${size}px ${family}`; size -= 4; } while (ctx.measureText(text).width > maxWidth && size > 24);
  return size + 4;
}

export async function renderShareCard(canvas: HTMLCanvasElement, data: CardData) {
  canvas.width = CARD_W; canvas.height = CARD_H;
  const ctx = canvas.getContext('2d')!;
  await Promise.all([`800 120px ${HEADING}`, `700 40px ${HEADING}`, `500 28px ${HEADING}`, `400 20px ${MONO}`].map(font => document.fonts?.load(font).catch(() => undefined)));
  const logo = await loadImage('/brand/billioncodes-official-v1.jpeg');
  const generic = 'generic' in data;
  const random = seeded(generic ? 7 : data.score * 31 + data.wave);

  // Night sky with a blue bloom and a faint blueprint grid.
  const sky = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  sky.addColorStop(0, '#02070f'); sky.addColorStop(.6, '#061527'); sky.addColorStop(1, '#0a2440');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, CARD_W, CARD_H);
  const bloom = ctx.createRadialGradient(820, 300, 20, 820, 300, 520);
  bloom.addColorStop(0, 'rgba(92,200,255,.28)'); bloom.addColorStop(1, 'rgba(92,200,255,0)');
  ctx.fillStyle = bloom; ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.strokeStyle = 'rgba(92,200,255,.06)'; ctx.lineWidth = 1;
  for (let x = 0; x <= CARD_W; x += 48) { ctx.beginPath(); ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, CARD_H); ctx.stroke(); }
  for (let y = 0; y <= CARD_H; y += 48) { ctx.beginPath(); ctx.moveTo(0, y + .5); ctx.lineTo(CARD_W, y + .5); ctx.stroke(); }

  // A glowing </> core made of particles, like the game's code core.
  const core = document.createElement('canvas');
  core.width = 520; core.height = 320;
  const coreCtx = core.getContext('2d')!;
  coreCtx.fillStyle = '#fff'; coreCtx.textAlign = 'center'; coreCtx.textBaseline = 'middle';
  coreCtx.font = `800 250px ${HEADING}`; coreCtx.fillText('</>', 260, 165);
  const pixels = coreCtx.getImageData(0, 0, core.width, core.height).data;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let y = 0; y < core.height; y += 5) for (let x = 0; x < core.width; x += 5) {
    if (pixels[(y * core.width + x) * 4 + 3] < 128 || random() < .25) continue;
    const px = 600 + x + (random() - .5) * 3, py = 140 + y + (random() - .5) * 3, mid = 1 - Math.abs(x / core.width - .5) * 2;
    ctx.fillStyle = `rgba(${Math.round(90 + 165 * mid)}, ${Math.round(200 + 55 * mid)}, 255, ${.55 + random() * .4})`;
    ctx.beginPath(); ctx.arc(px, py, 1.4 + random() * 1.1, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  for (let i = 0; i < 140; i++) { ctx.fillStyle = `rgba(160, 210, 255, ${random() * .45})`; ctx.fillRect(random() * CARD_W, random() * CARD_H, 1.6, 1.6); }

  // Bugs closing in on the core.
  const bugs = [[1080, 110, 64, 2.5], [1110, 470, 58, 3.6], [560, 520, 52, -.6], [980, 560, 46, -2], [640, 90, 44, .9]];
  bugs.forEach(([x, y, size, angle], index) => drawBug(ctx, x, y, size, angle, !generic && index === 0 && data.wave >= 3));

  // Copy column.
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  ctx.fillStyle = '#8fd3ff'; ctx.font = `500 20px ${MONO}`;
  ctx.fillText('DEBUG DEFENDER', 64, 92);
  if (generic) {
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${fitText(ctx, 'Stop the bugs.', 800, 560, 92)}px ${HEADING}`;
    ctx.fillText('Stop the bugs.', 60, 205);
    ctx.fillStyle = '#5cc8ff';
    ctx.font = `800 ${fitText(ctx, 'Save the code.', 800, 560, 92)}px ${HEADING}`;
    ctx.fillText('Save the code.', 60, 300);
    ctx.fillStyle = '#c9dcee'; ctx.font = `500 28px ${HEADING}`;
    ctx.fillText('A free arcade game. Can you beat the top score?', 64, 368);
  } else {
    const score = data.score.toLocaleString('en-US');
    ctx.save(); ctx.shadowColor = 'rgba(92,200,255,.7)'; ctx.shadowBlur = 40; ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${fitText(ctx, score, 800, 540, 190)}px ${HEADING}`;
    ctx.fillText(score, 56, 270); ctx.restore();
    ctx.fillStyle = '#ffffff'; ctx.font = `700 34px ${HEADING}`;
    const who = data.name ? `${data.name} fixed the bugs.` : 'Bugs fixed. Code saved.';
    ctx.font = `700 ${fitText(ctx, who, 700, 540, 40)}px ${HEADING}`;
    ctx.fillText(who, 60, 330);
    ctx.fillStyle = '#a9c0d6'; ctx.font = `500 22px ${MONO}`;
    ctx.fillText(`POINTS · WAVE ${data.wave}${data.rank ? ` · #${data.rank} ON THE LEADERBOARD` : ''}`, 64, 372);
  }

  // Call to action pill.
  ctx.fillStyle = 'rgba(255,122,69,.16)'; ctx.strokeStyle = 'rgba(255,122,69,.7)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(60, 420, 470, 70, 18); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ffe0c8'; ctx.font = `700 28px ${HEADING}`;
  ctx.fillText(generic ? 'Play free in your browser' : 'Can you beat me?', 86, 465);
  drawBug(ctx, 490, 455, 40, 0);

  // Footer: logo and address.
  ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(0, CARD_H - 92, CARD_W, 92);
  if (logo) { ctx.save(); ctx.beginPath(); ctx.roundRect(60, CARD_H - 74, 56, 56, 10); ctx.clip(); ctx.drawImage(logo, 60, CARD_H - 74, 56, 56); ctx.restore(); }
  ctx.fillStyle = '#ffffff'; ctx.font = `700 26px ${HEADING}`;
  ctx.fillText('Billion Codes', 132, CARD_H - 38);
  ctx.fillStyle = '#8fd3ff'; ctx.font = `500 22px ${MONO}`; ctx.textAlign = 'right';
  ctx.fillText('learnatbillioncodes.com', CARD_W - 60, CARD_H - 38);
  ctx.textAlign = 'left';
}

export function cardBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('The image could not be created.')), 'image/png'));
}
