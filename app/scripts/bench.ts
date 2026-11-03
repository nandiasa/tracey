/**
 * Trace-quality benchmark. Runs the real pipeline under Node on sketch PNGs
 * and reports anchor counts per slider setting, so engine changes can be
 * measured against the hand-finished reference instead of eyeballed.
 *
 *   node scripts/bench.ts [outDir] [sketch.png ...]
 *
 * Writes each SVG plus an index.html contact sheet (anchors as dots) to outDir.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, resolve } from "node:path";
import { inflateSync } from "node:zlib";

// esm-potrace-wasm's Emscripten loader expects CommonJS globals when it sees Node.
const g = globalThis as Record<string, unknown>;
g.require = createRequire(import.meta.url);
g.__dirname = import.meta.dirname;
g.__filename = import.meta.filename;
const { createTracer } = await import("../src/trace/pipeline.ts");

const SETTINGS = [
  { fidelity: 0, cornerSensitivity: 50 },
  { fidelity: 50, cornerSensitivity: 50 },
  { fidelity: 75, cornerSensitivity: 60 },
  { fidelity: 100, cornerSensitivity: 60 },
  { fidelity: 75, cornerSensitivity: 0 },
  { fidelity: 75, cornerSensitivity: 100 },
];

/** Minimal 8-bit, non-interlaced PNG decoder (Procreate/Illustrator exports). */
function decodePng(buf: Buffer) {
  let pos = 8;
  let width = 0;
  let height = 0;
  let type = 0;
  let palette: Buffer | null = null;
  let trns: Buffer | null = null;
  const idat: Buffer[] = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const kind = buf.toString("ascii", pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      type = body[9];
      if (body[8] !== 8 || body[12] !== 0) throw new Error("Only 8-bit non-interlaced PNGs are supported");
    } else if (kind === "PLTE") palette = body;
    else if (kind === "tRNS") trns = body;
    else if (kind === "IDAT") idat.push(body);
    pos += 12 + len;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!channels) throw new Error(`Unsupported PNG colour type ${type}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const px = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const cur = raw[y * (stride + 1) + 1 + x];
      const a = x >= channels ? px[y * stride + x - channels] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? px[(y - 1) * stride + x - channels] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      px[y * stride + x] = (cur + [0, a, b, (a + b) >> 1, paeth][f]) & 255;
    }
  }
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * channels;
    let rgba: number[];
    if (type === 0) rgba = [px[s], px[s], px[s], 255];
    else if (type === 2) rgba = [px[s], px[s + 1], px[s + 2], 255];
    else if (type === 3) rgba = [palette![px[s] * 3], palette![px[s] * 3 + 1], palette![px[s] * 3 + 2], trns?.[px[s]] ?? 255];
    else if (type === 4) rgba = [px[s], px[s], px[s], px[s + 1]];
    else rgba = [px[s], px[s + 1], px[s + 2], px[s + 3]];
    data.set(rgba, i * 4);
  }
  return { width, height, data };
}

const [outArg, ...files] = process.argv.slice(2);
const outDir = resolve(outArg ?? "bench-out");
const sketches = files.length ? files : [resolve(import.meta.dirname, "../../sketches/sketch_1.png")];
mkdirSync(outDir, { recursive: true });

const cards: string[] = [];
for (const file of sketches) {
  const name = basename(file, ".png");
  const img = decodePng(readFileSync(file));
  const trace = createTracer();
  console.log(`\n${name} (${img.width}x${img.height})`);
  for (const s of SETTINGS) {
    const t0 = performance.now();
    const res = await trace(name, img, s);
    const ms = Math.round(performance.now() - t0);
    const corners = res.anchors.filter((a) => a.corner).length;
    const label = `fidelity ${s.fidelity}, corners ${s.cornerSensitivity}`;
    console.log(`  ${label.padEnd(26)} ${String(res.anchors.length).padStart(4)} anchors (${corners} corners)  ${ms}ms`);
    const svgName = `${name}_f${s.fidelity}_c${s.cornerSensitivity}.svg`;
    writeFileSync(`${outDir}/${svgName}`, res.svg);
    const r = Math.max(res.width, res.height) / 180;
    const dots = res.anchors
      .map((a) =>
        a.corner
          ? `<rect x="${a.x - r}" y="${a.y - r}" width="${2 * r}" height="${2 * r}"/>`
          : `<circle cx="${a.x}" cy="${a.y}" r="${r}"/>`
      )
      .join("");
    cards.push(
      `<figure>${res.svg.replace("</svg>", `<g class="a">${dots}</g></svg>`)}<figcaption>${name}<br>${label}<br><b>${res.anchors.length} anchors</b></figcaption></figure>`
    );
  }
}

writeFileSync(
  `${outDir}/index.html`,
  `<!doctype html><meta charset="utf-8"><title>Tracey bench</title><style>
body{font:15px Inter,system-ui;background:#EBEBEB;margin:16px;display:flex;gap:12px;flex-wrap:wrap}
figure{margin:0;background:#fff;padding:12px;width:300px}svg{width:100%;height:400px;display:block}
path{fill:#1a1a12}.a{fill:#ff2d2d}figcaption{margin-top:8px;text-align:center}</style>${cards.join("")}`
);
console.log(`\nWrote ${outDir}/index.html`);
