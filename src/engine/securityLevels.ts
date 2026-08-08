import { getZone, modelledZones } from "../data/catalog";
import { protocolLacksNativeSecurity } from "../data/protocols";
import type { Asset, Conduit, OtProject, ZoneId } from "../models/types";

/**
 * ISA/IEC 62443 Security Level model.
 *
 * Each zone has a target Security Level (SL-T) and an architecture-derived signal from the
 * zone's declared controls and boundary conduits, mapped to the seven Foundational Requirements
 * (62443-3-3 FR1–FR7). The signal is capped by its weakest modeled FR. It is deliberately not
 * presented as a formal SL-A because this tool cannot validate every applicable system
 * requirement, requirement enhancement, compensating control, or evidence artifact.
 */

export type FoundationalRequirement = "FR1" | "FR2" | "FR3" | "FR4" | "FR5" | "FR6" | "FR7";

export const MAX_SL = 3;

export const foundationalRequirements: Array<{ id: FoundationalRequirement; label: string }> = [
  { id: "FR1", label: "Identification & authentication control" },
  { id: "FR2", label: "Use control" },
  { id: "FR3", label: "System integrity" },
  { id: "FR4", label: "Data confidentiality" },
  { id: "FR5", label: "Restricted data flow" },
  { id: "FR6", label: "Timely response to events" },
  { id: "FR7", label: "Resource availability" }
];

export interface ZoneSecurityLevel {
  zone: ZoneId;
  target: number;
  achieved: number;
  frLevels: Record<FoundationalRequirement, number>;
  limiting: FoundationalRequirement[];
  /**
   * False when the project declares no assets in this zone. Every FR ladder is built from
   * `Array.every`, which is vacuously true on an empty population — so an unmodelled zone used to
   * report a perfect SL 3 and read as a strength. Absence of evidence is not evidence of control.
   */
  modelled: boolean;
}

export interface SecurityLevelAssessment {
  zones: ZoneSecurityLevel[];
}

const HOST_TYPES = new Set<Asset["type"]>([
  "enterprise-it",
  "jump-host",
  "historian",
  "engineering-workstation",
  "hmi",
  "scada",
  "vendor-remote",
  "cloud-service"
]);

const CONTROL_HOST_TYPES = new Set<Asset["type"]>(["historian", "engineering-workstation", "hmi", "scada"]);

// FR4 is data confidentiality, so the rung asks whether the protocol carries any of its own.
// `protocolLacksNativeSecurity` is the one place that answers; this file used to keep its own list.

/** Asset classes that run a general-purpose OS, so account controls like MFA apply to them. */
export const isHost = (asset: Asset) => HOST_TYPES.has(asset.type);
const isControlHost = (asset: Asset) => CONTROL_HOST_TYPES.has(asset.type);
const isControlZone = (zone: ZoneId) => getZone(zone).riskRank <= 3;
const isEnterpriseZone = (zone: ZoneId) => getZone(zone).riskRank >= 6;

/** Suggested starting SL-T by Purdue position; the assessor must confirm it through risk assessment. */
export function defaultTargetSL(zone: ZoneId): number {
  const rank = getZone(zone).riskRank;
  if (rank <= 3) {
    return 3;
  }
  if (rank <= 4) {
    return 2;
  }
  return 1;
}

/** Consecutive satisfied rungs from the bottom of a ladder (stops at the first gap). */
function ladderLevel(rungs: boolean[]): number {
  let level = 0;
  for (const ok of rungs) {
    if (!ok) {
      break;
    }
    level += 1;
  }
  return level;
}

function every<T>(items: T[], predicate: (item: T) => boolean): boolean {
  return items.every(predicate);
}

function hasLegacyCleartext(asset: Asset): boolean {
  return asset.protocols.some(protocolLacksNativeSecurity);
}

function frLevelsForZone(zone: ZoneId, project: OtProject): Record<FoundationalRequirement, number> {
  const zoneOf = new Map(project.assets.map((asset) => [asset.id, asset.zone]));
  const zoneAssets = project.assets.filter((asset) => asset.zone === zone);
  const hosts = zoneAssets.filter(isHost);
  const controlHosts = zoneAssets.filter(isControlHost);
  const critical = zoneAssets.filter((asset) => asset.criticality === "critical");
  const safety = zoneAssets.filter((asset) => asset.type === "safety-system");
  const vendor = zoneAssets.filter((asset) => asset.type === "vendor-remote");

  // Conduits that cross this zone's boundary (exactly one endpoint inside the zone).
  const crossing = project.conduits.filter((conduit: Conduit) => {
    const inSource = zoneOf.get(conduit.source) === zone;
    const inTarget = zoneOf.get(conduit.target) === zone;
    return inSource !== inTarget;
  });
  const directFromEnterprise = crossing.some((conduit) => {
    const otherZone = zoneOf.get(conduit.source) === zone ? zoneOf.get(conduit.target) : zoneOf.get(conduit.source);
    return otherZone !== undefined && isEnterpriseZone(otherZone) && isControlZone(zone);
  });

  return {
    FR1: ladderLevel([
      every(
        zoneAssets.filter((asset) => asset.type !== "field-device"),
        (asset) => asset.controls.defaultCredentialsDisabled
      ),
      every(hosts, (asset) => asset.controls.mfa),
      every(zoneAssets, (asset) => asset.controls.defaultCredentialsDisabled)
    ]),
    FR2: ladderLevel([
      every(crossing, (conduit) => conduit.firewallRule !== "any-any"),
      every(controlHosts, (asset) => asset.controls.allowListing) && every(vendor, (asset) => asset.controls.remoteAccessApproved),
      every(crossing, (conduit) => conduit.firewallRule === "explicit")
    ]),
    FR3: ladderLevel([
      every(zoneAssets, (asset) => asset.lifecycleStatus !== "obsolete"),
      every(hosts, (asset) => asset.controls.endpointProtection),
      every(
        zoneAssets.filter((asset) => asset.type !== "field-device"),
        (asset) => asset.controls.patchingProgram
      )
    ]),
    FR4: ladderLevel([
      every(crossing, (conduit) => conduit.encrypted),
      every(zoneAssets, (asset) => !hasLegacyCleartext(asset)),
      every(crossing, (conduit) => conduit.inspected)
    ]),
    FR5: ladderLevel([
      every(crossing, (conduit) => conduit.control !== "routed"),
      !directFromEnterprise,
      every(crossing, (conduit) => conduit.direction !== "bidirectional")
    ]),
    FR6: ladderLevel([
      every(crossing, (conduit) => conduit.logged),
      every(zoneAssets, (asset) => asset.controls.networkMonitoring),
      every(crossing, (conduit) => conduit.inspected) && every(hosts, (asset) => asset.controls.centralLogging)
    ]),
    FR7: ladderLevel([
      every(critical, (asset) => asset.controls.backups),
      every(safety, (asset) => asset.controls.safetyValidated),
      every(critical, (asset) => asset.backupStatus === "verified")
    ])
  };
}

/**
 * Calculates every zone's indicative architecture signal against its target. `zoneTargets`
 * overrides the suggested per-zone SL-T where provided.
 */
export function assessSecurityLevels(project: OtProject, zoneTargets?: Partial<Record<ZoneId, number>>): SecurityLevelAssessment {
  return {
    zones: modelledZones.map((zone) => {
      const frLevels = frLevelsForZone(zone.id, project);
      const target = zoneTargets?.[zone.id] ?? defaultTargetSL(zone.id);
      const modelled = project.assets.some((asset) => asset.zone === zone.id);

      // A zone with no declared assets has an empty population for every ladder rung, so the
      // ladder is vacuously satisfied. Report it as unmodelled rather than as a perfect score.
      if (!modelled) {
        return { zone: zone.id, target, achieved: 0, frLevels, limiting: [], modelled: false };
      }

      const achieved = Math.min(...foundationalRequirements.map((fr) => frLevels[fr.id]));
      const limiting = foundationalRequirements.filter((fr) => frLevels[fr.id] === achieved).map((fr) => fr.id);
      return { zone: zone.id, target, achieved, frLevels, limiting, modelled: true };
    })
  };
}
