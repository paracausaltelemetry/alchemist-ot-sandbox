import { X } from "lucide-react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useEffect, useState, useRef } from "react";
import type { EngagementContext } from "../models/types";

interface GovernanceEditorProps {
  open: boolean;
  engagement?: EngagementContext;
  onClose: () => void;
  onSave: (engagement: EngagementContext) => void;
}

const EMPTY: EngagementContext = {
  organisation: "",
  sector: "",
  regime: "NIS Regulations 2018 / NCSC CAF",
  assessor: "",
  assessmentDate: "",
  scope: "",
  limitations: ""
};

/**
 * Captures the governance / engagement context that frames a consultancy assessment — the
 * organisation, regulatory regime, assessor, scope and limitations that drive the report header
 * and the "G" of GRC. Reuses the shared modal-overlay styling; commits once on save.
 */
export function GovernanceEditor({ open, engagement, onClose, onSave }: GovernanceEditorProps) {
  // Declared before anything else in the component so it sits ahead of every early return.
  const focusTrapRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(open, focusTrapRef);

  const [draft, setDraft] = useState<EngagementContext>(engagement ?? EMPTY);

  useEffect(() => {
    if (open) {
      setDraft(engagement ?? EMPTY);
    }
  }, [open, engagement]);

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

  const set = (patch: Partial<EngagementContext>) => setDraft((current) => ({ ...current, ...patch }));

  const save = () => {
    onSave(draft);
    onClose();
  };

  return (
    <div className="modal-overlay" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        className="governance-editor"
        ref={focusTrapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Engagement context"
      >
        <div className="governance-editor-head">
          <div>
            <strong>Engagement context</strong>
            <p>Governance and scope for this assessment, used in the report header and CAF compliance view.</p>
          </div>
          <button type="button" className="rail-collapse" onClick={onClose} title="Close" aria-label="Close engagement editor">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="governance-grid">
          <label className="field">
            <span>Organisation</span>
            <input value={draft.organisation} onChange={(event) => set({ organisation: event.target.value })} />
          </label>
          <label className="field">
            <span>Sector</span>
            <input value={draft.sector} placeholder="Water, Energy, Transport…" onChange={(event) => set({ sector: event.target.value })} />
          </label>
          <label className="field">
            <span>Regulatory regime</span>
            <input value={draft.regime} onChange={(event) => set({ regime: event.target.value })} />
          </label>
          <label className="field">
            <span>Assessor</span>
            <input value={draft.assessor} onChange={(event) => set({ assessor: event.target.value })} />
          </label>
          <label className="field">
            <span>Assessment date</span>
            <input type="date" value={draft.assessmentDate} onChange={(event) => set({ assessmentDate: event.target.value })} />
          </label>
        </div>

        <label className="field">
          <span>Scope</span>
          <textarea value={draft.scope} placeholder="Systems, sites and boundaries assessed" onChange={(event) => set({ scope: event.target.value })} />
        </label>
        <label className="field">
          <span>Limitations</span>
          <textarea
            value={draft.limitations}
            placeholder="What this assessment did not cover"
            onChange={(event) => set({ limitations: event.target.value })}
          />
        </label>

        <div className="governance-actions">
          <button type="button" className="text-button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="text-button primary" onClick={save}>
            Save context
          </button>
        </div>
      </div>
    </div>
  );
}
