import type { Pixels } from "./bitmap.ts";
import type { TraceParams, TraceResult } from "./pipeline.ts";
import type { TraceRequest } from "./worker.ts";

export type { TraceParams, TraceResult };

/*
 * Main-thread side of the trace worker (see worker.ts / pipeline.ts).
 */

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, { resolve: (r: TraceResult) => void; reject: (e: Error) => void }>();
/** Image keys whose pixels have been sent to the worker. */
const sent = new Set<string>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (e: MessageEvent<{ id: number; result?: TraceResult; error?: string }>) => {
    const job = waiting.get(e.data.id);
    if (!job) return;
    waiting.delete(e.data.id);
    if (e.data.result) job.resolve(e.data.result);
    else job.reject(new Error(e.data.error ?? "Trace failed"));
  };
  worker.onerror = (e) => {
    // A crashed worker loses its image cache: fail what's waiting and start fresh next time.
    for (const job of waiting.values()) job.reject(new Error(e.message || "Trace worker crashed"));
    waiting.clear();
    sent.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

const imageKeys = new WeakMap<object, string>();

/** A stable key per pixel buffer, so the worker can cache it. */
export function imageKeyFor(pixels: Pixels): string {
  let key = imageKeys.get(pixels);
  if (!key) imageKeys.set(pixels, (key = `img${nextId++}`));
  return key;
}

function post(channel: string, imageKey: string, pixels: Pixels | undefined, params: TraceParams): Promise<TraceResult> {
  const w = getWorker();
  const id = nextId++;
  const msg: TraceRequest = { id, channel, imageKey, params, pixels };
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    w.postMessage(msg);
  });
}

/** Traces in the worker. imageKey must change whenever the pixels do. */
export async function traceInWorker(
  channel: string,
  imageKey: string,
  pixels: Pixels,
  params: TraceParams
): Promise<TraceResult> {
  if (!sent.has(imageKey)) {
    sent.add(imageKey);
    return post(channel, imageKey, pixels, params);
  }
  try {
    return await post(channel, imageKey, undefined, params);
  } catch (err) {
    // The worker only keeps recent images; send the pixels again if it dropped them.
    if (!(err instanceof Error && err.message.startsWith("No pixels"))) throw err;
    return post(channel, imageKey, pixels, params);
  }
}

/**
 * Runs one task at a time and, while it's busy, keeps only the newest request.
 * Dragging a slider then traces as fast as the worker can go without a backlog.
 * Results are dropped if a request with a different scope has come in since.
 */
export function createLatestRunner<T>() {
  let busy = false;
  let pending: { scope: string; task: () => Promise<T>; done: (r: T) => void } | null = null;
  let scope: string | null = null;

  function pump() {
    if (busy || !pending) return;
    const job = pending;
    pending = null;
    busy = true;
    job
      .task()
      .then((r) => {
        if (job.scope === scope) job.done(r);
      })
      .catch((err) => console.error("Trace failed", err))
      .finally(() => {
        busy = false;
        pump();
      });
  }

  return {
    run(nextScope: string, task: () => Promise<T>, done: (r: T) => void) {
      scope = nextScope;
      pending = { scope: nextScope, task, done };
      pump();
    },
    /** Forget the current scope, so nothing in flight gets delivered. */
    clear() {
      scope = null;
      pending = null;
    },
  };
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
