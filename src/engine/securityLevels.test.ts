import { describe, expect, it } from "vitest";
import { zones } from "../data/catalog";
import { sampleProject } from "../data/sampleProject";
import { MAX_SL, assessSecurityLevels, defaultTargetSL, foundationalRequirements } from "./securityLevels";

describe("assessSecurityLevels", () => {
  it("assesses every zone with target and achieved SL in range", () => {
    const result = assessSecurityLevels(sampleProject);
    expect(result.zones).toHaveLength(zones.length);

    for (const zone of result.zones) {
      expect(zone.target).toBeGreaterThanOrEqual(1);
      expect(zone.target).toBeLessThanOrEqual(MAX_SL);
      expect(zone.achieved).toBeGreaterThanOrEqual(0);
      expect(zone.achieved).toBeLessThanOrEqual(MAX_SL);

      // SL-A is capped by the weakest Foundational Requirement.
      const weakest = Math.min(...foundationalRequirements.map((fr) => zone.frLevels[fr.id]));
      expect(zone.achieved).toBe(weakest);

      // The limiting FRs are exactly those sitting at the achieved level.
      expect(zone.limiting.length).toBeGreaterThan(0);
      for (const fr of zone.limiting) {
        expect(zone.frLevels[fr]).toBe(zone.achieved);
      }
    }
  });

  it("defaults control zones to a stronger target than enterprise zones", () => {
    expect(defaultTargetSL("level1")).toBeGreaterThan(defaultTargetSL("level5"));
  });

  it("respects zoneTargets overrides", () => {
    const result = assessSecurityLevels(sampleProject, { level1: 2 });
    expect(result.zones.find((zone) => zone.zone === "level1")?.target).toBe(2);
  });

  it("reports a zone with no declared assets as unmodelled, not as satisfied", () => {
    // Every FR ladder rung is an `Array.every`, which is vacuously true on an empty population.
    // This test previously asserted the opposite and pinned the bug: an unmodelled zone scored a
    // perfect SL and read as a strength, which is what made a blank project rate 100/100 "Strong".
    const result = assessSecurityLevels({ ...sampleProject, assets: [], conduits: [] });
    for (const zone of result.zones) {
      expect(zone.modelled).toBe(false);
      expect(zone.achieved).toBe(0);
      expect(zone.achieved).not.toBe(MAX_SL);
    }
  });

  it("still rates the zones that do hold assets", () => {
    const result = assessSecurityLevels(sampleProject);
    const modelled = result.zones.filter((zone) => zone.modelled);
    expect(modelled.length).toBeGreaterThan(0);
    for (const zone of modelled) {
      expect(sampleProject.assets.some((asset) => asset.zone === zone.zone)).toBe(true);
    }
  });

  it("does not let an unmodelled zone masquerade as a modelled one", () => {
    const result = assessSecurityLevels(sampleProject);
    for (const zone of result.zones) {
      const hasAssets = sampleProject.assets.some((asset) => asset.zone === zone.zone);
      expect(zone.modelled).toBe(hasAssets);
    }
  });
});
