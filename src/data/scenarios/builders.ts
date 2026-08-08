import { layoutTiered } from "../canvasLayout";
import type { Asset, AssetTypeId, Conduit, OtProject, ZoneId } from "../../models/types";

/** Metadata wrapper for a ready-to-load scenario shown in the scenario gallery. */
export interface ScenarioMeta {
  id: string;
  name: string;
  sector: string;
  summary: string;
  standards: string[];
  project: OtProject;
}

/** Reusable control postures so scenarios can express a realistic spread of maturity. */
export const controls = {
  strong: {
    mfa: true,
    allowListing: true,
    endpointProtection: true,
    patchingProgram: true,
    backups: true,
    defaultCredentialsDisabled: true,
    networkMonitoring: true,
    centralLogging: true,
    remoteAccessApproved: true,
    safetyValidated: true
  },
  moderate: {
    mfa: true,
    allowListing: false,
    endpointProtection: true,
    patchingProgram: true,
    backups: true,
    defaultCredentialsDisabled: true,
    networkMonitoring: true,
    centralLogging: false,
    remoteAccessApproved: true,
    safetyValidated: false
  },
  weak: {
    mfa: false,
    allowListing: false,
    endpointProtection: false,
    patchingProgram: false,
    backups: false,
    defaultCredentialsDisabled: false,
    networkMonitoring: false,
    centralLogging: false,
    remoteAccessApproved: false,
    safetyValidated: false
  }
} satisfies Record<string, Asset["controls"]>;

export const conduitDefaults = {
  protocolFamily: "auto" as const,
  ruleOwner: "OT network owner",
  businessJustification: "Documented operational requirement",
  reviewDate: "",
  expiryDate: "",
  monitoringSource: "",
  inspectionPoint: "",
  temporaryAccess: false,
  businessCritical: false
};

/** Default Y per Purdue zone — keeps a scenario tidy in both Network and Purdue views. */
export const laneY: Record<ZoneId, number> = {
  level5: -3,
  level4: 115,
  level3: 233,
  level2: 351,
  level1: 469,
  level0: 587
};

export function asset(
  id: string,
  name: string,
  type: AssetTypeId,
  zone: ZoneId,
  x: number,
  y: number,
  overrides: Partial<Asset> = {}
): Asset {
  return {
    id,
    name,
    type,
    zone,
    ipAddress: "",
    vlan: "",
    protocols: [],
    criticality: "medium",
    owner: "OT operations",
    notes: "",
    position: { x, y },
    controls: controls.moderate,
    manufacturer: "",
    model: "",
    firmwareVersion: "",
    lifecycleStatus: "unknown",
    siteArea: "",
    patchWindow: "",
    backupStatus: "unknown",
    criticalProcessTag: "",
    ...overrides
  };
}

/**
 * Re-positions a project's assets into the tidy tiered network layout. Authored x/y in
 * the scenario files become irrelevant — the layout is derived from each asset's zone and
 * subnet, and the conduit graph decides ordering so connected assets sit near each other.
 */
export function applyLayout(project: OtProject): OtProject {
  const positions = layoutTiered(project.assets, project.subnets ?? [], project.conduits);
  return {
    ...project,
    assets: project.assets.map((asset) => ({ ...asset, position: positions.get(asset.id) ?? asset.position }))
  };
}

/** Terse conduit factory: fills the verbose Conduit shape with sensible defaults. */
export function conduit(
  id: string,
  source: string,
  target: string,
  name: string,
  overrides: Partial<Conduit> = {}
): Conduit {
  return {
    ...conduitDefaults,
    id,
    source,
    target,
    name,
    protocol: "",
    port: "",
    direction: "source-to-target",
    control: "firewalled",
    firewallRule: "explicit",
    trustBoundary: false,
    inspected: false,
    logged: false,
    encrypted: false,
    jumpHostRequired: false,
    notes: "",
    ...overrides
  };
}
