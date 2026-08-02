import { assessProject } from "./scoring";
import { assessRisk, countHighRisk } from "./risk";
import type { Finding, OtProject, ScoreCategory } from "../models/types";

/**
 * Compares a baseline snapshot against the current model to show remediation impact: the overall and
 * per-category score movement, the risk-band movement, and which findings were fixed or introduced
 * (matched by their stable id). Pure; reuses the assessment and risk engines.
 */

export interface CategoryDelta {
  category: ScoreCategory;
  label: string;
  baseline: number;
  current: number;
  delta: number;
}

export interface BaselineDiff {
  baselineScore: number;
  currentScore: number;
  scoreDelta: number;
  categories: CategoryDelta[];
  fixed: Finding[];
  introduced: Finding[];
  baselineHighRisk: number;
  currentHighRisk: number;
}

function highRiskCount(project: OtProject): number {
  return countHighRisk(assessRisk(project));
}

export function diffAssessments(baseline: OtProject, current: OtProject): BaselineDiff {
  const base = assessProject(baseline);
  const cur = assessProject(current);
  const baseFindingIds = new Set(base.findings.map((finding) => finding.id));
  const curFindingIds = new Set(cur.findings.map((finding) => finding.id));
  const baseScoreByCategory = new Map(base.categoryScores.map((entry) => [entry.category, entry.score]));

  return {
    baselineScore: base.overallScore,
    currentScore: cur.overallScore,
    scoreDelta: cur.overallScore - base.overallScore,
    categories: cur.categoryScores.map((entry) => {
      const baselineScore = baseScoreByCategory.get(entry.category) ?? entry.score;
      return {
        category: entry.category,
        label: entry.label,
        baseline: baselineScore,
        current: entry.score,
        delta: entry.score - baselineScore
      };
    }),
    fixed: base.findings.filter((finding) => !curFindingIds.has(finding.id)),
    introduced: cur.findings.filter((finding) => !baseFindingIds.has(finding.id)),
    baselineHighRisk: highRiskCount(baseline),
    currentHighRisk: highRiskCount(current)
  };
}
