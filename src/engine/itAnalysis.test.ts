import { describe, expect, it } from "vitest";
import type { ParsedImport } from "../import/types";
import { analyseItNetwork, isPublicIp } from "./itAnalysis";

const parsed: ParsedImport = {
  format: "nmap-normal",
  flows: [],
  warnings: [],
  hosts: [
    { ip: "203.0.113.10", hostname: "web-1", os: "Linux", ports: [{ port: 22, service: "ssh" }, { port: 3389, service: "ms-wbt-server" }] },
    { ip: "10.0.0.9", ports: [{ port: 445, service: "microsoft-ds" }, { port: 23, service: "telnet" }] },
    { ip: "10.0.0.10", ports: [{ port: 80, service: "http" }] },
    { ip: "10.0.0.11", ports: [{ port: 3306, service: "mysql" }] }
  ]
};

describe("isPublicIp", () => {
  it("classifies RFC1918, loopback, link-local and CGNAT as private", () => {
    for (const ip of ["10.0.0.9", "192.168.1.5", "172.16.4.4", "127.0.0.1", "169.254.1.1", "100.64.0.1"]) {
      expect(isPublicIp(ip)).toBe(false);
    }
  });
  it("classifies routable addresses as public", () => {
    expect(isPublicIp("203.0.113.10")).toBe(true);
    expect(isPublicIp("8.8.8.8")).toBe(true);
  });
});

describe("analyseItNetwork", () => {
  const analysis = analyseItNetwork(parsed);

  it("counts hosts and open ports", () => {
    expect(analysis.totalHosts).toBe(4);
    expect(analysis.totalOpenPorts).toBe(6);
  });

  it("finds the internet-facing host", () => {
    expect(analysis.internetFacing.map((host) => host.ip)).toEqual(["203.0.113.10"]);
  });

  it("flags risky services and escalates internet-facing ones to high", () => {
    const rdpPublic = analysis.riskyServices.find((service) => service.port === 3389 && service.ip === "203.0.113.10");
    expect(rdpPublic?.severity).toBe("high");
    expect(rdpPublic?.publicIp).toBe(true);
    expect(analysis.riskyServices.some((service) => service.port === 445)).toBe(true);
    expect(analysis.riskyServices.some((service) => service.port === 3306)).toBe(true);
    // ssh (22) and http (80) are not risky
    expect(analysis.riskyServices.some((service) => service.port === 22 || service.port === 80)).toBe(false);
  });

  it("summarises subnets and detects a non-flat network", () => {
    expect(analysis.subnets.map((subnet) => subnet.cidr).sort()).toEqual(["10.0.0.0/24", "203.0.113.0/24"]);
    expect(analysis.flatNetwork).toBe(false);
    expect(analysis.largestSubnet?.cidr).toBe("10.0.0.0/24");
  });

  it("builds an inventory", () => {
    expect(analysis.byOs).toEqual([{ label: "Linux", count: 1 }]);
    expect(analysis.byAssetType.reduce((sum, tally) => sum + tally.count, 0)).toBe(4);
  });
});
