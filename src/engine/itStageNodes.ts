import { projectEngagement } from "./itProjection";
import type { ItEngagement } from "../models/itEngagement";

/**
 * Which hosts were on the map after each scan, and which of them were new at that point.
 *
 * Computed by re-projecting the engagement with the later scans withheld, rather than by reading
 * `parsed.hosts` directly. The two disagree: a traceroute names routers that are never host records,
 * so counting parsed hosts made stage 1 report "8 newly revealed" while the summary said 10 hosts
 * mapped — an arithmetic hole a careful reader spots immediately, in the one document where every
 * number is supposed to reconcile.
 *
 * Shared so the timeline and the per-stage maps cannot drift apart: both ask this the same question.
 */
export interface ItStageNodes {
  /** Every node present once this scan had run, ghosts included, because the map draws them. */
  present: Set<string>;
  /**
   * Scanned hosts this scan put on the map for the first time.
   *
   * Scanned only. Re-projecting also materialises synthetic gateways for any new subnet, and
   * announcing "first seen here: db-2, gw-10.10.9.0/24" would credit the scan with finding a device
   * that was inferred, in a document whose whole claim is that everything traces to evidence.
   */
  revealed: Set<string>;
}

export function stageNodesByScan(engagement: ItEngagement): Map<number, ItStageNodes> {
  const scans = [...engagement.scans].sort((a, b) => a.sequence - b.sequence);
  const byScan = new Map<number, ItStageNodes>();
  let previous = new Set<string>();

  for (const scan of scans) {
    const upTo = { ...engagement, scans: scans.filter((entry) => entry.sequence <= scan.sequence), events: [] };
    const { map } = projectEngagement(upTo);
    const present = new Set((map?.nodes ?? []).map((node) => node.id));
    const scanned = new Set(
      (map?.nodes ?? []).filter((node) => node.origin === "scanned").map((node) => node.id)
    );
    const revealed = new Set([...scanned].filter((id) => !previous.has(id)));
    byScan.set(scan.sequence, { present, revealed });
    previous = scanned;
  }

  return byScan;
}
