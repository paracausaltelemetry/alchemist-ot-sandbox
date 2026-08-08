import { describe, expect, it } from "vitest";
import { routeOrthogonalConduit } from "./conduitRouting";

const source = { x: 96, y: 333, width: 184, height: 74 };
const target = { x: 576, y: 569, width: 184, height: 74 };

describe("conduit routing", () => {
  it("routes conduits as rounded orthogonal tracks instead of straight point-to-point lines", () => {
    const route = routeOrthogonalConduit(source, target, 0);

    expect(route.points).toHaveLength(4);
    expect(route.path).toContain("L");
    expect(route.path).toContain("Q");
    expect(route.points[0].x).toBe(source.x + source.width);
    expect(route.points.at(-1)?.x).toBe(target.x);
  });

  it("keeps parallel protocol tracks visually separate", () => {
    const upperTrack = routeOrthogonalConduit(source, target, -14);
    const lowerTrack = routeOrthogonalConduit(source, target, 14);

    expect(upperTrack.path).not.toBe(lowerTrack.path);
    expect(upperTrack.points[0].y).toBe(source.y + source.height / 2 - 14);
    expect(lowerTrack.points[0].y).toBe(source.y + source.height / 2 + 14);
  });
});
