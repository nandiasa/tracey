import { strToU8, zipSync } from "fflate";
import { imageKeyFor, traceInWorker, type TraceParams } from "./engine";

export interface BatchSource {
  key: string;
  name: string;
  imageData: ImageData;
}

export interface BatchResult {
  key: string;
  name: string;
  svg: string;
  anchorCount: number;
}

export async function traceBatch(sources: BatchSource[], params: TraceParams): Promise<BatchResult[]> {
  return Promise.all(
    sources.map(async (s) => {
      const res = await traceInWorker("batch", imageKeyFor(s.imageData), s.imageData, params);
      return { key: s.key, name: s.name, svg: res.svg, anchorCount: res.anchors.length };
    })
  );
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadSvg(name: string, svg: string) {
  saveBlob(new Blob([svg], { type: "image/svg+xml" }), `${name}.svg`);
}

export function downloadZip(zipName: string, results: BatchResult[]) {
  const files: Record<string, Uint8Array> = {};
  for (const r of results) files[`${r.name}.svg`] = strToU8(r.svg);
  const zipped = zipSync(files);
  saveBlob(new Blob([zipped.buffer as ArrayBuffer], { type: "application/zip" }), `${zipName}.zip`);
}
