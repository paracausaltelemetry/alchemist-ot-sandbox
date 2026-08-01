import { childrenNamed, findAll, firstChild, parseXml, type XmlNode } from "./xml";
import type { ImportedHop, ImportedHost, ImportedPort, ImportedTrace, ParsedImport } from "./types";

/**
 * Reads a host's `<trace>` block into ordered hops. The final hop reported by Nmap is the
 * target itself, so it is dropped: every hop we keep is an intermediate router, which is what
 * the IT map needs. Hops without a usable ttl are skipped.
 */
function parseTrace(traceNode: XmlNode, hostIp: string | undefined): ImportedHop[] {
  const hops: ImportedHop[] = [];
  for (const hopNode of childrenNamed(traceNode, "hop")) {
    const ttl = Number(hopNode.attrs.ttl);
    if (!Number.isFinite(ttl)) {
      continue;
    }
    const hop: ImportedHop = { ttl };
    if (hopNode.attrs.ipaddr) {
      hop.ip = hopNode.attrs.ipaddr;
    }
    if (hopNode.attrs.host) {
      hop.hostname = hopNode.attrs.host;
    }
    const rtt = Number(hopNode.attrs.rtt);
    if (Number.isFinite(rtt)) {
      hop.rttMs = rtt;
    }
    hops.push(hop);
  }

  hops.sort((a, b) => a.ttl - b.ttl);
  const last = hops[hops.length - 1];
  if (last && hostIp && last.ip === hostIp) {
    hops.pop();
  }
  return hops;
}

/**
 * Parses Nmap XML (`nmap -oX`). Each up host becomes a normalized host with its open TCP/UDP
 * ports, MAC vendor, hostname and OS guess — enough for the assembler to infer an asset type
 * and protocols. Nmap is an active host/port scan, so it yields assets but no host-to-host
 * flows (those come from the passive/flow formats). A `--traceroute` scan additionally yields
 * hop chains, which are returned as `traces` and are the only real topology evidence available.
 */
export function parseNmapXml(text: string): ParsedImport {
  const doc = parseXml(text);
  const warnings: string[] = [];
  const hosts: ImportedHost[] = [];
  const traces: ImportedTrace[] = [];

  const hostNodes = findAll(doc, "host");
  if (hostNodes.length === 0) {
    warnings.push("No <host> elements found. Is this an Nmap XML (-oX) export?");
  }

  let down = 0;
  for (const hostNode of hostNodes) {
    const status = firstChild(hostNode, "status");
    if (status && status.attrs.state && status.attrs.state !== "up") {
      down += 1;
      continue;
    }

    let ip: string | undefined;
    let mac: string | undefined;
    let vendor: string | undefined;
    for (const address of childrenNamed(hostNode, "address")) {
      const kind = address.attrs.addrtype;
      if (kind === "ipv4" || kind === "ipv6") {
        ip = ip ?? address.attrs.addr;
      } else if (kind === "mac") {
        mac = address.attrs.addr;
        vendor = address.attrs.vendor || vendor;
      }
    }

    const hostname = findAll(hostNode, "hostname")[0]?.attrs.name;
    const os = findAll(hostNode, "osmatch")[0]?.attrs.name;

    const ports: ImportedPort[] = [];
    for (const portNode of findAll(hostNode, "port")) {
      const state = firstChild(portNode, "state");
      if (state && state.attrs.state && !state.attrs.state.startsWith("open")) {
        continue;
      }
      const portId = Number(portNode.attrs.portid);
      if (!Number.isFinite(portId)) {
        continue;
      }
      const service = firstChild(portNode, "service");
      ports.push({
        port: portId,
        transport: portNode.attrs.protocol,
        service: service?.attrs.name,
        product: service?.attrs.product
      });
    }

    if (!ip && !hostname) {
      continue;
    }

    // firstChild, not findAll: findAll walks the whole subtree and would pick up
    // another host's trace if the document nests unexpectedly.
    const host: ImportedHost = { ip, mac, vendor, hostname, os, ports };
    const distance = Number(firstChild(hostNode, "distance")?.attrs.value);
    if (Number.isFinite(distance)) {
      host.distance = distance;
    }
    hosts.push(host);

    const traceNode = firstChild(hostNode, "trace");
    if (traceNode) {
      const hops = parseTrace(traceNode, ip);
      if (hops.length > 0) {
        const trace: ImportedTrace = { targetIp: ip, targetHostname: hostname, hops };
        const port = Number(traceNode.attrs.port);
        if (Number.isFinite(port)) {
          trace.port = port;
        }
        if (traceNode.attrs.proto) {
          trace.proto = traceNode.attrs.proto;
        }
        traces.push(trace);
      }
    }
  }

  if (down > 0) {
    warnings.push(`Skipped ${down} host${down === 1 ? "" : "s"} reported as down.`);
  }

  return { format: "nmap-xml", hosts, flows: [], warnings, traces };
}
