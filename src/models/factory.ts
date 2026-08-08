import { getAssetType } from "../data/catalog";
import type { Asset, AssetTypeId, Conduit, Point, ZoneId } from "./types";

/** Stable-ish unique id. Works in the browser and in the node test runner (no `window`). */
export function makeId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) {
    return `${prefix}-${uuid.slice(0, 8)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createAsset(typeId: AssetTypeId, position: Point, zone?: ZoneId): Asset {
  const type = getAssetType(typeId);
  return {
    id: makeId("asset"),
    name: type.label,
    type: type.id,
    zone: zone ?? type.defaultZone,
    ipAddress: "",
    vlan: "",
    protocols: [...type.baseProtocols],
    criticality: type.id === "plc-rtu" || type.id === "safety-system" ? "critical" : "medium",
    owner: "",
    notes: "",
    position,
    controls: {
      mfa: false,
      allowListing: false,
      endpointProtection: false,
      patchingProgram: false,
      backups: false,
      defaultCredentialsDisabled: false,
      networkMonitoring: false,
      centralLogging: false,
      remoteAccessApproved: false,
      safetyValidated: type.id === "safety-system"
    },
    manufacturer: "",
    model: "",
    firmwareVersion: "",
    lifecycleStatus: "unknown",
    siteArea: "",
    patchWindow: "",
    backupStatus: "unknown",
    criticalProcessTag: ""
  };
}

export function createConduit(source: string, target: string): Conduit {
  return {
    id: makeId("conduit"),
    source,
    target,
    name: "New conduit",
    protocol: "HTTPS",
    port: "443",
    protocolFamily: "auto",
    direction: "source-to-target",
    control: "firewalled",
    firewallRule: "explicit",
    trustBoundary: true,
    inspected: false,
    logged: false,
    encrypted: true,
    jumpHostRequired: false,
    ruleOwner: "",
    businessJustification: "",
    reviewDate: "",
    expiryDate: "",
    monitoringSource: "",
    inspectionPoint: "",
    temporaryAccess: false,
    businessCritical: false,
    notes: ""
  };
}
