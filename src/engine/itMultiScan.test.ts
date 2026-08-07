import { describe, expect, it } from "vitest";
import { projectEngagement } from "./itProjection";
import { newItEngagement, newItScan, nextSequence, type ItEngagement } from "../models/itEngagement";
import type { ImportedHost, ParsedImport } from "../import/types";

/**
 * Multi-scan merge: what happens when an engagement's second scan is run from somewhere the first
 * one could not reach. This is the pivot story the IT view exists to record.
 */

function parse(hosts: Array<Partial<ImportedHost>>): ParsedImport {
  return {
    format: "nmap-normal",
    hosts: hosts.map((host) => ({ ports: [], ...host })),
    flows: [],
    warnings: []
  };
}

function withScans(...parses: ParsedImport[]): ItEngagement {
  return parses.reduce<ItEngagement>((engagement, parsed, index) => {
    const scan = newItScan(parsed, `scan-${index + 1}`, nextSequence(engagement), { kind: "external", label: "External" });
    return { ...engagement, scans: [...engagement.scans, scan] };
  }, newItEngagement("Test"));
}

const nodeIds = (engagement: ItEngagement) =>
  projectEngagement(engagement)
    .map!.nodes.filter((node) => node.origin === "scanned")
    .map((node) => node.id);

describe("merging successive scans", () => {
  it("folds a host seen by hostname from outside into the same node seen by address inside", () => {
    // The canonical pivot case. `hostKey` prefers the address and falls back to the hostname, so
    // without an alias pass the external scan mints `it:web-1` and the internal one mints
    // `it:198.51.100.10` — two nodes for one machine, at the exact moment the story needs one.
    const external = parse([{ hostname: "web-1", ports: [{ port: 443 }] }]);
    const internal = parse([{ ip: "198.51.100.10", hostname: "web-1", ports: [{ port: 22 }] }]);

    const ids = nodeIds(withScans(external, internal));
    expect(ids).toEqual(["it:198.51.100.10"]);

    const node = projectEngagement(withScans(external, internal)).map!.nodes.find((entry) => entry.id === ids[0])!;
    expect(node.ports.map((port) => port.port).sort()).toEqual([22, 443]);
  });

  it("reveals hosts the first scan could not see", () => {
    const outside = parse([{ ip: "198.51.100.10" }]);
    const inside = parse([{ ip: "198.51.100.10" }, { ip: "10.10.2.40" }, { ip: "10.10.2.41" }]);

    expect(nodeIds(withScans(outside))).toHaveLength(1);
    expect(nodeIds(withScans(outside, inside))).toHaveLength(3);
  });

  it("changes nothing when the same scan is imported twice", () => {
    const scan = parse([{ ip: "10.0.0.1", ports: [{ port: 80 }] }, { ip: "10.0.0.2" }]);
    expect(nodeIds(withScans(scan, scan))).toEqual(nodeIds(withScans(scan)));
  });

  it("lets a later, better-informed scan overwrite what an earlier one guessed", () => {
    // A credentialed or internal scan knows more about a host than the external one that found it.
    const first = parse([{ ip: "10.0.0.1", os: "Linux (guessed)", vendor: "" }]);
    const second = parse([{ ip: "10.0.0.1", os: "Ubuntu 22.04", vendor: "Dell" }]);

    const node = projectEngagement(withScans(first, second)).map!.nodes.find((entry) => entry.id === "it:10.0.0.1")!;
    expect(node.os).toBe("Ubuntu 22.04");
    expect(node.vendor).toBe("Dell");
  });

  it("does not blank a field the later scan left empty", () => {
    const first = parse([{ ip: "10.0.0.1", os: "Ubuntu 22.04" }]);
    const second = parse([{ ip: "10.0.0.1" }]);

    expect(projectEngagement(withScans(first, second)).map!.nodes.find((n) => n.id === "it:10.0.0.1")?.os).toBe(
      "Ubuntu 22.04"
    );
  });

  it("keeps a port that was open in an earlier scan and absent from a later one", () => {
    // Stated rather than fixed: this is a record of what was observed, so nothing observed is
    // dropped. It does mean the map cannot show a service being turned off mid-engagement.
    const before = parse([{ ip: "10.0.0.1", ports: [{ port: 445 }] }]);
    const after = parse([{ ip: "10.0.0.1", ports: [{ port: 22 }] }]);

    const node = projectEngagement(withScans(before, after)).map!.nodes.find((n) => n.id === "it:10.0.0.1")!;
    expect(node.ports.map((port) => port.port).sort()).toEqual([22, 445]);
  });

  it("orders scans by sequence, not by import order or any timestamp", () => {
    const engagement = withScans(parse([{ ip: "10.0.0.1" }]), parse([{ ip: "10.0.0.2" }]));
    const shuffled = { ...engagement, scans: [...engagement.scans].reverse() };
    expect(nodeIds(shuffled)).toEqual(nodeIds(engagement));
  });

  it("gives every scan its own sequence, even after one is removed", () => {
    const engagement = withScans(parse([{ ip: "10.0.0.1" }]), parse([{ ip: "10.0.0.2" }]));
    const pruned = { ...engagement, scans: [engagement.scans[1]] };
    // Reusing sequence 2 would silently reorder the narrative against the surviving scan.
    expect(nextSequence(pruned)).toBe(3);
  });
});

describe("identity across sources that key differently", () => {
  const nodeIdsOf = (parses: ParsedImport[]) => nodeIds(withScans(...parses));

  it("resolves one machine seen by MAC, by address and by name into one asset", () => {
    // The acceptance case for merging vendor feeds with scans: an inventory keys on MAC, Nmap keys
    // on address, and an external scan may only have resolved the name.
    const inventory = parse([{ mac: "00:1A:2B:3C:4D:5E", ports: [] }]);
    const scan = parse([{ ip: "10.10.4.7", mac: "001a2b3c4d5e", ports: [{ port: 443 }] }]);
    const external = parse([{ hostname: "hist-1", ip: "10.10.4.7", ports: [{ port: 22 }] }]);

    expect(nodeIdsOf([inventory, scan, external])).toEqual(["it:10.10.4.7"]);
  });

  it("follows a machine that changed subnet between scans", () => {
    const before = parse([{ ip: "10.0.1.50", mac: "aa:bb:cc:dd:ee:ff", ports: [{ port: 445 }] }]);
    const after = parse([{ ip: "10.0.9.14", mac: "aa:bb:cc:dd:ee:ff", ports: [{ port: 3389 }] }]);

    const ids = nodeIdsOf([before, after]);
    expect(ids).toHaveLength(1);

    // Both sightings' ports survive the merge, so neither scan's evidence is lost to the move.
    const node = projectEngagement(withScans(before, after)).map!.nodes.find((entry) => entry.id === ids[0])!;
    expect(node.ports.map((port) => port.port).sort((a, b) => a - b)).toEqual([445, 3389]);
  });

  it("keeps a reused address as two assets, and says why", () => {
    const first = parse([{ ip: "10.0.0.20", mac: "11:11:11:11:11:11", ports: [] }]);
    const second = parse([{ ip: "10.0.0.20", mac: "22:22:22:22:22:22", ports: [] }]);
    const { map } = projectEngagement(withScans(first, second));

    expect(map!.nodes.filter((node) => node.origin === "scanned")).toHaveLength(2);
    expect(map!.warnings.some((warning) => /seen with 2 different MAC addresses/.test(warning))).toBe(true);
  });
});
