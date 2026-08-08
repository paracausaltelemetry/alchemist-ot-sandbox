import { accessByNode, accessRank, longestAttackChain, orderedEvents } from "./itAccess";
import { projectEngagement } from "./itProjection";
import type { ItAnalysis } from "./itAnalysis";
import { formatScanTime, scanTimeCaveat, type ScanTime } from "../import/scanTime";
import {
  ACCESS_LABELS,
  EVENT_KIND_LABELS,
  EXTERNAL_ORIGIN,
  vantageLabel,
  type ItAccessState,
  type ItEngagement,
  type ItEvent
} from "../models/itEngagement";
import { stageNodesByScan } from "./itStageNodes";
import type { ItMap, ItNode } from "../models/itMap";
import { importFormatLabels } from "../import/types";

/**
 * The engagement report as a structure, built once and rendered twice.
 *
 * Everything in the summary is *computed from the stages* rather than written separately, so the
 * headline cannot end up contradicting the timeline underneath it — which is the failure mode of
 * every report with a hand-written executive summary.
 *
 * Deliberately no advisory score. A 0-100 posture number is an OT architecture judgement and means
 * nothing about an offensive engagement; printing one here would invite exactly the comparison it
 * cannot support.
 */

export interface ItReportStage {
  sequence: number;
  kind: "scan" | "event";
  title: string;
  /** Rendered time, or the honest reason there isn't one. */
  when: string;
  /** One line of detail per renderer-agnostic fact about this stage. */
  detail: string[];
  /** Hosts this stage put on the map for the first time. Scans only. */
  revealed: string[];
}

export interface ItReportAccessRow {
  nodeId: string;
  name: string;
  address: string;
  access: ItAccessState;
  /** The stage that first reached this rung, so every claim traces to an entry. */
  grantedAtSequence: number;
  grantedBy: string;
}

export interface ItReportFinding {
  host: string;
  service: string;
  severity: string;
  reason: string;
  /**
   * Stages that acted on **this host**, which is what separates a finding from a scanner line.
   *
   * Host-level, not service-level: the journal records that a host was compromised, not which of
   * its open ports was the way in. Saying "exploited" beside a specific port would assert something
   * the record does not contain, so the renderers label this "Acted on at" instead.
   */
  actedOnAt: string[];
}

export interface ItReportProvenance {
  sequence: number;
  name: string;
  format: string;
  hostCount: number;
  vantage: string;
  when: string;
  timeSource: string;
}

export interface ItEngagementReport {
  name: string;
  generatedAt: string;
  summary: {
    hosts: number;
    scans: number;
    vantages: string[];
    highestAccess: ItAccessState;
    /** Hosts reached that no externally routable address would have shown. The pivot's whole value. */
    reachedButNotExternallyVisible: string[];
    chain: string[];
  };
  stages: ItReportStage[];
  access: ItReportAccessRow[];
  findings: ItReportFinding[];
  provenance: ItReportProvenance[];
  /** What was looked for and not found, stated rather than left as silence. */
  negativeSpace: string[];
  map: ItMap | null;
  analysis: ItAnalysis | null;
}

function whenOf(time: ScanTime | null, fallback: string): string {
  if (!time) {
    return fallback;
  }
  const caveat = scanTimeCaveat(time);
  return caveat ? `${formatScanTime(time)} (${caveat})` : formatScanTime(time);
}

const nameOf = (nodes: Map<string, ItNode>, id?: string): string => {
  if (!id || id === EXTERNAL_ORIGIN) {
    return "outside the map";
  }
  return nodes.get(id)?.name ?? id;
};

function eventDetail(event: ItEvent, nodes: Map<string, ItNode>): string[] {
  const detail: string[] = [EVENT_KIND_LABELS[event.kind]];
  if (event.targetNodeId) {
    detail.push(`${nameOf(nodes, event.sourceNodeId)} → ${nameOf(nodes, event.targetNodeId)}`);
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

export function buildItEngagementReport(engagement: ItEngagement): ItEngagementReport {
  const { map, analysis } = projectEngagement(engagement);
  const nodes = new Map((map?.nodes ?? []).map((node) => [node.id, node] as const));
  const events = orderedEvents(engagement.events);
  const scans = [...engagement.scans].sort((a, b) => a.sequence - b.sequence);
  const access = accessByNode(events);

  // --- Stages, scans and events interleaved by the sequence they share --------
  const stageNodes = stageNodesByScan(engagement);
  const stages: ItReportStage[] = [];

  for (const scan of scans) {
    const revealed = [...(stageNodes.get(scan.sequence)?.revealed ?? [])];
    stages.push({
      sequence: scan.sequence,
      kind: "scan",
      title: `Scan: ${scan.name}`,
      when: whenOf(scan.time, "Time not recorded (import order)"),
      detail: [
        `Run from ${vantageLabel(scan.vantage, (id) => nodes.get(id)?.name)}`,
        `${scan.hostCount} host${scan.hostCount === 1 ? "" : "s"} reported`,
        revealed.length > 0
          ? `${revealed.length} newly revealed`
          : "Nothing new — every host was already known"
      ],
      revealed: revealed.map((id) => nameOf(nodes, id))
    });
  }

  for (const event of events) {
    stages.push({
      sequence: event.sequence,
      kind: "event",
      title: event.title,
      when: whenOf(event.at, "Time not recorded (engagement order)"),
      detail: eventDetail(event, nodes),
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
    // The first event that reached the rung the host ended on, so the row cites the moment it
    // was won rather than the last time anything happened to that host.
    if (!current || accessRank(event.grants) > accessRank(current.grants ?? "none")) {
      grantedBy.set(event.targetNodeId, event);
    }
  }

  const accessRows: ItReportAccessRow[] = [...access.entries()]
    .filter(([, state]) => accessRank(state) >= accessRank("credentialed"))
    .map(([nodeId, state]) => {
      const event = grantedBy.get(nodeId);
      return {
        nodeId,
        name: nameOf(nodes, nodeId),
        address: nodes.get(nodeId)?.ip ?? "",
        access: state,
        grantedAtSequence: event?.sequence ?? 0,
        grantedBy: event?.title ?? "Not recorded"
      };
    })
    .sort((a, b) => accessRank(b.access) - accessRank(a.access) || a.name.localeCompare(b.name));

  // --- Findings, cross-referenced to what was actually done with them ---------
  const actedOnByAddress = new Map<string, string[]>();
  for (const event of events) {
    const address = event.targetNodeId ? nodes.get(event.targetNodeId)?.ip : undefined;
    if (!address) {
      continue;
    }
    actedOnByAddress.set(address, [...(actedOnByAddress.get(address) ?? []), `Stage ${event.sequence}: ${event.title}`]);
  }

  const findings: ItReportFinding[] = (analysis?.riskyServices ?? []).map((service) => ({
    host: service.hostname ? `${service.ip} (${service.hostname})` : service.ip,
    service: `${service.port}/${service.transport ?? "tcp"} ${service.service ?? ""}`.trim(),
    severity: service.severity,
    reason: service.reason,
    actedOnAt: actedOnByAddress.get(service.ip) ?? []
  }));

  // --- Summary, every number derived from the stages above --------------------
  // Taken from the analysis rather than recomputed from addressing, so the report's headline claim
  // and its findings table cannot disagree about which hosts were reachable from outside.
  const externalAddresses = new Set((analysis?.externallyReachable ?? []).map((host) => host.ip));
  const externallyVisible = new Set(
    (map?.nodes ?? []).filter((node) => node.ip && externalAddresses.has(node.ip)).map((node) => node.id)
  );
  const reachedButNotExternallyVisible = [...access.entries()]
    .filter(([nodeId, state]) => accessRank(state) >= accessRank("credentialed") && !externallyVisible.has(nodeId))
    .map(([nodeId]) => nameOf(nodes, nodeId))
    .sort();

  const highestAccess = [...access.values()].reduce<ItAccessState>(
    (top, state) => (accessRank(state) > accessRank(top) ? state : top),
    "none"
  );

  // --- What was not found, said out loud -------------------------------------
  const negativeSpace: string[] = [];
  const scanned = (map?.nodes ?? []).filter((node) => node.origin === "scanned");
  const untouched = scanned.filter((node) => !access.has(node.id));
  if (untouched.length > 0) {
    negativeSpace.push(
      `${untouched.length} of ${scanned.length} scanned host${scanned.length === 1 ? "" : "s"} were not accessed: ${untouched
        .map((node) => node.name)
        .join(", ")}.`
    );
  }
  if ((map?.nodes ?? []).some((node) => node.origin === "synthetic")) {
    negativeSpace.push(
      "Some devices on the map were inferred from addressing rather than scanned, and nothing is claimed about them."
    );
  }
  negativeSpace.push(
    "A port scan reports what answered when it ran. It cannot show a service that was down, a host that dropped the probe, or anything on a segment no scan reached."
  );
  if (events.length === 0) {
    negativeSpace.push("No actions were recorded, so this document describes what was seen and not what was done.");
  }

  return {
    name: engagement.name,
    generatedAt: new Date().toISOString(),
    summary: {
      hosts: scanned.length,
      scans: scans.length,
      vantages: [...new Set(scans.map((scan) => vantageLabel(scan.vantage, (id) => nodes.get(id)?.name)))],
      highestAccess,
      reachedButNotExternallyVisible,
      chain: longestAttackChain(events).map((id) => nameOf(nodes, id))
    },
    stages,
    access: accessRows,
    findings,
    provenance: scans.map((scan) => ({
      sequence: scan.sequence,
      name: scan.name,
      format: importFormatLabels[scan.format],
      hostCount: scan.hostCount,
      vantage: vantageLabel(scan.vantage, (id) => nodes.get(id)?.name),
      when: whenOf(scan.time, "Not recorded"),
      timeSource: scan.time ? (scan.time.source === "file" ? "read from the scan file" : "entered by the operator") : "—"
    })),
    negativeSpace,
    map,
    analysis
  };
}
