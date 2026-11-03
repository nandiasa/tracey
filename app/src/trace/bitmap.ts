/** The bits of ImageData the pipeline uses, so plain objects work too (Node, worker messages). */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Small sketches are scaled up to at least this long edge, big sheets down to at most the max. */
const MIN_WORK_EDGE = 1600;
const MAX_WORK_EDGE = 3000;
const MAX_UPSCALE = 4;
const INK_LUMA = 128;

/**
 * Resamples the sketch to the working size and thresholds it to pure black and
 * white. Scaling up before thresholding keeps the sub-pixel edge position that
 * anti-aliasing carries, so Potrace sees a smoother outline than the raw pixels.
 * Returns the bitmap and how many working pixels make one source pixel.
 */
export function prepareBitmap(src: Pixels): { bitmap: Pixels; scale: number } {
  const longEdge = Math.max(src.width, src.height);
  const scale =
    longEdge < MIN_WORK_EDGE ? Math.min(MAX_UPSCALE, MIN_WORK_EDGE / longEdge) : Math.min(1, MAX_WORK_EDGE / longEdge);
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));

  // Luminance with transparency composited on white, so transparent PNGs read as paper.
  const luma = new Float32Array(src.width * src.height);
  for (let i = 0, p = 0; i < luma.length; i++, p += 4) {
    const a = src.data[p + 3] / 255;
    const l = (src.data[p] * 299 + src.data[p + 1] * 587 + src.data[p + 2] * 114) / 1000;
    luma[i] = l * a + 255 * (1 - a);
  }

  const out = new Uint8ClampedArray(w * h * 4);
  const sx = src.width / w;
  const sy = src.height / h;
  // Box-average when shrinking so thin lines don't drop out; bilinear when growing.
  const box = Math.max(1, Math.floor(Math.min(sx, sy)));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let l: number;
      if (box > 1) {
        const x0 = Math.floor(x * sx);
        const y0 = Math.floor(y * sy);
        let sum = 0;
        let n = 0;
        for (let yy = y0; yy < Math.min(src.height, y0 + box); yy++) {
          for (let xx = x0; xx < Math.min(src.width, x0 + box); xx++) {
            sum += luma[yy * src.width + xx];
            n++;
          }
        }
        l = sum / n;
      } else {
        const fx = Math.min(src.width - 1, Math.max(0, (x + 0.5) * sx - 0.5));
        const fy = Math.min(src.height - 1, Math.max(0, (y + 0.5) * sy - 0.5));
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const x1 = Math.min(src.width - 1, x0 + 1);
        const y1 = Math.min(src.height - 1, y0 + 1);
        const tx = fx - x0;
        const ty = fy - y0;
        const top = luma[y0 * src.width + x0] * (1 - tx) + luma[y0 * src.width + x1] * tx;
        const bot = luma[y1 * src.width + x0] * (1 - tx) + luma[y1 * src.width + x1] * tx;
        l = top * (1 - ty) + bot * ty;
      }
      const ink = l < INK_LUMA ? 0 : 255;
      const o = (y * w + x) * 4;
      out[o] = out[o + 1] = out[o + 2] = ink;
      out[o + 3] = 255;
    }
  }
  return { bitmap: { width: w, height: h, data: out }, scale: w / src.width };
}
