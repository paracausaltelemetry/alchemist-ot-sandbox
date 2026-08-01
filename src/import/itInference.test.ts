import { describe, expect, it } from "vitest";
import { classifyItDevice, isRouterLike } from "./itInference";
import { inferAssetType } from "./inference";
import type { ImportedHost } from "./types";

/** Terse fixture: ports are given as bare numbers. */
function host(partial: Omit<Partial<ImportedHost>, "ports"> & { ports?: number[] }): ImportedHost {
  return { ...partial, ports: (partial.ports ?? []).map((port) => ({ port })) };
}

describe("classifyItDevice", () => {
  it("recognises a firewall by name, vendor or public perimeter role", () => {
    expect(classifyItDevice(host({ hostname: "edge-fw", ip: "198.51.100.4", ports: [22, 443] }))).toBe("firewall");
    expect(classifyItDevice(host({ hostname: "border-1", vendor: "Palo Alto Networks", ports: [443] }))).toBe("firewall");
  });

  it("treats observed routing as decisive", () => {
    // Exposes SMB and RDP, which would otherwise read as a server, but it forwarded packets.
    const forwarding = host({ ip: "10.10.1.1", ports: [445, 3389] });
    expect(classifyItDevice(forwarding, { isTracerouteHop: true })).toBe("router");
    expect(classifyItDevice(forwarding)).not.toBe("router");
  });

  it("does not promote a gateway address that behaves like a server", () => {
    expect(classifyItDevice(host({ ip: "10.10.1.1", ports: [445, 3389] }), { isGatewayAddress: true })).not.toBe("router");
    expect(classifyItDevice(host({ ip: "10.10.1.1", ports: [22, 161] }), { isGatewayAddress: true })).toBe("router");
  });

  it("classifies the common IT device kinds", () => {
    expect(classifyItDevice(host({ hostname: "print-1", ports: [161, 9100] }))).toBe("printer");
    expect(classifyItDevice(host({ hostname: "db-1", ports: [22, 3306] }))).toBe("database");
    expect(classifyItDevice(host({ hostname: "dc-1", os: "Windows Server 2019", ports: [53, 88, 389, 445] }))).toBe("server");
    expect(classifyItDevice(host({ hostname: "web-1", ports: [80, 443] }))).toBe("server");
    expect(classifyItDevice(host({ hostname: "desk-4", os: "Windows 10", ports: [135, 445, 3389] }))).toBe("workstation");
    expect(classifyItDevice(host({ hostname: "sw-1", vendor: "Cisco Systems", ports: [22, 161] }))).toBe("switch");
    // A name that says router wins over one that says switch: "core" is routing language.
    expect(classifyItDevice(host({ hostname: "sw-core-1", vendor: "Cisco Systems", ports: [22, 161] }))).toBe("router");
    expect(classifyItDevice(host({ hostname: "ap-3", vendor: "Ubiquiti", ports: [443] }))).toBe("wireless-ap");
  });

  it("falls back to unknown rather than guessing", () => {
    expect(classifyItDevice(host({ ip: "10.0.0.7", ports: [] }))).toBe("unknown");
  });

  it("never returns an OT asset type, and leaves the OT classifier alone", () => {
    const plc = host({ ip: "10.0.1.10", vendor: "Siemens", ports: [502, 102] });
    // The IT vocabulary has no plc-rtu / hmi / scada — those belong to inferAssetType.
    expect(["plc-rtu", "hmi", "scada", "enterprise-it"]).not.toContain(classifyItDevice(plc));
    expect(inferAssetType(plc)).toBe("plc-rtu");
  });
});

describe("isRouterLike", () => {
  it("is true for management-only and portless hosts", () => {
    expect(isRouterLike(host({ ports: [22, 161, 443] }))).toBe(true);
    expect(isRouterLike(host({ ports: [] }))).toBe(true);
  });

  it("is false once a host serves anything", () => {
    expect(isRouterLike(host({ ports: [22, 445] }))).toBe(false);
  });
});
