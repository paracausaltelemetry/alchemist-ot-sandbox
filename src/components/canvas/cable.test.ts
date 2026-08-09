import { describe, expect, it } from "vitest";
import { SYMBOL_CENTRE_X, SYMBOL_CENTRE_Y, cableBetween, symbolCentre } from "./cable";
import { DEVICE_HEIGHT } from "../../data/mapLayout";

const ends = (path: string) => {
  const [, x1, y1, x2, y2] = path.match(/M ([\d.-]+) ([\d.-]+) L ([\d.-]+) ([\d.-]+)/)!.map(Number);
  return { from: { x: x1, y: y1 }, to: { x: x2, y: y2 } };
};

const length = (path: string) => {
  const { from, to } = ends(path);
  return Math.hypot(to.x - from.x, to.y - from.y);
};

describe("cables between symbols", () => {
  it("anchors on the symbol rather than the middle of the node", () => {
    // A node is mostly label. A cable landing in the hostname looks like a mistake and covers the
    // one field a reader is scanning for.
    expect(SYMBOL_CENTRE_Y).toBeLessThan(DEVICE_HEIGHT / 2);
    expect(symbolCentre({ x: 100, y: 200 })).toEqual({ x: 100 + SYMBOL_CENTRE_X, y: 200 + SYMBOL_CENTRE_Y });
  });

  it("draws one straight segment, not a routed path", () => {
    const { path } = cableBetween({ x: 0, y: 0 }, { x: 600, y: 400 });
    expect(path.match(/L/g)).toHaveLength(1);
  });

  it("stops short of both symbols so an arrow head sits beside the icon", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 600, y: 0 };
    const { path } = cableBetween(a, b);
    const { from, to } = ends(path);

    expect(from.x).toBeGreaterThan(symbolCentre(a).x);
    expect(to.x).toBeLessThan(symbolCentre(b).x);
    expect(length(path)).toBeLessThan(Math.hypot(600, 0));
  });

  it("lands on the plate's edge whichever way the cable leaves it", () => {
    // Trimmed against the square plate rather than a circle. A constant-radius trim stops at the
    // same distance in every direction, which on a diagonal is inside the plate's corner — the
    // cable would run under the border and out the other side.
    const onPlateEdge = (from: { x: number; y: number }, to: { x: number; y: number }) => {
      const start = ends(cableBetween(from, to).path).from;
      const centre = symbolCentre(from);
      return Math.max(Math.abs(start.x - centre.x), Math.abs(start.y - centre.y));
    };

    const axis = onPlateEdge({ x: 0, y: 0 }, { x: 800, y: 0 });
    const diagonal = onPlateEdge({ x: 0, y: 0 }, { x: 800, y: 800 });

    expect(diagonal).toBeCloseTo(axis, 5);
    // Clear of the ~50px plate, so the line starts outside the border rather than on it.
    expect(axis).toBeGreaterThan(25);
  });

  it("puts the label on the midpoint of what is drawn", () => {
    const { path, labelX, labelY } = cableBetween({ x: 0, y: 0 }, { x: 400, y: 300 });
    const { from, to } = ends(path);

    expect(labelX).toBeCloseTo((from.x + to.x) / 2, 5);
    expect(labelY).toBeCloseTo((from.y + to.y) / 2, 5);
  });

  it("survives two devices stacked on the same point rather than dividing by zero", () => {
    const { path, labelX, labelY } = cableBetween({ x: 40, y: 40 }, { x: 40, y: 40 });
    expect(path).not.toMatch(/NaN/);
    expect(Number.isFinite(labelX) && Number.isFinite(labelY)).toBe(true);
  });
});
