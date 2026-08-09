import { accessByNode, accessRank } from "./itAccess";
import type { MapAsset, ProjectedMap } from "../models/cyberMap";
import type { ItAccessState, ItEvent } from "../models/itEngagement";

/**
 * What a foothold opens up.
 *
 * The assessment engines answer "how exposed is this estate" from an assumed untrusted starting
 * point. That is the defender's question. Someone working through an enumeration has a different
 * one, and it is concrete: *I am on this box — what can I see from here, and which of it is new?*
 *
 * Deliberately not reachability-with-risk. No severities, no scoring, no advice. A movement view
 * that editorialises about what is worth taking is a view somebody stops trusting the moment it is
 * wrong about their target. This says what the map implies is adjacent, marks how confident the
 * evidence for each hop is, and stops.
 */

export interface MovementHop {
  assetId: string;
  /** Hops from the foothold. 1 is directly adjacent. */
  distance: number;
  /** Weakest evidence on the route here. A route is only as good as its worst hop. */
  weakestEvidence: HopEvidence;
  /** Access already held on this asset, if the journal records any. */
  access: ItAccessState;
}

export interface MovementView {
  fromId: string | null;
  /** Everything reachable, nearest first. Excludes the foothold. */
  hops: MovementHop[];
  /** Assets the map holds that this foothold does not reach at all. */
  unreachable: string[];
}

/**
 * How good a hop is, strongest first.
 *
 * `same-subnet` is its own grade rather than being folded into `inferred`. The projection already
 * treats them differently and it is right to: "these two answered on the same wire" is a structural
 * fact about addressing, while "we invented a gateway to join these subnets" is our reasoning.
 * Collapsing them made every hop on a flat network read as a guess, which is both wrong and
 * useless — a list where every line says the same thing is a list nobody reads.
 */
export type HopEvidence = "observed" | "asserted" | "same-subnet" | "inferred";

const GRADE: Record<string, HopEvidence> = {
  traceroute: "observed",
  "observed-flow": "observed",
  // An operator's own line and their own recorded action are both assertions about the network a
  // scan did not make, and both outrank our reasoning about addressing.
  asserted: "asserted",
  attack: "asserted",
  "same-subnet": "same-subnet",
  inferred: "inferred"
};

const evidenceOf = (evidence: string): HopEvidence => GRADE[evidence] ?? "inferred";

const WEAKER: Record<HopEvidence, number> = { observed: 0, asserted: 1, "same-subnet": 2, inferred: 3 };

/**
 * Breadth-first from one asset over the map's connections.
 *
 * Undirected on purpose. `direction` on a connection records which way traffic was *observed*, and
 * an operator standing on one end of a cable is not stopped by that. Treating it as a constraint
 * would hide exactly the paths this view exists to show.
 */
export function movementFrom(map: ProjectedMap, fromId: string | null, events: ItEvent[] = []): MovementView {
  if (!fromId || !map.assets.some((asset) => asset.id === fromId)) {
    return { fromId: null, hops: [], unreachable: [] };
  }

  const adjacency = new Map<string, Array<{ to: string; evidence: string }>>();
  for (const connection of map.connections) {
    adjacency.set(connection.source, [
      ...(adjacency.get(connection.source) ?? []),
      { to: connection.target, evidence: connection.evidence }
    ]);
    adjacency.set(connection.target, [
      ...(adjacency.get(connection.target) ?? []),
      { to: connection.source, evidence: connection.evidence }
    ]);
  }

  const access = accessByNode(events);
  const seen = new Map<string, MovementHop>();
  let frontier: Array<{ id: string; weakest: MovementHop["weakestEvidence"] }> = [{ id: fromId, weakest: "observed" }];
  let distance = 0;

  while (frontier.length > 0) {
    distance += 1;
    const next: Array<{ id: string; weakest: MovementHop["weakestEvidence"] }> = [];

    for (const current of frontier) {
      for (const edge of adjacency.get(current.id) ?? []) {
        if (edge.to === fromId || seen.has(edge.to)) {
          continue;
        }
        // The route's weakest link, carried forward: reaching a host through an inferred hop is an
        // inferred route however solid everything past it looks.
        const hop = evidenceOf(edge.evidence);
        const weakest = WEAKER[hop] > WEAKER[current.weakest] ? hop : current.weakest;
        seen.set(edge.to, {
          assetId: edge.to,
          distance,
          weakestEvidence: weakest,
          access: access.get(edge.to) ?? "none"
        });
        next.push({ id: edge.to, weakest });
      }
    }
    frontier = next;
  }

  const hops = [...seen.values()].sort(
    (a, b) =>
      a.distance - b.distance ||
      WEAKER[a.weakestEvidence] - WEAKER[b.weakestEvidence] ||
      accessRank(b.access) - accessRank(a.access) ||
      a.assetId.localeCompare(b.assetId)
  );

  return {
    fromId,
    hops,
    unreachable: map.assets
      .filter((asset: MapAsset) => asset.id !== fromId && !seen.has(asset.id))
      .map((asset) => asset.id)
  };
}
