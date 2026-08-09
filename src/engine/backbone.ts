import type { MapConnection } from "../models/cyberMap";

/**
 * The estate's backbone: what can reach what, at the level of segments rather than hosts.
 *
 * A scan of a /24 produces a cable per host, and drawing them all says almost nothing: everything
 * in a subnet reaches its gateway, which is what a subnet *is*. Twenty spurs fanning out of one
 * router is twenty repetitions of one fact, and it buries the facts that are not repetitions —
 * which router serves which segment, and which segments can reach each other.
 *
 * So the map folds them. Every cable between a device and a segment becomes one cable to the
 * segment; every cable *within* a segment disappears into the enclosure that already draws it. What
 * is left is the picture somebody actually wants from a scan: the routing kit, the segments, and
 * the lines between them.
 *
 * The underlying connections are not discarded. A folded cable names every link it stands for, so
 * selection, the inspector and the movement view continue to work on the real thing.
 */

/** How strong a cable's evidence is, strongest first — a fold is only as good as its best link. */
const EVIDENCE_RANK = ["traceroute", "observed-flow", "asserted", "attack", "same-subnet", "inferred"];

export interface BackboneCable {
  /** The strongest underlying connection, so selection lands on something real. */
  id: string;
  /** An asset id, or `subnet:<id>` when the end is a whole segment. */
  from: string;
  to: string;
  /** Every connection this stands for, strongest first. */
  members: MapConnection[];
  evidence: MapConnection["evidence"];
  trustBoundary: boolean;
}

const strongest = (connections: MapConnection[]) =>
  [...connections].sort(
    (a, b) =>
      EVIDENCE_RANK.indexOf(a.evidence) - EVIDENCE_RANK.indexOf(b.evidence) || a.id.localeCompare(b.id)
  );

/**
 * Folds connections down to segment-level backbones.
 *
 * `enclosureOf` returns the segment a device sits in, or undefined for the routing kit on the
 * spine — which is never folded away, because a router is a thing on the diagram rather than a
 * member of a segment.
 */
export function backboneOf(
  connections: MapConnection[],
  enclosureOf: (assetId: string) => string | undefined
): BackboneCable[] {
  const endOf = (assetId: string) => {
    const enclosure = enclosureOf(assetId);
    return enclosure ? `subnet:${enclosure}` : assetId;
  };

  const grouped = new Map<string, MapConnection[]>();
  for (const connection of connections) {
    const from = endOf(connection.source);
    const to = endOf(connection.target);
    // Both ends in the same segment: the enclosure already says these are on one wire, and drawing
    // it again inside the box is the clutter this exists to remove.
    if (from === to) {
      continue;
    }
    // Undirected: a cable between two segments is one cable however the scan happened to name it.
    const key = from < to ? `${from}|${to}` : `${to}|${from}`;
    grouped.set(key, [...(grouped.get(key) ?? []), connection]);
  }

  return [...grouped.entries()]
    .map(([key, members]) => {
      const ranked = strongest(members);
      const [from, to] = key.split("|");
      return {
        id: ranked[0].id,
        from,
        to,
        members: ranked,
        evidence: ranked[0].evidence,
        // One crossing is enough: if any folded link leaves its segment, the backbone does.
        trustBoundary: members.some((member) => member.trustBoundary)
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}
