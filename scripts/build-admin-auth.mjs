// Bundles the staff sign-in helper for the private console into one self-contained file.
// It is not part of the offline bundle (build-offline.mjs only caches public paths).
import { build } from 'esbuild';

export async function bundleAdminAuth(write = true) {
  const result = await build({
    entryPoints: [new URL('../src/admin/staffAuth.ts', import.meta.url).pathname],
    bundle: true, format: 'iife', platform: 'browser', target: 'es2022', minify: true, legalComments: 'none',
    write, outfile: new URL('../dist/admin-auth.js', import.meta.url).pathname
  });
  return write ? null : result.outputFiles[0].text;
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  await bundleAdminAuth();
  console.log('Staff console sign-in bundle written to dist/admin-auth.js.');
}
