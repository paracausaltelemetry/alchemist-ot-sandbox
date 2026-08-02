import { describe, expect, it } from "vitest";
import { projectEngagement } from "./itProjection";
import { parseNmapNormal } from "../import/nmapText";
import { SAMPLE_SCAN } from "../data/sampleScan";
import { newItEngagement, newItScan, type ItEngagement } from "../models/itEngagement";
import { parseItEngagementJson, serializeItEngagement } from "./itSerialization";

function sampleEngagement(): ItEngagement {
  const parsed = parseNmapNormal(SAMPLE_SCAN);
  return { ...newItEngagement("Sample"), scans: [newItScan(parsed, "sample.txt", 1)] };
}

describe("projectEngagement", () => {
  it("draws nothing from an engagement with no scans", () => {
    expect(projectEngagement(newItEngagement())).toEqual({ map: null, analysis: null, parsed: null });
  });

  it("rebuilds the map and the analysis from the scans", () => {
    const { map, analysis } = projectEngagement(sampleEngagement());
    expect(map?.nodes.length).toBeGreaterThan(0);
    expect(map?.links.length).toBeGreaterThan(0);
    expect(analysis?.totalHosts).toBeGreaterThan(0);
  });

  it("is deterministic, so a reload draws the same map", () => {
    const engagement = sampleEngagement();
    const first = projectEngagement(engagement);
    const second = projectEngagement(engagement);
    expect(second.map?.nodes.map((node) => [node.id, node.position])).toEqual(
      first.map?.nodes.map((node) => [node.id, node.position])
    );
  });

  it("puts an authored position back where the operator left it", () => {
    const engagement = sampleEngagement();
    const target = projectEngagement(engagement).map!.nodes[0];
    const moved = { ...engagement, positions: { [target.id]: { x: 4242, y: 2424 } } };

    const node = projectEngagement(moved).map!.nodes.find((entry) => entry.id === target.id);
    expect(node?.position).toEqual({ x: 4242, y: 2424 });
  });

  it("leaves untouched nodes to the layout, so improving the layout improves saved engagements", () => {
    const engagement = sampleEngagement();
    const nodes = projectEngagement(engagement).map!.nodes;
    const moved = { ...engagement, positions: { [nodes[0].id]: { x: 4242, y: 2424 } } };

    const after = projectEngagement(moved).map!.nodes.find((entry) => entry.id === nodes[1].id);
    expect(after?.position).toEqual(nodes[1].position);
  });

  it("ignores a position for a node that no longer exists", () => {
    // The ordinary result of removing a scan, not corruption.
    const engagement = { ...sampleEngagement(), positions: { "it:203.0.113.99": { x: 1, y: 1 } } };
    expect(() => projectEngagement(engagement)).not.toThrow();
    expect(projectEngagement(engagement).map!.nodes.some((node) => node.id === "it:203.0.113.99")).toBe(false);
  });
});

describe("engagement serialization", () => {
  it("round-trips an engagement", () => {
    const engagement = { ...sampleEngagement(), positions: { "it:10.10.2.40": { x: 10, y: 20 } } };
    const parsed = parseItEngagementJson(serializeItEngagement(engagement));

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.engagement.scans).toHaveLength(1);
      expect(parsed.engagement.positions).toEqual({ "it:10.10.2.40": { x: 10, y: 20 } });
      expect(projectEngagement(parsed.engagement).map!.nodes.length).toBe(
        projectEngagement(engagement).map!.nodes.length
      );
    }
  });

  it("rejects a scan with no parse, because nothing can reconstruct the evidence", () => {
    const broken = JSON.parse(serializeItEngagement(sampleEngagement()));
    delete broken.scans[0].parsed;
    const parsed = parseItEngagementJson(JSON.stringify(broken));

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.errors[0]).toMatch(/no parsed hosts/i);
    }
  });

  it("drops a malformed authored position instead of rejecting the engagement", () => {
    // The authored layer is recoverable; the evidence is not. They get opposite treatment.
    const loose = JSON.parse(serializeItEngagement(sampleEngagement()));
    loose.positions = { "it:10.0.0.1": { x: "left", y: 3 }, "it:10.0.0.2": { x: 5, y: 6 } };
    const parsed = parseItEngagementJson(JSON.stringify(loose));

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.engagement.positions).toEqual({ "it:10.0.0.2": { x: 5, y: 6 } });
    }
  });

  it("refuses an engagement written by a newer schema rather than dropping what it holds", () => {
    const future = JSON.parse(serializeItEngagement(sampleEngagement()));
    future.schemaVersion = 99;
    const parsed = parseItEngagementJson(JSON.stringify(future));

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.errors[0]).toMatch(/newer version/i);
    }
  });

  it("rejects text that is not JSON", () => {
    expect(parseItEngagementJson("{not json").ok).toBe(false);
  });
});
