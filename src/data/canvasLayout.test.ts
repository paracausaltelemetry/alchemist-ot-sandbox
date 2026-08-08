import { describe, expect, it } from "vitest";
import type { Point, Subnet, ZoneId } from "../models/types";
import {
  ASSET_NODE_HEIGHT,
  ASSET_NODE_WIDTH,
  CANVAS_GRID_X,
  SUBNET_BOX_PAD,
  SUBNET_LABEL_HEIGHT,
  assetYForZone,
  layoutTiered,
  projectPurduePositions,
  resolveAssetX,
  resolveFreePosition,
  snapToGrid,
  snapX,
  subnetBoundingBoxes
} from "./canvasLayout";

type LayoutAsset = { id: string; zone: ZoneId; position: Point };

describe("resolveAssetX", () => {
  it("snaps the desired x when the zone is empty", () => {
    expect(resolveAssetX(300, "level1", null, [])).toBe(snapX(300));
  });

  it("moves a new asset clear of one already in the zone", () => {
    const assets: LayoutAsset[] = [{ id: "a", zone: "level1", position: { x: 300, y: 0 } }];
    const x = resolveAssetX(300, "level1", null, assets);
    expect(Math.abs(x - 300)).toBeGreaterThanOrEqual(ASSET_NODE_WIDTH);
  });

  it("ignores assets in other zones", () => {
    const assets: LayoutAsset[] = [{ id: "a", zone: "level0", position: { x: 300, y: 0 } }];
    expect(resolveAssetX(300, "level1", null, assets)).toBe(snapX(300));
  });

  it("ignores the asset being moved", () => {
    const assets: LayoutAsset[] = [{ id: "a", zone: "level1", position: { x: 300, y: 0 } }];
    expect(resolveAssetX(300, "level1", "a", assets)).toBe(snapX(300));
  });
});

describe("snapToGrid", () => {
  it("snaps both axes to the canvas grid without forcing a zone lane", () => {
    const snapped = snapToGrid({ x: 301, y: 205 });
    expect(snapped.x % CANVAS_GRID_X).toBe(0);
    expect(snapped.y % CANVAS_GRID_X).toBe(0);
    expect(snapped.y).toBe(Math.round(205 / CANVAS_GRID_X) * CANVAS_GRID_X);
  });
});

describe("projectPurduePositions", () => {
  it("projects each asset onto its zone lane (y) regardless of free position", () => {
    const assets: LayoutAsset[] = [
      { id: "a", zone: "level1", position: { x: 900, y: 12 } },
      { id: "b", zone: "level0", position: { x: 40, y: 999 } }
    ];
    const projected = projectPurduePositions(assets);
    expect(projected.get("a")?.y).toBe(assetYForZone("level1"));
    expect(projected.get("b")?.y).toBe(assetYForZone("level0"));
  });

  it("packs assets in the same lane left-to-right, ordered by free x, without overlap", () => {
    const assets: LayoutAsset[] = [
      { id: "right", zone: "level2", position: { x: 800, y: 0 } },
      { id: "left", zone: "level2", position: { x: 100, y: 0 } }
    ];
    const projected = projectPurduePositions(assets);
    const left = projected.get("left")!;
    const right = projected.get("right")!;
    expect(left.y).toBe(right.y);
    expect(left.x).toBeLessThan(right.x);
    expect(right.x - left.x).toBeGreaterThanOrEqual(ASSET_NODE_WIDTH);
  });
});

describe("resolveFreePosition", () => {
  it("keeps a grid-snapped point when nothing is nearby", () => {
    expect(resolveFreePosition({ x: 300, y: 240 }, null, [])).toEqual(snapToGrid({ x: 300, y: 240 }));
  });

  it("nudges a new asset off one that already sits at the spot", () => {
    const existing = [{ id: "a", position: snapToGrid({ x: 300, y: 240 }) }];
    const resolved = resolveFreePosition({ x: 300, y: 240 }, null, existing);
    const clear =
      Math.abs(resolved.x - existing[0].position.x) >= ASSET_NODE_WIDTH ||
      Math.abs(resolved.y - existing[0].position.y) >= ASSET_NODE_HEIGHT;
    expect(clear).toBe(true);
  });

  it("ignores the asset being moved", () => {
    const existing = [{ id: "a", position: snapToGrid({ x: 300, y: 240 }) }];
    expect(resolveFreePosition({ x: 300, y: 240 }, "a", existing)).toEqual(snapToGrid({ x: 300, y: 240 }));
  });
});

describe("subnetBoundingBoxes", () => {
  const subnets: Subnet[] = [
    { id: "sn-a", name: "Control", cidr: "10.0.0.0/24", vlan: "10" },
    { id: "sn-empty", name: "Spare", cidr: "", vlan: "" }
  ];

  it("wraps a subnet's members with padding and a label strip, skipping empty subnets", () => {
    const assets = [
      { subnetId: "sn-a", position: { x: 100, y: 100 } },
      { subnetId: "sn-a", position: { x: 400, y: 200 } },
      { subnetId: undefined, position: { x: 999, y: 999 } }
    ];
    const boxes = subnetBoundingBoxes(assets, subnets);
    expect(boxes).toHaveLength(1);
    const box = boxes[0];
    expect(box.id).toBe("sn-a");
    expect(box.x).toBe(100 - SUBNET_BOX_PAD);
    expect(box.y).toBe(100 - SUBNET_BOX_PAD - SUBNET_LABEL_HEIGHT);
    expect(box.width).toBe(400 + ASSET_NODE_WIDTH - 100 + SUBNET_BOX_PAD * 2);
    expect(box.height).toBe(200 + ASSET_NODE_HEIGHT - 100 + SUBNET_BOX_PAD * 2 + SUBNET_LABEL_HEIGHT);
  });
});

describe("layoutTiered", () => {
  const subnets: Subnet[] = [
    { id: "sn-a", name: "A", cidr: "", vlan: "" },
    { id: "sn-b", name: "B", cidr: "", vlan: "" }
  ];
  const assets: Array<{ id: string; zone: ZoneId; subnetId?: string }> = [
    { id: "a1", zone: "level5", subnetId: "sn-a" },
    { id: "a2", zone: "level1", subnetId: "sn-a" },
    { id: "a3", zone: "level1", subnetId: "sn-a" },
    { id: "b1", zone: "level2", subnetId: "sn-b" },
    { id: "x1", zone: "level3" }
  ];

  it("stacks higher Purdue levels above lower ones", () => {
    const positions = layoutTiered(assets, subnets, []);
    expect(positions.get("a1")!.y).toBeLessThan(positions.get("a2")!.y);
  });

  it("spreads same-subnet, same-level members sideways", () => {
    const positions = layoutTiered(assets, subnets, []);
    expect(positions.get("a2")!.y).toBe(positions.get("a3")!.y);
    expect(positions.get("a2")!.x).not.toBe(positions.get("a3")!.x);
  });

  it("gives each subnet a separated column band so containers never overlap horizontally", () => {
    const positions = layoutTiered(assets, subnets, []);
    const placed = assets.map((asset) => ({ ...asset, position: positions.get(asset.id)! }));
    const boxes = subnetBoundingBoxes(placed, subnets).sort((p, q) => p.x - q.x);
    expect(boxes).toHaveLength(2);
    expect(boxes[0].x + boxes[0].width).toBeLessThanOrEqual(boxes[1].x);
  });

  it("reorders a tier so crossing conduits straighten out", () => {
    // a,b on the upper tier; c,d below. a-d and b-c cross when both tiers sit in id
    // order; the barycentre sweep should flip one tier so the edges run parallel.
    const crossing: Array<{ id: string; zone: ZoneId }> = [
      { id: "a", zone: "level4" },
      { id: "b", zone: "level4" },
      { id: "c", zone: "level2" },
      { id: "d", zone: "level2" }
    ];
    const conduits = [
      { source: "a", target: "d" },
      { source: "b", target: "c" }
    ];
    const positions = layoutTiered(crossing, [], conduits);
    const cross =
      (positions.get("a")!.x - positions.get("b")!.x) * (positions.get("d")!.x - positions.get("c")!.x);
    expect(cross).toBeGreaterThan(0);
  });

  it("pulls a connected asset towards its neighbour's column", () => {
    // Hub h talks only to f2; with three same-tier assets below, f2 should end up
    // nearest the hub's x of the three.
    const cluster: Array<{ id: string; zone: ZoneId }> = [
      { id: "h", zone: "level3" },
      { id: "f1", zone: "level1" },
      { id: "f2", zone: "level1" },
      { id: "f3", zone: "level1" }
    ];
    const positions = layoutTiered(cluster, [], [{ source: "h", target: "f2" }]);
    const hubX = positions.get("h")!.x;
    const distances = ["f1", "f2", "f3"].map((id) => Math.abs(positions.get(id)!.x - hubX));
    expect(Math.min(...distances)).toBe(Math.abs(positions.get("f2")!.x - hubX));
  });

  it("keeps every asset on its zone tier row", () => {
    const conduits = [{ source: "a1", target: "b1" }];
    const positions = layoutTiered(assets, subnets, conduits);
    const rows = new Map<ZoneId, number>();
    for (const asset of assets) {
      const y = positions.get(asset.id)!.y;
      const existing = rows.get(asset.zone);
      if (existing !== undefined) {
        expect(y).toBe(existing);
      }
      rows.set(asset.zone, y);
    }
  });

  it("is deterministic for the same input", () => {
    const conduits = [
      { source: "a1", target: "b1" },
      { source: "a2", target: "a3" }
    ];
    const first = layoutTiered(assets, subnets, conduits);
    const second = layoutTiered(assets, subnets, conduits);
    expect([...first.entries()]).toEqual([...second.entries()]);
  });
});
