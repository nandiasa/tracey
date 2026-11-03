# Tracey

Sketch-to-vector tracer for logos and lettering. Turn hand-drawn sketches into clean, minimal SVGs.

Built for a branding workflow that starts with a monoline sketch in Procreate and used to end in Illustrator's Image Trace. Tracey is meant to do only that one job, and do it better: fewer anchor points, consistent corners, and (eventually) optically balanced line weight.

## What it does today (Phases 1–2)

- Drag a PNG or JPG onto the canvas and see it traced live over the sketch
- **Fidelity** (true to the sketch ↔ geometric) and **Corner sensitivity** (soft ↔ sharp corners) sliders, with starting values per artwork type (symbol, lettering, illustration)
- **Potrace engine plus Tracey's own cleanup pass**: rounded-off corners are sharpened, micro-bevels merged, straight edges detected and snapped to horizontal/vertical, curves refitted with as few anchor points as possible. Thin pen strokes keep their width and round ends
- **Anchor-point overlay** with a live count (squares are corners, circles are smooth points); click the count to hide it
- Tracing runs in a background worker, so the sliders stay responsive
- **Batch trace**: detects every separate mark on a sketch sheet, flags likely strays, and traces the ones you pick, either as separate files or together as one piece
- Export a clean SVG (black fill, no background), or all batch results as a `.zip`
- Pan the artboard with right-click drag, zoom with `Cmd/Ctrl +`, `Cmd/Ctrl -`, `Cmd/Ctrl 0` or `Cmd/Ctrl` + scroll
- Adjustable UI size

Everything runs in the browser. Sketches are never uploaded anywhere.

## Trace benchmark

`npm run bench` (in `app/`) traces `sketches/sketch_1.png` at several slider settings under Node and prints anchor counts. It also writes the SVGs and a contact sheet to `app/bench-out/`. Pass other PNGs to bench them too:

```bash
npm run bench -- bench-out ../sketches/sketch_1.png ../sketches/sketch_all.png
```

## License note

The trace engine uses [Potrace](https://potrace.sourceforge.net) through `esm-potrace-wasm`, both **GPL-2.0**. That's fine while Tracey is private. Before distributing it publicly or selling it, either release Tracey's source under the GPL, get a commercial Potrace license, or replace `app/src/trace/potrace.ts` with an independent implementation. The rest of the pipeline (`bitmap.ts`, `geom.ts`, `refine.ts`, `svg.ts`) is Tracey's own code and takes plain outlines, so swapping the engine doesn't touch it.

## Run it locally

Needs [Node.js](https://nodejs.org) (LTS).

```bash
cd app
npm install
npm run dev
```

Then open http://localhost:5173.

To build the static site that gets deployed:

```bash
npm run build
```

The output goes to `app/dist`.

## Roadmap

- **Phase 2 — Trace quality. Done.** Potrace engine, geometric cleanup pass, anchor overlay with live count, tracing off the main thread. `sketches/sketch_1.png` now traces to 37–38 anchors at Symbol settings (Phase 1: 84; hand-finished `Logo_1.svg`: 36).
- **Phase 3 — Stroke mode.** Trace line drawings as a single centerline with adjustable stroke width.
- **Phase 4 — Optical correction.** Trim blobbing at stroke joints, balance vertical and horizontal weight, add overshoot to round forms.
- **Phase 5 — Workflow.** Undo, saved presets, a self-contained project file, and per-brand profiles.

## Repo layout

| Path | What's in it |
|---|---|
| `app/` | The web app (Vite + React + TypeScript) |
| `app/src/trace/` | Trace pipeline (`pipeline.ts` → `bitmap.ts`, `potrace.ts`, `refine.ts`, `svg.ts`), worker and client, mark detection, batch export, presets |
| `app/scripts/bench.ts` | Trace-quality benchmark |
| `project-notes.md` | Product thinking: the problem, decisions, and plans |
| `sketches/` | Reference sketches and a hand-finished logo used as the quality benchmark |
| `figma/`, `references/` | UI design exports and references |
| `preview/` | Early static UI mockups |
