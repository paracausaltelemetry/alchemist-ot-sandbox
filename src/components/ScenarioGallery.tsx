import { X } from "lucide-react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useEffect, useRef } from "react";
import type { ScenarioMeta } from "../data/scenarios";
import type { OtProject } from "../models/types";

interface ScenarioGalleryProps {
  open: boolean;
  scenarios: ScenarioMeta[];
  onClose: () => void;
  onLoad: (project: OtProject) => void;
}

/**
 * Browse-and-load gallery for the bundled sector scenarios. Each card summarises a realistic
 * OT network (assets, conduits, subnets, standards) the user can load to explore or assess.
 * Reuses the shared modal-overlay styling.
 */
export function ScenarioGallery({ open, scenarios, onClose, onLoad }: ScenarioGalleryProps) {
  // Declared before anything else in the component so it sits ahead of every early return.
  const focusTrapRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(open, focusTrapRef);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        className="scenario-gallery"
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Sector scenarios"
      >
        <div className="scenario-gallery-head">
          <div>
            <strong>Sector scenarios</strong>
            <p>Load a realistic OT network to explore the canvas, the assessment, and the report.</p>
          </div>
          <button type="button" className="rail-collapse" onClick={onClose} title="Close" aria-label="Close scenario gallery">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="scenario-grid">
          {scenarios.map((scenario) => (
            <article className="scenario-card" key={scenario.id}>
              <span className="scenario-sector">{scenario.sector}</span>
              <strong>{scenario.name}</strong>
              <p>{scenario.summary}</p>
              <div className="scenario-standards">
                {scenario.standards.map((standard) => (
                  <span key={standard}>{standard}</span>
                ))}
              </div>
              <div className="scenario-card-foot">
                <span className="scenario-counts">
                  {scenario.project.assets.length} assets · {scenario.project.conduits.length} conduits ·{" "}
                  {scenario.project.subnets?.length ?? 0} subnets
                </span>
                <button
                  type="button"
                  className="text-button primary"
                  onClick={() => {
                    onLoad(scenario.project);
                    onClose();
                  }}
                >
                  Load
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
