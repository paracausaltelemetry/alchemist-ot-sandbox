import { describe, expect, it } from "vitest";
import { analyseItNetwork } from "./itAnalysis";
import { projectEngagement } from "./itProjection";
import { newItEngagement, newItScan, type ItEngagement } from "../models/itEngagement";
import type { ParsedImport } from "../import/types";

/**
 * What "externally reachable" is allowed to mean.
 *
 * Before this, it meant "has a public address" — an inference from addressing wearing the clothes
 * of an observation. Once an engagement carries scans from different vantages the two come apart,
 * and the difference is the whole value of having pivoted.
 */

const PRIVATE_HOST = { ip: "10.10.2.40", hostname: "hmi-legacy", ports: [{ port: 3389, service: "ms-wbt-server" }] };
const PUBLIC_HOST = { ip: "203.0.113.10", hostname: "web-1", ports: [{ port: 3389, service: "ms-wbt-server" }] };

const parse = (hosts: ParsedImport["hosts"]): ParsedImport => ({
  format: "nmap-normal",
  hosts,
  flows: [],
  warnings: []
});

function engagementWith(...scans: Array<{ hosts: ParsedImport["hosts"]; external: boolean }>): ItEngagement {
  const base = newItEngagement("Test");
  return {
    ...base,
    scans: scans.map((entry, index) =>
      newItScan(
        parse(entry.hosts),
        `scan-${index + 1}`,
        index + 1,
        entry.external ? { kind: "external", label: "Client VPN" } : { kind: "node", nodeId: "it:203.0.113.10" }
      )
    )
  };
}

describe("externally reachable", () => {
  it("calls a public address an inference when nothing has tested it", () => {
    const analysis = analyseItNetwork(parse([PUBLIC_HOST]));
    expect(analysis.externallyReachable).toHaveLength(1);
    expect(analysis.externallyReachable[0].basis).toBe("address");
  });

  it("calls it an observation once a scan from outside answered for it", () => {
    const { analysis } = projectEngagement(engagementWith({ hosts: [PUBLIC_HOST], external: true }));
    expect(analysis!.externallyReachable[0].basis).toBe("reached");
  });

  it("counts a private-address host that answered a scan from outside", () => {
    // The case addressing alone cannot see: NAT, a port forward, a VPN that lands inside. It
    // answered a scan run from outside, so it is externally reachable whatever its address says.
    const { analysis } = projectEngagement(engagementWith({ hosts: [PRIVATE_HOST], external: true }));

    expect(analysis!.externallyReachable.map((host) => host.ip)).toEqual(["10.10.2.40"]);
    expect(analysis!.externallyReachable[0].basis).toBe("reached");
  });

  it("does not count a host only ever seen from inside", () => {
    // The drift this fixes: after a pivot, hosts the internal scan found used to sit under the
    // same heading as ones an external scan had actually reached.
    const { analysis } = projectEngagement(engagementWith({ hosts: [PRIVATE_HOST], external: false }));
    expect(analysis!.externallyReachable).toEqual([]);
  });

  it("keeps a host reached from outside even when a later internal scan also sees it", () => {
    const { analysis } = projectEngagement(
      engagementWith({ hosts: [PRIVATE_HOST], external: true }, { hosts: [PRIVATE_HOST], external: false })
    );
    expect(analysis!.externallyReachable[0].basis).toBe("reached");
  });

  it("escalates a risky service on anything reachable from outside", () => {
    const { analysis } = projectEngagement(engagementWith({ hosts: [PRIVATE_HOST], external: true }));
    const rdp = analysis!.riskyServices.find((service) => service.port === 3389);

    expect(rdp?.severity).toBe("high");
    expect(rdp?.reason).toMatch(/reached from outside the network/);
  });

  it("does not escalate the same service when only an internal scan saw it", () => {
    const { analysis } = projectEngagement(engagementWith({ hosts: [PRIVATE_HOST], external: false }));
    const rdp = analysis!.riskyServices.find((service) => service.port === 3389);

    expect(rdp?.severity).not.toBe("high");
    expect(rdp?.reason).not.toMatch(/outside|routable/);
  });

  it("says which of the two it is, rather than blurring them into one claim", () => {
    const { analysis } = projectEngagement(
      engagementWith({ hosts: [PRIVATE_HOST], external: true }, { hosts: [PUBLIC_HOST], external: false })
    );
    const byIp = new Map(analysis!.externallyReachable.map((host) => [host.ip, host.basis]));

    expect(byIp.get("10.10.2.40")).toBe("reached");
    expect(byIp.get("203.0.113.10")).toBe("address");
  });
});
