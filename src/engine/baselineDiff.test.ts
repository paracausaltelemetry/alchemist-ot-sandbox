import { describe, expect, it } from "vitest";
import { diffAssessments } from "./baselineDiff";
import { sampleProject } from "../data/sampleProject";

describe("diffAssessments", () => {
  it("reports no change when comparing a model to itself", () => {
    const diff = diffAssessments(sampleProject, sampleProject);
    expect(diff.scoreDelta).toBe(0);
    expect(diff.fixed).toHaveLength(0);
    expect(diff.introduced).toHaveLength(0);
    expect(diff.categories).toHaveLength(8);
    expect(diff.categories.every((category) => category.delta === 0)).toBe(true);
  });

  it("shows improvement when the current model is stronger than the baseline", () => {
    // Weaken every asset's credential and MFA posture as the baseline; the unchanged sample is stronger.
    const weakened = {
      ...sampleProject,
      assets: sampleProject.assets.map((asset) => ({
        ...asset,
        controls: { ...asset.controls, defaultCredentialsDisabled: false, mfa: false }
      }))
    };

    const diff = diffAssessments(weakened, sampleProject);
    expect(diff.currentScore).toBeGreaterThanOrEqual(diff.baselineScore);
    expect(diff.scoreDelta).toBeGreaterThanOrEqual(0);
    // The sample only ever has fewer findings than the weakened baseline, so nothing is introduced.
    expect(diff.introduced).toHaveLength(0);
  });
});
