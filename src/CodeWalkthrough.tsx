import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { track } from './metrics';
import { walkthroughTree, type WalkNode, type Walkthrough } from '@billioncodes/learning';

// Splits lesson text so HTML tags mentioned in prose read as code, e.g. "<h1>".
// Only wraps text in elements; nothing is ever parsed as HTML.
export function withCodeChips(text: string): ReactNode {
  const parts = text.split(/(<\/?[a-z][a-z0-9]*(?:\s[^<>]{0,80})?>)/i);
  return parts.map((part, index) => index % 2 ? <code className="inline-tag" key={index}>{part}</code> : <Fragment key={index}>{part}</Fragment>);
}

type Range = { from: number; to: number };
const within = (node: { from: number; to: number }, range: Range) => node.from > 0 && node.from >= range.from && node.to <= range.to;
const BLOCK = new Set(['main', 'section', 'article', 'header', 'footer', 'nav', 'div', 'form']);

// Renders the inert preview tree as React elements. The outermost elements produced by the
// current step's lines are outlined and labelled with their tag.
function PreviewNode({ node, range, lit }: { node: WalkNode; range: Range; lit: boolean }): ReactNode {
  if ('text' in node) return node.text;
  const on = !lit && within(node, range);
  const kids = node.children.map((child, index) => <PreviewNode key={index} node={child} range={range} lit={lit || on} />);
  const label = on ? <span className="wt-tag">{node.tag}</span> : null;
  const className = `wt-node wt-${node.tag}${on ? ' wt-target is-on' : ''}`;
  if (node.tag === 'input') return <span className={className}>{label}<span className="wt-input">{node.inputType}</span></span>;
  if (node.tag === 'img') return <span className={className}>{label}<span className="wt-img">Image: {node.alt || 'no description'}</span></span>;
  if (node.tag === 'ul' || node.tag === 'ol') { const List = node.tag; return <List className={className}>{label}{kids}</List>; }
  if (node.tag === 'li') return <li className={className}>{label}{kids}</li>;
  if (BLOCK.has(node.tag)) return <div className={className}>{label}{kids}</div>;
  return <span className={className}>{label}{kids}</span>;
}

export function CodeWalkthrough({ walkthrough, caption = 'Step through the example', subject = '' }: { walkthrough: Walkthrough; caption?: string; subject?: string }) {
  const [step, setState] = useState(0);
  // Counts a walkthrough as used the first time the learner moves between steps.
  const setStep = (next: number) => { if (next !== step) track('walkthrough_used', subject); setState(next); };
  const tree = useMemo(() => walkthroughTree(walkthrough.code), [walkthrough.code]);
  const lines = walkthrough.code.split('\n');
  const current = walkthrough.steps[Math.min(step, walkthrough.steps.length - 1)];
  const total = walkthrough.steps.length;
  return <figure className="lesson-code walkthrough">
    <figcaption>{caption}</figcaption>
    <div className="wt-grid">
      <pre className="wt-code" tabIndex={0} role="region" aria-label="Example HTML code"><code>{lines.map((line, index) => <span key={index} className={index + 1 >= current.from && index + 1 <= current.to ? 'wt-line is-on' : 'wt-line'}><span className="wt-no" aria-hidden="true">{index + 1}</span>{line}{'\n'}</span>)}</code></pre>
      <div className="wt-preview" aria-hidden="true">{tree.map((node, index) => <PreviewNode key={index} node={node} range={current} lit={false} />)}</div>
    </div>
    <div className="wt-explain" aria-live="polite"><p className="wt-step">STEP {step + 1} OF {total} · LINE{current.to > current.from ? `S ${current.from}-${current.to}` : ` ${current.from}`}</p><h3>{current.title}</h3><p>{withCodeChips(current.text)}</p></div>
    <div className="wt-controls">
      <div className="wt-dots" role="group" aria-label="Walkthrough steps">{walkthrough.steps.map((item, index) => <button type="button" key={index} aria-pressed={index === step} aria-label={`Step ${index + 1}: ${item.title}`} onClick={() => setStep(index)}>{index + 1}</button>)}</div>
      <button type="button" className="text-link" onClick={() => setStep((step + 1) % total)}>{step + 1 < total ? 'Next step' : 'Start again'} <span aria-hidden="true">→</span></button>
    </div>
  </figure>;
}
