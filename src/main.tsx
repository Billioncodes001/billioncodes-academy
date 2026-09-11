import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/space-grotesk/latin-400.css';
import '@fontsource/space-grotesk/latin-500.css';
import '@fontsource/space-grotesk/latin-600.css';
import '@fontsource/space-grotesk/latin-700.css';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import { type Course } from './api';
import { useCatalog, type CatalogState } from './useCatalog';
import { PracticeLab } from './PracticeLab';
import { Workspace } from './Workspace';
import { Credits } from './Credits';
import { changeProgress, useWorkspace } from './learningStore';
import { rememberLesson, recordRead } from '@billioncodes/learning';
import { intro } from './intro';
import { EnquiryForm } from './EnquiryForm';
import { HomePage } from './HomePage';
import { Brand } from './Brand';
import '@fontsource/bricolage-grotesque/latin-500.css';
import '@fontsource/bricolage-grotesque/latin-600.css';
import '@fontsource/bricolage-grotesque/latin-700.css';
import '@fontsource/bricolage-grotesque/latin-800.css';
import './styles.css';
import './brand.css';
import './learning.css';

const Arrow = () => <span aria-hidden="true">↗</span>;
const links = [['/courses', 'Explore courses'], ['/practice', 'Practice'], ['/training', 'Training'], ['/services', 'Expert help']];

function useRoute() {
  const read = () => window.location.hash.replace(/^#/, '') || '/';
  const [route, setRoute] = useState(read);
  useEffect(() => { const change = () => setRoute(read()); window.addEventListener('hashchange', change); return () => window.removeEventListener('hashchange', change); }, []);
  return route;
}

function Header({ route }: { route: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [route]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && open) { setOpen(false); document.querySelector<HTMLButtonElement>('.menu-toggle')?.focus(); } };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);
  return <>
    <a className="skip-link" href="#main" onClick={event => { event.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>
    <div className="launch-strip"><div className="wrap"><span>BUILD SOMETHING THAT MATTERS.</span><a href="#/workspace">Your learning desk <Arrow /></a></div></div>
    <header className="site-header wrap">
      <a className="brand" href="#/" aria-label="Billion Codes home"><Brand /></a>
      <button className="menu-toggle" type="button" aria-expanded={open} aria-controls="main-nav" onClick={() => setOpen(!open)}>{open ? 'Close' : 'Menu'}<span aria-hidden="true">{open ? '−' : '+'}</span></button>
      <nav id="main-nav" className={open ? 'main-nav open' : 'main-nav'} aria-label="Main navigation">
        {links.map(([path, label]) => <a key={path} href={`#${path}`} aria-current={route === path ? 'page' : undefined} onClick={() => setOpen(false)}>{label}</a>)}
        <a className="nav-apply" href="#/training" onClick={() => setOpen(false)}>Apply for training <Arrow /></a>
      </nav>
    </header>
  </>;
}


function SaveStatus() {
  const { saving } = useWorkspace();
  return saving ? <p className="save-status" role="status">Saving learning changes on this device...</p> : null;
}

function CatalogNotice({ data }: { data: CatalogState }) {
  if (data.state === 'ready' && data.source === 'saved') return <div className="catalog-status" role="status"><p>Reading your saved catalogue from {new Date(data.savedAt).toLocaleDateString()}. This is not a live update.</p><button className="button button-outline" onClick={() => void data.reload()}>Retry live catalogue</button></div>;
  if (data.state === 'loading') return <div className="catalog-status" role="status"><span className="loading-line" />Loading the live catalogue...</div>;
  if (data.state === 'error') return <div className="catalog-status catalog-error" role="alert"><div><h3>The live catalogue is unavailable.</h3><p>{data.error} No catalogue data has been substituted. The built-in HTML primer above is still available.</p></div><button type="button" className="button button-outline" onClick={() => void data.reload()}>Retry catalogue <Arrow /></button></div>;
  return null;
}

function CourseCard({ course, index }: { course: Course; index: number }) {
  return <a href={`#/learn/${encodeURIComponent(course.id)}`} className="course-card"><div className={`course-cover cover-${index % 3}`} aria-hidden="true"><span className="index">FOUNDATIONS / {String(index + 1).padStart(2, '0')}</span><img src={index % 2 === 0 ? '/images/code-detail.webp' : '/brand/html-cover.svg'} alt="" loading="lazy" /><span>READ. THINK. BUILD.</span></div><div className="course-card-body"><div className="course-meta"><span>{course.level}</span><span>{course.format}</span></div><h3>{course.title}</h3><p>{course.summary}</p><div className="course-bottom"><span>{course.lessons.length} {course.lessons.length === 1 ? 'lesson' : 'lessons'} · Free introduction</span><Arrow /></div></div></a>;
}

function Courses({ data }: { data: CatalogState }) {
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('all');
  const courses = data.catalog?.courses ?? [];
  const levels = [...new Set(courses.map(course => course.level))];
  const results = courses.filter(course => (level === 'all' || course.level === level) && `${course.title} ${course.summary} ${course.level}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="wrap page-section"><div className="page-heading"><p className="eyebrow">THE LEARNING DESK</p><h1>Start with understanding.<br /><span className="ink-muted">Then make something.</span></h1><p>Short, free introductions to help you find your footing. Full paid courses are not available at this launch.</p></div><a className="built-in-primer" href="#/learn/first-web-page"><span className="primer-glyph" aria-hidden="true">&lt;/&gt;</span><div><span className="eyebrow">BUILT-IN FREE PRIMER</span><h2>Your first web page</h2><p>Two original text lessons and a simple knowledge check. Available independently of the live catalogue.</p></div><span className="round-arrow"><Arrow /></span></a><div className="catalog-heading"><h2>Explore the catalogue</h2><span className="badge badge-paper">NO PAYMENT REQUIRED</span></div><CatalogNotice data={data} />{data.state === 'ready' && <><div className="catalog-filters"><div className="search-field"><label htmlFor="course-search">Find an introduction</label><input id="course-search" type="search" placeholder="Search a topic or keyword" value={search} onChange={event => setSearch(event.target.value)} /></div><div><label htmlFor="course-level">Experience level</label><select id="course-level" value={level} onChange={event => setLevel(event.target.value)}><option value="all">All levels</option>{levels.map(item => <option value={item} key={item}>{item}</option>)}</select></div></div><p className="result-count" role="status">{results.length} {results.length === 1 ? 'introduction' : 'introductions'} found</p>{results.length ? <div className="course-grid">{results.map((course, index) => <CourseCard course={course} index={index} key={course.id} />)}</div> : <div className="empty-state"><h3>{courses.length ? 'No matching introductions.' : 'No introductions have been published yet.'}</h3><p>{courses.length ? 'Try another keyword or experience level.' : 'You can still read the built-in primer above.'}</p>{courses.length > 0 && <button className="button button-outline" onClick={() => { setSearch(''); setLevel('all'); }}>Clear filters</button>}</div>}</>}<aside className="catalog-tail"><h3>Want guidance beyond an introduction?</h3><a className="text-link" href="#/training">Tell us about your training goals <Arrow /></a></aside></div>;
}

function Practice() {
  const [answer, setAnswer] = useState('');
  const [checked, setChecked] = useState(false);
  return <div className="practice-card"><p className="eyebrow">A SMALL CHECK, NOT AN EXAM</p><h3>Which element takes someone to another page?</h3><p>A reader wants to open your reading list. Which HTML element should you use?</p><fieldset><legend className="sr-only">Choose an HTML element</legend>{[['anchor', '<a href="/reading-list">Reading list</a>'], ['button', '<button>Reading list</button>'], ['div', '<div>Reading list</div>']].map(([value, label]) => <label className={`practice-option ${answer === value ? 'selected' : ''}`} key={value}><input type="radio" name="practice" value={value} checked={answer === value} onChange={() => { setAnswer(value); setChecked(false); }} /><code>{label}</code></label>)}</fieldset><button className="button button-dark" disabled={!answer} onClick={() => setChecked(true)}>Check my answer <Arrow /></button>{checked && <p className={`practice-feedback ${answer === 'anchor' ? 'correct' : ''}`} role="status">{answer === 'anchor' ? 'Exactly. An anchor with an href links to a destination. Its purpose and keyboard behaviour are built into HTML.' : 'Not quite. A button performs an action; a div only groups content. Look for the element with an href destination, then try again.'}</p>}<p className="small-note">Fixed-answer practice. No code is executed and no certificate is awarded.</p></div>;
}

function LessonReader({ course, builtIn }: { course: Course; builtIn: boolean }) {
  const { progress, notice } = useWorkspace();
  const [index, setIndex] = useState(() => {
    const remembered = progress.lastLesson?.courseId === course.id ? course.lessons.findIndex(item => item.id === progress.lastLesson?.lessonId) : 0;
    return remembered < 0 ? 0 : remembered;
  });
  const completed = (progress.read[course.id] || []).filter(id => course.lessons.some(lesson => lesson.id === id));
  const storageAvailable = !notice;
  const lesson = course.lessons[index];
  const articleRef = useRef<HTMLElement>(null);
  function save(next: boolean | 'reset') {
    changeProgress(current => next === 'reset' ? { ...current, read: { ...current.read, [course.id]: [] } } : recordRead(current, course.id, lesson.id, next));
  }
  function selectLesson(next: number) {
    setIndex(next);
    changeProgress(current => rememberLesson(current, course.id, course.lessons[next].id));
    requestAnimationFrame(() => { articleRef.current?.focus(); articleRef.current?.scrollIntoView({ behavior: 'instant', block: 'start' }); });
  }
  if (!lesson) return <div className="empty-state"><h2>No lessons are published for this introduction yet.</h2><a href="#/courses">Back to the course explorer</a></div>;
  return <div className="wrap page-section reader-page"><a className="back-link" href="#/courses">← All introductions</a><div className="reader-heading"><p className="eyebrow">{builtIn ? 'BUILT-IN PRIMER' : 'FREE INTRODUCTION'} / {course.level}</p><h1>{course.title}</h1><p>{course.summary}</p></div><div className="reader-layout"><aside className="lesson-sidebar"><span className="eyebrow">YOUR READING LIST</span><ol>{course.lessons.map((item, number) => <li key={item.id}><button type="button" aria-current={index === number ? 'step' : undefined} onClick={() => selectLesson(number)}><span className="lesson-number">{String(number + 1).padStart(2, '0')}</span><span>{item.title}{completed.includes(item.id) && <span className="completed-label">Marked as read</span>}</span></button></li>)}</ol><div className="progress-area"><label htmlFor="lesson-progress">{completed.length} of {course.lessons.length} marked as read</label><progress id="lesson-progress" max={course.lessons.length} value={completed.length} /><p><strong>Device-only progress.</strong> No account, cloud sync, qualification or certificate. Clearing browser data removes this record.</p>{!storageAvailable && <p role="status">Browser storage is unavailable. Progress will last only while this site tab is open.</p>}{completed.length > 0 && <button className="reset-link" onClick={() => save('reset')}>Reset this introduction's progress</button>}</div></aside><article className="lesson-article" tabIndex={-1} ref={articleRef}><p className="eyebrow">LESSON {String(index + 1).padStart(2, '0')} / {course.lessons.length}</p><h2>{lesson.title}</h2><div className="lesson-body">{lesson.body.map((paragraph, number) => <p key={number}>{paragraph}</p>)}</div>{builtIn && index === 0 && <figure className="lesson-code"><figcaption>A simple page structure · example only</figcaption><pre><code>{'<main>\n  <h1>My first project</h1>\n  <p>A reading list for curious people.</p>\n  <a href="/reading-list">Open the reading list</a>\n</main>'}</code></pre></figure>}{builtIn && index === 0 && <Practice />}<div className="lesson-actions"><button className="button button-dark" onClick={() => save(!completed.includes(lesson.id))}>{completed.includes(lesson.id) ? 'Marked as read · undo' : 'Mark as read on this device'}<span aria-hidden="true">✓</span></button>{index + 1 < course.lessons.length ? <button className="text-link" onClick={() => selectLesson(index + 1)}>Next lesson <Arrow /></button> : <a className="text-link" href="#/courses">Explore another introduction <Arrow /></a>}</div><p role="status" className="small-note">{completed.includes(lesson.id) ? 'This lesson is marked as read on this device.' : 'Marking a lesson as read is your own record, not an assessment.'}</p></article></div></div>;
}

function Learn({ id, data }: { id: string; data: CatalogState }) {
  const builtIn = id === intro.id;
  const course = builtIn ? intro : data.catalog?.courses.find(item => item.id === id);
  if (course) return <LessonReader key={course.id} course={course} builtIn={builtIn} />;
  return <div className="wrap page-section"><a href="#/courses" className="back-link">← All introductions</a><h1>Course introduction</h1><CatalogNotice data={data} />{data.state === 'ready' && <div className="empty-state"><h2>This introduction could not be found.</h2><p>It may have moved or may not yet be published.</p><a href="#/courses" className="button button-dark">Explore available introductions <Arrow /></a></div>}</div>;
}

function Training() {
  return <div className="wrap page-section form-page"><div className="form-intro"><p className="eyebrow">LEARN WITH DIRECTION</p><h1>Your ambition.<br />A clearer<br /><span className="lime-underline">next step.</span></h1><p className="lead">Tell us what you want to learn and where you are starting. You do not need to have it all figured out.</p><div className="expectation-list"><div><span>01</span><div><h3>Share your starting point</h3><p>Your experience and goals help frame the conversation.</p></div></div><div><span>02</span><div><h3>Tell us your preferred format</h3><p>Online, physical, or undecided. A preference is not a booking.</p></div></div><div><span>03</span><div><h3>Wait for a separate confirmation</h3><p>Fees, dates, venue and availability are not confirmed at launch. Any offer must be agreed separately.</p></div></div></div><div className="plain-notice"><strong>Applications, not enrolments.</strong><p>No payment is collected here. Sending this form does not reserve a place or promise a response time.</p></div></div><EnquiryForm key="applications" kind="applications" /></div>;
}

function Services() {
  return <div className="wrap page-section form-page"><div className="form-intro"><p className="eyebrow">EXPERT HELP, REAL PROBLEMS</p><h1>Good software<br />starts with<br /><span className="lime-underline">a good question.</span></h1><p className="lead">What are you trying to make possible? Start with the problem, not a long list of features.</p><div className="service-list"><div><span className="index">01 / BUSINESS SOFTWARE</span><h3>Build something useful.</h3><p>Describe your users, the work that needs improving, and the result you want from a website or application.</p></div><div><span className="index">02 / PROJECT MENTORSHIP</span><h3>Understand what you build.</h3><p>Get guidance on planning, implementation and explaining your own work. Not ghostwritten assignments or academic impersonation.</p></div><div><span className="index">03 / CODE REVIEW</span><h3>See your work more clearly.</h3><p>Tell us what you are building and where you are stuck. Share only a non-confidential overview at this stage.</p></div></div><div className="plain-notice"><strong>No fixed packages at launch.</strong><p>Scope, fees, timing and deliverables must be discussed and agreed separately. This form is an enquiry, not a contract.</p></div></div><EnquiryForm key="project-requests" kind="project-requests" /></div>;
}

function About() {
  return <div className="wrap page-section about-page"><div className="page-heading"><p className="eyebrow">THE THINKING BEHIND BILLION CODES</p><h1>Useful skills.<br />Thoughtful software.<br /><span className="ink-muted">People who keep learning.</span></h1></div><div className="about-layout"><div className="founder-panel"><span className="eyebrow">FOUNDER'S NOTE</span><img className="founder-portrait" src="/images/founder.webp" alt="Josiah Adeyemo" loading="lazy" width="720" height="900" /><h2>Josiah Adeyemo</h2><p>Founder, Billion Codes</p><a href="https://www.linkedin.com/in/josiah-adeyemo/" target="_blank" rel="noreferrer">Public LinkedIn profile <Arrow /><span className="sr-only"> (opens in a new tab)</span></a></div><div className="about-copy"><h2>Learn it. Question it.<br />Make it useful.</h2><p>Billion Codes brings software learning and practical development support into one place. The aim is straightforward: help people understand what they build and connect their skills to real problems.</p><p>Founder Josiah Adeyemo describes his approach as pragmatic: software should be useful to people and understandable to the teams who maintain it. That is the starting point for this school.</p><p>This launch is deliberately small. You can read original free introductions, check your understanding, apply for training and enquire about software or mentorship. A larger course platform and community will come later.</p><a className="text-link" href="https://github.com/billioncodes001" target="_blank" rel="noreferrer">Explore Josiah's public GitHub <Arrow /><span className="sr-only"> (opens in a new tab)</span></a></div></div><section className="contact-panel" id="contact"><div><p className="eyebrow">LET'S TALK</p><h2>A question before<br />your next step?</h2><p>Email Josiah for launch, training or software enquiries.<br />Please do not send confidential information.</p></div><div><a className="contact-email" href="mailto:jhardeyemor@gmail.com">jhardeyemor@gmail.com <Arrow /></a><div className="contact-actions"><a href="#/training">Training application</a><a href="#/services">Project enquiry</a><a href="#/policies">Privacy & launch terms</a></div></div></section></div>;
}

function Policies() {
  return <div className="wrap page-section policy-page"><div className="page-heading"><p className="eyebrow">PLAIN-LANGUAGE LAUNCH NOTES</p><h1>Clear expectations.<br /><span className="ink-muted">From the start.</span></h1><p>Applies to the Billion Codes introductory launch website. Contact Josiah at <a href="mailto:jhardeyemor@gmail.com">jhardeyemor@gmail.com</a> with a privacy or service question.</p></div><div className="policy-grid"><aside><a href="#privacy" onClick={event => { event.preventDefault(); document.getElementById('privacy')?.scrollIntoView(); }}>Privacy notice</a><a href="#launch-terms" onClick={event => { event.preventDefault(); document.getElementById('launch-terms')?.scrollIntoView(); }}>Launch terms</a><a href="#learning-notes" onClick={event => { event.preventDefault(); document.getElementById('learning-notes')?.scrollIntoView(); }}>Learning & progress</a></aside><div className="policy-copy"><section id="privacy"><p className="eyebrow">01 / PRIVACY NOTICE</p><h2>Your enquiry, your context.</h2><h3>What you choose to send</h3><p>The forms collect your name, email, optional phone number and the learning or project details you enter. The project form also accepts an optional preferred target date. Permission to store and review the enquiry is required to send it.</p><h3>Why it is stored</h3><p>Submitted details are stored so Billion Codes can review and respond to your enquiry. This permission is not marketing consent. Accepted records are accessible through a protected administration service, not a public list.</p><h3>Drafts and browser storage</h3><p>Unsent drafts remain in memory in this browser tab, including after a failed request or navigation within the site. Reloading or closing the page clears the unsent draft. Lesson progress, code drafts and completed exercises use this device's browser storage only; they are not sent as account records or automatically synced. The learning desk offers local export/import and reset controls. Do not enter secrets in practice code. Optional offline downloads contain only public learning content and app files.</p><h3>Requests and retention</h3><p>To ask about, correct or request deletion of an enquiry, email Josiah and include your submission reference if you have one. A fixed automatic retention period has not been published for this launch. Do not submit information you are uncomfortable having stored for enquiry review; you can ask about handling by email first.</p><h3>Keep private material out</h3><p>Do not send passwords, payment information, confidential customer data or proprietary code through the forms or email fallback. There are no attachment uploads at launch. Hosting and security services may process technical request information needed to serve the site and limit abuse.</p></section><section id="launch-terms"><p className="eyebrow">02 / LAUNCH TERMS</p><h2>An introduction, not a promise.</h2><p>The free introductions can be read without an account or payment. Paid products, checkout, learner accounts, referral rewards and community discussions are not active. There is no purchase or paid access to refund through this launch website.</p><p>A training application is an expression of interest, not an enrolment, reserved seat or confirmed booking. Training fees, schedules, venue and availability must be confirmed separately.</p><p>A software or mentorship enquiry is not an accepted project, contract, delivery commitment or quotation. Scope, ownership, fees and any later payment or cancellation terms must be agreed before paid work begins.</p><p>Mentorship and code review support learning and the applicant's own work. They are not offers to impersonate a student or produce undisclosed assessed work.</p></section><section id="learning-notes"><p className="eyebrow">03 / LEARNING & PROGRESS</p><h2>Practice without the pressure.</h2><p>These are short text introductions, not a complete professional curriculum or accredited qualification. Fixed-answer checks and a bounded HTML practice lab help you reflect on what you have learned. HTML is parsed to check specific structural goals; learner JavaScript is never executed. The inert preview removes scripts, styles, links and form actions.</p><p>“Marked as read” is your own device-only record. It is not verified assessment, proof of attendance, certification or a guarantee of employment. Use the reset control in each introduction to remove its saved progress, or clear the site's browser data.</p><p>The live catalogue requires a connection. The learning desk lets you explicitly save a dated public catalogue and install public app files for offline reading. Offline content is a saved snapshot, not a live response. Your browser may remove cached files when storage is low. Private admin pages and enquiry requests are never stored by the offline worker.</p></section></div></div></div>;
}

function Footer() {
  return <footer className="site-footer"><div className="wrap"><div className="footer-top"><a className="brand footer-brand" href="#/"><Brand /></a><p>Learn to code. Build real projects.<br />Get expert help.</p><a href="mailto:jhardeyemor@gmail.com" className="footer-email">Say hello <Arrow /></a></div><div className="footer-bottom"><span>© {new Date().getFullYear()} Billion Codes</span><nav aria-label="Footer navigation"><a href="#/about">About & contact</a><a href="#/policies">Privacy & launch terms</a><a href="#/courses">Free introductions</a><a href="#/workspace">Learning desk</a><a href="#/credits">About the imagery</a></nav><span>Built for the next line.</span></div></div></footer>;
}

function App() {
  const route = useRoute();
  const data = useCatalog();
  const mainRef = useRef<HTMLElement>(null);
  const firstRoute = useRef(true);
  useEffect(() => {
    const titles: Record<string, string> = { '/': 'Learn to code. Build real projects.', '/courses': 'Free introductions', '/training': 'Apply for training', '/services': 'Software & mentorship enquiries', '/about': 'About & contact', '/policies': 'Privacy & launch terms', '/practice': 'The practice lab', '/workspace': 'Your learning desk', '/credits': 'About the imagery' };
    document.title = `Billion Codes | ${titles[route] ?? (route.startsWith('/learn/') ? 'Free lesson' : route.startsWith('/practice/') ? 'HTML practice' : 'Page not found')}`;
    window.scrollTo(0, 0);
    if (firstRoute.current) firstRoute.current = false; else mainRef.current?.focus({ preventScroll: true });
  }, [route]);
  let page;
  if (route === '/') page = <HomePage />;
  else if (route === '/courses') page = <Courses data={data} />;
  else if (route === '/practice' || route.startsWith('/practice/')) page = <PracticeLab key={route} id={route === '/practice' ? undefined : route.slice(10)} />;
  else if (route === '/workspace') page = <Workspace data={data} />;
  else if (route === '/credits') page = <Credits />;
  else if (route === '/training') page = <Training />;
  else if (route === '/services') page = <Services />;
  else if (route === '/about' || route === '/contact') page = <About />;
  else if (route === '/policies') page = <Policies />;
  else if (route.startsWith('/learn/')) { let id = ''; try { id = decodeURIComponent(route.slice(7)); } catch { /* Invalid encoded route is handled as not found. */ } page = <Learn id={id} data={data} />; }
  else page = <div className="wrap page-section empty-state"><p className="eyebrow">404 / A DIFFERENT PATH</p><h1>This page is not here.</h1><p>Head back to the learning desk to find your next step.</p><a className="button button-dark" href="#/courses">Explore the introductions <Arrow /></a></div>;
  return <><Header route={route} /><main id="main" tabIndex={-1} ref={mainRef}>{page}<SaveStatus /></main><Footer /></>;
}

createRoot(document.getElementById('root')!).render(<App />);
