import type { ImportedHost, ImportedPort, ParsedImport } from "./types";

/**
 * Parsers for Nmap's text outputs, alongside the XML parser in `nmap.ts`:
 *  - normal output (`-oN`), the default human-readable report, and
 *  - greppable output (`-oG`), one line per host.
 * Both are host/port scans, so they yield assets but no host-to-host flows.
 */

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

function looksLikeIp(value: string): boolean {
  return IPV4.test(value) || value.includes(":");
}

/** Splits an Nmap "scan report for" target into a hostname and/or IP. */
function parseTarget(target: string): { ip?: string; hostname?: string } {
  const trimmed = target.trim();
  const withParen = trimmed.match(/^(.*?)\s+\(([^)]+)\)$/);
  if (withParen) {
    const name = withParen[1].trim();
    const addr = withParen[2].trim();
    return { hostname: name || undefined, ip: looksLikeIp(addr) ? addr : undefined };
  }
  return looksLikeIp(trimmed) ? { ip: trimmed } : { hostname: trimmed };
}

function pushHost(hosts: ImportedHost[], host: ImportedHost | null): void {
  if (host && (host.ip || host.hostname)) {
    hosts.push(host);
  }
}

export function parseNmapNormal(text: string): ParsedImport {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const hosts: ImportedHost[] = [];
  const warnings: string[] = [];
  let current: ImportedHost | null = null;
  let inPortTable = false;

  for (const line of lines) {
    const report = line.match(/^Nmap scan report for (.+)$/);
    if (report) {
      pushHost(hosts, current);
      const { ip, hostname } = parseTarget(report[1]);
      current = { ip, hostname, ports: [] };
      inPortTable = false;
      continue;
    }
    if (!current) {
      continue;
    }

    if (/^Host seems down/i.test(line) || /^Note: Host seems down/i.test(line)) {
      current = null;
      continue;
    }

    if (/^PORT\s+STATE\s+SERVICE/i.test(line)) {
      inPortTable = true;
      continue;
    }

    if (inPortTable) {
      const port = line.match(/^(\d+)\/(tcp|udp)\s+(\S+)\s+(\S+)(?:\s+(.*))?$/i);
      if (port) {
        if (port[3].toLowerCase().startsWith("open")) {
          const entry: ImportedPort = { port: Number(port[1]), transport: port[2].toLowerCase(), service: port[4] };
          const product = port[5]?.trim();
          if (product) {
            entry.product = product;
          }
          current.ports.push(entry);
        }
        continue;
      }
      if (line.trim() === "" || /^MAC Address:|^Service Info:|^OS |^Running|^Aggressive OS|^Device type|^Network Distance/i.test(line)) {
        inPortTable = false;
      }
    }

    const mac = line.match(/^MAC Address:\s+([0-9A-Fa-f:]{17})(?:\s+\((.*)\))?/);
    if (mac) {
      current.mac = mac[1];
      if (mac[2]) {
        current.vendor = mac[2].trim();
      }
      continue;
    }

    const os =
      line.match(/^OS details:\s*(.+)$/i) ||
      line.match(/^Running:\s*(.+)$/i) ||
      line.match(/^Aggressive OS guesses:\s*(.+?)(?:\s*\(\d+%\).*)?$/i);
    if (os && !current.os) {
      current.os = os[1].trim();
    }
  }
  pushHost(hosts, current);

  if (hosts.length === 0) {
    warnings.push("No hosts found. Is this Nmap normal output (-oN)?");
  }
  return { format: "nmap-normal", hosts, flows: [], warnings };
}

export function parseNmapGreppable(text: string): ParsedImport {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const byKey = new Map<string, ImportedHost>();
  const warnings: string[] = [];

  for (const line of lines) {
    if (line.startsWith("#") || !line.startsWith("Host:")) {
      continue;
    }
    const headMatch = line.match(/^Host:\s+(\S+)\s+\(([^)]*)\)/);
    if (!headMatch) {
      continue;
    }
    const ip = headMatch[1];
    const hostname = headMatch[2].trim() || undefined;
    if (/Status:\s*Down/i.test(line)) {
      continue;
    }
    const key = ip.toLowerCase();
    let host = byKey.get(key);
    if (!host) {
      host = { ip, hostname, ports: [] };
      byKey.set(key, host);
    } else if (hostname && !host.hostname) {
      host.hostname = hostname;
    }

    const portsField = line.match(/\bPorts:\s*([^\t]+)/);
    if (portsField) {
      for (const token of portsField[1].split(",")) {
        // portid/state/protocol/owner/service/rpc info/version/
        const parts = token.trim().split("/");
        const portId = Number(parts[0]);
        const state = (parts[1] || "").toLowerCase();
        if (!Number.isFinite(portId) || !state.startsWith("open")) {
          continue;
        }
        if (host.ports.some((existing) => existing.port === portId)) {
          continue;
        }
        const entry: ImportedPort = { port: portId, transport: (parts[2] || "").toLowerCase() || undefined, service: parts[4] || undefined };
        const version = parts[6];
        if (version) {
          entry.product = version;
        }
        host.ports.push(entry);
      }
    }

    const osField = line.match(/\bOS:\s*([^\t]+)/);
    if (osField && !host.os) {
      const value = osField[1].trim();
      if (value && value !== "unknown") {
        host.os = value;
      }
    }
  }

  const hosts = [...byKey.values()];
  if (hosts.length === 0) {
    warnings.push("No hosts found. Is this Nmap greppable output (-oG)?");
  }
  return { format: "nmap-grep", hosts, flows: [], warnings };
}
