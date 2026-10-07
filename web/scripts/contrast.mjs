// Measures WCAG contrast for the colour pairs the site actually uses and writes the
// table into docs/DESIGN.md. Colours are read from src/app/globals.css.
import { readFileSync, writeFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
const token = (name) => css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'))[1];

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// [use, foreground, background]
const pairs = [
  ['Body text', 'ink', 'paper'],
  ['Secondary text', 'forest', 'paper'],
  ['Labels and small mono text', 'moss', 'paper'],
  ['Text on raised panels', 'ink', 'mist'],
  ['Labels on raised panels', 'forest', 'mist'],
  ['Body text on deep bands', 'paper', 'deep'],
  ['Labels on deep bands', 'leaf', 'deep'],
  ['Button text', 'paper', 'ink'],
  ['Unknown / error text', 'clay', 'clay-wash'],
  ['Unknown / error text on the page', 'clay', 'paper'],
];

const grade = (r) => (r >= 7 ? 'AAA' : r >= 4.5 ? 'AA' : r >= 3 ? 'AA large only' : 'FAIL');
const rows = pairs.map(([use, fg, bg]) => {
  const r = ratio(token(fg), token(bg));
  return `| ${use} | \`--${fg}\` on \`--${bg}\` | ${r.toFixed(2)}:1 | ${grade(r)} |`;
});
const table = ['| Use | Pair | Ratio | WCAG |', '| --- | --- | --- | --- |', ...rows].join('\n');
console.log(table);

const file = new URL('../docs/DESIGN.md', import.meta.url);
const doc = readFileSync(file, 'utf8');
writeFileSync(
  file,
  doc.replace(/<!-- contrast:start -->[\s\S]*<!-- contrast:end -->/, `<!-- contrast:start -->\n${table}\n<!-- contrast:end -->`),
);
