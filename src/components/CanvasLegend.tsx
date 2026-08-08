import { ChevronDown, ChevronUp, KeyRound } from "lucide-react";
import { useState } from "react";
import { severityColors } from "../engine/conduitVisuals";
import type { CanvasMode, Severity } from "../models/types";

export interface LegendFamily {
  id: string;
  label: string;
  color: string;
}

interface CanvasLegendProps {
  canvasMode: CanvasMode;
  families: LegendFamily[];
}

const severityRows: Array<{ key: Severity; label: string }> = [
  { key: "critical", label: "Critical" },
  { key: "high", label: "High" },
  { key: "medium", label: "Medium" },
  { key: "low", label: "Low / info" }
];

/**
 * Self-documenting key for the canvas. Collapsible, mode-aware: always explains the line styles
 * (firewall rule), the direction arrow, and the trust-boundary marker; adds protocol swatches in
 * clean/protocol mode and a severity key in risk mode. Reuses the protocol + severity colours so
 * the legend can never drift from what's drawn.
 */
export function CanvasLegend({ canvasMode, families }: CanvasLegendProps) {
  const [open, setOpen] = useState(false);
  const showProtocols = (canvasMode === "protocol" || canvasMode === "clean") && families.length > 0;
  const showSeverity = canvasMode === "risk";

  return (
    <aside className={`canvas-legend${open ? "" : " is-collapsed"}`} aria-label="Canvas legend">
      <button
        type="button"
        className="canvas-legend-head"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        title={open ? "Hide legend" : "Show legend"}
      >
        <KeyRound size={13} aria-hidden="true" />
        <span>Legend</span>
        {open ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronUp size={13} aria-hidden="true" />}
      </button>

      {open ? (
        <div className="canvas-legend-body">
          <div className="canvas-legend-group">
            <h4>Conduits</h4>
            <span className="legend-row">
              <i className="legend-line solid" aria-hidden="true" />
              Explicit rule
            </span>
            <span className="legend-row">
              <i className="legend-line dashed" aria-hidden="true" />
              Unknown rule
            </span>
            <span className="legend-row">
              <i className="legend-line dotted" aria-hidden="true" />
              Any-any / broad
            </span>
            <span className="legend-row">
              <i className="legend-arrow" aria-hidden="true">
                &rarr;
              </i>
              Comms direction
            </span>
            <span className="legend-row">
              <i className="legend-boundary" aria-hidden="true" />
              Trust boundary
            </span>
          </div>

          {showProtocols ? (
            <div className="canvas-legend-group">
              <h4>Protocols</h4>
              {families.map((family) => (
                <span className="legend-row" key={family.id} title={family.label}>
                  <i className="legend-swatch" style={{ background: family.color }} aria-hidden="true" />
                  {family.label}
                </span>
              ))}
            </div>
          ) : null}

          {showSeverity ? (
            <div className="canvas-legend-group">
              <h4>Severity</h4>
              {severityRows.map((row) => (
                <span className="legend-row" key={row.key}>
                  <i className="legend-swatch" style={{ background: severityColors[row.key] }} aria-hidden="true" />
                  {row.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
