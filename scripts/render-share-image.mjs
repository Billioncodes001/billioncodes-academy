// Renders public/brand/debug-defender-share-v1.jpg, the link-preview image for
// challenge links, with the same code that draws players' share cards.
// Start the dev server first, then:  node scripts/render-share-image.mjs [http://127.0.0.1:5174]
import { writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const base = process.argv[2] || 'http://127.0.0.1:5174';
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(base + '/');
  const render = data => page.evaluate(async card => {
    const { renderShareCard } = await import('/src/motion/shareCard.ts');
    const canvas = document.createElement('canvas');
    await renderShareCard(canvas, card);
    return canvas.toDataURL('image/png').split(',')[1];
  }, data);
  // JPEG keeps the preview small: WhatsApp drops previews above a few hundred KB.
  await sharp(Buffer.from(await render({ generic: true }), 'base64')).jpeg({ quality: 86, mozjpeg: true }).toFile('public/brand/debug-defender-share-v1.jpg');
  if (process.argv[3]) await writeFile(process.argv[3], Buffer.from(await render({ score: 4720, wave: 7, name: 'Ada', rank: 3 }), 'base64'));
  console.log('Wrote public/brand/debug-defender-share-v1.jpg');
} finally { await browser.close(); }
