import { Check } from "lucide-react";
import { remediations } from "../../engine/remediations";

interface WhatIfTabProps {
  nowScore: number;
  simScore: number;
  simScoreDelta: number;
  currentHighRisk: number;
  simHighRisk: number;
  activeRemediations: ReadonlySet<string>;
  onToggleRemediation: (id: string) => void;
  onApply: () => void;
  onReset: () => void;
}

export function WhatIfTab({
  nowScore,
  simScore,
  simScoreDelta,
  currentHighRisk,
  simHighRisk,
  activeRemediations,
  onToggleRemediation,
  onApply,
  onReset
}: WhatIfTabProps) {
  return (
    <div className="analysis-content whatif-view">
      <div className="baseline-summary">
        <div className="baseline-score">
          <span>Now</span>
          <strong>{nowScore}</strong>
        </div>
        <div className="baseline-score">
          <span>Simulated</span>
          <strong>{simScore}</strong>
        </div>
        <div className={`baseline-delta ${simScoreDelta >= 0 ? "is-up" : "is-down"}`}>
          <span>Change</span>
          <strong>{simScoreDelta >= 0 ? `+${simScoreDelta}` : simScoreDelta}</strong>
        </div>
        <div className="baseline-score">
          <span>High / critical risk</span>
          <strong>
            {currentHighRisk} to {simHighRisk}
          </strong>
        </div>
        <div className="baseline-summary-actions">
          <button
            type="button"
            className="text-button primary"
            disabled={activeRemediations.size === 0}
            onClick={onApply}
            title="Commit the simulated remediations to the model"
          >
            Apply to model
          </button>
          <button type="button" className="text-button" disabled={activeRemediations.size === 0} onClick={onReset}>
            Reset
          </button>
        </div>
      </div>
      <ul className="whatif-list">
        {remediations.map((remediation) => {
          const on = activeRemediations.has(remediation.id);
          return (
            <li key={remediation.id}>
              <button
                type="button"
                className={`whatif-toggle${on ? " on" : ""}`}
                aria-pressed={on}
                onClick={() => onToggleRemediation(remediation.id)}
              >
                <span className="whatif-check">{on ? <Check size={14} aria-hidden="true" /> : null}</span>
                <span className="whatif-text">
                  <strong>{remediation.label}</strong>
                  <small>{remediation.description}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
