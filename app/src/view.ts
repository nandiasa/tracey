export interface View {
  zoom: number;
  /** Pan offset in canvas pixels, measured from the centred position. */
  x: number;
  y: number;
}

export const DEFAULT_VIEW: View = { zoom: 1, x: 0, y: 0 };
export const ZOOM_STEP = 1.25;

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;

/** Zooms by `factor` while keeping the point (px, py) - relative to the canvas centre - fixed on screen. */
export function zoomAround(view: View, factor: number, px = 0, py = 0): View {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor));
  const k = zoom / view.zoom;
  return { zoom, x: px - k * (px - view.x), y: py - k * (py - view.y) };
}
