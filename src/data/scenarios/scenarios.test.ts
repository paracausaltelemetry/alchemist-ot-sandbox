import { describe, expect, it } from "vitest";
import { scenarios } from "./index";
import { assessProject } from "../../engine/scoring";
import { parseProjectJson, serializeProject } from "../../engine/serialization";

describe("sector scenarios", () => {
  it("ships the bundled scenarios with unique ids", () => {
    expect(scenarios.length).toBeGreaterThanOrEqual(6);
    const ids = scenarios.map((scenario) => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const scenario of scenarios) {
    describe(scenario.name, () => {
      const { project } = scenario;

      it("round-trips through serialization and validates", () => {
        const result = parseProjectJson(serializeProject(project));
        expect(result.ok).toBe(true);
      });

      it("has unique asset ids and resolvable conduit endpoints", () => {
        const ids = project.assets.map((asset) => asset.id);
        expect(new Set(ids).size).toBe(ids.length);
        const idSet = new Set(ids);
        for (const conduit of project.conduits) {
          expect(idSet.has(conduit.source)).toBe(true);
          expect(idSet.has(conduit.target)).toBe(true);
        }
      });

      it("assigns every subnetId to a declared subnet", () => {
        const subnetIds = new Set((project.subnets ?? []).map((subnet) => subnet.id));
        for (const asset of project.assets) {
          if (asset.subnetId) {
            expect(subnetIds.has(asset.subnetId)).toBe(true);
          }
        }
      });

      it("produces a non-trivial assessment", () => {
        const assessment = assessProject(project);
        expect(assessment.overallScore).toBeGreaterThanOrEqual(0);
        expect(assessment.overallScore).toBeLessThanOrEqual(100);
        expect(assessment.findings.length).toBeGreaterThan(0);
      });

      /**
       * The two regressions below are the ones that mattered: both rules fired on every asset in
       * every scenario because of a data-authoring default, not because of anything modelled.
       * A rule-level test cannot see that — the rules are individually correct — so the guard has
       * to live here, against the real bundled content.
       */
      it("does not flag documentation on assets whose segment is described", () => {
        const subnets = new Map((project.subnets ?? []).map((subnet) => [subnet.id, subnet]));
        const documented = project.assets.filter(
          (asset) =>
            asset.ipAddress.trim() &&
            asset.owner.trim() &&
            asset.protocols.length > 0 &&
            (asset.vlan.trim() || (asset.subnetId && subnets.get(asset.subnetId)?.cidr.trim()))
        );
        expect(documented.length).toBeGreaterThan(0);

        const flagged = assessProject(project)
          .findings.filter((finding) => finding.title === "Asset documentation incomplete")
          .flatMap((finding) => finding.affectedAssetIds);
        for (const asset of documented) {
          expect(flagged, `${asset.name} is fully documented`).not.toContain(asset.id);
        }
      });

      it("does not raise a backup finding against an asset that has a backup programme", () => {
        const backedUp = project.assets.filter(
          (asset) => asset.criticality === "critical" && asset.controls.backups && asset.backupStatus !== "missing"
        );
        const flagged = assessProject(project)
          .findings.filter((finding) => finding.title === "Critical asset has no backup")
          .flatMap((finding) => finding.affectedAssetIds);
        for (const asset of backedUp) {
          expect(flagged, `${asset.name} has backups`).not.toContain(asset.id);
        }
      });

      it("records backup evidence on every critical asset", () => {
        // "unknown" is the honest default for a user's own model, but a bundled scenario that
        // never sets it is asserting nothing and used to raise a high finding for it.
        for (const asset of project.assets.filter((a) => a.criticality === "critical" && a.type !== "field-device")) {
          expect(asset.backupStatus, `${asset.name}`).not.toBe("unknown");
        }
      });
    });
  }

  it("gives every scenario at least one critical asset to be resilient about", () => {
    // Building automation had none, which silently handed it a perfect resilience score while
    // every other scenario floored.
    for (const scenario of scenarios) {
      const criticals = scenario.project.assets.filter((asset) => asset.criticality === "critical");
      expect(criticals.length, scenario.name).toBeGreaterThan(0);
    }
  });
});
