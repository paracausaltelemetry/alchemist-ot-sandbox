import type { CanvasMode, OtProject, ReachabilityResult } from "../../models/types";

interface ReachabilityTabProps {
  project: OtProject;
  reachability: ReachabilityResult;
  sourceId: string;
  targetId: string;
  canvasMode: CanvasMode;
  onSourceChange: (id: string) => void;
  onTargetChange: (id: string) => void;
  onCanvasModeChange: (mode: CanvasMode) => void;
}

export function ReachabilityTab({
  project,
  reachability,
  sourceId,
  targetId,
  canvasMode,
  onSourceChange,
  onTargetChange,
  onCanvasModeChange
}: ReachabilityTabProps) {
  const assetName = (id: string) => project.assets.find((asset) => asset.id === id)?.name ?? id;

  return (
    <div className="analysis-content reachability-grid">
      <div className="query-box">
        <label>
          <span>Source</span>
          <select value={sourceId} onChange={(event) => onSourceChange(event.target.value)}>
            {project.assets.map((asset) => (
              <option value={asset.id} key={asset.id}>
                {asset.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Target</span>
          <select value={targetId} onChange={(event) => onTargetChange(event.target.value)}>
            {project.assets.map((asset) => (
              <option value={asset.id} key={asset.id}>
                {asset.name}
              </option>
            ))}
          </select>
        </label>
        <div className={`reachability-result ${reachability.reachable ? "reachable" : "blocked"}`}>
          <strong>{reachability.reachable ? "Reachable" : "Blocked"}</strong>
          <p>{reachability.explanation}</p>
        </div>
        <button type="button" className="text-button" onClick={() => onCanvasModeChange("reachability")}>
          Show attacker path
        </button>
        <small className="mode-note">Canvas mode: {canvasMode}</small>
      </div>
      <div className="path-box">
        <h3>Path</h3>
        {reachability.pathAssetIds.length > 0 ? (
          <ol className="path-list">
            {reachability.pathAssetIds.map((id) => (
              <li key={id}>{assetName(id)}</li>
            ))}
          </ol>
        ) : (
          <p className="muted">No permitted path found with the declared conduit directions.</p>
        )}
      </div>
      <div className="path-risks">
        <h3>Path risks</h3>
        {reachability.risks.length > 0 ? (
          <ul>
            {reachability.risks.map((risk, index) => (
              <li key={`${risk.title}-${index}`} className={`severity-${risk.severity}`}>
                <strong>{risk.title}</strong>
                <span>{risk.detail}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No path-specific risks detected for this query.</p>
        )}
      </div>
    </div>
  );
}
