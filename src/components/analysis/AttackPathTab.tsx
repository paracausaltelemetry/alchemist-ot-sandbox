import type { AttackPathResult } from "../../engine/attackPath";
import { RISK_SCALE } from "../../engine/risk";
import type { OtProject } from "../../models/types";

interface AttackPathTabProps {
  project: OtProject;
  attackPath: AttackPathResult;
  attackEntryId: string;
  attackTargetId: string;
  onEntryChange: (id: string) => void;
  onTargetChange: (id: string) => void;
  onShowOnCanvas: () => void;
}

export function AttackPathTab({
  project,
  attackPath,
  attackEntryId,
  attackTargetId,
  onEntryChange,
  onTargetChange,
  onShowOnCanvas
}: AttackPathTabProps) {
  return (
    <div className="analysis-content reachability-grid">
      <div className="query-box">
        <label>
          <span>Entry point</span>
          <select value={attackEntryId} onChange={(event) => onEntryChange(event.target.value)}>
            {project.assets.map((asset) => (
              <option value={asset.id} key={asset.id}>
                {asset.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Crown jewel</span>
          <select value={attackTargetId} onChange={(event) => onTargetChange(event.target.value)}>
            {project.assets.map((asset) => (
              <option value={asset.id} key={asset.id}>
                {asset.name}
              </option>
            ))}
          </select>
        </label>
        <div className={`reachability-result ${attackPath.reachable ? "reachable" : "blocked"}`}>
          <strong>{attackPath.reachable ? "Path found" : "No path"}</strong>
          <p>{attackPath.explanation}</p>
        </div>
        <small className="mode-note">
          Consequence {attackPath.consequence.value}/{RISK_SCALE}
          {attackPath.consequence.processTag ? ` · ${attackPath.consequence.processTag}` : ""}
        </small>
        <button type="button" className="text-button" onClick={onShowOnCanvas}>
          Show on canvas
        </button>
      </div>

      <div className="path-box">
        <h3>Kill chain</h3>
        {attackPath.reachable ? (
          <>
            <ol className="path-list">
              {attackPath.hops.map((hop) => (
                <li key={hop.assetId} title={`${hop.typeLabel} · ${hop.zoneLabel}`}>
                  {hop.name}
                </li>
              ))}
            </ol>
            <ul className="killchain">
              {attackPath.tactics.map((tactic) => (
                <li key={tactic.id}>
                  <strong>{tactic.name}</strong>
                  <span>{tactic.techniques.map((technique) => `${technique.id} ${technique.name}`).join(", ")}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="muted">{attackPath.explanation}</p>
        )}
      </div>

      <div className="path-risks">
        <h3>Break the chain</h3>
        {attackPath.breakers.length > 0 ? (
          <ul>
            {attackPath.breakers.map((breaker, index) => (
              <li key={index}>
                <span>{breaker}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">No path-specific controls to add; the route is already constrained.</p>
        )}
        {attackPath.protectedAssets.length > 0 ? (
          <>
            <h3>Protected (defence in depth)</h3>
            <p className="muted">Unreachable from the entry: {attackPath.protectedAssets.join(", ")}.</p>
          </>
        ) : null}
      </div>
    </div>
  );
}
