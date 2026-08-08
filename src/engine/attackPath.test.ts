import { describe, expect, it } from "vitest";
import { analyzeAttackPath, suggestEntry, suggestTarget } from "./attackPath";
import { assessProject } from "./scoring";
import { sampleProject } from "../data/sampleProject";
import { nuclearScenario } from "../data/scenarios/nuclear";

describe("attackPath", () => {
  it("suggests an entry and a distinct target on the sample project", () => {
    const entry = suggestEntry(sampleProject);
    const target = suggestTarget(sampleProject, entry);
    const ids = new Set(sampleProject.assets.map((asset) => asset.id));
    expect(ids.has(entry)).toBe(true);
    expect(ids.has(target)).toBe(true);
    expect(target).not.toBe(entry);
  });

  it("returns a coherent chain when the target is reachable", () => {
    const entry = suggestEntry(sampleProject);
    const target = suggestTarget(sampleProject, entry);
    const findings = assessProject(sampleProject).findings;
    const result = analyzeAttackPath(sampleProject, entry, target, findings);

    expect(result.entryId).toBe(entry);
    expect(result.targetId).toBe(target);
    if (result.reachable) {
      expect(result.hops[0].assetId).toBe(entry);
      expect(result.hops[result.hops.length - 1].assetId).toBe(target);
      expect(result.tactics.length).toBeGreaterThan(0);
      // The chain is seeded with an initial-access and an impact tactic.
      const tacticIds = result.tactics.map((tactic) => tactic.id);
      expect(tacticIds).toContain("initial-access");
      expect(tacticIds).toContain("impact");
    }
  });

  it("keeps a diode-protected safety system out of reach (defence in depth)", () => {
    const project = nuclearScenario.project;
    const entry = suggestEntry(project);
    const target = suggestTarget(project, entry);
    const findings = assessProject(project).findings;
    const result = analyzeAttackPath(project, entry, target, findings);

    // The vendor-remote asset is the most-exposed entry.
    expect(project.assets.find((asset) => asset.id === entry)?.type).toBe("vendor-remote");
    // The reactor protection system publishes one-way through a data diode, so it cannot be reached.
    expect(result.protectedAssets).toContain("Reactor Protection System");
    expect(result.targetId).not.toBe("nuc-rps");
  });
});
