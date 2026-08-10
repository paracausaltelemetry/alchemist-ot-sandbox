import { scanTimeFromGreppable, scanTimeFromNormal } from "./scanTime";
import { enrichFromScripts } from "./nse";
import type {
  ImportedHop,
  ImportedHost,
  ImportedPort,
  ImportedScript,
  ImportedTrace,
  ParsedImport,
  PortSilence
} from "./types";

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

/** The silence record, created on the host the first time the scan reports one. */
function silence(host: ImportedHost): PortSilence {
  return (host.silence ??= { closed: 0, filtered: 0 });
}

function pushHost(hosts: ImportedHost[], host: ImportedHost | null): void {
  if (host && (host.ip || host.hostname)) {
    hosts.push(enrichFromScripts(host));
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
  // NSE output arrives as `|` lines under whatever it belongs to, so the reader has to remember
  // what that was: the port printed above, or the host-script block near the end of the report.
  let lastPort: ImportedPort | null = null;
  let scriptTarget: "host" | "port" = "port";
  let openScript: ImportedScript | null = null;
  // Hops exactly as printed, keyed by the host they were traced to. Nmap prints a path in full
  // once and then refers back to it, so later hosts need the earlier one still on hand.
  const rawHopsByTarget = new Map<string, ImportedHop[]>();

  // A traceroute's last hop is the target itself; drop it so every kept hop is a router.
  const flushTrace = () => {
    if (!trace) {
      return;
    }
    if (trace.targetIp) {
      rawHopsByTarget.set(trace.targetIp, trace.hops.map((hop) => ({ ...hop })));
    }
    trace.hops.sort((a, b) => a.ttl - b.ttl);
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
      lastPort = null;
      scriptTarget = "port";
      openScript = null;
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
      // Nmap prints a path once and then collapses the shared prefix for every later host that
      // takes it: "-  Hops 1-3 are the same as for 10.0.0.5". Copy those hops back in, or the
      // map loses the routers between the scanner and most of the network.
      const shared = line.match(/^\s*-?\s*Hops\s+(\d+)(?:\s*-\s*(\d+))?\s+are the same as for\s+(\S+)/i);
      if (shared) {
        const from = Number(shared[1]);
        const to = shared[2] ? Number(shared[2]) : from;
        const source = rawHopsByTarget.get(shared[3]);
        if (source) {
          trace.hops.push(
            ...source.filter((hop) => hop.ttl >= from && hop.ttl <= to).map((hop) => ({ ...hop }))
          );
        } else {
          warnings.push(`A traceroute reuses the path to ${shared[3]}, which is not in this file; those hops are missing.`);
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

    // "Not shown: 997 closed tcp ports (conn-refused)", sometimes several kinds on one line.
    const notShown = line.match(/^Not shown:\s*(.+)$/i);
    if (notShown) {
      for (const part of notShown[1].split(",")) {
        const counted = part.trim().match(/^(\d+)\s+(\S+)\s+(?:tcp|udp)?\s*ports?/i);
        if (!counted) {
          continue;
        }
        const state = counted[2].toLowerCase();
        if (state === "closed") {
          silence(current).closed += Number(counted[1]);
        } else if (state.includes("filtered")) {
          silence(current).filtered += Number(counted[1]);
        }
      }
      continue;
    }

    if (/^PORT\s+STATE\s+SERVICE/i.test(line)) {
      inPortTable = true;
      continue;
    }

    // `Host script results:` opens the block of NSE output that belongs to the machine rather than
    // to any one of its ports — SMB discovery, NBSTAT, the OS-level checks.
    if (/^Host script results:/i.test(line)) {
      inPortTable = false;
      scriptTarget = "host";
      openScript = null;
      continue;
    }

    // A `|` line continues whatever came before it: the port above it, or the host-script block.
    if (line.startsWith("|")) {
      const rest = line.replace(/^\|_?/, "");
      const head = rest.match(/^ ?([A-Za-z][\w.-]*):\s?(.*)$/);
      // One space then a name then a colon starts a script. Two or more spaces is a continuation
      // line, which can carry a colon of its own — `|   3072 aa:bb (RSA)` is a key, not a script.
      if (head && !/^ {2}/.test(rest)) {
        // Held by reference so the continuation lines below append straight into the stored result.
        openScript = { id: head[1], output: head[2].trim() };
        if (scriptTarget === "host") {
          (current.scripts ??= []).push(openScript);
        } else if (lastPort) {
          (lastPort.scripts ??= []).push(openScript);
        }
      } else if (openScript) {
        const continued = rest.replace(/^\s+/, "");
        openScript.output = openScript.output ? `${openScript.output}\n${continued}` : continued;
      }
      continue;
    }
    openScript = null;

    if (inPortTable) {
      const port = line.match(/^(\d+)\/(tcp|udp)\s+(\S+)\s+(\S+)(?:\s+(.*))?$/i);
      if (port) {
        const state = port[3].toLowerCase();
        // `open|filtered` is Nmap saying it could not tell. Not evidence of a service, so it is
        // filed with the filtered ports rather than the open ones.
        const isOpen = state === "open";
        const isFiltered = state.includes("filtered");
        if (isOpen || isFiltered) {
          const entry: ImportedPort = { port: Number(port[1]), transport: port[2].toLowerCase(), service: port[4] };
          const product = port[5]?.trim();
          if (product) {
            entry.product = product;
          }
          if (isOpen) {
            current.ports.push(entry);
            lastPort = entry;
            scriptTarget = "port";
          } else {
            (current.filteredPorts ??= []).push(entry);
          }
        } else if (state === "closed") {
          silence(current).closed += 1;
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
  return { format: "nmap-normal", hosts, flows: [], warnings, traces, startedAt: scanTimeFromNormal(text) ?? undefined };
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
        if (!Number.isFinite(portId)) {
          continue;
        }
        const isOpen = state === "open";
        const isFiltered = state.includes("filtered");
        if (!isOpen && !isFiltered) {
          if (state === "closed") {
            silence(host).closed += 1;
          }
          continue;
        }
        const kept = isOpen ? host.ports : (host.filteredPorts ??= []);
        if (kept.some((existing) => existing.port === portId)) {
          continue;
        }
        const entry: ImportedPort = { port: portId, transport: (parts[2] || "").toLowerCase() || undefined, service: parts[4] || undefined };
        const version = parts[6];
        if (version) {
          entry.product = version;
        }
        kept.push(entry);
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
  return { format: "nmap-grep", hosts, flows: [], warnings, traces: [], startedAt: scanTimeFromGreppable(text) ?? undefined };
}
