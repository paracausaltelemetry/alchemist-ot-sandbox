// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ItApp } from "./ItApp";
import { synthesiseItTopology } from "../engine/itTopology";
import { parseNmapNormal } from "../import/nmapText";
import { SAMPLE_SCAN } from "../data/sampleScan";

/** One integration test over the whole IT pipeline: scan text in, drawn map out. */
async function loadSample() {
  const user = userEvent.setup();
  const view = render(<ItApp onGoHome={() => {}} onSwitchView={() => {}} theme="dark" onToggleTheme={() => {}} isMobile={false} />);
  await user.click(screen.getByRole("button", { name: /load sample/i }));
  return { user, container: view.container };
}

describe("ItApp", () => {
  // The engagement now persists, so each test starts from an empty browser rather than
  // inheriting whatever the previous one imported.
  beforeEach(() => localStorage.clear());

  it("starts on the empty state", () => {
    render(<ItApp onGoHome={() => {}} onSwitchView={() => {}} theme="dark" onToggleTheme={() => {}} isMobile={false} />);
    expect(screen.getByRole("heading", { name: /map a network from an nmap scan/i })).toBeInTheDocument();
  });

  it("maps the sample scan into a network map and an analysis", async () => {
    await loadSample();

    expect(screen.getByRole("region", { name: "Network map" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "IT network analysis" })).toBeInTheDocument();

    const expected = synthesiseItTopology(parseNmapNormal(SAMPLE_SCAN));
    const hosts = expected.nodes.filter((node) => node.tier === "host" && node.origin === "scanned").length;
    expect(screen.getByText(String(hosts)).closest(".canvas-stats")).toBeTruthy();
  });

  it("inspects a link when one is clicked", async () => {
    // Clicking a link already highlighted it on the canvas, but the detail panel searched only
    // `map.nodes` for the selected id, so a link selection produced an empty panel.
    const { container } = await loadSample();

    const hitbox = container.querySelector(".conduit-overlay-hitbox");
    expect(hitbox, "no link drawn to click").toBeTruthy();
    // `fireEvent`, not `userEvent`: a full pointer sequence reaches React Flow's d3-zoom pan
    // handler, which touches `document` through a global d3 keeps and throws under jsdom.
    fireEvent.click(hitbox as Element);

    expect(screen.getByRole("heading", { name: "Link" })).toBeInTheDocument();
    expect(screen.getByText("Evidence")).toBeInTheDocument();
  });

  it("restores the map after a reload", async () => {
    // The whole point of the engagement document: before it, every import was lost on refresh.
    await loadSample();
    expect(screen.getByRole("region", { name: "Network map" })).toBeInTheDocument();

    cleanup();
    render(<ItApp onGoHome={() => {}} onSwitchView={() => {}} theme="dark" onToggleTheme={() => {}} isMobile={false} />);

    expect(screen.getByRole("region", { name: "Network map" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /map a network from an nmap scan/i })).not.toBeInTheDocument();
  });

  it("keeps nothing after the map is cleared", async () => {
    // Clearing is behind a confirmation now: it is the one action undo deliberately cannot reverse.
    const { user } = await loadSample();
    await user.click(screen.getByRole("button", { name: /^clear$/i }));
    await user.click(screen.getByRole("button", { name: /^clear it$/i }));

    cleanup();
    render(<ItApp onGoHome={() => {}} onSwitchView={() => {}} theme="dark" onToggleTheme={() => {}} isMobile={false} />);

    expect(screen.getByRole("heading", { name: /map a network from an nmap scan/i })).toBeInTheDocument();
  });

  it("says when the links are traced rather than inferred", async () => {
    await loadSample();
    // The sample carries a traceroute, so the map should not claim everything is inferred.
    expect(screen.getByText(/solid links were traced by the scan/i)).toBeInTheDocument();
  });
});
