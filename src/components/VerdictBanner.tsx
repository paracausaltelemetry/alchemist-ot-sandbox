import type { Finding, SecurityAssessment } from "../models/types";
import { buildVerdict } from "../lib/verdict";
import { ScoreGauge } from "./ScoreGauge";

interface VerdictBannerProps {
  assessment: SecurityAssessment;
  onFindingSelect?: (finding: Finding) => void;
}

/**
 * The security-rating hero used in the Rating tab: the gauge alongside a
 * plain-language verdict and the two most urgent findings, each linking to the
 * affected conduits on the canvas.
 */
export function VerdictBanner({ assessment, onFindingSelect }: VerdictBannerProps) {
  const verdict = buildVerdict(assessment);
  const topFindings = assessment.findings.slice(0, 2);

  return (
    <div className="verdict-banner">
      <ScoreGauge score={assessment.overallScore} band={assessment.band} size={132} thickness={6} label={assessment.band} />
      <div className="verdict-body">
        <strong className="verdict-headline">{verdict.headline}</strong>
        <span className="verdict-detail">{verdict.detail}</span>
        {topFindings.length > 0 ? (
          <ul className="verdict-findings">
            {topFindings.map((finding) => (
              <li key={finding.id}>
                {onFindingSelect ? (
                  <button
                    type="button"
                    className={`verdict-finding severity-${finding.severity}`}
                    onClick={() => onFindingSelect(finding)}
                  >
                    <span>{finding.severity}</span>
                    {finding.title}
                  </button>
                ) : (
                  <div className={`verdict-finding severity-${finding.severity}`}>
                    <span>{finding.severity}</span>
                    {finding.title}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
