// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Root } from "./Root";

// The hero uses WebGL, which jsdom has no context for; stub it out.
vi.mock("../lib/heroDither", () => ({ initHeroDither: () => {} }));

function setViewport(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  window.localStorage.clear();
  window.location.hash = "";
});
afterEach(() => vi.restoreAllMocks());

describe("Root", () => {
  it("renders the dashboard with a desktop-only note below the breakpoint", () => {
    setViewport(true);
    render(<Root />);
    expect(screen.getByText(/canvas is desktop-only/i)).toBeInTheDocument();
    // The dashboard itself still renders, not a bare gate.
    expect(screen.getAllByRole("button", { name: /start a map|open the map/i }).length).toBeGreaterThan(0);
  });

  it("does not show the desktop-only note on a wide viewport at home", () => {
    setViewport(false);
    render(<Root />);
    expect(screen.queryByText(/canvas is desktop-only/i)).not.toBeInTheDocument();
  });

  it("lands on the map for a link into either of the two apps it replaced", () => {
    setViewport(false);
    window.location.hash = "#app";
    render(<Root />);
    expect(screen.getByRole("complementary", { name: /sources and assets/i })).toBeInTheDocument();
  });
});
