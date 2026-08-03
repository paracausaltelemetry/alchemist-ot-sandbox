import { describe, expect, it } from "vitest";
import { applyUndo, describeUndo, pushUndo, IT_UNDO_LIMIT } from "./itUndo";
import { newItEngagement, newItEvent, newItUserLink, type ItEngagement } from "../models/itEngagement";

const A = "it:10.0.0.1";
const B = "it:10.0.0.2";

function engagement(): ItEngagement {
  return {
    ...newItEngagement("Test"),
    events: [newItEvent("recon", "first", 1), newItEvent("exploit", "second", 2), newItEvent("persistence", "third", 3)],
    userLinks: [newItUserLink(A, B, "trunk")],
    positions: { [A]: { x: 10, y: 20 } }
  };
}

describe("undo over the authored layer", () => {
  it("takes back a recorded entry", () => {
    const base = engagement();
    const added = { ...base, events: [...base.events, newItEvent("exfiltration", "fourth", 4)] };
    const undone = applyUndo(added, { kind: "add-event", eventId: added.events[3].id });

    expect(undone.events.map((event) => event.title)).toEqual(["first", "second", "third"]);
  });

  it("puts a removed entry back where it was, not on the end", () => {
    // The journal is read as a sequence. An undo that silently reordered it would be worse than
    // having no undo at all.
    const base = engagement();
    const removed = { ...base, events: base.events.filter((_, index) => index !== 1) };
    const undone = applyUndo(removed, { kind: "remove-event", event: base.events[1], index: 1 });

    expect(undone.events.map((event) => event.title)).toEqual(["first", "second", "third"]);
  });

  it("puts a removed link back at its index too", () => {
    const base = engagement();
    const undone = applyUndo({ ...base, userLinks: [] }, { kind: "remove-user-link", link: base.userLinks[0], index: 0 });
    expect(undone.userLinks).toEqual(base.userLinks);
  });

  it("restores a moved node to where it was", () => {
    const base = engagement();
    const moved = { ...base, positions: { [A]: { x: 999, y: 999 } } };
    expect(applyUndo(moved, { kind: "move-node", nodeId: A, previous: { x: 10, y: 20 } }).positions[A]).toEqual({
      x: 10,
      y: 20
    });
  });

  it("returns a node that had no authored position to having none", () => {
    // Not to {0,0} and not pinned where it happened to start: it goes back to following the layout.
    const moved = { ...engagement(), positions: { [B]: { x: 5, y: 5 } } };
    const undone = applyUndo(moved, { kind: "move-node", nodeId: B, previous: undefined });

    expect(B in undone.positions).toBe(false);
  });

  it("restores every position that re-running the layout dropped", () => {
    const base = engagement();
    const cleared = { ...base, positions: {} };
    expect(applyUndo(cleared, { kind: "clear-positions", previous: base.positions }).positions).toEqual(base.positions);
  });

  it("never touches the scans, which is what keeps the stack small", () => {
    // Snapshot undo would clone every ParsedImport per step. Nothing here can reach them.
    const base = engagement();
    const undone = applyUndo(base, { kind: "add-event", eventId: base.events[0].id });
    expect(undone.scans).toBe(base.scans);
  });

  it("drops the oldest steps rather than growing without limit", () => {
    let stack = pushUndo([], { kind: "add-event", eventId: "keep-me-out" });
    for (let index = 0; index < IT_UNDO_LIMIT + 5; index += 1) {
      stack = pushUndo(stack, { kind: "add-event", eventId: `e${index}` });
    }
    expect(stack).toHaveLength(IT_UNDO_LIMIT);
    expect(stack.some((entry) => entry.kind === "add-event" && entry.eventId === "keep-me-out")).toBe(false);
  });

  it("says what it is about to undo", () => {
    expect(describeUndo({ kind: "remove-event", event: newItEvent("recon", "Scanned the DMZ", 1), index: 0 })).toBe(
      'Undo removing "Scanned the DMZ"'
    );
    expect(describeUndo({ kind: "move-node", nodeId: A, previous: undefined })).toBe("Undo moving that host");
  });
});
