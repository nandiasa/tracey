import { TYPE_CONFIGS, TYPE_ORDER, type ArtworkType } from "../trace/presets";

interface SidebarProps {
  activeType: ArtworkType;
  onSetActiveType: (type: ArtworkType) => void;
  gridVisible: boolean;
  onToggleGrid: () => void;
  batchActive: boolean;
  canBatch: boolean;
  onToggleBatch: () => void;
}

export function Sidebar({
  activeType,
  onSetActiveType,
  gridVisible,
  onToggleGrid,
  batchActive,
  canBatch,
  onToggleBatch,
}: SidebarProps) {
  return (
    <div className="sidebar">
      <div className="sb-title">trace settings</div>
      {TYPE_ORDER.map((key) => {
        const cfg = TYPE_CONFIGS[key];
        return (
          <button
            key={key}
            className={`sb-item${activeType === key ? " active" : ""}`}
            onClick={() => onSetActiveType(key)}
          >
            <span className="glyph msi">{cfg.glyph}</span>
            {cfg.label}
          </button>
        );
      })}

      <div className="sb-section">
        <div className="sb-section-title">
          grid
          <button className="grid-toggle-btn" onClick={onToggleGrid} title="Toggle grid visibility">
            <span className="msi" style={{ fontSize: 14 }}>
              {gridVisible ? "visibility" : "visibility_off"}
            </span>
          </button>
        </div>
        <div className="sb-check is-disabled" title="Coming in a later phase">
          <span className="msi">check_box</span>
          snap to grid
        </div>
        <div className="sb-check is-disabled" title="Coming in a later phase">
          <span className="msi">check_box</span>
          aligning guides
        </div>
      </div>

      <button
        className={`sb-batch${batchActive ? " active" : ""}`}
        onClick={onToggleBatch}
        disabled={!canBatch}
        title={canBatch ? "Trace several marks from a sheet at once" : "Import a sketch first"}
      >
        <span className="msi" style={{ fontSize: 15 }}>
          layers
        </span>
        batch trace
      </button>
    </div>
  );
}
