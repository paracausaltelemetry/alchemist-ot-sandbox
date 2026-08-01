import { describe, expect, it } from "vitest";
import { CANVAS_GRID_X } from "./canvasLayout";
import { IT_NODE_HEIGHT, IT_NODE_WIDTH, IT_TOP_MARGIN, itBandBoxes, layoutItMap, type ItLayoutNode } from "./itLayout";
import type { ItTier } from "../models/itMap";

function node(id: string, tier: ItTier, subnetId?: string): ItLayoutNode {
  return { id, tier, subnetId };
}

const onGrid = (value: number) => value % CANVAS_GRID_X === 0;

function overlaps(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.abs(a.x - b.x) < IT_NODE_WIDTH && Math.abs(a.y - b.y) < IT_NODE_HEIGHT;
}

describe("layoutItMap", () => {
  it("lays a single band of hosts out with no gateway above them", () => {
    const nodes = ["a", "b", "c", "d", "e"].map((id) => node(id, "host", "s1"));
    const positions = layoutItMap(nodes, [], [{ id: "s1" }]);

    expect(positions.size).toBe(5);
    for (const point of positions.values()) {
      expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
      expect(onGrid(point.x) && onGrid(point.y)).toBe(true);
    }
    // Five hosts fit one row, and with no tier above them that row is the top of the map.
    expect(new Set([...positions.values()].map((point) => point.y)).size).toBe(1);
    expect([...positions.values()][0].y).toBe(IT_TOP_MARGIN);
  });

  it("compacts unoccupied tiers instead of leaving empty bands", () => {
    const withInternet = layoutItMap(
      [node("net", "internet"), node("h1", "host", "s1")],
      [{ source: "net", target: "h1" }],
      [{ id: "s1" }]
    );
    expect(withInternet.get("net")!.y).toBe(IT_TOP_MARGIN);
    expect(withInternet.get("h1")!.y).toBeGreaterThan(IT_TOP_MARGIN);
  });

  it("centres each gateway over its own band", () => {
    const nodes = [
      node("gw1", "gateway", "s1"),
      node("gw2", "gateway", "s2"),
      ...["a", "b", "c", "d"].map((id) => node(id, "host", "s1")),
      node("z", "host", "s2")
    ];
    const positions = layoutItMap(nodes, [], [{ id: "s1" }, { id: "s2" }]);

    const bandCentre = (ids: string[]) => {
      const xs = ids.map((id) => positions.get(id)!.x);
      return (Math.min(...xs) + Math.max(...xs)) / 2;
    };
    expect(Math.abs(positions.get("gw1")!.x - bandCentre(["a", "b", "c", "d"]))).toBeLessThanOrEqual(CANVAS_GRID_X);
    expect(Math.abs(positions.get("gw2")!.x - bandCentre(["z"]))).toBeLessThanOrEqual(CANVAS_GRID_X);
    // Bands are laid left to right, so the second gateway sits right of the first.
    expect(positions.get("gw2")!.x).toBeGreaterThan(positions.get("gw1")!.x);
  });

  it("packs 300 hosts without overlap and without running away horizontally", () => {
    const nodes = Array.from({ length: 300 }, (_, index) => node(`h${index}`, "host", "s1"));
    const positions = layoutItMap(nodes, [], [{ id: "s1" }]);

    const xs = [...positions.values()].map((point) => point.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(3000);

    const points = [...positions.values()];
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        expect(overlaps(points[i], points[j])).toBe(false);
      }
    }
  });

  it("keeps a disconnected component clear of the main cluster", () => {
    const nodes = [node("gw1", "gateway", "s1"), node("a", "host", "s1"), node("lonely", "host")];
    const positions = layoutItMap(nodes, [{ source: "gw1", target: "a" }], [{ id: "s1" }]);
    expect(overlaps(positions.get("a")!, positions.get("lonely")!)).toBe(false);
  });

  it("returns nothing for an empty map", () => {
    expect(layoutItMap([], [], []).size).toBe(0);
  });
});

describe("itBandBoxes", () => {
  it("boxes each subnet's hosts and skips subnets with none drawn", () => {
    const nodes = [node("a", "host", "s1"), node("b", "host", "s1"), node("gw", "gateway", "s2")];
    const positions = layoutItMap(nodes, [], [{ id: "s1" }, { id: "s2" }]);
    const boxes = itBandBoxes(nodes, positions, [
      { id: "s1", name: "10.10.1.0/24" },
      { id: "s2", name: "10.10.2.0/24" }
    ]);

    expect(boxes.map((box) => box.id)).toEqual(["s1"]);
    expect(boxes[0].width).toBeGreaterThan(IT_NODE_WIDTH);
    expect(boxes[0].y).toBeLessThan(positions.get("a")!.y);
  });
});
