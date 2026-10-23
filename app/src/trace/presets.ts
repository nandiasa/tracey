export type ArtworkType = "symbol" | "lettering" | "illustration";

export interface TypeConfig {
  key: ArtworkType;
  label: string;
  /** Material Symbols Outlined ligature name. */
  glyph: string;
  panelTitle: string;
  defaultFidelity: number;
  defaultCornerSensitivity: number;
  /** Controls unique to this type - all disabled in Phase 1, since they depend on stroke-mode tracing. */
  uniqueControls: { label: string; value: number }[];
  note: string;
}

export const TYPE_ORDER: ArtworkType[] = ["symbol", "lettering", "illustration"];

export const TYPE_CONFIGS: Record<ArtworkType, TypeConfig> = {
  symbol: {
    key: "symbol",
    label: "symbol",
    glyph: "copyright",
    panelTitle: "symbol tracing",
    defaultFidelity: 24,
    defaultCornerSensitivity: 0,
    uniqueControls: [],
    note: "Geometric snapping + corner squaring, tuned for a single mark or icon rather than a full word.",
  },
  lettering: {
    key: "lettering",
    label: "lettering",
    glyph: "format_italic",
    panelTitle: "lettering tracing",
    defaultFidelity: 45,
    defaultCornerSensitivity: 35,
    uniqueControls: [
      { label: "Stroke contrast", value: 38 },
      { label: "Joint trimming", value: 62 },
      { label: "Baseline snap", value: 80 },
    ],
    note: "Stroke contrast, joint trimming and baseline snap all need stroke-mode tracing, so they're shown but not active yet.",
  },
  illustration: {
    key: "illustration",
    label: "illustration",
    glyph: "gesture",
    panelTitle: "illustration tracing",
    defaultFidelity: 88,
    defaultCornerSensitivity: 10,
    uniqueControls: [
      { label: "Line weight variation", value: 70 },
      { label: "Detail preservation", value: 30 },
    ],
    note: "No optical correction here on purpose - illustration keeps the sketch's own hand rather than being pulled toward type-style balance.",
  },
};
