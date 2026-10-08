import { useId } from 'react';

// Code-native course covers: blueprint grid, dot matrix and a single idea per
// topic. Pure SVG, no network request, scales crisply and never needs alt text.
export type CoverKind = 'html' | 'web' | 'lab';
export const coverKinds: CoverKind[] = ['html', 'web', 'lab'];

export function CoverArt({ kind, className = '' }: { kind: CoverKind; className?: string }) {
  const id = useId().replace(/:/g, '');
  return <svg className={`cover-art cover-art-${kind} ${className}`.trim()} viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#0a2a5c" /><stop offset="1" stopColor={kind === 'web' ? '#0f4fd1' : kind === 'lab' ? '#08376f' : '#0d3f99'} /></linearGradient>
      <pattern id={`${id}-grid`} width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0v20" fill="none" stroke="#8fc2ff" strokeOpacity=".16" strokeWidth="1" /></pattern>
      <pattern id={`${id}-dots`} width="8" height="8" patternUnits="userSpaceOnUse"><rect x="3" y="3" width="2" height="2" fill="#bfe0ff" fillOpacity=".55" /></pattern>
    </defs>
    <rect width="320" height="200" fill={`url(#${id}-bg)`} />
    <rect width="320" height="200" fill={`url(#${id}-grid)`} />
    {kind === 'html' && <g>
      <rect x="196" y="22" width="104" height="76" fill={`url(#${id}-dots)`} />
      <g fill="none" stroke="#e8f3ff" strokeWidth="9" strokeLinecap="square"><path d="M84 62 46 100l38 38" /><path d="M236 62l38 38-38 38" /></g>
      <path d="M176 48 144 152" stroke="#5aa9ff" strokeWidth="9" strokeLinecap="square" />
      <g fill="#e8f3ff"><rect x="102" y="96" width="30" height="8" rx="1" /><rect x="186" y="96" width="34" height="8" rx="1" fillOpacity=".55" /></g>
      <path d="M20 180h80M20 180v-8M100 180v-8" stroke="#8fc2ff" strokeOpacity=".6" />
    </g>}
    {kind === 'web' && <g>
      <rect x="30" y="34" width="176" height="128" rx="6" fill="#071a3a" stroke="#8fc2ff" strokeOpacity=".7" />
      <path d="M30 52h176" stroke="#8fc2ff" strokeOpacity=".7" />
      <g fill="#5aa9ff"><circle cx="42" cy="43" r="3" /><circle cx="52" cy="43" r="3" fillOpacity=".6" /><circle cx="62" cy="43" r="3" fillOpacity=".35" /></g>
      <rect x="44" y="66" width="92" height="12" rx="2" fill="#e8f3ff" />
      <rect x="44" y="86" width="148" height="6" rx="2" fill="#8fc2ff" fillOpacity=".5" /><rect x="44" y="98" width="120" height="6" rx="2" fill="#8fc2ff" fillOpacity=".5" />
      <rect x="44" y="116" width="66" height="30" rx="3" fill={`url(#${id}-dots)`} stroke="#5aa9ff" /><rect x="118" y="116" width="74" height="30" rx="3" fill="#0f4fd1" stroke="#5aa9ff" />
      <path d="M206 98c40 0 44-50 78-50" fill="none" stroke="#e8f3ff" strokeWidth="2" strokeDasharray="2 6" strokeLinecap="round" />
      <rect x="262" y="30" width="38" height="38" rx="5" fill="#e8f3ff" /><path d="M271 42h20M271 49h20M271 56h12" stroke="#0a2a5c" strokeWidth="3" strokeLinecap="round" />
    </g>}
    {kind === 'lab' && <g strokeLinejoin="round">
      <rect x="20" y="24" width="96" height="64" fill={`url(#${id}-dots)`} />
      {[[160, 126, '#e8f3ff'], [208, 100, '#5aa9ff'], [160, 74, '#2f7bf0']].map(([x, y, fill], index) => <g key={index} transform={`translate(${x} ${y})`}>
        <path d="M0 0l40-20 40 20-40 20z" fill={fill as string} />
        <path d="M0 0v30l40 20V20z" fill={fill as string} fillOpacity=".62" />
        <path d="M80 0v30L40 50V20z" fill={fill as string} fillOpacity=".38" />
      </g>)}
      <path d="M40 160h60l12-12" fill="none" stroke="#8fc2ff" strokeOpacity=".7" />
      <circle cx="112" cy="148" r="4" fill="#e8f3ff" />
    </g>}
  </svg>;
}
