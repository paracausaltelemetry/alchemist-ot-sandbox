import type { ItEngagement, ItEvent, ItUserLink } from "../models/itEngagement";
import type { Point } from "../models/types";

/**
 * Undo for the authored layer.
 *
 * Command-level, never snapshots. An `ItEngagement` holds every scan's `ParsedImport`, so cloning
 * one per undo step would put megabytes on the stack for the sake of moving a node — and a real
 * engagement accumulates hundreds of steps. Each entry here stores only what it takes to reverse
 * one operation.
 *
 * Scans are deliberately outside the stack. Removing one is the single destructive action on this
 * side, it is rare, and undoing it would mean keeping a whole parse alive in memory for as long as
 * the history lasts. It goes behind a confirmation instead.
 */

export type ItUndoEntry =
  | { kind: "add-event"; eventId: string }
  | { kind: "remove-event"; event: ItEvent; index: number }
  | { kind: "add-user-link"; linkId: string }
  | { kind: "remove-user-link"; link: ItUserLink; index: number }
  | { kind: "move-node"; nodeId: string; previous: Point | undefined }
  | { kind: "clear-positions"; previous: Record<string, Point> };

/** How many steps back the operator can go. Beyond this the oldest are dropped. */
export const IT_UNDO_LIMIT = 50;

export function pushUndo(stack: ItUndoEntry[], entry: ItUndoEntry): ItUndoEntry[] {
  return [...stack, entry].slice(-IT_UNDO_LIMIT);
}

/** Describes an entry for the button's title, so undo says what it will actually do. */
export function describeUndo(entry: ItUndoEntry): string {
  switch (entry.kind) {
    case "add-event":
      return "Undo recording that entry";
    case "remove-event":
      return `Undo removing "${entry.event.title}"`;
    case "add-user-link":
      return "Undo drawing that link";
    case "remove-user-link":
      return "Undo removing that link";
    case "move-node":
      return "Undo moving that host";
    case "clear-positions":
      return "Undo re-running the layout";
  }
}

/**
 * Applies the inverse of one entry.
 *
 * Removals put the item back at the index it came from rather than on the end: the journal is read
 * as a sequence, and an undo that silently reordered it would be worse than no undo at all.
 */
export function applyUndo(engagement: ItEngagement, entry: ItUndoEntry): ItEngagement {
  switch (entry.kind) {
    case "add-event":
      return { ...engagement, events: engagement.events.filter((event) => event.id !== entry.eventId) };

    case "remove-event": {
      const events = [...engagement.events];
      events.splice(Math.min(entry.index, events.length), 0, entry.event);
      return { ...engagement, events };
    }

    case "add-user-link":
      return { ...engagement, userLinks: engagement.userLinks.filter((link) => link.id !== entry.linkId) };

    case "remove-user-link": {
      const userLinks = [...engagement.userLinks];
      userLinks.splice(Math.min(entry.index, userLinks.length), 0, entry.link);
      return { ...engagement, userLinks };
    }

    case "move-node": {
      const positions = { ...engagement.positions };
      // A node that had no authored position before must go back to having none, so the computed
      // layout takes it again rather than it being pinned wherever it happened to start.
      if (entry.previous) {
        positions[entry.nodeId] = entry.previous;
      } else {
        delete positions[entry.nodeId];
      }
      return { ...engagement, positions };
    }

    case "clear-positions":
      return { ...engagement, positions: entry.previous };
  }
}
