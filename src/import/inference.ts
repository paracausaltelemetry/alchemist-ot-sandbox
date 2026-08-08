import type { AssetTypeId, ProtocolFamilyId } from "../models/types";
import type { ImportedHost, ImportedPort } from "./types";

interface ServiceClass {
  protocol: string;
  family: ProtocolFamilyId;
  type?: AssetTypeId;
}

/**
 * Well-known OT and IT ports → a friendly protocol label, a colour family, and (where the
 * port strongly implies a device class) an asset type. OT control protocols are the high-signal
 * ones for classification; IT ports mostly inform protocols and a weaker type guess.
 */
const PORT_TABLE: Record<number, ServiceClass> = {
  502: { protocol: "Modbus TCP", family: "modbus", type: "plc-rtu" },
  102: { protocol: "S7comm", family: "s7", type: "plc-rtu" },
  44818: { protocol: "EtherNet/IP", family: "ethernet-ip", type: "plc-rtu" },
  2222: { protocol: "EtherNet/IP I/O", family: "ethernet-ip", type: "plc-rtu" },
  789: { protocol: "Red Lion", family: "modbus", type: "plc-rtu" },
  1962: { protocol: "PCWorx", family: "other", type: "plc-rtu" },
  9600: { protocol: "OMRON FINS", family: "other", type: "plc-rtu" },
  5007: { protocol: "MELSEC-Q", family: "other", type: "plc-rtu" },
  20000: { protocol: "DNP3", family: "dnp3", type: "scada" },
  2404: { protocol: "IEC 60870-5-104", family: "other", type: "scada" },
  4840: { protocol: "OPC UA", family: "opc", type: "scada" },
  1911: { protocol: "Niagara Fox", family: "other", type: "hmi" },
  4911: { protocol: "Niagara Fox (TLS)", family: "other", type: "hmi" },
  47808: { protocol: "BACnet/IP", family: "other", type: "field-device" },
  34962: { protocol: "PROFINET", family: "profinet", type: "field-device" },
  34963: { protocol: "PROFINET", family: "profinet", type: "field-device" },
  34964: { protocol: "PROFINET", family: "profinet", type: "field-device" },
  80: { protocol: "HTTP", family: "http" },
  443: { protocol: "HTTPS", family: "https-tls" },
  8080: { protocol: "HTTP", family: "http" },
  3389: { protocol: "RDP", family: "rdp", type: "engineering-workstation" },
  5900: { protocol: "VNC", family: "rdp", type: "engineering-workstation" },
  22: { protocol: "SSH", family: "ssh" },
  23: { protocol: "Telnet", family: "other" },
  445: { protocol: "SMB", family: "smb" },
  139: { protocol: "SMB", family: "smb" },
  1433: { protocol: "MSSQL", family: "other", type: "historian" },
  3306: { protocol: "MySQL", family: "other", type: "historian" },
  53: { protocol: "DNS", family: "dns-ntp" },
  123: { protocol: "NTP", family: "dns-ntp" },
  161: { protocol: "SNMP", family: "other" },
  1883: { protocol: "MQTT", family: "mqtt", type: "cloud-service" },
  8883: { protocol: "MQTT (TLS)", family: "mqtt", type: "cloud-service" },
  1194: { protocol: "OpenVPN", family: "vpn", type: "vendor-remote" },
  500: { protocol: "IPsec VPN", family: "vpn", type: "vendor-remote" }
};

const SERVICE_KEYWORDS: Array<{ match: RegExp; value: ServiceClass }> = [
  { match: /modbus/i, value: { protocol: "Modbus TCP", family: "modbus", type: "plc-rtu" } },
  { match: /s7|iso-?tsap/i, value: { protocol: "S7comm", family: "s7", type: "plc-rtu" } },
  { match: /ethernet-?ip|enip/i, value: { protocol: "EtherNet/IP", family: "ethernet-ip", type: "plc-rtu" } },
  { match: /dnp3?/i, value: { protocol: "DNP3", family: "dnp3", type: "scada" } },
  { match: /opc-?ua|opcua/i, value: { protocol: "OPC UA", family: "opc", type: "scada" } },
  { match: /bacnet/i, value: { protocol: "BACnet/IP", family: "other", type: "field-device" } },
  { match: /profinet/i, value: { protocol: "PROFINET", family: "profinet", type: "field-device" } },
  { match: /niagara|fox/i, value: { protocol: "Niagara Fox", family: "other", type: "hmi" } },
  { match: /ms-wbt-server|rdp/i, value: { protocol: "RDP", family: "rdp", type: "engineering-workstation" } },
  { match: /microsoft-ds|netbios|smb/i, value: { protocol: "SMB", family: "smb" } },
  { match: /https|ssl\/http/i, value: { protocol: "HTTPS", family: "https-tls" } },
  { match: /^http$|http-proxy/i, value: { protocol: "HTTP", family: "http" } },
  { match: /\bssh\b/i, value: { protocol: "SSH", family: "ssh" } },
  { match: /telnet/i, value: { protocol: "Telnet", family: "other" } },
  { match: /mqtt/i, value: { protocol: "MQTT", family: "mqtt", type: "cloud-service" } },
  { match: /\bvpn\b|ipsec|openvpn/i, value: { protocol: "VPN", family: "vpn", type: "vendor-remote" } },
  { match: /ms-sql|mssql/i, value: { protocol: "MSSQL", family: "other", type: "historian" } }
];

const VENDOR_PLC = /siemens|rockwell|allen-?bradley|schneider|modicon|omron|mitsubishi|phoenix|ge fanuc|emerson|honeywell|yokogawa|wago|beckhoff|abb|hirschmann/i;

/** Classifies a single port/service into a protocol label, colour family, and optional type. */
export function classifyPort(port: ImportedPort): ServiceClass {
  if (port.service) {
    const keyword = SERVICE_KEYWORDS.find((entry) => entry.match.test(port.service ?? ""));
    if (keyword) {
      return keyword.value;
    }
  }
  const byPort = PORT_TABLE[port.port];
  if (byPort) {
    return byPort;
  }
  return { protocol: port.service ? port.service.toUpperCase() : `Port ${port.port}`, family: "other" };
}

/** Distinct, ordered protocol labels implied by a host's open ports. */
export function protocolsForHost(host: ImportedHost): string[] {
  if (host.protocolsHint && host.protocolsHint.length > 0) {
    return host.protocolsHint;
  }
  const seen = new Set<string>();
  const protocols: string[] = [];
  for (const port of host.ports) {
    const { protocol } = classifyPort(port);
    if (!seen.has(protocol)) {
      seen.add(protocol);
      protocols.push(protocol);
    }
  }
  return protocols;
}

const TYPE_PRIORITY: AssetTypeId[] = [
  "safety-system",
  "plc-rtu",
  "scada",
  "field-device",
  "hmi",
  "historian",
  "engineering-workstation",
  "vendor-remote",
  "cloud-service",
  "enterprise-it"
];

/**
 * Infers an asset type from open ports, vendor, and OS. OT control protocols win over IT
 * services; an explicit CSV `typeHint` always takes precedence. Falls back to enterprise IT
 * for hosts that only expose generic IT services so they can be reclassified in the inspector.
 */
export function inferAssetType(host: ImportedHost): AssetTypeId {
  if (host.typeHint) {
    return host.typeHint;
  }

  const candidates = new Set<AssetTypeId>();
  for (const port of host.ports) {
    const { type } = classifyPort(port);
    if (type) {
      candidates.add(type);
    }
  }

  if (host.vendor && VENDOR_PLC.test(host.vendor) && !candidates.has("scada") && !candidates.has("field-device")) {
    candidates.add("plc-rtu");
  }

  if (candidates.size > 0) {
    return TYPE_PRIORITY.find((type) => candidates.has(type)) ?? "enterprise-it";
  }

  const os = (host.os ?? "").toLowerCase();
  if (os.includes("windows")) {
    return host.ports.some((port) => port.port === 3389) ? "engineering-workstation" : "enterprise-it";
  }

  return "enterprise-it";
}

/** Picks the most security-relevant protocol colour family for a conduit's port/service. */
export function familyForFlow(port: number | undefined, service: string | undefined): ProtocolFamilyId {
  if (service) {
    const keyword = SERVICE_KEYWORDS.find((entry) => entry.match.test(service));
    if (keyword) {
      return keyword.value.family;
    }
  }
  if (port !== undefined && PORT_TABLE[port]) {
    return PORT_TABLE[port].family;
  }
  return "auto";
}

export function protocolLabelForFlow(port: number | undefined, service: string | undefined): string {
  if (port !== undefined || service !== undefined) {
    return classifyPort({ port: port ?? 0, service }).protocol;
  }
  return "Traffic";
}
