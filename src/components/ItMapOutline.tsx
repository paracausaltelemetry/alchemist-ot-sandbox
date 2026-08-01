import { itKindLabel, type ItMap, type ItNode } from "../models/itMap";
import type { ItRisk } from "./ItNetworkCanvas";
import { NetworkSymbol } from "./NetworkSymbol";

/**
 * The network map as a structured outline: edge and routing first, then each subnet with its
 * gateway and hosts.
 *
 * This is not a fallback for a canvas that would not fit. A 192px node card and a map that runs
 * to a few thousand pixels is a bad phone experience however it is scaled, so on a small screen
 * the same topology is better read than panned. It doubles as the map's text equivalent for
 * anyone not using a pointer — a React Flow canvas cannot be read in order.
 */

interface ItMapOutlineProps {
  map: ItMap;
  riskByNodeId: Map<string, ItRisk>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

const EDGE_TIERS = new Set(["internet", "perimeter", "core"]);

function NodeRow({
  node,
  risk,
  selected,
  onSelect
}: {
  node: ItNode;
  risk: ItRisk | null;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <li>
      <button
        type="button"
        className={`it-outline-row${selected ? " is-selected" : ""}${risk ? ` it-outline-risk-${risk}` : ""}${
          node.origin === "synthetic" ? " is-ghost" : ""
        }`}
        onClick={() => onSelect(node.id)}
        aria-current={selected ? "true" : undefined}
      >
        <NetworkSymbol kind={node.kind} size={20} />
        <span className="it-outline-body">
          <span className="it-outline-name">{node.name}</span>
          <span className="it-outline-meta">
            <span className="it-outline-kind">{itKindLabel(node.kind)}</span>
            {node.ip ? <span className="it-outline-addr">{node.ip}</span> : null}
            {node.ports.length > 0 ? <span className="it-outline-ports">{node.ports.length} open</span> : null}
          </span>
        </span>
        {node.origin === "synthetic" ? <span className="it-outline-tag">inferred</span> : null}
        {risk ? (
          <span className="it-outline-tag" data-risk={risk}>
            {risk === "high" ? "exposed" : "risky"}
          </span>
        ) : null}
      </button>
    </li>
  );
}

export function ItMapOutline({ map, riskByNodeId, selectedId, onSelect }: ItMapOutlineProps) {
  const edge = map.nodes.filter((node) => EDGE_TIERS.has(node.tier));
  const rowsFor = (nodes: ItNode[]) =>
    nodes.map((node) => (
      <NodeRow
        key={node.id}
        node={node}
        risk={riskByNodeId.get(node.id) ?? null}
        selected={selectedId === node.id}
        onSelect={onSelect}
      />
    ));

  return (
    <section className="it-outline" aria-label="Network map outline">
      {edge.length > 0 ? (
        <div className="it-outline-group">
          <h3>Edge and routing</h3>
          <ul>{rowsFor(edge)}</ul>
        </div>
      ) : null}

      {map.subnets.map((subnet) => {
        const gateway = map.nodes.filter((node) => node.tier === "gateway" && node.subnetId === subnet.id);
        const hosts = map.nodes.filter((node) => node.tier === "host" && node.subnetId === subnet.id);
        if (gateway.length === 0 && hosts.length === 0) {
          return null;
        }
        return (
          <div className="it-outline-group" key={subnet.id}>
            <h3>
              {subnet.name}
              <small>{hosts.length === 1 ? "1 host" : `${hosts.length} hosts`}</small>
            </h3>
            <ul>
              {rowsFor(gateway)}
              {rowsFor(hosts)}
            </ul>
          </div>
        );
      })}

      {map.nodes.some((node) => node.tier === "host" && !node.subnetId) ? (
        <div className="it-outline-group">
          <h3>Not in a subnet</h3>
          <ul>{rowsFor(map.nodes.filter((node) => node.tier === "host" && !node.subnetId))}</ul>
        </div>
      ) : null}
    </section>
  );
}
