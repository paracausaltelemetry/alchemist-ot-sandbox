import { X } from "lucide-react";
import { useEffect } from "react";
import { MIN_RATEABLE_ASSETS, categoryWeights, scoreBands, severityDeduction } from "../engine/scoring";
import { MAX_SL, foundationalRequirements } from "../engine/securityLevels";
import { RISK_SCALE } from "../engine/risk";
import { categoryLabels } from "../data/catalog";
import { cafObjectives } from "../data/caf";
import { ATTACK_ICS_REVIEWED, ATTACK_ICS_VERSION, icsTactics } from "../data/attackIcs";
import type { ScoreCategory, Severity } from "../models/types";

interface MethodologyPanelProps {
  open: boolean;
  onClose: () => void;
}

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low"];
const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low"
};

/**
 * Explains how the advisory rating and framework views are derived, driven from the live engine
 * constants so the numbers can never drift from the assessment. A single-column modal that reuses
 * the knowledge-base article + table styling.
 */
export function MethodologyPanel({ open, onClose }: MethodologyPanelProps) {
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

  const weightRows = (Object.keys(categoryWeights) as ScoreCategory[]).sort(
    (a, b) => categoryWeights[b] - categoryWeights[a]
  );

  return (
    <div className="modal-overlay" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        className="knowledge-base methodology"
        role="dialog"
        aria-modal="true"
        aria-label="Methodology"
      >
        <div className="kb-head">
          <div>
            <strong>How Alchemist assesses</strong>
            <p>
              An advisory, browser-local method. This reviews the architecture you declare in the model; it is
              not a certification or a formal ISA/IEC 62443 or NCSC CAF assessment.
            </p>
          </div>
          <button type="button" className="rail-collapse" onClick={onClose} title="Close" aria-label="Close methodology">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="kb-body">
          <article className="kb-article">
            <section>
              <h4>The advisory rating (0 to 100)</h4>
              <ul>
                <li>The headline score is a weighted average of eight category scores.</li>
                <li>
                  Each category starts at 100, and every finding removes a share of the credit that remains —
                  so more findings always cost more, but a category is never zeroed outright and fixing any one
                  finding always moves the number.
                </li>
                <li>
                  Findings come from rules over the declared assets, conduits, zones and controls, plus the
                  Security Level gaps below.
                </li>
              </ul>
            </section>

            <section>
              <h4>Category weights</h4>
              <div className="kb-table-wrap">
                <table className="kb-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weightRows.map((category) => (
                      <tr key={category}>
                        <td>{categoryLabels[category]}</td>
                        <td>{Math.round(categoryWeights[category] * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h4>Severity weighting</h4>
              <div className="kb-table-wrap">
                <table className="kb-table">
                  <thead>
                    <tr>
                      <th>Severity</th>
                      <th>Credit removed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SEVERITY_ORDER.map((severity) => (
                      <tr key={severity}>
                        <td>{SEVERITY_LABEL[severity]}</td>
                        <td>{severityDeduction[severity]}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h4>Score bands</h4>
              <div className="kb-table-wrap">
                <table className="kb-table">
                  <thead>
                    <tr>
                      <th>Band</th>
                      <th>Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scoreBands.map((entry, index) => {
                      const upper = index === 0 ? 100 : scoreBands[index - 1].min - 1;
                      return (
                        <tr key={entry.band}>
                          <td>{entry.label}</td>
                          <td>
                            {entry.min} to {upper}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p>
                A model with fewer than {MIN_RATEABLE_ASSETS} assets or no conduits is reported as{" "}
                <strong>not enough model to rate</strong> rather than being given a number. Alchemist rates an
                architecture: with no conduits there is nothing to say about segmentation, and every control check
                passes for want of anything to check. Absence of evidence is not evidence of control.
              </p>
            </section>

            <section>
              <h4>IEC 62443 architecture signals</h4>
              <ul>
                <li>
                  Each zone carries a target (SL-T) from the risk assessment. Alchemist models an indicative
                  architecture signal up to level {MAX_SL} against the seven Foundational Requirements.
                </li>
                <li>The signal is capped by the weakest modeled FR and names the limiting requirement.</li>
                <li>
                  A zone you have declared no assets in is reported as <strong>not modelled</strong>, not as satisfied.
                  Each requirement is checked across the assets in a zone, so an empty zone would otherwise pass every
                  one of them for want of anything to fail.
                </li>
                <li>
                  It is not a formal SL-A. Confirm applicable 62443-3-3 requirements, enhancements, evidence and
                  compensating controls before claiming an achieved Security Level.
                </li>
              </ul>
              <div className="kb-table-wrap">
                <table className="kb-table">
                  <thead>
                    <tr>
                      <th>FR</th>
                      <th>Focus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {foundationalRequirements.map((fr) => (
                      <tr key={fr.id}>
                        <td>{fr.id}</td>
                        <td>{fr.label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h4>NCSC CAF evidence signal</h4>
              <ul>
                <li>Architecture-derived signals are mapped across the four objectives and fourteen principles.</li>
                <li>
                  Governance and people outcomes cannot be evidenced from a topology, so they are marked Not
                  Assessed for an assessor to attest.
                </li>
                <li>The percentage is not organisational readiness; CAF outcomes require contextual evidence and expert judgement.</li>
              </ul>
              <div className="kb-table-wrap">
                <table className="kb-table">
                  <thead>
                    <tr>
                      <th>Objective</th>
                      <th>Focus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cafObjectives.map((objective) => (
                      <tr key={objective.id}>
                        <td>{objective.id}</td>
                        <td>{objective.title}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h4>MITRE ATT&amp;CK for ICS exposure</h4>
              <ul>
                <li>
                  Each finding maps to the ICS techniques its weakness plausibly enables, giving a
                  threat-informed exposure view rather than a coverage claim.
                </li>
                <li>
                  The current curated mapping covers these tactics: {icsTactics.map((tactic) => tactic.name).join(" · ")}.
                </li>
                <li>Mapping version: ATT&amp;CK for ICS v{ATTACK_ICS_VERSION}, reviewed {ATTACK_ICS_REVIEWED}.</li>
              </ul>
            </section>

            <section>
              <h4>Risk = likelihood × consequence</h4>
              <ul>
                <li>Consequence is derived from each asset's class, criticality and safety role.</li>
                <li>
                  Likelihood is <strong>1 + exposure + weakness</strong>, capped at {RISK_SCALE}. Exposure is 2 when an
                  asset can be reached from an enterprise, business, vendor-remote or cloud starting point without
                  crossing a firewall, jump host or data diode; 1 when every route crosses one; 0 when no route
                  exists. Weakness adds a point for an access gap (default credentials not confirmed disabled, or a
                  host without MFA) and a point for an obsolete platform.
                </li>
                <li>
                  Each row on the heat-map names the reason for its own likelihood, so the axis can be checked
                  rather than taken on trust.
                </li>
                <li>
                  The product places each asset on a heat-map and into a treatment register, the consequence-led
                  view that distinguishes OT risk from IT risk.
                </li>
              </ul>
            </section>

            <section>
              <h4>What this is not</h4>
              <ul>
                <li>It assesses only what you declare; it never scans or connects to any live system.</li>
                <li>It is advisory and educational, not a certification, audit or substitute for a formal assessment.</li>
                <li>Everything runs in your browser; no project data leaves your machine.</li>
              </ul>
            </section>
          </article>
        </div>
      </div>
    </div>
  );
}
