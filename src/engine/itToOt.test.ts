import { describe, expect, it } from "vitest";
import { promoteToOtProject } from "./itToOt";
import { synthesiseItTopology } from "./itTopology";
import { parseNmapNormal } from "../import/nmapText";
import { SAMPLE_SCAN } from "../data/sampleScan";
import { getAssetType } from "../data/catalog";

const map = synthesiseItTopology(parseNmapNormal(SAMPLE_SCAN), "Scanned network");
const { project, dropped } = promoteToOtProject(map);

describe("promoteToOtProject", () => {
  it("carries every scanned device across and leaves the inferred ones behind", () => {
    const scanned = map.nodes.filter((node) => node.origin === "scanned");
    expect(project.assets).toHaveLength(scanned.length);
    expect(dropped.syntheticNodes).toBe(map.nodes.length - scanned.length);
    expect(project.assets.map((asset) => asset.name)).not.toContain("Internet");
  });

  it("maps every device class onto a real OT asset type", () => {
    for (const asset of project.assets) {
      expect(getAssetType(asset.type).id).toBe(asset.type);
    }
  });

  it("claims no security controls, because a scan cannot see them", () => {
    for (const asset of project.assets) {
      expect(Object.values(asset.controls).every((enabled) => enabled === false)).toBe(true);
    }
  });

  it("never places a scanned host in a control zone", () => {
    // A scan has no idea what is process-critical; guessing L0-L2 would assert something false.
    for (const asset of project.assets) {
      expect(["level0", "level1", "level2"]).not.toContain(asset.zone);
    }
  });

  it("records observed links as conduits with an unknown rule", () => {
    expect(project.conduits.length).toBeGreaterThan(0);
    for (const conduit of project.conduits) {
      expect(conduit.firewallRule).toBe("unknown");
      expect(conduit.inspected).toBe(false);
      expect(conduit.notes).toMatch(/unreviewed/i);
    }
  });

  it("drops links that pointed at something inferred", () => {
    const kept = new Set(map.nodes.filter((node) => node.origin === "scanned").map((node) => node.id));
    const expected = map.links.filter((link) => !kept.has(link.source) || !kept.has(link.target)).length;
    expect(dropped.links).toBe(expected);
  });

  it("says in the notes that the import is unreviewed", () => {
    expect(project.assets.every((asset) => /unreviewed/i.test(asset.notes))).toBe(true);
  });

  it("does not disturb the assessments already saved", () => {
    // A fresh id every time, so promoting twice never overwrites a previous one.
    expect(promoteToOtProject(map).project.id).not.toBe(project.id);
  });
});
