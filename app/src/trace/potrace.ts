import { init, potrace } from "esm-potrace-wasm";
import type { Pixels } from "./bitmap.ts";
import type { Contour, Segment, Vec } from "./geom.ts";

export interface PotraceOptions {
  /** Corner threshold: lower keeps more corners sharp. Potrace's default is 1. */
  alphamax: number;
  /** Speckles smaller than this many working pixels are dropped. */
  turdsize: number;
}

let ready: Promise<void> | null = null;

/**
 * Runs Potrace (GPL-2.0, via esm-potrace-wasm) on a black-and-white bitmap and
 * returns its outlines in bitmap pixel coordinates, y pointing down.
 */
export async function runPotrace(bitmap: Pixels, opts: PotraceOptions): Promise<Contour[]> {
  ready ??= init();
  await ready;
  const paths = await potrace(bitmap as ImageData, {
    pathonly: true,
    extractcolors: false,
    posterizelevel: 2,
    turdsize: opts.turdsize,
    turnpolicy: 4,
    alphamax: opts.alphamax,
    opticurve: 1,
    opttolerance: 0.2,
  });
  const contours: Contour[] = [];
  for (const d of paths) contours.push(...parsePotracePath(d, bitmap.height));
  return contours;
}

/**
 * Potrace writes coordinates in tenths of a pixel with y pointing up, as
 * absolute moves plus relative curves and lines.
 */
function parsePotracePath(d: string, height: number): Contour[] {
  const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  const map = (x: number, y: number): Vec => ({ x: x / 10, y: height - y / 10 });
  const contours: Contour[] = [];
  let segs: Segment[] = [];
  // Raw (unflipped, tenth-pixel) current point and subpath start.
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let cmd = "";
  let i = 0;
  const num = () => Number(toks[i++]);
  const close = () => {
    if (segs.length) contours.push({ segments: segs });
    segs = [];
  };

  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) {
      cmd = toks[i++];
      if (cmd === "z" || cmd === "Z") {
        if (cx !== sx || cy !== sy) segs.push({ kind: "line", p0: map(cx, cy), p1: map(sx, sy) });
        cx = sx;
        cy = sy;
        close();
        continue;
      }
    }
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? cx : 0;
    const oy = rel ? cy : 0;
    switch (cmd.toLowerCase()) {
      case "m": {
        close();
        cx = sx = ox + num();
        cy = sy = oy + num();
        // Further coordinate pairs after a move are implicit line-tos.
        cmd = rel ? "l" : "L";
        break;
      }
      case "l": {
        const x = ox + num();
        const y = oy + num();
        segs.push({ kind: "line", p0: map(cx, cy), p1: map(x, y) });
        cx = x;
        cy = y;
        break;
      }
      case "c": {
        const x1 = ox + num();
        const y1 = oy + num();
        const x2 = ox + num();
        const y2 = oy + num();
        const x = ox + num();
        const y = oy + num();
        segs.push({ kind: "cubic", p0: map(cx, cy), c1: map(x1, y1), c2: map(x2, y2), p1: map(x, y) });
        cx = x;
        cy = y;
        break;
      }
      default:
        // Potrace only emits M, l, c and z; skip anything else rather than loop forever.
        i++;
    }
  }
  close();
  return contours;
}
