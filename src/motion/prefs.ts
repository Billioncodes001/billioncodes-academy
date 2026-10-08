import { useSyncExternalStore } from 'react';

// One switch for every moving thing on the site. It starts from the visitor's
// operating-system preference and Save-Data, and the header toggle can override it.
const KEY = 'bc-motion';
const listeners = new Set<() => void>();

function systemAllowsMotion() {
  if (typeof window === 'undefined') return false;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  return !reduced && !saveData;
}

function readChoice(): boolean | null {
  try { const value = localStorage.getItem(KEY); return value === 'on' ? true : value === 'off' ? false : null; } catch { return null; }
}

let enabled = typeof window === 'undefined' ? false : (readChoice() ?? systemAllowsMotion());

function apply() {
  document.documentElement.dataset.motion = enabled ? 'on' : 'off';
  listeners.forEach(listener => listener());
}

if (typeof window !== 'undefined') {
  apply();
  window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => {
    if (readChoice() === null) { enabled = systemAllowsMotion(); apply(); }
  });
}

export function setMotion(next: boolean) {
  enabled = next;
  try { localStorage.setItem(KEY, next ? 'on' : 'off'); } catch { /* Storage can be unavailable; the choice still lasts for this tab. */ }
  apply();
}

export function motionEnabled() { return enabled; }

export function useMotionEnabled() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => enabled, () => false);
}

export function canUseWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch { return false; }
}
