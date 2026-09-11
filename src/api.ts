export type Lesson = { id: string; title: string; body: string[] };
export type Course = { id: string; title: string; level: string; format: string; summary: string; lessons: Lesson[] };
export type Catalog = { courses: Course[]; training: { status: string }; payments: { enabled: boolean } };

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
    try { body = await response.json(); } catch { throw new ApiError('The service returned an unreadable response. Please try again.'); }
    if (!response.ok) throw new ApiError(body.error || 'The request could not be completed. Please try again.', body.fields);
    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('We could not reach the service. Check your connection and try again.');
  } finally { window.clearTimeout(timeout); }
}

export function isCatalog(value: unknown): value is Catalog {
  if (!value || typeof value !== 'object') return false;
  const data = value as Catalog;
  return Array.isArray(data.courses) && data.courses.every(course =>
    course && ['id', 'title', 'level', 'format', 'summary'].every(key => typeof course[key as keyof Course] === 'string') &&
    Array.isArray(course.lessons) && course.lessons.every(lesson => lesson && typeof lesson.id === 'string' && typeof lesson.title === 'string' && Array.isArray(lesson.body) && lesson.body.every(line => typeof line === 'string'))
  ) && typeof data.training?.status === 'string' && typeof data.payments?.enabled === 'boolean';
}
