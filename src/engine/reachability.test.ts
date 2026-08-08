import { describe, expect, it } from "vitest";
import { getZone } from "../data/catalog";
import { sampleProject } from "../data/sampleProject";
import { exposureFromUntrusted, findReachability } from "./reachability";
import type { OtProject } from "../models/types";

describe("findReachability", () => {
  it("finds a permitted vendor path to a controller through the jump host", () => {
    const result = findReachability(sampleProject, "vendor-vpn", "plc-pack");

    expect(result.reachable).toBe(true);
    expect(result.pathAssetIds).toContain("jump-host");
    expect(result.pathAssetIds.at(-1)).toBe("plc-pack");
    expect(result.risks.some((risk) => risk.title === "Remote access is on the path")).toBe(true);
  });

  it("blocks reverse flow when the declared conduit is one-way", () => {
    const result = findReachability(sampleProject, "plc-pack", "vendor-vpn");

    expect(result.reachable).toBe(false);
    expect(result.explanation).toContain("No permitted route");
  });

  it("reports no source/target choice cleanly", () => {
    const result = findReachability(sampleProject, "", "");

    expect(result.reachable).toBe(false);
    expect(result.explanation).toContain("Choose a source");
  });
});

describe("where an attacker is assumed to start", () => {
  it("treats enterprise and business zones as untrusted when the model does not draw the internet", () => {
    // Every project authored before the internet band existed. Unchanged on purpose: those models
    // were assessed against this assumption and re-seeding them would silently restate their risk.
    const exposure = exposureFromUntrusted(sampleProject);
    const enterprise = sampleProject.assets.filter((asset) => getZone(asset.zone).riskRank >= 6);

    expect(enterprise.length).toBeGreaterThan(0);
    for (const asset of enterprise) {
      expect(exposure.get(asset.id)).toBe(2);
    }
  });

  it("starts from the internet once the model draws it, so Enterprise IT stops being exposed by definition", () => {
    // The converged failure this fixes: seeding Enterprise IT makes "an Enterprise IT asset is
    // directly reachable from an untrusted start" true by construction. On a mostly-corporate
    // estate that reported every asset as directly exposed and so said nothing about any of them.
    const edge = { ...sampleProject.assets[0], id: "wan", zone: "internet" as const, type: "firewall" as const };
    const withInternet: OtProject = { ...sampleProject, assets: [edge, ...sampleProject.assets] };
    const before = exposureFromUntrusted(sampleProject);
    const after = exposureFromUntrusted(withInternet);

    expect(after.get("wan")).toBe(2);
    // Enterprise IT is no longer a seed, so an enterprise asset only rates 2 if something actually
    // routes to it — which is the whole difference between a reading and a tautology.
    const enterprise = sampleProject.assets.filter(
      (asset) => getZone(asset.zone).riskRank >= 6 && asset.type !== "vendor-remote" && asset.type !== "cloud-service"
    );
    expect(enterprise.length).toBeGreaterThan(0);
    expect(enterprise.some((asset) => before.get(asset.id) === 2 && after.get(asset.id) !== 2)).toBe(true);
  });
});
