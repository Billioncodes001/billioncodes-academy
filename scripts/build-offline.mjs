import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const files = [], hash = createHash('sha256');
let bytes = 0;
async function walk(path, prefix = '') {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const relative = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) { if (['/assets', '/brand', '/images', '/font-licenses'].some(root => relative === root || relative.startsWith(root + '/'))) await walk(join(path, entry.name), relative); continue; }
    if (['/index.html', '/manifest.webmanifest'].includes(relative) || (/^\/(assets|brand|images|font-licenses)\//.test(relative) && /\.(js|css|woff2?|svg|webp|png|txt)$/.test(relative))) {
      const content = await readFile(join(path, entry.name));
      files.push(relative); hash.update(relative).update(content); bytes += content.length;
    }
  }
}
await walk('dist');
if (!files.includes('/index.html') || files.some(file => /^\/(api|admin)/.test(file))) throw new Error('Unsafe offline manifest');
if (bytes > 8_000_000) throw new Error('Offline download exceeds the 8 MB budget');
const template = await readFile('public/sw.js', 'utf8');
hash.update(template).update(await readFile('public/_headers', 'utf8'));
const version = hash.digest('hex').slice(0, 16);
await writeFile('dist/sw.js', template.replace('__BC_VERSION__', version).replace('/*__BC_FILES__*/ []', JSON.stringify(files.sort())));
await writeFile('dist/offline-manifest.json', JSON.stringify({ version, bytes, files: files.length }));
console.log(`Offline public bundle: ${files.length} files, ${(bytes / 1_000_000).toFixed(2)} MB. Private routes excluded.`);
