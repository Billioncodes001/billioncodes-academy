import { normalizeProgress, parseCatalog, type Catalog, type Progress } from '@billioncodes/learning';

export const PUBLIC_SITE = 'https://learnatbillioncodes.com';
export const CATALOG_URL = `${PUBLIC_SITE}/api/v1/catalog`;
export const TRAINING_URL = `${PUBLIC_SITE}/#/training`;
export const MAX_CATALOG_BYTES = 512 * 1024;
export type Download = { version: 1; savedAt: string; catalog: Catalog };

function safeCatalog(value: unknown): Catalog | null {
  const catalog = parseCatalog(value);
  // Shared v1 progress uses object keys; do not accept inherited property names.
  return catalog?.courses.some(course => Object.hasOwn(Object.prototype, course.id)) ? null : catalog;
}

export function decodeProgress(raw: string): Progress {
  if (raw.length > 1_000_000) throw new Error('Oversized progress');
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1) {
    throw new Error('Unsupported progress version');
  }
  return normalizeProgress(value);
}

export function decodeDownload(raw: string): Download {
  if (raw.length > MAX_CATALOG_BYTES + 1024) throw new Error('Oversized download');
  const value = JSON.parse(raw);
  const catalog = safeCatalog(value?.catalog);
  const savedTime = typeof value?.savedAt === 'string' ? Date.parse(value.savedAt) : NaN;
  if (value?.version !== 1 || !catalog || !Number.isFinite(savedTime) || savedTime < 0 || savedTime > Date.now() + 60000) {
    throw new Error('Invalid saved catalog');
  }
  return { version: 1, savedAt: new Date(savedTime).toISOString(), catalog };
}

export async function fetchCatalog(fetcher: typeof fetch = fetch, timeoutMs = 12000): Promise<Catalog> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(CATALOG_URL, {
      method: 'GET', headers: { Accept: 'application/json' }, signal: controller.signal,
      credentials: 'omit',
    });
    if (!response.ok) throw new Error(`Catalog service returned ${response.status}. Try again shortly.`);
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('The catalog response was not JSON.');
    if (Number(response.headers.get('content-length')) > MAX_CATALOG_BYTES) throw new Error('The catalog response was too large.');
    const reader = response.body?.getReader();
    let text = '';
    if (reader) {
      const decoder = new TextDecoder();
      let bytes = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > MAX_CATALOG_BYTES) {
            await reader.cancel();
            throw new Error('The catalog response was too large.');
          }
          text += decoder.decode(chunk.value, { stream: true });
        }
        text += decoder.decode();
      } finally { reader.releaseLock(); }
    } else {
      text = await response.text();
      if (text.length > MAX_CATALOG_BYTES) throw new Error('The catalog response was too large.');
    }
    const catalog = safeCatalog(JSON.parse(text));
    if (!catalog) throw new Error('The catalog did not match the supported lesson format.');
    return catalog;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The catalog request timed out. Check your connection and retry.');
    if (error instanceof SyntaxError) throw new Error('The catalog response could not be read.');
    throw error;
  } finally { clearTimeout(timer); }
}
