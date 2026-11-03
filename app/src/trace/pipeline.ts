/**
 * The whole trace, from pixels to SVG: resample and threshold, Potrace, then
 * Tracey's own cleanup pass. DOM-free, so it runs in the trace worker and in
 * scripts/bench.ts under plain Node (hence the explicit .ts imports).
 */
import { prepareBitmap, type Pixels } from "./bitmap.ts";
import { clamp01, lerp, nestShapes, perimeter, type Contour, type Segment } from "./geom.ts";
import { runPotrace } from "./potrace.ts";
import { refineContour, type Anchor, type RefineParams } from "./refine.ts";
import { outline, toSvg } from "./svg.ts";

export interface TraceParams {
  /** 0-100. Higher = more geometric / simplified (fewer anchor points). */
  fidelity: number;
  /** 0-100. Higher = sharp turns are kept sharp instead of being smoothed into a curve. */
  cornerSensitivity: number;
}

export interface TraceResult {
  svg: string;
  /** Every anchor point, in source-image pixels, for the overlay. */
  anchors: Anchor[];
  width: number;
  height: number;
}

/** How big a shape is, in two senses (source-image pixels). */
export interface ShapeScale {
  /** Its extent: sets how long a straight edge or a stretch between anchors should be. */
  size: number;
  /**
   * The same, capped by how thick its ink is: sets how far the outline may
   * move and how big a corner can be, so thin pen strokes keep their width.
   */
  fine: number;
}

/**
 * Slider positions to cleanup settings for one shape. Lengths scale with the
 * shape, so a small letter next to a big symbol is simplified to the same
 * degree, and results don't depend on the export resolution.
 */
export function refineParamsFor(params: TraceParams, { size, fine }: ShapeScale): RefineParams {
  const f = clamp01(params.fidelity / 100);
  const c = clamp01(params.cornerSensitivity / 100);
  return {
    // Dense enough for the fine scale, but no denser than the shape needs.
    step: Math.max(fine / 350, size / 700),
    fitTol: fine * lerp(0.0033, 0.02, f),
    lineTol: fine * lerp(0.0022, 0.011, f),
    lineBow: lerp(0.004, 0.02, f),
    minLineLen: size * lerp(0.18, 0.11, f),
    snapAngle: f < 0.4 ? 0 : lerp(2, 8, (f - 0.4) / 0.6),
    cornerAngle: lerp(80, 40, c),
    // A wider window lets more rounded-off sketch corners still read as corners;
    // the geometric end of Fidelity squares off softer corners too.
    cornerWindow: fine * lerp(0.026, 0.066, c) * lerp(1, 1.5, f),
    bevelLen: fine * lerp(0.02, 0.09, c),
    extrema: f >= 0.25,
  };
}

/** Potrace's own corner threshold follows Corner sensitivity too. */
function alphamaxFor(params: TraceParams) {
  return Math.round(lerp(1.2, 0.8, clamp01(params.cornerSensitivity / 100)) * 20) / 20;
}

/** Shapes smaller than this share of the sketch's long edge are refined as if they were this big. */
const MIN_SHAPE = 0.12;
/** A shape's fine scale is at most this many times its ink thickness. */
const MAX_THICKNESSES = 6;
/** Ink specks smaller than this share of the long edge are dropped. */
const SPECKLE = 0.0025;

function shapeSize(c: Contour): number {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of c.segments) {
    minX = Math.min(minX, s.p0.x);
    maxX = Math.max(maxX, s.p0.x);
    minY = Math.min(minY, s.p0.y);
    maxY = Math.max(maxY, s.p0.y);
  }
  return Math.max(maxX - minX, maxY - minY);
}

/**
 * Scale each outline is refined at: its own extent, raised to the minimum for
 * small marks, and that capped by how thick its shape's ink is. Thickness is
 * 2 × area ÷ perimeter, which is the stroke width for a drawn line; holes
 * count against the area and toward the perimeter, so rings measure right.
 */
function shapeScales(contours: Contour[], longEdge: number): ShapeScale[] {
  const polys = contours.map((c) => outline(c, longEdge / 500));
  const { areas, owner } = nestShapes(polys);
  const ink = new Map<number, { area: number; edge: number }>();
  owner.forEach((o, i) => {
    if (o < 0) return;
    const g = ink.get(o) ?? { area: 0, edge: 0 };
    g.area += o === i ? Math.abs(areas[i]) : -Math.abs(areas[i]);
    g.edge += perimeter(polys[i]);
    ink.set(o, g);
  });
  return contours.map((c, i) => {
    const size = Math.max(shapeSize(c), longEdge * MIN_SHAPE);
    const g = ink.get(owner[i]);
    const fine = g && g.edge > 0 ? Math.min(size, ((2 * g.area) / g.edge) * MAX_THICKNESSES) : size;
    return { size, fine };
  });
}

function scaleContour(c: Contour, k: number): Contour {
  const m = (p: { x: number; y: number }) => ({ x: p.x * k, y: p.y * k });
  return {
    segments: c.segments.map(
      (s): Segment =>
        s.kind === "line"
          ? { kind: "line", p0: m(s.p0), p1: m(s.p1) }
          : { kind: "cubic", p0: m(s.p0), c1: m(s.c1), c2: m(s.c2), p1: m(s.p1) }
    ),
  };
}

/**
 * A tracer that remembers the last sketch's bitmap and Potrace outlines, so
 * dragging Fidelity only reruns the cheap cleanup pass.
 */
export function createTracer() {
  let lastKey: string | null = null;
  let prepared: ReturnType<typeof prepareBitmap> | null = null;
  const outlines = new Map<string, Contour[]>();
  const scaleCache = new WeakMap<Contour[], ShapeScale[]>();

  return async function trace(imageKey: string, src: Pixels, params: TraceParams): Promise<TraceResult> {
    if (imageKey !== lastKey || !prepared) {
      lastKey = imageKey;
      prepared = prepareBitmap(src);
      outlines.clear();
    }
    const { bitmap, scale } = prepared;
    const longEdge = Math.max(src.width, src.height);
    const alphamax = alphamaxFor(params);
    let contours = outlines.get(String(alphamax));
    if (!contours) {
      const turdsize = Math.max(2, Math.round((longEdge * SPECKLE * scale) ** 2));
      contours = (await runPotrace(bitmap, { alphamax, turdsize })).map((c) => scaleContour(c, 1 / scale));
      outlines.set(String(alphamax), contours);
    }
    let scales = scaleCache.get(contours);
    if (!scales) scaleCache.set(contours, (scales = shapeScales(contours, longEdge)));
    const refined = contours.map((c, i) => refineContour(c, refineParamsFor(params, scales[i])));
    return {
      svg: toSvg(refined, src.width, src.height),
      anchors: refined.flatMap((c) => c.anchors),
      width: src.width,
      height: src.height,
    };
  };
}
