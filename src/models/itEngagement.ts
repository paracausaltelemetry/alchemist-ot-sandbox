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
export interface ItScan {
  id: string;
  /** Monotonic, assigned at import. Ordering is by this and never by a timestamp. */
  sequence: number;
  name: string;
  format: ImportFormat;
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

export function newItScan(parsed: ParsedImport, name: string, sequence: number): ItScan {
  return {
    id: `scan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    sequence,
    name,
    format: parsed.format,
    parsed,
    hostCount: parsed.hosts.length
  };
}
