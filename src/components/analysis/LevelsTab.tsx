import { getZone } from "../../data/catalog";
import { foundationalRequirements, type SecurityLevelAssessment } from "../../engine/securityLevels";
import type { ZoneId } from "../../models/types";

interface LevelsTabProps {
  securityLevels: SecurityLevelAssessment;
  onZoneTargetChange: (zone: ZoneId, target: number) => void;
}

export function LevelsTab({ securityLevels, onZoneTargetChange }: LevelsTabProps) {
  return (
    <div className="analysis-content sl-view">
      <table className="sl-table">
        <thead>
          <tr>
            <th>Zone</th>
            <th>SL-T</th>
            <th title="Architecture-derived indicator, not a formal achieved Security Level">Model signal</th>
            <th>Target gap</th>
            {foundationalRequirements.map((fr) => (
              <th key={fr.id} title={fr.label}>
                {fr.id}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {securityLevels.zones.map((zoneSL) => {
            const zoneDef = getZone(zoneSL.zone);
            const gap = zoneSL.target - zoneSL.achieved;
            // An unmodelled zone is neither met nor below target — there is nothing in it.
            const unmodelled = !zoneSL.modelled;
            return (
              <tr key={zoneSL.zone} className={unmodelled ? "sl-unmodelled" : gap > 0 ? "sl-below" : ""}>
                <th title={zoneDef.name}>{zoneDef.shortName}</th>
                <td>
                  <select
                    className="sl-target-select"
                    value={zoneSL.target}
                    aria-label={`Target Security Level for ${zoneDef.name}`}
                    onChange={(event) => onZoneTargetChange(zoneSL.zone, Number(event.target.value))}
                  >
                    {[1, 2, 3].map((level) => (
                      <option key={level} value={level}>
                        SL {level}
                      </option>
                    ))}
                  </select>
                </td>
                <td className={unmodelled ? "sl-a" : gap > 0 ? "sl-a sl-a-below" : "sl-a"}>
                  {unmodelled ? "—" : `Level ${zoneSL.achieved}`}
                </td>
                <td className="sl-gap">{unmodelled ? "not modelled" : gap > 0 ? `-${gap}` : "met"}</td>
                {foundationalRequirements.map((fr) => (
                  <td
                    key={fr.id}
                    className={`fr-cell${!unmodelled && zoneSL.limiting.includes(fr.id) && gap > 0 ? " fr-limiting" : ""}`}
                    title={unmodelled ? `${fr.label}: no assets declared in this zone` : `${fr.label}: SL ${zoneSL.frLevels[fr.id]}`}
                  >
                    {unmodelled ? "—" : zoneSL.frLevels[fr.id]}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted">
        This architecture-derived signal is capped by the weakest modeled Foundational Requirement (FR1–FR7). It is
        not a formal SL-A: confirm applicable 62443-3-3 requirements, enhancements, evidence and compensating controls
        before claiming an achieved Security Level. Set the SL-T per zone from the risk assessment.
      </p>
    </div>
  );
}
