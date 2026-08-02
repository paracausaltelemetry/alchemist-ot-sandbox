import { describe, expect, it } from "vitest";
import { assessProject } from "./scoring";
import { applyRemediations, remediations } from "./remediations";
import { sampleProject } from "../data/sampleProject";
import { scenarios } from "../data/scenarios";
import type { ScoreCategory, SecurityAssessment } from "../models/types";

/**
 * Exact expected output for every bundled project.
 *
 * Written as explicit literals rather than snapshot files so that a change to the scoring formula
 * shows up as numbers moving in the pull-request diff, where a reviewer has to look at them —
 * rather than as `.snap` churn nobody reads. If these need updating, that is the point: say in the
 * PR why each one moved.
 */
interface Golden {
  id: string;
  score: number;
  band: SecurityAssessment["band"];
  categories: Record<ScoreCategory, number>;
}

const GOLDENS: Golden[] = [
  { id: "sample", score: 55, band: "weak", categories: { segmentation: 24, remoteAccess: 59, identity: 82, monitoring: 37, resilience: 82, legacyExposure: 55, safetyImpact: 72, documentation: 56 } },
  { id: "sample-purdue-assessment", score: 55, band: "weak", categories: { segmentation: 24, remoteAccess: 59, identity: 82, monitoring: 37, resilience: 82, legacyExposure: 55, safetyImpact: 72, documentation: 56 } },
  { id: "scenario-water", score: 40, band: "critical", categories: { segmentation: 13, remoteAccess: 59, identity: 23, monitoring: 30, resilience: 55, legacyExposure: 24, safetyImpact: 100, documentation: 81 } },
  { id: "scenario-substation", score: 50, band: "weak", categories: { segmentation: 24, remoteAccess: 59, identity: 29, monitoring: 37, resilience: 55, legacyExposure: 82, safetyImpact: 100, documentation: 81 } },
  { id: "scenario-chemical", score: 48, band: "weak", categories: { segmentation: 27, remoteAccess: 59, identity: 40, monitoring: 37, resilience: 67, legacyExposure: 55, safetyImpact: 72, documentation: 73 } },
  { id: "scenario-building", score: 44, band: "critical", categories: { segmentation: 9, remoteAccess: 52, identity: 16, monitoring: 25, resilience: 67, legacyExposure: 82, safetyImpact: 100, documentation: 86 } },
  { id: "scenario-oil-gas", score: 44, band: "critical", categories: { segmentation: 24, remoteAccess: 59, identity: 23, monitoring: 45, resilience: 55, legacyExposure: 21, safetyImpact: 100, documentation: 81 } },
  { id: "scenario-rail", score: 46, band: "weak", categories: { segmentation: 24, remoteAccess: 59, identity: 21, monitoring: 45, resilience: 55, legacyExposure: 40, safetyImpact: 100, documentation: 81 } },
  { id: "scenario-pharma", score: 50, band: "weak", categories: { segmentation: 24, remoteAccess: 59, identity: 33, monitoring: 45, resilience: 67, legacyExposure: 50, safetyImpact: 100, documentation: 81 } },
  { id: "scenario-data-centre", score: 44, band: "critical", categories: { segmentation: 16, remoteAccess: 59, identity: 25, monitoring: 37, resilience: 55, legacyExposure: 45, safetyImpact: 100, documentation: 86 } },
  { id: "scenario-wind", score: 47, band: "weak", categories: { segmentation: 24, remoteAccess: 59, identity: 23, monitoring: 37, resilience: 67, legacyExposure: 50, safetyImpact: 100, documentation: 81 } },
  { id: "scenario-nuclear", score: 51, band: "weak", categories: { segmentation: 24, remoteAccess: 59, identity: 33, monitoring: 37, resilience: 82, legacyExposure: 50, safetyImpact: 100, documentation: 81 } }
];

const projects = new Map([
  ["sample", sampleProject],
  ...scenarios.map((scenario) => [scenario.id, scenario.project] as const)
]);

describe("scores for every bundled project", () => {
  it.each(GOLDENS)("$id scores $score ($band)", (golden) => {
    const project = projects.get(golden.id);
    expect(project, `no project named ${golden.id}`).toBeDefined();
    const assessment = assessProject(project!);

    expect(assessment.overallScore).toBe(golden.score);
    expect(assessment.band).toBe(golden.band);

    const actual = Object.fromEntries(assessment.categoryScores.map((c) => [c.category, c.score]));
    expect(actual).toEqual(golden.categories);
  });

  it("covers every bundled project, so nothing can be added without a golden", () => {
    expect(new Set(GOLDENS.map((g) => g.id))).toEqual(new Set(projects.keys()));
  });
});

/**
 * Semantic goldens: these say what the numbers are *for*, and survive re-tuning that the exact
 * literals above would not.
 */
describe("what the scores mean", () => {
  it("ranks the flattest network lowest", () => {
    // Water is authored as a flat network with a vendor path into control. If a formula change
    // ever puts it mid-table, the formula has stopped tracking architecture.
    const ranked = GOLDENS.filter((g) => g.id !== "sample")
      .slice()
      .sort((a, b) => a.score - b.score);
    expect(ranked[0].id).toBe("scenario-water");
  });

  it("rates no bundled scenario as fair or strong, because none of them are", () => {
    // Every scenario is a teaching example of a weak architecture. A formula that flatters them
    // is not measuring anything.
    for (const golden of GOLDENS) {
      expect(["weak", "critical"], golden.id).toContain(golden.band);
    }
  });

  it("leaves room above: fixing the controls reaches fair, not strong", () => {
    // The bundled remediations fix controls but not topology, so a remediated scenario should
    // climb a band and stop there — Strong has to be earned by the architecture.
    const every = new Set(remediations.map((r) => r.id));
    for (const [id, project] of projects) {
      const before = assessProject(project);
      const after = assessProject(applyRemediations(project, every));
      expect(after.overallScore, id).toBeGreaterThan(before.overallScore);
      expect(after.band, id).toBe("fair");
    }
  });

  it("keeps every category off the floor, so remediation always moves the number", () => {
    // The failure this formula replaces: additive deductions drove categories to exactly 0, after
    // which more findings were invisible and fixing one was worth nothing.
    for (const golden of GOLDENS) {
      for (const [category, score] of Object.entries(golden.categories)) {
        expect(score, `${golden.id} ${category}`).toBeGreaterThan(0);
      }
    }
  });
});
