import type { TypeConfig } from "../trace/presets";

interface SettingsPanelProps {
  config: TypeConfig;
  fillStroke: "fill" | "stroke";
  onSetFillStroke: (mode: "fill" | "stroke") => void;
  fidelity: number;
  onSetFidelity: (value: number) => void;
  cornerSensitivity: number;
  onSetCornerSensitivity: (value: number) => void;
  hidden: boolean;
  onToggleHidden: () => void;
  onExport: () => void;
  canExport: boolean;
  exportLabel?: string;
}

function Slider({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange?: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="ctrl">
      <div className="ctrl-label-row">
        <span className="ctrl-label">{label}</span>
        <span className="ctrl-value">{value}</span>
      </div>
      <div className={`ctrl-track${disabled ? " is-disabled" : ""}`}>
        <div className="thumb" style={{ left: `${value}%` }} />
        {!disabled && onChange ? (
          <input
            type="range"
            min={0}
            max={100}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
          />
        ) : null}
      </div>
    </div>
  );
}

export function SettingsPanel({
  config,
  fillStroke,
  onSetFillStroke,
  fidelity,
  onSetFidelity,
  cornerSensitivity,
  onSetCornerSensitivity,
  hidden,
  onToggleHidden,
  onExport,
  canExport,
  exportLabel = "Export SVG",
}: SettingsPanelProps) {
  if (hidden) {
    return (
      <div className="panel" style={{ padding: 10 }}>
        <button className="panel-hide" onClick={onToggleHidden} title="Show settings">
          <span className="msi">push_pin</span>
        </button>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-top">
        <button className="panel-hide" onClick={onToggleHidden}>
          <span className="msi">push_pin</span>
          Hide Settings
        </button>
      </div>

      <div className="panel-header">
        <span className="glyph msi">{config.glyph}</span>
        {config.panelTitle}
      </div>

      <div className="fs-row">
        <span className="fs-label">Trace as</span>
        <div className="fs-toggle">
          <button className={fillStroke === "fill" ? "active" : ""} onClick={() => onSetFillStroke("fill")}>
            Fill
          </button>
          <button
            className={fillStroke === "stroke" ? "active" : ""}
            disabled
            title="Stroke tracing is coming in a later phase"
            onClick={() => onSetFillStroke("stroke")}
          >
            Stroke
          </button>
        </div>
      </div>

      <Slider label="Fidelity" value={fidelity} onChange={onSetFidelity} />
      <Slider label="Corner sensitivity" value={cornerSensitivity} onChange={onSetCornerSensitivity} />
      <Slider label="Optical correction" value={0} disabled />

      {config.uniqueControls.map((c) => (
        <Slider key={c.label} label={c.label} value={c.value} disabled />
      ))}

      <div className="panel-actions">
        <span className="act is-disabled" title="Coming in a later phase">
          <span className="msi">undo</span>
          undo
        </span>
        <span className="act is-disabled" title="Coming in a later phase">
          <span className="msi">redo</span>
          redo
        </span>
        <button className="act" onClick={() => { onSetFidelity(config.defaultFidelity); onSetCornerSensitivity(config.defaultCornerSensitivity); }}>
          <span className="msi">restart_alt</span>
          reset
        </button>
      </div>

      <button
        className="tb-item"
        style={{ marginTop: 18, opacity: canExport ? 1 : 0.4, cursor: canExport ? "pointer" : "not-allowed" }}
        onClick={onExport}
        disabled={!canExport}
      >
        <span className="msi" style={{ fontSize: 15 }}>
          download
        </span>
        {exportLabel}
      </button>

      <div className="panel-note">{config.note}</div>
    </div>
  );
}
