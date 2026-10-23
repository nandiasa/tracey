import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import "./styles/tokens.css";
import { TopBar } from "./components/TopBar";
import { Sidebar } from "./components/Sidebar";
import { Canvas } from "./components/Canvas";
import { SettingsPanel } from "./components/SettingsPanel";
import { BatchDrawer, type GroupMode } from "./components/BatchDrawer";
import { fileToImageData, traceImageData } from "./trace/engine";
import { composeMarks, detectMarks, type DetectedMark } from "./trace/detect";
import { downloadSvg, downloadZip, traceBatch, type BatchResult, type BatchSource } from "./trace/batch";
import { TYPE_CONFIGS, type ArtworkType } from "./trace/presets";
import { DEFAULT_VIEW, ZOOM_STEP, zoomAround, type View } from "./view";

interface SketchState {
  imageData: ImageData;
  dataUrl: string;
}

export default function App() {
  const [filename, setFilename] = useState("no sketch imported");
  const [sketch, setSketch] = useState<SketchState | null>(null);
  const [activeType, setActiveType] = useState<ArtworkType>("symbol");
  const [fidelity, setFidelity] = useState(TYPE_CONFIGS.symbol.defaultFidelity);
  const [cornerSensitivity, setCornerSensitivity] = useState(TYPE_CONFIGS.symbol.defaultCornerSensitivity);
  const [tracedSvg, setTracedSvg] = useState<string | null>(null);
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [gridVisible, setGridVisible] = useState(true);
  const [settingsHidden, setSettingsHidden] = useState(false);
  const [uiScale, setUiScale] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [batchActive, setBatchActive] = useState(false);
  const [marks, setMarks] = useState<DetectedMark[] | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [groupMode, setGroupMode] = useState<GroupMode>("separate");
  const [batchSources, setBatchSources] = useState<BatchSource[] | null>(null);

  const config = TYPE_CONFIGS[activeType];
  const baseName = filename.replace(/\.[^.]+$/, "") || "trace";

  function handleImport(file: File) {
    fileToImageData(file)
      .then(({ imageData, dataUrl }) => {
        setSketch({ imageData, dataUrl });
        setFilename(file.name);
        setMarks(null);
        setSelectedIds(new Set());
        setBatchSources(null);
        setView(DEFAULT_VIEW);
      })
      .catch((err) => {
        console.error(err);
        window.alert("Couldn't read that image. Try a PNG or JPG.");
      });
  }

  function requestImport() {
    fileInputRef.current?.click();
  }

  function handleFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleImport(file);
    e.target.value = "";
  }

  function handleSetActiveType(type: ArtworkType) {
    setActiveType(type);
    setFidelity(TYPE_CONFIGS[type].defaultFidelity);
    setCornerSensitivity(TYPE_CONFIGS[type].defaultCornerSensitivity);
  }

  // Re-trace the whole sketch whenever it or the live params change (not while picking batch marks).
  useEffect(() => {
    if (!sketch || batchActive) {
      setTracedSvg(null);
      return;
    }
    try {
      setTracedSvg(traceImageData(sketch.imageData, { fidelity, cornerSensitivity }));
    } catch (err) {
      console.error("Trace failed", err);
      setTracedSvg(null);
    }
  }, [sketch, batchActive, fidelity, cornerSensitivity]);

  // Find the separate marks whenever batch trace is opened on a sketch.
  useEffect(() => {
    if (!batchActive || !sketch) return;
    let cancelled = false;
    setDetecting(true);
    const t = setTimeout(() => {
      try {
        const found = detectMarks(sketch.imageData);
        if (!cancelled) {
          setMarks(found);
          setSelectedIds(new Set());
        }
      } catch (err) {
        console.error("Detection failed", err);
        if (!cancelled) setMarks([]);
      } finally {
        if (!cancelled) setDetecting(false);
      }
    }, 30);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [batchActive, sketch]);

  // Cmd/Ctrl + / - zoom the artboard, Cmd/Ctrl 0 resets the view.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        setView((v) => zoomAround(v, ZOOM_STEP));
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        setView((v) => zoomAround(v, 1 / ZOOM_STEP));
      } else if (e.key === "0") {
        e.preventDefault();
        setView(DEFAULT_VIEW);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function handleToggleBatch() {
    setBatchActive((on) => !on);
    setBatchSources(null);
  }

  function handleSelectMark(id: number, additive: boolean) {
    setSelectedIds((prev) => {
      if (additive) {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }
      return prev.size === 1 && prev.has(id) ? new Set() : new Set([id]);
    });
  }

  function handleTraceBatch() {
    if (!marks) return;
    const chosen = marks.filter((m) => selectedIds.has(m.id));
    if (chosen.length === 0) return;
    const pad = (n: number) => String(n).padStart(2, "0");
    const sources: BatchSource[] =
      groupMode === "together" && chosen.length > 1
        ? [{ key: "group", name: `${baseName}_group`, imageData: composeMarks(chosen) }]
        : chosen.map((m) => ({ key: String(m.id), name: `${baseName}_${pad(m.id + 1)}`, imageData: m.imageData }));
    setBatchSources(sources);
  }

  // Traced batch results follow the sliders live, like the single-sketch preview.
  const batchResults = useMemo<BatchResult[] | null>(() => {
    if (!batchSources) return null;
    try {
      return traceBatch(batchSources, { fidelity, cornerSensitivity });
    } catch (err) {
      console.error("Batch trace failed", err);
      return null;
    }
  }, [batchSources, fidelity, cornerSensitivity]);

  function handleExport() {
    if (batchActive) {
      if (batchResults?.length) downloadZip(`${baseName}_traced`, batchResults);
      return;
    }
    if (tracedSvg) downloadSvg(baseName, tracedSvg);
  }

  const scaledStyle = useMemo(
    () => ({
      transform: `scale(${uiScale})`,
      transformOrigin: "top left" as const,
      width: `${100 / uiScale}%`,
      height: `${100 / uiScale}vh`,
    }),
    [uiScale]
  );

  return (
    <div style={scaledStyle}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg"
        style={{ display: "none" }}
        onChange={handleFileInputChange}
      />
      <div className={`app-shell${batchActive ? " with-drawer" : ""}`}>
        <TopBar filename={filename} onRequestImport={requestImport} uiScale={uiScale} onSetUiScale={setUiScale} />
        <div className={`body-row${settingsHidden ? " settings-hidden" : ""}`}>
          <Sidebar
            activeType={activeType}
            onSetActiveType={handleSetActiveType}
            gridVisible={gridVisible}
            onToggleGrid={() => setGridVisible((v) => !v)}
            batchActive={batchActive}
            canBatch={!!sketch}
            onToggleBatch={handleToggleBatch}
          />
          <Canvas
            gridVisible={gridVisible}
            sketch={sketch ? { dataUrl: sketch.dataUrl, width: sketch.imageData.width, height: sketch.imageData.height } : null}
            tracedSvg={tracedSvg}
            view={view}
            onViewChange={setView}
            onRequestImport={requestImport}
            onImportFile={handleImport}
            batch={batchActive && !batchResults ? { marks, selectedIds, onSelect: handleSelectMark } : null}
            results={
              batchActive && batchResults
                ? {
                    items: batchResults,
                    onBack: () => setBatchSources(null),
                    onExportAll: () => downloadZip(`${baseName}_traced`, batchResults),
                    onExportOne: (r) => downloadSvg(r.name, r.svg),
                  }
                : null
            }
          />
          <SettingsPanel
            config={config}
            fillStroke="fill"
            onSetFillStroke={() => {}}
            fidelity={fidelity}
            onSetFidelity={setFidelity}
            cornerSensitivity={cornerSensitivity}
            onSetCornerSensitivity={setCornerSensitivity}
            hidden={settingsHidden}
            onToggleHidden={() => setSettingsHidden((v) => !v)}
            onExport={handleExport}
            canExport={batchActive ? !!batchResults?.length : !!tracedSvg}
            exportLabel={batchActive ? "Export all (.zip)" : "Export SVG"}
          />
        </div>
        {batchActive ? (
          <BatchDrawer
            marks={marks}
            detecting={detecting}
            selectedIds={selectedIds}
            onSelect={handleSelectMark}
            onSelectAll={() => setSelectedIds(new Set((marks ?? []).filter((m) => !m.stray).map((m) => m.id)))}
            onClear={() => setSelectedIds(new Set())}
            groupMode={groupMode}
            onSetGroupMode={setGroupMode}
            onTrace={handleTraceBatch}
          />
        ) : null}
      </div>
    </div>
  );
}
