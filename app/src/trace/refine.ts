import {
  angleBetween,
  dist,
  endTangent,
  fitCubics,
  intersectLines,
  norm,
  sampleSegment,
  scale,
  startTangent,
  sub,
  type Contour,
  type Segment,
  type Vec,
} from "./geom.ts";

/** All lengths are in source-image pixels. */
export interface RefineParams {
  /** Spacing of the dense resample the pass works on. */
  step: number;
  /** How far a fitted curve may stray from Potrace's outline. */
  fitTol: number;
  /** How far points may stray from a chord and still count as a straight edge. */
  lineTol: number;
  /** ...and as a fraction of the chord's length, so gentle arcs aren't mistaken for lines. */
  lineBow: number;
  /** Straight runs shorter than this stay curves. */
  minLineLen: number;
  /** Lines within this many degrees of horizontal/vertical are made exactly so. 0 = off. */
  snapAngle: number;
  /** A turn sharper than this (degrees) is a corner. */
  cornerAngle: number;
  /** Arc length over which a turn is measured when looking for rounded-off corners. */
  cornerWindow: number;
  /** Corners closer together than this merge into one (removes micro-bevels). 0 = off. */
  bevelLen: number;
  /** Put anchors at horizontal/vertical extremes of curves, the way a designer would. */
  extrema: boolean;
}

export interface Anchor {
  x: number;
  y: number;
  corner: boolean;
}

/** anchors[i] is the start point of segments[i]. */
export interface RefinedContour {
  segments: Segment[];
  anchors: Anchor[];
}

interface Pt {
  p: Vec;
  corner: boolean;
}

const mod = (i: number, n: number) => ((i % n) + n) % n;

export function refineContour(contour: Contour, rp: RefineParams): RefinedContour {
  const pts = resample(contour, rp);
  if (pts.length < 4) return passThrough(contour);
  const marked = markCorners(pts, rp);
  const runs = splitRuns(marked);
  // Find and snap every straight edge before fitting anything, since a snap
  // moves corner points that the neighbouring run shares.
  // Joints are judged before snapping too, since a snapped end point skews
  // the tangent estimates near it.
  const planned = runs.filter((r) => r.pts.length >= 2).map((run) => planRun(run, rp));
  for (const { run, pieces } of planned) snapLines(run.pts, pieces, rp);
  const segments: Segment[] = [];
  const corners: boolean[] = [];
  for (const { run, pieces } of planned) fitRun(run, pieces, rp, segments, corners);
  const clean = dropDegenerate(segments, corners, Math.max(rp.step * 1.5, rp.fitTol * 1.5));
  return {
    segments: clean.segments,
    anchors: clean.segments.map((s, i) => ({ x: s.p0.x, y: s.p0.y, corner: clean.corners[i] })),
  };
}

function passThrough(contour: Contour): RefinedContour {
  return {
    segments: contour.segments,
    anchors: contour.segments.map((s) => ({ x: s.p0.x, y: s.p0.y, corner: true })),
  };
}

// ---------------------------------------------------------------------------
// 1. Resample Potrace's outline densely, remembering where its own corners are.
// ---------------------------------------------------------------------------

function resample(contour: Contour, rp: RefineParams): Pt[] {
  const segs = contour.segments;
  const pts: Pt[] = [];
  for (let k = 0; k < segs.length; k++) {
    const prev = segs[mod(k - 1, segs.length)];
    const turn = angleBetween(endTangent(prev), startTangent(segs[k]));
    // Copied, because snapping moves points in place and Potrace's output is cached.
    pts.push({ p: { ...segs[k].p0 }, corner: turn > rp.cornerAngle });
    const samples = sampleSegment(segs[k], rp.step);
    // The last sample is the next segment's start point, which that segment adds.
    for (let i = 0; i < samples.length - 1; i++) pts.push({ p: samples[i], corner: false });
  }
  return pts;
}

// ---------------------------------------------------------------------------
// 2. Find corners, including ones the sketch rounded off, and make them sharp.
// ---------------------------------------------------------------------------

function markCorners(pts: Pt[], rp: RefineParams): Pt[] {
  const n = pts.length;
  const k = Math.max(2, Math.round(rp.cornerWindow / rp.step));
  if (n < 4 * k + 4) return pts;
  const at = (i: number) => pts[mod(i, n)].p;

  // Turn measured across a window: large at real corners, small along curves.
  const turn = new Float32Array(n);
  for (let i = 0; i < n; i++) turn[i] = angleBetween(sub(at(i), at(i - k)), sub(at(i + k), at(i)));

  const candidates: number[] = [];
  for (let i = 0; i < n; i++) {
    if (pts[i].corner || turn[i] > rp.cornerAngle) candidates.push(i);
  }
  // Exact Potrace corners first, then the strongest turns, one corner per window.
  candidates.sort((a, b) => Number(pts[b].corner) - Number(pts[a].corner) || turn[b] - turn[a]);
  const taken: number[] = [];
  for (const c of candidates) {
    if (taken.every((t) => Math.min(mod(c - t, n), mod(t - c, n)) > k)) taken.push(c);
  }
  if (taken.length === 0) return pts.map((q) => ({ p: q.p, corner: false }));
  taken.sort((a, b) => a - b);

  // Group corners that sit closer than the bevel length; each group becomes one corner.
  const bevelIdx = Math.round(rp.bevelLen / rp.step);
  const groups: number[][] = [];
  for (const c of taken) {
    const g = groups[groups.length - 1];
    if (g && bevelIdx > 0 && c - g[g.length - 1] <= bevelIdx) g.push(c);
    else groups.push([c]);
  }
  if (groups.length > 1) {
    const first = groups[0];
    const last = groups[groups.length - 1];
    if (bevelIdx > 0 && first[0] + n - last[last.length - 1] <= bevelIdx) {
      groups[0] = [...last, ...first.map((c) => c + n)];
      groups.pop();
    }
  }

  const removed = new Uint8Array(n);
  const replacement = new Map<number, Vec>();
  for (const g of groups) {
    const a = g[0];
    const b = g[g.length - 1];
    if (g.length === 1 && pts[mod(a, n)].corner) {
      // Potrace already placed this corner exactly.
      replacement.set(mod(a, n), pts[mod(a, n)].p);
      continue;
    }
    // Extend the straight-ish approach on each side until they meet.
    const before = sub(at(a - k), at(a - 2 * k));
    const after = sub(at(b + 2 * k), at(b + k));
    const x = intersectLines(at(a - k), norm(before), at(b + k), norm(after));
    const mid = at(Math.round((a + b) / 2));
    const reach = Math.max(rp.cornerWindow, rp.bevelLen) * 1.5;
    // A spike longer than the gap it closes means the sides run nearly
    // parallel: that's the round end of a pen stroke, not a softened corner.
    const spike = x ? dist(x, mid) : Infinity;
    if (spike < reach && spike < dist(at(a - k), at(b + k)) && angleBetween(before, after) > rp.cornerAngle * 0.5) {
      for (let i = a - k + 1; i <= b + k - 1; i++) removed[mod(i, n)] = 1;
      removed[mod(a, n)] = 0;
      replacement.set(mod(a, n), x!);
    } else {
      // Not a corner after all, unless Potrace itself saw one in the pixels.
      for (const c of g) if (pts[mod(c, n)].corner) replacement.set(mod(c, n), at(c));
    }
  }

  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const r = replacement.get(i);
    if (r) out.push({ p: r, corner: true });
    else if (!removed[i]) out.push({ p: pts[i].p, corner: false });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3. Cut the outline into runs that go from corner to corner.
// ---------------------------------------------------------------------------

interface Run {
  pts: Vec[];
  /** False only for an outline with no corners, which is one closed smooth run. */
  cornerEnds: boolean;
}

function splitRuns(pts: Pt[]): Run[] {
  const n = pts.length;
  const firstCorner = pts.findIndex((q) => q.corner);
  if (firstCorner < 0) {
    // No corners: start at the topmost point, which is a natural extreme anyway.
    let top = 0;
    for (let i = 1; i < n; i++) if (pts[i].p.y < pts[top].p.y) top = i;
    const loop = [...pts.slice(top), ...pts.slice(0, top)].map((q) => q.p);
    return [{ pts: [...loop, loop[0]], cornerEnds: false }];
  }
  const rot = [...pts.slice(firstCorner), ...pts.slice(0, firstCorner)];
  const runs: Run[] = [];
  let cur: Vec[] = [rot[0].p];
  for (let i = 1; i <= n; i++) {
    const q = rot[i % n];
    cur.push(q.p);
    if (q.corner) {
      runs.push({ pts: cur, cornerEnds: true });
      cur = [q.p];
    }
  }
  return runs;
}

// ---------------------------------------------------------------------------
// 4. Within a run: straight edges become lines, everything else is refitted.
// ---------------------------------------------------------------------------

interface Piece {
  kind: "line" | "curve";
  from: number;
  to: number;
  /** Whether the anchor at this piece's start is a corner. */
  cornerStart: boolean;
  /** Curves only: the curve's own direction at each end, measured before snapping (tOut points backward). */
  tIn?: Vec;
  tOut?: Vec;
}

function arcLength(pts: Vec[], from: number, to: number): number {
  let s = 0;
  for (let i = from + 1; i <= to; i++) s += dist(pts[i - 1], pts[i]);
  return s;
}

function fitsLine(pts: Vec[], from: number, to: number, rp: RefineParams): boolean {
  const a = pts[from];
  const d = sub(pts[to], a);
  const l = Math.hypot(d.x, d.y);
  if (l < 1e-9) return false;
  const tol = Math.min(rp.lineTol, l * rp.lineBow);
  const off = (i: number) => {
    const q = sub(pts[i], a);
    if (Math.abs(q.x * d.y - q.y * d.x) / l > tol) return true;
    // Points must also progress along the chord, not double back.
    const t = (q.x * d.x + q.y * d.y) / (l * l);
    return t < -0.02 || t > 1.02;
  };
  // A coarse pass first: on a curve, the middle strays furthest and fails fast.
  const stride = Math.max(1, Math.floor((to - from) / 8));
  for (let i = from + stride; i < to; i += stride) if (off(i)) return false;
  for (let i = from + 1; i < to; i++) if (off(i)) return false;
  return true;
}

/** The furthest point a straight edge from `from` reaches before the outline strays. */
function lineEnd(pts: Vec[], from: number, rp: RefineParams): number {
  let j = from + 1;
  while (j + 1 < pts.length && fitsLine(pts, from, j + 1, rp)) j++;
  return j;
}

function findPieces(pts: Vec[], rp: RefineParams): Piece[] {
  const n = pts.length;
  const pieces: Piece[] = [];
  const cum = [0];
  for (let k = 1; k < n; k++) cum.push(cum[k - 1] + dist(pts[k - 1], pts[k]));
  let curveStart = 0;
  let i = 0;
  let need = 0;
  while (i < n - 1) {
    // Cheap test first: a line from here must at least reach minLineLen.
    while (need < n - 1 && cum[need] - cum[i] < rp.minLineLen) need++;
    if (cum[need] - cum[i] < rp.minLineLen || !fitsLine(pts, i, need, rp)) {
      i++;
      continue;
    }
    const j = lineEnd(pts, i, rp);
    if (cum[j] - cum[i] >= rp.minLineLen && fitsLine(pts, i, j, rp)) {
      if (i > curveStart) pieces.push({ kind: "curve", from: curveStart, to: i, cornerStart: false });
      pieces.push({ kind: "line", from: i, to: j, cornerStart: false });
      curveStart = i = j;
    } else {
      i++;
    }
  }
  if (curveStart < n - 1) pieces.push({ kind: "curve", from: curveStart, to: n - 1, cornerStart: false });
  return tidyLines(pts, pieces, rp);
}

/** Below this angle two touching lines are one edge that the greedy scan happened to break. */
const COLLINEAR = 5;

/**
 * Two lines meeting at a shallow angle are a gradual bend, not a corner:
 * join them if they're nearly collinear, otherwise let the shorter one become
 * part of a curve so the bend stays smooth.
 */
function tidyLines(pts: Vec[], pieces: Piece[], rp: RefineParams): Piece[] {
  const dir = (pc: Piece) => sub(pts[pc.to], pts[pc.from]);
  const out: Piece[] = [];
  for (const pc of pieces) {
    const prev = out[out.length - 1];
    if (prev?.kind === "line" && pc.kind === "line") {
      const ang = angleBetween(dir(prev), dir(pc));
      if (ang < COLLINEAR) {
        prev.to = pc.to;
        continue;
      }
      if (ang < rp.cornerAngle) {
        if (arcLength(pts, prev.from, prev.to) < arcLength(pts, pc.from, pc.to)) prev.kind = "curve";
        else pc.kind = "curve";
      }
    }
    out.push(pc);
  }
  // Neighbouring curves are one curve.
  const merged: Piece[] = [];
  for (const pc of out) {
    const prev = merged[merged.length - 1];
    if (prev?.kind === "curve" && pc.kind === "curve") prev.to = pc.to;
    else merged.push(pc);
  }
  return merged;
}

/** Makes near-horizontal/vertical lines exact by moving their end points in place (shared with neighbours). */
function snapLines(pts: Vec[], pieces: Piece[], rp: RefineParams) {
  if (rp.snapAngle <= 0) return;
  for (const pc of pieces) {
    if (pc.kind !== "line") continue;
    const a = pts[pc.from];
    const b = pts[pc.to];
    const ang = (Math.atan2(Math.abs(b.y - a.y), Math.abs(b.x - a.x)) * 180) / Math.PI;
    if (ang <= rp.snapAngle) {
      a.y = b.y = (a.y + b.y) / 2;
    } else if (90 - ang <= rp.snapAngle) {
      a.x = b.x = (a.x + b.x) / 2;
    }
  }
}

/**
 * Tangent at the start of pts, heading into it. Uses two chords so the
 * estimate isn't biased by the curve bending away (second-order Taylor).
 */
function headTangent(pts: Vec[], h: number): Vec {
  let i1 = 0;
  let s = 0;
  while (i1 + 1 < pts.length && s < h) s += dist(pts[i1], pts[++i1]);
  let i2 = i1;
  let s2 = s;
  while (i2 + 1 < pts.length && s2 < 2 * h) s2 += dist(pts[i2], pts[++i2]);
  const c1 = sub(pts[i1], pts[0]);
  if (i2 === i1 || s < 1e-9) return norm(c1);
  const c2 = sub(pts[i2], pts[0]);
  const t = sub(scale(c1, 2 / s), scale(c2, 1 / s2));
  return norm(Math.hypot(t.x, t.y) > 1e-9 ? t : c1);
}

/** Splits a curve at its pronounced horizontal and vertical extremes. Returns [index, tangent] pairs. */
function extremaSplits(pts: Vec[], rp: RefineParams): [number, Vec][] {
  const n = pts.length;
  const k = Math.max(1, Math.round(rp.cornerWindow / 2 / rp.step));
  const minGap = Math.max(rp.minLineLen * 0.5, rp.cornerWindow * 2);
  const prom = rp.lineTol * 1.5;
  const reach = Math.max(1, Math.round(minGap / rp.step));
  const out: [number, Vec][] = [];
  const tan = (i: number) => sub(pts[Math.min(n - 1, i + k)], pts[Math.max(0, i - k)]);
  const total = arcLength(pts, 0, n - 1);
  let lastArc = 0;
  let arc = 0;
  for (let i = 1; i < n - 1; i++) {
    arc += dist(pts[i - 1], pts[i]);
    if (arc - lastArc < minGap || total - arc < minGap) continue;
    const t0 = tan(i - 1);
    const t1 = tan(i);
    for (const axis of ["y", "x"] as const) {
      if (Math.sign(t0[axis]) === Math.sign(t1[axis]) || t1[axis] === 0) continue;
      // Both sides must fall away from the extreme by a visible amount, not just wobble.
      const lo = pts[Math.max(0, i - reach)][axis] - pts[i][axis];
      const hi = pts[Math.min(n - 1, i + reach)][axis] - pts[i][axis];
      if (Math.sign(lo) !== Math.sign(hi) || Math.min(Math.abs(lo), Math.abs(hi)) < prom) continue;
      const along = axis === "y" ? { x: Math.sign(t1.x) || 1, y: 0 } : { x: 0, y: Math.sign(t1.y) || 1 };
      out.push([i, along]);
      lastArc = arc;
      break;
    }
  }
  return out;
}

function planRun(run: Run, rp: RefineParams): { run: Run; pieces: Piece[] } {
  const pts = run.pts;
  const pieces = findPieces(pts, rp);
  const h = rp.cornerWindow / 2;
  for (const pc of pieces) {
    if (pc.kind !== "curve") continue;
    const sec = pts.slice(pc.from, pc.to + 1);
    pc.tIn = headTangent(sec, h);
    pc.tOut = headTangent(sec.reverse(), h);
  }
  const lineDir = (pc: Piece) => sub(pts[pc.to], pts[pc.from]);
  pieces.forEach((pc, pi) => {
    const prev = pieces[pi - 1];
    if (!prev) pc.cornerStart = run.cornerEnds;
    else if (prev.kind === "line" && pc.kind === "line") pc.cornerStart = true;
    else if (prev.kind === "line") pc.cornerStart = angleBetween(lineDir(prev), pc.tIn!) > rp.cornerAngle;
    else pc.cornerStart = angleBetween(scale(prev.tOut!, -1), lineDir(pc)) > rp.cornerAngle;
  });
  return { run, pieces };
}

function fitRun(run: Run, pieces: Piece[], rp: RefineParams, segments: Segment[], corners: boolean[]) {
  const pts = run.pts;
  pieces.forEach((pc, pi) => {
    if (pc.kind === "line") {
      segments.push({ kind: "line", p0: pts[pc.from], p1: pts[pc.to] });
      corners.push(pc.cornerStart);
      return;
    }
    const sec = pts.slice(pc.from, pc.to + 1);
    if (sec.length < 2) return;
    const prev = pieces[pi - 1];
    const next = pieces[pi + 1];
    // A smooth join carries the neighbouring line's (possibly snapped) direction into the curve.
    let t1 = pc.tIn!;
    if (prev?.kind === "line" && !pc.cornerStart) t1 = norm(sub(pts[prev.to], pts[prev.from]));
    else if (pi === 0 && !run.cornerEnds) t1 = norm(sub(sec[1], sec[sec.length - 2])); // seam of a closed smooth loop
    let t2 = pc.tOut!;
    if (next?.kind === "line" && !next.cornerStart) t2 = norm(sub(pts[next.from], pts[next.to]));
    else if (pi === pieces.length - 1 && !run.cornerEnds) t2 = scale(t1, -1);

    // Split at the curve's extremes so anchors land where a designer would put them.
    const cuts: [number, Vec][] = rp.extrema ? extremaSplits(sec, rp) : [];
    let from = 0;
    let tin = t1;
    let firstCorner = pc.cornerStart;
    for (const [idx, along] of [...cuts, [sec.length - 1, scale(t2, -1)] as [number, Vec]]) {
      const part = sec.slice(from, idx + 1);
      for (const c of fitCubics(part, tin, scale(along, -1), rp.fitTol)) {
        segments.push({ kind: "cubic", p0: c[0], c1: c[1], c2: c[2], p1: c[3] });
        corners.push(firstCorner);
        firstCorner = false;
      }
      from = idx;
      tin = along;
    }
  });
}

/** Removes slivers (two anchors on top of each other), keeping any corner they carried. */
function dropDegenerate(segments: Segment[], corners: boolean[], minLen: number) {
  const outS: Segment[] = [];
  const outC: boolean[] = [];
  let carryCorner = false;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    const dropped = i - outS.length;
    if (segments.length - dropped > 3 && dist(s.p0, s.p1) < minLen) {
      carryCorner ||= corners[i];
      continue;
    }
    outS.push(s);
    outC.push(corners[i] || carryCorner);
    carryCorner = false;
  }
  if (carryCorner && outC.length) outC[0] = true;
  // Keep the chain closed even if snapping nudged a seam.
  for (let i = 0; i < outS.length; i++) {
    const nxt = outS[(i + 1) % outS.length];
    if (outS[i].p1 !== nxt.p0) outS[i] = { ...outS[i], p1: nxt.p0 };
  }
  return { segments: outS, corners: outC };
}

