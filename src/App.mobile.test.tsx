// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "./App";

vi.mock("./lib/heroDither", () => ({ initHeroDither: () => {} }));

beforeEach(() => {
  window.localStorage.clear();
  window.location.hash = "app";
});
afterEach(() => vi.restoreAllMocks());

const noop = () => {};

describe("App read-only mobile", () => {
  // Only the mobile (canvas-free) path is asserted here; the desktop path mounts
  // React Flow, which needs a real layout engine and is out of scope for jsdom.
  it("replaces the topology canvas with a desktop-only notice and keeps analysis", () => {
    render(<App onGoHome={noop} onSwitchView={noop} theme="dark" onToggleTheme={noop} isMobile />);
    expect(screen.getByRole("note")).toHaveTextContent(/topology editing is desktop-only/i);
    // The analysis/assessment surface is still present read-only.
    expect(document.querySelector(".analysis-panel")).toBeTruthy();
    // No editing palette on mobile.
    expect(document.querySelector(".asset-palette")).toBeNull();
  });
});
