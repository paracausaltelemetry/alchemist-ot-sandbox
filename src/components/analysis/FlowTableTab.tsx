import type { CSSProperties } from "react";
import { protocolLabel, resolveProtocolFamily } from "../../data/protocols";
import type { OtProject } from "../../models/types";

function directionLabel(direction: string) {
  if (direction === "source-to-target") {
    return "Source to target";
  }
  if (direction === "target-to-source") {
    return "Target to source";
  }
  return "Bidirectional";
}

interface FlowTableTabProps {
  project: OtProject;
}

export function FlowTableTab({ project }: FlowTableTabProps) {
  return (
    <div className="analysis-content flow-table-wrap">
      <table className="flow-table">
        <thead>
          <tr>
            <th>Source</th>
            <th>Destination</th>
            <th>Protocol</th>
            <th>Direction</th>
            <th>Rule</th>
            <th>Boundary</th>
            <th>Monitoring</th>
            <th>Owner</th>
          </tr>
        </thead>
        <tbody>
          {project.conduits.map((conduit) => {
            const source = project.assets.find((asset) => asset.id === conduit.source);
            const target = project.assets.find((asset) => asset.id === conduit.target);
            const family = resolveProtocolFamily(conduit);
            return (
              <tr key={conduit.id}>
                <td>{source?.name ?? conduit.source}</td>
                <td>{target?.name ?? conduit.target}</td>
                <td>
                  <span className="protocol-chip" style={{ "--protocol-color": family.color } as CSSProperties}>
                    {protocolLabel(conduit)}
                  </span>
                </td>
                <td>{directionLabel(conduit.direction)}</td>
                <td>{conduit.firewallRule}</td>
                <td>{conduit.trustBoundary ? "Yes" : "No"}</td>
                <td>{[conduit.inspected ? "Inspected" : "", conduit.logged ? "Logged" : ""].filter(Boolean).join(" / ") || "Missing"}</td>
                <td>{conduit.ruleOwner || "Unassigned"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
