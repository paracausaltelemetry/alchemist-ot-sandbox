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
      expect(asset.zone).toMatch(/^(internet|level[0-5])$/);
      expect(asset.controls).toBeDefined();
    }
  });

  it("draws the edge being defended, rather than filing the internet under Enterprise IT", () => {
    const internet = projectMap(sampleMap()).assets.find((asset) => asset.deviceKind === "internet");
    expect(internet?.zone).toBe("internet");
  });

  it("does not put a publicly addressed host in a control zone", () => {
    // Port inference reads RDP as an engineering workstation, which is right inside a plant and
    // wrong on a routable address. On a converged estate the weaker claim is the true one.
    const external = projectMap(sampleMap()).assets.filter(
      (asset) => /^(198\.51\.100|203\.0\.113)\./.test(asset.ipAddress)
    );

    expect(external.length).toBeGreaterThan(0);
    for (const asset of external) {
      expect(["internet", "level5"]).toContain(asset.zone);
    }
  });

  it("takes the firewall the topology identified, rather than guessing from ports", () => {
    const firewall = projectMap(sampleMap()).assets.find((asset) => asset.deviceKind === "firewall");
    expect(firewall?.type).toBe("firewall");
  });

  it("keeps both vocabularies, so a scanned host still draws as a network symbol", () => {
    const firewall = projectMap(sampleMap()).assets.find((asset) => asset.deviceKind === "firewall");
    expect(firewall).toBeDefined();
    expect(firewall?.type).toBeTruthy();
  });

  it("marks a link touching a firewall as brokered rather than plainly routed", () => {
    // A scan never shows the rule that allowed a packet, so `firewallRule` stays unknown. But
    // "something mediates here" is a different claim from "nothing does", and it is the one the
    // exposure walk turns on: without it every derived link was `routed` and the whole estate came
    // back reachable without a broker.
    const projected = projectMap(sampleMap());
    const firewall = projected.assets.find((asset) => asset.type === "firewall")!;
    const touching = projected.connections.filter(
      (entry) => entry.source === firewall.id || entry.target === firewall.id
    );

    expect(touching.length).toBeGreaterThan(0);
    for (const connection of touching) {
      expect(connection.control).toBe("firewalled");
      expect(connection.firewallRule).toBe("unknown");
    }
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

  it("lets a decision win over a conduit the evidence could not describe", () => {
    // A scan shows two hosts can reach each other and never the rule that allowed it, so
    // `firewallRule` is always `unknown` on a derived connection. Recording the rule is the point
    // of the layer: without it the only way to say so was to redraw the line by hand, which threw
    // away the evidence grading that made it trustworthy.
    const doc = sampleMap();
    const target = projectMap(doc).connections[0];
    const decided = {
      ...doc,
      connectionOverrides: {
        [target.id]: { firewallRule: "explicit" as const, inspected: true, ruleOwner: "Network team" }
      }
    };

    const connection = projectMap(decided).connections.find((entry) => entry.id === target.id)!;
    expect(connection).toMatchObject({ firewallRule: "explicit", inspected: true, ruleOwner: "Network team" });
  });

  it("never lets a decision rewrite where the line came from", () => {
    const doc = sampleMap();
    const target = projectMap(doc).connections[0];
    const decided = {
      ...doc,
      // Cast because the type deliberately has no such field; this asserts the runtime behaviour
      // that backs the type, since a saved document is only ever validated by shape.
      connectionOverrides: { [target.id]: { evidence: "traceroute", provenance: "authored" } as never }
    };

    const connection = projectMap(decided).connections.find((entry) => entry.id === target.id)!;
    expect(connection.evidence).toBe(target.evidence);
    expect(connection.provenance).toBe("imported");
  });

  it("leaves a field alone when the override does not mention it", () => {
    // `undefined` has to mean "not decided", not "decided to be nothing", or a partial override
    // blanks everything it is silent about.
    const doc = sampleMap();
    const target = projectMap(doc).connections[0];
    const decided = { ...doc, connectionOverrides: { [target.id]: { ruleOwner: "Network team" } } };

    const connection = projectMap(decided).connections.find((entry) => entry.id === target.id)!;
    expect(connection.name).toBe(target.name);
    expect(connection.control).toBe(target.control);
    expect(connection.trustBoundary).toBe(target.trustBoundary);
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

describe("the governance the assessment engines need", () => {
  it("hands the assessor's zone targets to the engines rather than the suggested ones", () => {
    // Without this the analysis reports `defaultTargetSL` as though it were the assessor's
    // judgement, which is the difference between a suggestion and a commitment.
    const doc = { ...sampleMap(), governance: { zoneTargets: { level5: 3 as const } } };
    const project = asOtProject(doc, projectMap(doc));

    expect(project.zoneTargets).toEqual({ level5: 3 });
    expect(assessSecurityLevels(project, project.zoneTargets).zones.find((zone) => zone.zone === "level5")?.target).toBe(3);
  });

  it("carries the engagement context, the CAF overrides and the risk treatments", () => {
    const doc = {
      ...sampleMap(),
      governance: {
        engagement: {
          organisation: "Northgate Water",
          sector: "Water",
          regime: "NIS",
          assessor: "A. Assessor",
          assessmentDate: "2026-08-09",
          scope: "Treatment works",
          limitations: "Documentation review only"
        },
        cafOverrides: { A1: { status: "partial" as const, note: "Policy drafted, not signed off" } },
        riskTreatments: { "it:10.10.1.1": { decision: "accept" as const, owner: "Ops", targetDate: "", notes: "" } }
      }
    };
    const project = asOtProject(doc, projectMap(doc));

    expect(project.engagement?.organisation).toBe("Northgate Water");
    expect(project.cafOverrides?.A1?.status).toBe("partial");
    expect(project.riskTreatments?.["it:10.10.1.1"].decision).toBe("accept");
  });

  it("leaves the fields off entirely when nothing was decided, rather than passing empties", () => {
    const doc = sampleMap();
    const project = asOtProject(doc, projectMap(doc));

    expect(project.zoneTargets).toBeUndefined();
    expect(project.cafOverrides).toBeUndefined();
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

  it("opens a document saved before the connection and governance layers existed", () => {
    // The real upgrade path: v3 documents are already on disk without these keys, and the
    // projection dereferences both on every load. Filling them in at parse rather than guarding at
    // every use keeps the guard in one place instead of thirty.
    const doc = sampleMap();
    const older = JSON.parse(serializeCyberMap(doc)) as Record<string, unknown>;
    delete older.connectionOverrides;
    delete older.governance;

    const parsed = parseCyberMapJson(JSON.stringify(older));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.doc.connectionOverrides).toEqual({});
      expect(parsed.doc.governance).toEqual({});
      expect(projectMap(parsed.doc).connections.length).toBeGreaterThan(0);
    }
  });

  it("drops a governance entry it cannot read rather than reporting it as a judgement", () => {
    // Stricter than the override layers on purpose: a malformed SL-T does not degrade a report, it
    // changes what the report claims, and a compliance table that is wrong still looks authoritative.
    const doc = sampleMap();
    const tampered = {
      ...(JSON.parse(serializeCyberMap(doc)) as Record<string, unknown>),
      governance: {
        zoneTargets: { level5: "3", level3: 2 },
        cafOverrides: { A1: { status: "made-up" }, A2: { status: "partial" } }
      }
    };

    const parsed = parseCyberMapJson(JSON.stringify(tampered));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.doc.governance.zoneTargets).toEqual({ level3: 2 });
      expect(parsed.doc.governance.cafOverrides).toEqual({ A2: { status: "partial" } });
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
