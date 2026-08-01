// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ItApp } from "./ItApp";
import { synthesiseItTopology } from "../engine/itTopology";
import { parseNmapNormal } from "../import/nmapText";
import { SAMPLE_SCAN } from "../data/sampleScan";

/** One integration test over the whole IT pipeline: scan text in, drawn map out. */
async function loadSample() {
  const user = userEvent.setup();
  render(<ItApp onGoHome={() => {}} theme="dark" onToggleTheme={() => {}} isMobile={false} />);
  await user.click(screen.getByRole("button", { name: /load sample/i }));
  return user;
}

describe("ItApp", () => {
  it("starts on the empty state", () => {
    render(<ItApp onGoHome={() => {}} theme="dark" onToggleTheme={() => {}} isMobile={false} />);
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

  it("says when the links are traced rather than inferred", async () => {
    await loadSample();
    // The sample carries a traceroute, so the map should not claim everything is inferred.
    expect(screen.getByText(/solid links were traced by the scan/i)).toBeInTheDocument();
  });
});
