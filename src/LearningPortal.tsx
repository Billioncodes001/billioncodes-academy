import { useEffect, useState } from 'react';
import { request } from './api';
import { AccountGate, PortalNav, jsonBody, message, useAccount } from './Account';

import { CourseReader, type Lesson } from './CourseReader';
type Course = { id: string; title: string; summary: string; level: string; priceMinor: number; status: string; lessonCount?: number; completed?: number; lessons: Lesson[] };
export function useRemote<T>(path: string | null) {
  const { user } = useAccount();
  const [value, setValue] = useState<T | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true; setValue(null); setError(''); setLoading(true);
    if (!path) { setLoading(false); return; }
    request<T>(path).then(value => { if (active) setValue(value); }).catch(error => { if (active) setError(message(error)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [path, user?.id, revision]);
  return { value, error, loading, reload: () => setRevision(value => value + 1) };
}
export function RemoteNotice({ state }: { state: { loading: boolean; error: string; reload: () => void } }) {
  return <>{state.loading && <p role="status">Loading your learning space...</p>}{state.error && <div className="platform-error" role="alert"><p>{state.error}</p><button className="button button-outline" onClick={state.reload}>Try again</button></div>}</>;
}
function CourseTiles({ courses }: { courses: Course[] }) {
  return <div className="portal-grid">{courses.map(course => <article className="portal-card learning-course-card" key={course.id}><div className="course-card-category"><span>SELF-PACED LEARNING</span><span aria-hidden="true">&lt;/&gt;</span></div><span className="portal-tag">{course.level} / {course.priceMinor === 0 ? 'Free' : new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(course.priceMinor / 100)}</span><h2>{course.title}</h2><p>{course.summary}</p>{course.completed !== undefined && <><label htmlFor={`progress-${course.id}`}>{course.completed} of {course.lessonCount} lessons marked complete</label><progress id={`progress-${course.id}`} max={course.lessonCount || 1} value={course.completed} /></>}<a className="text-link" href={`#/course/${course.id}`}>{course.completed !== undefined ? 'Continue learning' : 'View course'} <span aria-hidden="true">&rarr;</span></a></article>)}</div>;
}
export function CourseLibrary() {
  const state = useRemote<{ courses: Course[] }>('/api/v2/courses');
  const [search, setSearch] = useState('');
  const courses = state.value?.courses.filter(course => `${course.title} ${course.summary}`.toLowerCase().includes(search.toLowerCase())) || [];
  return <div className="wrap page-section studio-page"><PortalNav /><div className="portal-heading"><div><p className="eyebrow">BUILD YOUR OWN MOMENTUM</p><h1>Find your next skill.</h1><p>Explore published self-paced learning. Add a free course to your account to save progress, or browse our curated links to independent educators.</p></div><a className="button button-outline" href="#/resources">Discover open resources</a></div><div className="portal-search"><label htmlFor="library-search">Find a course</label><input id="library-search" placeholder="Search by course or topic" type="search" value={search} onChange={e => setSearch(e.target.value)} /></div><RemoteNotice state={state} />{state.value && <p className="studio-results" role="status">{courses.length} {courses.length === 1 ? 'course' : 'courses'}{search ? ' matching your search' : ' available'}</p>}<CourseTiles courses={courses} />{state.value && !courses.length && <p role="status">No courses match your search.</p>}<p className="platform-notice">Paid checkout is not available. No payment will be collected, and courses that require payment cannot be purchased yet.</p></div>;
}
function MemberLibrary() {
  const { user } = useAccount();
  const state = useRemote<{ courses: Course[] }>('/api/v2/library');
  return <><div className="portal-heading"><div><p className="eyebrow">YOUR PACE / YOUR PROGRESS</p><h1>Your course library.</h1><p>Welcome, {user?.name}. This is your account-backed course library. Reading marks are self-reported, not qualifications or certificates.</p></div><a className="button button-dark" href="#/course-library">Find your next course</a></div><RemoteNotice state={state} />{state.value && !state.value.courses.length ? <section className="platform-panel"><h2>Your first chapter is waiting.</h2><p>Add a free introduction to start your library. Existing device-only progress is not uploaded automatically.</p><a className="text-link" href="#/course-library">Explore the course library</a></section> : <CourseTiles courses={state.value?.courses || []} />}<section className="portal-section platform-panel"><p className="eyebrow">LOOKING FOR A GUIDED EXPERIENCE?</p><h2>A cohort. A direction. A next step.</h2><p>Training has its own application process and dashboard. Joining a free course does not apply for an intake.</p><a href="#/training-dashboard" className="text-link">Open training dashboard</a></section></>;
}
export function MyLearning() { const { user } = useAccount(); return <div className="wrap page-section studio-page"><PortalNav /><AccountGate><MemberLibrary key={user?.id} /></AccountGate></div>; }
export function CoursePage({ id }: { id: string }) {
  const { user } = useAccount();
  const state = useRemote<{ course: Course; enrolled: boolean; completed: string[] }>(`/api/v2/courses/${encodeURIComponent(id)}`);
  const [pending, setPending] = useState(false), [error, setError] = useState('');
  const course = state.value?.course, enrolled = state.value?.enrolled;

  async function enrol() {
    setPending(true); setError('');
    try { await request(`/api/v2/courses/${encodeURIComponent(id)}/enrol`, jsonBody({})); state.reload(); }
    catch (error) { setError(message(error)); } finally { setPending(false); }
  }

  return <div className="wrap page-section studio-page">
    <PortalNav /><RemoteNotice state={state} />
    {course && <>
      <div className="portal-heading"><div><p className="eyebrow">{course.level} / SELF-PACED LEARNING</p><h1>{course.title}</h1><p>{course.summary}</p></div></div>
      {!enrolled ? <div className="training-layout">
        <section className="platform-panel"><h2>Inside this course</h2><ol>{course.lessons.map(lesson => <li key={lesson.id}>{lesson.title} <span className="portal-tag">{lesson.kind}</span></li>)}</ol></section>
        <AccountGate><section className="platform-panel">
          <h2>{course.priceMinor === 0 ? 'Keep it in your library.' : 'Not available to purchase yet.'}</h2>
          <p>{course.priceMinor === 0 ? 'This course is free. Your progress will be saved to your signed-in account.' : 'Paid checkout has not been configured. No enrolment or payment will be created.'}</p>
          <button className="button button-dark" disabled={pending || course.priceMinor !== 0} onClick={enrol}>{pending ? 'Adding...' : 'Add free course to my library'}</button>
        </section></AccountGate>
      </div> : user && <CourseReader key={`${course.id}:${user.id}`} courseId={course.id} lessons={course.lessons} initialCompleted={state.value!.completed} />}
    </>}
    {error && <p role="alert" className="platform-error">{error}</p>}
  </div>;
}
