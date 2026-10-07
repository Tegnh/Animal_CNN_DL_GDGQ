// Checks the exported JavaScript against the oldest browser the site targets (see
// "browserslist" in package.json: iOS 15 / Safari 15).
//   1. Syntax: every file in out/_next must parse, and must not use syntax that arrived
//      after iOS 15.0 (class static blocks, regex lookbehind, regex d/v flags, ...).
//      Class fields, private members and ??= / ||= are fine: Safari has had them since 14.x,
//      so the iOS 15 build target correctly leaves them alone. A strict ES2020 parse is
//      reported for information only.
//   2. APIs: lists uses of browser APIs newer than iOS 15.0 so each can be judged.
// Usage: npm run build && npm run check
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';

const root = fileURLToPath(new URL('../out/_next/', import.meta.url));

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (/\.(js|mjs)$/.test(name)) yield path;
  }
}

function tryParse(code, ecmaVersion) {
  for (const sourceType of ['script', 'module']) {
    try {
      return { ast: parse(code, { ecmaVersion, sourceType, allowHashBang: true }) };
    } catch (error) {
      if (sourceType === 'module') return { error };
    }
  }
}

/** Syntax that is newer than Safari 15.0, found by walking the syntax tree. */
function lateSyntax(ast) {
  const found = new Set();
  const visit = (node) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'StaticBlock') found.add('class static block (Safari 16.4)');
    if (node.type === 'Literal' && node.regex) {
      if (/(\(\?<[=!])/.test(node.regex.pattern)) found.add('regex lookbehind (Safari 16.4)');
      if (/[dv]/.test(node.regex.flags)) found.add(`regex flag ${node.regex.flags} (Safari 17+)`);
    }
    if (node.type === 'ImportDeclaration' && node.attributes?.length) found.add('import attributes (Safari 17.2)');
    for (const key of Object.keys(node)) {
      const value = node[key];
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(ast);
  return [...found];
}

const files = [...walk(root)];
let failures = 0;
let es2020Only = 0;
let bytes = 0;
for (const file of files) {
  const code = readFileSync(file, 'utf8');
  bytes += code.length;
  const parsed = tryParse(code, 'latest');
  if (parsed.error) {
    failures++;
    const at = parsed.error.pos ?? 0;
    console.log(`SYNTAX ${relative(root, file)}: ${parsed.error.message}`);
    console.log(`       ...${code.slice(Math.max(0, at - 50), at + 50).replace(/\s+/g, ' ')}...`);
    continue;
  }
  for (const feature of lateSyntax(parsed.ast)) {
    failures++;
    console.log(`TOO NEW ${relative(root, file)}: ${feature}`);
  }
  if (tryParse(code, 2020).error) es2020Only++;
}
console.log(
  `syntax: ${files.length} files (${(bytes / 1024).toFixed(0)} kB), ${failures} problem(s) for an iOS 15.0 target`,
);
console.log(`        for information: ${es2020Only} file(s) use ES2021/2022 grammar that iOS 15 supports natively`);

// The wasm loader comes from jsDelivr at run time, not from out/. Check the same version locally.
try {
  const loader = fileURLToPath(
    new URL('../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs', import.meta.url),
  );
  const code = readFileSync(loader, 'utf8');
  const parsed = tryParse(code, 'latest');
  const late = parsed.error ? [`parse error: ${parsed.error.message}`] : lateSyntax(parsed.ast);
  if (late.length) failures += late.length;
  console.log(`runtime loader from the CDN (ort-wasm-simd-threaded.mjs): ${late.length ? late.join('; ') : 'ok for iOS 15'}`);
} catch {
  // node_modules layout changed; nothing to report
}

// Safari version in which each API arrived. Anything above 15.0 needs a guard or a fallback.
const apis = [
  [/\.at\(/g, 'Array/String .at()', '15.4'],
  [/\.findLast(Index)?\(/g, 'Array.findLast', '15.4'],
  [/Object\.hasOwn\b/g, 'Object.hasOwn', '15.4'],
  [/structuredClone\b/g, 'structuredClone', '15.4'],
  [/AbortSignal\.(timeout|any)\b/g, 'AbortSignal.timeout/any', '16.0'],
  [/randomUUID\b/g, 'crypto.randomUUID', '15.4'],
  [/crypto\.subtle\b/g, 'crypto.subtle', 'secure context only'],
  [/navigator\.clipboard\b/g, 'navigator.clipboard', 'secure context only'],
  [/\.toSorted\(|\.toReversed\(|\.with\(/g, 'Array copy methods', '16.0'],
  [/\.groupBy\(/g, 'Object/Map.groupBy', '17.4'],
  [/OffscreenCanvas\b/g, 'OffscreenCanvas', '16.4'],
  [/ImageDecoder\b/g, 'ImageDecoder', 'not in Safari'],
  [/\(\?<[=!]/g, 'regex lookbehind', '16.4'],
  [/for await\b/g, 'for await', '12'],
];
const hits = new Map();
for (const file of files) {
  const code = readFileSync(file, 'utf8');
  for (const [pattern, name, since] of apis) {
    for (const match of code.matchAll(pattern)) {
      const key = `${name} (Safari ${since})`;
      const list = hits.get(key) ?? [];
      list.push(`${relative(root, file)}: ${code.slice(Math.max(0, match.index - 45), match.index + 35).replace(/\s+/g, ' ')}`);
      hits.set(key, list);
    }
  }
}
if (!hits.size) console.log('apis: none of the listed newer APIs appear');
for (const [key, list] of hits) {
  console.log(`apis: ${key}: ${list.length} use(s)`);
  for (const line of list.slice(0, 3)) console.log(`        ${line}`);
}
process.exit(failures ? 1 : 0);
