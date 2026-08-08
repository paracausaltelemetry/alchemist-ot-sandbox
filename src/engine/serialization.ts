import { PROJECT_SCHEMA_VERSION, type Asset, type Conduit, type OtProject, type Subnet, type ZoneId } from "../models/types";
import { blankProject } from "../data/sampleProject";

export type ValidationResult =
  | { ok: true; project: OtProject; errors: [] }
  | { ok: false; project: null; errors: string[] };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function validateAsset(value: unknown, index: number): string[] {
  const errors: string[] = [];
  if (!isObject(value)) {
    return [`Asset ${index + 1} must be an object.`];
  }
  for (const field of ["id", "name", "type", "zone"]) {
    if (!isString(value[field])) {
      errors.push(`Asset ${index + 1} is missing string field "${field}".`);
    }
  }
  if (!isObject(value.position) || typeof value.position.x !== "number" || typeof value.position.y !== "number") {
    errors.push(`Asset ${index + 1} is missing a numeric position.`);
  }
  if (!Array.isArray(value.protocols)) {
    errors.push(`Asset ${index + 1} protocols must be an array.`);
  }
  return errors;
}

function validateConduit(value: unknown, index: number): string[] {
  const errors: string[] = [];
  if (!isObject(value)) {
    return [`Conduit ${index + 1} must be an object.`];
  }
  for (const field of ["id", "source", "target", "name", "direction", "control", "firewallRule"]) {
    if (!isString(value[field])) {
      errors.push(`Conduit ${index + 1} is missing string field "${field}".`);
    }
  }
  return errors;
}

export function validateProject(input: unknown): ValidationResult {
  if (!isObject(input)) {
    return { ok: false, project: null, errors: ["Project JSON must contain an object."] };
  }

  const errors: string[] = [];
  if (input.schemaVersion !== 1 && input.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    errors.push(`Unsupported schema version. Expected 1 or ${PROJECT_SCHEMA_VERSION}.`);
  }
  if (!isString(input.id) || !isString(input.name)) {
    errors.push("Project requires string id and name fields.");
  }
  if (!Array.isArray(input.assets)) {
    errors.push("Project assets must be an array.");
  }
  if (!Array.isArray(input.conduits)) {
    errors.push("Project conduits must be an array.");
  }

  const assets = Array.isArray(input.assets) ? input.assets : [];
  const conduits = Array.isArray(input.conduits) ? input.conduits : [];

  assets.forEach((asset, index) => errors.push(...validateAsset(asset, index)));
  conduits.forEach((conduit, index) => errors.push(...validateConduit(conduit, index)));

  const assetIds = new Set<string>();
  for (const asset of assets) {
    if (isObject(asset) && isString(asset.id)) {
      if (assetIds.has(asset.id)) {
        errors.push(`Duplicate asset id "${asset.id}".`);
      }
      assetIds.add(asset.id);
    }
  }

  for (const conduit of conduits) {
    if (!isObject(conduit) || !isString(conduit.source) || !isString(conduit.target)) {
      continue;
    }
    if (!assetIds.has(conduit.source) || !assetIds.has(conduit.target)) {
      errors.push(`Conduit "${String(conduit.id)}" references a missing source or target asset.`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, project: null, errors };
  }

  return {
    ok: true,
    project: {
      ...(blankProject as OtProject),
      ...(input as unknown as OtProject),
      schemaVersion: PROJECT_SCHEMA_VERSION,
      assets: (input.assets as Asset[]).map(completeAsset),
      conduits: (input.conduits as Conduit[]).map(completeConduit),
      subnets: Array.isArray(input.subnets) ? (input.subnets as Subnet[]).map(completeSubnet) : [],
      assumptions: Array.isArray(input.assumptions) ? (input.assumptions as OtProject["assumptions"]) : blankProject.assumptions,
      updatedAt: new Date().toISOString()
    },
    errors: []
  };
}

export function parseProjectJson(json: string): ValidationResult {
  try {
    return validateProject(JSON.parse(json));
  } catch (error) {
    return {
      ok: false,
      project: null,
      errors: [error instanceof Error ? error.message : "Invalid JSON file."]
    };
  }
}

export function serializeProject(project: OtProject): string {
  return JSON.stringify({ ...project, schemaVersion: PROJECT_SCHEMA_VERSION, updatedAt: new Date().toISOString() }, null, 2);
}

function completeSubnet(subnet: Subnet): Subnet {
  return {
    id: String(subnet.id),
    name: subnet.name ?? "Subnet",
    cidr: subnet.cidr ?? "",
    vlan: subnet.vlan ?? ""
  };
}

function completeAsset(asset: Asset): Asset {
  const zone = normalizeZone(asset.zone, asset.type);
  return {
    ...asset,
    zone,
    // Free position is preserved verbatim — the Purdue lanes are a view (projectPurduePositions),
    // not the stored layout, so we no longer snap positions onto zone rows here.
    position: { x: Number(asset.position?.x) || 0, y: Number(asset.position?.y) || 0 },
    subnetId: typeof asset.subnetId === "string" ? asset.subnetId : undefined,
    protocols: Array.isArray(asset.protocols) ? asset.protocols : [],
    manufacturer: asset.manufacturer ?? "",
    model: asset.model ?? "",
    firmwareVersion: asset.firmwareVersion ?? "",
    lifecycleStatus: asset.lifecycleStatus ?? "unknown",
    siteArea: asset.siteArea ?? "",
    patchWindow: asset.patchWindow ?? "",
    backupStatus: asset.backupStatus ?? "unknown",
    criticalProcessTag: asset.criticalProcessTag ?? ""
  };
}

function normalizeZone(zone: string, assetType?: string): ZoneId {
  if (zone === "level5" || zone === "level4" || zone === "level3" || zone === "level2" || zone === "level1" || zone === "level0") {
    return zone;
  }
  if (zone === "level35") {
    return "level3";
  }
  if (zone === "safety" || assetType === "safety-system") {
    return "level1";
  }
  if (zone === "remote" || zone === "vendor" || assetType === "vendor-remote") {
    return "level5";
  }
  return "level3";
}

function completeConduit(conduit: Conduit): Conduit {
  return {
    ...conduit,
    protocol: conduit.protocol ?? "",
    port: conduit.port ?? "",
    protocolFamily: conduit.protocolFamily ?? "auto",
    ruleOwner: conduit.ruleOwner ?? "",
    businessJustification: conduit.businessJustification ?? "",
    reviewDate: conduit.reviewDate ?? "",
    expiryDate: conduit.expiryDate ?? "",
    monitoringSource: conduit.monitoringSource ?? "",
    inspectionPoint: conduit.inspectionPoint ?? "",
    temporaryAccess: conduit.temporaryAccess ?? false,
    businessCritical: conduit.businessCritical ?? false
  };
}
