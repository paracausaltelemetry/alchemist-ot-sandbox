import { describe, expect, it } from "vitest";
import { SYMBOL_CENTRE_X, SYMBOL_CENTRE_Y, symbolCentre, trimToPlate } from "./cable";
import { DEVICE_HEIGHT } from "../../data/mapLayout";

describe("where a cable meets a device", () => {
  it("anchors on the symbol rather than the middle of the node", () => {
    // A node is mostly label. A cable landing in the hostname looks like a mistake and covers the
    // one field a reader is scanning for.
    expect(SYMBOL_CENTRE_Y).toBeLessThan(DEVICE_HEIGHT / 2);
    expect(symbolCentre({ x: 100, y: 200 })).toEqual({ x: 100 + SYMBOL_CENTRE_X, y: 200 + SYMBOL_CENTRE_Y });
  });

  it("stops short of the plate so an arrow head sits beside the icon", () => {
    const trimmed = trimToPlate({ x: 0, y: 0 }, { x: 600, y: 0 });

    expect(trimmed.x).toBeGreaterThan(0);
    expect(trimmed.x).toBeLessThan(600);
    expect(trimmed.y).toBe(0);
  });

  it("lands on the plate's edge whichever way the cable leaves it", () => {
    // Trimmed against the square plate rather than a circle. A constant-radius trim stops at the
    // same distance in every direction, which on a diagonal is inside the plate's corner — the
    // cable would run under the border and out the other side.
    const edge = (towards: { x: number; y: number }) => {
      const at = trimToPlate({ x: 0, y: 0 }, towards);
      return Math.max(Math.abs(at.x), Math.abs(at.y));
    };

    expect(edge({ x: 800, y: 800 })).toBeCloseTo(edge({ x: 800, y: 0 }), 5);
    // Clear of the ~50px plate, so the line starts outside the border rather than on it.
    expect(edge({ x: 800, y: 0 })).toBeGreaterThan(25);
  });

  it("survives two devices stacked on the same point rather than dividing by zero", () => {
    const at = trimToPlate({ x: 40, y: 40 }, { x: 40, y: 40 });
    expect(Number.isFinite(at.x) && Number.isFinite(at.y)).toBe(true);
  });
});
