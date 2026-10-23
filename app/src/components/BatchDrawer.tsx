import type { DetectedMark } from "../trace/detect";

export type GroupMode = "separate" | "together";

interface BatchDrawerProps {
  marks: DetectedMark[] | null;
  detecting: boolean;
  selectedIds: Set<number>;
  onSelect: (id: number, additive: boolean) => void;
  onSelectAll: () => void;
  onClear: () => void;
  groupMode: GroupMode;
  onSetGroupMode: (mode: GroupMode) => void;
  onTrace: () => void;
}

export function BatchDrawer({
  marks,
  detecting,
  selectedIds,
  onSelect,
  onSelectAll,
  onClear,
  groupMode,
  onSetGroupMode,
  onTrace,
}: BatchDrawerProps) {
  const count = selectedIds.size;
  const strayCount = marks?.filter((m) => m.stray).length ?? 0;

  return (
    <div className="batch-drawer">
      <div className="bd-head">
        <div className="bd-title">
          <span className="msi">layers</span>
          batch trace
          {marks ? (
            <span className="bd-count">
              {marks.length} marks found{strayCount ? `, ${strayCount} look like strays` : ""}
            </span>
          ) : null}
        </div>
        <div className="bd-tools">
          <button onClick={onSelectAll} disabled={!marks?.length}>
            select all
          </button>
          <button onClick={onClear} disabled={!count}>
            clear
          </button>
          {count > 1 ? (
            <div className="fs-toggle bd-mode" title="Trace the selected marks as one piece, or as separate files">
              <button className={groupMode === "together" ? "active" : ""} onClick={() => onSetGroupMode("together")}>
                Together
              </button>
              <button className={groupMode === "separate" ? "active" : ""} onClick={() => onSetGroupMode("separate")}>
                Separate
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <p className="bd-help">
        select multiple sketches to batch trace with the same preset. <code>[Shift+click]</code> to select multiple
        sketches.
      </p>

      <div className="bd-row">
        <div className="bd-thumbs">
          {detecting || !marks ? (
            <div className="bd-empty">finding marks on the sheet…</div>
          ) : marks.length === 0 ? (
            <div className="bd-empty">no marks found on this image</div>
          ) : (
            marks.map((m) => {
              const selected = selectedIds.has(m.id);
              return (
                <button
                  key={m.id}
                  className={`bd-thumb${selected ? " selected" : ""}${m.stray ? " stray" : ""}`}
                  onClick={(e) => onSelect(m.id, e.shiftKey || e.metaKey || e.ctrlKey)}
                  title={m.stray ? "Looks like a stray mark" : `Mark ${m.id + 1}`}
                >
                  <img src={m.thumbUrl} alt={`Mark ${m.id + 1}`} />
                  {selected ? (
                    <span className="bd-check">
                      <span className="msi">check</span>
                    </span>
                  ) : null}
                  {m.stray ? <span className="bd-stray">stray?</span> : null}
                </button>
              );
            })
          )}
        </div>
        <button className="bd-trace" onClick={onTrace} disabled={!count}>
          <span className="msi">polyline</span>
          {count > 1 && groupMode === "together" ? "trace as one" : count > 1 ? `trace ${count}` : "trace"}
        </button>
      </div>
    </div>
  );
}
