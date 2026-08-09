import { describe, expect, it } from "vitest";
import { backboneOf } from "./backbone";
import { blankConnection } from "./mapProjection";
import type { MapConnection } from "../models/cyberMap";

const link = (
  id: string,
  source: string,
  target: string,
  evidence: MapConnection["evidence"] = "same-subnet",
  trustBoundary = false
): MapConnection => ({
  ...blankConnection(id, source, target),
  trustBoundary,
  provenance: "imported",
  evidence
});

/** `gw` and `edge` are routing kit on the spine; everything else sits in a segment. */
const segments: Record<string, string | undefined> = {
  "host-a1": "net-a",
  "host-a2": "net-a",
  "host-a3": "net-a",
  "host-b1": "net-b",
  gw: undefined,
  edge: undefined
};
const enclosureOf = (assetId: string) => segments[assetId];

describe("folding cables to the backbone", () => {
  it("collapses every cable into a segment down to one", () => {
    // A scan of a /24 gives a cable per host, and together they say one thing — everything in a
    // subnet reaches its gateway — as many times as there are hosts.
    const folded = backboneOf(
      [link("1", "gw", "host-a1"), link("2", "gw", "host-a2"), link("3", "gw", "host-a3")],
      enclosureOf
    );

    expect(folded).toHaveLength(1);
    expect(folded[0].members).toHaveLength(3);
    expect([folded[0].from, folded[0].to].sort()).toEqual(["gw", "subnet:net-a"]);
  });

  it("drops a cable whose ends are both in one segment", () => {
    // The enclosure already draws that. Repeating it inside the box is the clutter this removes.
    expect(backboneOf([link("1", "host-a1", "host-a2")], enclosureOf)).toEqual([]);
  });

  it("keeps the routing kit as itself rather than folding it into a segment", () => {
    const folded = backboneOf([link("1", "gw", "edge", "traceroute")], enclosureOf);
    expect([folded[0].from, folded[0].to].sort()).toEqual(["edge", "gw"]);
  });

  it("draws one cable between two segments however the scan named its ends", () => {
    const folded = backboneOf([link("1", "host-a1", "host-b1"), link("2", "host-b1", "host-a2")], enclosureOf);
    expect(folded).toHaveLength(1);
    expect(folded[0].members).toHaveLength(2);
  });

  it("takes the strongest evidence in the fold, because a fold is as good as its best link", () => {
    // Grading the bundle by its weakest member would call an observed route a guess, which is the
    // one direction this model must never round in.
    const folded = backboneOf(
      [link("1", "gw", "host-a1", "inferred"), link("2", "gw", "host-a2", "traceroute")],
      enclosureOf
    );

    expect(folded[0].evidence).toBe("traceroute");
    expect(folded[0].id).toBe("2");
  });

  it("crosses a boundary if any of its links does", () => {
    const folded = backboneOf(
      [link("1", "gw", "host-a1", "same-subnet", false), link("2", "gw", "host-a2", "same-subnet", true)],
      enclosureOf
    );
    expect(folded[0].trustBoundary).toBe(true);
  });

  it("names every link it stands for, so nothing is lost with the extra lines", () => {
    const folded = backboneOf([link("1", "gw", "host-a1"), link("2", "gw", "host-a2")], enclosureOf);
    expect(folded[0].members.map((member) => member.id).sort()).toEqual(["1", "2"]);
  });

  it("is stable however the caller orders the connections", () => {
    const forwards = backboneOf([link("1", "gw", "host-a1"), link("2", "edge", "host-b1")], enclosureOf);
    const backwards = backboneOf([link("2", "edge", "host-b1"), link("1", "gw", "host-a1")], enclosureOf);

    expect(backwards.map((cable) => cable.id)).toEqual(forwards.map((cable) => cable.id));
  });

  it("folds nothing into nothing", () => {
    expect(backboneOf([], enclosureOf)).toEqual([]);
  });
});
