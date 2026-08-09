import { describe, expect, it } from "vitest";
import { movementFrom } from "./movement";
import { projectMap } from "./mapProjection";
import { parseNmapNormal } from "../import/nmapText";
import { SAMPLE_SCAN } from "../data/sampleScan";
import { newCyberMap, newImportSource, newUserConnection, nextMapSequence } from "../models/cyberMap";
import { newItEvent } from "../models/itEngagement";
import type { CyberMapDocument } from "../models/cyberMap";

function estate(): CyberMapDocument {
  const base = newCyberMap("Movement");
  return {
    ...base,
    sources: [
      newImportSource(parseNmapNormal(SAMPLE_SCAN), "sample.txt", nextMapSequence(base), {
        kind: "external",
        label: "External"
      })
    ]
  };
}

describe("what a foothold opens up", () => {
  const doc = estate();
  const map = projectMap(doc);

  it("says nothing without a foothold, rather than guessing one", () => {
    expect(movementFrom(map, null)).toEqual({ fromId: null, hops: [], unreachable: [] });
  });

  it("says nothing for an asset that is not on the map", () => {
    expect(movementFrom(map, "it:203.0.113.99").hops).toEqual([]);
  });

  it("never lists the foothold as somewhere to move to", () => {
    const from = map.assets[0].id;
    expect(movementFrom(map, from).hops.some((hop) => hop.assetId === from)).toBe(false);
  });

  it("orders by distance, so the next hop is the first line", () => {
    const view = movementFrom(map, map.assets[0].id);
    const distances = view.hops.map((hop) => hop.distance);

    expect(distances.length).toBeGreaterThan(0);
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
    expect(distances[0]).toBe(1);
  });

  it("accounts for every asset exactly once, reached or not", () => {
    const from = map.assets[0].id;
    const view = movementFrom(map, from);

    expect(view.hops.length + view.unreachable.length).toBe(map.assets.length - 1);
    expect(new Set([...view.hops.map((hop) => hop.assetId), ...view.unreachable]).size).toBe(map.assets.length - 1);
  });

  it("carries the weakest hop forward, because a route is only as good as its worst link", () => {
    // Reaching a host through an inferred hop is an inferred route however solid the rest looks.
    // Reporting it as observed is the one thing that would make this view dangerous to act on.
    const view = movementFrom(map, map.assets[0].id);
    const byId = new Map(view.hops.map((hop) => [hop.assetId, hop]));
    const inferredEdges = map.connections.filter((connection) => connection.evidence === "inferred");

    expect(inferredEdges.length).toBeGreaterThan(0);
    for (const edge of inferredEdges) {
      const behind = byId.get(edge.target);
      const infront = byId.get(edge.source);
      if (behind && infront && behind.distance > infront.distance) {
        expect(behind.weakestEvidence).toBe("inferred");
      }
    }
  });

  it("treats a connection as walkable in both directions", () => {
    // `direction` records which way traffic was observed. Someone standing on one end of a cable
    // is not stopped by that, and honouring it would hide the paths this view exists to show.
    const [a, b] = map.assets;
    const forward = movementFrom(map, a.id).hops.some((hop) => hop.assetId === b.id);
    const back = movementFrom(map, b.id).hops.some((hop) => hop.assetId === a.id);

    expect(forward).toBe(back);
  });

  it("counts an operator's own line as a route the scan never saw", () => {
    // Drawn against something the scan only reached the long way round, so the new hop is the
    // reason the distance changed and the evidence grade cannot be coming from anywhere else.
    const from = map.assets[0].id;
    const distant = movementFrom(map, from).hops.find((hop) => hop.distance > 1);
    expect(distant).toBeDefined();

    const drawn = { ...doc, connections: [newUserConnection(from, distant!.assetId)] };
    const hop = movementFrom(projectMap(drawn), from).hops.find((entry) => entry.assetId === distant!.assetId)!;

    expect(hop.distance).toBe(1);
    expect(hop.weakestEvidence).toBe("asserted");
  });

  it("shows access already held, so a hop that is already yours reads as one", () => {
    const target = map.assets[1];
    const withAccess = {
      ...doc,
      events: [newItEvent("exploit", "Owned", nextMapSequence(doc), { targetNodeId: target.id, grants: "admin" })]
    };
    const view = movementFrom(projectMap(withAccess), map.assets[0].id, withAccess.events);

    expect(view.hops.find((hop) => hop.assetId === target.id)?.access).toBe("admin");
  });
});
