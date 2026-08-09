import { projectMap } from "./mapProjection";
import type { CyberMapDocument } from "../models/cyberMap";

/**
 * What the map held after each import, and what that import put on it for the first time.
 *
 * Answered by re-projecting the document once per prefix of its sources rather than by reading
 * `parsed.hosts`. The two disagree: a traceroute names routers that are never host records, so
 * counting the parse made a stage report "8 newly revealed" while the summary said 10 assets — an
 * arithmetic hole a careful reader spots immediately, in the one document where every number is
 * supposed to reconcile. Its IT ancestor, `stageNodesByScan`, exists for the same reason.
 *
 * Shared so the report and the stage maps cannot drift apart: both ask this the same question.
 */
export interface MapStageNodes {
  /** Every asset present once this import had landed, inferred ones included — the map draws them. */
  present: Set<string>;
  /**
   * Observed assets this import put on the map for the first time.
   *
   * Observed only. Re-projecting also materialises inferred gateways for any new subnet, and
   * announcing "first seen here: db-2, gw-10.10.9.0/24" would credit an import with finding a
   * device that was reasoned about, in a document whose whole claim is that everything traces to
   * evidence.
   */
  revealed: Set<string>;
}

export function stageNodesBySource(doc: CyberMapDocument): Map<number, MapStageNodes> {
  const ordered = [...doc.sources].sort((a, b) => a.sequence - b.sequence);
  const bySequence = new Map<number, MapStageNodes>();
  let previous = new Set<string>();

  for (const source of ordered) {
    // Events are dropped from the projection here on purpose: this is about what the imports
    // revealed, and folding the journal in would let an action appear to discover an asset.
    const upTo: CyberMapDocument = {
      ...doc,
      sources: ordered.filter((entry) => entry.sequence <= source.sequence),
      events: []
    };
    const assets = projectMap(upTo).assets;
    const present = new Set(assets.map((asset) => asset.id));
    const observed = new Set(assets.filter((asset) => asset.sourceIds.length > 0).map((asset) => asset.id));

    bySequence.set(source.sequence, {
      present,
      revealed: new Set([...observed].filter((id) => !previous.has(id)))
    });
    previous = observed;
  }

  return bySequence;
}
