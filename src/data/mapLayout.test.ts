import { describe, expect, it } from "vitest";
import { DEVICE_HEIGHT, DEVICE_WIDTH, UNSEGMENTED_LANE, bandAt, layoutMap } from "./mapLayout";
import { zones } from "./catalog";
import type { MapLayoutAsset } from "./mapLayout";
import type { Point, Subnet } from "../models/types";

const host = (id: string, subnetId?: string, deviceKind = "server"): MapLayoutAsset => ({
  id,
  zone: "level5",
  subnetId,
  deviceKind
});

const subnets: Subnet[] = [
  { id: "subnet:10.10.1.0/24", name: "10.10.1.0/24", cidr: "10.10.1.0/24", vlan: "" },
  { id: "subnet:10.10.2.0/24", name: "10.10.2.0/24", cidr: "10.10.2.0/24", vlan: "20" }
];

/** Does a device's box sit inside an enclosure's box? */
function contains(enclosure: { x: number; y: number; width: number; height: number }, at: Point): boolean {
  return (
    at.x >= enclosure.x &&
    at.y >= enclosure.y &&
    at.x + DEVICE_WIDTH <= enclosure.x + enclosure.width &&
    at.y + DEVICE_HEIGHT <= enclosure.y + enclosure.height
  );
}

describe("the topology arrangement", () => {
  it("draws one enclosure per segment that holds something", () => {
    const { enclosures } = layoutMap(
      [host("a", "subnet:10.10.1.0/24"), host("b", "subnet:10.10.2.0/24")],
      {},
      "topology",
      subnets
    );

    expect(enclosures.map((box) => box.id)).toEqual(["subnet:10.10.1.0/24", "subnet:10.10.2.0/24"]);
    expect(enclosures[1].detail).toContain("VLAN 20");
  });

  it("draws no enclosure for a segment nothing was found on", () => {
    // Unlike a Purdue level there is no canonical list of subnets an estate ought to have, so an
    // empty box would be asserting a segment nothing found.
    const { enclosures } = layoutMap([host("a", "subnet:10.10.1.0/24")], {}, "topology", subnets);
    expect(enclosures).toHaveLength(1);
  });

  it("puts every member inside its own enclosure and nobody else's", () => {
    const members = ["a", "b", "c", "d", "e"].map((id) => host(id, "subnet:10.10.1.0/24"));
    const { enclosures, positions } = layoutMap(
      [...members, host("other", "subnet:10.10.2.0/24")],
      {},
      "topology",
      subnets
    );

    const first = enclosures.find((box) => box.id === "subnet:10.10.1.0/24")!;
    const second = enclosures.find((box) => box.id === "subnet:10.10.2.0/24")!;

    for (const member of members) {
      expect(contains(first, positions.get(member.id)!)).toBe(true);
      expect(contains(second, positions.get(member.id)!)).toBe(false);
    }
  });

  it("never overlaps two enclosures", () => {
    const many = Array.from({ length: 4 }, (_, index) => ({
      id: `subnet:10.${index}.0.0/24`,
      name: `10.${index}.0.0/24`,
      cidr: `10.${index}.0.0/24`,
      vlan: ""
    }));
    const assets = many.flatMap((subnet, index) =>
      Array.from({ length: index + 2 }, (_, n) => host(`${subnet.id}-${n}`, subnet.id))
    );
    const { enclosures } = layoutMap(assets, {}, "topology", many);

    for (const a of enclosures) {
      for (const b of enclosures) {
        if (a === b) continue;
        const apart =
          a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
        expect(apart).toBe(true);
      }
    }
  });

  it("lifts routers, firewalls and the internet onto a spine above the segments", () => {
    // The kit that joins segments does not belong inside one of them, and a whiteboard sketch of a
    // network puts it across the top for exactly that reason.
    const { positions, enclosures } = layoutMap(
      [host("edge", "subnet:10.10.1.0/24", "firewall"), host("wan", undefined, "internet"), host("a", "subnet:10.10.1.0/24")],
      {},
      "topology",
      subnets
    );

    const box = enclosures[0];
    expect(positions.get("edge")!.y).toBeLessThan(box.y);
    expect(positions.get("wan")!.y).toBeLessThan(box.y);
    expect(contains(box, positions.get("a")!)).toBe(true);
  });

  it("gives devices nothing could place a named box rather than a neighbour's", () => {
    const { enclosures } = layoutMap([host("a", "subnet:10.10.1.0/24"), host("stray")], {}, "topology", subnets);
    expect(enclosures.at(-1)?.id).toBe(UNSEGMENTED_LANE);
  });

  it("keeps a device a person dragged exactly where they put it", () => {
    const { positions } = layoutMap(
      [host("a", "subnet:10.10.1.0/24"), host("b", "subnet:10.10.1.0/24")],
      { b: { x: 999, y: 42 } },
      "topology",
      subnets
    );
    expect(positions.get("b")).toEqual({ x: 999, y: 42 });
  });

  it("is stable when a source is added, so the map does not shuffle", () => {
    const before = layoutMap([host("b", "subnet:10.10.1.0/24"), host("a", "subnet:10.10.1.0/24")], {}, "topology", subnets);
    const after = layoutMap(
      [host("a", "subnet:10.10.1.0/24"), host("b", "subnet:10.10.1.0/24"), host("c", "subnet:10.10.2.0/24")],
      {},
      "topology",
      subnets
    );

    expect(after.positions.get("a")).toEqual(before.positions.get("a"));
    expect(after.positions.get("b")).toEqual(before.positions.get("b"));
  });
});

describe("the Purdue arrangement", () => {
  it("draws every level whether or not it holds anything", () => {
    // An empty level is a statement: nobody has described that part of the estate. An empty subnet
    // enclosure cannot say the same thing, which is why only this arrangement keeps its empties.
    const { bands, enclosures } = layoutMap([host("a")], {}, "purdue");
    expect(bands.map((band) => band.id)).toEqual(zones.map((zone) => zone.id));
    expect(enclosures).toEqual([]);
  });

  it("reads top-down from the internet to the process", () => {
    const edge: MapLayoutAsset = { id: "edge", zone: "internet" };
    const plc: MapLayoutAsset = { id: "plc", zone: "level0" };
    const { positions } = layoutMap([edge, plc], {}, "purdue");

    expect(positions.get("edge")!.y).toBeLessThan(positions.get("plc")!.y);
  });

  it("names the band a device was dropped into", () => {
    const { bands, positions } = layoutMap(
      [{ id: "a", zone: "internet" }, { id: "b", zone: "level0" }],
      {},
      "purdue"
    );

    expect(bandAt(positions.get("a")!.y, bands)?.id).toBe("internet");
    expect(bandAt(positions.get("b")!.y, bands)?.id).toBe("level0");
  });

  it("clamps rather than returning nothing when a device is dragged past the ends", () => {
    const { bands } = layoutMap([host("a")], {}, "purdue");
    expect(bandAt(-5000, bands)?.id).toBe(bands[0].id);
    expect(bandAt(5000, bands)?.id).toBe(bands.at(-1)!.id);
  });

  it("has no band at all when nothing has been imported", () => {
    expect(bandAt(0, [])).toBeNull();
  });
});
