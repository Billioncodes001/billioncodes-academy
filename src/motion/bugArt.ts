// The Debug Defender bug, drawn on a 2D canvas. Shared by the game's sprites and
// the share card so both show exactly the same creature.
// Draws a bug centred on (x, y), facing `angle`, on a 128-unit design grid scaled to `size`.
export function drawBug(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, angle = 0, boss = false) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(angle); ctx.scale(size / 128, size / 128);
  const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 64);
  glow.addColorStop(0, boss ? 'rgba(255,60,90,.9)' : 'rgba(255,120,60,.85)'); glow.addColorStop(.45, boss ? 'rgba(255,40,80,.25)' : 'rgba(255,110,50,.22)'); glow.addColorStop(1, 'rgba(255,90,40,0)');
  ctx.fillStyle = glow; ctx.fillRect(-64, -64, 128, 128);
  ctx.strokeStyle = boss ? '#ffd0d8' : '#ffe0c8'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  for (const side of [-1, 1]) for (const k of [-1, 0, 1]) { ctx.beginPath(); ctx.moveTo(side * 10, k * 11); ctx.lineTo(side * 30, k * 15 + 6 * k); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(22, -7); ctx.lineTo(36, -16); ctx.moveTo(22, 7); ctx.lineTo(36, 16); ctx.stroke();
  ctx.fillStyle = boss ? '#ff3d6a' : '#ff7a45';
  ctx.beginPath(); ctx.ellipse(-2, 0, 20, 15, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = boss ? '#ffb3c4' : '#ffc7a3';
  ctx.beginPath(); ctx.ellipse(18, 0, 9, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(80,10,0,.55)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(14, 0); ctx.stroke();
  ctx.restore();
}
