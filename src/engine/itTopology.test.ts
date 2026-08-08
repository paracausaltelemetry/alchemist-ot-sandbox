import { describe, expect, it } from "vitest";
import type { ParsedImport } from "../import/types";
import { synthesiseItTopology } from "./itTopology";

function scan(partial: Partial<ParsedImport>): ParsedImport {
  return { format: "nmap-normal", hosts: [], flows: [], warnings: [], ...partial };
}

const PRIVATE_ONLY = scan({
  hosts: [
    { ip: "10.10.1.10", hostname: "dc-1", ports: [{ port: 88 }, { port: 389 }, { port: 445 }] },
    { ip: "10.10.1.20", hostname: "file-1", ports: [{ port: 445 }] },
    { ip: "10.10.2.30", hostname: "db-1", ports: [{ port: 3306 }] }
  ]
});

const shape = (map: ReturnType<typeof synthesiseItTopology>) => ({ nodes: map.nodes, links: map.links, subnets: map.subnets });

describe("synthesiseItTopology", () => {
  it("is deterministic", () => {
    expect(shape(synthesiseItTopology(PRIVATE_ONLY))).toEqual(shape(synthesiseItTopology(PRIVATE_ONLY)));
  });

  it("groups hosts into /24 subnets and gives each one a gateway", () => {
    const map = synthesiseItTopology(PRIVATE_ONLY);
    expect(map.subnets.map((subnet) => subnet.cidr)).toEqual(["10.10.1.0/24", "10.10.2.0/24"]);
    const gateways = map.nodes.filter((node) => node.tier === "gateway");
    expect(gateways).toHaveLength(2);
    // None were scanned, so both are honest ghosts.
    expect(gateways.every((node) => node.origin === "synthetic" && node.confidence < 1)).toBe(true);
  });

  it("gives every host exactly one uplink", () => {
    const map = synthesiseItTopology(PRIVATE_ONLY);
    for (const node of map.nodes.filter((candidate) => candidate.tier === "host")) {
      const uplinks = map.links.filter((link) => link.target === node.id || link.source === node.id);
      expect(uplinks).toHaveLength(1);
    }
  });

  it("draws no internet when every address is private", () => {
    const map = synthesiseItTopology(PRIVATE_ONLY);
    expect(map.nodes.some((node) => node.kind === "internet")).toBe(false);
    expect(map.warnings.join(" ")).toMatch(/traceroute/i);
  });

  it("adds an internet and a perimeter when a firewall faces a public address", () => {
    const map = synthesiseItTopology(
      scan({
        hosts: [
          { ip: "198.51.100.4", hostname: "edge-fw", ports: [{ port: 443 }] },
          { ip: "10.10.1.20", hostname: "file-1", ports: [{ port: 445 }] }
        ]
      })
    );
    expect(map.nodes.find((node) => node.kind === "internet")?.origin).toBe("synthetic");
    const perimeter = map.nodes.filter((node) => node.tier === "perimeter");
    expect(perimeter.map((node) => node.name)).toEqual(["edge-fw"]);
    expect(map.links.some((link) => link.source === "it:internet" && link.target === perimeter[0].id)).toBe(true);
  });
});

describe("synthesiseItTopology with traceroute", () => {
  const TRACED = scan({
    hosts: [
      { ip: "10.10.2.30", hostname: "db-1", ports: [{ port: 3306 }] },
      { ip: "10.10.1.1", hostname: "gw-1", ports: [{ port: 22 }] }
    ],
    traces: [
      {
        targetIp: "10.10.2.30",
        hops: [
          { ttl: 1, ip: "10.10.1.1" },
          { ttl: 2, ip: "10.10.2.1", hostname: "core-rtr", rttMs: 1.2 }
        ]
      }
    ]
  });

  const map = synthesiseItTopology(TRACED);

  it("reuses the scanned node for a hop that was also scanned", () => {
    expect(map.nodes.filter((node) => node.ip === "10.10.1.1")).toHaveLength(1);
    expect(map.nodes.find((node) => node.ip === "10.10.1.1")?.origin).toBe("scanned");
  });

  it("adds a hop that was never scanned, at reduced confidence", () => {
    const hop = map.nodes.find((node) => node.ip === "10.10.2.1");
    expect(hop?.kind).toBe("router");
    expect(hop?.confidence).toBeLessThan(1);
    expect(hop?.rationale).toMatch(/not scanned/i);
  });

  it("links the hop chain as observed evidence, not inference", () => {
    const chain = map.links.filter((link) => link.evidence === "traceroute");
    expect(chain).toHaveLength(2);
    expect(chain.some((link) => link.source === "it:10.10.1.1" && link.target === "it:10.10.2.1")).toBe(true);
    expect(chain.some((link) => link.target === "it:10.10.2.30")).toBe(true);
  });

  it("promotes a traced hop to its subnet's gateway instead of inventing a ghost", () => {
    const gateway = map.nodes.find((node) => node.subnetId === "subnet:10.10.2.0/24" && node.tier === "gateway");
    expect(gateway?.ip).toBe("10.10.2.1");
    expect(gateway?.origin).toBe("scanned");
    expect(map.nodes.some((node) => node.id.startsWith("it:gw:"))).toBe(false);
  });
});
