interface TopBarProps {
  filename: string;
  onRequestImport: () => void;
  uiScale: number;
  onSetUiScale: (scale: number) => void;
}

const SCALE_STEPS = [0.85, 1, 1.2];

export function TopBar({ filename, onRequestImport, uiScale, onSetUiScale }: TopBarProps) {
  return (
    <div className="topbar">
      <div className="tb-group">
        <div className="tb-file">
          <span className="msi" style={{ fontSize: 15, color: "var(--text-faint)" }}>
            edit
          </span>
          {filename}
        </div>
      </div>
      <div className="tb-group">
        <button className="tb-item" onClick={onRequestImport}>
          <span className="msi" style={{ fontSize: 15, color: "var(--text-faint)" }}>
            download
          </span>
          Import
        </button>
        <div className="tb-item is-disabled" title="Coming in a later phase">
          <span className="msi" style={{ fontSize: 15, color: "var(--text-faint)" }}>
            save
          </span>
          Save Preset
        </div>
        <div className="tb-item is-disabled" title="Coming in a later phase">
          <span className="msi" style={{ fontSize: 15, color: "var(--text-faint)" }}>
            folder_open
          </span>
          Load Preset
        </div>
        <div className="tscale">
          {SCALE_STEPS.map((step) => (
            <button
              key={step}
              className={uiScale === step ? "active" : ""}
              onClick={() => onSetUiScale(step)}
              title="Adjust UI size"
            >
              T
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
