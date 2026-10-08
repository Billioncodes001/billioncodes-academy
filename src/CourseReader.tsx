import { useEffect, useRef, useState } from 'react';
import { withCodeChips } from './CodeWalkthrough';
import { accountHeaders, request } from './api';
import { jsonBody, message } from './Account';

export type Lesson = { id: string; title: string; kind: 'text' | 'pdf' | 'video'; section?: string; body?: string[]; resourceId?: string };
type Player = { resource: string; url: string; kind: 'file' | 'stream' };
const SIGNED_MEDIA = /^\/api\/v2\/media\/[a-z0-9-]+\/l\/\d{10}\/[a-f0-9]{64}$/;
const STREAM_PLAYER = /^https:\/\/iframe\.videodelivery\.net\/[A-Za-z0-9._-]+$/;

// Consecutive lessons sharing a section form one chapter group, like a course curriculum.
export function lessonGroups(lessons: Lesson[]) {
  const groups: { section: string; items: { lesson: Lesson; index: number }[] }[] = [];
  lessons.forEach((lesson, index) => {
    const section = lesson.section || '';
    if (!groups.length || groups[groups.length - 1].section !== section) groups.push({ section, items: [] });
    groups[groups.length - 1].items.push({ lesson, index });
  });
  return groups;
}

export function CourseReader({ courseId, lessons, initialCompleted }: { courseId: string; lessons: Lesson[]; initialCompleted: string[] }) {
  const [completed, setCompleted] = useState(() => new Set(initialCompleted));
  const [selected, setSelected] = useState(() => Math.max(0, lessons.findIndex(lesson => !initialCompleted.includes(lesson.id))));
  const [pending, setPending] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [player, setPlayer] = useState<Player | null>(null);
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
    const value = await request<{ url: string; kind?: 'file' | 'stream' }>(`/api/v2/resources/${encodeURIComponent(resourceId)}/playback`, jsonBody({}));
    const kind = value.kind === 'file' ? 'file' : 'stream';
    if (!(kind === 'file' ? SIGNED_MEDIA : STREAM_PLAYER).test(value.url)) throw new Error('Invalid player address.');
    setPlayer({ resource: resourceId, url: value.url, kind });
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
        <nav aria-label="Course contents">{lessonGroups(lessons).map((group, groupIndex) => <div key={groupIndex} className="reader-section">
          {group.section && <p className="studio-overline reader-section-title" id={`reader-section-${groupIndex}`}>{group.section}</p>}
          <ol aria-labelledby={group.section ? `reader-section-${groupIndex}` : undefined}>{group.items.map(({ lesson: item, index }) => <li key={item.id}>
            <button aria-current={index === selected ? 'step' : undefined} aria-describedby={`lesson-state-${index}`} disabled={pending} onClick={() => selectLesson(index)}>
              <span className="reader-chapter-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              <span><span className="reader-chapter-title">{item.title}</span><span className="reader-chapter-state" id={`lesson-state-${index}`}>{completed.has(item.id) ? 'Complete' : 'Not marked complete'} / {item.kind === 'text' ? 'Read' : item.kind.toUpperCase()}</span></span>
            </button>
          </li>)}</ol>
        </div>)}</nav>
      </details>
      <a className="text-link reader-library-link" href="#/library">Back to my library</a>
    </aside>
    <article aria-labelledby="lesson-title">
      <div className="reader-lesson-meta"><p className="eyebrow">{lesson.section ? `${lesson.section.toUpperCase()} / ` : ''}LESSON {selected + 1} / {lessons.length}</p><span className="portal-tag">{completed.has(lesson.id) ? 'Marked complete' : 'In your own time'}</span></div>
      <h2 id="lesson-title" tabIndex={-1} ref={heading}>{lesson.title}</h2>
      {lesson.kind === 'video' && lesson.resourceId && <div className="reader-video">
        {player?.resource === lesson.resourceId
          ? player.kind === 'file'
            ? <video key={player.url} controls preload="metadata" playsInline controlsList="nodownload" src={player.url} aria-label={`${lesson.title} video`} />
            : <iframe title={lesson.title} src={player.url} allow="fullscreen; encrypted-media; picture-in-picture" allowFullScreen />
          : <p>Press play to load this lesson video.</p>}
        <button className="button button-outline" aria-disabled={pending} onClick={() => action(() => playVideo(lesson.resourceId!))}>{player?.resource === lesson.resourceId ? 'Reload video' : 'Play lesson video'}</button>
      </div>}
      {lesson.body?.map((text, index) => <p key={index}>{withCodeChips(text)}</p>)}
      {lesson.kind === 'pdf' && lesson.resourceId && <button className="button button-outline" aria-disabled={pending} onClick={() => action(() => downloadPdf(lesson.resourceId!))}>Download lesson PDF</button>}
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
