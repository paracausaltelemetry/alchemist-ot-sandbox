import { describe, expect, it } from "vitest";
import { applyRemediations, remediations } from "./remediations";
import { assessProject } from "./scoring";
import { sampleProject } from "../data/sampleProject";
import { scenarios } from "../data/scenarios";

const baseScore = assessProject(sampleProject).overallScore;

/** Every bundled project, so the invariants below are not proven on one topology alone. */
const allProjects = [{ id: "sample", project: sampleProject }, ...scenarios.map((s) => ({ id: s.id, project: s.project }))];

describe("remediations", () => {
  it("never lowers the advisory score on its own", () => {
    for (const remediation of remediations) {
      const score = assessProject(remediation.apply(sampleProject)).overallScore;
      expect(score).toBeGreaterThanOrEqual(baseScore);
    }
  });

  it("raises the score when every remediation is applied", () => {
    const ids = new Set(remediations.map((remediation) => remediation.id));
    const improved = assessProject(applyRemediations(sampleProject, ids)).overallScore;
    expect(improved).toBeGreaterThan(baseScore);
  });

  it("does not mutate the input project", () => {
    const before = JSON.stringify(sampleProject);
    applyRemediations(sampleProject, new Set(remediations.map((remediation) => remediation.id)));
    expect(JSON.stringify(sampleProject)).toBe(before);
  });

  it("applies no change when no remediations are selected", () => {
    const result = applyRemediations(sampleProject, new Set());
    expect(assessProject(result).overallScore).toBe(baseScore);
  });
});

/**
 * Monotonicity across every bundled project, not just the sample. This is the property that a
 * saturating score silently breaks: once a category floors at 0, fixing a finding inside it moves
 * nothing, so a remediation can be a no-op without anything failing. Asserting it here means the
 * scoring formula cannot be changed in a way that makes remediation stop paying.
 */
describe("remediation monotonicity across every bundled project", () => {
  it.each(allProjects)("$id never scores lower after a single remediation", ({ project }) => {
    const before = assessProject(project).overallScore;
    for (const remediation of remediations) {
      const after = assessProject(remediation.apply(project)).overallScore;
      expect(after, `${remediation.id} lowered the score`).toBeGreaterThanOrEqual(before);
    }
  });

  it.each(allProjects)("$id improves when everything is remediated", ({ project }) => {
    const before = assessProject(project).overallScore;
    const ids = new Set(remediations.map((remediation) => remediation.id));
    expect(assessProject(applyRemediations(project, ids)).overallScore).toBeGreaterThan(before);
  });

  it.each(allProjects)("$id is left untouched by applying remediations", ({ project }) => {
    const before = JSON.stringify(project);
    applyRemediations(project, new Set(remediations.map((remediation) => remediation.id)));
    expect(JSON.stringify(project)).toBe(before);
  });
});
