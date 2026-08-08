import { zones } from "../../data/catalog";
import type { OtProject } from "../../models/types";

interface ZoneMatrixTabProps {
  project: OtProject;
}

export function ZoneMatrixTab({ project }: ZoneMatrixTabProps) {
  return (
    <div className="analysis-content matrix-wrap">
      <table className="zone-matrix">
        <thead>
          <tr>
            <th>From / To</th>
            {zones.map((zone) => (
              <th key={zone.id}>{zone.shortName}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {zones.map((sourceZone) => (
            <tr key={sourceZone.id}>
              <th>{sourceZone.shortName}</th>
              {zones.map((targetZone) => {
                const flows = project.conduits.filter((conduit) => {
                  const source = project.assets.find((asset) => asset.id === conduit.source);
                  const target = project.assets.find((asset) => asset.id === conduit.target);
                  return source?.zone === sourceZone.id && target?.zone === targetZone.id;
                });
                return (
                  <td key={targetZone.id} className={flows.some((flow) => flow.trustBoundary) ? "has-boundary-flow" : ""}>
                    {flows.length > 0 ? flows.length : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">Counts show declared conduits by source and destination zone. Boundary cells need rule, logging, and inspection review.</p>
    </div>
  );
}
