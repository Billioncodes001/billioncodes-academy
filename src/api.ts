import { parseCatalog, type Catalog } from '@billioncodes/learning';
export type { Lesson, Course, Catalog } from '@billioncodes/learning';

export class ApiError extends Error {
  fields: Record<string, string>;
  constructor(message: string, fields: Record<string, unknown> = {}) {
    super(message);
    this.fields = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, Array.isArray(value) ? value.join(' ') : String(value)]));
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(path, { ...init, signal: controller.signal, headers: { Accept: 'application/json', ...init.headers } });
    let body;
    try {
      const content = await response.text();
      if (content.length > 510000) throw new Error('Response is too large');
      body = JSON.parse(content);
    } catch { throw new ApiError('The service returned an unreadable response. Please try again.'); }
    if (!response.ok) throw new ApiError(body.error || 'The request could not be completed. Please try again.', body.fields);
    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('We could not reach the service. Check your connection and try again.');
  } finally { window.clearTimeout(timeout); }
}

export function isCatalog(value: unknown): value is Catalog {
  return parseCatalog(value) !== null;
}
