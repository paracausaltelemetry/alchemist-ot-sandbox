// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MethodologyPanel } from "./MethodologyPanel";
import { categoryWeights, scoreBands, severityDeduction } from "../engine/scoring";
import { categoryLabels } from "../data/catalog";
import type { ScoreCategory, Severity } from "../models/types";

/**
 * The panel's stated purpose is that the published methodology cannot drift from the engine,
 * because it renders the live constants. That was a convention; these tests make it a guarantee —
 * adding a category or a severity without documenting it now fails CI.
 */
describe("MethodologyPanel", () => {
  it("documents every scoring category and its weight", () => {
    render(<MethodologyPanel open onClose={() => {}} />);

    for (const key of Object.keys(categoryWeights) as ScoreCategory[]) {
      expect(screen.getByText(categoryLabels[key])).toBeInTheDocument();
      // Rendered as a percentage; several categories can share a weight, so match any.
      expect(screen.getAllByText(`${Math.round(categoryWeights[key] * 100)}%`).length).toBeGreaterThan(0);
    }
  });

  it("documents every severity level", () => {
    render(<MethodologyPanel open onClose={() => {}} />);

    for (const severity of Object.keys(severityDeduction) as Severity[]) {
      expect(screen.getAllByText(new RegExp(severity, "i")).length).toBeGreaterThan(0);
    }
  });

  it("documents every score band by name", () => {
    render(<MethodologyPanel open onClose={() => {}} />);

    for (const entry of scoreBands) {
      expect(screen.getAllByText(new RegExp(entry.label, "i")).length).toBeGreaterThan(0);
    }
  });

  it("renders nothing when closed", () => {
    const { container } = render(<MethodologyPanel open={false} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
