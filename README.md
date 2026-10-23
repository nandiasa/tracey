# Tracey

Sketch-to-vector tracer for logos and lettering. Turn hand-drawn sketches into clean, minimal SVGs.

Built for a branding workflow that starts with a monoline sketch in Procreate and used to end in Illustrator's Image Trace. Tracey is meant to do only that one job, and do it better: fewer anchor points, consistent corners, and (eventually) optically balanced line weight.

## What it does today (Phase 1)

- Drag a PNG or JPG onto the canvas and see it traced live over the sketch
- **Fidelity** and **Corner sensitivity** sliders, with starting values per artwork type (symbol, lettering, illustration)
- **Batch trace**: detects every separate mark on a sketch sheet, flags likely strays, and traces the ones you pick, either as separate files or together as one piece
- Export a clean SVG (black fill, no background), or all batch results as a `.zip`
- Pan the artboard with right-click drag, zoom with `Cmd/Ctrl +`, `Cmd/Ctrl -`, `Cmd/Ctrl 0` or `Cmd/Ctrl` + scroll
- Adjustable UI size

Everything runs in the browser. Sketches are never uploaded anywhere.

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

- **Phase 2 — Trace quality.** Switch to a Potrace-based engine, add a geometric cleanup pass (straighten near-straight lines, snap near-vertical and near-horizontal ones), and show anchor points with a live count. Benchmark: `sketches/sketch_1.png` should trace close to the ~30 segments of the hand-finished `sketches/Logo_1.svg`; Phase 1 produces about 84.
- **Phase 3 — Stroke mode.** Trace line drawings as a single centerline with adjustable stroke width.
- **Phase 4 — Optical correction.** Trim blobbing at stroke joints, balance vertical and horizontal weight, add overshoot to round forms.
- **Phase 5 — Workflow.** Undo, saved presets, a self-contained project file, and per-brand profiles.

## Repo layout

| Path | What's in it |
|---|---|
| `app/` | The web app (Vite + React + TypeScript) |
| `app/src/trace/` | Tracing engine wrapper, mark detection, batch export, presets |
| `project-notes.md` | Product thinking: the problem, decisions, and plans |
| `sketches/` | Reference sketches and a hand-finished logo used as the quality benchmark |
| `figma/`, `references/` | UI design exports and references |
| `preview/` | Early static UI mockups |
