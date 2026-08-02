import { describe, expect, it } from "vitest";
import { buildItEngagementReport } from "./itEngagementReport";
import { itEngagementMarkdown } from "./itEngagementMarkdown";
import { buildItStageMaps } from "./itStageMaps";
import { parseNmapNormal } from "../import/nmapText";
import { SAMPLE_SCAN } from "../data/sampleScan";
import { EXTERNAL_ORIGIN, newItEngagement, newItEvent, newItScan, type ItEngagement } from "../models/itEngagement";
import type { ParsedImport } from "../import/types";

const WEB = "it:198.51.100.10";
const HMI = "it:10.10.2.40";

/** A second scan run from the compromised web host, revealing a segment the first could not see. */
function internalScan(): ParsedImport {
  return {
    format: "nmap-normal",
    hosts: [{ ip: "10.10.9.9", hostname: "db-2", ports: [{ port: 3306, service: "mysql" }] }],
    flows: [],
    warnings: []
  };
}

/** Three stages: an external scan, an exploit, a pivot scan from the host it won. */
function engagement(): ItEngagement {
  const base = newItEngagement("Acme external test");
  return {
    ...base,
    scans: [
      newItScan(parseNmapNormal(SAMPLE_SCAN), "external.nmap", 1, { kind: "external", label: "Client VPN" }),
      newItScan(internalScan(), "pivot.nmap", 3, { kind: "node", nodeId: WEB })
    ],
    events: [
      newItEvent("exploit", "Exploited SMB for SYSTEM", 2, {
        sourceNodeId: EXTERNAL_ORIGIN,
        targetNodeId: WEB,
        grants: "admin",
        cve: "CVE-2017-0144"
      }),
      newItEvent("lateral-movement", "Reused local admin hash", 4, {
        sourceNodeId: WEB,
        targetNodeId: HMI,
        grants: "user"
      })
    ]
  };
}

describe("the engagement report", () => {
  const report = buildItEngagementReport(engagement());

  it("interleaves scans and actions into one ordered narrative", () => {
    expect(report.stages.map((stage) => [stage.sequence, stage.kind])).toEqual([
      [1, "scan"],
      [2, "event"],
      [3, "scan"],
      [4, "event"]
    ]);
  });

  it("computes the summary from the stages, so it cannot contradict them", () => {
    expect(report.summary.scans).toBe(2);
    expect(report.summary.highestAccess).toBe("admin");
    expect(report.summary.vantages).toEqual(["Client VPN", "web-1"]);
  });

  it("names the hosts reached that no external address would have exposed", () => {
    // The pivot's whole value, and the sentence a client actually reacts to.
    expect(report.summary.reachedButNotExternallyVisible).toEqual(["hmi-legacy"]);
  });

  it("reconstructs the attack chain", () => {
    expect(report.summary.chain).toEqual(["web-1", "hmi-legacy"]);
  });

  it("says which hosts each scan revealed for the first time", () => {
    const pivot = report.stages.find((stage) => stage.sequence === 3);
    expect(pivot?.revealed).toEqual(["db-2"]);
    // And does not re-announce hosts an earlier scan already found.
    expect(pivot?.revealed).not.toContain("web-1");
  });

  it("traces every access row back to the stage that won it", () => {
    const row = report.access.find((entry) => entry.nodeId === WEB);
    expect(row).toMatchObject({ access: "admin", grantedAtSequence: 2, grantedBy: "Exploited SMB for SYSTEM" });
  });

  it("cross-references findings to what was done on that host", () => {
    // "SMB open on 10.10.2.40" is a scanner line. The stage beside it is what makes it a pentest.
    const acted = report.findings.filter((finding) => finding.actedOnAt.length > 0);
    expect(acted.length).toBeGreaterThan(0);
    expect(acted[0].actedOnAt[0]).toMatch(/^Stage \d+: /);
  });

  it("leaves a flagged service on an untouched host with no action against it", () => {
    expect(report.findings.find((finding) => finding.actedOnAt.length === 0)).toBeDefined();
  });

  it("reconciles: the hosts each scan revealed add up to the headline count", () => {
    // They did not. `revealed` was counted from `parsed.hosts`, which misses routers that only a
    // traceroute names, so stage 1 claimed 8 while the summary said 10 — in the one document where
    // every number is meant to reconcile.
    const revealed = report.stages.reduce((total, stage) => total + stage.revealed.length, 0);
    expect(revealed).toBe(report.summary.hosts);
  });

  it("states what it does not cover rather than leaving it as silence", () => {
    expect(report.negativeSpace.some((line) => /were not accessed/i.test(line))).toBe(true);
    expect(report.negativeSpace.some((line) => /cannot show a service that was down/i.test(line))).toBe(true);
  });

  it("records where every scan came from and whether its time was read or typed", () => {
    expect(report.provenance).toHaveLength(2);
    expect(report.provenance[0]).toMatchObject({ name: "external.nmap", vantage: "Client VPN", timeSource: "read from the scan file" });
    expect(report.provenance[1].vantage).toBe("web-1");
  });

  it("carries no advisory score, which would mean nothing for an engagement", () => {
    expect(JSON.stringify(report)).not.toMatch(/overallScore|advisory/i);
  });
});

describe("the report with nothing recorded", () => {
  it("says the document describes what was seen and not what was done", () => {
    const scanOnly = { ...newItEngagement("Recon only"), scans: [newItScan(parseNmapNormal(SAMPLE_SCAN), "s.nmap", 1)] };
    const report = buildItEngagementReport(scanOnly);

    expect(report.summary.highestAccess).toBe("none");
    expect(report.access).toEqual([]);
    expect(report.negativeSpace.some((line) => /No actions were recorded/i.test(line))).toBe(true);
  });
});

describe("the Markdown rendering", () => {
  const markdown = itEngagementMarkdown(buildItEngagementReport(engagement()));

  it("writes the chain as text rather than as a picture", () => {
    expect(markdown).toContain("Longest chain: external → web-1 → hmi-legacy");
  });

  it("carries every section a reader needs to check a claim", () => {
    for (const heading of ["## Summary", "## Engagement timeline", "## Access held", "## Findings", "## What this does not cover", "## Provenance"]) {
      expect(markdown).toContain(heading);
    }
  });

  it("names the scan file behind each stage", () => {
    expect(markdown).toContain("external.nmap");
    expect(markdown).toContain("pivot.nmap");
  });
});

describe("the per-stage maps", () => {
  const stages = buildItStageMaps(engagement());

  it("draws one per stage", () => {
    expect(stages.map((stage) => stage.sequence)).toEqual([1, 2, 3, 4]);
  });

  it("omits hosts that had not been discovered yet", () => {
    const first = stages.find((stage) => stage.sequence === 1)!;
    expect(first.map.nodes.some((node) => node.id === "it:10.10.9.9")).toBe(false);

    const afterPivot = stages.find((stage) => stage.sequence === 3)!;
    expect(afterPivot.map.nodes.some((node) => node.id === "it:10.10.9.9")).toBe(true);
  });

  it("emphasises what the stage itself revealed", () => {
    const pivot = stages.find((stage) => stage.sequence === 3)!;
    expect([...(pivot.emphasise ?? [])]).toEqual(["it:10.10.9.9"]);
  });

  it("draws only the attack edges that had happened by then", () => {
    const attacksAt = (sequence: number) =>
      stages.find((stage) => stage.sequence === sequence)!.map.links.filter((link) => link.evidence === "attack").length;
    // Stage 2's exploit came from outside the map, so it has no line; stage 4's pivot does.
    expect(attacksAt(2)).toBe(0);
    expect(attacksAt(4)).toBe(1);
  });
});
