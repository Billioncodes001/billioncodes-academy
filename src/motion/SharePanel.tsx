import { useEffect, useRef, useState } from 'react';
import { cardBlob, renderShareCard } from './shareCard';

export type ShareResult = { score: number; wave: number; name?: string; rank?: number; entryId?: string };

const SITE = 'https://learnatbillioncodes.com';

export function shareLink(result: ShareResult) { return result.entryId ? `${SITE}/c/${result.entryId}` : `${SITE}/`; }
export function shareText(result: ShareResult) {
  return `I scored ${result.score.toLocaleString('en-US')} in Debug Defender${result.rank ? ` and I'm #${result.rank} on the leaderboard` : ''}. Can you beat me?`;
}

// Share sheet for a finished game: the generated card, native share, download and social links.
export function SharePanel({ result, onClose }: { result: ShareResult; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState('');
  const [ready, setReady] = useState(false);
  const url = shareLink(result), text = shareText(result);

  useEffect(() => {
    if (!canvasRef.current) return;
    renderShareCard(canvasRef.current, { score: result.score, wave: result.wave, name: result.name, rank: result.rank }).then(() => setReady(true)).catch(() => setStatus('The image could not be drawn, but you can still share the link.'));
  }, [result.score, result.wave, result.name, result.rank]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); opener?.focus?.(); };
  }, [onClose]);

  const file = async () => new File([await cardBlob(canvasRef.current!)], 'debug-defender-score.png', { type: 'image/png' });
  const canShareFiles = typeof navigator.canShare === 'function';

  async function nativeShare() {
    try {
      const image = ready ? await file() : null;
      if (image && navigator.canShare?.({ files: [image] })) await navigator.share({ files: [image], title: 'Debug Defender', text: `${text} ${url}` });
      else await navigator.share({ title: 'Debug Defender', text, url });
      setStatus('Shared. Good luck holding your spot.');
    } catch (error) { if ((error as Error).name !== 'AbortError') setStatus('Sharing did not work here. Download the image or copy the link instead.'); }
  }
  async function download() {
    try {
      const href = URL.createObjectURL(await cardBlob(canvasRef.current!));
      const link = document.createElement('a');
      link.href = href; link.download = 'debug-defender-score.png';
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 1000);
      setStatus('Image saved. Post it anywhere and add your challenge link.');
    } catch { setStatus('The image could not be saved. Try copying the link instead.'); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(`${text} ${url}`); setStatus('Challenge copied. Paste it to a friend.'); }
    catch { setStatus(`Copy this link: ${url}`); }
  }

  const encoded = { text: encodeURIComponent(text), url: encodeURIComponent(url), both: encodeURIComponent(`${text} ${url}`) };
  const networks = [
    ['X', `https://twitter.com/intent/tweet?text=${encoded.text}&url=${encoded.url}`],
    ['WhatsApp', `https://wa.me/?text=${encoded.both}`],
    ['LinkedIn', `https://www.linkedin.com/sharing/share-offsite/?url=${encoded.url}`],
    ['Facebook', `https://www.facebook.com/sharer/sharer.php?u=${encoded.url}`],
  ];

  return <div className="board-panel share-panel" role="dialog" aria-modal="true" aria-labelledby="share-title">
    <div className="board-head"><h2 id="share-title">Share your score</h2><button ref={closeRef} type="button" className="board-close" onClick={onClose}>Close</button></div>
    <canvas ref={canvasRef} className="share-card" role="img" aria-label={`Score card: ${result.score} points, wave ${result.wave}${result.name ? `, by ${result.name}` : ''}${result.rank ? `, number ${result.rank} on the leaderboard` : ''}.`} />
    {!result.entryId && <p className="board-note">Tip: put your name on the leaderboard first, so your link shows your score when a friend opens it.</p>}
    <div className="share-actions">
      {typeof navigator.share === 'function' && <button type="button" className="button button-glow" onClick={nativeShare}>{canShareFiles ? 'Share image' : 'Share'}</button>}
      <button type="button" className="button button-ghost" onClick={download} disabled={!ready}>Download image</button>
      <button type="button" className="button button-ghost" onClick={copy}>Copy challenge link</button>
    </div>
    <div className="share-networks" role="group" aria-label="Post to a social network">
      {networks.map(([label, href]) => <a key={label} href={href} target="_blank" rel="noopener noreferrer">{label}<span className="sr-only"> (opens in a new tab)</span></a>)}
    </div>
    <p className="board-note" role="status">{status}</p>
  </div>;
}
