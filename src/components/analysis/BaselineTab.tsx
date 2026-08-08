import type { BaselineDiff } from "../../engine/baselineDiff";

interface BaselineTabProps {
  baselineDiff: BaselineDiff | null;
  onCaptureBaseline: () => void;
  onClearBaseline: () => void;
}

export function BaselineTab({ baselineDiff, onCaptureBaseline, onClearBaseline }: BaselineTabProps) {
  return (
    <div className="analysis-content baseline-view">
      {baselineDiff ? (
        <>
          <div className="baseline-summary">
            <div className="baseline-score">
              <span>Baseline</span>
              <strong>{baselineDiff.baselineScore}</strong>
            </div>
            <div className="baseline-score">
              <span>Current</span>
              <strong>{baselineDiff.currentScore}</strong>
            </div>
            <div className={`baseline-delta ${baselineDiff.scoreDelta >= 0 ? "is-up" : "is-down"}`}>
              <span>Change</span>
              <strong>{baselineDiff.scoreDelta >= 0 ? `+${baselineDiff.scoreDelta}` : baselineDiff.scoreDelta}</strong>
            </div>
            <div className="baseline-score">
              <span>High / critical risk</span>
              <strong>
                {baselineDiff.baselineHighRisk} to {baselineDiff.currentHighRisk}
              </strong>
            </div>
            <div className="baseline-summary-actions">
              <button type="button" className="text-button" onClick={onCaptureBaseline} title="Snapshot the current model as the new baseline">
                Update baseline
              </button>
              <button type="button" className="text-button" onClick={onClearBaseline}>
                Clear
              </button>
            </div>
          </div>

          <div className="baseline-cols">
            <div>
              <h3>Category change</h3>
              <div className="kb-table-wrap">
                <table className="kb-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Base</th>
                      <th>Now</th>
                      <th>Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {baselineDiff.categories.map((row) => (
                      <tr key={row.category}>
                        <td>{row.label}</td>
                        <td>{row.baseline}</td>
                        <td>{row.current}</td>
                        <td className={row.delta > 0 ? "delta-up" : row.delta < 0 ? "delta-down" : ""}>
                          {row.delta > 0 ? `+${row.delta}` : row.delta}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <h3>Fixed since baseline ({baselineDiff.fixed.length})</h3>
              {baselineDiff.fixed.length > 0 ? (
                <ul className="baseline-findings">
                  {baselineDiff.fixed.map((finding) => (
                    <li key={finding.id} className="is-fixed">
                      <span>{finding.severity}</span>
                      {finding.title}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No findings cleared yet.</p>
              )}
              <h3>Introduced ({baselineDiff.introduced.length})</h3>
              {baselineDiff.introduced.length > 0 ? (
                <ul className="baseline-findings">
                  {baselineDiff.introduced.map((finding) => (
                    <li key={finding.id} className="is-introduced">
                      <span>{finding.severity}</span>
                      {finding.title}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No new findings introduced.</p>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="baseline-empty">
          <p>
            Snapshot the current model as a baseline, then remediate and watch the score, risk and findings
            improve against it.
          </p>
          <button type="button" className="text-button primary" onClick={onCaptureBaseline}>
            Set baseline from current
          </button>
        </div>
      )}
    </div>
  );
}
