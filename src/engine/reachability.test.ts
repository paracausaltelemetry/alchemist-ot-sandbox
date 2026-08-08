import { describe, expect, it } from "vitest";
import { sampleProject } from "../data/sampleProject";
import { findReachability } from "./reachability";

describe("findReachability", () => {
  it("finds a permitted vendor path to a controller through the jump host", () => {
    const result = findReachability(sampleProject, "vendor-vpn", "plc-pack");

    expect(result.reachable).toBe(true);
    expect(result.pathAssetIds).toContain("jump-host");
    expect(result.pathAssetIds.at(-1)).toBe("plc-pack");
    expect(result.risks.some((risk) => risk.title === "Remote access is on the path")).toBe(true);
  });

  it("blocks reverse flow when the declared conduit is one-way", () => {
    const result = findReachability(sampleProject, "plc-pack", "vendor-vpn");

    expect(result.reachable).toBe(false);
    expect(result.explanation).toContain("No permitted route");
  });

  it("reports no source/target choice cleanly", () => {
    const result = findReachability(sampleProject, "", "");

    expect(result.reachable).toBe(false);
    expect(result.explanation).toContain("Choose a source");
  });
});
