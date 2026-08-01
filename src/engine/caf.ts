import { categoryLabels } from "../data/catalog";
import { cafObjectives, cafPrinciple, cafPrinciples } from "../data/caf";
import type {
  CafObjectiveId,
  CafPrincipleId,
  CafStatus,
  OtProject,
  ScoreCategory,
  SecurityAssessment
} from "../models/types";
import { MAX_SL, type FoundationalRequirement, type SecurityLevelAssessment } from "./securityLevels";
import type { RiskAssessment } from "./risk";

export interface CafPrincipleResult {
  id: CafPrincipleId;
  status: CafStatus;
  derivedStatus: CafStatus;
  overridden: boolean;
  note?: string;
  rationale: string;
  gap: string;
  findingIds: string[];
}

export interface CafObjectiveResult {
  id: CafObjectiveId;
  achieved: number;
  partial: number;
  notAchieved: number;
  notAssessed: number;
}

export interface CafAssessment {
  principles: CafPrincipleResult[];
  objectives: CafObjectiveResult[];
  /** % of *assessed* principles achieved (partial counts half); not-assessed excluded. */
  postureScore: number;
}

// Governance / people outcomes a topology tool cannot evidence — the consultant attests these.
const GOVERNANCE_PRINCIPLES = new Set<CafPrincipleId>(["A1", "B1", "B6", "C2", "D2"]);

const PRINCIPLE_CATEGORIES: Partial<Record<CafPrincipleId, ScoreCategory[]>> = {
  A2: ["documentation"],
  A3: ["documentation"],
  A4: ["remoteAccess"],
  B2: ["identity", "remoteAccess"],
  B3: ["legacyExposure"],
  B4: ["legacyExposure"],
  B5: ["segmentation"],
  C1: ["monitoring"],
  D1: ["resilience"]
};

const PRINCIPLE_FR: Partial<Record<CafPrincipleId, FoundationalRequirement>> = {
  B2: "FR1",
  B3: "FR4",
  B4: "FR3",
  B5: "FR5",
  C1: "FR6",
  D1: "FR7"
};

const PRINCIPLE_GAP: Record<CafPrincipleId, string> = {
  A1: "Confirm a senior accountable owner and OT security governance with assurance reporting.",
  A2: "Record treatment decisions, owners and residual risk for the high and critical risks.",
  A3: "Complete the OT asset inventory (address, owner, make/model/firmware, criticality).",
  A4: "Broker vendor access through a monitored jump host with MFA and contractual security.",
  B1: "Define and follow OT secure-configuration, change-control and media procedures.",
  B2: "Enforce MFA on remote/privileged access and remove default credentials; apply least privilege.",
  B3: "Eliminate cleartext legacy protocols across boundaries; encrypt and inspect sensitive flows.",
  B4: "Address obsolete/end-of-life assets, patching and secure configuration; compensate where needed.",
  B5: "Tighten zone segmentation and cross-boundary conduits so a compromise cannot cascade.",
  B6: "Provide role-based OT security awareness and incident-reporting training.",
  C1: "Add passive OT monitoring and centralised logging across hosts and conduits.",
  C2: "Introduce proactive anomaly review / threat hunting proportionate to the environment.",
  D1: "Validate OT backups and test incident response and recovery of the essential function.",
  D2: "Run post-incident reviews and feed lessons back into controls and training."
};

function statusFromCoverage(coverage: number): CafStatus {
  if (coverage >= 0.75) {
    return "achieved";
  }
  if (coverage >= 0.45) {
    return "partial";
  }
  return "not-achieved";
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Maps declared architecture, indicative FR signals and risk into an advisory NCSC CAF evidence view. */
export function assessCaf(
  project: OtProject,
  assessment: SecurityAssessment,
  securityLevels: SecurityLevelAssessment,
  risk: RiskAssessment
): CafAssessment {
  const overrides = project.cafOverrides ?? {};
  const treatments = project.riskTreatments ?? {};
  const categoryScore = new Map(assessment.categoryScores.map((category) => [category.category, category.score]));
  // Only zones the project actually declares assets in. An unmodelled zone has a vacuously
  // satisfied ladder, so including it would let an absent zone set the floor for every principle.
  const frMin = (fr: FoundationalRequirement) => {
    const modelled = securityLevels.zones.filter((zone) => zone.modelled);
    return modelled.length > 0 ? Math.min(...modelled.map((zone) => zone.frLevels[fr])) : 0;
  };

  const principles: CafPrincipleResult[] = cafPrinciples.map((principle) => {
    const categories = PRINCIPLE_CATEGORIES[principle.id];
    const findingIds = categories
      ? assessment.findings.filter((finding) => categories.includes(finding.category)).map((finding) => finding.id)
      : [];

    let derivedStatus: CafStatus;
    let rationale: string;

    if (GOVERNANCE_PRINCIPLES.has(principle.id)) {
      derivedStatus = "not-assessed";
      rationale = "Governance / people outcome: record a status in the engagement review.";
    } else if (principle.id === "A2") {
      const documentation = (categoryScore.get("documentation") ?? 0) / 100;
      const elevated = risk.assets.filter((asset) => asset.band === "high" || asset.band === "critical");
      const treated = elevated.filter((asset) => treatments[asset.assetId]).length;
      const treatmentCoverage = elevated.length > 0 ? treated / elevated.length : 1;
      derivedStatus = statusFromCoverage(0.5 * documentation + 0.5 * treatmentCoverage);
      rationale = `${elevated.length} high/critical risks, ${treated} with a recorded treatment.`;
    } else if (categories) {
      const categoryAverage = average(categories.map((category) => (categoryScore.get(category) ?? 0) / 100));
      const fr = PRINCIPLE_FR[principle.id];
      const coverage = fr ? 0.6 * categoryAverage + 0.4 * (frMin(fr) / MAX_SL) : categoryAverage;
      derivedStatus = statusFromCoverage(coverage);
      const labels = categories.map((category) => categoryLabels[category]).join(" / ");
      rationale = fr
        ? `${labels} ~${Math.round(categoryAverage * 100)}/100; ${fr} weakest level ${frMin(fr)}/${MAX_SL}.`
        : `${labels} ~${Math.round(categoryAverage * 100)}/100.`;
    } else {
      derivedStatus = "not-assessed";
      rationale = "Not evidenced by the current model.";
    }

    const override = overrides[principle.id];
    const status = override ? override.status : derivedStatus;
    return {
      id: principle.id,
      status,
      derivedStatus,
      overridden: Boolean(override),
      note: override?.note,
      rationale,
      gap: status === "achieved" || status === "not-assessed" ? "" : PRINCIPLE_GAP[principle.id],
      findingIds
    };
  });

  const objectives: CafObjectiveResult[] = cafObjectives.map((objective) => {
    const inObjective = principles.filter((result) => cafPrinciple(result.id).objective === objective.id);
    return {
      id: objective.id,
      achieved: inObjective.filter((result) => result.status === "achieved").length,
      partial: inObjective.filter((result) => result.status === "partial").length,
      notAchieved: inObjective.filter((result) => result.status === "not-achieved").length,
      notAssessed: inObjective.filter((result) => result.status === "not-assessed").length
    };
  });

  const assessed = principles.filter((result) => result.status !== "not-assessed");
  const achievedWeight = assessed.reduce(
    (sum, result) => sum + (result.status === "achieved" ? 1 : result.status === "partial" ? 0.5 : 0),
    0
  );
  const postureScore = assessed.length > 0 ? Math.round((achievedWeight / assessed.length) * 100) : 0;

  return { principles, objectives, postureScore };
}
