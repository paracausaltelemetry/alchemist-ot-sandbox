import type { SecurityAssessment } from "../models/types";

const bandHeadline: Record<SecurityAssessment["band"], string> = {
  strong: "Strong posture",
  fair: "Fair posture",
  weak: "Weak posture",
  critical: "Critical exposure",
  insufficient: "Not enough model to rate"
};

export interface Verdict {
  headline: string;
  detail: string;
  criticalCount: number;
  highCount: number;
  weakestCategoryLabel: string | null;
}

/**
 * Derives a plain-language verdict from an assessment for the score hero:
 * a band headline plus the most urgent supporting fact (critical/high counts
 * and the weakest scoring category).
 */
export function buildVerdict(assessment: SecurityAssessment): Verdict {
  const criticalCount = assessment.findings.filter((finding) => finding.severity === "critical").length;
  if (assessment.band === "insufficient") {
    const { assets, conduits } = assessment.coverage;
    return {
      headline: bandHeadline.insufficient,
      detail:
        `${assets} ${assets === 1 ? "asset" : "assets"} and ${conduits} ${conduits === 1 ? "conduit" : "conduits"} declared. ` +
        "Alchemist rates the architecture you declare — an empty model is not a strong one.",
      criticalCount,
      highCount: assessment.findings.filter((finding) => finding.severity === "high").length,
      weakestCategoryLabel: null
    };
  }
  const highCount = assessment.findings.filter((finding) => finding.severity === "high").length;
  const weakest = [...assessment.categoryScores].sort((a, b) => a.score - b.score)[0];
  const weakestCategoryLabel = weakest && weakest.score < 100 ? weakest.label : null;

  let detail: string;
  if (criticalCount > 0) {
    detail = `${criticalCount} critical ${criticalCount === 1 ? "finding" : "findings"}`;
  } else if (highCount > 0) {
    detail = `${highCount} high ${highCount === 1 ? "finding" : "findings"}`;
  } else if (assessment.findings.length > 0) {
    detail = `${assessment.findings.length} advisory ${assessment.findings.length === 1 ? "finding" : "findings"}`;
  } else {
    detail = "No findings in the declared model";
  }

  if (weakestCategoryLabel && assessment.findings.length > 0) {
    detail += ` · ${weakestCategoryLabel} weakest`;
  }

  return {
    headline: bandHeadline[assessment.band],
    detail,
    criticalCount,
    highCount,
    weakestCategoryLabel
  };
}
