import { describe, expect, it } from "vitest";
import { sampleProject } from "../data/sampleProject";
import { assessProject } from "./scoring";

describe("assessProject", () => {
  it("produces category scores and high-priority findings for the sample topology", () => {
    const assessment = assessProject(sampleProject);

    expect(assessment.overallScore).toBeGreaterThanOrEqual(0);
    expect(assessment.overallScore).toBeLessThanOrEqual(100);
    expect(assessment.categoryScores).toHaveLength(8);
    expect(assessment.findings.some((finding) => finding.title === "Remote access lacks MFA")).toBe(true);
    expect(assessment.findings.some((finding) => finding.title === "Any-any rule across trust boundary")).toBe(true);
  });

  it("penalizes safety systems with bidirectional non-diode conduits", () => {
    const assessment = assessProject(sampleProject);

    expect(assessment.findings.some((finding) => finding.category === "safetyImpact")).toBe(true);
  });
});
