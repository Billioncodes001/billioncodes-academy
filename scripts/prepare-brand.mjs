import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

await mkdir('public/images', { recursive: true });
for (const [input, output, width] of [
  ['.asset-sources/learner.jpg', 'hero-learner', 1200],
  ['.asset-sources/together.jpg', 'learning-together', 1200],
  ['.asset-sources/code.jpg', 'code-detail', 900],
]) {
  await sharp(input).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 82 }).toFile(`public/images/${output}.webp`);
}
if (process.argv[2]) await sharp(process.argv[2]).rotate().resize({ width: 720, withoutEnlargement: true }).webp({ quality: 88 }).toFile('public/images/founder.webp');
for (const size of [192, 512]) await sharp('public/brand/mark.svg').resize(size, size).png().toFile(`public/brand/icon-${size}.png`);
console.log('Optimized brand imagery and app icons. Stock photo credits are in docs/BRAND.md.');
