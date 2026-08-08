import { describe, expect, it } from "vitest";
import { classifyPort, familyForFlow, inferAssetType, protocolsForHost } from "./inference";
import type { ImportedHost } from "./types";

const host = (overrides: Partial<ImportedHost>): ImportedHost => ({ ports: [], ...overrides });

describe("classifyPort", () => {
  it("maps OT control ports to protocol, family and device type", () => {
    expect(classifyPort({ port: 502 })).toMatchObject({ protocol: "Modbus TCP", family: "modbus", type: "plc-rtu" });
    expect(classifyPort({ port: 4840 })).toMatchObject({ family: "opc", type: "scada" });
  });

  it("prefers the service name when present", () => {
    expect(classifyPort({ port: 0, service: "ethernet-ip" })).toMatchObject({ family: "ethernet-ip", type: "plc-rtu" });
  });
});

describe("inferAssetType", () => {
  it("classifies OT control protocols as PLC/SCADA over IT services", () => {
    expect(inferAssetType(host({ ports: [{ port: 502 }, { port: 80 }] }))).toBe("plc-rtu");
    expect(inferAssetType(host({ ports: [{ port: 20000 }] }))).toBe("scada");
  });

  it("uses vendor and OS hints when no OT port is present", () => {
    expect(inferAssetType(host({ vendor: "Siemens AG", ports: [{ port: 80 }] }))).toBe("plc-rtu");
    expect(inferAssetType(host({ os: "Windows Server 2019", ports: [{ port: 3389 }] }))).toBe("engineering-workstation");
    expect(inferAssetType(host({ os: "Windows 10", ports: [{ port: 445 }] }))).toBe("enterprise-it");
  });

  it("honours an explicit type hint", () => {
    expect(inferAssetType(host({ typeHint: "historian", ports: [{ port: 502 }] }))).toBe("historian");
  });
});

describe("protocolsForHost", () => {
  it("returns distinct protocol labels in port order", () => {
    expect(protocolsForHost(host({ ports: [{ port: 502 }, { port: 502 }, { port: 443 }] }))).toEqual(["Modbus TCP", "HTTPS"]);
  });
});

describe("familyForFlow", () => {
  it("derives a colour family from port or service", () => {
    expect(familyForFlow(502, undefined)).toBe("modbus");
    expect(familyForFlow(undefined, "s7comm")).toBe("s7");
    expect(familyForFlow(9999, undefined)).toBe("auto");
  });
});
