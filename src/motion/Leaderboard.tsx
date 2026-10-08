import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError } from '../api';
import { fetchBoard, saveName, savedName, submitScore, type BoardEntry, type Period } from './arcadeApi';

export function BoardList({ entries, highlight }: { entries: BoardEntry[]; highlight?: string }) {
  if (!entries.length) return <p className="board-empty">No scores yet. Be the first name on the board.</p>;
  return <ol className="board-list">{entries.map(item => <li key={item.id} className={item.id === highlight ? 'is-you' : undefined}>
    <span className="board-rank">{item.rank <= 3 ? ['🥇', '🥈', '🥉'][item.rank - 1] : `#${item.rank}`}</span>
    <span className="board-name">{item.name}{item.id === highlight && <em> (you)</em>}</span>
    <span className="board-wave">W{item.wave}</span>
    <strong className="board-score">{item.score.toLocaleString()}</strong>
  </li>)}</ol>;
}

function useBoard(period: Period, refresh = 0) {
  const [state, setState] = useState<{ entries: BoardEntry[]; status: 'loading' | 'ready' | 'error' }>({ entries: [], status: 'loading' });
  useEffect(() => {
    let live = true;
    setState(current => ({ ...current, status: 'loading' }));
    fetchBoard(period).then(entries => live && setState({ entries, status: 'ready' })).catch(() => live && setState({ entries: [], status: 'error' }));
    return () => { live = false; };
  }, [period, refresh]);
  return state;
}

export function BoardPanel({ onClose }: { onClose: () => void }) {
  const [period, setPeriod] = useState<Period>('all');
  const { entries, status } = useBoard(period);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); opener?.focus?.(); };
  }, [onClose]);
  return <div className="board-panel" role="dialog" aria-modal="true" aria-labelledby="board-title">
    <div className="board-head"><h2 id="board-title">Debug Defender leaderboard</h2><button ref={closeRef} type="button" className="board-close" onClick={onClose}>Close</button></div>
    <div className="board-tabs" role="group" aria-label="Time period">
      {(['all', 'week'] as Period[]).map(value => <button type="button" key={value} aria-pressed={period === value} onClick={() => setPeriod(value)}>{value === 'all' ? 'All time' : 'This week'}</button>)}
    </div>
    {status === 'loading' && <p className="board-empty" role="status">Loading scores...</p>}
    {status === 'error' && <p className="board-empty" role="alert">The leaderboard is unavailable right now. Your best score is still saved on this device.</p>}
    {status === 'ready' && <BoardList entries={entries} />}
    <p className="board-note">Names are public. Scores are checked against the game's rules, and staff remove offensive names.</p>
  </div>;
}

// Shown on the game-over screen: claim a spot, then see where you landed.
export function ScoreSubmit({ runId, score, wave, onSubmitted }: { runId: string | null; score: number; wave: number; onSubmitted?: (entry: BoardEntry) => void }) {
  const [name, setName] = useState(savedName);
  const [state, setState] = useState<{ status: 'idle' | 'sending' | 'done' | 'error'; message?: string; entry?: BoardEntry; top?: BoardEntry[] }>({ status: 'idle' });
  if (score <= 0) return null;
  if (!runId) return <p className="board-note">The leaderboard could not be reached when this game started, so this score stays on this device.</p>;
  if (state.status === 'done' && state.entry && state.top) {
    const inTop = state.top.some(item => item.id === state.entry!.id);
    return <div className="score-result" role="status">
      <p className="score-rank">You placed <strong>#{state.entry.rank}</strong> all time{state.entry.rank === 1 ? '. You are the champion.' : '.'}</p>
      <BoardList entries={inTop ? state.top : [...state.top, state.entry]} highlight={state.entry.id} />
    </div>;
  }
  const send = async (event: FormEvent) => {
    event.preventDefault();
    setState({ status: 'sending' });
    try {
      const result = await submitScore(runId, name, score, wave);
      saveName(result.entry.name);
      setState({ status: 'done', entry: result.entry, top: result.top });
      onSubmitted?.(result.entry);
    } catch (error) {
      setState({ status: 'error', message: error instanceof ApiError ? error.fields.name || error.message : 'The score could not be sent. Try again.' });
    }
  };
  return <form className="score-form" onSubmit={send} noValidate>
    <label htmlFor="board-name">Put your score on the leaderboard</label>
    <div className="score-form-row">
      <input id="board-name" value={name} onChange={event => setName(event.target.value)} maxLength={16} minLength={2} autoComplete="nickname" placeholder="Your name" aria-describedby="board-name-help" aria-invalid={state.status === 'error' || undefined} disabled={state.status === 'sending'} />
      <button type="submit" className="button button-glow" disabled={state.status === 'sending' || name.trim().length < 2}>{state.status === 'sending' ? 'Sending...' : 'Submit score'}</button>
    </div>
    <p id="board-name-help" className={state.status === 'error' ? 'score-error' : 'board-note'} role={state.status === 'error' ? 'alert' : undefined}>{state.status === 'error' ? state.message : '2 to 16 letters or numbers. This name is shown publicly.'}</p>
  </form>;
}
