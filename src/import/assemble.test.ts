import { describe, expect, it } from "vitest";
import { assembleTopology } from "./assemble";
import type { ParsedImport } from "./types";

const parsed: ParsedImport = {
  format: "zeek-conn",
  hosts: [
    { ip: "10.0.1.10", vendor: "Siemens", hostname: "plc-1", ports: [{ port: 502, service: "modbus" }] },
    { ip: "10.0.2.5", ports: [] }
  ],
  flows: [
    { sourceIp: "10.0.2.5", targetIp: "10.0.1.10", port: 502, service: "modbus" },
    { sourceIp: "10.0.2.5", targetIp: "10.0.1.10", port: 502, service: "modbus" },
    { sourceIp: "10.0.2.5", targetIp: "10.0.9.9", port: 443, service: "https" }
  ],
  warnings: []
};

describe("assembleTopology", () => {
  it("builds typed, zoned assets with protocols, vendor and a /24 subnet", () => {
    const { assets } = assembleTopology(parsed);
    const plc = assets.find((asset) => asset.ipAddress === "10.0.1.10");
    expect(plc).toMatchObject({ type: "plc-rtu", zone: "level1", name: "plc-1", manufacturer: "Siemens" });
    expect(plc?.protocols).toEqual(["Modbus TCP"]);
    expect(plc?.subnetId).toBeTruthy();
  });

  it("creates assets for IPs that appear only in flows", () => {
    const { assets } = assembleTopology(parsed);
    expect(assets.some((asset) => asset.ipAddress === "10.0.9.9")).toBe(true);
  });

  it("dedupes repeated flows and flags cross-zone conduits as trust boundaries", () => {
    const { assets, conduits } = assembleTopology(parsed);
    const modbus = conduits.filter((conduit) => conduit.protocol === "Modbus TCP");
    expect(modbus).toHaveLength(1);
    expect(modbus[0]).toMatchObject({ protocolFamily: "modbus", firewallRule: "unknown", trustBoundary: true });
    // Two distinct services from the same initiator → two conduits total.
    expect(conduits).toHaveLength(2);
    expect(assets.length).toBe(3);
  });

  it("derives one subnet per /24 and assigns members", () => {
    const { subnets, assets } = assembleTopology(parsed);
    const cidrs = subnets.map((subnet) => subnet.cidr).sort();
    expect(cidrs).toContain("10.0.1.0/24");
    expect(cidrs).toContain("10.0.2.0/24");
    for (const subnet of subnets) {
      expect(assets.some((asset) => asset.subnetId === subnet.id)).toBe(true);
    }
  });
});
