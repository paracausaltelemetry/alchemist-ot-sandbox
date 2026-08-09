import type { AssetOverride, ConnectionOverride, CyberMapDocument, ProjectedMap } from "../models/cyberMap";
import type { Asset, Conduit } from "../models/types";

/**
 * Writes a modified `OtProject` back onto the converged document as authored decisions.
 *
 * The what-if tab works by handing `applyRemediations` a project and getting a changed one back,
 * which is exactly right for a model where every field was typed by a person. Here the model is
 * derived from imports, so there is nowhere to write a changed field *to* — applying the simulation
 * wholesale would mean storing a snapshot and abandoning re-derivation, which is the one property
 * the document is built around.
 *
 * So the change is recorded as what it actually is: a set of decisions. "Enable MFA on the
 * historian" becomes an asset override, "document this permit rule" becomes a connection override,
 * and both survive re-importing the scan that produced the asset. Anything the simulation altered
 * that no override can express is reported rather than dropped, because a remediation that silently
 * fails to apply is worse than one that refuses.
 */

/** Fields an `AssetOverride` can carry. Anything else the simulation touches is reported. */
const ASSET_FIELDS = [
  "name",
  "type",
  "zone",
  "criticality",
  "consequence",
  "owner",
  "notes",
  "subnetId",
  "lifecycleStatus",
  "backupStatus",
  "manufacturer",
  "model",
  "firmwareVersion",
  "siteArea",
  "criticalProcessTag"
] as const satisfies ReadonlyArray<keyof AssetOverride & keyof Asset>;

const CONNECTION_FIELDS = [
  "name",
  "protocol",
  "port",
  "protocolFamily",
  "direction",
  "control",
  "firewallRule",
  "inspected",
  "logged",
  "encrypted",
  "jumpHostRequired",
  "ruleOwner",
  "businessJustification",
  "reviewDate",
  "expiryDate",
  "temporaryAccess",
  "businessCritical",
  "notes"
] as const satisfies ReadonlyArray<keyof ConnectionOverride & keyof Conduit>;

export interface OverrideDiff {
  assetOverrides: Record<string, AssetOverride>;
  connectionOverrides: Record<string, ConnectionOverride>;
  /** Changes no override can hold, named so the operator learns they did not land. */
  unapplied: string[];
}

export function diffToOverrides(
  projected: ProjectedMap,
  simulated: { assets: Asset[]; conduits: Conduit[] }
): OverrideDiff {
  const assetOverrides: Record<string, AssetOverride> = {};
  const connectionOverrides: Record<string, ConnectionOverride> = {};
  const unapplied: string[] = [];

  const beforeAssets = new Map(projected.assets.map((asset) => [asset.id, asset] as const));
  for (const after of simulated.assets) {
    const before = beforeAssets.get(after.id);
    if (!before) {
      // A remediation that adds an asset — a jump host, a diode — is a design change, not a
      // decision about something the sources found, and the document has no shape for it yet.
      unapplied.push(`${after.name}: adding an asset is not something this can record yet.`);
      continue;
    }

    const patch: AssetOverride = {};
    for (const field of ASSET_FIELDS) {
      if (after[field] !== before[field]) {
        Object.assign(patch, { [field]: after[field] });
      }
    }

    const controls: Partial<Asset["controls"]> = {};
    for (const key of Object.keys(before.controls) as Array<keyof Asset["controls"]>) {
      if (after.controls[key] !== before.controls[key]) {
        controls[key] = after.controls[key];
      }
    }
    if (Object.keys(controls).length > 0) {
      patch.controls = controls;
    }

    if (Object.keys(patch).length > 0) {
      assetOverrides[after.id] = patch;
    }
  }

  const beforeConnections = new Map(projected.connections.map((connection) => [connection.id, connection] as const));
  for (const after of simulated.conduits) {
    const before = beforeConnections.get(after.id);
    if (!before) {
      unapplied.push(`${after.name || after.id}: adding a conduit is not something this can record yet.`);
      continue;
    }

    const patch: ConnectionOverride = {};
    for (const field of CONNECTION_FIELDS) {
      if (after[field] !== before[field]) {
        Object.assign(patch, { [field]: after[field] });
      }
    }
    if (Object.keys(patch).length > 0) {
      connectionOverrides[after.id] = patch;
    }
  }

  return { assetOverrides, connectionOverrides, unapplied };
}

/** Merges a diff onto a document, keeping decisions the simulation did not touch. */
export function applyOverrideDiff(doc: CyberMapDocument, diff: OverrideDiff): CyberMapDocument {
  const assetOverrides = { ...doc.assetOverrides };
  for (const [id, patch] of Object.entries(diff.assetOverrides)) {
    const { controls, ...rest } = patch;
    assetOverrides[id] = {
      ...assetOverrides[id],
      ...rest,
      // Controls merge rather than replace, matching how the projection reads them: a remediation
      // that turns on MFA must not clear an allow-listing decision made last week.
      ...(controls ? { controls: { ...assetOverrides[id]?.controls, ...controls } } : {})
    };
  }

  const connectionOverrides = { ...doc.connectionOverrides };
  for (const [id, patch] of Object.entries(diff.connectionOverrides)) {
    connectionOverrides[id] = { ...connectionOverrides[id], ...patch };
  }

  return { ...doc, assetOverrides, connectionOverrides };
}
