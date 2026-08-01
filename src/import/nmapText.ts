import type { ImportedHop, ImportedHost, ImportedPort, ImportedTrace, ParsedImport } from "./types";

/**
 * Parsers for Nmap's text outputs, alongside the XML parser in `nmap.ts`:
 *  - normal output (`-oN`), the default human-readable report, and
 *  - greppable output (`-oG`), one line per host.
 * Both are host/port scans, so they yield assets but no host-to-host flows. Normal output
 * additionally carries TRACEROUTE blocks when the scan used `--traceroute`; greppable output
 * never does.
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

/**
 * Parses one TRACEROUTE row. Nmap prints either `1   0.35 ms 10.10.1.1`, an optionally
 * named address `2   1.20 ms core (10.10.1.254)`, or `3   ...` for a hop that did not answer
 * (sometimes as a `3   ... 5` range). Timed-out hops are kept so later ttls stay accurate.
 */
function parseTraceRow(line: string): ImportedHop[] {
  const row = line.match(/^\s*(\d+)\s+(.*)$/);
  if (!row) {
    return [];
  }
  const ttl = Number(row[1]);
  const rest = row[2].trim();

  const gap = rest.match(/^\.\.\.(?:\s+(\d+))?$/);
  if (gap) {
    const last = gap[1] ? Number(gap[1]) : ttl;
    const hops: ImportedHop[] = [];
    for (let step = ttl; step <= Math.max(ttl, last); step += 1) {
      hops.push({ ttl: step, timedOut: true });
    }
    return hops;
  }

  const timed = rest.match(/^([\d.]+)\s*ms\s+(.+)$/);
  if (!timed) {
    return [];
  }
  const hop: ImportedHop = { ttl };
  const rtt = Number(timed[1]);
  if (Number.isFinite(rtt)) {
    hop.rttMs = rtt;
  }
  const { ip, hostname } = parseTarget(timed[2]);
  if (ip) {
    hop.ip = ip;
  }
  if (hostname) {
    hop.hostname = hostname;
  }
  return [hop];
}

export function parseNmapNormal(text: string): ParsedImport {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const hosts: ImportedHost[] = [];
  const traces: ImportedTrace[] = [];
  const warnings: string[] = [];
  let current: ImportedHost | null = null;
  let inPortTable = false;
  let trace: ImportedTrace | null = null;
  let sharedHopsSkipped = false;

  // A traceroute's last hop is the target itself; drop it so every kept hop is a router.
  const flushTrace = () => {
    if (!trace) {
      return;
    }
    const last = trace.hops[trace.hops.length - 1];
    if (last && trace.targetIp && last.ip === trace.targetIp) {
      trace.hops.pop();
    }
    if (trace.hops.length > 0) {
      traces.push(trace);
    }
    trace = null;
  };

  for (const line of lines) {
    const report = line.match(/^Nmap scan report for (.+)$/);
    if (report) {
      flushTrace();
      pushHost(hosts, current);
      const { ip, hostname } = parseTarget(report[1]);
      current = { ip, hostname, ports: [] };
      inPortTable = false;
      continue;
    }
    if (!current) {
      continue;
    }

    if (trace) {
      if (line.trim() === "" || /^Nmap done|^Read data files:/i.test(line)) {
        flushTrace();
        continue;
      }
      if (/^HOP\s+RTT\s+ADDRESS/i.test(line)) {
        continue;
      }
      // Nmap collapses a shared prefix into "Hops 1-3 are the same as for 10.0.0.5".
      // Resolving that needs cross-host state; skip it and say so.
      if (/^Hops\s+[\d-]+\s+are the same as for/i.test(line)) {
        if (!sharedHopsSkipped) {
          warnings.push("Some traceroutes reuse another host's hops ('Hops N-M are the same as for ...'); those hops were skipped.");
          sharedHopsSkipped = true;
        }
        continue;
      }
      trace.hops.push(...parseTraceRow(line));
      continue;
    }

    const traceHead = line.match(/^TRACEROUTE(?:\s+\(using (?:port (\d+)\/(tcp|udp)|proto (\d+))\))?/i);
    if (traceHead) {
      inPortTable = false;
      trace = { targetIp: current.ip, targetHostname: current.hostname, hops: [] };
      if (traceHead[1]) {
        trace.port = Number(traceHead[1]);
        trace.proto = traceHead[2].toLowerCase();
      }
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

    const distance = line.match(/^Network Distance:\s*(\d+)\s*hops?/i);
    if (distance) {
      current.distance = Number(distance[1]);
      continue;
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
  flushTrace();
  pushHost(hosts, current);

  if (hosts.length === 0) {
    warnings.push("No hosts found. Is this Nmap normal output (-oN)?");
  }
  return { format: "nmap-normal", hosts, flows: [], warnings, traces };
}

/** Greppable output is one line per host and carries no traceroute, so `traces` is always empty. */
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
  return { format: "nmap-grep", hosts, flows: [], warnings, traces: [] };
}
