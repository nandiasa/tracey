import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from "react";
import { DEFAULT_VIEW, ZOOM_STEP, zoomAround, type View } from "../view";
import type { DetectedMark } from "../trace/detect";
import type { BatchResult } from "../trace/batch";

interface CanvasProps {
  gridVisible: boolean;
  sketch: { dataUrl: string; width: number; height: number } | null;
  tracedSvg: string | null;
  view: View;
  onViewChange: (view: View) => void;
  onRequestImport: () => void;
  onImportFile: (file: File) => void;
  /** Present while batch trace is open and nothing has been traced yet. */
  batch: {
    marks: DetectedMark[] | null;
    selectedIds: Set<number>;
    onSelect: (id: number, additive: boolean) => void;
  } | null;
  /** Present once a batch has been traced. */
  results: {
    items: BatchResult[];
    onBack: () => void;
    onExportAll: () => void;
    onExportOne: (r: BatchResult) => void;
  } | null;
}

const FIT_MARGIN = 48;

export function Canvas({
  gridVisible,
  sketch,
  tracedSvg,
  view,
  onViewChange,
  onRequestImport,
  onImportFile,
  batch,
  results,
}: CanvasProps) {
  const [dragActive, setDragActive] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [panning, setPanning] = useState(false);
  const viewRef = useRef(view);
  viewRef.current = view;
  const canPanZoom = !results;

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const update = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Cmd/Ctrl + scroll (and trackpad pinch, which arrives the same way) zooms toward the cursor.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || !canPanZoom) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const s = rect.width / el.offsetWidth || 1;
      const px = (e.clientX - rect.left) / s - el.offsetWidth / 2;
      const py = (e.clientY - rect.top) / s - el.offsetHeight / 2;
      onViewChange(zoomAround(viewRef.current, Math.exp(-e.deltaY * 0.0025), px, py));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [canPanZoom, onViewChange]);

  // Right-button drag pans the artboard.
  function handleMouseDown(e: ReactMouseEvent<HTMLDivElement>) {
    if (e.button !== 2 || !canPanZoom) return;
    e.preventDefault();
    const el = rootRef.current;
    const s = el ? el.getBoundingClientRect().width / el.offsetWidth || 1 : 1;
    const startX = e.clientX;
    const startY = e.clientY;
    const start = viewRef.current;
    setPanning(true);
    const onMove = (ev: MouseEvent) => {
      onViewChange({ ...start, x: start.x + (ev.clientX - startX) / s, y: start.y + (ev.clientY - startY) / s });
    };
    const onUp = () => {
      setPanning(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (e.dataTransfer.types.includes("Files")) setDragActive(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    // Only clear when actually leaving the canvas, not just moving over a child element.
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setDragActive(false);
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.type === "image/png" || file.type === "image/jpeg")) {
      onImportFile(file);
    }
  }

  // Fit the sketch inside the canvas; small sketches stay at their natural size.
  let stageW = 0;
  let stageH = 0;
  if (sketch && box.w > 0 && box.h > 0) {
    const fit = Math.min(1, (box.w - FIT_MARGIN) / sketch.width, (box.h - FIT_MARGIN) / sketch.height);
    stageW = Math.max(1, sketch.width * fit);
    stageH = Math.max(1, sketch.height * fit);
  }

  return (
    <div
      ref={rootRef}
      className={`canvas${gridVisible ? " grid-on" : ""}${dragActive ? " drag-active" : ""}${panning ? " panning" : ""}`}
      onMouseDown={handleMouseDown}
      onContextMenu={(e) => e.preventDefault()}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {results ? (
        <>
          <div className="results-bar">
            <button onClick={results.onBack}>
              <span className="msi">arrow_back</span>
              back to sheet
            </button>
            <span className="results-count">{results.items.length} traced</span>
            <button onClick={results.onExportAll}>
              <span className="msi">folder_zip</span>
              export all (.zip)
            </button>
          </div>
          <div className="results-grid">
            {results.items.map((r) => (
              <div className="result-card" key={r.key}>
                <div className="result-svg" dangerouslySetInnerHTML={{ __html: r.svg }} />
                <div className="result-meta">
                  <span>{r.name}</span>
                  <button onClick={() => results.onExportOne(r)} title="Download this SVG">
                    <span className="msi">download</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="zoom">
            <button onClick={() => onViewChange(zoomAround(view, 1 / ZOOM_STEP))} title="Zoom out (Cmd/Ctrl -)">
              <span className="msi">zoom_out</span>
            </button>
            <button className="zoom-value" onClick={() => onViewChange(DEFAULT_VIEW)} title="Reset view (Cmd/Ctrl 0)">
              {Math.round(view.zoom * 100)}%
            </button>
            <button onClick={() => onViewChange(zoomAround(view, ZOOM_STEP))} title="Zoom in (Cmd/Ctrl +)">
              <span className="msi">zoom_in</span>
            </button>
          </div>

          {sketch ? (
            <div
              className="stage"
              style={{ width: stageW, height: stageH, transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
            >
              <img src={sketch.dataUrl} alt="Imported sketch" className={batch ? "full" : ""} />
              {!batch && tracedSvg ? <div className="trace-layer" dangerouslySetInnerHTML={{ __html: tracedSvg }} /> : null}
              {batch?.marks?.map((m) => (
                <button
                  key={m.id}
                  className={`mark-box${batch.selectedIds.has(m.id) ? " sel" : ""}${m.stray ? " stray" : ""}`}
                  style={{
                    left: `${(m.x / sketch.width) * 100}%`,
                    top: `${(m.y / sketch.height) * 100}%`,
                    width: `${(m.w / sketch.width) * 100}%`,
                    height: `${(m.h / sketch.height) * 100}%`,
                  }}
                  onClick={(e) => batch.onSelect(m.id, e.shiftKey || e.metaKey || e.ctrlKey)}
                  title={m.stray ? "Looks like a stray mark" : `Mark ${m.id + 1}`}
                />
              ))}
            </div>
          ) : (
            <button className="empty-canvas" onClick={onRequestImport}>
              <span className="msi">download</span>
              {dragActive ? "Drop to import" : "Import a PNG sketch to trace it"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
