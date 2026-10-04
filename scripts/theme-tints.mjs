// Keeps pale Tailwind colour classes readable in both console themes.
// Run after adding a new light colour class: node scripts/theme-tints.mjs
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const CSS = 'app/globals.css';
const START = '/* ── Tints for the remaining light colour classes (generated) ── */';
const END = '/* ── end of generated tints ── */';
let css = fs.readFileSync(CSS, 'utf8');
const a = css.indexOf(START);
if (a >= 0) css = css.slice(0, a) + css.slice(css.indexOf(END) + END.length + 1);

const files = execSync('git ls-files app components', { encoding: 'utf8' }).split('\n').filter((f) => /\.(jsx?|mjs)$/.test(f) && f !== 'app/page.jsx');
const FAM = 'slate|gray|zinc|neutral|stone|sky|blue|indigo|violet|purple|emerald|green|teal|cyan|rose|red|pink|amber|yellow|orange|lime|fuchsia';
const bgRe = new RegExp(`(?<![\\w-])((?:hover:|focus:|group-hover:)?(?:bg|from|via|to)-(?:(${FAM})-(50|100|200)|white)(?:\\/(\\d+))?)(?![\\w-])`, 'g');
const textRe = new RegExp(`(?<![\\w-])((?:hover:)?text-(${FAM})-(600|700|800|900))(?![\\w-])`, 'g');

const RGB = {
  indigo: '92, 107, 192', violet: '149, 117, 205', green: '102, 187, 106', teal: '38, 166, 154',
  cyan: '38, 198, 218', red: '239, 83, 80', amber: '255, 167, 38',
};
const TEXT = { indigo: '#7986cb', violet: '#9575cd', green: '#66bb6a', teal: '#26a69a', cyan: '#26c6da', red: '#ef5350', amber: '#ffa726' };
const HUE = {
  sky: 'indigo', blue: 'indigo', indigo: 'indigo', violet: 'violet', purple: 'violet', fuchsia: 'violet',
  emerald: 'green', green: 'green', lime: 'green', teal: 'teal', cyan: 'cyan',
  rose: 'red', red: 'red', pink: 'red', amber: 'amber', yellow: 'amber', orange: 'amber',
};
const NEUTRAL = new Set(['slate', 'gray', 'zinc', 'neutral', 'stone']);

const escape = (c) => '.' + c.replace(/[:/.]/g, (m) => '\\' + m);
const selector = (c) => {
  const s = escape(c);
  if (c.startsWith('hover:')) return `${s}:hover`;
  if (c.startsWith('focus:')) return `${s}:focus`;
  if (c.startsWith('group-hover:')) return `.group:hover ${s}`;
  return s;
};
const covered = (c) => css.includes(selector(c) + ',') || css.includes(selector(c) + ' {') || css.includes(selector(c) + '{');

const found = new Map();
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(bgRe)) found.set(m[1], { kind: 'bg', fam: m[2] || 'white', shade: Number(m[3] || 0) });
  for (const m of src.matchAll(textRe)) found.set(m[1], { kind: 'text', fam: m[2] });
}

const color = (c, { fam, shade }) => {
  const interactive = /^(hover|focus|group-hover):/.test(c);
  if (fam === 'white') {
    const pct = Number(c.split('/')[1] || 100);
    if (interactive) return 'var(--md-surface3)';
    return pct >= 100 ? 'var(--md-surface)' : `color-mix(in srgb, var(--md-surface) ${pct}%, transparent)`;
  }
  if (NEUTRAL.has(fam)) return interactive || shade >= 200 ? 'var(--md-surface3)' : 'var(--md-surface2)';
  const alpha = (shade >= 200 ? 0.22 : shade >= 100 ? 0.16 : 0.12) + (interactive ? 0.06 : 0);
  return `rgba(${RGB[HUE[fam]]}, ${alpha.toFixed(2)})`;
};

const rules = { bg: [], from: [], via: [], to: [], text: [] };
for (const [c, info] of [...found].sort()) {
  if (covered(c)) continue;
  const base = c.replace(/^(hover|focus|group-hover):/, '');
  const sel = selector(c);
  if (info.kind === 'text') {
    if (NEUTRAL.has(info.fam)) continue;
    rules.text.push(`${sel} { color: ${TEXT[HUE[info.fam]]} !important; }`);
  } else if (base.startsWith('bg-')) {
    rules.bg.push(`${sel} { background-color: ${color(c, info)} !important; }`);
  } else if (base.startsWith('from-')) {
    rules.from.push(`${sel} { --tw-gradient-from: ${color(c, info)} var(--tw-gradient-from-position) !important; --tw-gradient-to: transparent var(--tw-gradient-to-position) !important; }`);
  } else if (base.startsWith('via-')) {
    rules.via.push(`${sel} { --tw-gradient-stops: var(--tw-gradient-from), ${color(c, info)} var(--tw-gradient-via-position), var(--tw-gradient-to) !important; }`);
  } else if (base.startsWith('to-')) {
    rules.to.push(`${sel} { --tw-gradient-to: ${color(c, info)} var(--tw-gradient-to-position) !important; }`);
  }
}

const block = [
  START,
  '/* Pale Tailwind tints would glow on the dark surface; these keep them as',
  '   soft washes of the same hue in both themes. Regenerate with',
  '   scripts/theme-tints.mjs after adding a new light colour class. */',
  ...rules.bg, ...rules.from, ...rules.via, ...rules.to, ...rules.text,
  END,
  '',
].join('\n');
const anchor = 'html[data-text="large"] {';
css = css.replace(anchor, `${block}\n${anchor}`);
fs.writeFileSync(CSS, css);
console.log(`bg ${rules.bg.length}, from ${rules.from.length}, via ${rules.via.length}, to ${rules.to.length}, text ${rules.text.length}`);
