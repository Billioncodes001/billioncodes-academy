import { useSyncExternalStore } from 'react';

// Motion is an enhancement. Reduced motion, Save-Data and the on-page pause
// control all fall back to the same static, fully readable layout.
const reduceQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : undefined;
const pointerQuery = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(hover: hover) and (pointer: fine)') : undefined;
const pauseKey = 'bc-motion-paused';

export const prefersReducedMotion = () => Boolean(reduceQuery?.matches);
export const saveData = () => Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);
export const finePointer = () => Boolean(pointerQuery?.matches);
export const motionAllowed = () => !prefersReducedMotion() && !saveData();

function readPaused() {
  try { return sessionStorage.getItem(pauseKey) === '1'; } catch { return false; }
}

let paused = typeof window !== 'undefined' ? readPaused() : false;
const pauseListeners = new Set<() => void>();

export function setMotionPaused(value: boolean) {
  paused = value;
  document.documentElement.classList.toggle('motion-paused', value);
  try { sessionStorage.setItem(pauseKey, value ? '1' : '0'); } catch { /* Storage is optional for this preference. */ }
  pauseListeners.forEach(listener => listener());
}

export function useMotionPaused() {
  return useSyncExternalStore(listener => { pauseListeners.add(listener); return () => { pauseListeners.delete(listener); }; }, () => paused, () => false);
}

export function useReducedMotion() {
  return useSyncExternalStore(listener => { reduceQuery?.addEventListener('change', listener); return () => reduceQuery?.removeEventListener('change', listener); }, () => !motionAllowed(), () => true);
}

/** Marks the document so CSS only offsets reveal targets when motion will actually run. */
export function installMotionClass() {
  const apply = () => document.documentElement.classList.toggle('motion-ok', motionAllowed() && !paused);
  apply();
  document.documentElement.classList.toggle('motion-paused', paused);
  reduceQuery?.addEventListener('change', apply);
  pauseListeners.add(apply);
}
