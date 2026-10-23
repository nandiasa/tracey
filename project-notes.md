# Trace App — Project Notes

*Status: Concept/discussion phase. Nothing has been built yet.*

## Background

Nandia is a graphic designer with 12+ years of experience, specializing in branding, who started her career as a traditional/analog designer. Sketching by hand is still core to her ideation process — especially for finding logo forms and figuring out what supergraphics work for a brand.

**Current workflow:**
1. Sketch in Procreate using a monoline brush (even, mono-width line, drawn with vectorization in mind)
2. Export as PNG
3. Auto-trace in Adobe Illustrator — including its newer stroke-trace feature, which can trace a drawing as an editable stroke (not just a fill), letting stroke width be reset inside Illustrator

**Pain points with the current process:**
1. **Cost** — Adobe subscription is expensive for what's essentially one workflow step
2. **Loss of optical balance** — auto-trace treats line weight based on pixel density, not perceived/optical weight, distorting custom lettering and symbol forms
3. **No smoothness/fidelity control** — no way to tell the tracer "treat a wobbly hand-drawn vertical as straight." Results in excess anchor points that need manual smoothing/Pathfinder cleanup afterward
4. **Inconsistent corner handling** — sharp corners get rounded unpredictably, or pick up weird micro-bevels depending on noise/resolution in the Procreate export

## The idea

A purpose-built sketch-to-vector app for **logo/lettering/symbol design specifically** — not a general image tracer — that solves the four problems above directly.

## Core engine & controls

- **Centerline/stroke tracing available**, not fill-only — the feature Nandia already considers genius in Illustrator's newer engine
- **Fill / Stroke toggle** — not a forced default either way. Auto-suggested per image (large solid fill regions with few thin appendages → suggest fill; continuous uniform-width line → suggest stroke), always visible, one-click override.
  - Confirmed with real evidence from her own sketches: `sketch_all.png` mixes both types on one sheet; `sketch_1.png` → `Logo_1.svg` shows a sketch drawn as a filled silhouette tracing through to a filled-path final logo.
- **Fidelity slider** — true-to-sketch/wobbly ↔ geometric/idealized, minimizing anchor points at the geometric end
- **Corner sensitivity** — threshold for "sharp corner, keep it" vs. "curve, smooth it," fixing inconsistent corner rounding
- **Corner/curve point locking** — manually tag a specific point as hard-corner or smooth when the algorithm guesses wrong
- **Optical intelligence pass** (toggle) — junction trimming (so stroke crossings/meetings don't blob), vertical/horizontal weight compensation, curve overshoot on round forms. On by default for Symbol/Lettering presets, off for illustration.

## Artwork-type presets

- **Symbol/Icon**, **Lettering/Logotype**, **Ink illustration/line art** — same underlying sliders, different starting values (bundles of settings, not separate hardcoded logic)
- Auto-suggested from the sketch itself, manually overridable
- Save-your-own custom preset
- Independent of the fill/stroke toggle — a preset can default to either, and can still be flipped regardless (her own sheet shows both types even within one ideation session)

## Multi-sketch sheet handling

- Auto-detect distinct ink regions on an imported sheet (fast, cheap — classic blob/connected-region detection, not heavy processing)
- Presented as a thumbnail picker (contact-sheet style)
- Likely stray/accidental marks (small, sparse) shown **unselected by default** but still visible and clickable — never auto-deleted
- Multi-select to bundle blobs together, with two clearly distinct outcomes so they're never confused:
  - **Group-as-one-composition** — selected blobs traced together as ONE output (e.g. the separate letters of a wordmark). Smart-guessed from proximity/alignment, correctable via a small non-blocking "Together / Separate" toggle — never a blocking question.
  - **Batch-apply-same-settings** — selected blobs traced as SEPARATE outputs that just share one settings recipe (bulk-efficiency case, e.g. a page of unrelated doodles)
- Similarity grouping reuses the fill/stroke auto-classifier rather than a separate "similarity" system
- **Standing design principle:** smart default first, correction always one click away, never a required upfront step or question

## Workflow / performance

- Live, non-destructive preview — sliders update the vector over the sketch in real time, no commit-and-pray
- Downsampled preview while dragging, full-precision result on release, to stay responsive
- Local/on-device processing — no cloud round-trip needed for the core trace (this class of algorithm is lightweight and decades-old, not ML-heavy — "light" and "precise" aren't actually in tension)

## Import / Export

- **Import:** PNG (Procreate export), v1
- **Export:** SVG as the primary output (feeds Illustrator/Figma), optional PNG preview export for quick sharing

## Save / project file

- A native **working file** format, distinct from export — preserves the original sketch, current slider settings, group/batch selections, and manual point corrections (the editable state, same relationship as .psd vs. .jpg)
- Must be **self-contained**: embeds the original sketch inside the save file itself rather than just linking to it on disk, so handing the file to another designer doesn't break it

## UI / UX

- Neutral, established icon language borrowed from Adobe/Figma/Affinity/Canva conventions — no invented icon metaphors
- Two-tone neutral dark grey palette (darker panel background, slightly lighter grey for input fields/pills), white text — modeled on the Figma reference (`references/figma_ui.png`)
- **One restrained accent color**, reserved only for active tools/selected/interactive states — not decoration. Checked for real contrast (WCAG AA minimum, ideally AAA given Nandia's eye condition) rather than eyeballed
- **No general color tooling** — color is intentionally left for downstream apps (Illustrator/Figma); keeps focus entirely on trace quality, avoids confusing users with features that don't optimize the core job
- **Typography:** Geist or Inter, no mono fonts — chosen for on-screen legibility (tall x-height, open counters), disambiguated characters (I / l / 1), and a wide weight range for building hierarchy without relying only on size or color
- **Big-by-default UI**, globally adjustable scale (icons, text, spacing, and hit targets scale together, not separately) — a deliberate stance against the cramped, everything-in-a-toolbar density most pro tools default to
- Minimal always-visible controls (fidelity, corner sensitivity, fill/stroke, artwork-type preset, optical correction); secondary options tucked behind disclosure rather than cluttering the main view

## Platform & scope

- **Platform: Web app**, starting point
  - Simpler environment setup (just needs Node/npm) vs. a native iPad/Mac app, which would require installing full Xcode
  - Trade-off: no live Apple Pencil stroke/pressure capture in v1, since a web app works from an already-flattened Procreate PNG export either way. That idea (using draw-time velocity/pressure to better distinguish intended lines from wobble/correction) is deferred to a possible v2, if there's ever an in-app drawing canvas instead of importing from Procreate.
- **Scope: "possibly a product later."** Build with a clean separation between the trace engine and the UI/presets from the start, without over-investing in onboarding/polish prematurely.

## Competitive edge — what actually beats Adobe Illustrator here

The core structural advantage: Illustrator's Image Trace has to stay generic enough for photos, textures, comic inking, anything — so it can never bake in logo/type-specific intelligence without breaking everything else it's used for. This app only has one job. That narrowness is the real moat; the features below all lean into it specifically.

1. **Manual corrections survive slider changes.** A locked corner or a custom stroke-width fix should act as a "pin" that persists even when the fidelity or corner-sensitivity slider is adjusted afterward — the algorithm recomputes around the fix instead of discarding it. Illustrator can't do this structurally, since Image Trace collapses to dumb paths the moment it's expanded, wiping out any prior manual edits the next time you retrace.
2. **Make the algorithm's decisions visible, not a black box.** A "show what changed" view — toggling between raw trace / optically-corrected trace / original sketch, or a ghost-overlay diff — turns the optical-correction pass into something auditable and trustworthy, directly answering the original "I don't trust what pixel-density tracing did to my line weight" problem.
3. **A brand-level consistency profile, not just a per-logo preset.** For branding work specifically, a project is usually a logo plus supergraphics plus maybe an icon set that all need to read as one family. A saved *profile* tied to a project — every mark in that brand system runs through identical optical rules — is something Illustrator has no concept of at all.
4. **Clean export as a first-class feature.** Guaranteed minimal anchors, consistent path winding, properly closed paths, and layers named after what was actually detected (not "Path 1, Path 2...") — removing the manual cleanup tax Illustrator's traced output currently requires.
5. **Near-instant live-preview as a felt experience, not just a spec.** Illustrator's Image Trace panel visibly lags on each adjustment, which discourages exploring settings. Fast local processing changes actual behavior — trying 5 fidelity settings in the time Illustrator makes you wait for 1, which matters most exactly during ideation.

Plus the structural one underneath all of it: **cost** — a focused tool instead of a slice of a full Creative Cloud subscription.

## Environment check (as of this conversation)

- Project folder: `/Volumes/Nandi/SANROK/Trace App` — git available (2.50.1)
- Xcode: only Command Line Tools installed, no full Xcode.app (not required for the web app path)
- Node/npm: **not yet installed** — needed before any build work starts
- Python 3.9.6 present; Rust/cargo not installed (neither required for the current plan)

## Reference materials on hand

- [`sketches/sketch_1.png`](sketches/sketch_1.png) — filled-silhouette ribbon/S-shaped sketch
- [`sketches/sketch_all.png`](sketches/sketch_all.png) — full exploration sheet, mixing filled-silhouette marks and thin-line stroke doodles
- [`sketches/Logo_1.svg`](sketches/Logo_1.svg) — finished vector logo (heavily hand-edited after Illustrator auto-trace), corresponds to `sketch_1.png`; confirms fill-based sketch → fill-based final logo
- [`references/figma_ui.png`](references/figma_ui.png) — Figma's dark UI panel, used as the visual/contrast/accent-color reference

## Open items — not yet decided

- Actual screen/layout structure — what's on screen at each step of the workflow
- Still to provide (from the earlier ask): 1–2 finished logos Nandia considers optically well-balanced, to use as a concrete reference for junction-trimming/weight-compensation tuning later
- Her comfort level with being hands-on in the build vs. purely art-directing/reviewing

---
*Nothing has been built yet. Per instruction, build work starts only when Nandia says "please create this app."*
