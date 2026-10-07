// Next.js writes one prefetch file per route segment, named with dots:
//   out/test/__next.test.__PAGE__.txt
// On Windows the export step leaves path separators in the name and produces nested
// folders instead (out/test/__next.test/__PAGE__.txt), so the router's requests 404.
// This flattens them. On Linux and macOS (and on Vercel) there is nothing to fix.
import { existsSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../out/', import.meta.url));
let moved = 0;

function flatten(dir, base, prefix) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) flatten(path, base, `${prefix}.${name}`);
    else {
      renameSync(path, join(base, `${prefix}.${name}`));
      moved++;
    }
  }
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (!statSync(path).isDirectory()) continue;
    if (name.startsWith('__next.')) {
      flatten(path, dir, name);
      rmSync(path, { recursive: true });
    } else if (name !== '_next') walk(path);
  }
}

if (existsSync(out)) walk(out);
if (moved) console.log(`fix-export: flattened ${moved} segment file(s)`);
