import { describe, expect, it } from "vitest";
import { MAP_SLOT_STEP, UNSEGMENTED_LANE, bandAt, layoutMap } from "./mapLayout";
import { zones } from "./catalog";
import type { MapLayoutAsset } from "./mapLayout";
import type { Subnet } from "../models/types";

const asset = (id: string, zone: MapLayoutAsset["zone"], subnetId?: string): MapLayoutAsset => ({ id, zone, subnetId });

const subnets: Subnet[] = [
  { id: "subnet:10.10.1.0/24", name: "10.10.1.0/24", cidr: "10.10.1.0/24", vlan: "" },
  { id: "subnet:10.10.2.0/24", name: "10.10.2.0/24", cidr: "10.10.2.0/24", vlan: "20" }
];

describe("grouping by subnet", () => {
  it("gives every segment a band, in the order the sources listed them", () => {
    const { bands } = layoutMap(
      [asset("a", "level5", "subnet:10.10.1.0/24"), asset("b", "level2", "subnet:10.10.2.0/24")],
      {},
      "subnet",
      subnets
    );

    expect(bands.map((band) => band.id)).toEqual(["subnet:10.10.1.0/24", "subnet:10.10.2.0/24"]);
    expect(bands[1].detail).toContain("VLAN 20");
  });

  it("draws only the segments that hold something", () => {
    // Unlike Purdue there is no canonical list of subnets an estate ought to have, so an empty
    // band would be asserting a segment nothing found.
    const { bands } = layoutMap([asset("a", "level5", "subnet:10.10.1.0/24")], {}, "subnet", subnets);
    expect(bands.map((band) => band.id)).toEqual(["subnet:10.10.1.0/24"]);
  });

  it("puts an asset nothing placed in its own named band rather than a neighbour's", () => {
    // An address nothing could segment is a gap in the enumeration and should look like one.
    const { bands, positions } = layoutMap(
      [asset("a", "level5", "subnet:10.10.1.0/24"), asset("stray", "level5")],
      {},
      "subnet",
      subnets
    );

    expect(bands.at(-1)?.id).toBe(UNSEGMENTED_LANE);
    expect(positions.get("stray")!.y).not.toBe(positions.get("a")!.y);
  });

  it("ignores a subnet id no source describes, rather than dropping the asset", () => {
    const { positions } = layoutMap([asset("ghost", "level5", "subnet:192.168.9.0/24")], {}, "subnet", subnets);
    expect(positions.has("ghost")).toBe(true);
  });

  it("keeps a segment's members on one row and packs them across", () => {
    const { positions } = layoutMap(
      ["a", "b", "c"].map((id) => asset(id, "level5", "subnet:10.10.1.0/24")),
      {},
      "subnet",
      subnets
    );
    const rows = new Set(["a", "b", "c"].map((id) => positions.get(id)!.y));
    const xs = ["a", "b", "c"].map((id) => positions.get(id)!.x).sort((left, right) => left - right);

    expect(rows.size).toBe(1);
    expect(xs[1] - xs[0]).toBe(MAP_SLOT_STEP);
  });
});

describe("grouping by Purdue level", () => {
  it("draws every level whether or not it holds anything", () => {
    // An empty level is a statement: nobody has described that part of the estate. A subnet band
    // cannot say the same thing, which is why only this grouping keeps its empties.
    const { bands } = layoutMap([asset("a", "level5")], {}, "purdue");
    expect(bands.map((band) => band.id)).toEqual(zones.map((zone) => zone.id));
  });

  it("reads top-down from the internet to the process", () => {
    const { positions } = layoutMap([asset("edge", "internet"), asset("plc", "level0")], {}, "purdue");
    expect(positions.get("edge")!.y).toBeLessThan(positions.get("plc")!.y);
  });
});

describe("the authored layer, under either grouping", () => {
  it("leaves an authored position exactly where it was put", () => {
    const positions = layoutMap([asset("a", "level3"), asset("b", "level3")], { b: { x: 999, y: 42 } }, "purdue").positions;
    expect(positions.get("b")).toEqual({ x: 999, y: 42 });
  });

  it("packs around an authored card rather than underneath it", () => {
    const first = layoutMap([asset("a", "level3", "subnet:10.10.1.0/24")], {}, "subnet", subnets).positions.get("a")!;
    const { positions } = layoutMap(
      [asset("a", "level3", "subnet:10.10.1.0/24"), asset("b", "level3", "subnet:10.10.1.0/24")],
      { a: first },
      "subnet",
      subnets
    );

    expect(positions.get("b")!.x).toBe(first.x + MAP_SLOT_STEP);
  });

  it("is stable when a source is added, so the map does not shuffle", () => {
    const before = layoutMap([asset("b", "level3"), asset("a", "level3")], {}, "purdue").positions;
    const after = layoutMap([asset("a", "level3"), asset("b", "level3"), asset("c", "level2")], {}, "purdue").positions;

    expect(after.get("a")).toEqual(before.get("a"));
    expect(after.get("b")).toEqual(before.get("b"));
  });
});

describe("reading a drop back", () => {
  it("names the band a card was dropped into", () => {
    const { bands, positions } = layoutMap([asset("a", "internet"), asset("b", "level0")], {}, "purdue");
    expect(bandAt(positions.get("a")!.y, bands)?.id).toBe("internet");
    expect(bandAt(positions.get("b")!.y, bands)?.id).toBe("level0");
  });

  it("clamps rather than returning nothing when a card is dragged past the ends", () => {
    const { bands } = layoutMap([asset("a", "level5")], {}, "purdue");
    expect(bandAt(-5000, bands)?.id).toBe(bands[0].id);
    expect(bandAt(5000, bands)?.id).toBe(bands.at(-1)!.id);
  });

  it("has no band at all when nothing has been imported", () => {
    expect(bandAt(0, [])).toBeNull();
  });
});
