import { describe, expect, it } from "vitest";
import { LANE_PITCH, routeCables, type CableRequest } from "./tubeRouting";
import type { MapEnclosure } from "../data/mapLayout";

const box: MapEnclosure = {
  id: "subnet:10.0.0.0/24",
  label: "10.0.0.0/24",
  detail: "",
  x: 0,
  y: 400,
  width: 600,
  height: 300
};

const cable = (id: string, from: [number, number], to: [number, number], toBox?: string): CableRequest => ({
  id,
  from: { at: { x: from[0], y: from[1] } },
  to: { at: { x: to[0], y: to[1] }, enclosureId: toBox }
});

/** Where the trunk actually runs: the corner itself, not the arc's start a radius short of it. */
const trunkY = (path: string) =>
  points(path)
    .map((point) => point.y)
    .reduce((closest, y) => (Math.abs(y - (box.y - 22)) < Math.abs(closest - (box.y - 22)) ? y : closest), Infinity);

/**
 * Every point the path lands on.
 *
 * A real parse rather than "grab every pair of numbers": an `A` command carries its radii and flags
 * before the endpoint, and reading those as coordinates invents segments that were never drawn.
 */
const points = (path: string) => {
  const visited: Array<{ x: number; y: number }> = [];
  for (const match of path.matchAll(/([MLA])([^MLAQ]*)/g)) {
    const numbers = (match[2].trim().match(/-?[\d.]+/g) ?? []).map(Number);
    // M and L are the endpoint; A is `rx ry rotation large-arc sweep x y`.
    const [x, y] = match[1] === "A" ? numbers.slice(5) : numbers;
    if (Number.isFinite(x) && Number.isFinite(y)) {
      visited.push({ x, y });
    }
  }
  return visited;
};

const angles = (path: string) => {
  const all = points(path);
  const found = new Set<number>();
  for (let index = 0; index < all.length - 1; index += 1) {
    const dx = all[index + 1].x - all[index].x;
    const dy = all[index + 1].y - all[index].y;
    if (Math.hypot(dx, dy) < 0.5) {
      continue;
    }
    found.add(Math.round((Math.atan2(dy, dx) * 180) / Math.PI));
  }
  return found;
};

describe("routing in the transit idiom", () => {
  it("draws one straight run when the ends already line up", () => {
    const [route] = routeCables([cable("a", [0, 100], [500, 100])], []);
    expect(points(route.path)).toHaveLength(2);
  });

  it("runs a trunk above the enclosure and spurs down into it", () => {
    // The shared part of the journey drawn once. Four diagonals fanning out of one router at four
    // angles is what this replaces, and the eye has nothing to follow in that.
    const [route] = routeCables([cable("a", [300, 100], [80, 460], box.id)], [box]);
    expect(trunkY(route.path)).toBeCloseTo(box.y - 22, 5);
    expect(points(route.path).length).toBeGreaterThan(2);
  });

  it("only ever runs horizontal, vertical or at 45 degrees", () => {
    // Rule one of the idiom. An arbitrary angle carries no information, and a reader who has
    // learned that lines run three ways can follow one across a crossing without tracing it.
    const routes = routeCables(
      [
        cable("a", [300, 100], [80, 460], box.id),
        cable("b", [300, 100], [230, 460], box.id),
        cable("c", [0, 100], [900, 100])
      ],
      [box]
    );

    const allowed = new Set([0, 45, 90, 135, 180, -45, -90, -135, -180]);
    for (const route of routes) {
      for (const angle of angles(route.path)) {
        // Arc control points sit off-axis by a degree or two; the tolerance covers rounding only.
        expect([...allowed].some((ok) => Math.abs(ok - angle) <= 2)).toBe(true);
      }
    }
  });

  it("puts cables sharing a corridor side by side rather than on top of each other", () => {
    // The Circle and Hammersmith & City between Paddington and Liverpool Street. Overlaid, two
    // cables look like one; offset, the count is readable.
    const routes = routeCables(
      [
        cable("a", [300, 100], [80, 460], box.id),
        cable("b", [300, 100], [230, 460], box.id),
        cable("c", [300, 100], [380, 460], box.id)
      ],
      [box]
    );

    expect(new Set(routes.map((route) => Math.round(trunkY(route.path))))).toHaveProperty("size", 3);
  });

  it("leaves a lone cable exactly where it would have been without lanes", () => {
    // Centred on the corridor, so adding a second cable pushes both apart rather than shunting the
    // first sideways — which would make the diagram twitch on every import.
    const alone = routeCables([cable("a", [300, 100], [80, 460], box.id)], [box])[0];
    expect(trunkY(alone.path)).toBeCloseTo(box.y - 22, 5);
  });

  it("assigns lanes by id, so an unrelated cable does not reshuffle the diagram", () => {
    const first = routeCables(
      [cable("a", [300, 100], [80, 460], box.id), cable("b", [300, 100], [230, 460], box.id)],
      [box]
    );
    const again = routeCables(
      [cable("b", [300, 100], [230, 460], box.id), cable("a", [300, 100], [80, 460], box.id)],
      [box]
    );

    expect(again.find((route) => route.id === "a")!.path).toBe(first.find((route) => route.id === "a")!.path);
  });

  it("turns every corner on the same circle rather than mitring it", () => {
    // A quadratic through the corner is not a circular arc, so two corners of the same nominal
    // radius end up with visibly different curvature. Asking for an arc asks for a circle, which is
    // what makes every corner on the map look like every other one.
    const [route] = routeCables([cable("a", [300, 100], [80, 460], box.id)], [box]);
    const radii = [...route.path.matchAll(/A (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)/g)].map((match) => [
      Number(match[1]),
      Number(match[2])
    ]);

    expect(radii.length).toBeGreaterThan(0);
    for (const [rx, ry] of radii) {
      expect(rx).toBe(ry);
      expect(rx).toBe(radii[0][0]);
    }
  });

  it("lands every coordinate on a whole unit", () => {
    // A stroke on a half-unit boundary is spread across two device pixels by the rasteriser, which
    // is most of what "fuzzy" means for a line drawing.
    const routes = routeCables(
      [cable("a", [300, 100], [80, 460], box.id), cable("b", [301, 100], [231, 461], box.id)],
      [box]
    );

    for (const route of routes) {
      for (const point of points(route.path)) {
        expect(Number.isInteger(point.x)).toBe(true);
        expect(Number.isInteger(point.y)).toBe(true);
      }
    }
  });

  it("stops short of both symbols", () => {
    const [route] = routeCables([cable("a", [0, 100], [500, 100])], []);
    const visited = points(route.path);

    expect(visited[0].x).toBeGreaterThan(0);
    expect(visited.at(-1)!.x).toBeLessThan(500);
  });

  it("puts the label on the longest run, which is the only one with room for it", () => {
    const [route] = routeCables([cable("a", [300, 100], [80, 460], box.id)], [box]);
    const visited = points(route.path);
    const xs = visited.map((point) => point.x);

    expect(route.labelX).toBeGreaterThanOrEqual(Math.min(...xs) - 1);
    expect(route.labelX).toBeLessThanOrEqual(Math.max(...xs) + 1);
  });

  it("stacks collinear straight runs instead of drawing them on top of each other", () => {
    // Three cables along one spine. Overlaid they are one line and the reader counts one link;
    // this is the Circle and Hammersmith & City case in its purest form.
    const routes = routeCables(
      [cable("a", [0, 100], [400, 100]), cable("b", [0, 100], [800, 100]), cable("c", [400, 100], [800, 100])],
      []
    );

    const ys = routes.map((route) => Math.round(points(route.path)[0].y));
    expect(new Set(ys).size).toBe(3);
    // Still within the plate, so every cable continues to meet the symbol it belongs to.
    for (const y of ys) {
      expect(Math.abs(y - 100)).toBeLessThan(25);
    }
  });

  it("bundles per enclosure rather than across every box at the same height", () => {
    // Two boxes side by side share a trunk height by construction. Keying the lane group on the
    // height alone interleaved both sets of cables across the full width of both, so each bundle
    // was spread twice as wide as it needed to be and neither read as a bundle.
    const right: MapEnclosure = { ...box, id: "subnet:10.1.0.0/24", x: 900 };
    const routes = routeCables(
      [
        cable("a1", [100, 100], [40, 460], box.id),
        cable("a2", [100, 100], [200, 460], box.id),
        cable("b1", [1000, 100], [940, 460], right.id),
        cable("b2", [1000, 100], [1100, 460], right.id)
      ],
      [box, right]
    );

    const at = (id: string) => trunkY(routes.find((route) => route.id === id)!.path);
    // Each pair straddles the trunk by half a pitch. Interleaved, the four would have spread over
    // three pitches instead.
    expect(Math.abs(at("a1") - at("a2"))).toBeCloseTo(LANE_PITCH, 5);
    expect(Math.abs(at("b1") - at("b2"))).toBeCloseTo(LANE_PITCH, 5);
    expect(new Set([at("a1"), at("b1")]).size).toBe(1);
  });

  it("keeps a bundle's lanes stable however the caller orders the cables", () => {
    const forwards = routeCables(
      [cable("a", [100, 100], [40, 460], box.id), cable("b", [100, 100], [200, 460], box.id)],
      [box]
    );
    const backwards = routeCables(
      [cable("b", [100, 100], [200, 460], box.id), cable("a", [100, 100], [40, 460], box.id)],
      [box]
    );

    expect(backwards.find((r) => r.id === "a")!.path).toBe(forwards.find((r) => r.id === "a")!.path);
  });

  it("detours around a symbol it does not connect", () => {
    // A transit line goes around a station it does not serve. A cable running straight through the
    // router between its two ends says those three are joined, which is not what the scan said —
    // and it buries the device it crosses.
    const between = { x: 380, y: 80, width: 50, height: 50 };
    const [route] = routeCables([cable("a", [100, 100], [700, 100])], [], [between]);
    const visited = points(route.path);

    expect(visited.length).toBeGreaterThan(2);
    for (const point of visited) {
      const inside =
        point.x > between.x &&
        point.x < between.x + between.width &&
        point.y > between.y &&
        point.y < between.y + between.height;
      expect(inside).toBe(false);
    }
  });

  it("still runs straight when the symbol is not in the way", () => {
    const elsewhere = { x: 380, y: 600, width: 50, height: 50 };
    const [route] = routeCables([cable("a", [100, 100], [700, 100])], [], [elsewhere]);
    expect(points(route.path)).toHaveLength(2);
  });

  it("does not detour around the symbols it is joining", () => {
    // A cable is allowed to touch what it connects; treating its own ends as obstacles would send
    // every cable on a pointless loop out of its own device.
    const ends = [
      { x: 80, y: 80, width: 50, height: 50 },
      { x: 680, y: 80, width: 50, height: 50 }
    ];
    const [route] = routeCables([cable("a", [100, 100], [700, 100])], [], ends);
    expect(points(route.path)).toHaveLength(2);
  });

  it("routes nothing into nothing without throwing", () => {
    expect(routeCables([], [])).toEqual([]);
  });
});

describe("nearly-straight cables", () => {
  const corners = (path: string) => (path.match(/A /g) ?? []).length;

  it("draws one line between two devices a nudge apart", () => {
    // Four pixels of vertical difference produced a staircase: down eighteen, across three hundred,
    // back up. The picture said "different levels" when the truth was that somebody had moved a
    // card once.
    const [only] = routeCables([cable("a", [100, 200], [500, 204])], []);
    expect(corners(only.path)).toBe(0);
  });

  it("still bends when the two really are apart", () => {
    const [only] = routeCables([cable("a", [100, 200], [500, 300])], []);
    expect(corners(only.path)).toBeGreaterThan(0);
  });

  it("moves the end that can move, and leaves the symbol alone", () => {
    // A border end slides along its enclosure's edge; a symbol end is where the icon is drawn.
    const [only] = routeCables([
      {
        id: "a",
        from: { at: { x: 100, y: 200 } },
        to: { at: { x: 500, y: 206 }, onBorder: true }
      }
    ], []);
    expect(only.path).toContain("200");
    expect(only.path).not.toContain("206");
  });
});
