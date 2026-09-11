import { useEffect, useRef, useState } from 'react';
import { accountHeaders, request } from './api';
import { jsonBody, message } from './Account';

export type Lesson = { id: string; title: string; kind: 'text' | 'pdf' | 'video'; body?: string[]; resourceId?: string };

export function CourseReader({ courseId, lessons, initialCompleted }: { courseId: string; lessons: Lesson[]; initialCompleted: string[] }) {
  const [completed, setCompleted] = useState(() => new Set(initialCompleted));
  const [selected, setSelected] = useState(() => Math.max(0, lessons.findIndex(lesson => !initialCompleted.includes(lesson.id))));
  const [pending, setPending] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [player, setPlayer] = useState<{ resource: string; url: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null), focusLesson = useRef(false);
  const lesson = lessons[selected], completeCount = lessons.filter(item => completed.has(item.id)).length;

  useEffect(() => {
    if (focusLesson.current) { heading.current?.focus(); focusLesson.current = false; }
  }, [selected]);

  function selectLesson(index: number) {
    if (pending || index < 0 || index >= lessons.length) return;
    setError(''); setNotice(''); setPlayer(null);
    if (index === selected) { heading.current?.focus(); return; }
    focusLesson.current = true;
    setSelected(index);
  }

  async function action(fn: () => Promise<void>) {
    if (pending) return;
    setPending(true); setError(''); setNotice('');
    try { await fn(); } catch (error) { setError(message(error)); } finally { setPending(false); }
  }

  async function saveProgress() {
    const nextComplete = !completed.has(lesson.id);
    const result = await request<{ saved: boolean }>(`/api/v2/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lesson.id)}/progress`, jsonBody({ completed: nextComplete }, 'PUT'));
    if (!result.saved) throw new Error('Your progress was not confirmed. Please try again.');
    // Only reflect progress after the server confirms it; keep the reader mounted.
    setCompleted(current => {
      const next = new Set(current);
      if (nextComplete) next.add(lesson.id); else next.delete(lesson.id);
      return next;
    });
    setNotice(nextComplete ? 'Lesson marked complete. Saved to your account.' : 'Completion removed. Saved to your account.');
  }

  async function downloadPdf(resourceId: string) {
    const response = await fetch(`/api/v2/resources/${encodeURIComponent(resourceId)}`, { headers: await accountHeaders(), cache: 'no-store', signal: AbortSignal.timeout(30000) });
    if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || 'Download is unavailable.'); }
    const blob = await response.blob(), url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url;
    link.download = response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || 'course-resource.pdf';
    link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    setNotice('Your PDF download has started.');
  }

  async function playVideo(resourceId: string) {
    const value = await request<{ url: string }>(`/api/v2/resources/${encodeURIComponent(resourceId)}/playback`, jsonBody({}));
    if (!/^https:\/\/iframe\.videodelivery\.net\/[A-Za-z0-9._-]+$/.test(value.url)) throw new Error('Invalid player address.');
    setPlayer({ resource: resourceId, url: value.url });
  }

  if (!lesson) return <section className="platform-panel"><h2>No lessons published yet.</h2><p>This course is in your library. Check back when its lessons are available.</p><a className="text-link" href="#/library">Back to my library</a></section>;

  return <div className="portal-reader">
    <aside className="reader-sidebar">
      <div className="reader-progress">
        <p className="studio-overline">YOUR COURSE MAP</p>
        <label htmlFor="reader-progress">{completeCount} of {lessons.length} lessons marked complete</label>
        <progress id="reader-progress" value={completeCount} max={lessons.length} />
        <p>Opens at your first unfinished lesson. Revisit any chapter.</p>
      </div>
      <details className="reader-contents" open>
        <summary>Course contents</summary>
        <nav aria-label="Course contents"><ol>{lessons.map((item, index) => <li key={item.id}>
          <button aria-current={index === selected ? 'step' : undefined} aria-describedby={`lesson-state-${index}`} disabled={pending} onClick={() => selectLesson(index)}>
            <span className="reader-chapter-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            <span><span className="reader-chapter-title">{item.title}</span><span className="reader-chapter-state" id={`lesson-state-${index}`}>{completed.has(item.id) ? 'Complete' : 'Not marked complete'} / {item.kind === 'text' ? 'Read' : item.kind.toUpperCase()}</span></span>
          </button>
        </li>)}</ol></nav>
      </details>
      <a className="text-link reader-library-link" href="#/library">Back to my library</a>
    </aside>
    <article aria-labelledby="lesson-title">
      <div className="reader-lesson-meta"><p className="eyebrow">LESSON {selected + 1} / {lessons.length}</p><span className="portal-tag">{completed.has(lesson.id) ? 'Marked complete' : 'In your own time'}</span></div>
      <h2 id="lesson-title" tabIndex={-1} ref={heading}>{lesson.title}</h2>
      {lesson.body?.map((text, index) => <p key={index}>{text}</p>)}
      {lesson.kind === 'pdf' && lesson.resourceId && <button className="button button-outline" aria-disabled={pending} onClick={() => action(() => downloadPdf(lesson.resourceId!))}>Download lesson PDF</button>}
      {lesson.kind === 'video' && lesson.resourceId && <>
        {player?.resource === lesson.resourceId ? <iframe title={lesson.title} src={player.url} allow="fullscreen; encrypted-media; picture-in-picture" allowFullScreen /> : <p>Video playback connects to Cloudflare Stream when you press play.</p>}
        <button className="button button-outline" aria-disabled={pending} onClick={() => action(() => playVideo(lesson.resourceId!))}>{player ? 'Refresh video access' : 'Play lesson video'}</button>
      </>}
      {lesson.kind !== 'text' && !lesson.resourceId && <p className="platform-notice">The {lesson.kind.toUpperCase()} resource is not available yet.</p>}
      <section className="reader-completion" aria-label="Lesson progress">
        <p>Ready to keep going?</p>
        <p className="small-note">Mark this lesson yourself. Moving to another lesson does not mark it complete.</p>
        <button className="button button-dark" aria-disabled={pending} onClick={() => action(saveProgress)}>{completed.has(lesson.id) ? 'Undo lesson completion' : 'Mark lesson complete'}</button>
        <p role="status">{pending ? 'Saving or loading your lesson...' : notice}</p>
        {error && <p role="alert" className="platform-error">{error} Your reading position has been kept. Try the action again.</p>}
        {completeCount === lessons.length && <p className="reader-all-complete">Every lesson is marked complete. Revisit any chapter or choose your next course. These reading marks are not a certificate.</p>}
      </section>
      <nav className="reader-pagination" aria-label="Lesson navigation">
        <button className="button button-outline" disabled={pending || selected === 0} onClick={() => selectLesson(selected - 1)}>Previous lesson</button>
        <button className="button button-outline" disabled={pending || selected === lessons.length - 1} onClick={() => selectLesson(selected + 1)}>Next lesson</button>
      </nav>
      <p className="small-note reader-privacy">Progress is private to your account and needs an internet connection. Your device-only practice workspace is separate.</p>
    </article>
  </div>;
}
