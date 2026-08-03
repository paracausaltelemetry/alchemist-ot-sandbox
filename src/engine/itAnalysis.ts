import { classifyItDevice } from "../import/itInference";
import { itKindLabel } from "../models/itMap";
import type { ImportedHost, ParsedImport } from "../import/types";

/**
 * An IT-focused reading of an imported host/port scan (typically Nmap): what is
 * exposed, what is reachable from the internet, whether the network is flat, and
 * a plain inventory. This is the IT counterpart to the OT scoring engine and is
 * intentionally decoupled from Purdue zones and IEC 62443.
 */

export type ItSeverity = "high" | "medium" | "low";

export interface RiskyService {
  ip: string;
  hostname?: string;
  port: number;
  transport?: string;
  service: string;
  severity: ItSeverity;
  reason: string;
  publicIp: boolean;
}

/**
 * How a host came to be called externally reachable.
 *
 * `reached` is an observation: a scan run from outside the network answered for this host.
 * `address` is an inference from the address alone, which is all a single internal scan can offer —
 * a publicly routable address may still sit behind a firewall that drops everything.
 */
export type ExposureBasis = "reached" | "address";

export interface ExposedHost {
  ip: string;
  hostname?: string;
  openPorts: number;
  basis: ExposureBasis;
}

/**
 * What the scans that produced this parse could see, which the parse itself cannot say.
 *
 * Without it the analysis has only addressing to reason from, and "internet-facing" quietly means
 * "has a public address". Once an engagement accumulates scans from different vantages that stops
 * being good enough: a host reached from outside is externally reachable whatever its address, and
 * hosts only ever seen from inside should not sit under the same heading as ones that were not.
 */
export interface ItAnalysisContext {
  /** Host keys answered by at least one scan run from an external vantage. */
  reachedFromOutside?: Set<string>;
  /** True when any scan in this engagement ran from outside, so absence of evidence means something. */
  hasExternalScan?: boolean;
}

/** The key the map and the engagement both use for a host. */
export const itHostKey = (host: { ip?: string; hostname?: string }): string =>
  (host.ip || host.hostname || "").toLowerCase();

export interface SubnetSummary {
  cidr: string;
  hostCount: number;
}

export interface Tally {
  label: string;
  count: number;
}

export interface ItAnalysis {
  totalHosts: number;
  totalOpenPorts: number;
  subnets: SubnetSummary[];
  /**
   * Every host seen *so far* sits in one subnet. Worth stating as a shape, but it is a statement
   * about the scans and not about the network: another scan from another vantage can and does
   * reveal segments that flip this to false.
   */
  flatNetwork: boolean;
  largestSubnet?: SubnetSummary;
  /** Hosts reachable from outside the network, each carrying how that was established. */
  externallyReachable: ExposedHost[];
  riskyServices: RiskyService[];
  byOs: Tally[];
  byVendor: Tally[];
  byAssetType: Tally[];
}

interface RiskDefinition {
  /**
   * Severity when the service is only reachable on a private address. Anything on a public
   * address is high regardless — see `analyseItNetwork`.
   */
  internal: ItSeverity;
  reason: string;
}

/**
 * Ports whose exposure is worth flagging on an IT network, with why.
 *
 * Severity is graded by *where* the service is exposed, not only by what it is. Internally,
 * SMB on a file server and RDP on a Windows estate are the network working as designed; calling
 * them high made every Windows host red and the exposure view useless, which is worse than not
 * having one. High is reserved for services that are a finding wherever they are: cleartext
 * administration, and data stores that historically ship unauthenticated.
 */
const RISKY_PORTS: Record<number, RiskDefinition> = {
  // Cleartext administration — a finding anywhere.
  23: { internal: "high", reason: "Telnet: cleartext remote administration" },
  512: { internal: "high", reason: "rexec: cleartext trust-based remote access" },
  513: { internal: "high", reason: "rlogin: cleartext trust-based remote access" },
  514: { internal: "high", reason: "rsh: cleartext trust-based remote access" },
  5900: { internal: "high", reason: "VNC: remote control, often weak or no auth" },
  5901: { internal: "high", reason: "VNC: remote control, often weak or no auth" },

  // Data stores that have historically shipped open to anyone who can reach them.
  27017: { internal: "high", reason: "MongoDB: database, historically default-open" },
  6379: { internal: "high", reason: "Redis: frequently unauthenticated" },
  9200: { internal: "high", reason: "Elasticsearch: often unauthenticated data store" },
  11211: { internal: "high", reason: "Memcached: unauthenticated, amplification risk" },
  5984: { internal: "high", reason: "CouchDB: database exposed on the network" },

  // Ordinary internally, worth knowing, and high the moment they face the internet.
  21: { internal: "medium", reason: "FTP: cleartext credentials and file transfer" },
  69: { internal: "medium", reason: "TFTP: unauthenticated file transfer" },
  139: { internal: "medium", reason: "NetBIOS/SMB: legacy file sharing and lateral movement" },
  445: { internal: "medium", reason: "SMB: file sharing, lateral movement (EternalBlue class)" },
  3389: { internal: "medium", reason: "RDP: remote desktop, brute force and BlueKeep class" },
  5985: { internal: "medium", reason: "WinRM (HTTP): remote management" },
  161: { internal: "medium", reason: "SNMP: default community strings leak device data" },
  2049: { internal: "medium", reason: "NFS: network file shares" },
  1433: { internal: "medium", reason: "MSSQL: database reachable on the network" },
  3306: { internal: "medium", reason: "MySQL/MariaDB: database reachable on the network" },
  5432: { internal: "medium", reason: "PostgreSQL: database reachable on the network" },
  1521: { internal: "medium", reason: "Oracle DB: database reachable on the network" },
  6000: { internal: "medium", reason: "X11: remote display, weak access control" },

  // Expected infrastructure. Listed so the inventory is complete, not to raise an alarm.
  135: { internal: "low", reason: "MSRPC endpoint mapper: lateral-movement surface" },
  111: { internal: "low", reason: "rpcbind/portmapper: exposes RPC services" },
  389: { internal: "low", reason: "LDAP: directory service, often cleartext" },
  5986: { internal: "low", reason: "WinRM (HTTPS): remote management" }
};

const PRIVATE_V4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./
];

/** True when an address is routable on the public internet (not RFC1918/loopback/link-local/CGNAT/ULA). */
export function isPublicIp(ip: string | undefined): boolean {
  if (!ip) {
    return false;
  }
  if (ip.includes(":")) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower.startsWith("fe80") || lower.startsWith("fc") || lower.startsWith("fd")) {
      return false;
    }
    return true;
  }
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    return false;
  }
  if (ip === "0.0.0.0" || ip.startsWith("255.")) {
    return false;
  }
  const firstOctet = Number(ip.split(".")[0]);
  if (firstOctet >= 224) {
    return false;
  }
  return !PRIVATE_V4.some((pattern) => pattern.test(ip));
}

const SEVERITY_ORDER: Record<ItSeverity, number> = { high: 0, medium: 1, low: 2 };

function tally(values: string[]): Tally[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) {
      continue;
    }
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function subnetOf(host: ImportedHost): string | undefined {
  if (host.ip && /^\d{1,3}(\.\d{1,3}){3}$/.test(host.ip)) {
    return `${host.ip.split(".").slice(0, 3).join(".")}.0/24`;
  }
  return undefined;
}

export function analyseItNetwork(parsed: ParsedImport, context: ItAnalysisContext = {}): ItAnalysis {
  const hosts = parsed.hosts;
  const riskyServices: RiskyService[] = [];
  const externallyReachable: ExposedHost[] = [];
  const subnetCounts = new Map<string, number>();
  let totalOpenPorts = 0;

  for (const host of hosts) {
    totalOpenPorts += host.ports.length;
    const publicIp = isPublicIp(host.ip);
    // An observation outranks the inference: a host that answered a scan from outside is externally
    // reachable whether or not its address says it should be.
    const reached = context.reachedFromOutside?.has(itHostKey(host)) ?? false;
    const exposed = reached || publicIp;
    if (exposed) {
      externallyReachable.push({
        ip: host.ip || host.hostname || "unknown",
        hostname: host.hostname,
        openPorts: host.ports.length,
        basis: reached ? "reached" : "address"
      });
    }
    const subnet = subnetOf(host);
    if (subnet) {
      subnetCounts.set(subnet, (subnetCounts.get(subnet) ?? 0) + 1);
    }
    for (const port of host.ports) {
      const definition = RISKY_PORTS[port.port];
      if (!definition) {
        continue;
      }
      // Reachable from outside outranks everything the port table says.
      const severity: ItSeverity = exposed ? "high" : definition.internal;
      riskyServices.push({
        ip: host.ip || host.hostname || "unknown",
        hostname: host.hostname,
        port: port.port,
        transport: port.transport,
        service: port.service || definition.reason.split(":")[0],
        severity,
        reason: reached
          ? `${definition.reason} — reached from outside the network`
          : publicIp
            ? `${definition.reason} — on a publicly routable address`
            : definition.reason,
        publicIp: exposed
      });
    }
  }

  riskyServices.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.ip.localeCompare(b.ip) || a.port - b.port
  );

  const subnets: SubnetSummary[] = [...subnetCounts.entries()]
    .map(([cidr, hostCount]) => ({ cidr, hostCount }))
    .sort((a, b) => b.hostCount - a.hostCount || a.cidr.localeCompare(b.cidr));
  const largestSubnet = subnets[0];
  const flatNetwork = subnets.length <= 1 && hosts.length > 3;

  return {
    totalHosts: hosts.length,
    totalOpenPorts,
    subnets,
    flatNetwork,
    largestSubnet,
    externallyReachable,
    riskyServices,
    byOs: tally(hosts.map((host) => host.os || "").filter(Boolean)),
    byVendor: tally(hosts.map((host) => host.vendor || "").filter(Boolean)),
    byAssetType: tally(hosts.map((host) => itKindLabel(classifyItDevice(host))))
  };
}

/** Renders an IT analysis as a shareable Markdown report. */
export function itReportMarkdown(analysis: ItAnalysis): string {
  const lines: string[] = ["# IT network map", ""];
  lines.push(`- Hosts: ${analysis.totalHosts}`);
  lines.push(`- Open ports: ${analysis.totalOpenPorts}`);
  lines.push(`- Subnets: ${analysis.subnets.length}`);
  if (analysis.flatNetwork) {
    // "seen so far", because this is a statement about the scans and not about the network.
    lines.push(`- Flat network: every host seen so far sits in ${analysis.largestSubnet?.cidr}`);
  }

  lines.push("", "## Risky exposed services", "");
  if (analysis.riskyServices.length === 0) {
    lines.push("None flagged.");
  } else {
    lines.push("| Severity | Host | Port | Reason |", "| --- | --- | --- | --- |");
    for (const service of analysis.riskyServices) {
      const host = service.hostname ? `${service.ip} (${service.hostname})` : service.ip;
      lines.push(`| ${service.severity} | ${host} | ${service.port}/${service.transport ?? "tcp"} ${service.service} | ${service.reason} |`);
    }
  }

  lines.push("", "## Externally reachable hosts", "");
  if (analysis.externallyReachable.length === 0) {
    lines.push("None.");
  } else {
    for (const host of analysis.externallyReachable) {
      const name = host.hostname ? ` (${host.hostname})` : "";
      const basis = host.basis === "reached" ? "reached from outside" : "publicly routable address";
      lines.push(`- ${host.ip}${name} — ${host.openPorts} open ports (${basis})`);
    }
  }

  lines.push("", "## Inventory", "");
  const section = (title: string, rows: Tally[]) => {
    if (rows.length === 0) {
      return;
    }
    lines.push(`**${title}**`, "");
    for (const row of rows) {
      lines.push(`- ${row.label}: ${row.count}`);
    }
    lines.push("");
  };
  section("By subnet", analysis.subnets.map((subnet) => ({ label: subnet.cidr, count: subnet.hostCount })));
  section("By device type", analysis.byAssetType);
  section("By OS", analysis.byOs);
  section("By vendor", analysis.byVendor);

  return `${lines.join("\n")}\n`;
}
