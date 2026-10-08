import { request } from '../api';

export type BoardEntry = { rank: number; id: string; name: string; score: number; wave: number; createdAt: string };
export type Period = 'all' | 'week';

const NAME_KEY = 'bc-arcade-name';
const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// The server opens and times each run; a score can only be submitted against one.
export const startRun = () => request<{ runId: string }>('/api/v1/arcade/runs', { method: 'POST' }).then(data => data.runId);
export const fetchBoard = (period: Period) => request<{ entries: BoardEntry[] }>(`/api/v1/arcade/leaderboard?period=${period}`).then(data => data.entries);
export const submitScore = (runId: string, name: string, score: number, wave: number) =>
  request<{ entry: BoardEntry; top: BoardEntry[] }>('/api/v1/arcade/scores', json({ runId, name, score, wave }));

export function savedName() { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } }
export function saveName(name: string) { try { localStorage.setItem(NAME_KEY, name); } catch { /* Optional convenience only. */ } }
