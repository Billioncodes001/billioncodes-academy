import { useRef, useState } from 'react';
import { Brand } from './Brand';
import { CoverArt, type CoverKind } from './CoverArt';
import { Arrow, Icon } from './Icon';
import { SignalField } from './motion/SignalField';
import { setMotionPaused, useMotionPaused, useReducedMotion } from './motion/preferences';
import { useHomeMotion } from './motion/useHomeMotion';

const courses: { title: string; subtitle: string; kind: string; cover: CoverKind; href: string; meta: string }[] = [
  { title: 'Your first web page', subtitle: 'Make the internet a little more yours.', kind: 'HTML ESSENTIALS', cover: 'html', href: '#/learn/first-web-page', meta: '2 lessons' },
  { title: 'Web development foundations', subtitle: 'Understand the page. Connect the dots.', kind: 'WEB FOUNDATIONS', cover: 'web', href: '#/learn/web-foundations-intro', meta: '3 lessons' },
  { title: 'Small builds. Real practice.', subtitle: 'Turn a blank editor into your first win.', kind: 'THE PRACTICE LAB', cover: 'lab', href: '#/practice', meta: '4 HTML challenges' },
];

const Kicker = ({ index, children }: { index: string; children: React.ReactNode }) => <p className="hx-kicker"><span className="hx-kicker-index" aria-hidden="true">{index}</span>{children}</p>;

function FirstWin() {
  const [heading, setHeading] = useState('My next big idea');
  return <div className="first-win">
    <div className="hx-device-bar"><span className="hx-lights" aria-hidden="true"><i /><i /><i /></span><span>your-first-page.html</span><span className="hx-device-tag">HTML</span></div>
    <div className="first-win-grid">
      <div className="first-win-editor">
        <p className="hx-step-label">01 / GIVE IT A NAME</p>
        <label htmlFor="first-heading">What would you like to build?</label>
        <div className="heading-input"><code>&lt;h1&gt;</code><input id="first-heading" value={heading} onChange={event => setHeading(event.target.value)} maxLength={56} autoComplete="off" /><code>&lt;/h1&gt;</code></div>
        <p>Change the text. See your heading come to life.</p>
      </div>
      <div className="first-win-output">
        <span className="hx-step-label">02 / SEE YOUR FIRST LINE</span>
        <strong aria-live="polite">{heading || 'Your idea goes here'}</strong>
        <p>A little structure. A world of possibility.</p>
        <span className="output-label">LIVE TEXT PREVIEW</span>
      </div>
    </div>
    <div className="first-win-bottom"><span>No setup. No experience required.</span><a href="#/practice/profile-card">Now build the whole introduction <Arrow /></a></div>
  </div>;
}

// WCAG 2.2.2: the signal field moves for longer than five seconds, so it has a
// visible pause control. One preference pauses every field on the page.
function MotionToggle({ className, spinRef }: { className: string; spinRef?: React.RefObject<HTMLButtonElement | null> }) {
  const paused = useMotionPaused();
  const reduced = useReducedMotion();
  if (reduced) return <div className={`${className} is-static`} aria-hidden="true"><Icon name="spark" /></div>;
  return <button ref={spinRef} type="button" className={className} aria-label={paused ? 'Play motion' : 'Pause motion'} data-paused={paused} onClick={() => setMotionPaused(!paused)}><Icon name="spark" /><span className="sr-only">{paused ? 'Play motion' : 'Pause motion'}</span></button>;
}

export function HomePage() {
  const root = useRef<HTMLDivElement>(null);
  const heroSpin = useRef<HTMLButtonElement>(null);
  const finaleSpin = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion();
  useHomeMotion(root, reduced);
  return <div className="home-stage" ref={root}>
    <section className="hx-hero" aria-labelledby="home-title">
      <SignalField variant="hero" spinTarget={heroSpin} />
      <div className="hx-hero-grid wrap">
        <div className="hx-hero-copy">
          <p className="hx-kicker hx-kicker-live"><span className="hx-pulse" aria-hidden="true" />FOR THE NEXT GENERATION OF BUILDERS</p>
          <h1 className="hero-title" id="home-title"><span className="hl"><span>Big ideas.</span></span> <span className="hl"><span>Real skills.</span></span> <span className="hl hl-accent"><span>Built by you.</span></span></h1>
          <p className="hx-lead">The next chapter of your life could start with a line of code.</p>
          <p className="hx-description">Learn the foundations, try things for yourself, and build something that matters. Practical software learning, with a place to begin.</p>
          <div className="hx-actions"><a href="#/courses" className="button button-signal">Find your starting point <Arrow /></a><a href="#/practice" className="text-link text-link-light">Try the practice lab <Arrow /></a></div>
          <div className="hx-start"><span className="hx-check" aria-hidden="true"><Icon name="check" /></span><p>Start free. Learn at your pace.<br /><strong>No account or payment needed.</strong></p></div>
        </div>
        <div className="hx-visual">
          <figure className="hx-frame">
            <span className="hx-crop hx-crop-tl" aria-hidden="true" /><span className="hx-crop hx-crop-br" aria-hidden="true" />
            <img src="/images/hero-learner-generated-v1.webp" alt="AI-generated scene of a woman focused on a laptop" width="1122" height="1402" fetchPriority="high" />
            <figcaption className="photo-caption"><span>THE BUILDER MINDSET</span><strong>Curiosity looks<br />good on you.</strong></figcaption>
          </figure>
          <span className="hx-anno hx-anno-side" aria-hidden="true">FIG. 01 — READ / TRY / BUILD</span>
          <MotionToggle className="hero-corner-stamp" spinRef={heroSpin} />
          <a href="#/practice/profile-card" className="hero-build-card"><span className="hx-build-icon" aria-hidden="true"><Icon name="code" /></span><span className="hx-build-copy"><span>YOUR FIRST BUILD</span><strong>A page that says, “this is me.”</strong><span className="hx-build-cta">Make your introduction <Arrow /></span></span></a>
          <span className="photo-disclaimer">AI-generated imagery · <a href="#/credits">About the visuals</a></span>
        </div>
      </div>
      <div className="hx-stack wrap" data-reveal="">
        <p>A SMALL START.<br /><strong>A STRONG FOUNDATION.</strong></p>
        <div className="hx-stack-item"><span className="hx-stack-mark" aria-hidden="true">&lt;/&gt;</span><span>HTML</span><small>Structure</small></div>
        <div className="hx-stack-item"><span className="hx-stack-mark" aria-hidden="true">{'{ }'}</span><span>CSS</span><small>Style</small></div>
        <div className="hx-stack-item"><span className="hx-stack-mark" aria-hidden="true">JS</span><span>JavaScript</span><small>Behaviour</small></div>
        <p className="hx-stack-note">Understand the building blocks. Then make them your own.</p>
      </div>
    </section>

    <section className="hx-courses" aria-labelledby="home-courses">
      <div className="wrap">
        <header className="hx-head" data-reveal="">
          <div><Kicker index="01">YOUR FIRST STEP STARTS HERE</Kicker><h2 id="home-courses">Small beginnings.<br /><span>Serious possibilities.</span></h2></div>
          <div><p>Choose a free introduction or jump into a small build. You do not need to know everything to begin.</p><a href="#/courses" className="text-link">Explore all introductions <Arrow /></a></div>
        </header>
        <div className="hx-modules">{courses.map((course, index) => <a href={course.href} className="hx-module" key={course.title} data-reveal="rise" style={{ '--i': index } as React.CSSProperties}>
          <span className="hx-module-art"><CoverArt kind={course.cover} /><span className="hx-module-no" aria-hidden="true">0{index + 1}</span><span className="hx-chip">FREE TO START</span></span>
          <span className="hx-module-body"><span className="hx-module-kind">{course.kind}</span><h3>{course.title}</h3><span className="hx-module-sub">{course.subtitle}</span><span className="hx-module-foot"><span>Beginner friendly · {course.meta}</span><span className="hx-go" aria-hidden="true"><Icon name="arrow-right" /></span></span></span>
        </a>)}</div>
        <p className="hx-honest">Original introductory learning, not a full qualification. No invented outcomes. Just a useful place to start.</p>
      </div>
    </section>

    <div className="hx-kinetic" aria-hidden="true"><div className="hx-kinetic-row"><span>Read</span><i /><span>Try</span><i /><span>Build</span><i /><span>Understand</span><i /><span>Repeat</span></div></div>

    <section className="hx-making" aria-labelledby="home-making">
      <div className="wrap hx-making-grid">
        <div className="experience-photo" data-reveal=""><img src="/images/learning-together-generated-v1.webp" alt="AI-generated scene of three adults learning together at a laptop" width="1122" height="1402" loading="lazy" /><div className="hx-photo-label"><span>FROM “HOW?” TO “I MADE THIS.”</span><Icon name="arrow-up-right" /></div></div>
        <div className="hx-making-copy" data-reveal="">
          <Kicker index="02">LEARNING THAT GOES SOMEWHERE</Kicker>
          <h2 id="home-making">Less watching.<br /><span>More making.</span></h2>
          <p>You do not learn to build by collecting open tabs. Read a little, try it yourself, and understand what changed.</p>
          <ol className="hx-pipeline">
            <li><span className="hx-node" aria-hidden="true">01</span><div><h3>Get the idea.</h3><p>Clear, original text lessons. No video buffering between you and the next step.</p></div></li>
            <li><span className="hx-node" aria-hidden="true">02</span><div><h3>Make it work.</h3><p>Write HTML, get specific feedback, and see an inert preview of what you made.</p></div></li>
            <li><span className="hx-node" aria-hidden="true">03</span><div><h3>Keep your momentum.</h3><p>Your reading record and practice drafts stay on your device. Pick up where you left off.</p></div></li>
          </ol>
          <a href="#/workspace" className="button button-light">Open your learning desk <Arrow /></a>
        </div>
      </div>
    </section>

    <section className="hx-try" aria-labelledby="home-try">
      <div className="wrap">
        <header className="hx-head" data-reveal=""><div><Kicker index="03">DON'T JUST TAKE OUR WORD FOR IT</Kicker><h2 id="home-try">Your first line.<br /><span>Right here, right now.</span></h2></div><p>Every project begins with something small. Give yours a heading, then step into the practice lab to build the rest.</p></header>
        <div className="hx-try-stage" data-reveal="rise"><FirstWin /></div>
      </div>
    </section>

    <section className="hx-support wrap" aria-labelledby="home-support">
      <div className="hx-support-copy" data-reveal="">
        <Kicker index="04">YOU CAN BUILD. YOU CAN ALSO ASK FOR HELP.</Kicker>
        <h2 id="home-support">A little guidance.<br /><span>A clearer next step.</span></h2>
        <p>Want structured training, a second pair of eyes on your code, or help turning a business problem into software? Tell us where you are starting.</p>
        <div className="hx-actions"><a href="#/training" className="button button-dark">Talk about training <Arrow /></a><a href="#/services" className="text-link">Bring a project idea <Arrow /></a></div>
        <p className="small-note">Training is by enquiry. Dates, availability and any fees are agreed separately.</p>
      </div>
      <div className="founder-real" data-reveal="rise"><img src="/images/founder.webp" alt="Josiah Adeyemo, founder of Billion Codes" width="720" height="900" loading="lazy" /><div><span className="hx-step-label">MEET THE PERSON BEHIND THE IDEA</span><strong>Josiah Adeyemo</strong><span>Software engineer. Founder. Fellow builder.</span><a href="#/about">More about Billion Codes <Arrow /></a></div></div>
    </section>

    <section className="hx-finale" aria-labelledby="home-finale">
      <SignalField variant="finale" spinTarget={finaleSpin} />
      <MotionToggle className="finale-motion-toggle" spinRef={finaleSpin} />
      <div className="wrap hx-finale-inner" data-reveal="">
        <Brand light />
        <p className="hx-kicker">YOUR NEXT CHAPTER IS NOT GOING TO WRITE ITSELF.</p>
        <h2 id="home-finale">Let's build<br /><span>something real.</span></h2>
        <a href="#/courses" className="button button-signal">Start learning for free <Arrow /></a>
        <p>No account. No payment. Just your curiosity.</p>
      </div>
    </section>
  </div>;
}
