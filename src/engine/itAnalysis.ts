import { inferAssetType } from "../import/inference";
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

export interface ExposedHost {
  ip: string;
  hostname?: string;
  openPorts: number;
}

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
  flatNetwork: boolean;
  largestSubnet?: SubnetSummary;
  internetFacing: ExposedHost[];
  riskyServices: RiskyService[];
  byOs: Tally[];
  byVendor: Tally[];
  byAssetType: Tally[];
}

interface RiskDefinition {
  severity: ItSeverity;
  reason: string;
}

/** Ports whose exposure is worth flagging on an IT network, with why. */
const RISKY_PORTS: Record<number, RiskDefinition> = {
  23: { severity: "high", reason: "Telnet: cleartext remote administration" },
  21: { severity: "medium", reason: "FTP: cleartext credentials and file transfer" },
  69: { severity: "medium", reason: "TFTP: unauthenticated file transfer" },
  512: { severity: "high", reason: "rexec: cleartext trust-based remote access" },
  513: { severity: "high", reason: "rlogin: cleartext trust-based remote access" },
  514: { severity: "high", reason: "rsh: cleartext trust-based remote access" },
  135: { severity: "medium", reason: "MSRPC endpoint mapper: lateral-movement surface" },
  139: { severity: "high", reason: "NetBIOS/SMB: legacy file sharing and lateral movement" },
  445: { severity: "high", reason: "SMB: file sharing, lateral movement (EternalBlue class)" },
  3389: { severity: "high", reason: "RDP: remote desktop, brute force and BlueKeep class" },
  5900: { severity: "high", reason: "VNC: remote control, often weak or no auth" },
  5901: { severity: "high", reason: "VNC: remote control, often weak or no auth" },
  5985: { severity: "medium", reason: "WinRM (HTTP): remote management" },
  5986: { severity: "low", reason: "WinRM (HTTPS): remote management" },
  161: { severity: "medium", reason: "SNMP: default community strings leak device data" },
  111: { severity: "medium", reason: "rpcbind/portmapper: exposes RPC services" },
  2049: { severity: "medium", reason: "NFS: network file shares" },
  389: { severity: "medium", reason: "LDAP: directory exposure (often cleartext)" },
  1433: { severity: "high", reason: "MSSQL: database exposed on the network" },
  3306: { severity: "high", reason: "MySQL/MariaDB: database exposed on the network" },
  5432: { severity: "high", reason: "PostgreSQL: database exposed on the network" },
  1521: { severity: "high", reason: "Oracle DB: database exposed on the network" },
  27017: { severity: "high", reason: "MongoDB: database, historically default-open" },
  6379: { severity: "high", reason: "Redis: frequently unauthenticated" },
  9200: { severity: "high", reason: "Elasticsearch: often unauthenticated data store" },
  11211: { severity: "high", reason: "Memcached: unauthenticated, amplification risk" },
  5984: { severity: "high", reason: "CouchDB: database exposed on the network" },
  6000: { severity: "medium", reason: "X11: remote display, weak access control" }
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

function prettifyType(id: string): string {
  return id.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function analyseItNetwork(parsed: ParsedImport): ItAnalysis {
  const hosts = parsed.hosts;
  const riskyServices: RiskyService[] = [];
  const internetFacing: ExposedHost[] = [];
  const subnetCounts = new Map<string, number>();
  let totalOpenPorts = 0;

  for (const host of hosts) {
    totalOpenPorts += host.ports.length;
    const publicIp = isPublicIp(host.ip);
    if (publicIp) {
      internetFacing.push({ ip: host.ip as string, hostname: host.hostname, openPorts: host.ports.length });
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
      // A risky service reachable from the internet is always high severity.
      const severity: ItSeverity = publicIp ? "high" : definition.severity;
      riskyServices.push({
        ip: host.ip || host.hostname || "unknown",
        hostname: host.hostname,
        port: port.port,
        transport: port.transport,
        service: port.service || definition.reason.split(":")[0],
        severity,
        reason: publicIp ? `${definition.reason} — reachable from the internet` : definition.reason,
        publicIp
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
    internetFacing,
    riskyServices,
    byOs: tally(hosts.map((host) => host.os || "").filter(Boolean)),
    byVendor: tally(hosts.map((host) => host.vendor || "").filter(Boolean)),
    byAssetType: tally(hosts.map((host) => prettifyType(inferAssetType(host))))
  };
}

/** Renders an IT analysis as a shareable Markdown report. */
export function itReportMarkdown(analysis: ItAnalysis): string {
  const lines: string[] = ["# IT network map", ""];
  lines.push(`- Hosts: ${analysis.totalHosts}`);
  lines.push(`- Open ports: ${analysis.totalOpenPorts}`);
  lines.push(`- Subnets: ${analysis.subnets.length}`);
  if (analysis.flatNetwork) {
    lines.push(`- Flat network: every host sits in ${analysis.largestSubnet?.cidr}`);
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

  lines.push("", "## Internet-facing hosts", "");
  if (analysis.internetFacing.length === 0) {
    lines.push("None.");
  } else {
    for (const host of analysis.internetFacing) {
      const name = host.hostname ? ` (${host.hostname})` : "";
      lines.push(`- ${host.ip}${name} — ${host.openPorts} open ports`);
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
