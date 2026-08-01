import { describe, expect, it } from "vitest";
import { buildItMapSvg } from "./itExporters";
import { synthesiseItTopology } from "../engine/itTopology";
import { parseNmapNormal } from "../import/nmapText";
import { SAMPLE_SCAN } from "../data/sampleScan";

const map = synthesiseItTopology(parseNmapNormal(SAMPLE_SCAN), "Scanned network");

describe("buildItMapSvg", () => {
  it("draws one group per node and one line per link", () => {
    const svg = buildItMapSvg(map);
    expect(svg.match(/<g transform="translate\(/g) ?? []).toHaveLength(map.nodes.length);
    expect(svg.match(/<line /g) ?? []).toHaveLength(map.links.length);
  });

  it("carries no OT framing", () => {
    const svg = buildItMapSvg(map);
    // The OT exporter paints Purdue bands and an advisory score over whatever it is given.
    expect(svg).not.toContain("Level 5");
    expect(svg).not.toContain("/100");
    expect(svg).not.toMatch(/Purdue/i);
  });

  it("distinguishes inferred links from traced ones", () => {
    const svg = buildItMapSvg(map);
    expect(svg).toContain("stroke-dasharray");
    expect(svg).toMatch(/traced link/);
  });

  it("escapes markup in names", () => {
    const svg = buildItMapSvg({
      ...map,
      name: "Acme & <Co>",
      nodes: [{ ...map.nodes[0], name: "we<b>ird & co" }],
      links: []
    });
    expect(svg).toContain("Acme &amp; &lt;Co&gt;");
    expect(svg).toContain("we&lt;b&gt;ird &amp; co");
    expect(svg).not.toContain("<b>");
  });
});
