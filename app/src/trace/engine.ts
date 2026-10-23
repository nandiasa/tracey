import ImageTracer from "imagetracerjs";

export interface TraceParams {
  /** 0-100. Higher = more geometric / simplified (fewer anchor points). */
  fidelity: number;
  /** 0-100. Higher = sharp turns are kept sharp instead of being smoothed into a curve. */
  cornerSensitivity: number;
}

const MAX_TRACE_EDGE = 2400;

/** Big sheets are traced from a downscaled copy; the SVG viewBox scales it back. */
function capSize(src: ImageData, maxEdge: number): ImageData {
  const longEdge = Math.max(src.width, src.height);
  if (longEdge <= maxEdge) return src;
  const s = maxEdge / longEdge;
  const from = document.createElement("canvas");
  from.width = src.width;
  from.height = src.height;
  from.getContext("2d")!.putImageData(src, 0, 0);
  const to = document.createElement("canvas");
  to.width = Math.round(src.width * s);
  to.height = Math.round(src.height * s);
  const ctx = to.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(from, 0, 0, to.width, to.height);
  return ctx.getImageData(0, 0, to.width, to.height);
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

/**
 * Fill-mode trace only (Phase 1). Traces the imported sketch as filled black
 * shapes on white - see project-notes.md for why stroke/centerline tracing
 * isn't built yet.
 */
export function traceImageData(source: ImageData, params: TraceParams): string {
  const imgd = capSize(source, MAX_TRACE_EDGE);
  const fidelityT = clamp01(params.fidelity / 100);
  const cornerT = clamp01(params.cornerSensitivity / 100);

  // Fidelity drives how loosely the traced path is allowed to deviate from
  // the raw pixels - low = hug every wobble, high = simplify aggressively.
  const ltres = lerp(0.2, 4, fidelityT);
  // Corner sensitivity drives how tightly curve segments must fit sharp
  // turns - low = corners get smoothed into a curve, high = kept sharp.
  const qtres = lerp(2.5, 0.15, cornerT);

  const options = {
    // Ink sketches are effectively black-on-white: a straight 2-color
    // threshold reads them far better than color quantization.
    colorsampling: 0,
    numberofcolors: 2,
    pathomit: 4,
    ltres,
    qtres,
    rightangleenhance: cornerT > 0.5,
    roundcoords: 1,
    scale: 1,
    viewbox: true,
    strokewidth: 0,
  };

  return cleanSvg(ImageTracer.imagedataToSVG(imgd, options));
}

/**
 * The tracer emits a white background layer and a stroke on every shape.
 * Neither belongs in a logo export: drop the white paths (holes in the ink
 * are already real subpaths of the black ones) and use a plain black fill.
 */
function cleanSvg(svg: string): string {
  return svg
    .replace(/<path[^>]*\/>/g, (tag) => {
      const m = tag.match(/fill="rgb\((\d+),(\d+),(\d+)\)"/);
      if (!m) return tag;
      // The palette drifts to near-white / near-black on JPEGs, so judge by brightness.
      const luma = (Number(m[1]) * 299 + Number(m[2]) * 587 + Number(m[3]) * 114) / 1000;
      return luma > 128 ? "" : tag.replace(m[0], 'fill="#000000"');
    })
    .replace(/ (stroke|stroke-width|opacity|desc)="[^"]*"/g, "");
}

/** Decodes a File (PNG/JPG) into ImageData via an offscreen canvas. */
export function fileToImageData(file: File): Promise<{ imageData: ImageData; width: number; height: number; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onerror = () => reject(new Error("Could not decode image"));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas 2D context unavailable"));
          return;
        }
        // Transparent PNGs would otherwise read as black ink.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        resolve({ imageData, width: canvas.width, height: canvas.height, dataUrl });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}
