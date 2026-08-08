import { assetTypes, getAssetType, zones } from "../data/catalog";
import { itKindLabel } from "../models/itMap";
import type { AssetOverride, CyberMapDocument, MapAsset, MapConnection } from "../models/cyberMap";
import type { Asset, Finding } from "../models/types";

/**
 * The right sidebar: everything known about one asset or one connection, and what a person decided
 * over the top of it.
 *
 * Not `InspectorPanel`. That one edits an `OtProject`, where every field is something somebody
 * typed, so a text box writing straight back into the model is the correct interaction. Here the
 * model is derived from imports and the editable layer sits *over* it, and the difference is the
 * whole architecture: a field shows what the sources said, an override shows what was decided
 * instead, and clearing the override has to bring the derived value back. A shared component that
 * blurred the two would be hiding the one distinction the document exists to keep.
 */

interface MapInspectorProps {
  doc: CyberMapDocument;
  asset?: MapAsset;
  connection?: MapConnection;
  findings: Finding[];
  /** Endpoint names for a connection, which stores ids and nothing a reader recognises. */
  nameOf: (assetId: string) => string;
  onOverride: (assetId: string, patch: AssetOverride) => void;
  onClearOverride: (assetId: string) => void;
}

/** The overridden fields, so the panel can say what was decided rather than only showing values. */
function overriddenKeys(override: AssetOverride | undefined): string[] {
  if (!override) {
    return [];
  }
  return Object.entries(override)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
}

export function MapInspector({ doc, asset, connection, findings, nameOf, onOverride, onClearOverride }: MapInspectorProps) {
  if (!asset && !connection) {
    return (
      <aside className="map-inspector" aria-label="Inspector">
        <div className="panel-heading">
          <span>Inspector</span>
          <small>No selection</small>
        </div>
        <div className="empty-state">
          <strong>Select an asset or a connection</strong>
          <p>Everything the imports said about it, and anything you decided instead.</p>
        </div>
      </aside>
    );
  }

  if (connection) {
    return (
      <aside className="map-inspector" aria-label="Inspector">
        <div className="panel-heading">
          <span>Connection</span>
          <small>{connection.provenance === "authored" ? "You drew this" : "From a source"}</small>
        </div>
        <dl className="map-inspector-facts">
          <dt>Evidence</dt>
          <dd>{connection.evidence}</dd>
          <dt>From</dt>
          <dd>{nameOf(connection.source)}</dd>
          <dt>To</dt>
          <dd>{nameOf(connection.target)}</dd>
          <dt>Crosses a zone</dt>
          <dd>{connection.trustBoundary ? "Yes" : "No"}</dd>
          <dt>Permit rule</dt>
          <dd>{connection.firewallRule}</dd>
          <dt>Mediation</dt>
          <dd>{connection.control}</dd>
        </dl>
        {connection.provenance === "imported" ? (
          <p className="muted">
            This connection is evidence, not a decision — it is re-derived from the sources every load, so it cannot be
            edited here. Draw your own alongside it if the sources are wrong.
          </p>
        ) : null}
      </aside>
    );
  }

  const override = doc.assetOverrides[asset!.id];
  const overridden = overriddenKeys(override);
  const type = getAssetType(asset!.type);

  const set = (patch: AssetOverride) => onOverride(asset!.id, patch);

  return (
    <aside className="map-inspector" aria-label="Inspector">
      <div className="panel-heading">
        <span>{asset!.name}</span>
        <small>{asset!.provenance === "authored" ? "Yours" : "Imported"}</small>
      </div>

      <section>
        <h3>What the sources said</h3>
        <dl className="map-inspector-facts">
          <dt>Addresses</dt>
          <dd>{asset!.identifiers.ips.join(", ") || "—"}</dd>
          <dt>Hostnames</dt>
          <dd>{asset!.identifiers.hostnames.join(", ") || "—"}</dd>
          <dt>MAC</dt>
          <dd>{asset!.identifiers.macs.join(", ") || "—"}</dd>
          <dt>Vendor</dt>
          <dd>{asset!.manufacturer || "—"}</dd>
          <dt>Operating system</dt>
          <dd>{asset!.os || "Not identified"}</dd>
          <dt>Seen as</dt>
          <dd>{asset!.deviceKind ? itKindLabel(asset!.deviceKind) : "—"}</dd>
          <dt>Open services</dt>
          <dd>
            {asset!.ports.length === 0
              ? "None recorded"
              : asset!.ports.map((port) => port.service || String(port.port)).join(", ")}
          </dd>
        </dl>
      </section>

      <section>
        <h3>Provenance</h3>
        <p className="muted">{asset!.rationale || "No rationale recorded."}</p>
        <dl className="map-inspector-facts">
          <dt>Confidence</dt>
          <dd>{asset!.confidence.toFixed(2)}</dd>
          <dt>Imports that saw it</dt>
          <dd>
            {asset!.sourceIds.length === 0
              ? "Inferred — no source names it directly"
              : asset!.sourceIds
                  .map((id) => doc.sources.find((source) => source.id === id)?.name ?? id)
                  .join(", ")}
          </dd>
        </dl>
      </section>

      <section>
        <h3>
          Findings <small>{findings.length}</small>
        </h3>
        {findings.length === 0 ? (
          // Not the same as "this asset is fine", and worth the words: the rules only fire on what
          // has been modelled, and a scanned host has almost nothing modelled about it yet.
          <p className="muted">No rule fired on this asset. That is not the same as nothing being wrong with it.</p>
        ) : (
          <ul className="map-inspector-findings">
            {findings.map((finding) => (
              <li key={finding.id}>
                <strong>{finding.severity}</strong> {finding.title}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3>
          What you decided{" "}
          {overridden.length > 0 ? (
            <button type="button" className="text-button compact" onClick={() => onClearOverride(asset!.id)}>
              Clear {overridden.length}
            </button>
          ) : null}
        </h3>

        <label className="field">
          <span>Name{override?.name !== undefined ? " (yours)" : ""}</span>
          <input value={asset!.name} onChange={(event) => set({ name: event.target.value })} />
        </label>

        <label className="field">
          <span>Asset type{override?.type !== undefined ? " (yours)" : ""}</span>
          <select value={asset!.type} onChange={(event) => set({ type: event.target.value as Asset["type"] })}>
            {assetTypes.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Purdue level{override?.zone !== undefined ? " (yours)" : ""}</span>
          <select value={asset!.zone} onChange={(event) => set({ zone: event.target.value as Asset["zone"] })}>
            {zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.levelLabel} — {zone.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Criticality{override?.criticality !== undefined ? " (yours)" : ""}</span>
          <select
            value={asset!.criticality}
            onChange={(event) => set({ criticality: event.target.value as Asset["criticality"] })}
          >
            {(["low", "medium", "high", "critical"] as const).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Business owner{override?.owner !== undefined ? " (yours)" : ""}</span>
          <input value={asset!.owner} onChange={(event) => set({ owner: event.target.value })} />
        </label>

        <label className="field">
          <span>Notes{override?.notes !== undefined ? " (yours)" : ""}</span>
          <textarea value={asset!.notes} onChange={(event) => set({ notes: event.target.value })} />
        </label>

        <p className="muted">
          Derived from the sources as {type.label}. Anything you change here is stored separately and survives
          re-importing the same scan.
        </p>
      </section>
    </aside>
  );
}
