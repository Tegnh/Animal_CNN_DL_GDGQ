// Procedural topography: a seeded height field cut into contour loops with
// marching squares. Deterministic, so server and client render the same SVG.

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface FieldOptions {
  seed: number;
  cols: number;
  rows: number;
  /** Number of hills summed into the terrain. */
  hills?: number;
  /** Force the border to zero so every contour closes into an island. */
  island?: boolean;
}

export interface Field {
  cols: number;
  rows: number;
  values: Float32Array;
}

export function makeField({ seed, cols, rows, hills = 9, island = true }: FieldOptions): Field {
  const rand = mulberry32(seed);
  const bumps = Array.from({ length: hills }, () => ({
    x: 0.14 + rand() * 0.72,
    y: 0.14 + rand() * 0.72,
    r: 0.1 + rand() * 0.2,
    h: 0.45 + rand() * 0.75,
  }));
  const values = new Float32Array(cols * rows);
  let max = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const u = i / (cols - 1);
      const v = j / (rows - 1);
      let z = 0;
      for (const b of bumps) {
        const dx = (u - b.x) / b.r;
        const dy = ((v - b.y) / b.r) * (rows / cols);
        z += b.h * Math.exp(-(dx * dx + dy * dy));
      }
      // A gentle ripple keeps long contours from looking like plain circles.
      z += 0.05 * Math.sin(u * 9 + seed) * Math.cos(v * 7 - seed);
      if (island) {
        const edge = Math.min(u, 1 - u, v, 1 - v);
        z *= Math.min(1, edge * 9);
      }
      values[j * cols + i] = z;
      if (z > max) max = z;
    }
  }
  for (let k = 0; k < values.length; k++) values[k] = Math.max(0, values[k] / max);
  return { cols, rows, values };
}

// Edges of a cell: top, right, bottom, left -> pairs joined for each corner case.
const T = 0;
const R = 1;
const B = 2;
const L = 3;
const CASES: number[][][] = [
  [],
  [[L, B]],
  [[B, R]],
  [[L, R]],
  [[T, R]],
  [], // saddle, resolved below
  [[T, B]],
  [[T, L]],
  [[T, L]],
  [[T, B]],
  [], // saddle, resolved below
  [[T, R]],
  [[L, R]],
  [[B, R]],
  [[L, B]],
  [],
];

/** One SVG path (all loops at this height), scaled to width x height. */
export function contourPath(field: Field, level: number, width: number, height: number): string {
  const { cols, rows, values } = field;
  const sx = width / (cols - 1);
  const sy = height / (rows - 1);
  const at = (i: number, j: number) => values[j * cols + i];
  // Every crossing sits on exactly one grid edge, so the edge id links segments.
  const hEdge = (i: number, j: number) => 2 * (j * cols + i);
  const vEdge = (i: number, j: number) => 2 * (j * cols + i) + 1;

  const points = new Map<number, [number, number]>();
  const links = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    (links.get(a) ?? links.set(a, []).get(a)!).push(b);
    (links.get(b) ?? links.set(b, []).get(b)!).push(a);
  };
  const cross = (a: number, b: number) => (level - a) / (b - a);

  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const tl = at(i, j);
      const tr = at(i + 1, j);
      const br = at(i + 1, j + 1);
      const bl = at(i, j + 1);
      const index =
        (tl >= level ? 8 : 0) | (tr >= level ? 4 : 0) | (br >= level ? 2 : 0) | (bl >= level ? 1 : 0);
      if (index === 0 || index === 15) continue;

      let segments = CASES[index];
      if (index === 5 || index === 10) {
        const centreInside = (tl + tr + br + bl) / 4 >= level;
        const joined = [[T, L], [B, R]];
        const split = [[T, R], [L, B]];
        segments = (index === 5) === centreInside ? joined : split;
      }

      const ids = [hEdge(i, j), vEdge(i + 1, j), hEdge(i, j + 1), vEdge(i, j)];
      const place = (edge: number) => {
        if (points.has(ids[edge])) return;
        if (edge === T) points.set(ids[edge], [(i + cross(tl, tr)) * sx, j * sy]);
        else if (edge === R) points.set(ids[edge], [(i + 1) * sx, (j + cross(tr, br)) * sy]);
        else if (edge === B) points.set(ids[edge], [(i + cross(bl, br)) * sx, (j + 1) * sy]);
        else points.set(ids[edge], [i * sx, (j + cross(tl, bl)) * sy]);
      };
      for (const [a, b] of segments) {
        place(a);
        place(b);
        link(ids[a], ids[b]);
      }
    }
  }

  const visited = new Set<number>();
  const walk = (start: number): number[] => {
    const chain = [start];
    visited.add(start);
    let current = start;
    for (;;) {
      const next = (links.get(current) ?? []).find((n) => !visited.has(n));
      if (next === undefined) break;
      visited.add(next);
      chain.push(next);
      current = next;
    }
    return chain;
  };

  const r = (n: number) => Math.round(n);
  let d = '';
  const emit = (chain: number[], closed: boolean) => {
    const pts = chain.map((id) => points.get(id)!);
    if (pts.length < 3) return;
    const mid = (a: [number, number], b: [number, number]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (closed) {
      const start = mid(pts[pts.length - 1], pts[0]);
      d += `M${r(start[0])} ${r(start[1])}`;
      for (let k = 0; k < pts.length; k++) {
        const m = mid(pts[k], pts[(k + 1) % pts.length]);
        d += `Q${r(pts[k][0])} ${r(pts[k][1])} ${r(m[0])} ${r(m[1])}`;
      }
      d += 'Z';
    } else {
      d += `M${r(pts[0][0])} ${r(pts[0][1])}`;
      for (let k = 1; k < pts.length - 1; k++) {
        const m = mid(pts[k], pts[k + 1]);
        d += `Q${r(pts[k][0])} ${r(pts[k][1])} ${r(m[0])} ${r(m[1])}`;
      }
      const last = pts[pts.length - 1];
      d += `L${r(last[0])} ${r(last[1])}`;
    }
  };

  // Open chains (cut by the border) first, starting from their loose ends.
  for (const [id, neighbours] of links) {
    if (!visited.has(id) && neighbours.length === 1) emit(walk(id), false);
  }
  for (const id of links.keys()) {
    if (!visited.has(id)) emit(walk(id), true);
  }
  return d;
}

export function levels(count: number, from = 0.08, to = 0.92): number[] {
  return Array.from({ length: count }, (_, k) => from + ((to - from) * k) / (count - 1));
}
