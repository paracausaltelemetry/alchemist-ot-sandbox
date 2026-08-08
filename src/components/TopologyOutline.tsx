import { getAssetType, getZone, modelledZones, zones } from "../data/catalog";
import { protocolLabel } from "../data/protocols";
import type { Asset, Conduit, OtProject } from "../models/types";

/**
 * The topology as text, in Purdue order.
 *
 * A React Flow canvas is a pile of absolutely positioned divs. It has an `aria-label` and nothing
 * behind it: the architecture the entire assessment rests on — which assets sit at which level, and
 * what crosses between them — could not be read at all without a pointer and working eyesight.
 * Reading order is the whole point here, so this walks levels from the enterprise down, which is
 * the direction the standards describe a plant in and the direction an attack path runs.
 *
 * Used twice. Visually hidden inside the canvas region, where it is the canvas's text equivalent
 * and deliberately non-interactive — a focusable control nobody can see is a worse trap than no
 * control at all. Visible on mobile, where there is no canvas and the alternative was a count.
 */

interface TopologyOutlineProps {
  project: OtProject;
  /** Rendered for screen readers only, alongside a canvas that carries the same content visually. */
  hidden?: boolean;
}

/** How a conduit reads out: what it reaches, over what, and whether it leaves the zone. */
function conduitSentence(conduit: Conduit, asset: Asset, byId: Map<string, Asset>): string {
  const isSource = conduit.source === asset.id;
  const other = byId.get(isSource ? conduit.target : conduit.source);
  const direction =
    conduit.direction === "bidirectional" ? "to and from" : isSource === (conduit.direction === "source-to-target") ? "to" : "from";

  const parts = [`${direction} ${other?.name ?? "an asset no longer in the model"}`, `over ${protocolLabel(conduit)}`];
  if (conduit.trustBoundary) {
    // The thing an assessor is actually looking for, so it is said rather than left to be inferred
    // from the two zone names.
    parts.push(`crossing a trust boundary, ${conduit.control === "routed" ? "routed" : conduit.control}`);
  }
  if (conduit.firewallRule === "any-any") {
    parts.push("permitted any-any");
  } else if (conduit.firewallRule === "unknown") {
    parts.push("permit rule not documented");
  }
  return parts.join(", ");
}

export function TopologyOutline({ project, hidden = false }: TopologyOutlineProps) {
  const byId = new Map(project.assets.map((asset) => [asset.id, asset]));
  const conduitsFor = (asset: Asset) =>
    project.conduits.filter((conduit) => conduit.source === asset.id || conduit.target === asset.id);

  // Enterprise first, control last: the order the standards describe a plant in, and the order an
  // attack path runs. `zones` is authored in that order already.
  const populated = zones
    .map((zone) => ({ zone, assets: project.assets.filter((asset) => asset.zone === zone.id) }))
    .filter((entry) => entry.assets.length > 0);

  const orphaned = project.conduits.filter(
    (conduit) => !byId.has(conduit.source) || !byId.has(conduit.target)
  );

  return (
    <div className={hidden ? "visually-hidden" : "topology-outline"}>
      <h3>Topology outline</h3>
      <p>
        {project.assets.length} assets and {project.conduits.length} conduits across {populated.length} modelled{" "}
        {populated.length === 1 ? "zone" : "zones"}, listed from the enterprise down to the process.
      </p>

      {populated.length === 0 ? <p>No assets have been added yet.</p> : null}

      {populated.map(({ zone, assets }) => (
        <section key={zone.id}>
          <h4>
            {zone.levelLabel} — {zone.name} ({assets.length} {assets.length === 1 ? "asset" : "assets"})
          </h4>
          <ul>
            {assets.map((asset) => {
              const links = conduitsFor(asset);
              return (
                <li key={asset.id}>
                  <strong>{asset.name}</strong>, {getAssetType(asset.type).label}, {asset.criticality} criticality
                  {asset.ipAddress ? `, ${asset.ipAddress}` : ""}
                  {/* The separator matters when this is read aloud: without it the address runs
                      straight into the first conduit as one unbroken phrase. */}
                  {links.length === 0 ? (
                    <span> — no conduits.</span>
                  ) : (
                    <>
                      <span>
                        {" "}
                        — {links.length} {links.length === 1 ? "conduit" : "conduits"}:
                      </span>
                      <ul aria-label={`Conduits on ${asset.name}`}>
                      {links.map((conduit) => (
                        <li key={conduit.id}>{conduitSentence(conduit, asset, byId)}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {orphaned.length > 0 ? (
        <section>
          <h4>Conduits referencing a missing asset ({orphaned.length})</h4>
          <ul>
            {orphaned.map((conduit) => (
              <li key={conduit.id}>{conduit.name}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Zones with nothing in them are a finding of their own, and silence would read as absence
          of risk rather than absence of modelling. */}
      {populated.length < modelledZones.length ? (
        <p>
          Not modelled:{" "}
          {modelledZones
            .filter((zone) => !populated.some((entry) => entry.zone.id === zone.id))
            .map((zone) => getZone(zone.id).name)
            .join(", ")}
          .
        </p>
      ) : null}
    </div>
  );
}
