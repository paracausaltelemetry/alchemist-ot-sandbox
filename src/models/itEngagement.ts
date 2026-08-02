import type { ImportFormat, ParsedImport } from "../import/types";
import type { Point } from "./types";

/**
 * The persisted IT-side document.
 *
 * Two layers, and the split is the whole design. Everything a scan produced — nodes, links,
 * subnets, the analysis — is **derived and disposable**: it is recomputed from the scans on every
 * load, so improving `synthesiseItTopology` improves every saved engagement. Everything the
 * operator authored — where they dragged a node, and later the links they drew and the actions
 * they recorded — is **preserved**, keyed by the stable node ids the synthesis mints.
 *
 * `ItMap` therefore stays derived and unchanged, and `synthesiseItTopology` stays a pure function
 * of `ParsedImport` with its existing tests intact. `projectEngagement` does the assembly.
 */

export const IT_ENGAGEMENT_SCHEMA_VERSION = 1;

/**
 * One imported scan, holding its own parse.
 *
 * Deliberately *not* concatenated into a single blob. `mergeHosts` would fold several parses
 * together correctly, and that is exactly the trap: it works, and it destroys which scan saw what.
 * An engagement record whose whole point is "what did I see, and when" cannot afford to lose that.
 */
/**
 * Where the scan was run from.
 *
 * A named external rather than a boolean, because real engagements run from a VPN, a dropbox on
 * the client LAN and the tester's own laptop, and what a segmentation finding means depends on
 * which. `node` is a host already on the map — the pivot case, where a compromised machine becomes
 * the place the next scan is run from.
 */
export type ItVantage = { kind: "external"; label: string } | { kind: "node"; nodeId: string };

export interface ItScan {
  id: string;
  /** Monotonic, assigned at import. Ordering is by this and never by a timestamp. */
  sequence: number;
  name: string;
  format: ImportFormat;
  vantage: ItVantage;
  parsed: ParsedImport;
  /** Cached so a scan list can be drawn without walking every parse. */
  hostCount: number;
}

export interface ItEngagement {
  schemaVersion: number;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  scans: ItScan[];
  /**
   * Only the nodes the operator actually dragged. A sparse override on top of the computed layout,
   * so a node that has never been moved follows the layout when the layout improves.
   */
  positions: Record<string, Point>;
}

export function newItEngagement(name = "Untitled engagement"): ItEngagement {
  const now = new Date().toISOString();
  return {
    schemaVersion: IT_ENGAGEMENT_SCHEMA_VERSION,
    id: `e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    createdAt: now,
    updatedAt: now,
    scans: [],
    positions: {}
  };
}

export const DEFAULT_VANTAGE: ItVantage = { kind: "external", label: "External" };

export function newItScan(parsed: ParsedImport, name: string, sequence: number, vantage: ItVantage = DEFAULT_VANTAGE): ItScan {
  return {
    id: `scan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    sequence,
    name,
    format: parsed.format,
    vantage,
    parsed,
    hostCount: parsed.hosts.length
  };
}

/** The next sequence number, so importing never reuses one even after a scan is removed. */
export function nextSequence(engagement: ItEngagement): number {
  return engagement.scans.reduce((highest, scan) => Math.max(highest, scan.sequence), 0) + 1;
}

export function vantageLabel(vantage: ItVantage, nameOf: (nodeId: string) => string | undefined): string {
  return vantage.kind === "external" ? vantage.label : (nameOf(vantage.nodeId) ?? vantage.nodeId);
}
