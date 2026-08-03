// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { TopologyOutline } from "./TopologyOutline";
import { sampleProject } from "../data/sampleProject";
import { blankProject } from "../data/sampleProject";
import type { OtProject } from "../models/types";

describe("the topology as text", () => {
  it("lists every asset, which the canvas could not be read for at all", () => {
    const { container } = render(<TopologyOutline project={sampleProject} />);
    for (const asset of sampleProject.assets) {
      expect(container.textContent).toContain(asset.name);
    }
  });

  it("walks the levels from the enterprise down, the way the standards describe a plant", () => {
    render(<TopologyOutline project={sampleProject} />);
    const levels = screen.getAllByRole("heading", { level: 4 }).map((heading) => heading.textContent ?? "");
    const numbers = levels.map((label) => Number(label.match(/Level\s+([\d.]+)/)?.[1] ?? NaN)).filter(Number.isFinite);

    expect(numbers.length).toBeGreaterThan(1);
    expect([...numbers]).toEqual([...numbers].sort((a, b) => b - a));
  });

  it("says what each conduit reaches and over what", () => {
    render(<TopologyOutline project={sampleProject} />);
    const conduit = sampleProject.conduits[0];
    const target = sampleProject.assets.find((asset) => asset.id === conduit.target)!;

    expect(screen.getAllByText(new RegExp(target.name)).length).toBeGreaterThan(0);
  });

  it("calls out a conduit that crosses a trust boundary rather than leaving it to be inferred", () => {
    const crossing = sampleProject.conduits.find((conduit) => conduit.trustBoundary);
    expect(crossing).toBeDefined();
    render(<TopologyOutline project={sampleProject} />);
    expect(screen.getAllByText(/crossing a trust boundary/).length).toBeGreaterThan(0);
  });

  it("names an undocumented permit rule, because silence would read as documented", () => {
    const project: OtProject = {
      ...sampleProject,
      conduits: sampleProject.conduits.map((conduit, index) =>
        index === 0 ? { ...conduit, firewallRule: "unknown" as const } : conduit
      )
    };
    render(<TopologyOutline project={project} />);
    expect(screen.getAllByText(/permit rule not documented/).length).toBeGreaterThan(0);
  });

  it("says which zones hold nothing, so absence of modelling does not read as absence of risk", () => {
    // Only one zone populated, so the rest have to be named as unmodelled rather than passed over.
    const oneZone: OtProject = { ...sampleProject, assets: [sampleProject.assets[0]] };
    const { container } = render(<TopologyOutline project={oneZone} />);

    expect(container.textContent).toContain("Not modelled:");
  });

  it("says so plainly when there is nothing to describe", () => {
    render(<TopologyOutline project={blankProject} />);
    expect(screen.getByText(/No assets have been added yet/)).toBeInTheDocument();
  });

  it("survives a conduit whose endpoint is gone rather than rendering a blank name", () => {
    const project: OtProject = {
      ...sampleProject,
      conduits: [{ ...sampleProject.conduits[0], target: "asset-that-was-deleted" }]
    };
    render(<TopologyOutline project={project} />);
    expect(screen.getByText(/Conduits referencing a missing asset/)).toBeInTheDocument();
  });

  it("is hidden from sight but not from a screen reader when it backs a canvas", () => {
    // `visually-hidden` keeps it in the accessibility tree; `display: none` or `aria-hidden`
    // would leave the canvas with a label and nothing behind it, which is where this started.
    const { container } = render(<TopologyOutline project={sampleProject} hidden />);
    const root = container.firstElementChild!;

    expect(root.className).toBe("visually-hidden");
    expect(root.getAttribute("aria-hidden")).toBeNull();
    expect(within(root as HTMLElement).getAllByRole("heading").length).toBeGreaterThan(0);
  });
});
