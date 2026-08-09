import { describe, expect, it } from "vitest";
import { buildMapReport } from "./mapReport";
import { mapReportMarkdown } from "./mapReportMarkdown";
import { projectMap } from "./mapProjection";
import { parseNmapNormal } from "../import/nmapText";
import { SAMPLE_SCAN } from "../data/sampleScan";
import { newCyberMap, newImportSource, nextMapSequence, type CyberMapDocument } from "../models/cyberMap";
import { newItEvent } from "../models/itEngagement";

function withSample(name = "sample.txt"): CyberMapDocument {
  const base = newCyberMap("Test estate");
  return {
    ...base,
    sources: [
      newImportSource(parseNmapNormal(SAMPLE_SCAN), name, nextMapSequence(base), {
        kind: "external",
        label: "External"
      })
    ]
  };
}

function withCompromise(doc: CyberMapDocument): CyberMapDocument {
  const projected = projectMap(doc);
  const target = projected.assets.find((asset) => asset.zone === "level2") ?? projected.assets[0];
  return {
    ...doc,
    events: [
      newItEvent("exploit", "Exploited MySQL", nextMapSequence(doc), {
        targetNodeId: target.id,
        grants: "admin"
      })
    ]
  };
}

describe("the engagement report over a converged estate", () => {
  it("reads an empty document without inventing a document", () => {
    const report = buildMapReport(newCyberMap("Nothing"));
    expect(report.stages).toEqual([]);
    expect(report.access).toEqual([]);
    expect(report.summary.assets).toBe(0);
  });

  it("interleaves imports and actions in one sequence", () => {
    const report = buildMapReport(withCompromise(withSample()));
    const sequences = report.stages.map((stage) => stage.sequence);

    expect(report.stages.map((stage) => stage.kind)).toContain("source");
    expect(report.stages.map((stage) => stage.kind)).toContain("event");
    expect([...sequences].sort((a, b) => a - b)).toEqual(sequences);
  });

  it("reconciles what an import revealed with what the map draws", () => {
    // The arithmetic hole the IT report had: counting `parsed.hosts` disagrees with what is drawn,
    // because a traceroute names routers that are never host records. Every number in this document
    // is supposed to add up.
    const report = buildMapReport(withSample());
    const [stage] = report.stages;
    const revealed = stage.revealed.length;
    const imported = projectMap(withSample()).assets.filter((asset) => asset.sourceIds.length > 0).length;

    expect(revealed).toBe(imported);
    expect(stage.detail).toContain(`${revealed} newly revealed`);
  });

  it("credits an import only with what it observed, never with what was inferred", () => {
    const report = buildMapReport(withSample());
    const inferred = projectMap(withSample()).assets.filter((asset) => asset.sourceIds.length === 0);

    expect(inferred.length).toBeGreaterThan(0);
    for (const asset of inferred) {
      expect(report.stages[0].revealed).not.toContain(asset.name);
    }
  });
});

describe("the OT vocabulary the IT report could not write", () => {
  const report = buildMapReport(withCompromise(withSample()));

  it("says which Purdue level each accessed asset sits in", () => {
    expect(report.access.length).toBeGreaterThan(0);
    for (const row of report.access) {
      expect(row.zone).toBeTruthy();
      expect(row.zone).not.toBe("—");
    }
  });

  it("names the deepest level reached, which is the whole point of merging the two models", () => {
    expect(report.summary.deepestZoneReached).toBe("Supervisory Control");
  });

  it("reports every level, and says which ones hold nothing rather than scoring them", () => {
    // An empty zone satisfies every 62443 ladder rung vacuously, so a signal of 0 would read as a
    // measurement rather than as the absence of one.
    expect(report.zones.some((zone) => !zone.modelled)).toBe(true);
    expect(report.negativeSpace.some((line) => /unassessed, not clear/.test(line))).toBe(true);
  });

  it("leaves the internet out of the level table, since it is not a zone of the system", () => {
    expect(report.zones.some((zone) => zone.zone === "internet")).toBe(false);
  });

  it("lists the connections that cross a level, with the rule nobody could produce", () => {
    expect(report.crossings.length).toBeGreaterThan(0);
    for (const crossing of report.crossings) {
      expect(crossing.fromZone).not.toBe(crossing.toZone);
      expect(crossing.firewallRule).toBeTruthy();
    }
  });
});

describe("the summary cannot contradict the sections under it", () => {
  const doc = withCompromise(withSample());
  const report = buildMapReport(doc);

  it("counts the assets the map actually drew", () => {
    expect(report.summary.assets).toBe(projectMap(doc).assets.length);
  });

  it("takes the highest access from the journal rather than from a second tally", () => {
    expect(report.summary.highestAccess).toBe("admin");
    expect(report.access[0].access).toBe("admin");
  });

  it("names every import in the provenance table", () => {
    expect(report.provenance).toHaveLength(doc.sources.length);
    expect(report.provenance[0].name).toBe("sample.txt");
  });

  it("says out loud that a scan only reports what answered", () => {
    expect(report.negativeSpace.some((line) => /what answered when it ran/.test(line))).toBe(true);
  });

  it("says when nothing was done, rather than letting an empty timeline imply it", () => {
    expect(buildMapReport(withSample()).negativeSpace.some((line) => /No actions were recorded/.test(line))).toBe(true);
  });
});

describe("as Markdown", () => {
  const markdown = mapReportMarkdown(buildMapReport(withCompromise(withSample())));

  it("carries every section the structure has", () => {
    for (const heading of [
      "## Summary",
      "## Timeline",
      "## Access held",
      "## Purdue levels",
      "## Level crossings",
      "## Findings",
      "## What this does not cover",
      "## Provenance"
    ]) {
      expect(markdown).toContain(heading);
    }
  });

  it("writes an unmodelled level as unmodelled rather than as a signal of zero", () => {
    expect(markdown).toContain("not modelled");
  });

  it("traces every claim back to a named import", () => {
    expect(markdown).toContain("sample.txt");
    expect(markdown).toContain("Every claim in this document traces to a named import or a recorded action.");
  });
});
