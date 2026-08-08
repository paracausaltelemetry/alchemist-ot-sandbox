import type { Finding, SecurityAssessment, Severity } from "../../models/types";
import { groupFindings } from "../../lib/findingGroups";

interface FindingsTabProps {
  assessment: SecurityAssessment;
  visibleFindings: Finding[];
  hiddenFindingCount: number;
  severityOn: Record<Severity, boolean>;
  onToggleSeverity: (severity: Severity) => void;
  includeDocs: boolean;
  onIncludeDocsChange: (include: boolean) => void;
  activeFindingId: string | null;
  onFindingSelect: (finding: Finding) => void;
}

export function FindingsTab({
  assessment,
  visibleFindings,
  hiddenFindingCount,
  severityOn,
  onToggleSeverity,
  includeDocs,
  onIncludeDocsChange,
  activeFindingId,
  onFindingSelect
}: FindingsTabProps) {
  const groupedFindings = groupFindings(visibleFindings);

  return (
    <div className="analysis-content findings-list">
      <div className="findings-filters">
        {(["critical", "high", "medium", "low"] as Severity[]).map((sev) => (
          <button
            key={sev}
            type="button"
            className={`sev-chip sev-${sev}${severityOn[sev] ? " is-on" : ""}`}
            aria-pressed={severityOn[sev]}
            onClick={() => onToggleSeverity(sev)}
          >
            {sev}
          </button>
        ))}
        <label className="docs-toggle">
          <input type="checkbox" checked={includeDocs} onChange={(event) => onIncludeDocsChange(event.target.checked)} />
          Documentation gaps
        </label>
      </div>
      {groupedFindings.length > 0 ? (
        groupedFindings.map((group) => {
          const finding = group.representative;
          const isActive = group.findings.some((item) => item.id === activeFindingId);
          return (
          <article
            className={`finding severity-${finding.severity} ${isActive ? "active" : ""}`}
            key={group.key}
          >
            <div>
              <span>{finding.severity}</span>
              <strong>{finding.title}</strong>
              {group.findings.length > 1 ? <b className="finding-count">{group.findings.length} affected</b> : null}
            </div>
            <small>{finding.remediation}</small>
            {group.findings.length === 1 ? (
              <>
                <p>{finding.detail}</p>
                <button type="button" className="text-button" onClick={() => onFindingSelect(finding)}>
                  Show affected path
                </button>
              </>
            ) : (
              <details className="finding-occurrences">
                <summary>
                  Review {group.findings.length} occurrences · {group.affectedAssetIds.length} assets ·{" "}
                  {group.affectedConduitIds.length} conduits
                </summary>
                <div className="finding-occurrence-list">
                  {group.findings.map((occurrence, index) => (
                    <div className="finding-occurrence" key={occurrence.id}>
                      <p>
                        <strong>Occurrence {index + 1}</strong>
                        {occurrence.detail}
                      </p>
                      <button type="button" className="text-button compact" onClick={() => onFindingSelect(occurrence)}>
                        Show affected path
                      </button>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </article>
          );
        })
      ) : (
        <p className="muted">
          {assessment.findings.length === 0
            ? "No findings detected in the declared model."
            : "No findings match the current filters."}
        </p>
      )}
      {hiddenFindingCount > 0 && visibleFindings.length > 0 ? (
        <p className="findings-hidden-note">
          {hiddenFindingCount} finding{hiddenFindingCount === 1 ? "" : "s"} hidden by filters.
        </p>
      ) : null}
    </div>
  );
}
