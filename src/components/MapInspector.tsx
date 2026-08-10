import { assetTypes, getAssetType, zones } from "../data/catalog";
import { itKindLabel } from "../models/itMap";
import { portRisk } from "../engine/itAnalysis";
import { cvesFromScripts } from "../import/nse";
import type {
  AssetOverride,
  ConnectionOverride,
  CyberMapDocument,
  MapAsset,
  MapConnection
} from "../models/cyberMap";
import type { Asset, Conduit, Finding } from "../models/types";

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
  onConnectionOverride: (connectionId: string, patch: ConnectionOverride) => void;
  onClearConnectionOverride: (connectionId: string) => void;
  /** The asset the operator is working from, if they have named one. */
  foothold: string | null;
  onSetFoothold: (assetId: string | null) => void;
}

/** The conduit properties an assessment turns on that a scan can never report. */
const CONDUIT_FLAGS: Array<[keyof ConnectionOverride & keyof MapConnection, string]> = [
  ["encrypted", "Encrypted"],
  ["inspected", "Inspected"],
  ["logged", "Logged"],
  ["temporaryAccess", "Temporary"],
  ["businessCritical", "Business critical"]
];

/** The overridden fields, so the panel can say what was decided rather than only showing values. */
function overriddenKeys(override: AssetOverride | ConnectionOverride | undefined): string[] {
  if (!override) {
    return [];
  }
  return Object.entries(override)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
}

export function MapInspector({
  doc,
  asset,
  connection,
  findings,
  nameOf,
  onOverride,
  onClearOverride,
  onConnectionOverride,
  onClearConnectionOverride,
  foothold,
  onSetFoothold
}: MapInspectorProps) {
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
    const decided = doc.connectionOverrides[connection.id];
    const decidedCount = overriddenKeys(decided).length;
    const setConduit = (patch: ConnectionOverride) => onConnectionOverride(connection.id, patch);
    const mine = (key: keyof ConnectionOverride) => (decided?.[key] !== undefined ? " (yours)" : "");

    return (
      <aside className="map-inspector" aria-label="Inspector">
        <div className="panel-heading">
          <span>Connection</span>
          <small>{connection.provenance === "authored" ? "You drew this" : "From a source"}</small>
        </div>

        <section>
          <h3>What the evidence shows</h3>
          <dl className="map-inspector-facts">
            <dt>Evidence</dt>
            <dd>{connection.evidence}</dd>
            <dt>From</dt>
            <dd>{nameOf(connection.source)}</dd>
            <dt>To</dt>
            <dd>{nameOf(connection.target)}</dd>
            <dt>Crosses a level</dt>
            <dd>{connection.trustBoundary ? "Yes" : "No"}</dd>
          </dl>
          {/* The evidence grade is the one thing an override cannot touch, and saying so is the
              point: a decision about a conduit does not change who observed it. */}
          <p className="muted">
            A scan shows that two hosts can reach each other. It never shows the rule that allowed it, so everything
            below is a judgement rather than an observation.
          </p>
        </section>

        <section>
          <h3>
            What you decided{" "}
            {decidedCount > 0 ? (
              <button
                type="button"
                className="text-button compact"
                onClick={() => onClearConnectionOverride(connection.id)}
              >
                Clear {decidedCount}
              </button>
            ) : null}
          </h3>

          <label className="field">
            <span>Permit rule{mine("firewallRule")}</span>
            <select
              value={connection.firewallRule}
              onChange={(event) => setConduit({ firewallRule: event.target.value as Conduit["firewallRule"] })}
            >
              <option value="unknown">Not documented</option>
              <option value="explicit">Explicit source, destination and service</option>
              <option value="any-any">Any-any / broad</option>
            </select>
          </label>

          <label className="field">
            <span>Mediation{mine("control")}</span>
            <select
              value={connection.control}
              onChange={(event) => setConduit({ control: event.target.value as Conduit["control"] })}
            >
              <option value="routed">Routed — nothing mediates</option>
              <option value="firewalled">Firewalled</option>
              <option value="jump-host">Brokered by a jump host</option>
              <option value="data-diode">Data diode</option>
            </select>
          </label>

          <label className="field">
            <span>Direction{mine("direction")}</span>
            <select
              value={connection.direction}
              onChange={(event) => setConduit({ direction: event.target.value as Conduit["direction"] })}
            >
              <option value="bidirectional">Both ways</option>
              <option value="source-to-target">
                {nameOf(connection.source)} to {nameOf(connection.target)}
              </option>
              <option value="target-to-source">
                {nameOf(connection.target)} to {nameOf(connection.source)}
              </option>
            </select>
          </label>

          <div className="map-inspector-checks">
            {CONDUIT_FLAGS.map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={Boolean(connection[key])}
                  onChange={(event) => setConduit({ [key]: event.target.checked } as ConnectionOverride)}
                />
                <span>
                  {label}
                  {mine(key)}
                </span>
              </label>
            ))}
          </div>

          <label className="field">
            <span>Rule owner{mine("ruleOwner")}</span>
            <input value={connection.ruleOwner} onChange={(event) => setConduit({ ruleOwner: event.target.value })} />
          </label>

          <label className="field">
            <span>Why it exists{mine("businessJustification")}</span>
            <textarea
              value={connection.businessJustification}
              onChange={(event) => setConduit({ businessJustification: event.target.value })}
            />
          </label>

          <p className="muted">
            Stored separately from the evidence, so re-importing the scan that produced this connection keeps every
            decision on it.
          </p>
        </section>
      </aside>
    );
  }

  const override = doc.assetOverrides[asset!.id];
  const overridden = overriddenKeys(override);
  // Host-level and port-level results read as one list: the operator wants to know what the scripts
  // found on this machine, not which of Nmap's two buckets each result was filed in.
  const scripts = [...(asset!.scripts ?? []), ...asset!.ports.flatMap((port) => port.scripts ?? [])];
  const cves = cvesFromScripts(scripts);
  const type = getAssetType(asset!.type);

  const set = (patch: AssetOverride) => onOverride(asset!.id, patch);

  return (
    <aside className="map-inspector" aria-label="Inspector">
      <div className="panel-heading">
        <span>{asset!.name}</span>
        <small>{asset!.provenance === "authored" ? "Yours" : "Imported"}</small>
      </div>

      <button
        type="button"
        className={`text-button compact${foothold === asset!.id ? " is-active" : ""}`}
        aria-pressed={foothold === asset!.id}
        onClick={() => onSetFoothold(foothold === asset!.id ? null : asset!.id)}
        title="Read the map from this asset: what it reaches, and how far"
      >
        {foothold === asset!.id ? "Stop working from here" : "Work from here"}
      </button>

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
        </dl>
      </section>

      <section>
        <h3>
          Open services <small>{asset!.ports.length}</small>
        </h3>
        {asset!.ports.length === 0 ? (
          <p className="muted">Nothing answered. That is a scan result, not an absence of services.</p>
        ) : (
          /**
           * A table, not a comma-separated line.
           *
           * The version column is why: Nmap has been reporting `product` since the first parser and
           * nothing ever showed it. "ssh" is a fact about a port; "OpenSSH 8.9" is something an
           * operator can go and look up, and it is the single most useful thing in a scan.
           */
          <table className="map-port-table">
            <thead>
              <tr>
                <th>Port</th>
                <th>Service</th>
                <th>Version</th>
              </tr>
            </thead>
            <tbody>
              {[...asset!.ports]
                .sort((a, b) => a.port - b.port)
                .map((port) => {
                  const risk = portRisk(port.port);
                  return (
                    <tr key={`${port.port}-${port.transport ?? "tcp"}`} data-risk={risk?.severity}>
                      <td>
                        {port.port}/{port.transport ?? "tcp"}
                      </td>
                      <td title={risk?.reason}>{port.service || "—"}</td>
                      <td>{port.product || "—"}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        )}
      </section>

      {scripts.length > 0 ? (
        <section>
          <h3>
            Script results <small>{scripts.length}</small>
          </h3>
          {/*
            CVEs first, then the output they came out of.

            `vulners` and the `vuln-*` family bury identifiers in paragraphs of prose, and an
            identifier is the one part of that output somebody acts on immediately. Pulling them to
            the top is a reading aid, not a vulnerability model — there is no CVSS here, no state,
            no lifecycle, and pretending otherwise would be a worse lie than showing nothing.
          */}
          {cves.length > 0 ? (
            <p className="map-cve-list">
              {cves.map((cve) => (
                <span key={cve}>{cve}</span>
              ))}
            </p>
          ) : null}
          <dl className="map-script-list">
            {scripts.map((script, index) => (
              <div key={`${script.id}-${index}`}>
                <dt>{script.id}</dt>
                <dd>{script.output}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

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
