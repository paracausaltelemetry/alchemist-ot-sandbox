import { describe, expect, it } from "vitest";
import { assessProject, categoryWeights, scoreBands, severityDeduction } from "./scoring";
import { createAsset, createConduit } from "../models/factory";
import { blankProject } from "../data/sampleProject";
import type { Asset, Conduit, OtProject, ScoreCategory, Severity } from "../models/types";

/**
 * One test per finding rule, each in two halves: the rule fires when its condition is met, and the
 * rule stays silent on a baseline that does not meet it.
 *
 * The negative half is the point. `scoring.ts` had two rules firing on data-authoring defaults
 * rather than on modelled weakness — every asset in every scenario raised them — and a
 * positive-only suite structurally cannot see that. Anything added here must keep both halves.
 *
 * The baseline is deliberately *quiet*: two documented, well-controlled enterprise assets joined by
 * a conduit that crosses no trust boundary. Each case perturbs exactly one thing, so a finding that
 * appears can only have come from the perturbation.
 */

/** An asset with every modelled control satisfied and its documentation complete. */
function quietAsset(id: string, name: string): Asset {
  const asset = createAsset("enterprise-it", { x: 0, y: 0 });
  return {
    ...asset,
    id,
    name,
    ipAddress: "10.0.0.1",
    vlan: "VLAN10",
    owner: "IT Operations",
    protocols: ["HTTPS"],
    criticality: "medium",
    lifecycleStatus: "supported",
    backupStatus: "verified",
    controls: { ...asset.controls, defaultCredentialsDisabled: true, backups: true, mfa: true }
  };
}

/** A conduit inside one zone: no trust boundary, so none of the boundary rules apply. */
function quietConduit(source: string, target: string): Conduit {
  const conduit = createConduit(source, target);
  return {
    ...conduit,
    id: "cn-quiet",
    name: "Quiet conduit",
    trustBoundary: false,
    inspected: true,
    logged: true,
    ruleOwner: "IT Operations",
    businessJustification: "Documented for test purposes"
  };
}

function baseProject(): OtProject {
  return {
    ...structuredClone(blankProject),
    assets: [quietAsset("a1", "Asset One"), quietAsset("a2", "Asset Two")],
    conduits: [quietConduit("a1", "a2")]
  };
}

const titles = (project: OtProject) => assessProject(project).findings.map((finding) => finding.title);
const matching = (project: OtProject, title: string) =>
  assessProject(project).findings.filter((finding) => finding.title === title);

interface RuleCase {
  title: string;
  category: ScoreCategory;
  severity: Severity;
  /** Mutates the quiet baseline so that exactly this rule fires. */
  trigger: (project: OtProject) => void;
}

const RULES: RuleCase[] = [
  {
    title: "Conduit references a missing asset",
    category: "documentation",
    severity: "high",
    trigger: (project) => {
      project.conduits[0].target = "does-not-exist";
    }
  },
  {
    title: "Direct enterprise-to-control conduit",
    category: "segmentation",
    severity: "critical",
    trigger: (project) => {
      project.assets[1].zone = "level1";
    }
  },
  {
    title: "Any-any rule across trust boundary",
    category: "segmentation",
    severity: "high",
    trigger: (project) => {
      project.conduits[0].trustBoundary = true;
      project.conduits[0].firewallRule = "any-any";
    }
  },
  {
    title: "Undocumented boundary rule",
    category: "documentation",
    severity: "medium",
    trigger: (project) => {
      project.conduits[0].trustBoundary = true;
      project.conduits[0].firewallRule = "unknown";
    }
  },
  {
    title: "Boundary flow lacks ownership or justification",
    category: "documentation",
    severity: "medium",
    trigger: (project) => {
      project.conduits[0].trustBoundary = true;
      project.conduits[0].ruleOwner = "";
    }
  },
  {
    title: "Temporary conduit is past expiry",
    category: "segmentation",
    severity: "high",
    trigger: (project) => {
      project.conduits[0].temporaryAccess = true;
      project.conduits[0].expiryDate = "2020-01-01";
    }
  },
  {
    title: "Boundary flow lacks inspection or logging",
    category: "monitoring",
    severity: "high",
    trigger: (project) => {
      project.conduits[0].trustBoundary = true;
      project.conduits[0].logged = false;
    }
  },
  {
    title: "Bidirectional boundary conduit",
    category: "segmentation",
    severity: "medium",
    trigger: (project) => {
      project.conduits[0].trustBoundary = true;
      project.conduits[0].direction = "bidirectional";
    }
  },
  {
    title: "Engineering path needs tighter control",
    category: "identity",
    severity: "high",
    trigger: (project) => {
      project.assets[0].type = "engineering-workstation";
      project.assets[1].type = "plc-rtu";
      project.conduits[0].direction = "bidirectional";
      project.conduits[0].logged = false;
    }
  },
  {
    title: "Safety system has bidirectional control path",
    category: "safetyImpact",
    severity: "critical",
    trigger: (project) => {
      project.assets[1].type = "safety-system";
      project.conduits[0].direction = "bidirectional";
    }
  },
  {
    title: "Remote access lacks MFA",
    category: "remoteAccess",
    severity: "critical",
    trigger: (project) => {
      project.assets[0].type = "vendor-remote";
      project.assets[0].controls.mfa = false;
    }
  },
  {
    title: "Remote access can reach control assets",
    category: "remoteAccess",
    severity: "critical",
    trigger: (project) => {
      project.assets[0].type = "vendor-remote";
      project.assets[1].zone = "level1";
    }
  },
  {
    title: "Critical asset has no backup",
    category: "resilience",
    severity: "high",
    trigger: (project) => {
      project.assets[0].criticality = "critical";
      project.assets[0].controls.backups = false;
      project.assets[0].backupStatus = "missing";
    }
  },
  {
    // The lesser half of the split: a backup programme exists but nothing evidences it. This used
    // to be the same high finding as having no backup at all, which fired on every critical asset
    // in every scenario because "unknown" is the default nobody had overridden.
    title: "Backup evidence not recorded",
    category: "resilience",
    severity: "low",
    trigger: (project) => {
      project.assets[0].criticality = "critical";
      project.assets[0].controls.backups = true;
      project.assets[0].backupStatus = "unknown";
    }
  },
  {
    title: "Unsupported control-zone asset",
    category: "legacyExposure",
    severity: "high",
    trigger: (project) => {
      project.assets[0].zone = "level2";
      project.assets[0].lifecycleStatus = "obsolete";
    }
  },
  {
    title: "Default credentials not confirmed disabled",
    category: "identity",
    severity: "high",
    trigger: (project) => {
      project.assets[0].controls.defaultCredentialsDisabled = false;
    }
  },
  {
    title: "Protocol without native security in a control zone",
    category: "legacyExposure",
    severity: "medium",
    trigger: (project) => {
      project.assets[0].zone = "level2";
      project.assets[0].protocols = ["Modbus TCP"];
    }
  },
  {
    title: "Protocol security not confirmed in a control zone",
    category: "legacyExposure",
    severity: "low",
    trigger: (project) => {
      project.assets[0].zone = "level2";
      project.assets[0].protocols = ["OPC UA"];
    }
  },
  {
    title: "Asset documentation incomplete",
    category: "documentation",
    severity: "low",
    trigger: (project) => {
      project.assets[0].owner = "";
    }
  }
];

describe("the quiet baseline", () => {
  it("raises no findings at all", () => {
    // Every rule test below reads as "this perturbation caused this finding" only because the
    // starting point is genuinely clean. If this fails, every negative assertion is weakened.
    expect(assessProject(baseProject()).findings).toEqual([]);
  });
});

describe.each(RULES)("$title", ({ title, category, severity, trigger }) => {
  it("stays silent when its condition is not met", () => {
    expect(titles(baseProject())).not.toContain(title);
  });

  it("fires once, with the documented category and severity", () => {
    const project = baseProject();
    trigger(project);
    const found = matching(project, title);

    expect(found).toHaveLength(1);
    expect(found[0].category).toBe(category);
    expect(found[0].severity).toBe(severity);
  });
});

describe("every rule covered", () => {
  it("has a case for each distinct finding title the engine can emit", () => {
    // Guards against a rule being added to the engine without a test. Any new title must either
    // appear in RULES or be deliberately added to the ignore list with a reason.
    const emitted = new Set<string>();
    for (const rule of RULES) {
      const project = baseProject();
      rule.trigger(project);
      for (const finding of assessProject(project).findings) {
        emitted.add(finding.title);
      }
    }
    const covered = new Set(RULES.map((rule) => rule.title));
    // Security-level findings carry the achieved level in their title, so they are matched by shape.
    const uncovered = [...emitted].filter((title) => !covered.has(title) && !title.startsWith("Modeled 62443 FR signal"));

    expect(uncovered).toEqual([]);
  });
});

describe("scoring constants", () => {
  it("weights sum to exactly 1", () => {
    const total = Object.values(categoryWeights).reduce((sum, weight) => sum + weight, 0);
    expect(Math.abs(total - 1)).toBeLessThan(1e-9);
  });

  it("orders severity deductions from critical down to low", () => {
    expect(severityDeduction.critical).toBeGreaterThan(severityDeduction.high);
    expect(severityDeduction.high).toBeGreaterThan(severityDeduction.medium);
    expect(severityDeduction.medium).toBeGreaterThan(severityDeduction.low);
    expect(severityDeduction.low).toBeGreaterThan(0);
  });

  it("declares bands descending, gapless and covering 0-100", () => {
    const mins = scoreBands.map((entry) => entry.min);
    expect(mins).toEqual([...mins].sort((a, b) => b - a));
    expect(mins[mins.length - 1]).toBe(0);
    expect(new Set(mins).size).toBe(mins.length);
  });
});

describe("finding hygiene", () => {
  const perturbed = RULES.map((rule) => {
    const project = baseProject();
    rule.trigger(project);
    return project;
  });

  it("only ever references assets and conduits that exist", () => {
    for (const project of perturbed) {
      const assetIds = new Set(project.assets.map((asset) => asset.id));
      const conduitIds = new Set(project.conduits.map((conduit) => conduit.id));
      for (const finding of assessProject(project).findings) {
        // The missing-asset rule is the one case where a conduit legitimately points at nothing.
        if (finding.title === "Conduit references a missing asset") {
          continue;
        }
        expect(finding.affectedAssetIds.every((id) => assetIds.has(id))).toBe(true);
        expect(finding.affectedConduitIds.every((id) => conduitIds.has(id))).toBe(true);
      }
    }
  });

  it("gives every finding a remediation and at least one reference", () => {
    for (const project of perturbed) {
      for (const finding of assessProject(project).findings) {
        expect(finding.remediation.trim().length).toBeGreaterThan(0);
        expect(finding.references.length).toBeGreaterThan(0);
      }
    }
  });

  it("produces stable, unique finding ids", () => {
    for (const project of perturbed) {
      const first = assessProject(project).findings.map((finding) => finding.id);
      const second = assessProject(project).findings.map((finding) => finding.id);
      expect(first).toEqual(second);
      expect(new Set(first).size).toBe(first.length);
    }
  });
});

describe("the empty-model guard", () => {
  it("refuses to rate a blank project instead of calling it Strong", () => {
    // The headline defect this guard exists for: no assets means no findings, which means every
    // category sits at 100. "New blank" used to open on 100/100 Strong.
    const assessment = assessProject(blankProject);

    expect(assessment.band).toBe("insufficient");
    expect(assessment.overallScore).toBe(0);
    expect(assessment.coverage.sufficient).toBe(false);
    expect(assessment.findings).toEqual([]);
  });

  it("refuses a single asset with no conduits — an inventory row is not an architecture", () => {
    const project = { ...baseProject(), assets: [quietAsset("a1", "Only One")], conduits: [] };
    const assessment = assessProject(project);

    expect(assessment.band).toBe("insufficient");
    expect(assessment.coverage).toMatchObject({ assets: 1, conduits: 0, sufficient: false });
  });

  it("rates the smallest genuine architecture", () => {
    const assessment = assessProject(baseProject());

    expect(assessment.band).not.toBe("insufficient");
    expect(assessment.coverage).toMatchObject({ assets: 2, conduits: 1, sufficient: true });
  });

  it("counts only the zones that hold assets", () => {
    const assessment = assessProject(baseProject());
    // The quiet baseline puts both assets in one zone, so exactly one zone is modelled.
    expect(assessment.coverage.zonesModelled).toBe(1);
  });

  it("raises no security-level finding for a zone nobody modelled", () => {
    const titles = assessProject(baseProject()).findings.map((finding) => finding.title);
    expect(titles.filter((title) => title.startsWith("Modeled 62443 FR signal"))).toEqual([]);
  });
});
