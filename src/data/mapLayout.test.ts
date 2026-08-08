import { describe, expect, it } from "vitest";
import { MAP_SLOT_STEP, layoutMapAssets } from "./mapLayout";
import { assetYForZone } from "./canvasLayout";
import type { MapLayoutAsset } from "./mapLayout";

const asset = (id: string, zone: MapLayoutAsset["zone"]): MapLayoutAsset => ({ id, zone });

describe("laying out the converged map", () => {
  it("puts every asset in the lane its zone names", () => {
    const positions = layoutMapAssets([asset("a", "internet"), asset("b", "level5"), asset("c", "level0")]);

    expect(positions.get("a")?.y).toBe(assetYForZone("internet"));
    expect(positions.get("b")?.y).toBe(assetYForZone("level5"));
    expect(positions.get("c")?.y).toBe(assetYForZone("level0"));
  });

  it("reads top-down from the internet to the process", () => {
    const positions = layoutMapAssets([asset("edge", "internet"), asset("plc", "level0")]);
    expect(positions.get("edge")!.y).toBeLessThan(positions.get("plc")!.y);
  });

  it("packs a lane left to right without overlapping", () => {
    const positions = layoutMapAssets([asset("a", "level3"), asset("b", "level3"), asset("c", "level3")]);
    const xs = ["a", "b", "c"].map((id) => positions.get(id)!.x).sort((left, right) => left - right);

    expect(xs[1] - xs[0]).toBe(MAP_SLOT_STEP);
    expect(xs[2] - xs[1]).toBe(MAP_SLOT_STEP);
  });

  it("leaves an authored position exactly where it was put", () => {
    // The whole point of the derived/authored split: re-deriving the map must not move a card
    // someone dragged, or every re-import undoes their arrangement.
    const authored = { b: { x: 999, y: 42 } };
    const positions = layoutMapAssets([asset("a", "level3"), asset("b", "level3")], authored);

    expect(positions.get("b")).toEqual({ x: 999, y: 42 });
  });

  it("packs around an authored card rather than underneath it", () => {
    const first = layoutMapAssets([asset("a", "level3")]).get("a")!;
    const positions = layoutMapAssets([asset("a", "level3"), asset("b", "level3")], { a: first });

    expect(positions.get("b")!.x).toBe(first.x + MAP_SLOT_STEP);
  });

  it("is stable when a source is added, so the map does not shuffle", () => {
    const before = layoutMapAssets([asset("b", "level3"), asset("a", "level3")]);
    const after = layoutMapAssets([asset("a", "level3"), asset("b", "level3"), asset("c", "level2")]);

    expect(after.get("a")).toEqual(before.get("a"));
    expect(after.get("b")).toEqual(before.get("b"));
  });
});
