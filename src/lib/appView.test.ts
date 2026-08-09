import { describe, expect, it } from "vitest";
import { initialView } from "./appView";

describe("initialView", () => {
  it("shows the home dashboard for a first-time visitor with no hash", () => {
    expect(initialView("", null)).toBe("home");
  });

  it("honours an explicit hash over the remembered view", () => {
    expect(initialView("#map", "home")).toBe("map");
    expect(initialView("#home", "map")).toBe("home");
  });

  it("falls back to the remembered last view when there is no hash", () => {
    expect(initialView("", "map")).toBe("map");
    expect(initialView("", "home")).toBe("home");
  });

  it("sends the two retired apps to the map rather than to the front door", () => {
    // `#app` and `#it` were the OT workbench and the IT engagement view. Every link into either —
    // a bookmark, a note in a ticket, the main site — meant "open the tool", and dropping someone
    // on the dashboard instead would read as the link being broken.
    expect(initialView("#app", null)).toBe("map");
    expect(initialView("#it", null)).toBe("map");
  });
});
