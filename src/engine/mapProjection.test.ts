import { describe, expect, it } from "vitest";
import { asOtProject, projectMap } from "./mapProjection";
import { parseCyberMapJson, serializeCyberMap } from "./mapSerialization";
import { assessProject } from "./scoring";
import { assessRisk } from "./risk";
import { assessSecurityLevels } from "./securityLevels";
import { parseNmapNormal } from "../import/nmapText";
import { SAMPLE_SCAN } from "../data/sampleScan";
import {
  newCyberMap,
  newImportSource,
  newUserConnection,
  nextMapSequence,
  type CyberMapDocument
} from "../models/cyberMap";
import { newItEvent } from "../models/itEngagement";
import type { ParsedImport } from "../import/types";

function mapWith(...parses: ParsedImport[]): CyberMapDocument {
  return parses.reduce<CyberMapDocument>((doc, parsed, index) => {
    const source = newImportSource(parsed, `source-${index + 1}`, nextMapSequence(doc), {
      kind: "external",
      label: "External"
    });
    return { ...doc, sources: [...doc.sources, source] };
  }, newCyberMap("Test estate"));
}

const sampleMap = () => mapWith(parseNmapNormal(SAMPLE_SCAN));

describe("projecting the estate", () => {
  it("draws nothing from a map with no sources", () => {
    const projected = projectMap(newCyberMap());
    expect(projected).toEqual({ assets: [], connections: [], subnets: [], warnings: [], access: new Map() });
  });

  it("builds assets and connections from the sources", () => {
    const { assets, connections } = projectMap(sampleMap());
    expect(assets.length).toBeGreaterThan(0);
    expect(connections.length).toBeGreaterThan(0);
  });

  it("gives every imported asset an OT class and a Purdue zone", () => {
    // The converged model's whole point: a scanned host is a first-class asset the OT engines can
    // reason about, not a second kind of thing living in a separate view.
    for (const asset of projectMap(sampleMap()).assets) {
      expect(asset.type).toBeTruthy();
      expect(asset.zone).toMatch(/^level[0-5]$/);
      expect(asset.controls).toBeDefined();
    }
  });

  it("keeps both vocabularies, so a scanned host still draws as a network symbol", () => {
    const firewall = projectMap(sampleMap()).assets.find((asset) => asset.deviceKind === "firewall");
    expect(firewall).toBeDefined();
    expect(firewall?.type).toBeTruthy();
  });

  it("says where each asset came from", () => {
    const doc = sampleMap();
    const [asset] = projectMap(doc).assets.filter((entry) => entry.provenance === "imported" && entry.ipAddress);
    expect(asset.sourceIds).toEqual([doc.sources[0].id]);
  });

  it("is deterministic, so a reload draws the same estate", () => {
    const doc = sampleMap();
    const first = projectMap(doc);
    const second = projectMap(doc);
    expect(second.assets.map((asset) => [asset.id, asset.position])).toEqual(
      first.assets.map((asset) => [asset.id, asset.position])
    );
  });
});

describe("the authored layer", () => {
  it("lets a decision win over what the scan inferred", () => {
    const doc = sampleMap();
    const target = projectMap(doc).assets[0];
    const decided = {
      ...doc,
      assetOverrides: { [target.id]: { zone: "level1" as const, criticality: "critical" as const, name: "Line 2 PLC" } }
    };

    const asset = projectMap(decided).assets.find((entry) => entry.id === target.id)!;
    expect(asset).toMatchObject({ zone: "level1", criticality: "critical", name: "Line 2 PLC" });
  });

  it("merges a partial control override rather than replacing the set", () => {
    const doc = sampleMap();
    const target = projectMap(doc).assets[0];
    const decided = { ...doc, assetOverrides: { [target.id]: { controls: { mfa: true } } } };

    const asset = projectMap(decided).assets.find((entry) => entry.id === target.id)!;
    expect(asset.controls.mfa).toBe(true);
    expect(Object.keys(asset.controls)).toHaveLength(Object.keys(projectMap(doc).assets[0].controls).length);
  });

  it("survives re-importing the same source, which is the point of keeping it separate", () => {
    const doc = sampleMap();
    const target = projectMap(doc).assets[0];
    const decided = { ...doc, assetOverrides: { [target.id]: { criticality: "critical" as const } } };
    const reimported = {
      ...decided,
      sources: [
        ...decided.sources,
        newImportSource(parseNmapNormal(SAMPLE_SCAN), "again", nextMapSequence(decided), {
          kind: "external",
          label: "External"
        })
      ]
    };

    expect(projectMap(reimported).assets.find((entry) => entry.id === target.id)?.criticality).toBe("critical");
  });

  it("draws a connection a person added, marked as theirs", () => {
    const doc = sampleMap();
    const [a, b] = projectMap(doc).assets;
    const drawn = { ...doc, connections: [newUserConnection(a.id, b.id, { label: "Management trunk" })] };

    const connection = projectMap(drawn).connections.find((entry) => entry.provenance === "authored");
    expect(connection).toMatchObject({ name: "Management trunk", evidence: "asserted" });
  });

  it("drops a connection whose endpoints are gone, and says so", () => {
    const doc = sampleMap();
    const [a] = projectMap(doc).assets;
    const orphaned = { ...doc, connections: [newUserConnection(a.id, "it:203.0.113.99")] };
    const { connections, warnings } = projectMap(orphaned);

    expect(connections.some((entry) => entry.provenance === "authored")).toBe(false);
    expect(warnings.some((warning) => /connection you drew is not shown/i.test(warning))).toBe(true);
  });

  it("folds access and attack edges from the journal rather than storing them", () => {
    const doc = sampleMap();
    const [a, b] = projectMap(doc).assets;
    const withJournal = {
      ...doc,
      events: [
        newItEvent("exploit", "Exploited SMB", nextMapSequence(doc), {
          sourceNodeId: a.id,
          targetNodeId: b.id,
          grants: "admin"
        })
      ]
    };

    const projected = projectMap(withJournal);
    expect(projected.access.get(b.id)).toBe("admin");
    expect(projected.connections.some((entry) => entry.evidence === "attack")).toBe(true);

    // Deleting the entry withdraws both, because neither was ever stored.
    const pruned = { ...withJournal, events: [] };
    expect(projectMap(pruned).access.size).toBe(0);
    expect(projectMap(pruned).connections.some((entry) => entry.evidence === "attack")).toBe(false);
  });
});

describe("feeding the assessment engines", () => {
  // The acceptance criterion for the whole unification: the converged estate is accepted by the
  // engines unchanged, so none of them had to be rewritten to reach it.
  const doc = sampleMap();
  const project = asOtProject(doc, projectMap(doc));

  it("scores without modification", () => {
    const assessment = assessProject(project);
    expect(assessment.findings.length).toBeGreaterThan(0);
    expect(assessment.coverage.assets).toBe(project.assets.length);
  });

  it("produces Security Level signals without modification", () => {
    expect(assessSecurityLevels(project).zones.some((zone) => zone.modelled)).toBe(true);
  });

  it("rates risk without modification", () => {
    const risk = assessRisk(project);
    expect(risk.assets).toHaveLength(project.assets.length);
    expect(risk.assets.every((entry) => entry.consequence >= 1 && entry.likelihood >= 1)).toBe(true);
  });
});

describe("saving and reloading", () => {
  it("round-trips to the same estate", () => {
    const doc = { ...sampleMap(), positions: { "it:10.10.1.1": { x: 42, y: 84 } } };
    const parsed = parseCyberMapJson(serializeCyberMap(doc));

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(projectMap(parsed.doc).assets.map((asset) => asset.id)).toEqual(
        projectMap(doc).assets.map((asset) => asset.id)
      );
      expect(parsed.doc.positions["it:10.10.1.1"]).toEqual({ x: 42, y: 84 });
    }
  });

  it("puts an asset back where it was left", () => {
    const doc = sampleMap();
    const target = projectMap(doc).assets[0];
    const moved = { ...doc, positions: { [target.id]: { x: 4242, y: 2424 } } };

    expect(projectMap(moved).assets.find((entry) => entry.id === target.id)?.position).toEqual({ x: 4242, y: 2424 });
  });

  it("rejects a source with no parse, because nothing can reconstruct the evidence", () => {
    const broken = JSON.parse(serializeCyberMap(sampleMap()));
    delete broken.sources[0].parsed;
    const parsed = parseCyberMapJson(JSON.stringify(broken));

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.errors[0]).toMatch(/no parsed hosts/i);
    }
  });

  it("drops a malformed position instead of rejecting the map", () => {
    const loose = JSON.parse(serializeCyberMap(sampleMap()));
    loose.positions = { "it:10.0.0.1": { x: "left", y: 3 }, "it:10.0.0.2": { x: 5, y: 6 } };
    const parsed = parseCyberMapJson(JSON.stringify(loose));

    expect(parsed.ok && parsed.doc.positions).toEqual({ "it:10.0.0.2": { x: 5, y: 6 } });
  });

  it("refuses a map written by a newer schema rather than dropping what it holds", () => {
    const future = JSON.parse(serializeCyberMap(sampleMap()));
    future.schemaVersion = 99;
    expect(parseCyberMapJson(JSON.stringify(future)).ok).toBe(false);
  });

  it("rejects text that is not JSON", () => {
    expect(parseCyberMapJson("{not json").ok).toBe(false);
  });
});
