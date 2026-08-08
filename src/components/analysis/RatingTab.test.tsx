// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RatingTab } from "./RatingTab";
import { assessProject } from "../../engine/scoring";
import { sampleProject } from "../../data/sampleProject";

// Real assessment from the bundled sample keeps the fixture honest — the
// engine is separately unit-tested, so this exercises the view against its
// actual output rather than a hand-rolled shape.
const assessment = assessProject(sampleProject);

describe("RatingTab", () => {
  it("renders a bar for every category score", () => {
    render(<RatingTab assessment={assessment} onFindingSelect={() => {}} />);
    for (const category of assessment.categoryScores) {
      expect(screen.getByText(category.label)).toBeInTheDocument();
      expect(
        screen.getByLabelText(`${category.label} ${category.score} out of 100`)
      ).toBeInTheDocument();
    }
  });

  it("surfaces the overall band verdict", () => {
    render(<RatingTab assessment={assessment} onFindingSelect={() => {}} />);
    // ScoreGauge renders the band label; assert it appears at least once.
    expect(screen.getAllByText(new RegExp(assessment.band, "i")).length).toBeGreaterThan(0);
  });
});
