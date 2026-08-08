import { useEffect, useState, type CSSProperties } from "react";
import type { SecurityAssessment } from "../models/types";

const RADIUS = 43;
const CENTER = 50;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface ScoreGaugeProps {
  score: number;
  band: SecurityAssessment["band"];
  size?: number;
  thickness?: number;
  label?: string;
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
}

/**
 * Circular advisory-rating gauge. Stays on the monochrome ink/paper brand:
 * the arc is interactive ink and turns signal red only when the posture is
 * weak or critical. The fill animates on mount and on score change, unless the
 * viewer prefers reduced motion.
 */
export function ScoreGauge({ score, band, size = 120, thickness = 7, label }: ScoreGaugeProps) {
  const target = Math.max(0, Math.min(100, Math.round(score)));
  const [filled, setFilled] = useState(() => (prefersReducedMotion() ? target : 0));

  useEffect(() => {
    if (prefersReducedMotion()) {
      setFilled(target);
      return;
    }
    const frame = requestAnimationFrame(() => setFilled(target));
    return () => cancelAnimationFrame(frame);
  }, [target]);

  const offset = CIRCUMFERENCE - (filled / 100) * CIRCUMFERENCE;
  const alert = band === "weak" || band === "critical";
  // A model too sparse to rate has no number. Showing 0 would read as a bad score rather than
  // as an absent one, and showing 100 is what this change exists to stop.
  const unrated = band === "insufficient";

  return (
    <div
      className={`score-gauge${alert ? " is-alert" : ""}`}
      style={{ width: size, height: size, "--gauge-num": `${Math.round(size * 0.32)}px` } as CSSProperties}
      role="img"
      aria-label={unrated ? "Not enough model to produce an advisory rating" : `Advisory security rating ${target} out of 100, ${band}`}
    >
      <svg viewBox="0 0 100 100" className="score-gauge-svg" aria-hidden="true">
        <circle className="score-gauge-track" cx={CENTER} cy={CENTER} r={RADIUS} strokeWidth={thickness} fill="none" />
        <circle
          className="score-gauge-value"
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          strokeWidth={thickness}
          fill="none"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={unrated ? CIRCUMFERENCE : offset}
          transform={`rotate(-90 ${CENTER} ${CENTER})`}
        />
      </svg>
      <div className="score-gauge-readout">
        <strong>{unrated ? "—" : target}</strong>
        {label ? <span>{unrated ? "unrated" : label}</span> : null}
      </div>
    </div>
  );
}
