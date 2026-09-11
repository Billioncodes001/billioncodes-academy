import { useState } from 'react';
import { challenges, normalizeProgress, primer, type Progress } from '@billioncodes/learning';
import { changeProgress, readDownload, removeDownload, resetWorkspace, saveDownload, useWorkspace } from './learningStore';
import type { CatalogState } from './useCatalog';

export function Workspace({ data }: { data: CatalogState }) {
  const { progress, notice } = useWorkspace();
  const [message, setMessage] = useState('');
  const [resetting, setResetting] = useState(false);
  const [restore, setRestore] = useState<Progress | null>(null);
  const [savedAt, setSavedAt] = useState(() => readDownload()?.savedAt || '');
  const [offline, setOffline] = useState(!!navigator.serviceWorker?.controller);
  const [installing, setInstalling] = useState(false);
  const courses = [primer, ...(data.catalog?.courses || []).filter(course => course.id !== primer.id)];
  const readCount = courses.reduce((count, course) => count + course.lessons.filter(lesson => progress.read[course.id]?.includes(lesson.id)).length, 0);
  const last = courses.find(course => course.id === progress.lastLesson?.courseId);
  function download() {
    const blob = new Blob([JSON.stringify(progress, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = 'billioncodes-learning-backup.json'; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importBackup(file: File | undefined) {
    if (!file) return;
    setRestore(null);
    try {
      if (file.size > 1000000) throw new Error();
      const raw = JSON.parse(await file.text());
      if (!raw || raw.version !== 1 || !raw.read || !raw.drafts || !raw.solved) throw new Error();
      setRestore(normalizeProgress(raw)); setMessage('Review the backup below before replacing your local record.');
    } catch { setMessage('That file is not a supported learning backup. Nothing has been replaced.'); }
  }
  async function enableOffline() {
    if (!('serviceWorker' in navigator)) { setMessage('This browser does not support offline installation. You can still use the learning desk online.'); return; }
    setInstalling(true);
    let timer: number | undefined;
    try {
      const manifest = await fetch('/offline-manifest.json');
      if (!manifest.ok || !(await manifest.json()).version) throw new Error('Production offline bundle unavailable');
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => { timer = window.setTimeout(() => reject(new Error()), 30000); })]);
      setOffline(true);
      setMessage(registration.waiting ? 'A new offline version is ready. Close other site tabs and reopen when you have finished your work.' : 'The app shell and built-in exercises are ready offline. Save the live catalogue separately below for those lessons.');
    } catch { setMessage('Offline setup did not finish. Keep a connection and try again. Nothing has been submitted or paid.'); }
    finally { window.clearTimeout(timer); setInstalling(false); }
  }
  async function disableOffline() {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) if ([registration.active, registration.waiting, registration.installing].some(worker => worker && new URL(worker.scriptURL).pathname === '/sw.js')) await registration.unregister();
      }
      for (const key of await caches.keys()) if (key.startsWith('billioncodes-public-')) await caches.delete(key);
      setOffline(false); setMessage('Offline app files removed. Your progress and any separately saved catalogue remain. Reload before going offline.');
    } catch { setMessage('Offline files could not be fully removed. You can clear this site in browser settings.'); }
  }
  return <div className="wrap page-section workspace-page"><div className="page-heading"><p className="bc-kicker">YOUR SPACE TO KEEP BUILDING</p><h1>A little progress.<br />A little more possibility.</h1><p>This is your device-local learning desk, not an account. Reading records, saved drafts and practice results stay here unless you export them yourself.</p></div>{notice && <p className="storage-notice" role="status">{notice}</p>}<div className="desk-stats"><div><strong>{readCount}</strong><span>lessons marked as read</span></div><div><strong>{Object.keys(progress.solved).length}<small> / {challenges.length}</small></strong><span>exercises completed at least once</span></div><div><strong>Yours.</strong><span>No streak pressure. No invented score.</span></div></div><div className="desk-grid"><section><div className="desk-section-heading"><h2>Pick up a thread.</h2><a href="#/practice">Practice lab ↗</a></div>{last && <a href={`#/learn/${last.id}`} className="resume-card"><span className="badge">LAST OPENED</span><h3>{last.title}</h3><p>Continue reading ↗</p></a>}<div className="desk-courses">{courses.map(course => <a href={`#/learn/${course.id}`} key={course.id}><div><h3>{course.title}</h3><p>{course.lessons.filter(lesson => progress.read[course.id]?.includes(lesson.id)).length} / {course.lessons.length} marked as read</p></div><span aria-hidden="true">↗</span></a>)}</div>{data.state === 'error' && <p className="small-note">The live catalogue is unavailable. The built-in primer and exercises are still available; saved catalogue content is used only when you explicitly downloaded it.</p>}<h2 className="desk-subheading">Keep making things.</h2>{challenges.map(item => <a href={`#/practice/${item.id}`} className="desk-exercise" key={item.id}><span>{item.title}</span><span>{progress.solved[item.id] ? 'Completed once ✓' : progress.drafts[item.id] ? 'Continue draft ↗' : 'Start ↗'}</span></a>)}</section><aside className="desk-tools"><h2>For wherever you learn.</h2><p>Install the public app files for offline use, then optionally save the live text lessons. Enquiry forms always need a connection; private admin data is never cached.</p><button className="button button-dark" disabled={installing} onClick={() => void enableOffline()}>{installing ? 'Preparing offline files...' : offline ? 'Check offline setup' : 'Enable offline reading'}</button><p className="small-note">Downloads public images, fonts and code. Use Wi-Fi if you are managing mobile data. Your browser may clear offline storage when space is low.</p>{offline && <button className="reset-link" onClick={() => void disableOffline()}>Remove offline app files</button>}<div className="desk-tool-group"><h3>Save the live lessons</h3><p>{savedAt ? `Saved on ${new Date(savedAt).toLocaleString()}. This is a snapshot, not a live update.` : 'No live catalogue saved on this device.'}</p><button className="button button-outline" disabled={data.state !== 'ready' || data.source !== 'live'} onClick={() => { try { setSavedAt(saveDownload(data.catalog!)); setMessage('The current public text catalogue is saved on this device.'); } catch { setMessage('There was not enough available browser storage to save the catalogue.'); } }}>Save current catalogue</button>{savedAt && <button className="reset-link" onClick={() => { try { removeDownload(); setSavedAt(''); setMessage('Saved catalogue removed. Reload to clear any copy already displayed in memory.'); } catch { setMessage('Storage is unavailable. Clear this site in browser settings to remove saved files.'); } }}>Remove saved catalogue</button>}</div><div className="desk-tool-group"><h3>Take your progress with you</h3><p>Export a private JSON backup. Importing replaces this device's record after confirmation; it is not automatic cloud sync.</p><button className="button button-outline" onClick={download}>Export learning backup</button><label className="backup-label" htmlFor="backup-file">Import a learning backup</label><input id="backup-file" type="file" accept="application/json,.json" onChange={event => { void importBackup(event.target.files?.[0]); event.target.value = ''; }} /></div><div className="desk-tool-group"><h3>A fresh start</h3><p>Clear reading records, drafts and completed exercises on this device. This does not delete submitted enquiries.</p><button className="reset-link" onClick={() => setResetting(true)}>Reset all learning progress</button></div></aside></div>{message && <p role="status" className="workspace-message">{message}</p>}{restore && <div className="inline-confirm"><h2>Replace this device's progress?</h2><p>The imported backup contains {Object.keys(restore.solved).length} validated completed exercises. Existing local drafts and reading records will be replaced.</p><button onClick={() => { changeProgress(() => restore); setRestore(null); setMessage('Backup restored on this device. No information was sent to a server.'); }}>Replace with backup</button><button onClick={() => setRestore(null)}>Cancel import</button></div>}{resetting && <div className="inline-confirm"><h2>Clear your local learning record?</h2><p>Export a backup first if you want to keep your work. This cannot be undone here.</p><button onClick={() => { resetWorkspace(); setResetting(false); setMessage('Learning progress cleared on this device.'); }}>Clear local progress</button><button onClick={() => setResetting(false)}>Keep my progress</button></div>}</div>;
}
