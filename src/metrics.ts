// Anonymous learning-funnel measurement. Each step counts at most once per browser tab,
// so the funnel reads as "visits that reached this step". No cookies, IDs or personal data;
// the server stores daily totals only. Visitors with Do Not Track or Global Privacy Control
// switched on are never counted. Failures are ignored: measurement must not disturb learning.
export type FunnelEvent = 'home_view' | 'start_path' | 'lesson_view' | 'walkthrough_used' | 'lesson_complete' | 'practice_view' | 'practice_check' | 'practice_pass' | 'course_enrol' | 'training_view' | 'application_submitted' | 'game_play';

const KEY = 'bc-funnel-sent';
const sent = new Set<string>(read());

function read(): string[] {
  try { return JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function optedOut() {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.globalPrivacyControl === true || nav.doNotTrack === '1' || (window as Window & { doNotTrack?: string }).doNotTrack === '1';
}
const safe = (value: string) => value.toLowerCase().replace(/[^a-z0-9:-]/g, '-').replace(/^-+/, '').slice(0, 161);

export function track(event: FunnelEvent, subject = '') {
  try {
    if (optedOut() || navigator.webdriver) return;
    const clean = safe(subject), key = `${event}|${clean}`;
    if (sent.has(key)) return;
    sent.add(key);
    try { sessionStorage.setItem(KEY, JSON.stringify([...sent].slice(-200))); } catch { /* Per-tab memory still prevents repeats. */ }
    const body = JSON.stringify(clean ? { event, subject: clean } : { event });
    const blob = new Blob([body], { type: 'application/json' });
    if (!navigator.sendBeacon?.('/api/v1/metrics', blob)) fetch('/api/v1/metrics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch { /* Never let measurement break a page. */ }
}
