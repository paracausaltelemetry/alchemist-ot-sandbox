import { describe, expect, it } from "vitest";
import { sampleProject } from "../data/sampleProject";
import { parseProjectJson, serializeProject } from "./serialization";

describe("project serialization", () => {
  it("round-trips a valid project", () => {
    const result = parseProjectJson(serializeProject(sampleProject));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.project.assets.length).toBe(sampleProject.assets.length);
      expect(result.project.conduits.length).toBe(sampleProject.conduits.length);
    }
  });

  it("round-trips the GRC fields (engagement, CAF overrides, risk treatments)", () => {
    const withGrc = {
      ...sampleProject,
      engagement: {
        organisation: "Acme Water",
        sector: "Water",
        regime: "NIS Regulations 2018",
        assessor: "A. Analyst",
        assessmentDate: "2026-06-19",
        scope: "Treatment plant OT",
        limitations: "Logical model only"
      },
      cafOverrides: { B2: { status: "achieved" as const, note: "MFA enforced" } },
      riskTreatments: {
        [sampleProject.assets[0].id]: {
          decision: "mitigate" as const,
          owner: "OT lead",
          targetDate: "2026-09-01",
          notes: "Segment the cell",
          residual: 6
        }
      }
    };
    const result = parseProjectJson(serializeProject(withGrc));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.project.engagement?.organisation).toBe("Acme Water");
      expect(result.project.cafOverrides?.B2?.status).toBe("achieved");
      expect(result.project.riskTreatments?.[sampleProject.assets[0].id]?.decision).toBe("mitigate");
    }
  });

  it("rejects conduits that reference missing assets", () => {
    const invalid = {
      ...sampleProject,
      conduits: [{ ...sampleProject.conduits[0], source: "missing" }]
    };
    const result = parseProjectJson(JSON.stringify(invalid));

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("missing");
  });

  it("migrates schema version 1 projects to the current local schema", () => {
    const legacy = JSON.parse(serializeProject(sampleProject));
    legacy.schemaVersion = 1;
    delete legacy.assets[0].manufacturer;
    delete legacy.assets[0].backupStatus;
    delete legacy.conduits[0].protocolFamily;
    delete legacy.conduits[0].ruleOwner;

    const result = parseProjectJson(JSON.stringify(legacy));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.project.schemaVersion).toBe(2);
      expect(result.project.assets[0].manufacturer).toBe("");
      expect(result.project.assets[0].backupStatus).toBe("unknown");
      expect(result.project.conduits[0].protocolFamily).toBe("auto");
      expect(result.project.conduits[0].ruleOwner).toBe("");
    }
  });
});

describe("the assessor's consequence override", () => {
  it("survives a save and reload", () => {
    // An override that silently does not persist is worse than not offering one: the register
    // would agree with the assessor until they reopened the project.
    const project = {
      ...sampleProject,
      assets: sampleProject.assets.map((asset, index) => (index === 0 ? { ...asset, consequence: 5 } : asset))
    };
    const parsed = parseProjectJson(serializeProject(project));

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.project.assets[0].consequence).toBe(5);
    }
  });

  it("leaves an asset with no override without one, rather than freezing today's derived value", () => {
    const parsed = parseProjectJson(serializeProject(sampleProject));
    expect(parsed.ok && parsed.project.assets.every((asset) => asset.consequence === undefined)).toBe(true);
  });
});
