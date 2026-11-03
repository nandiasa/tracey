/**
 * Plain 2D geometry for the trace pipeline. No DOM here, so the pipeline also
 * runs in a Web Worker and under Node (scripts/bench.ts).
 */

export interface Vec {
  x: number;
  y: number;
}

export type Segment =
  | { kind: "line"; p0: Vec; p1: Vec }
  | { kind: "cubic"; p0: Vec; c1: Vec; c2: Vec; p1: Vec };

/** A closed outline. Each segment starts where the previous one ends. */
export interface Contour {
  segments: Segment[];
}

export const v = (x: number, y: number): Vec => ({ x, y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;
export const cross = (a: Vec, b: Vec) => a.x * b.y - a.y * b.x;
export const len = (a: Vec) => Math.hypot(a.x, a.y);
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

export function norm(a: Vec): Vec {
  const l = len(a);
  return l > 1e-12 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
}

/** Unsigned angle between two directions, in degrees. */
export function angleBetween(a: Vec, b: Vec): number {
  const c = dot(norm(a), norm(b));
  return (Math.acos(Math.min(1, Math.max(-1, c))) * 180) / Math.PI;
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

export function cubicAt(p0: Vec, c1: Vec, c2: Vec, p1: Vec, t: number): Vec {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * c1.x + c * c2.x + d * p1.x, y: a * p0.y + b * c1.y + c * c2.y + d * p1.y };
}

function cubicD1(p0: Vec, c1: Vec, c2: Vec, p1: Vec, t: number): Vec {
  const mt = 1 - t;
  const a = 3 * mt * mt;
  const b = 6 * mt * t;
  const c = 3 * t * t;
  return {
    x: a * (c1.x - p0.x) + b * (c2.x - c1.x) + c * (p1.x - c2.x),
    y: a * (c1.y - p0.y) + b * (c2.y - c1.y) + c * (p1.y - c2.y),
  };
}

function cubicD2(p0: Vec, c1: Vec, c2: Vec, p1: Vec, t: number): Vec {
  const a = 6 * (1 - t);
  const b = 6 * t;
  return {
    x: a * (c2.x - 2 * c1.x + p0.x) + b * (p1.x - 2 * c2.x + c1.x),
    y: a * (c2.y - 2 * c1.y + p0.y) + b * (p1.y - 2 * c2.y + c1.y),
  };
}

/** Direction a segment leaves its start point / arrives at its end point. */
export function startTangent(s: Segment): Vec {
  if (s.kind === "line") return norm(sub(s.p1, s.p0));
  const d = sub(s.c1, s.p0);
  return norm(len(d) > 1e-9 ? d : sub(s.c2, s.p0));
}

export function endTangent(s: Segment): Vec {
  if (s.kind === "line") return norm(sub(s.p1, s.p0));
  const d = sub(s.p1, s.c2);
  return norm(len(d) > 1e-9 ? d : sub(s.p1, s.c1));
}

/** Points along a segment roughly `step` apart, excluding its start point. */
export function sampleSegment(s: Segment, step: number): Vec[] {
  if (s.kind === "line") {
    const n = Math.max(1, Math.ceil(dist(s.p0, s.p1) / step));
    const out: Vec[] = [];
    for (let i = 1; i <= n; i++) out.push(add(s.p0, scale(sub(s.p1, s.p0), i / n)));
    return out;
  }
  const hull = dist(s.p0, s.c1) + dist(s.c1, s.c2) + dist(s.c2, s.p1);
  const n = Math.max(2, Math.ceil(hull / step));
  const out: Vec[] = [];
  for (let i = 1; i <= n; i++) out.push(cubicAt(s.p0, s.c1, s.c2, s.p1, i / n));
  return out;
}

/** Shoelace area of a closed polygon; the sign gives its winding. */
export function signedArea(pts: Vec[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j].x * pts[i].y - pts[i].x * pts[j].y;
  return a / 2;
}

export function pointInPolygon(p: Vec, pts: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function perimeter(pts: Vec[]): number {
  let s = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) s += dist(pts[j], pts[i]);
  return s;
}

/**
 * Pairs holes with the shapes they cut into. Shapes wind like the biggest
 * outline, holes the other way; the smallest shape around a hole owns it.
 * owner[i] is i for a shape, its shape's index for a hole, or -1 for a stray hole.
 */
export function nestShapes(polys: Vec[][]): { areas: number[]; owner: number[] } {
  const areas = polys.map(signedArea);
  let biggest = 0;
  for (let i = 1; i < areas.length; i++) if (Math.abs(areas[i]) > Math.abs(areas[biggest])) biggest = i;
  const outerSign = Math.sign(areas[biggest] || 1);
  const shapes = polys.map((_, i) => i).filter((i) => Math.sign(areas[i]) === outerSign);
  const owner = polys.map((poly, i) => {
    if (Math.sign(areas[i]) === outerSign) return i;
    let o = -1;
    if (poly.length === 0) return o;
    for (const s of shapes) {
      if (pointInPolygon(poly[0], polys[s]) && (o < 0 || Math.abs(areas[s]) < Math.abs(areas[o]))) o = s;
    }
    return o;
  });
  return { areas, owner };
}

/** Where the infinite lines through a (direction da) and b (direction db) cross, or null if parallel. */
export function intersectLines(a: Vec, da: Vec, b: Vec, db: Vec): Vec | null {
  const den = cross(da, db);
  if (Math.abs(den) < 1e-9) return null;
  const t = cross(sub(b, a), db) / den;
  return add(a, scale(da, t));
}

// ---------------------------------------------------------------------------
// Least-squares cubic fitting (Schneider, "An Algorithm for Automatically
// Fitting Digitized Curves", Graphics Gems, 1990).
// ---------------------------------------------------------------------------

type Cubic = [Vec, Vec, Vec, Vec];

function chordParams(pts: Vec[]): number[] {
  const u = [0];
  for (let i = 1; i < pts.length; i++) u.push(u[i - 1] + dist(pts[i], pts[i - 1]));
  const total = u[u.length - 1] || 1;
  return u.map((x) => x / total);
}

/** Best cubic through pts with the end tangents fixed; only the handle lengths are solved. */
function generateCubic(pts: Vec[], u: number[], t1: Vec, t2: Vec): Cubic {
  const first = pts[0];
  const last = pts[pts.length - 1];
  let c00 = 0;
  let c01 = 0;
  let c11 = 0;
  let x0 = 0;
  let x1 = 0;
  for (let i = 0; i < pts.length; i++) {
    const t = u[i];
    const mt = 1 - t;
    const b0 = mt * mt * mt;
    const b1 = 3 * mt * mt * t;
    const b2 = 3 * mt * t * t;
    const b3 = t * t * t;
    const a1 = scale(t1, b1);
    const a2 = scale(t2, b2);
    c00 += dot(a1, a1);
    c01 += dot(a1, a2);
    c11 += dot(a2, a2);
    const tmp = sub(pts[i], add(scale(first, b0 + b1), scale(last, b2 + b3)));
    x0 += dot(a1, tmp);
    x1 += dot(a2, tmp);
  }
  const det = c00 * c11 - c01 * c01;
  let alpha1 = det === 0 ? 0 : (x0 * c11 - x1 * c01) / det;
  let alpha2 = det === 0 ? 0 : (c00 * x1 - c01 * x0) / det;
  const segLen = dist(first, last);
  let arc = 0;
  for (let i = 1; i < pts.length; i++) arc += dist(pts[i - 1], pts[i]);
  const eps = 1e-6 * arc;
  // Degenerate, backwards or runaway handles: fall back to a third of the
  // chord (Wu/Barsky heuristic); the error check then splits if needed.
  if (alpha1 < eps || alpha2 < eps || alpha1 > arc || alpha2 > arc) {
    alpha1 = alpha2 = Math.max(segLen, arc / 2) / 3;
  }
  return [first, add(first, scale(t1, alpha1)), add(last, scale(t2, alpha2)), last];
}

function maxError(pts: Vec[], c: Cubic, u: number[]): { err: number; at: number } {
  let err = 0;
  let at = Math.floor(pts.length / 2);
  for (let i = 1; i < pts.length - 1; i++) {
    const p = cubicAt(c[0], c[1], c[2], c[3], u[i]);
    const d = (p.x - pts[i].x) ** 2 + (p.y - pts[i].y) ** 2;
    if (d >= err) {
      err = d;
      at = i;
    }
  }
  return { err, at };
}

/** One Newton-Raphson step per point toward its closest parameter on the curve. */
function reparameterize(pts: Vec[], c: Cubic, u: number[]): number[] {
  return u.map((t, i) => {
    const d = sub(cubicAt(c[0], c[1], c[2], c[3], t), pts[i]);
    const d1 = cubicD1(c[0], c[1], c[2], c[3], t);
    const d2 = cubicD2(c[0], c[1], c[2], c[3], t);
    const num = dot(d, d1);
    const den = dot(d1, d1) + dot(d, d2);
    if (Math.abs(den) < 1e-12) return t;
    return Math.min(1, Math.max(0, t - num / den));
  });
}

/** Direction of the curve through pts[i], from its neighbours. */
function centreTangent(pts: Vec[], i: number): Vec {
  const k = Math.max(1, Math.min(3, i, pts.length - 1 - i));
  return norm(sub(pts[i - k], pts[i + k]));
}

/**
 * Fits the fewest cubics that stay within `tol` of every point. t1 points from
 * the first point into the curve, t2 from the last point back into it.
 */
export function fitCubics(pts: Vec[], t1: Vec, t2: Vec, tol: number): Cubic[] {
  if (pts.length < 2) return [];
  if (pts.length === 2) {
    const d = dist(pts[0], pts[1]) / 3;
    return [[pts[0], add(pts[0], scale(t1, d)), add(pts[1], scale(t2, d)), pts[1]]];
  }
  const tol2 = tol * tol;
  let u = chordParams(pts);
  let c = generateCubic(pts, u, t1, t2);
  let { err, at } = maxError(pts, c, u);
  if (err < tol2) return [c];
  if (err < tol2 * 16) {
    for (let iter = 0; iter < 6; iter++) {
      u = reparameterize(pts, c, u);
      c = generateCubic(pts, u, t1, t2);
      ({ err, at } = maxError(pts, c, u));
      if (err < tol2) return [c];
    }
  }
  at = Math.min(pts.length - 2, Math.max(1, at));
  const tc = centreTangent(pts, at);
  return [...fitCubics(pts.slice(0, at + 1), t1, tc, tol), ...fitCubics(pts.slice(at), scale(tc, -1), t2, tol)];
}
