import type { Finding, SecurityAssessment } from "../../models/types";
import { VerdictBanner } from "../VerdictBanner";

interface RatingTabProps {
  assessment: SecurityAssessment;
  onFindingSelect: (finding: Finding) => void;
}

export function RatingTab({ assessment, onFindingSelect }: RatingTabProps) {
  return (
    <div className="analysis-content rating-stack">
      <VerdictBanner assessment={assessment} onFindingSelect={onFindingSelect} />
      <div className="category-list">
        {assessment.categoryScores.map((category) => (
          <div className="category-row" key={category.category}>
            <div>
              <strong>{category.label}</strong>
              <span>{category.summary}</span>
            </div>
            <div className="bar-track" aria-label={`${category.label} ${category.score} out of 100`}>
              <span style={{ width: `${category.score}%` }} />
            </div>
            <b>{category.score}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
