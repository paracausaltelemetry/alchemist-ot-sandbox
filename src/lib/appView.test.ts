import { describe, expect, it } from "vitest";
import { initialView } from "./appView";

describe("initialView", () => {
  it("shows the home dashboard for a first-time visitor with no hash", () => {
    expect(initialView("", null)).toBe("home");
  });

  it("honours an explicit #app or #home hash over the remembered view", () => {
    expect(initialView("#app", "home")).toBe("app");
    expect(initialView("#home", "app")).toBe("home");
  });

  it("falls back to the remembered last view when there is no hash", () => {
    expect(initialView("", "app")).toBe("app");
    expect(initialView("", "home")).toBe("home");
  });
});
