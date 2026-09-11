export function Brand({ light = false }: { light?: boolean }) {
  return <span className={`bc-brand ${light ? 'bc-brand-light' : ''}`}><img src={`/brand/mark${light ? '-light' : ''}.svg`} width="46" height="46" alt="" /><span>billion<span>codes<span className="bc-brand-dot">.</span></span></span></span>;
}
