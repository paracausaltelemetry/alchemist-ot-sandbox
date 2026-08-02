import { describe, expect, it } from "vitest";
import {
  classifyProtocol,
  protocolFamilies,
  protocolLacksNativeSecurity,
  protocolSecurity,
  resolveProtocolFamily
} from "./protocols";
import type { Conduit } from "../models/types";

describe("protocol classification", () => {
  it("maps common OT and remote protocols to stable colour families", () => {
    expect(classifyProtocol("HTTPS", "443")).toBe("https-tls");
    expect(classifyProtocol("Modbus TCP", "502")).toBe("modbus");
    expect(classifyProtocol("OPC UA", "4840")).toBe("opc");
    expect(classifyProtocol("RDP", "3389")).toBe("rdp");
    expect(classifyProtocol("VPN", "")).toBe("vpn");
  });

  it("lets a name beat another family's port", () => {
    // The old classifier checked name then port inside a per-family loop, so the first family that
    // claimed the port won regardless of what the conduit was actually called.
    expect(classifyProtocol("IEC 61850 MMS", "102")).toBe("iec61850-mms");
    expect(classifyProtocol("ICCP", "102")).toBe("iccp");
    expect(classifyProtocol("S7comm", "102")).toBe("s7");
  });

  it("refuses to guess a family from a port that several families share", () => {
    // S7comm, IEC 61850 MMS and ICCP all use TCP 102. A port-only classifier cannot disambiguate
    // them, so the honest answer is that it does not know.
    expect(classifyProtocol("", "102")).toBe("unknown");
  });

  it("prefers the longest matching alias", () => {
    expect(classifyProtocol("OPC DA", "")).toBe("opc-da");
    expect(classifyProtocol("OPC UA", "")).toBe("opc");
  });

  it("does not match an alias buried inside another word", () => {
    expect(classifyProtocol("Foxtrot Telemetry", "")).not.toBe("fox");
    expect(classifyProtocol("Fox", "")).toBe("fox");
  });

  it("classifies the layer 2 substation protocols without inventing a port", () => {
    expect(classifyProtocol("GOOSE", "")).toBe("iec61850-l2");
    expect(classifyProtocol("IEC 61850 Sampled Values", "")).toBe("iec61850-l2");
    expect(protocolFamilies.find((family) => family.id === "iec61850-l2")?.ports).toEqual([]);
  });

  it("allows a manual protocol family override", () => {
    const conduit = {
      protocol: "Vendor Tooling",
      port: "44818",
      protocolFamily: "ethernet-ip"
    } as Pick<Conduit, "protocol" | "port" | "protocolFamily">;

    expect(resolveProtocolFamily(conduit).id).toBe("ethernet-ip");
  });
});

describe("native security", () => {
  it("separates protocols with no security from protocols whose security is optional", () => {
    expect(protocolSecurity("Modbus TCP")).toBe("none");
    expect(protocolSecurity("GOOSE")).toBe("none");
    expect(protocolSecurity("BACnet/IP")).toBe("none");
    expect(protocolSecurity("DNP3")).toBe("optional");
    expect(protocolSecurity("OPC UA")).toBe("optional");
    expect(protocolSecurity("HTTPS")).toBe("built-in");
  });

  it("says nothing about a protocol it cannot identify", () => {
    expect(protocolSecurity("Vendor Tooling")).toBeNull();
    expect(protocolSecurity("")).toBeNull();
    expect(protocolLacksNativeSecurity("Vendor Tooling")).toBe(false);
  });

  it("keeps the protocols the three old hand-maintained lists disagreed about", () => {
    // `scoring.legacyProtocols` and `securityLevels.LEGACY_CLEARTEXT` were separate sets with
    // different members. Everything either of them held must still be recognised.
    for (const legacy of ["modbus", "modbus tcp", "ftp", "telnet", "http"]) {
      expect(protocolLacksNativeSecurity(legacy)).toBe(true);
    }
  });

  it("gives every classifiable family a transport", () => {
    for (const family of protocolFamilies) {
      if (family.id === "unknown" || family.id === "other") {
        continue;
      }
      expect(family.transport.length).toBeGreaterThan(0);
    }
  });
});
