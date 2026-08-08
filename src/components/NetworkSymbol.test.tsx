// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { NetworkSymbol } from "./NetworkSymbol";
import type { ItNodeKind } from "../models/itMap";

const KINDS: ItNodeKind[] = [
  "internet",
  "firewall",
  "router",
  "switch",
  "load-balancer",
  "server",
  "database",
  "workstation",
  "printer",
  "wireless-ap",
  "unknown"
];

describe("NetworkSymbol", () => {
  it("draws a distinct symbol for every device class", () => {
    const shapes = new Map<string, ItNodeKind>();

    for (const kind of KINDS) {
      const { container, unmount } = render(<NetworkSymbol kind={kind} />);
      const svg = container.querySelector("svg.network-symbol");
      expect(svg, kind).not.toBeNull();

      const drawn = [...svg!.querySelectorAll("path")].map((path) => path.getAttribute("d")).join("|");
      expect(drawn.length, `${kind} draws nothing`).toBeGreaterThan(0);

      // Two classes sharing artwork would be indistinguishable on the map.
      expect(shapes.get(drawn), `${kind} duplicates ${shapes.get(drawn)}`).toBeUndefined();
      shapes.set(drawn, kind);
      unmount();
    }

    expect(shapes.size).toBe(KINDS.length);
  });

  it("inherits colour and size so it works in both themes", () => {
    const { container } = render(<NetworkSymbol kind="router" size={40} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("stroke")).toBe("currentColor");
    expect(svg.getAttribute("fill")).toBe("none");
    expect(svg.getAttribute("width")).toBe("40");
  });
});
