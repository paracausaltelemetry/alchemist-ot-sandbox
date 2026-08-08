// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Dashboard } from "./Dashboard";

vi.mock("../lib/heroDither", () => ({ initHeroDither: () => {} }));

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

const noop = () => {};

describe("Dashboard (desktop)", () => {
  it("renders the posture overview and model-size stats", () => {
    render(<Dashboard onEnter={noop} theme="dark" onToggleTheme={noop} isMobile={false} />);
    expect(screen.getByText(/current assessment/i)).toBeInTheDocument();
    // Model-size aside lists Assets / Conduits / Findings.
    expect(screen.getByText("Assets")).toBeInTheDocument();
    expect(screen.getByText("Findings")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /saved assessments/i })).toBeInTheDocument();
    // The workbench CTA is available on desktop (hero + command list).
    expect(screen.getAllByRole("button", { name: /open workbench/i }).length).toBeGreaterThan(0);
  });

  it("renders the full dashboard on mobile with a desktop-editing note", () => {
    render(<Dashboard onEnter={noop} theme="dark" onToggleTheme={noop} isMobile />);
    // The posture overview is available on mobile (read-only), not gated away.
    expect(screen.getByRole("heading", { name: /saved assessments/i })).toBeInTheDocument();
    expect(screen.getByText(/topology editing is desktop-only/i)).toBeInTheDocument();
    // CTA reads "Open assessment" on mobile rather than "Open workbench".
    expect(screen.getAllByRole("button", { name: /open assessment/i }).length).toBeGreaterThan(0);
  });
});
