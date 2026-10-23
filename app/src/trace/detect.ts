export interface DetectedMark {
  /** Position in display order (also used for filenames). */
  id: number;
  /** Padded bounding box in source-image pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The mark cropped out of the sheet, with neighbouring marks painted white. */
  imageData: ImageData;
  thumbUrl: string;
  /** Looks like an accidental dot or line. Pre-sorted only, never deleted. */
  stray: boolean;
}

const INK_LUMA = 140;
const WORK_SIZE = 900;

function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  const pre = new Int32Array(Math.max(w, h) + 1);

  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) pre[x + 1] = pre[x] + mask[row + x];
    for (let x = 0; x < w; x++) {
      const lo = Math.max(0, x - r);
      const hi = Math.min(w, x + r + 1);
      tmp[row + x] = pre[hi] - pre[lo] > 0 ? 1 : 0;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) pre[y + 1] = pre[y] + tmp[y * w + x];
    for (let y = 0; y < h; y++) {
      const lo = Math.max(0, y - r);
      const hi = Math.min(h, y + r + 1);
      out[y * w + x] = pre[hi] - pre[lo] > 0 ? 1 : 0;
    }
  }
  return out;
}

function toThumb(img: ImageData, max = 200): string {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  c.getContext("2d")!.putImageData(img, 0, 0);
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const t = document.createElement("canvas");
  t.width = Math.max(1, Math.round(img.width * s));
  t.height = Math.max(1, Math.round(img.height * s));
  const ctx = t.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(c, 0, 0, t.width, t.height);
  return t.toDataURL("image/png");
}

/**
 * Finds the separate marks on a sketch sheet. Ink is thresholded, grown by a
 * small radius so parts of one drawing that sit close together stay joined,
 * then split into connected regions.
 */
export function detectMarks(src: ImageData): DetectedMark[] {
  const W = src.width;
  const H = src.height;
  const data = src.data;
  const scale = Math.min(1, WORK_SIZE / Math.max(W, H));
  const w = Math.max(1, Math.ceil(W * scale));
  const h = Math.max(1, Math.ceil(H * scale));
  const sx = (x: number) => Math.min(w - 1, Math.floor(x * scale));
  const sy = (y: number) => Math.min(h - 1, Math.floor(y * scale));

  const ink = new Uint8Array(W * H);
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < H; y++) {
    const my = sy(y) * w;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if ((data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000 < INK_LUMA) {
        ink[y * W + x] = 1;
        mask[my + sx(x)] = 1;
      }
    }
  }

  const r = Math.max(2, Math.round(0.0033 * Math.max(w, h)));
  const grown = dilate(mask, w, h, r);

  // Label connected regions (8-connectivity) with an iterative flood fill.
  const labels = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  let count = 0;
  for (let start = 0; start < w * h; start++) {
    if (!grown[start] || labels[start]) continue;
    count++;
    let top = 0;
    stack[top++] = start;
    labels[start] = count;
    while (top > 0) {
      const p = stack[--top];
      const px = p % w;
      const py = (p - px) / w;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = py + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx;
          if (nx < 0 || nx >= w) continue;
          const q = ny * w + nx;
          if (grown[q] && !labels[q]) {
            labels[q] = count;
            stack[top++] = q;
          }
        }
      }
    }
  }

  const inkCount = new Int32Array(count + 1);
  const minX = new Int32Array(count + 1).fill(W);
  const minY = new Int32Array(count + 1).fill(H);
  const maxX = new Int32Array(count + 1).fill(-1);
  const maxY = new Int32Array(count + 1).fill(-1);
  for (let y = 0; y < H; y++) {
    const my = sy(y) * w;
    for (let x = 0; x < W; x++) {
      if (!ink[y * W + x]) continue;
      const lab = labels[my + sx(x)];
      if (!lab) continue;
      inkCount[lab]++;
      if (x < minX[lab]) minX[lab] = x;
      if (x > maxX[lab]) maxX[lab] = x;
      if (y < minY[lab]) minY[lab] = y;
      if (y > maxY[lab]) maxY[lab] = y;
    }
  }

  const longEdge = Math.max(W, H);
  const found: Omit<DetectedMark, "id">[] = [];
  for (let lab = 1; lab <= count; lab++) {
    if (inkCount[lab] === 0) continue;
    const bw = maxX[lab] - minX[lab] + 1;
    const bh = maxY[lab] - minY[lab] + 1;
    const pad = Math.max(6, Math.round(0.06 * Math.max(bw, bh)));
    const x0 = Math.max(0, minX[lab] - pad);
    const y0 = Math.max(0, minY[lab] - pad);
    const x1 = Math.min(W - 1, maxX[lab] + pad);
    const y1 = Math.min(H - 1, maxY[lab] + pad);
    const cw = x1 - x0 + 1;
    const ch = y1 - y0 + 1;

    const out = new ImageData(cw, ch);
    out.data.fill(255);
    for (let y = y0; y <= y1; y++) {
      const my = sy(y) * w;
      for (let x = x0; x <= x1; x++) {
        if (labels[my + sx(x)] !== lab) continue;
        const i = (y * W + x) * 4;
        const o = ((y - y0) * cw + (x - x0)) * 4;
        out.data[o] = data[i];
        out.data[o + 1] = data[i + 1];
        out.data[o + 2] = data[i + 2];
        out.data[o + 3] = 255;
      }
    }

    const longSide = Math.max(bw, bh);
    const fillRatio = inkCount[lab] / (bw * bh);
    const tiny = longSide < 0.022 * longEdge || inkCount[lab] < 0.00005 * W * H;
    const thinStroke = fillRatio < 0.08 && inkCount[lab] < 0.0006 * W * H;

    found.push({
      x: x0,
      y: y0,
      w: cw,
      h: ch,
      imageData: out,
      thumbUrl: toThumb(out),
      stray: tiny || thinStroke,
    });
  }

  // Real marks first in reading order, likely strays last.
  const band = 0.08 * H;
  found.sort((a, b) => {
    if (a.stray !== b.stray) return a.stray ? 1 : -1;
    const ra = Math.round((a.y + a.h / 2) / band);
    const rb = Math.round((b.y + b.h / 2) / band);
    return ra !== rb ? ra - rb : a.x - b.x;
  });
  return found.map((m, id) => ({ ...m, id }));
}

/** Merges several detected marks into one image, for tracing as a single piece. */
export function composeMarks(marks: DetectedMark[]): ImageData {
  const x0 = Math.min(...marks.map((m) => m.x));
  const y0 = Math.min(...marks.map((m) => m.y));
  const x1 = Math.max(...marks.map((m) => m.x + m.w));
  const y1 = Math.max(...marks.map((m) => m.y + m.h));
  const c = document.createElement("canvas");
  c.width = x1 - x0;
  c.height = y1 - y0;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = "multiply";
  for (const m of marks) {
    const t = document.createElement("canvas");
    t.width = m.w;
    t.height = m.h;
    t.getContext("2d")!.putImageData(m.imageData, 0, 0);
    ctx.drawImage(t, m.x - x0, m.y - y0);
  }
  return ctx.getImageData(0, 0, c.width, c.height);
}
