// Generates src/motion/dark.css: a dark-theme override for every light surface,
// dark text colour and border in the original stylesheets. Rerun after editing
// those stylesheets:  node scripts/generate-dark-theme.mjs
import { readFile, writeFile } from 'node:fs/promises';
import postcss from 'postcss';

const SOURCES = ['styles', 'brand', 'learning', 'brand-blue', 'studio', 'platform', 'design/system', 'design/atlas', 'design/atlas-routes'].map(name => `src/${name}.css`);
// Homepage sections are designed directly in motion.css; shared pieces (kicker, brand) still get overrides.
const SKIP = /\.bc-(hero|course|story|finale|section|support|try|foundations|experience|numbers|rail|start|actions|honest)|hero-|\.experience|\.finale|\.photo-|\.founder-real|\.first-win/;

const SURFACE = 'rgba(10, 27, 46, .9)', SURFACE_MID = 'rgba(18, 45, 74, .92)';
const TEXT = '#e8f3fd', TEXT_MUTED = '#a9c0d6', ACCENT = '#7fd2ff';
const BORDER_ON_LIGHT = '#21405f', BORDER_STRONG = '#5a86ad';

const named = { white: '#ffffff', black: '#000000', transparent: null, currentcolor: null, inherit: null };
const tokens = {};

function parseColor(raw) {
  const value = raw.trim().toLowerCase();
  if (value in named) return named[value] ? parseColor(named[value]) : null;
  const variable = value.match(/^var\((--[\w-]+)\)$/);
  if (variable) return tokens[variable[1]] ? parseColor(tokens[variable[1]]) : null;
  let m = value.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let hex = m[1];
    if (hex.length <= 4) hex = [...hex].map(c => c + c).join('');
    return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16), a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1 };
  }
  m = value.match(/^rgba?\(([^)]+)\)$/);
  if (m) { const [r, g, b, a = '1'] = m[1].split(/[\s,/]+/).filter(Boolean); return { r: +r, g: +g, b: +b, a: +a }; }
  return null;
}
const lum = ({ r, g, b }) => { const f = c => { c /= 255; return c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
const isBlue = ({ r, g, b }) => b > r + 50 && b > 120;
const COLOR_TOKEN = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|var\(--[\w-]+\)|\bwhite\b|\bblack\b/g;

function textColor(raw) {
  const c = parseColor(raw);
  if (!c || c.a < .2) return null;
  const l = lum(c);
  if (l > .45) return null;
  if (isBlue(c) && l > .04) return ACCENT;
  return l < .05 ? TEXT : TEXT_MUTED;
}
function background(raw) {
  const colors = raw.match(COLOR_TOKEN)?.map(parseColor).filter(c => c && c.a > .15) ?? [];
  if (!colors.length || /url\(/.test(raw)) return null;
  const l = colors.reduce((sum, c) => sum + lum(c), 0) / colors.length;
  if (l < .3) return null;
  return l > .55 ? SURFACE : SURFACE_MID;
}
function recolor(raw, kind) {
  let changed = false;
  const next = raw.replace(COLOR_TOKEN, token => {
    const c = parseColor(token);
    if (!c || c.a < .1) return token;
    const l = lum(c);
    if (kind === 'shadow') { if (l > .5) { changed = true; return '#00000059'; } return token; }
    if (l > .5) { changed = true; return BORDER_ON_LIGHT; }
    if (l < .2 && !isBlue(c)) { changed = true; return BORDER_STRONG; }
    return token;
  });
  return changed ? next : null;
}

const sheets = await Promise.all(SOURCES.map(async file => postcss.parse(await readFile(file, 'utf8'), { from: file })));
// Resolve tokens in cascade order so var() lookups use the final brand values.
for (const root of sheets) root.walkDecls(/^--/, decl => { if (decl.parent.selector?.includes(':root')) tokens[decl.prop] = decl.value; });

const out = postcss.root();
for (const root of sheets) {
  root.walkRules(rule => {
    // Keep @media/@container wrappers; drop @layer so the overrides sit above every layer.
    const wrappers = [];
    for (let node = rule.parent; node && node.type !== 'root'; node = node.parent) {
      if (node.type !== 'atrule' || /keyframes/.test(node.name)) return;
      if (node.name !== 'layer') wrappers.unshift(`@${node.name} ${node.params}`);
    }
    const selectors = rule.selectors.filter(sel => !SKIP.test(sel));
    if (!selectors.length) return;
    const decls = [];
    rule.walkDecls(decl => {
      const prop = decl.prop.toLowerCase(), important = decl.important;
      let value = null, name = prop;
      if (prop === 'color' || prop === 'fill' || prop === 'stroke' || prop === '-webkit-text-fill-color') value = textColor(decl.value);
      else if (prop === 'background' || prop === 'background-color') { value = background(decl.value); name = 'background'; }
      else if (/^border(-(top|right|bottom|left))?(-color)?$/.test(prop) || prop === 'outline-color') value = recolor(decl.value, 'border');
      else if (prop === 'box-shadow') value = recolor(decl.value, 'shadow');
      if (value) decls.push(postcss.decl({ prop: name, value, important }));
    });
    if (!decls.length) return;
    const clone = postcss.rule({ selector: selectors.join(', ') });
    decls.forEach(d => clone.append(d));
    let target = out;
    for (const wrapper of wrappers) {
      const [, name, params] = wrapper.match(/^@(\S+) (.*)$/);
      let at = target.last?.type === 'atrule' && target.last.name === name && target.last.params === params ? target.last : null;
      if (!at) { at = postcss.atRule({ name, params }); target.append(at); }
      target = at;
    }
    target.append(clone);
  });
}
const header = '/* Generated by scripts/generate-dark-theme.mjs. Do not edit by hand. */\n';
await writeFile('src/motion/dark.css', header + out.toString() + '\n');
console.log(`dark.css: ${out.nodes.length} blocks`);
