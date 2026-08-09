// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Dashboard } from "./Dashboard";
import { serializeCyberMap } from "../engine/mapSerialization";
import { newCyberMap, newImportSource, nextMapSequence } from "../models/cyberMap";
import { parseNmapNormal } from "../import/nmapText";
import { SAMPLE_SCAN } from "../data/sampleScan";

function estateWithSample() {
  const base = newCyberMap("Sample estate");
  return {
    ...base,
    sources: [
      newImportSource(parseNmapNormal(SAMPLE_SCAN), "sample.txt", nextMapSequence(base), {
        kind: "external" as const,
        label: "External"
      })
    ]
  };
}

vi.mock("../lib/heroDither", () => ({ initHeroDither: () => {} }));

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

const noop = () => {};

describe("Dashboard", () => {
  it("offers a way in and nothing to read when no estate has been imported", () => {
    // The posture tiles over an empty estate would report a clean bill of health for a map with
    // nothing on it, which is the failure mode this codebase has fixed repeatedly.
    render(<Dashboard onEnter={noop} theme="dark" onToggleTheme={noop} isMobile={false} />);

    expect(screen.queryByText(/current estate/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /start a map/i }).length).toBeGreaterThan(0);
  });

  it("reads the converged document, so the front door and the map cannot disagree", () => {
    window.localStorage.setItem("alchemist-cyber-map", serializeCyberMap(estateWithSample()));

    render(<Dashboard onEnter={noop} theme="dark" onToggleTheme={noop} isMobile={false} />);

    expect(screen.getByText(/current estate/i)).toBeInTheDocument();
    expect(screen.getByText("Assets")).toBeInTheDocument();
    expect(screen.getByText("Findings")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /open the map/i }).length).toBeGreaterThan(0);
  });

  it("says the canvas is desktop-only rather than hiding the assessment on mobile", () => {
    render(<Dashboard onEnter={noop} theme="dark" onToggleTheme={noop} isMobile />);
    expect(screen.getByText(/canvas is desktop-only/i)).toBeInTheDocument();
  });
});
