import { useEffect, useRef, useState } from 'react';
import { track } from './metrics';
import { motion, useScroll, useTransform, type MotionValue } from 'motion/react';
import { Brand } from './Brand';
import { HeroStage } from './motion/HeroStage';
import { CountUp, KineticWords, Magnetic, Marquee, Reveal, Scramble, SplitLines } from './motion/primitives';
import { useMotionEnabled } from './motion/prefs';

const Arrow = () => <span aria-hidden="true">↗</span>;
const courses = [
  { title: 'Your first web page', subtitle: 'Make the internet a little more yours.', kind: 'HTML ESSENTIALS', cover: '/brand/html-cover-blue-v1.svg', href: '/learn/first-web-page', meta: '2 lessons', className: 'navy' },
  { title: 'Web development foundations', subtitle: 'Understand the page. Connect the dots.', kind: 'WEB FOUNDATIONS', cover: '/images/code-detail-generated-v1.webp', href: '/learn/web-foundations-intro', meta: '3 lessons', className: 'photo' },
  { title: 'Small builds. Real practice.', subtitle: 'Turn a blank editor into your first win.', kind: 'THE PRACTICE LAB', cover: '/brand/practice-cover-blue-v1.svg', href: '/practice', meta: '4 HTML challenges', className: 'coral' },
];
const steps = [
  ['01', 'Get the idea.', 'Clear, original text lessons. No video buffering between you and the next step.'],
  ['02', 'Make it work.', 'Write HTML, get specific feedback, and see an inert preview of what you made.'],
  ['03', 'Keep your momentum.', 'Your reading record and practice drafts stay on your device. Pick up where you left off.'],
];
const manifesto = 'You do not learn to build by collecting open tabs. Read a little. Try it yourself. Break it. Fix it. Understand what changed. Then build something that matters.';
const code = ['<main>', '  <h1>My first project</h1>', '  <p>A reading list for curious people.</p>', '  <a href="/reading-list">Open the list</a>', '</main>'];

// Words light up one by one as the paragraph scrolls through the viewport.
function Manifesto() {
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 85%', 'end 45%'] });
  const words = manifesto.split(' ');
  return <section className="bc-manifesto wrap"><Scramble className="bc-kicker" text="THE BILLION CODES WAY" /><p ref={ref} className="manifesto-text">{words.map((word, index) => <ManifestoWord key={index} word={word} progress={scrollYProgress} at={index / words.length} />)}</p></section>;
}
function ManifestoWord({ word, progress, at }: { word: string; progress: MotionValue<number>; at: number }) {
  const enabled = useMotionEnabled();
  const color = useTransform(progress, [at - .06, at + .02], ['#7d97b3', '#ffffff']);
  return <><motion.span style={enabled ? { color } : undefined}>{word}</motion.span>{' '}</>;
}

// Courses ride a horizontal track while the section is pinned.
function CourseRail() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const enabled = useMotionEnabled();
  const x = useTransform(scrollYProgress, [0, 1], ['0%', '-46%']);
  return <section ref={ref} className={`bc-rail${enabled ? ' is-pinned' : ''}`}>
    <div className="rail-sticky">
      <div className="wrap rail-heading"><div><Scramble className="bc-kicker" text="YOUR FIRST STEP STARTS HERE" /><h2>Small beginnings.<br /><span>Serious possibilities.</span></h2></div><div><p>Choose a free introduction or jump into a small build. You do not need to know everything to begin.</p><a href="/courses" className="text-link">Explore all introductions <Arrow /></a></div></div>
      <motion.div className="rail-track" style={enabled ? { x } : undefined}>
        {courses.map((course, index) => <a href={course.href} className="bc-course-card" data-tilt key={course.title}><div className={`bc-course-image ${course.className}`}><img src={course.cover} alt="" width="800" height="480" loading="lazy" /><span className="bc-course-number">0{index + 1}</span><span className="course-free">FREE TO START</span></div><div className="bc-course-body"><p className="eyebrow">{course.kind}</p><h3>{course.title}</h3><p>{course.subtitle}</p><div><span>Beginner friendly · {course.meta}</span><span className="course-arrow"><Arrow /></span></div></div></a>)}
        <a href="/courses" className="rail-more" data-tilt><span className="rail-more-glyph" aria-hidden="true">&lt;/&gt;</span><strong>See every free introduction</strong><span>No account. No payment. <Arrow /></span></a>
      </motion.div>
      <p className="bc-honest-note wrap">Original introductory learning, not a full qualification. No invented outcomes. Just a useful place to start.</p>
    </div>
  </section>;
}

// A terminal that types a tiny page, line by line, once it is on screen.
function Terminal() {
  const ref = useRef<HTMLDivElement>(null);
  const enabled = useMotionEnabled();
  const [chars, setChars] = useState(enabled ? 0 : code.join('\n').length);
  useEffect(() => {
    if (!enabled) { setChars(code.join('\n').length); return; }
    const el = ref.current; if (!el) return;
    let timer = 0;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      timer = window.setInterval(() => setChars(value => { if (value >= code.join('\n').length) { window.clearInterval(timer); return value; } return value + 1; }), 28);
    });
    observer.observe(el);
    return () => { observer.disconnect(); window.clearInterval(timer); };
  }, [enabled]);
  const typed = code.join('\n').slice(0, chars);
  return <div className="terminal" ref={ref} data-tilt="flat"><div className="workbench-bar"><span><i /><i /><i /></span><span>first-project.html</span><span>LIVE</span></div><pre><span className="sr-only">{code.join('\n')}</span><code aria-hidden="true">{typed}<span className="caret" /></code></pre><div className="terminal-preview"><span className="eyebrow">PREVIEW</span><strong>{chars > 30 ? 'My first project' : ''}</strong>{chars > 70 && <p>A reading list for curious people.</p>}{chars > 115 && <span className="terminal-link">Open the list ↗</span>}</div></div>;
}

// Three honest ways in, matching what the site offers today.
const startPaths = [
  { step: '01', who: 'NEW TO CODE', title: 'Your first web page', meta: '2 short lessons · free · no account', href: '/learn/first-web-page' },
  { step: '02', who: 'LEARN BY DOING', title: 'The practice lab', meta: '4 HTML builds with instant feedback', href: '/practice' },
  { step: '03', who: 'WANT GUIDANCE', title: 'Training and expert help', meta: 'Tell us your goals; we reply personally', href: '/training' },
];

function StartPaths() {
  return <nav className="start-paths" aria-label="Where to start">
    <p className="start-paths-title">Start here</p>
    {startPaths.map(path => <a key={path.step} href={path.href} className="start-path" data-tilt="flat" onClick={() => track('start_path', path.href.split('/').pop())}>
      <span className="start-step" aria-hidden="true">{path.step}</span>
      <span className="start-copy"><span className="start-who">{path.who}</span><strong>{path.title}</strong><span className="start-meta">{path.meta}</span></span>
      <span className="go-chip" aria-hidden="true">→</span>
    </a>)}
  </nav>;
}

function FirstWin() {
  const [heading, setHeading] = useState('My next big idea');
  return <div className="first-win" data-tilt="flat"><div className="workbench-bar"><span><i /><i /><i /></span><span>your-first-page.html</span><span>HTML</span></div><div className="first-win-grid"><div className="first-win-editor"><p className="eyebrow">01 / GIVE IT A NAME</p><label htmlFor="first-heading">What would you like to build?</label><div className="heading-input"><code>&lt;h1&gt;</code><input id="first-heading" value={heading} onChange={event => setHeading(event.target.value)} maxLength={56} autoComplete="off" /><code>&lt;/h1&gt;</code></div><p>Change the text. See your heading come to life.</p></div><div className="first-win-output"><span className="eyebrow">02 / SEE YOUR FIRST LINE</span><strong aria-live="polite" key={heading.length % 2}>{heading || 'Your idea goes here'}</strong><p>A little structure. A world of possibility.</p><span className="output-label"><span className="live-dot" aria-hidden="true" />LIVE TEXT PREVIEW</span></div></div><div className="first-win-bottom"><span>No setup. No experience required.</span><a href="/practice/profile-card">Now build the whole introduction <Arrow /></a></div></div>;
}

export function HomePage() {
  useEffect(() => track('home_view'), []);
  return <div className="bc-home">
    <HeroStage paths={<StartPaths />}>
      <Scramble className="bc-kicker" text="FOR THE NEXT GENERATION OF BUILDERS" dot />
      <h1 id="home-title"><SplitLines lines={['Big ideas.', 'Real skills.', <span className="shimmer" key="you">Built by you.</span>]} delay={.2} /></h1>
      <Reveal delay={.6} y={20}><p className="bc-hero-lead">The next chapter of your life could start with a line of code. Learn the foundations, try things for yourself, and build something that matters.</p></Reveal>
      <Reveal delay={.75} y={20}><div className="bc-actions"><Magnetic><a href="/courses" className="button button-glow">Find your starting point <Arrow /></a></Magnetic><a href="/practice" className="text-link">Try the practice lab <Arrow /></a></div></Reveal>
      <Reveal delay={.9} y={16}><div className="bc-start-note"><span className="check-disc" aria-hidden="true">✓</span><p>Start free. Learn at your pace. <strong>No account or payment needed.</strong></p></div></Reveal>
    </HeroStage>

    <div className="bc-tickers" aria-label="What you will practise">
      <Marquee items={['HTML', 'CSS', 'JavaScript', 'Read a little', 'Try it yourself', 'Build something real']} />
      <Marquee reverse items={['Understand what changed', 'Ask for help', 'Fix the bug', 'Ship it', 'Keep your momentum']} />
    </div>

    <Manifesto />

    <section className="bc-numbers wrap" aria-label="What you can do today">
      {[[2, 'free introductions to start reading'], [4, 'HTML challenges in the practice lab'], [0, 'payments needed to begin'], [0, 'accounts needed for your first lesson']].map(([value, label], index) => <Reveal key={String(label)} delay={index * .08} className="number-tile"><strong><CountUp to={Number(value)} /></strong><span>{label}</span></Reveal>)}
    </section>

    <CourseRail />

    <section className="bc-story">
      <div className="wrap bc-story-grid">
        <div className="bc-story-visual">
          <div className="story-sticky">
            <div className="hero-photo-frame" data-tilt><img src="/images/hero-learner-generated-v1.webp" alt="AI-generated scene of a woman focused on a laptop" width="1122" height="1402" loading="lazy" /><div className="photo-caption"><span>THE BUILDER MINDSET</span><strong>Curiosity looks<br />good on you.</strong></div></div>
            <a href="/practice/profile-card" className="hero-build-card" data-tilt="flat"><div className="build-card-icon" aria-hidden="true">&lt;/&gt;</div><div><span>YOUR FIRST BUILD</span><strong>A page that says, “this is me.”</strong><p>Make your introduction <Arrow /></p></div></a>
            <span className="photo-disclaimer">AI-generated imagery · <a href="/credits">About the visuals</a></span>
          </div>
        </div>
        <div className="bc-story-copy">
          <Reveal><Scramble className="bc-kicker" text="LEARNING THAT GOES SOMEWHERE" /><h2>Less watching.<br /><span>More making.</span></h2><p>Read a little, try it yourself, and understand what changed.</p></Reveal>
          <ol>{steps.map(([number, title, text], index) => <Reveal as="li" key={number} delay={index * .08}><span>{number}</span><div><h3>{title}</h3><p>{text}</p></div></Reveal>)}</ol>
          <Reveal><Terminal /></Reveal>
          <Reveal className="experience-photo"><img src="/images/learning-together-generated-v1.webp" alt="AI-generated scene of three adults learning together at a laptop" width="1122" height="1402" loading="lazy" /><div className="experience-photo-label"><span className="mono">FROM “HOW?” TO “I MADE THIS.”</span><span aria-hidden="true">↗</span></div></Reveal>
          <Magnetic><a href="/workspace" className="button button-glow">Open your learning desk <Arrow /></a></Magnetic>
        </div>
      </div>
    </section>

    <KineticWords words={['READ.', 'TRY.', 'BUILD.', 'SHIP.']} />

    <section className="bc-try-section wrap">
      <div className="bc-section-heading"><Reveal><Scramble className="bc-kicker" text="DON'T JUST TAKE OUR WORD FOR IT" /><h2>Your first line.<br /><span>Right here, right now.</span></h2></Reveal><Reveal delay={.1}><p>Every project begins with something small. Give yours a heading, then step into the practice lab to build the rest.</p></Reveal></div>
      <Reveal><FirstWin /></Reveal>
    </section>

    <section className="bc-support wrap">
      <Reveal className="support-copy"><Scramble className="bc-kicker" text="YOU CAN BUILD. YOU CAN ALSO ASK FOR HELP." /><h2>A little guidance.<br />A clearer next step.</h2><p>Want structured training, a second pair of eyes on your code, or help turning a business problem into software? Tell us where you are starting.</p><div className="bc-actions"><Magnetic><a href="/training" className="button button-glow">Talk about training <Arrow /></a></Magnetic><a href="/services" className="text-link">Bring a project idea <Arrow /></a></div><p className="small-note">Training is by enquiry. Dates, availability and any fees are agreed separately.</p></Reveal>
      <Reveal delay={.12}><div className="founder-real" data-tilt><img src="/images/founder.webp" alt="Josiah Adeyemo, founder of Billion Codes" width="720" height="900" loading="lazy" /><div><span className="eyebrow">MEET THE PERSON BEHIND THE IDEA</span><strong>Josiah Adeyemo</strong><span>Software engineer. Founder. Fellow builder.</span><a href="/about">More about Billion Codes <Arrow /></a></div></div></Reveal>
    </section>

    <section className="bc-finale">
      <div className="finale-aurora" aria-hidden="true"><span /><span /><span /></div>
      <div className="finale-grid" aria-hidden="true" />
      <div className="wrap"><Brand light /><Scramble className="bc-kicker" text="YOUR NEXT CHAPTER IS NOT GOING TO WRITE ITSELF." /><h2><SplitLines lines={["Let's build", <span key="real">something real.</span>]} /></h2><Magnetic strength={.5}><a href="/courses" className="button button-glow button-huge">Start learning for free <Arrow /></a></Magnetic><p>No account. No payment. Just your curiosity.</p></div>
    </section>
  </div>;
}
