/// <reference lib="webworker" />
/**
 * Runs the trace pipeline off the main thread, so sliders stay responsive.
 * Pixels are sent once per image key and kept here; later requests for the
 * same key only carry the slider values.
 */
import type { Pixels } from "./bitmap.ts";
import { createTracer, type TraceParams } from "./pipeline.ts";

export interface TraceRequest {
  id: number;
  /** Separate caches for the live preview and batch, so one doesn't evict the other. */
  channel: string;
  imageKey: string;
  pixels?: Pixels;
  params: TraceParams;
}

const MAX_IMAGES = 24;
const images = new Map<string, Pixels>();
const tracers = new Map<string, ReturnType<typeof createTracer>>();

self.onmessage = async (e: MessageEvent<TraceRequest>) => {
  const { id, channel, imageKey, pixels, params } = e.data;
  try {
    if (pixels) {
      images.delete(imageKey);
      images.set(imageKey, pixels);
      // Oldest first in a Map, so this drops the least recently sent image.
      while (images.size > MAX_IMAGES) images.delete(images.keys().next().value!);
    }
    const src = images.get(imageKey);
    if (!src) throw new Error(`No pixels for ${imageKey}`);
    let trace = tracers.get(channel);
    if (!trace) tracers.set(channel, (trace = createTracer()));
    self.postMessage({ id, result: await trace(imageKey, src, params) });
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
