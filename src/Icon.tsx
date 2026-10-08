// Deterministic inline icons. Unicode arrows such as U+2197 are emoji-eligible
// and render as colour emoji on iOS, so visible UI never uses glyph arrows.
// Every icon is decorative: the surrounding text carries the meaning.
const paths = {
  'arrow-up-right': <path d="M7 17 17 7M8.5 7H17v8.5" />,
  'arrow-right': <path d="M4 12h15M13 6l6 6-6 6" />,
  'arrow-left': <path d="M20 12H5M11 6l-6 6 6 6" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  circle: <circle cx="12" cy="12" r="6.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  menu: <path d="M4 8h16M4 16h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  spark: <path d="M12 2.5v19M2.5 12h19M5.3 5.3l13.4 13.4m0-13.4L5.3 18.7" />,
  code: <path d="m8.5 7-5 5 5 5m7-10 5 5-5 5M13.5 4.5l-3 15" />,
  mail: <><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="m4 7 8 6 8-6" /></>,
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return <svg className={`icon icon-${name} ${className}`.trim()} viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}

/** Internal next-step arrow. Use `external` for links that leave the site. */
export const Arrow = ({ external = false }: { external?: boolean }) => <Icon name={external ? 'arrow-up-right' : 'arrow-right'} />;
export const Back = () => <Icon name="arrow-left" />;
