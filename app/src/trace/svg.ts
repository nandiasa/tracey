import { nestShapes, sampleSegment, type Contour, type Vec } from "./geom.ts";
import type { RefinedContour } from "./refine.ts";

const r = (n: number) => String(Math.round(n * 100) / 100);
const pt = (p: Vec) => `${r(p.x)},${r(p.y)}`;

function pathData(c: RefinedContour): string {
  const s = c.segments;
  if (s.length === 0) return "";
  let d = `M${pt(s[0].p0)}`;
  for (let i = 0; i < s.length; i++) {
    const seg = s[i];
    const closing = i === s.length - 1;
    if (seg.kind === "line") {
      // The final straight edge back to the start is implied by Z.
      if (!closing) d += `L${pt(seg.p1)}`;
    } else {
      d += `C${pt(seg.c1)} ${pt(seg.c2)} ${pt(seg.p1)}`;
    }
  }
  return d + "Z";
}

/** The outline as a polygon, with points about `step` apart along curves. */
export function outline(c: Contour, step = 4): Vec[] {
  const pts: Vec[] = [];
  for (const s of c.segments) {
    pts.push(s.p0);
    for (const q of sampleSegment(s, step)) pts.push(q);
  }
  return pts;
}

/**
 * One <path> per solid shape, with its holes as extra subpaths. Potrace winds
 * holes opposite to shapes, so the default nonzero fill punches them out, and
 * Illustrator/Figma import each shape as its own compound path.
 */
export function toSvg(contours: RefinedContour[], width: number, height: number): string {
  const { owner } = nestShapes(contours.map((c) => outline(c)));
  const shapes = owner.flatMap((o, i) => (o === i ? [i] : []));
  const holesOf = new Map<number, number[]>(shapes.map((i) => [i, []]));
  owner.forEach((o, i) => {
    if (o >= 0 && o !== i) holesOf.get(o)!.push(i);
  });

  const paths = shapes
    .map((s) => [s, ...holesOf.get(s)!].map((i) => pathData(contours[i])).join(""))
    .filter((d) => d)
    .map((d) => `<path d="${d}"/>`);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">` +
    paths.join("") +
    `</svg>`
  );
}
