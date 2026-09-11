export function Brand({ light = false }: { light?: boolean }) {
  return <span className={`bc-brand ${light ? 'bc-brand-light' : ''}`}><img src="/brand/billioncodes-official-v1.jpeg" width="400" height="400" alt="Billion Codes" /><span className="bc-brand-academy" aria-hidden="true">Learn.<br />Build.<br />Grow.</span></span>;
}
