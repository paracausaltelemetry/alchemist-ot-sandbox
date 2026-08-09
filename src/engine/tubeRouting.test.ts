import { describe, expect, it } from "vitest";
import { routeCables, type CableRequest } from "./tubeRouting";
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

  it("routes nothing into nothing without throwing", () => {
    expect(routeCables([], [])).toEqual([]);
  });
});
