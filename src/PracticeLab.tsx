import { useDeferredValue, useMemo, useState } from 'react';
import { challenges, gradeChallenge, MAX_CODE_LENGTH, previewHTML, recordAttempt, saveDraft, type Feedback } from '@billioncodes/learning';
import { changeProgress, useWorkspace } from './learningStore';
import { Arrow, Back, Icon } from './Icon';

export function PracticeLab({ id }: { id?: string }) {
  const { progress, notice } = useWorkspace();
  const challenge = challenges.find(item => item.id === id);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [resetting, setResetting] = useState(false);
  const code = challenge ? progress.drafts[challenge.id] ?? challenge.starter : '';
  const deferredCode = useDeferredValue(code);
  if (!id) {
    const completed = challenges.filter(item => progress.solved[item.id]).length;
    const next = challenges.find(item => !progress.solved[item.id] && progress.drafts[item.id])
      ?? challenges.find(item => !progress.solved[item.id]) ?? challenges[0];
    return <div className="wrap page-section studio-page practice-page">
      <header className="studio-heading">
        <div><p className="bc-kicker">PRACTICE / HTML FOUNDATIONS</p><h1>Make it. Understand it.</h1><p>Small builds with a real result. Write HTML, inspect your preview, and use the feedback to improve it.</p></div>
        <a className="text-link" href="#/workspace">Your learning desk <Arrow /></a>
      </header>
      {notice && <p role="status" className="storage-notice">{notice}</p>}
      <div className="practice-layout">
        <section aria-label="Available builds" className="exercise-grid">
          {challenges.map((item, index) => <a href={`#/practice/${item.id}`} className="exercise-card" key={item.id}>
            <div className="exercise-meta"><span>BUILD {String(index + 1).padStart(2, '0')}</span><span>About {item.minutes} min</span></div>
            <span className="exercise-glyph" aria-hidden="true">{['<h1>', '<ul>', '<form>', '<main>'][index]}</span>
            <h2>{item.title}</h2><p>{item.brief}</p>
            <div className="exercise-footer"><span>{progress.solved[item.id] ? 'Completed once on this device' : progress.drafts[item.id] ? 'Continue your draft' : 'Start building'}</span><Arrow /></div>
          </a>)}
        </section>
        <aside className="practice-path" aria-labelledby="practice-path-title">
          <p className="studio-overline">YOUR LEARNING PATH</p><h2 id="practice-path-title">HTML, one build at a time.</h2>
          <label htmlFor="practice-progress">{completed} of {challenges.length} builds completed</label>
          <progress id="practice-progress" max={challenges.length} value={completed} />
          <ol>{challenges.map(item => <li key={item.id} data-complete={!!progress.solved[item.id]}><Icon name={progress.solved[item.id] ? 'check' : 'circle'} /><span>{item.title}{progress.solved[item.id] && <span className="sr-only">, completed</span>}</span></li>)}</ol>
          <a className="button button-lime" href={`#/practice/${next.id}`}>{completed === challenges.length ? 'Revisit a build' : progress.drafts[next.id] ? 'Continue your build' : 'Start your next build'} <Arrow /></a>
          <p className="practice-local-note">Saved on this device. No streaks or scores to chase. Scripts never run in these exercises.</p>
        </aside>
      </div>
    </div>;
  }
  if (!challenge) return <div className="wrap page-section"><h1>That exercise is not here.</h1><a href="#/practice">Choose an available exercise</a></div>;
  return <LabBuild key={challenge.id} challenge={challenge} code={code} deferredCode={deferredCode} feedback={feedback} setFeedback={setFeedback} resetting={resetting} setResetting={setResetting} />;
}

type LabProps = { challenge: (typeof challenges)[number]; code: string; deferredCode: string; feedback: Feedback | null; setFeedback: (value: Feedback | null) => void; resetting: boolean; setResetting: (value: boolean) => void };

function LabBuild({ challenge, code, deferredCode, feedback, setFeedback, resetting, setResetting }: LabProps) {
  const { progress, notice } = useWorkspace();
  // Grading is pure and takes well under a millisecond, so the brief can tick as the learner types.
  const live = useMemo(() => gradeChallenge(challenge.id, deferredCode), [challenge.id, deferredCode]);
  const goalsMet = live.checks.slice(0, challenge.goals.length).filter(item => item.passed).length;
  const hasContent = deferredCode.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, '').trim().length > 0;
  const nextBuild = challenges[challenges.indexOf(challenge) + 1];
  function edit(value: string) { changeProgress(current => saveDraft(current, challenge!.id, value)); setFeedback(null); }
  function check() { setFeedback(gradeChallenge(challenge!.id, code)); changeProgress(current => recordAttempt(current, challenge!.id, code)); }
  const position = challenges.indexOf(challenge);
  const status = (item: typeof challenge) => progress.solved[item.id] ? 'Completed' : progress.drafts[item.id] ? 'Draft saved' : 'Not started';
  return <div className="wrap page-section studio-page lab-page"><a className="back-link" href="#/practice"><Back /> All exercises</a><div className="lab-heading"><div><p className="bc-kicker">PRACTICE / BUILD {String(position + 1).padStart(2, '0')} OF {String(challenges.length).padStart(2, '0')} / ABOUT {challenge.minutes} MIN</p><h1>{challenge.title}</h1><p>{challenge.brief}</p></div><a href="#/workspace" className="text-link">Learning desk <Arrow /></a></div>
    <nav className="atlas-build-rail" aria-label="Practice builds"><ol>{challenges.map((item, index) => <li key={item.id} data-state={status(item).toLowerCase().replace(' ', '-')}><a href={`#/practice/${item.id}`} aria-current={item.id === challenge.id ? 'step' : undefined}><span className="atlas-build-no" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><span className="atlas-build-title">{item.title}</span><span className="atlas-build-state"><Icon name={progress.solved[item.id] ? 'check' : 'circle'} />{status(item)}</span></a></li>)}</ol></nav>
    {notice && <p role="status" className="storage-notice">{notice}</p>}<div className="lab-grid"><section className="lab-editor"><div className="workbench-bar"><span>index.html</span><span>HTML ONLY</span></div><label htmlFor="exercise-code">Your HTML</label><textarea id="exercise-code" spellCheck={false} autoCapitalize="off" autoCorrect="off" value={code} maxLength={MAX_CODE_LENGTH} onChange={event => edit(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); check(); } }} aria-describedby="code-note code-shortcut" /><p id="code-note">{code.length.toLocaleString()} / {MAX_CODE_LENGTH.toLocaleString()} characters. Do not put passwords or private information in practice code.</p><p id="code-shortcut" className="atlas-key-hint">Press <kbd>Ctrl</kbd> + <kbd>Enter</kbd> (<kbd>⌘</kbd> + <kbd>Enter</kbd> on Mac) to check without leaving the editor.</p><div className="lab-actions"><button className={`button button-lime${live.passed && !feedback?.passed ? ' is-ready' : ''}`} onClick={check}>Check my build <Arrow /></button><button className="reset-link" onClick={() => setResetting(true)}>Reset code</button></div>{resetting && <div className="inline-confirm"><p>Replace this draft with the starter code? Your earlier completion record will remain.</p><button onClick={() => { edit(challenge.starter); setResetting(false); }}>Replace draft</button><button onClick={() => setResetting(false)}>Keep editing</button></div>}</section><section className="lab-results"><div className="lab-preview-heading"><h2>Your preview</h2><span className="badge badge-paper">INERT HTML</span></div><div className="lab-preview-frame"><iframe title="Safe HTML practice preview" srcDoc={previewHTML(deferredCode)} sandbox="" tabIndex={-1} />{!hasContent && <p className="lab-preview-empty" aria-hidden="true">Your page appears here as you type.</p>}</div><p className="small-note">A structural preview, not a full browser: scripts, styles, navigation and submission are disabled. Unknown elements are omitted.</p><details className="lab-hint"><summary>Need a nudge?</summary><p>{challenge.hint}</p></details><div className="build-feedback" aria-live="polite" aria-atomic="true">{feedback ? <><h2>{feedback.passed ? 'You made it work.' : 'A few things to work on.'}</h2>{feedback.passed && <div className="lab-success"><span className="lab-burst" aria-hidden="true" /><p>Saved on this device. {nextBuild ? 'Ready for the next one?' : 'That was the last build. Nicely done.'}</p><a className="button button-glow" href={nextBuild ? `#/practice/${nextBuild.id}` : '#/practice'}>{nextBuild ? `Next build: ${nextBuild.title}` : 'Back to all builds'} <Arrow /></a></div>}{feedback.error && <p>{feedback.error}</p>}<ul>{feedback.checks.map(item => <li key={item.label} className={item.passed ? 'check-pass' : 'check-miss'}><Icon name={item.passed ? 'check' : 'circle'} /><span>{item.passed ? 'Passed: ' : 'Try again: '}{item.label}</span></li>)}</ul><p className="small-note">These checks test the exercise goals, not every HTML or accessibility rule. Local practice is not certification.</p></> : <><h2>Your brief</h2><p className="lab-live-count" role="status">{goalsMet} of {challenge.goals.length} goals met as you type</p><div className="lab-meter" aria-hidden="true"><i style={{ transform: `scaleX(${goalsMet / challenge.goals.length})` }} /></div><ul className="lab-goals">{challenge.goals.map((goal, index) => { const met = !!live.checks[index]?.passed; return <li key={goal} className={met ? 'goal-met' : undefined}><Icon name={met ? 'check' : 'circle'} /><span>{goal}{met && <span className="sr-only"> (met)</span>}</span></li>; })}</ul>{!live.checks[challenge.goals.length]?.passed && <p className="lab-warning">Scripts, embeds and non-HTTPS links are not allowed in these exercises.</p>}<p className="small-note">{live.passed ? 'All goals met. Choose “Check my build” to save your result.' : 'Choose “Check my build” when you are ready.'}</p></>}</div></section></div></div>;
}
