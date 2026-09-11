import { useSyncExternalStore } from 'react';
import { emptyProgress, normalizeProgress, WORKSPACE_KEY, CATALOG_KEY, parseCatalog, type Progress, type Catalog } from '@billioncodes/learning';

type Snapshot = { progress: Progress; notice: string; saving: boolean };
const listeners = new Set<() => void>();
let snapshot: Snapshot | undefined;
type Update = (current: Progress) => Progress;
const pending: Update[] = [];
let saving = false;
function load(): Snapshot {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    if (raw && raw.length > 1000000) throw new Error('oversized');
    const progress = raw ? normalizeProgress(JSON.parse(raw)) : emptyProgress();
    if (!raw) {
      // Preserve the launch reader's records when upgrading to the shared workspace.
      for (const courseId of ['first-web-page', 'web-foundations-intro']) {
        const legacy = localStorage.getItem(`billioncodes:progress:v1:${courseId}`);
        if (legacy && legacy.length < 10000) {
          const migrated = normalizeProgress({ ...progress, read: { ...progress.read, [courseId]: JSON.parse(legacy) } });
          progress.read = migrated.read;
        }
      }
    }
    return { progress, notice: '', saving: false };
  } catch { return { progress: emptyProgress(), notice: 'Saved progress could not be read. New changes will start a fresh local record if storage is available.', saving: false }; }
}
const getSnapshot = () => snapshot ??= load();
function emit() { listeners.forEach(listener => listener()); }
window.addEventListener('storage', event => {
  if (event.key === WORKSPACE_KEY || event.key === null) {
    const latest = load();
    snapshot = { ...latest, saving: pending.length > 0, progress: pending.reduce((value, update) => update(value), latest.progress) }; emit();
  }
});
window.addEventListener('beforeunload', event => { if (pending.length) { event.preventDefault(); event.returnValue = ''; } });
const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };
export function useWorkspace() { return useSyncExternalStore(subscribe, getSnapshot); }
function commitNext() {
  const latest = load();
  const progress = pending[0](latest.notice ? getSnapshot().progress : latest.progress);
  let notice = '';
  try { localStorage.setItem(WORKSPACE_KEY, JSON.stringify(progress)); }
  catch { notice = 'Browser storage is unavailable. Changes last only while this page stays open.'; }
  pending.shift();
  snapshot = { progress: pending.reduce((value, update) => update(value), progress), notice, saving: pending.length > 0 }; emit();
}
async function persist() {
  if (saving) return;
  saving = true;
  try {
    while (pending.length) {
      if (navigator.locks) {
        try { await navigator.locks.request(WORKSPACE_KEY, commitNext); }
        catch { if (pending.length) commitNext(); }
      }
      else commitNext();
    }
  } finally { saving = false; }
}
export function changeProgress(update: Update) {
  snapshot = { ...getSnapshot(), saving: true, progress: update(getSnapshot().progress) };
  pending.push(update); emit();
  void persist();
}
export function resetWorkspace() {
  changeProgress(() => emptyProgress());
  try {
    for (const courseId of ['first-web-page', 'web-foundations-intro']) localStorage.removeItem(`billioncodes:progress:v1:${courseId}`);
  } catch { /* Memory-only notice is already supplied by changeProgress. */ }
}
export function readDownload(): { catalog: Catalog; savedAt: string } | null {
  try {
    const raw = localStorage.getItem(CATALOG_KEY);
    if (!raw || raw.length > 510000) return null;
    const data = JSON.parse(raw);
    const catalog = parseCatalog(data.catalog);
    if (data.version !== 1 || !catalog || typeof data.savedAt !== 'string' || !Number.isFinite(Date.parse(data.savedAt))) return null;
    return { catalog, savedAt: data.savedAt };
  } catch { return null; }
}
export function saveDownload(catalog: Catalog) {
  const checked = parseCatalog(catalog);
  if (!checked) throw new Error('The catalogue could not be saved.');
  const savedAt = new Date().toISOString();
  localStorage.setItem(CATALOG_KEY, JSON.stringify({ version: 1, savedAt, catalog: checked }));
  return savedAt;
}
export function removeDownload() { localStorage.removeItem(CATALOG_KEY); }
