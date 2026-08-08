import type { Conduit, ProtocolFamilyId } from "../models/types";

/** Where the protocol lives on the wire. A protocol can be more than one (DNP3 is TCP and UDP). */
export type ProtocolTransport = "tcp" | "udp" | "l2" | "serial";

/**
 * What a conduit tells you about its own security when it names nothing but the protocol.
 *
 * - `none` — the protocol carries no authentication or confidentiality at all, so naming it is
 *   enough to know there is none.
 * - `optional` — security exists in the standard but is a separate profile, a later version, or off
 *   by default, so the protocol name alone does not say whether it is switched on.
 * - `built-in` — you cannot use the protocol without it.
 *
 * This is deliberately about what can be inferred from a name, because that is all the model has.
 */
export type NativeSecurity = "none" | "optional" | "built-in";

export interface ProtocolFamilyDefinition {
  id: Exclude<ProtocolFamilyId, "auto">;
  label: string;
  color: string;
  shortLabel: string;
  riskNote: string;
  aliases: string[];
  ports: string[];
  transport: ProtocolTransport[];
  nativeSecurity: NativeSecurity;
}

export const protocolFamilies: ProtocolFamilyDefinition[] = [
  {
    id: "https-tls",
    label: "HTTPS / TLS",
    shortLabel: "TLS",
    color: "#17a2a4",
    riskNote: "Encrypted application traffic. Confirm inspection, certificate ownership, and exact destinations at boundaries.",
    aliases: ["https", "tls", "ssl", "wss"],
    ports: ["443", "8443", "9443"],
    transport: ["tcp"],
    nativeSecurity: "built-in"
  },
  {
    id: "http",
    label: "HTTP",
    shortLabel: "HTTP",
    color: "#f28e2b",
    riskNote: "Cleartext web traffic. Avoid across trust boundaries unless there is a compensating control.",
    aliases: ["http"],
    ports: ["80", "8080", "8000"],
    transport: ["tcp"],
    nativeSecurity: "none"
  },
  {
    id: "modbus",
    label: "Modbus TCP",
    shortLabel: "MBTCP",
    color: "#e15759",
    riskNote: "No authentication or integrity in the protocol. Restrict to necessary peers and monitor closely.",
    aliases: ["modbus", "modbus tcp", "mbtcp"],
    ports: ["502"],
    transport: ["tcp"],
    nativeSecurity: "none"
  },
  {
    id: "opc",
    label: "OPC UA",
    shortLabel: "OPCUA",
    color: "#4e79a7",
    riskNote: "Secure profiles exist but are optional. Confirm the security policy, message mode, and certificate trust list.",
    aliases: ["opc ua", "opc-ua", "opcua", "opc"],
    ports: ["4840", "4843"],
    transport: ["tcp"],
    nativeSecurity: "optional"
  },
  {
    id: "opc-da",
    label: "OPC DA (DCOM)",
    shortLabel: "OPCDA",
    color: "#3d5f85",
    riskNote: "Classic OPC over DCOM. Dynamic port range makes it hard to firewall; prefer a tunneller or OPC UA.",
    aliases: ["opc da", "opc-da", "opc classic", "dcom"],
    ports: ["135"],
    transport: ["tcp"],
    nativeSecurity: "none"
  },
  {
    id: "dnp3",
    label: "DNP3",
    shortLabel: "DNP3",
    color: "#b07aa1",
    riskNote: "Secure Authentication (IEEE 1815) is optional and often absent. Confirm it, plus directionality and monitoring.",
    aliases: ["dnp3", "dnp"],
    ports: ["20000"],
    transport: ["tcp", "udp"],
    nativeSecurity: "optional"
  },
  {
    id: "iec104",
    label: "IEC 60870-5-104",
    shortLabel: "IEC104",
    color: "#8c6bb1",
    riskNote: "Telecontrol with no native security. IEC 62351 must be applied separately; restrict and monitor the path.",
    aliases: ["iec 104", "iec-104", "iec104", "60870-5-104", "iec 60870-5-104"],
    ports: ["2404"],
    transport: ["tcp"],
    nativeSecurity: "none"
  },
  {
    id: "iec61850-mms",
    label: "IEC 61850 MMS",
    shortLabel: "MMS",
    color: "#7b6faf",
    riskNote: "Substation client/server traffic. Current, not legacy, but unsecured unless IEC 62351 is applied.",
    aliases: ["iec 61850 mms", "iec61850 mms", "mms", "manufacturing message specification"],
    ports: ["102"],
    transport: ["tcp"],
    nativeSecurity: "none"
  },
  {
    id: "iec61850-l2",
    label: "IEC 61850 GOOSE / SV",
    shortLabel: "GOOSE",
    color: "#6a5acd",
    // Layer 2 multicast: no IP, no ports. A port on a GOOSE conduit is a data-entry error, not a fact.
    riskNote: "Layer 2 multicast with no IP and no ports. Contain within the process bus VLAN; it cannot be routed or firewalled by port.",
    aliases: ["goose", "sampled values", "sampled value", "iec 61850-9-2", "iec61850-9-2", "sv"],
    ports: [],
    transport: ["l2"],
    nativeSecurity: "none"
  },
  {
    id: "iccp",
    label: "ICCP / TASE.2",
    shortLabel: "ICCP",
    color: "#9a7fc4",
    riskNote: "Inter-control-centre links. Secure ICCP adds TLS and certificates; confirm which variant is in use.",
    aliases: ["iccp", "tase.2", "tase 2", "tase2"],
    ports: ["102"],
    transport: ["tcp"],
    nativeSecurity: "optional"
  },
  {
    id: "ethernet-ip",
    label: "EtherNet/IP",
    shortLabel: "EIP",
    color: "#59a14f",
    riskNote: "Controller communication with no native security. Limit engineering and controller paths to approved change windows.",
    aliases: ["ethernet/ip", "ethernet ip", "ethernet-ip", "cip"],
    ports: ["44818", "2222"],
    transport: ["tcp", "udp"],
    nativeSecurity: "none"
  },
  {
    id: "profinet",
    label: "PROFINET",
    shortLabel: "PN",
    color: "#edc948",
    riskNote: "Industrial control traffic with no native security. Avoid unnecessary routing outside the cell or area.",
    aliases: ["profinet"],
    ports: ["34962", "34963", "34964"],
    transport: ["tcp", "udp"],
    nativeSecurity: "none"
  },
  {
    id: "profibus",
    label: "PROFIBUS",
    shortLabel: "PB",
    color: "#c9a227",
    riskNote: "Serial fieldbus with no native security. Protection is physical and by segment; there is nothing to firewall.",
    aliases: ["profibus", "profibus dp", "profibus pa"],
    ports: [],
    transport: ["serial"],
    nativeSecurity: "none"
  },
  {
    id: "hart",
    label: "HART-IP",
    shortLabel: "HART",
    color: "#a68b2c",
    riskNote: "Instrument access carried over IP with no native security. Restrict to the instrument asset management host.",
    aliases: ["hart", "hart-ip", "hart ip", "wirelesshart"],
    ports: ["5094"],
    transport: ["tcp", "udp"],
    nativeSecurity: "none"
  },
  {
    id: "s7",
    label: "S7comm",
    shortLabel: "S7",
    color: "#76b7b2",
    // Port 102 is shared with IEC 61850 MMS and ICCP, so it cannot identify this family on its own.
    riskNote: "Controller programming and data traffic with no native authentication. Restrict write-capable paths and monitor engineering activity.",
    aliases: ["s7", "siemens s7", "s7comm", "s7comm-plus"],
    ports: ["102"],
    transport: ["tcp"],
    nativeSecurity: "none"
  },
  {
    id: "bacnet",
    label: "BACnet/IP",
    shortLabel: "BACnet",
    color: "#8fbf6f",
    riskNote: "Building automation with no native security. Segment from corporate networks and restrict the BBMD path.",
    aliases: ["bacnet", "bacnet/ip", "bacnet ip", "bacnet ms/tp"],
    ports: ["47808"],
    transport: ["udp"],
    nativeSecurity: "none"
  },
  {
    id: "fox",
    label: "Niagara Fox",
    shortLabel: "FOX",
    color: "#6f9f4f",
    riskNote: "Tridium building controllers. The TLS variant is a separate port; confirm which one is actually in use.",
    aliases: ["fox", "niagara", "niagara fox", "foxs"],
    ports: ["1911", "4911"],
    transport: ["tcp"],
    nativeSecurity: "optional"
  },
  {
    id: "osdp",
    label: "OSDP",
    shortLabel: "OSDP",
    color: "#b0855f",
    riskNote: "Physical access control to readers. Secure Channel is optional; without it the reader bus is clonable.",
    aliases: ["osdp", "osdp v2", "sia osdp"],
    ports: [],
    transport: ["serial"],
    nativeSecurity: "optional"
  },
  {
    id: "rdp",
    label: "RDP",
    shortLabel: "RDP",
    color: "#af7aa1",
    riskNote: "Interactive administration. Require named users, MFA where possible, jump-host control, and session logging.",
    aliases: ["rdp", "remote desktop"],
    ports: ["3389"],
    transport: ["tcp"],
    nativeSecurity: "built-in"
  },
  {
    id: "ssh",
    label: "SSH",
    shortLabel: "SSH",
    color: "#9c755f",
    riskNote: "Administrative shell access. Restrict privileged access and record boundary sessions.",
    aliases: ["ssh", "sftp", "scp"],
    ports: ["22"],
    transport: ["tcp"],
    nativeSecurity: "built-in"
  },
  {
    id: "telnet",
    label: "Telnet",
    shortLabel: "TELNET",
    color: "#d16a5a",
    riskNote: "Cleartext interactive shell, credentials included. Replace with SSH or remove the service.",
    aliases: ["telnet"],
    ports: ["23"],
    transport: ["tcp"],
    nativeSecurity: "none"
  },
  {
    id: "ftp",
    label: "FTP",
    shortLabel: "FTP",
    color: "#e08a5f",
    riskNote: "Cleartext file transfer, credentials included. Replace with SFTP or a managed transfer service.",
    aliases: ["ftp", "tftp"],
    ports: ["21", "69"],
    transport: ["tcp"],
    nativeSecurity: "none"
  },
  {
    id: "smb",
    label: "SMB",
    shortLabel: "SMB",
    color: "#ff9da7",
    riskNote: "File sharing and lateral movement risk. SMB3 signing and encryption are optional; avoid direct IT-to-OT exposure.",
    aliases: ["smb", "cifs", "windows file sharing"],
    ports: ["445", "139"],
    transport: ["tcp"],
    nativeSecurity: "optional"
  },
  {
    id: "snmp",
    label: "SNMP",
    shortLabel: "SNMP",
    color: "#a3a3a3",
    // One family for all three versions: v1 and v2c have no security, v3 does, and the model cannot
    // tell them apart from a name that often just says "SNMP".
    riskNote: "v1 and v2c send community strings in cleartext. Confirm the version, and prefer v3 with authentication and privacy.",
    aliases: ["snmp", "snmp v1", "snmpv1", "snmp v2", "snmpv2", "snmp v2c", "snmpv2c", "snmp v3", "snmpv3"],
    ports: ["161", "162"],
    transport: ["udp"],
    nativeSecurity: "optional"
  },
  {
    id: "dns-ntp",
    label: "DNS / NTP",
    shortLabel: "DNS/NTP",
    color: "#bab0ab",
    riskNote: "Infrastructure dependency. Confirm trusted resolvers, time sources, and boundary logging.",
    aliases: ["dns", "ntp", "time sync"],
    ports: ["53", "123"],
    transport: ["udp"],
    nativeSecurity: "none"
  },
  {
    id: "mqtt",
    label: "MQTT",
    shortLabel: "MQTT",
    color: "#86bc86",
    riskNote: "Publish/subscribe telemetry. TLS is a separate listener; confirm broker placement, authentication, and topic permissions.",
    aliases: ["mqtt", "mqtts"],
    ports: ["1883", "8883"],
    transport: ["tcp"],
    nativeSecurity: "optional"
  },
  {
    id: "vpn",
    label: "VPN",
    shortLabel: "VPN",
    color: "#d37295",
    riskNote: "Remote access entry point. Require approval, MFA, jump-host mediation, and session monitoring.",
    aliases: ["vpn", "ipsec", "wireguard", "openvpn", "ssl vpn", "vendor vpn"],
    ports: ["500", "4500", "1194", "51820"],
    transport: ["udp"],
    nativeSecurity: "built-in"
  },
  {
    id: "unknown",
    label: "Unknown",
    shortLabel: "UNK",
    color: "#8e979c",
    riskNote: "Undocumented protocol. Confirm business purpose, owner, port, and exact permit rule.",
    aliases: ["unknown", "any", "*"],
    ports: [],
    transport: [],
    nativeSecurity: "optional"
  },
  {
    id: "other",
    label: "Other",
    shortLabel: "OTHER",
    color: "#c4cbd0",
    riskNote: "Custom or vendor-specific traffic. Document protocol behaviour and required peers.",
    aliases: [],
    ports: [],
    transport: [],
    nativeSecurity: "optional"
  }
];

/** Families the model can say nothing about, so they are excluded from classification and from rules. */
const UNCLASSIFIED = new Set<ProtocolFamilyId>(["unknown", "other"]);

const familyById = new Map(protocolFamilies.map((family) => [family.id, family]));

const classifiable = protocolFamilies.filter((family) => !UNCLASSIFIED.has(family.id));

/**
 * Ports claimed by more than one family. TCP 102 is the reason this exists: S7comm, IEC 61850 MMS
 * and ICCP all legitimately use it, so a port-only classifier cannot tell them apart and the honest
 * answer is `unknown`. Derived rather than listed, so adding a family that collides is self-fixing.
 */
const ambiguousPorts = (() => {
  const counts = new Map<string, number>();
  for (const family of classifiable) {
    for (const port of family.ports) {
      counts.set(port, (counts.get(port) ?? 0) + 1);
    }
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([port]) => port));
})();

/** Aliases longest-first, so "opc da" wins over "opc" when both match the same string. */
const aliasIndex = classifiable
  .flatMap((family) => family.aliases.map((alias) => ({ alias, family: family.id })))
  .sort((a, b) => b.alias.length - a.alias.length);

/** Exact aliases are unique across families; if two ever collide, the first declared one wins. */
const exactAlias = new Map([...aliasIndex].reverse().map((entry) => [entry.alias, entry.family] as const));

const boundaryPatterns = aliasIndex.map((entry) => ({
  family: entry.family,
  pattern: new RegExp(`(^|[^a-z0-9])${entry.alias.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}([^a-z0-9]|$)`)
}));

const portIndex = new Map(
  classifiable.flatMap((family) =>
    family.ports.filter((port) => !ambiguousPorts.has(port)).map((port) => [port, family.id] as const)
  )
);

export function getProtocolFamilyDefinition(id: ProtocolFamilyId): ProtocolFamilyDefinition {
  if (id === "auto") {
    return familyById.get("other")!;
  }
  return familyById.get(id) ?? familyById.get("other")!;
}

/**
 * Three ordered passes over every family: exact alias, then longest word-boundary alias, then port.
 *
 * The passes are global rather than nested inside a per-family loop. Checking name-then-port family
 * by family let an earlier family's port beat a later family's name — so "IEC 61850 MMS" on port 102
 * resolved to S7 purely because S7 is declared first.
 */
export function classifyProtocol(protocol: string, port = ""): Exclude<ProtocolFamilyId, "auto"> {
  const normalizedProtocol = protocol.trim().toLowerCase();
  const normalizedPort = port.trim().toLowerCase();

  if (!normalizedProtocol && !normalizedPort) {
    return "unknown";
  }

  const exact = exactAlias.get(normalizedProtocol);
  if (exact) {
    return exact;
  }

  if (normalizedProtocol) {
    const boundary = boundaryPatterns.find((entry) => entry.pattern.test(normalizedProtocol));
    if (boundary) {
      return boundary.family;
    }
  }

  const byPort = portIndex.get(normalizedPort);
  if (byPort) {
    return byPort;
  }

  // A port that several families share identifies nothing, and neither does no name at all.
  if (!normalizedProtocol) {
    return "unknown";
  }
  return "other";
}

export function resolveProtocolFamily(conduit: Pick<Conduit, "protocol" | "port" | "protocolFamily">): ProtocolFamilyDefinition {
  if (conduit.protocolFamily && conduit.protocolFamily !== "auto") {
    return getProtocolFamilyDefinition(conduit.protocolFamily);
  }
  return getProtocolFamilyDefinition(classifyProtocol(conduit.protocol, conduit.port));
}

export function protocolLabel(conduit: Pick<Conduit, "protocol" | "port" | "protocolFamily">) {
  const family = resolveProtocolFamily(conduit);
  const protocol = conduit.protocol.trim() || family.label;
  return conduit.port.trim() ? `${protocol}:${conduit.port.trim()}` : protocol;
}

/**
 * The single answer to "does naming this protocol tell me it is unprotected?". Replaces three
 * hand-maintained lists that disagreed with each other — scoring's `legacyProtocols`,
 * securityLevels' `LEGACY_CLEARTEXT`, and the knowledge base's cheat sheet.
 *
 * Returns `null` when the name resolves to nothing the model knows, so callers can stay silent
 * rather than assert something about a protocol they cannot identify.
 */
export function protocolSecurity(protocol: string): NativeSecurity | null {
  const family = classifyProtocol(protocol);
  return UNCLASSIFIED.has(family) ? null : getProtocolFamilyDefinition(family).nativeSecurity;
}

/** True when the protocol carries no authentication or confidentiality at all. */
export function protocolLacksNativeSecurity(protocol: string): boolean {
  return protocolSecurity(protocol) === "none";
}

const TRANSPORT_LABEL: Record<ProtocolTransport, string> = {
  tcp: "TCP",
  udp: "UDP",
  l2: "L2",
  serial: "Serial"
};

export const transportLabel = (transport: ProtocolTransport[]) =>
  transport.length === 0 ? "—" : transport.map((entry) => TRANSPORT_LABEL[entry]).join(" / ");

export const nativeSecurityNote: Record<NativeSecurity, string> = {
  none: "No native authentication or encryption",
  optional: "Security is optional; confirm it is enabled",
  "built-in": "Secured by the protocol; verify configuration"
};
