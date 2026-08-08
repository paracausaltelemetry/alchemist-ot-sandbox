import { ChevronsRight, Trash2 } from "lucide-react";
import { useState } from "react";
import { assetTypes, zones } from "../data/catalog";
import { protocolFamilies, protocolLabel, resolveProtocolFamily } from "../data/protocols";
import { derivedConsequence } from "../engine/risk";
import type {
  Asset,
  BackupStatus,
  Conduit,
  ConduitControl,
  ConduitDirection,
  Criticality,
  FirewallRule,
  LifecycleStatus,
  OtProject,
  ProtocolFamilyId,
  SecurityControls
} from "../models/types";

/**
 * The consequence scale, worded in terms of what happens to the process rather than as bare
 * numbers. An assessor picking "5" from an unlabelled list is guessing; picking "harm to people or
 * the environment" is making the judgement the method actually asks for.
 */
const CONSEQUENCE_OPTIONS = [
  { value: 1, label: "Negligible — no operational effect" },
  { value: 2, label: "Minor — local disruption, quickly recovered" },
  { value: 3, label: "Moderate — partial loss of process visibility or control" },
  { value: 4, label: "Major — loss of production or of a safety function's availability" },
  { value: 5, label: "Severe — harm to people or the environment" }
];

interface InspectorPanelProps {
  project: OtProject;
  asset?: Asset;
  conduit?: Conduit;
  onAssetChange: (assetId: string, patch: Partial<Asset>) => void;
  onConduitChange: (conduitId: string, patch: Partial<Conduit>) => void;
  onDeleteSelected: () => void;
  onConfirmSelected: () => void;
  onCollapse: () => void;
}

type ControlKey = keyof SecurityControls;

const controlLabels: Array<{ key: ControlKey; label: string }> = [
  { key: "mfa", label: "MFA" },
  { key: "allowListing", label: "Allow listing" },
  { key: "endpointProtection", label: "Endpoint protection" },
  { key: "patchingProgram", label: "Patching program" },
  { key: "backups", label: "Backups" },
  { key: "defaultCredentialsDisabled", label: "Defaults removed" },
  { key: "networkMonitoring", label: "Network monitoring" },
  { key: "centralLogging", label: "Central logging" },
  { key: "remoteAccessApproved", label: "Remote access approved" },
  { key: "safetyValidated", label: "Safety validated" }
];

export function InspectorPanel({
  project,
  asset,
  conduit,
  onAssetChange,
  onConduitChange,
  onDeleteSelected,
  onConfirmSelected,
  onCollapse
}: InspectorPanelProps) {
  const [panelMode, setPanelMode] = useState<"inspector" | "guide">("inspector");

  return (
    <aside className="inspector-panel" aria-label="Inspector">
      <div className="panel-heading">
        <span>{panelMode === "inspector" ? "Inspector" : "Conduit Guide"}</span>
        <div className="panel-heading-actions">
          <small>{asset ? "Asset" : conduit ? "Conduit" : "No selection"}</small>
          <button type="button" className="rail-collapse" onClick={onCollapse} title="Collapse inspector" aria-label="Collapse inspector">
            <ChevronsRight size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="panel-toggle" aria-label="Inspector panel mode">
        <button type="button" className={panelMode === "inspector" ? "active" : ""} onClick={() => setPanelMode("inspector")}>
          Inspector
        </button>
        <button type="button" className={panelMode === "guide" ? "active" : ""} onClick={() => setPanelMode("guide")}>
          Guide
        </button>
      </div>

      {panelMode === "guide" ? <ConduitGuide project={project} /> : null}

      {panelMode === "inspector" && !asset && !conduit ? (
        <div className="empty-state">
          <strong>Select an asset or conduit</strong>
          <p>Edit Purdue level, protocols, controls, direction, and firewall posture. The rating updates locally.</p>
        </div>
      ) : null}

      {panelMode === "inspector" && asset ? (
        <div className="inspector-form">
          <TextField label="Name" value={asset.name} onChange={(name) => onAssetChange(asset.id, { name })} />
          <label className="field">
            <span>Asset type</span>
            <select
              value={asset.type}
              onChange={(event) => {
                const nextType = assetTypes.find((type) => type.id === event.target.value);
                onAssetChange(asset.id, {
                  type: event.target.value as Asset["type"],
                  protocols: nextType?.baseProtocols ?? asset.protocols
                });
              }}
            >
              {assetTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
          <div className="field-row">
            <label className="field">
              <span>Zone / level</span>
              <select value={asset.zone} onChange={(event) => onAssetChange(asset.id, { zone: event.target.value as Asset["zone"] })}>
                {zones.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.levelLabel} - {zone.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Subnet</span>
              <select
                value={asset.subnetId ?? ""}
                onChange={(event) => onAssetChange(asset.id, { subnetId: event.target.value || undefined })}
              >
                <option value="">Unassigned</option>
                {(project.subnets ?? []).map((subnet) => (
                  <option key={subnet.id} value={subnet.id}>
                    {subnet.name}
                    {subnet.cidr ? ` (${subnet.cidr})` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="field-row">
            <TextField label="IP / CIDR" value={asset.ipAddress} onChange={(ipAddress) => onAssetChange(asset.id, { ipAddress })} />
            <TextField label="VLAN" value={asset.vlan} onChange={(vlan) => onAssetChange(asset.id, { vlan })} />
          </div>
          <label className="field">
            <span>Criticality</span>
            <select
              value={asset.criticality}
              onChange={(event) => onAssetChange(asset.id, { criticality: event.target.value as Criticality })}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </label>
          {/*
            Consequence has always been overridable in the model and there has never been anywhere
            to set it, so every risk score used the derived value whether or not the assessor agreed.
            That is the wrong way round for a consequence-led method: the derived number knows the
            asset's class and criticality, and the assessor knows this historian holds the batch
            records and losing it stops the line. Left on "Derived", nothing changes.
          */}
          <label className="field">
            <span>Consequence if compromised</span>
            <select
              value={asset.consequence === undefined ? "" : String(asset.consequence)}
              onChange={(event) =>
                onAssetChange(asset.id, {
                  consequence: event.target.value === "" ? undefined : Number(event.target.value)
                })
              }
            >
              <option value="">Derived ({derivedConsequence(asset)}) — from class and criticality</option>
              {CONSEQUENCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.value} — {option.label}
                </option>
              ))}
            </select>
          </label>
          <details className="inspector-section">
            <summary>Details &amp; metadata</summary>
            <div className="inspector-section-body">
          <TextField label="Owner" value={asset.owner} onChange={(owner) => onAssetChange(asset.id, { owner })} />
          <div className="field-row">
            <TextField label="Manufacturer" value={asset.manufacturer} onChange={(manufacturer) => onAssetChange(asset.id, { manufacturer })} />
            <TextField label="Model" value={asset.model} onChange={(model) => onAssetChange(asset.id, { model })} />
          </div>
          <div className="field-row">
            <TextField
              label="Firmware / version"
              value={asset.firmwareVersion}
              onChange={(firmwareVersion) => onAssetChange(asset.id, { firmwareVersion })}
            />
            <TextField label="Site / area" value={asset.siteArea} onChange={(siteArea) => onAssetChange(asset.id, { siteArea })} />
          </div>
          <div className="field-row">
            <label className="field">
              <span>Lifecycle</span>
              <select value={asset.lifecycleStatus} onChange={(event) => onAssetChange(asset.id, { lifecycleStatus: event.target.value as LifecycleStatus })}>
                <option value="supported">Supported</option>
                <option value="limited">Limited support</option>
                <option value="obsolete">Obsolete / unsupported</option>
                <option value="unknown">Unknown</option>
              </select>
            </label>
            <label className="field">
              <span>Backup status</span>
              <select value={asset.backupStatus} onChange={(event) => onAssetChange(asset.id, { backupStatus: event.target.value as BackupStatus })}>
                <option value="verified">Verified restore</option>
                <option value="configured">Configured</option>
                <option value="missing">Missing</option>
                <option value="unknown">Unknown</option>
              </select>
            </label>
          </div>
          <div className="field-row">
            <TextField label="Patch window" value={asset.patchWindow} onChange={(patchWindow) => onAssetChange(asset.id, { patchWindow })} />
            <TextField
              label="Process tag"
              value={asset.criticalProcessTag}
              onChange={(criticalProcessTag) => onAssetChange(asset.id, { criticalProcessTag })}
            />
          </div>
          <label className="field">
            <span>Protocols</span>
            <input
              value={asset.protocols.join(", ")}
              onChange={(event) =>
                onAssetChange(asset.id, {
                  protocols: event.target.value
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean)
                })
              }
            />
          </label>
          <label className="field">
            <span>Notes</span>
            <textarea value={asset.notes} onChange={(event) => onAssetChange(asset.id, { notes: event.target.value })} />
          </label>
            </div>
          </details>

          <details className="inspector-section">
            <summary>Security controls</summary>
            <div className="inspector-section-body">
          <fieldset className="control-grid">
            {controlLabels.map((control) => (
              <label className="toggle-row" key={control.key}>
                <input
                  type="checkbox"
                  checked={asset.controls[control.key]}
                  onChange={(event) =>
                    onAssetChange(asset.id, {
                      controls: { ...asset.controls, [control.key]: event.target.checked }
                    })
                  }
                />
                <span>{control.label}</span>
              </label>
            ))}
          </fieldset>
            </div>
          </details>

          <button type="button" className="danger-button" onClick={onDeleteSelected}>
            <Trash2 size={16} />
            Delete asset
          </button>
        </div>
      ) : null}

      {panelMode === "inspector" && conduit ? (
        <div className="inspector-form">
          <ConduitSummary project={project} conduit={conduit} />
          <TextField label="Name" value={conduit.name} onChange={(name) => onConduitChange(conduit.id, { name })} />
          <div className="field-row">
            <TextField label="Protocol" value={conduit.protocol} onChange={(protocol) => onConduitChange(conduit.id, { protocol })} />
            <TextField label="Port" value={conduit.port} onChange={(port) => onConduitChange(conduit.id, { port })} />
          </div>
          <label className="field">
            <span>Protocol colour family</span>
            <select
              value={conduit.protocolFamily}
              onChange={(event) => onConduitChange(conduit.id, { protocolFamily: event.target.value as ProtocolFamilyId })}
            >
              <option value="auto">Auto classify</option>
              {protocolFamilies.map((family) => (
                <option value={family.id} key={family.id}>
                  {family.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Direction</span>
            <select
              value={conduit.direction}
              onChange={(event) => onConduitChange(conduit.id, { direction: event.target.value as ConduitDirection })}
            >
              <option value="source-to-target">Source to target</option>
              <option value="target-to-source">Target to source</option>
              <option value="bidirectional">Bidirectional</option>
            </select>
          </label>
          <details className="inspector-section">
            <summary>Advanced</summary>
            <div className="inspector-section-body">
          <label className="field">
            <span>Control</span>
            <select value={conduit.control} onChange={(event) => onConduitChange(conduit.id, { control: event.target.value as ConduitControl })}>
              <option value="routed">Routed</option>
              <option value="firewalled">Firewalled</option>
              <option value="jump-host">Jump host</option>
              <option value="data-diode">Data diode / one-way</option>
            </select>
          </label>
          <label className="field">
            <span>Firewall rule</span>
            <select
              value={conduit.firewallRule}
              onChange={(event) => onConduitChange(conduit.id, { firewallRule: event.target.value as FirewallRule })}
            >
              <option value="explicit">Explicit least privilege</option>
              <option value="any-any">Any-any / broad</option>
              <option value="unknown">Unknown</option>
            </select>
          </label>
          <div className="control-grid compact">
            {[
              ["trustBoundary", "Trust boundary"],
              ["inspected", "Inspected"],
              ["logged", "Logged"],
              ["encrypted", "Encrypted"],
              ["jumpHostRequired", "Jump host required"]
            ].map(([key, label]) => (
              <label className="toggle-row" key={key}>
                <input
                  type="checkbox"
                  checked={Boolean(conduit[key as keyof Conduit])}
                  onChange={(event) => onConduitChange(conduit.id, { [key]: event.target.checked } as Partial<Conduit>)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <div className="field-row">
            <TextField label="Rule owner" value={conduit.ruleOwner} onChange={(ruleOwner) => onConduitChange(conduit.id, { ruleOwner })} />
            <TextField
              label="Review date"
              value={conduit.reviewDate}
              onChange={(reviewDate) => onConduitChange(conduit.id, { reviewDate })}
            />
          </div>
          <div className="field-row">
            <TextField
              label="Expiry date"
              value={conduit.expiryDate}
              onChange={(expiryDate) => onConduitChange(conduit.id, { expiryDate })}
            />
            <TextField
              label="Monitoring source"
              value={conduit.monitoringSource}
              onChange={(monitoringSource) => onConduitChange(conduit.id, { monitoringSource })}
            />
          </div>
          <TextField
            label="Inspection point"
            value={conduit.inspectionPoint}
            onChange={(inspectionPoint) => onConduitChange(conduit.id, { inspectionPoint })}
          />
          <label className="field">
            <span>Business justification</span>
            <textarea
              value={conduit.businessJustification}
              onChange={(event) => onConduitChange(conduit.id, { businessJustification: event.target.value })}
            />
          </label>
          <div className="control-grid compact">
            {[
              ["temporaryAccess", "Temporary access"],
              ["businessCritical", "Business critical flow"]
            ].map(([key, label]) => (
              <label className="toggle-row" key={key}>
                <input
                  type="checkbox"
                  checked={Boolean(conduit[key as keyof Conduit])}
                  onChange={(event) => onConduitChange(conduit.id, { [key]: event.target.checked } as Partial<Conduit>)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <label className="field">
            <span>Notes</span>
            <textarea value={conduit.notes} onChange={(event) => onConduitChange(conduit.id, { notes: event.target.value })} />
          </label>
            </div>
          </details>
          <button type="button" className="text-button primary confirm-button" onClick={onConfirmSelected}>
            Confirm conduit
          </button>
          <button type="button" className="danger-button" onClick={onDeleteSelected}>
            <Trash2 size={16} />
            Delete conduit
          </button>
        </div>
      ) : null}
    </aside>
  );
}

function ConduitSummary({ project, conduit }: { project: OtProject; conduit: Conduit }) {
  const source = project.assets.find((asset) => asset.id === conduit.source);
  const target = project.assets.find((asset) => asset.id === conduit.target);
  const family = resolveProtocolFamily(conduit);

  return (
    <div className="conduit-summary">
      <span className="protocol-chip" style={{ "--protocol-color": family.color } as React.CSSProperties}>
        {protocolLabel(conduit)}
      </span>
      <strong>
        {source?.name ?? conduit.source} &rarr; {target?.name ?? conduit.target}
      </strong>
      <small>Confirm when the source, destination, direction, and protocol are correct.</small>
    </div>
  );
}

function ConduitGuide({ project }: { project: OtProject }) {
  const assets = new Map(project.assets.map((asset) => [asset.id, asset]));

  return (
    <div className="conduit-guide">
      <section>
        <h3>Protocol lines</h3>
        <div className="protocol-guide-grid">
          {protocolFamilies.map((family) => (
            <span key={family.id}>
              <i style={{ background: family.color }} />
              <strong>{family.shortLabel}</strong>
              <small>{family.label}</small>
            </span>
          ))}
        </div>
      </section>

      <section>
        <h3>Line meaning</h3>
        <ul className="line-guide">
          <li>
            <span className="line-sample solid" />
            Explicit permit rule
          </li>
          <li>
            <span className="line-sample dashed" />
            Unknown or undocumented rule
          </li>
          <li>
            <span className="line-sample dotted" />
            Any-any or broad rule
          </li>
          <li>
            <span className="line-sample boundary" />
            Trust boundary crossing
          </li>
        </ul>
      </section>

      <section>
        <h3>Declared conduits</h3>
        <div className="conduit-guide-list">
          {project.conduits.length > 0 ? (
            project.conduits.map((conduit) => {
              const source = assets.get(conduit.source);
              const target = assets.get(conduit.target);
              const family = resolveProtocolFamily(conduit);
              return (
                <article key={conduit.id}>
                  <span className="protocol-chip" style={{ "--protocol-color": family.color } as React.CSSProperties}>
                    {protocolLabel(conduit)}
                  </span>
                  <strong>
                    {source?.name ?? conduit.source} &rarr; {target?.name ?? conduit.target}
                  </strong>
                  <small>
                    {conduit.direction.replaceAll("-", " ")} / {conduit.firewallRule}
                    {conduit.trustBoundary ? " / boundary" : ""}
                  </small>
                  <p>{family.riskNote}</p>
                </article>
              );
            })
          ) : (
            <p className="muted">No conduits declared yet. Use Connect mode on the canvas to add a protocol line between assets.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
