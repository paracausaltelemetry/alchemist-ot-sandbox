import { Building2 } from "lucide-react";
import { cafObjectives, cafPrinciplesForObjective } from "../../data/caf";
import type { CafAssessment } from "../../engine/caf";
import type { CafPrincipleId, CafStatus, Finding } from "../../models/types";

const CAF_STATUS_LABEL: Record<CafStatus, string> = {
  achieved: "Achieved",
  partial: "Partially",
  "not-achieved": "Not Achieved",
  "not-assessed": "Not Assessed"
};

interface ComplianceTabProps {
  caf: CafAssessment;
  findingById: Map<string, Finding>;
  onFindingSelect: (finding: Finding) => void;
  onCafOverrideChange: (principle: CafPrincipleId, status: CafStatus | null) => void;
  onEditGovernance: () => void;
}

export function ComplianceTab({ caf, findingById, onFindingSelect, onCafOverrideChange, onEditGovernance }: ComplianceTabProps) {
  return (
    <div className="analysis-content caf-view">
      <div className="caf-head">
        <div className="caf-posture">
          <strong>{caf.postureScore}%</strong>
          <span>CAF evidence signal · assessed principles</span>
        </div>
        <div className="caf-objective-summary">
          {caf.objectives.map((objective) => {
            const meta = cafObjectives.find((item) => item.id === objective.id);
            return (
              <div className="caf-objective-pill" key={objective.id} title={meta?.title}>
                <strong>{objective.id}</strong>
                <span>
                  {objective.achieved}A · {objective.partial}P · {objective.notAchieved}N
                  {objective.notAssessed > 0 ? ` · ${objective.notAssessed}?` : ""}
                </span>
              </div>
            );
          })}
        </div>
        <button type="button" className="text-button compact" onClick={onEditGovernance}>
          <Building2 size={14} aria-hidden="true" />
          Engagement context
        </button>
      </div>

      <p className="assessment-caveat">
        Architecture-derived indicator only. CAF outcomes require contextual evidence and expert judgement; this
        percentage is not organisational readiness or a formal CAF result.
      </p>

      {cafObjectives.map((objective) => (
        <div className="caf-objective-group" key={objective.id}>
          <h3>
            {objective.id} · {objective.title}
          </h3>
          <div className="caf-principles">
            {cafPrinciplesForObjective(objective.id).map((principle) => {
              const result = caf.principles.find((item) => item.id === principle.id);
              if (!result) {
                return null;
              }
              return (
                <details className="caf-principle" key={principle.id}>
                  <summary>
                    <span className="caf-code">{principle.id}</span>
                    <span className="caf-title">{principle.title}</span>
                    <span className={`caf-status caf-status-${result.status}`}>{CAF_STATUS_LABEL[result.status]}</span>
                  </summary>
                  <div className="caf-principle-body">
                    <p className="caf-rationale">{result.rationale}</p>
                    {result.gap ? (
                      <p className="caf-gap">
                        <strong>Gap:</strong> {result.gap}
                      </p>
                    ) : null}
                    <p className="caf-guidance">{principle.otGuidance}</p>
                    {result.findingIds.length > 0 ? (
                      <div className="caf-findings">
                        {result.findingIds.map((findingId) => {
                          const finding = findingById.get(findingId);
                          return finding ? (
                            <button
                              type="button"
                              key={findingId}
                              className="caf-finding-link"
                              onClick={() => onFindingSelect(finding)}
                            >
                              {finding.title}
                            </button>
                          ) : null;
                        })}
                      </div>
                    ) : null}
                    <label className="caf-override field">
                      <span>Assessor status</span>
                      <select
                        value={result.overridden ? result.status : ""}
                        onChange={(event) =>
                          onCafOverrideChange(principle.id, (event.target.value || null) as CafStatus | null)
                        }
                      >
                        <option value="">Use derived ({CAF_STATUS_LABEL[result.derivedStatus]})</option>
                        {(Object.keys(CAF_STATUS_LABEL) as CafStatus[]).map((status) => (
                          <option key={status} value={status}>
                            {CAF_STATUS_LABEL[status]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <small className="caf-refs">{principle.references.join(" · ")}</small>
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
