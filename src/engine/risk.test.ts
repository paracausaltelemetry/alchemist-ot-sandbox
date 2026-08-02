import { describe, expect, it } from "vitest";
import { sampleProject } from "../data/sampleProject";
import { createAsset } from "../models/factory";
import { RISK_SCALE, assessRisk, consequenceFor, countHighRisk, derivedConsequence, likelihoodForAsset, riskBand, weaknessFor } from "./risk";

describe("assessRisk", () => {
  const result = assessRisk(sampleProject);

  it("rates every asset with consequence, likelihood and score in range", () => {
    expect(result.assets).toHaveLength(sampleProject.assets.length);
    for (const risk of result.assets) {
      expect(risk.consequence).toBeGreaterThanOrEqual(1);
      expect(risk.consequence).toBeLessThanOrEqual(RISK_SCALE);
      expect(risk.likelihood).toBeGreaterThanOrEqual(1);
      expect(risk.likelihood).toBeLessThanOrEqual(RISK_SCALE);
      expect(risk.score).toBe(risk.consequence * risk.likelihood);
      expect(risk.band).toBe(riskBand(risk.score));
    }
  });

  it("sorts the register by descending risk score", () => {
    for (let i = 1; i < result.assets.length; i += 1) {
      expect(result.assets[i - 1].score).toBeGreaterThanOrEqual(result.assets[i].score);
    }
  });

  it("places every asset in the heat-map matrix", () => {
    const total = result.matrix.flat().reduce((sum, count) => sum + count, 0);
    expect(total).toBe(sampleProject.assets.length);
  });

  it("rates safety systems at the highest consequence", () => {
    const safety = sampleProject.assets.find((asset) => asset.type === "safety-system");
    if (safety) {
      expect(derivedConsequence(safety)).toBe(RISK_SCALE);
    }
  });

  it("honours an explicit consequence override", () => {
    expect(consequenceFor({ ...sampleProject.assets[0], consequence: 1 })).toBe(1);
  });

  it("spreads assets across the likelihood axis instead of collapsing them", () => {
    // The old model was max-severity-of-findings, and the same rules fire on nearly every asset,
    // so almost everything landed at 4 or 5 and the heat-map became a consequence histogram.
    const spread = new Set(result.assets.map((risk) => risk.likelihood));
    expect(spread.size).toBeGreaterThan(1);
  });

  it("explains every likelihood", () => {
    for (const risk of result.assets) {
      expect(risk.reason.length).toBeGreaterThan(0);
    }
  });
});

describe("likelihoodForAsset", () => {
  /** A fully controlled, supported asset — no weakness of its own. */
  const sound = () => {
    const asset = createAsset("historian", { x: 0, y: 0 });
    return {
      ...asset,
      lifecycleStatus: "supported" as const,
      controls: { ...asset.controls, defaultCredentialsDisabled: true, mfa: true }
    };
  };

  it("bottoms out when an asset is neither exposed nor weak", () => {
    expect(likelihoodForAsset(sound(), 0)).toBe(1);
  });

  it("rises with exposure alone", () => {
    expect(likelihoodForAsset(sound(), 1)).toBe(2);
    expect(likelihoodForAsset(sound(), 2)).toBe(3);
  });

  it("rises with weakness alone", () => {
    const weak = { ...sound(), controls: { ...sound().controls, defaultCredentialsDisabled: false } };
    expect(weaknessFor(weak)).toBe(1);
    expect(likelihoodForAsset(weak, 0)).toBe(2);
  });

  it("tops out for an obsolete, uncontrolled asset reachable without a broker", () => {
    const worst = {
      ...sound(),
      lifecycleStatus: "obsolete" as const,
      controls: { ...sound().controls, defaultCredentialsDisabled: false }
    };
    expect(weaknessFor(worst)).toBe(2);
    expect(likelihoodForAsset(worst, 2)).toBe(RISK_SCALE);
  });
});

describe("countHighRisk", () => {
  it("counts only the high and critical band assets", () => {
    const result = assessRisk(sampleProject);
    const expected = result.assets.filter((risk) => risk.band === "critical" || risk.band === "high").length;
    expect(countHighRisk(result)).toBe(expected);
  });
});
