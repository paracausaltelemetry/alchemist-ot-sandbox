import type { ImportFormat, ParsedImport } from "../import/types";
import type { ScanTime } from "../import/scanTime";
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
 * Where the scan was run from.
 *
 * A named external rather than a boolean, because real engagements run from a VPN, a dropbox on
 * the client LAN and the tester's own laptop, and what a segmentation finding means depends on
 * which. `node` is a host already on the map — the pivot case, where a compromised machine becomes
 * the place the next scan is run from.
 */
export type ItVantage = { kind: "external"; label: string } | { kind: "node"; nodeId: string };

/**
 * One imported scan, holding its own parse.
 *
 * Deliberately *not* concatenated into a single blob. `mergeHosts` would fold several parses
 * together correctly, and that is exactly the trap: it works, and it destroys which scan saw what.
 * An engagement record whose whole point is "what did I see, and when" cannot afford to lose that.
 */
export interface ItScan {
  id: string;
  /** Monotonic, assigned at import. Ordering is by this and never by a timestamp. */
  sequence: number;
  name: string;
  format: ImportFormat;
  vantage: ItVantage;
  /**
   * When the scan ran, if it can be known. `null` is a real answer and stays visible as one:
   * a stage that prints "time not recorded" is honest, and a stage stamped with the moment the
   * file happened to be imported is not.
   */
  time: ScanTime | null;
  parsed: ParsedImport;
  /** Cached so a scan list can be drawn without walking every parse. */
  hostCount: number;
}

/**
 * A link the operator drew.
 *
 * Part of the authored layer, so it survives re-synthesis and is keyed by the same stable node ids
 * the scans mint. A link whose endpoints are gone — because the scan that found them was removed —
 * is dropped with a warning rather than treated as corruption: it is the ordinary consequence of
 * editing the evidence, and refusing to load would make removing a scan unrecoverable.
 */
export interface ItUserLink {
  id: string;
  source: string;
  target: string;
  label?: string;
  note?: string;
}

/**
 * The `link:` prefix is load-bearing, not decorative. Selection carries one id for both nodes and
 * links, and `isItLinkId` is what tells them apart — an authored link keyed on anything else is
 * selectable on the canvas but invisible in the inspector, which is exactly the bug that prefix
 * convention exists to prevent. `user:` keeps it from colliding with a derived `link:a->b`.
 */
export function newItUserLink(source: string, target: string, label?: string, note?: string): ItUserLink {
  return { id: `link:user:${source}->${target}`, source, target, label, note };
}

export interface ItEngagement {
  schemaVersion: number;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  scans: ItScan[];
  /** Links the operator drew. Kept apart from the scans because nothing derived them. */
  userLinks: ItUserLink[];
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
    userLinks: [],
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
    time: parsed.startedAt ?? null,
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
