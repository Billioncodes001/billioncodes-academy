import { Fragment, useState, type ReactNode } from 'react';

// Splits lesson text so HTML tags mentioned in prose read as code, e.g. "<h1>".
// Only wraps text in elements; nothing is ever parsed as HTML.
export function withCodeChips(text: string): ReactNode {
  const parts = text.split(/(<\/?[a-z][a-z0-9]*(?:\s[^<>]{0,80})?>)/i);
  return parts.map((part, index) => index % 2 ? <code className="inline-tag" key={index}>{part}</code> : <Fragment key={index}>{part}</Fragment>);
}

type Part = 'main' | 'h1' | 'p' | 'a';
const code = ['<main>', '  <h1>My first project</h1>', '  <p>A reading list for curious people.</p>', '  <a href="/reading-list">Open the reading list</a>', '</main>'];
const steps: { part: Part; lines: number[]; title: string; text: string }[] = [
  { part: 'main', lines: [0, 4], title: 'main holds the page', text: 'Everything important sits inside main. Screen readers can jump straight to it, so visitors skip menus and get to the point.' },
  { part: 'h1', lines: [1], title: 'h1 names the page', text: 'One clear main heading tells everyone what this page is about. Pick it for meaning, not for size: CSS handles size.' },
  { part: 'p', lines: [2], title: 'p explains', text: 'A paragraph carries the explanation. Short, plain sentences help every reader.' },
  { part: 'a', lines: [3], title: 'a takes you somewhere', text: 'An anchor with an href is a link to a destination. Keyboards and screen readers already know how to use it.' },
];

export function CodeWalkthrough() {
  const [step, setStep] = useState(0);
  const current = steps[step];
  const mark = (part: Part) => current.part === part ? 'wt-target is-on' : 'wt-target';
  return <figure className="lesson-code walkthrough">
    <figcaption>A simple page structure · step through it</figcaption>
    <div className="wt-grid">
      <pre className="wt-code" tabIndex={0} role="region" aria-label="Example HTML code"><code>{code.map((line, index) => <span key={index} className={current.lines.includes(index) ? 'wt-line is-on' : 'wt-line'}><span className="wt-no" aria-hidden="true">{index + 1}</span>{line}{'\n'}</span>)}</code></pre>
      <div className="wt-preview" aria-hidden="true">
        <div className={mark('main')}><span className="wt-label">main</span>
          <div className={mark('h1')}><span className="wt-label">h1</span><strong>My first project</strong></div>
          <div className={mark('p')}><span className="wt-label">p</span><span>A reading list for curious people.</span></div>
          <div className={mark('a')}><span className="wt-label">a</span><u>Open the reading list</u></div>
        </div>
      </div>
    </div>
    <div className="wt-explain" aria-live="polite"><p className="wt-step">STEP {step + 1} OF {steps.length}</p><h3>{current.title}</h3><p>{current.text}</p></div>
    <div className="wt-controls">
      <div className="wt-dots" role="group" aria-label="Walkthrough steps">{steps.map((item, index) => <button type="button" key={item.part} aria-pressed={index === step} aria-label={`Step ${index + 1}: ${item.title}`} onClick={() => setStep(index)}>{index + 1}</button>)}</div>
      <button type="button" className="text-link" onClick={() => setStep((step + 1) % steps.length)}>{step + 1 < steps.length ? 'Next step' : 'Start again'} <span aria-hidden="true">→</span></button>
    </div>
  </figure>;
}
