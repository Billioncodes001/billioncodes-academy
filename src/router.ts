import { useEffect, useState } from 'react';

// Real page addresses (/learn/first-web-page) instead of #/ routes, so every page can be
// found, shared and indexed. Older #/ links keep working: they are rewritten on load.
const EVENT = 'bc:navigate';
const SERVER_PATHS = /^\/(api|admin|c)(\/|$)|\.[a-z0-9]{2,5}$/i;

export function legacyHashToPath() {
  const { hash, search } = window.location;
  if (!hash.startsWith('#/')) return;
  const target = new URL(hash.slice(1), window.location.origin);
  const query = new URLSearchParams(search);
  target.searchParams.forEach((value, key) => query.set(key, value));
  const rest = query.toString();
  history.replaceState(history.state, '', target.pathname + (rest ? `?${rest}` : ''));
}

export function currentRoute() {
  const path = window.location.pathname.replace(/\/+$/, '');
  return path || '/';
}

export function navigate(path: string, { replace = false } = {}) {
  if (replace) history.replaceState(null, '', path); else history.pushState(null, '', path);
  window.dispatchEvent(new Event(EVENT));
}

export function useRoute() {
  const [route, setRoute] = useState(currentRoute);
  useEffect(() => {
    const change = () => setRoute(currentRoute());
    window.addEventListener('popstate', change);
    window.addEventListener(EVENT, change);
    return () => { window.removeEventListener('popstate', change); window.removeEventListener(EVENT, change); };
  }, []);
  return route;
}

// Same-site links navigate inside the app without a full reload. New tabs, downloads,
// modified clicks and server-handled paths (API, admin, challenge links, files) are left alone.
export function installLinkHandler() {
  // An old #/ link followed while the app is open only changes the hash; convert it too.
  window.addEventListener('hashchange', () => {
    if (!window.location.hash.startsWith('#/')) return;
    legacyHashToPath();
    window.dispatchEvent(new Event(EVENT));
  });
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element | null)?.closest?.('a');
    if (!link || link.target && link.target !== '_self' || link.hasAttribute('download')) return;
    const href = link.getAttribute('href') || '';
    if (!href.startsWith('/') || href.startsWith('//')) return;
    const url = new URL(href, window.location.origin);
    if (SERVER_PATHS.test(url.pathname)) return;
    event.preventDefault();
    if (url.pathname + url.search !== window.location.pathname + window.location.search) navigate(url.pathname + url.search);
    else window.dispatchEvent(new Event(EVENT));
  });
}
