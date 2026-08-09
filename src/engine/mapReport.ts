import { getZone, modelledZones } from "../data/catalog";
import { formatScanTime, scanTimeCaveat, type ScanTime } from "../import/scanTime";
import { importFormatLabels } from "../import/types";
import {
  ACCESS_LABELS,
  EVENT_KIND_LABELS,
  EXTERNAL_ORIGIN,
  vantageLabel,
  type ItAccessState,
  type ItEvent
} from "../models/itEngagement";
import { accessByNode, accessRank, longestAttackChain, orderedEvents } from "./itAccess";
import { asOtProject, projectMap } from "./mapProjection";
import { assessSecurityLevels } from "./securityLevels";
import { assessProject } from "./scoring";
import { exposureFromUntrusted } from "./reachability";
import type { CyberMapDocument, MapAsset, ProjectedMap } from "../models/cyberMap";
import type { Finding, ZoneId } from "../models/types";

/**
 * The engagement report over a converged estate.
 *
 * Descends from `buildItEngagementReport`, and keeps the two things that made it worth reading: the
 * summary is *computed from the stages* so a headline cannot contradict the timeline underneath it,
 * and what was looked for and not found is stated rather than left as silence.
 *
 * What is new is the OT vocabulary. The IT report could say "hmi-legacy was reached"; this one can
 * say it was reached in Supervisory Control, across a conduit whose permit rule nobody could
 * produce. That sentence is the entire reason for merging the two models, and neither of the old
 * documents could write it.
 *
 * Still deliberately no advisory score. A 0-100 posture number is an OT architecture judgement and
 * says nothing about an offensive engagement; printing one invites a comparison it cannot support.
 */

export interface MapReportStage {
  sequence: number;
  kind: "source" | "event";
  title: string;
  /** Rendered time, or the honest reason there isn't one. */
  when: string;
  detail: string[];
  /** Assets this stage put on the map for the first time. Imports only. */
  revealed: string[];
}

export interface MapReportAccessRow {
  assetId: string;
  name: string;
  address: string;
  /** Where it sits, which is the difference between an embarrassment and an incident. */
  zone: string;
  access: ItAccessState;
  grantedAtSequence: number;
  grantedBy: string;
}

export interface MapReportZone {
  zone: ZoneId;
  name: string;
  assets: number;
  target: number;
  achieved: number;
  modelled: boolean;
  /** Assets in this zone that were accessed during the engagement. */
  accessed: string[];
}

export interface MapReportCrossing {
  name: string;
  from: string;
  to: string;
  fromZone: string;
  toZone: string;
  firewallRule: string;
  evidence: string;
}

export interface MapReportProvenance {
  sequence: number;
  name: string;
  format: string;
  assetCount: number;
  vantage: string;
  when: string;
  timeSource: string;
}

export interface MapReport {
  name: string;
  generatedAt: string;
  summary: {
    assets: number;
    sources: number;
    vantages: string[];
    zonesInUse: number;
    highestAccess: ItAccessState;
    /** The reading the converged model exists to produce: how deep the access went. */
    deepestZoneReached: string | null;
    reachedButNotExternallyVisible: string[];
    chain: string[];
  };
  stages: MapReportStage[];
  access: MapReportAccessRow[];
  zones: MapReportZone[];
  crossings: MapReportCrossing[];
  findings: Finding[];
  provenance: MapReportProvenance[];
  negativeSpace: string[];
}

function whenOf(time: ScanTime | null, fallback: string): string {
  if (!time) {
    return fallback;
  }
  const caveat = scanTimeCaveat(time);
  return caveat ? `${formatScanTime(time)} (${caveat})` : formatScanTime(time);
}

function eventDetail(event: ItEvent, nameOf: (id?: string) => string): string[] {
  const detail: string[] = [EVENT_KIND_LABELS[event.kind]];
  if (event.targetNodeId) {
    detail.push(`${nameOf(event.sourceNodeId)} → ${nameOf(event.targetNodeId)}`);
  }
  if (event.grants) {
    detail.push(`Reached: ${ACCESS_LABELS[event.grants]}`);
  }
  if (event.cve) {
    detail.push(event.cve);
  }
  if (event.attackTechnique) {
    detail.push(event.attackTechnique);
  }
  if (event.note) {
    detail.push(event.note);
  }
  return detail;
}

/**
 * Which assets each import put on the map for the first time.
 *
 * Re-projects the document once per prefix of its sources, the same shape as `stageNodesByScan`,
 * and for the same reason: counting `parsed.hosts` disagrees with what is drawn, because a
 * traceroute names routers that are never host records. A stage claiming "8 newly revealed" beside
 * a summary saying 10 assets is an arithmetic hole a careful reader spots immediately, in the one
 * document where every number is supposed to reconcile.
 *
 * Only imported assets count. Re-projecting also materialises inferred gateways, and crediting an
 * import with finding a device that was reasoned about would undercut the document's whole claim.
 */
function revealedBySource(doc: CyberMapDocument): Map<number, string[]> {
  const ordered = [...doc.sources].sort((a, b) => a.sequence - b.sequence);
  const bySequence = new Map<number, string[]>();
  let seen = new Set<string>();

  for (const source of ordered) {
    const upTo: CyberMapDocument = {
      ...doc,
      sources: ordered.filter((entry) => entry.sequence <= source.sequence),
      events: []
    };
    const observed = new Set(
      projectMap(upTo)
        .assets.filter((asset) => asset.sourceIds.length > 0)
        .map((asset) => asset.id)
    );
    bySequence.set(source.sequence, [...observed].filter((id) => !seen.has(id)));
    seen = observed;
  }

  return bySequence;
}

export function buildMapReport(doc: CyberMapDocument): MapReport {
  const map: ProjectedMap = projectMap(doc);
  const project = asOtProject(doc, map);
  const assets = new Map(map.assets.map((asset) => [asset.id, asset] as const));
  const events = orderedEvents(doc.events);
  const sources = [...doc.sources].sort((a, b) => a.sequence - b.sequence);
  const access = accessByNode(events);

  const nameOf = (id?: string): string => {
    if (!id || id === EXTERNAL_ORIGIN) {
      return "outside the map";
    }
    return assets.get(id)?.name ?? id;
  };
  const zoneNameOf = (id?: string): string => (id && assets.get(id) ? getZone(assets.get(id)!.zone).name : "—");

  // --- Stages, imports and events interleaved by the sequence they share ------
  const revealed = revealedBySource(doc);
  const stages: MapReportStage[] = [];

  for (const source of sources) {
    const first = revealed.get(source.sequence) ?? [];
    stages.push({
      sequence: source.sequence,
      kind: "source",
      title: `Import: ${source.name}`,
      when: whenOf(source.time, "Time not recorded (import order)"),
      detail: [
        `Collected from ${vantageLabel(source.vantage, nameOf)}`,
        `${source.assetCount} host${source.assetCount === 1 ? "" : "s"} reported`,
        first.length > 0 ? `${first.length} newly revealed` : "Nothing new — every asset was already known"
      ],
      revealed: first.map(nameOf).sort()
    });
  }

  for (const event of events) {
    stages.push({
      sequence: event.sequence,
      kind: "event",
      title: event.title,
      when: whenOf(event.at, "Time not recorded (engagement order)"),
      detail: eventDetail(event, nameOf),
      revealed: []
    });
  }
  stages.sort((a, b) => a.sequence - b.sequence);

  // --- Access, each row tracing to the stage that granted it ------------------
  const grantedBy = new Map<string, ItEvent>();
  for (const event of events) {
    if (!event.targetNodeId || !event.grants) {
      continue;
    }
    const current = grantedBy.get(event.targetNodeId);
    // The first event that reached the rung the asset ended on, so the row cites the moment it was
    // won rather than the last time anything happened to it.
    if (!current || accessRank(event.grants) > accessRank(current.grants ?? "none")) {
      grantedBy.set(event.targetNodeId, event);
    }
  }

  const held = [...access.entries()].filter(([, state]) => accessRank(state) >= accessRank("credentialed"));

  const accessRows: MapReportAccessRow[] = held
    .map(([assetId, state]) => {
      const event = grantedBy.get(assetId);
      return {
        assetId,
        name: nameOf(assetId),
        address: assets.get(assetId)?.ipAddress ?? "",
        zone: zoneNameOf(assetId),
        access: state,
        grantedAtSequence: event?.sequence ?? 0,
        grantedBy: event?.title ?? "Not recorded"
      };
    })
    .sort((a, b) => accessRank(b.access) - accessRank(a.access) || a.name.localeCompare(b.name));

  // --- The OT reading: what the access meant in Purdue terms ------------------
  const securityLevels = assessSecurityLevels(project, project.zoneTargets);
  const accessedInZone = (zone: ZoneId) =>
    held
      .filter(([assetId]) => assets.get(assetId)?.zone === zone)
      .map(([assetId]) => nameOf(assetId))
      .sort();

  const zones: MapReportZone[] = modelledZones.map((zone) => {
    const signal = securityLevels.zones.find((entry) => entry.zone === zone.id);
    return {
      zone: zone.id,
      name: zone.name,
      assets: map.assets.filter((asset) => asset.zone === zone.id).length,
      target: signal?.target ?? 0,
      achieved: signal?.achieved ?? 0,
      modelled: signal?.modelled ?? false,
      accessed: accessedInZone(zone.id)
    };
  });

  // Lowest rank reached, because the process end is the consequence end. Named rather than ranked
  // in the output: "Supervisory Control" is a sentence a plant manager can act on, and "rank 3"
  // is not.
  const deepest = held
    .map(([assetId]) => assets.get(assetId))
    .filter((asset): asset is MapAsset => Boolean(asset))
    .reduce<MapAsset | null>(
      (lowest, asset) => (!lowest || getZone(asset.zone).riskRank < getZone(lowest.zone).riskRank ? asset : lowest),
      null
    );

  const crossings: MapReportCrossing[] = map.connections
    .filter((connection) => connection.trustBoundary)
    .map((connection) => ({
      name: connection.name || `${nameOf(connection.source)} → ${nameOf(connection.target)}`,
      from: nameOf(connection.source),
      to: nameOf(connection.target),
      fromZone: zoneNameOf(connection.source),
      toZone: zoneNameOf(connection.target),
      firewallRule: connection.firewallRule,
      evidence: connection.evidence
    }))
    .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));

  const assessment = assessProject(project);

  // --- Summary, every number derived from the sections above ------------------
  const exposure = exposureFromUntrusted(project);
  const reachedButNotExternallyVisible = held
    .filter(([assetId]) => exposure.get(assetId) !== 2)
    .map(([assetId]) => nameOf(assetId))
    .sort();

  const highestAccess = [...access.values()].reduce<ItAccessState>(
    (top, state) => (accessRank(state) > accessRank(top) ? state : top),
    "none"
  );

  // --- What was not found, said out loud -------------------------------------
  const negativeSpace: string[] = [];
  const imported = map.assets.filter((asset) => asset.sourceIds.length > 0);
  const untouched = imported.filter((asset) => !access.has(asset.id));
  if (untouched.length > 0) {
    negativeSpace.push(
      `${untouched.length} of ${imported.length} imported asset${imported.length === 1 ? "" : "s"} were not accessed: ${untouched
        .map((asset) => asset.name)
        .join(", ")}.`
    );
  }
  if (map.assets.some((asset) => asset.sourceIds.length === 0)) {
    negativeSpace.push(
      "Some assets on the map were inferred from addressing rather than observed, and nothing is claimed about them."
    );
  }
  const unmodelled = zones.filter((zone) => !zone.modelled);
  if (unmodelled.length > 0) {
    // An empty zone satisfies every 62443 ladder rung vacuously, so silence here would read as a
    // clean bill of health for the part of the estate nobody looked at.
    negativeSpace.push(
      `No assets were placed in ${unmodelled.map((zone) => zone.name).join(", ")}. Those levels are unassessed, not clear.`
    );
  }
  negativeSpace.push(
    "A scan reports what answered when it ran. It cannot show a service that was down, a host that dropped the probe, or anything on a segment no scan reached."
  );
  if (events.length === 0) {
    negativeSpace.push("No actions were recorded, so this document describes what was seen and not what was done.");
  }

  return {
    name: doc.name,
    generatedAt: new Date().toISOString(),
    summary: {
      assets: map.assets.length,
      sources: sources.length,
      vantages: [...new Set(sources.map((source) => vantageLabel(source.vantage, nameOf)))],
      zonesInUse: new Set(map.assets.map((asset) => asset.zone)).size,
      highestAccess,
      deepestZoneReached: deepest ? getZone(deepest.zone).name : null,
      reachedButNotExternallyVisible,
      chain: longestAttackChain(events).map(nameOf)
    },
    stages,
    access: accessRows,
    zones,
    crossings,
    findings: assessment.findings,
    provenance: sources.map((source) => ({
      sequence: source.sequence,
      name: source.name,
      format: importFormatLabels[source.format],
      assetCount: source.assetCount,
      vantage: vantageLabel(source.vantage, nameOf),
      when: whenOf(source.time, "Not recorded"),
      timeSource: source.time
        ? source.time.source === "file"
          ? "read from the import"
          : "entered by the operator"
        : "—"
    })),
    negativeSpace
  };
}
