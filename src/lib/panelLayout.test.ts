// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_PANEL_LAYOUT, readPanelLayout, writePanelLayout } from "./panelLayout";

describe("remembering which panels are open", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts with the bottom panel shut", () => {
    // It holds things to look up, not things to read, and a third of the screen given to a list
    // nobody asked for is a third less map.
    expect(readPanelLayout()).toEqual({ sidebar: true, inspector: true, bottom: false });
  });

  it("remembers what was closed", () => {
    writePanelLayout({ sidebar: false, inspector: true, bottom: true });
    expect(readPanelLayout()).toEqual({ sidebar: false, inspector: true, bottom: true });
  });

  it("falls back to the defaults rather than throwing on a damaged preference", () => {
    localStorage.setItem("alchemist-map-panels", "{ not json");
    expect(readPanelLayout()).toEqual(DEFAULT_PANEL_LAYOUT);
  });

  it("fills in a field a older build never wrote", () => {
    localStorage.setItem("alchemist-map-panels", JSON.stringify({ sidebar: false }));
    expect(readPanelLayout()).toEqual({ sidebar: false, inspector: true, bottom: false });
  });
});
