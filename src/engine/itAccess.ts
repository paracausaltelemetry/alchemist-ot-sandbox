import {
  EXTERNAL_ORIGIN,
  IT_ACCESS_LADDER,
  type ItAccessState,
  type ItEvent
} from "../models/itEngagement";
import type { ItLink } from "../models/itMap";

/**
 * Access and attack edges, folded from the journal.
 *
 * Neither is ever stored. Access on a node would render "the map at the end" and nothing else,
 * while an ordered journal gives every intermediate map for free — which is what a report needs,
 * because a reader wants stage 3, not just the finish. It also makes one particular bug impossible:
 * the map claiming a host was compromised with no journal entry explaining why.
 */

const RUNG = new Map(IT_ACCESS_LADDER.map((state, index) => [state, index] as const));

/** The higher of two rungs. The fold is monotone: access is reached and never un-reached. */
export function highestAccess(a: ItAccessState, b: ItAccessState): ItAccessState {
  return (RUNG.get(a) ?? 0) >= (RUNG.get(b) ?? 0) ? a : b;
}

export const accessRank = (state: ItAccessState): number => RUNG.get(state) ?? 0;

/** Events in the order they happened. Always by sequence, never by a timestamp that may be absent. */
export function orderedEvents(events: ItEvent[]): ItEvent[] {
  return [...events].sort((a, b) => a.sequence - b.sequence);
}

/**
 * The access held on each node after every event up to and including `throughSequence`.
 *
 * Omitting the bound gives the state at the end of the engagement; passing one gives the map as it
 * stood at that stage, which is what the per-stage report maps are drawn from.
 */
export function accessByNode(events: ItEvent[], throughSequence = Number.POSITIVE_INFINITY): Map<string, ItAccessState> {
  const access = new Map<string, ItAccessState>();
  for (const event of orderedEvents(events)) {
    if (event.sequence > throughSequence) {
      break;
    }
    if (!event.targetNodeId || !event.grants) {
      continue;
    }
    const current = access.get(event.targetNodeId) ?? "none";
    access.set(event.targetNodeId, highestAccess(current, event.grants));
  }
  return access;
}

/**
 * The lines showing what the operator did, one per event that has both ends.
 *
 * Derived rather than stored alongside the drawn links, because storing them would give the same
 * arrow two sources of truth — an attack edge whose event had been deleted would linger, and the
 * map would assert something the journal does not.
 */
export function attackLinks(events: ItEvent[], nodeIds: Set<string>, throughSequence = Number.POSITIVE_INFINITY): ItLink[] {
  const links: ItLink[] = [];
  for (const event of orderedEvents(events)) {
    if (event.sequence > throughSequence) {
      break;
    }
    // An action from outside the map has no node to start from, so there is no line to draw. It
    // still appears in the journal and the report; only the arrow is missing.
    if (!event.sourceNodeId || !event.targetNodeId || event.sourceNodeId === EXTERNAL_ORIGIN) {
      continue;
    }
    if (!nodeIds.has(event.sourceNodeId) || !nodeIds.has(event.targetNodeId)) {
      continue;
    }
    links.push({
      id: `link:attack:${event.id}`,
      source: event.sourceNodeId,
      target: event.targetNodeId,
      evidence: "attack",
      label: event.title
    });
  }
  return links;
}

/** The longest chain of actions from outside the map inwards, as node ids in order. */
export function longestAttackChain(events: ItEvent[]): string[] {
  const best = new Map<string, string[]>();
  for (const event of orderedEvents(events)) {
    if (!event.targetNodeId) {
      continue;
    }
    const from = event.sourceNodeId;
    // A chain only counts when the operator actually got somewhere on the target.
    if (!event.grants || event.grants === "none" || event.grants === "identified") {
      continue;
    }
    const prefix = from && from !== EXTERNAL_ORIGIN ? (best.get(from) ?? [from]) : [];
    const candidate = [...prefix, event.targetNodeId];
    const existing = best.get(event.targetNodeId);
    if (!existing || candidate.length > existing.length) {
      best.set(event.targetNodeId, candidate);
    }
  }
  let longest: string[] = [];
  for (const chain of best.values()) {
    if (chain.length > longest.length) {
      longest = chain;
    }
  }
  return longest;
}
