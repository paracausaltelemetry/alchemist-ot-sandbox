import { describe, expect, it } from "vitest";
import { assessCaf } from "./caf";
import type { OtProject, ScoreCategory, SecurityAssessment } from "../models/types";
import type { SecurityLevelAssessment } from "./securityLevels";
import type { RiskAssessment } from "./risk";

const CATEGORIES: ScoreCategory[] = [
  "segmentation",
  "remoteAccess",
  "identity",
  "monitoring",
  "resilience",
  "legacyExposure",
  "safetyImpact",
  "documentation"
];

function assessment(scores: Partial<Record<ScoreCategory, number>>): SecurityAssessment {
  return {
    overallScore: 50,
    band: "fair",
    categoryScores: CATEGORIES.map((category) => ({ category, label: category, score: scores[category] ?? 50, summary: "" })),
    findings: [],
    coverage: { assets: 4, conduits: 3, zonesModelled: 2, sufficient: true }
  };
}

function securityLevels(level: number): SecurityLevelAssessment {
  return {
    zones: [
      {
        zone: "level1",
        target: 3,
        achieved: level,
        frLevels: { FR1: level, FR2: level, FR3: level, FR4: level, FR5: level, FR6: level, FR7: level },
        limiting: [],
        modelled: true
      }
    ]
  };
}

const emptyRisk: RiskAssessment = { assets: [], matrix: [] };

function project(overrides: Partial<OtProject> = {}): OtProject {
  return {
    schemaVersion: 2,
    id: "p",
    name: "P",
    updatedAt: "",
    assets: [],
    conduits: [],
    assumptions: [],
    ...overrides
  };
}

const find = (caf: ReturnType<typeof assessCaf>, id: string) => caf.principles.find((principle) => principle.id === id)!;

describe("assessCaf", () => {
  it("derives Not Achieved for weak identity (B2) and Achieved for strong", () => {
    const weak = assessCaf(project(), assessment({ identity: 10, remoteAccess: 10 }), securityLevels(0), emptyRisk);
    expect(find(weak, "B2").status).toBe("not-achieved");

    const strong = assessCaf(project(), assessment({ identity: 95, remoteAccess: 95 }), securityLevels(3), emptyRisk);
    expect(find(strong, "B2").status).toBe("achieved");
  });

  it("leaves governance/people principles Not Assessed", () => {
    const caf = assessCaf(project(), assessment({}), securityLevels(3), emptyRisk);
    for (const id of ["A1", "B1", "B6", "C2", "D2"]) {
      expect(find(caf, id).status).toBe("not-assessed");
    }
  });

  it("lets a consultant override the derived status", () => {
    const caf = assessCaf(
      project({ cafOverrides: { B2: { status: "achieved", note: "Compensating control documented" } } }),
      assessment({ identity: 10, remoteAccess: 10 }),
      securityLevels(0),
      emptyRisk
    );
    const b2 = find(caf, "B2");
    expect(b2.status).toBe("achieved");
    expect(b2.derivedStatus).toBe("not-achieved");
    expect(b2.overridden).toBe(true);
    expect(b2.note).toBe("Compensating control documented");
  });

  it("computes posture over assessed principles only, excluding not-assessed", () => {
    const strong = assessCaf(project(), assessment(Object.fromEntries(CATEGORIES.map((c) => [c, 95]))), securityLevels(3), emptyRisk);
    expect(strong.principles.filter((p) => p.status === "not-assessed")).toHaveLength(5);
    expect(strong.postureScore).toBe(100);

    const objectiveB = strong.objectives.find((objective) => objective.id === "B")!;
    expect(objectiveB.achieved).toBe(4);
    expect(objectiveB.notAssessed).toBe(2);
  });
});
