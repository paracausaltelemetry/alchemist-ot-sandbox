import { analyseItNetwork, type ItAnalysis } from "./itAnalysis";
import { synthesiseItTopology } from "./itTopology";
import { layoutItMap } from "../data/itLayout";
import type { ItEngagement } from "../models/itEngagement";
import type { ItMap } from "../models/itMap";
import type { ParsedImport } from "../import/types";

/**
 * Rebuilds everything derived from an engagement's scans, then re-applies the authored layer.
 *
 * Re-synthesis rather than merging maps, because four decisions inside `synthesiseItTopology` are
 * global rather than per host: one gateway is chosen per subnet from all of its members, the uplink
 * root is a single global choice, the internet cloud is materialised only if any host is public,
 * and tier promotion mutates in place. Merging two drawn maps would have to reimplement all four,
 * leaving two code paths that compute topology and one of them wrong.
 */
export interface ItProjection {
  map: ItMap | null;
  analysis: ItAnalysis | null;
  /** The scans folded into one parse, which is what the analysis lens consumes. */
  parsed: ParsedImport | null;
}

/**
 * Concatenates the engagement's scans, in sequence order, into one parse.
 *
 * Deliberately only a concatenation. The real merge — folding two records of the same host into
 * one, resolving a hostname-only sighting against an address seen elsewhere, deciding which scan's
 * answer wins — happens in `mergeHosts` inside `synthesiseItTopology`, where it already had to
 * exist for duplicates within a single scan. Doing it here as well would give two implementations
 * of the same rule, and the one that ran second would quietly win.
 *
 * Order matters because the merge is last-non-empty-wins: the newest scan's answer is the one kept.
 */
export function mergedParse(engagement: ItEngagement): ParsedImport | null {
  const ordered = [...engagement.scans].sort((a, b) => a.sequence - b.sequence);
  if (ordered.length === 0) {
    return null;
  }
  if (ordered.length === 1) {
    return ordered[0].parsed;
  }
  return {
    format: ordered[ordered.length - 1].parsed.format,
    hosts: ordered.flatMap((scan) => scan.parsed.hosts),
    flows: ordered.flatMap((scan) => scan.parsed.flows),
    warnings: ordered.flatMap((scan) => scan.parsed.warnings),
    traces: ordered.flatMap((scan) => scan.parsed.traces ?? [])
  };
}

export function projectEngagement(engagement: ItEngagement): ItProjection {
  const parsed = mergedParse(engagement);
  if (!parsed) {
    return { map: null, analysis: null, parsed: null };
  }

  const synthesised = synthesiseItTopology(parsed);
  const computed = layoutItMap(synthesised.nodes, synthesised.links, synthesised.subnets);

  // Authored positions win over the computed layout, but only for nodes that were actually moved.
  // A node the operator has never touched follows the layout, so improving the layout improves
  // every saved engagement rather than being overridden by a stale snapshot of the old one.
  const map: ItMap = {
    ...synthesised,
    nodes: synthesised.nodes.map((node) => ({
      ...node,
      position: engagement.positions[node.id] ?? computed.get(node.id) ?? node.position
    }))
  };

  return { map, analysis: analyseItNetwork(parsed), parsed };
}
