import { childrenNamed, findAll, firstChild, parseXml, type XmlNode } from "./xml";
import { scanTimeFromXmlAttrs } from "./scanTime";
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
 * The `<script>` results hanging off a port or a host.
 *
 * `childrenNamed`, not `findAll`: a script's output can itself contain XML-ish `<table>` and `<elem>
 * ` children, and walking the subtree would return the same result several times over.
 */
function parseScripts(node: XmlNode | undefined): ImportedScript[] | undefined {
  if (!node) {
    return undefined;
  }
  const scripts: ImportedScript[] = [];
  for (const scriptNode of childrenNamed(node, "script")) {
    const id = scriptNode.attrs.id?.trim();
    const output = scriptNode.attrs.output?.trim();
    if (id && output) {
      scripts.push({ id, output });
    }
  }
  return scripts.length > 0 ? scripts : undefined;
}

/**
 * What the service actually is, assembled from the three attributes Nmap splits it across.
 *
 * `product` alone is "OpenSSH", which narrows nothing — every Linux box on the estate runs OpenSSH.
 * "OpenSSH 8.9p1" is a version somebody can take to an advisory, and that is the whole reason to
 * run `-sV`. `extrainfo` carries the rest of the banner ("Ubuntu 4ubuntu0.5", "protocol 2.0") and
 * is often the part that dates the host.
 */
function serviceVersion(service: { attrs: Record<string, string> } | undefined): string | undefined {
  if (!service) {
    return undefined;
  }
  const named = [service.attrs.product, service.attrs.version].filter(Boolean).join(" ").trim();
  const extra = service.attrs.extrainfo?.trim();
  const full = extra ? `${named} (${extra})`.trim() : named;
  return full || undefined;
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
    // Highest accuracy, not first: Nmap usually prints them in order but nothing in the format
    // guarantees it, and taking the wrong one names the host after a worse guess.
    const matches = findAll(hostNode, "osmatch")
      .map((match) => ({ name: match.attrs.name, accuracy: Number(match.attrs.accuracy) }))
      .filter((match) => Boolean(match.name))
      .sort((a, b) => (Number.isFinite(b.accuracy) ? b.accuracy : 0) - (Number.isFinite(a.accuracy) ? a.accuracy : 0));
    const os = matches[0]?.name;
    const osAccuracy = Number.isFinite(matches[0]?.accuracy) ? matches[0].accuracy : undefined;
    // `general purpose` is Nmap declining to say, which is most hosts; it would displace better
    // evidence with nothing.
    const deviceTypeHint = findAll(hostNode, "osclass")
      .map((entry) => entry.attrs.type?.trim())
      .find((type) => Boolean(type) && type!.toLowerCase() !== "general purpose");

    const ports: ImportedPort[] = [];
    const filteredPorts: ImportedPort[] = [];
    const silence: PortSilence = { closed: 0, filtered: 0 };
    // `<extraports>` is the "Not shown: 997 closed tcp ports" line in structured form. A host whose
    // silence is filtered rather than closed has something in front of it dropping traffic.
    for (const extra of findAll(hostNode, "extraports")) {
      const count = Number(extra.attrs.count);
      if (!Number.isFinite(count)) {
        continue;
      }
      if (extra.attrs.state === "closed") {
        silence.closed += count;
      } else if (extra.attrs.state?.includes("filtered")) {
        silence.filtered += count;
      }
    }
    for (const portNode of findAll(hostNode, "port")) {
      const state = firstChild(portNode, "state")?.attrs.state;
      // `open|filtered` is Nmap saying it could not tell, which for a UDP sweep is most of the
      // scan. It is not evidence of a service, so it is counted with the silences.
      const isOpen = state ? state === "open" : true;
      const isFiltered = Boolean(state?.includes("filtered"));
      if (!isOpen && !isFiltered) {
        silence.closed += 1;
        continue;
      }
      const portId = Number(portNode.attrs.portid);
      if (!Number.isFinite(portId)) {
        continue;
      }
      const service = firstChild(portNode, "service");
      const port: ImportedPort = {
        port: portId,
        transport: portNode.attrs.protocol,
        service: service?.attrs.name,
        product: serviceVersion(service)
      };
      const scripts = parseScripts(portNode);
      if (scripts) {
        port.scripts = scripts;
      }
      (isOpen ? ports : filteredPorts).push(port);
    }

    if (!ip && !hostname) {
      continue;
    }

    // firstChild, not findAll: findAll walks the whole subtree and would pick up
    // another host's trace if the document nests unexpectedly.
    const host: ImportedHost = { ip, mac, vendor, hostname, os, ports };
    if (osAccuracy !== undefined) {
      host.osAccuracy = osAccuracy;
    }
    if (deviceTypeHint) {
      host.deviceTypeHint = deviceTypeHint;
    }
    if (filteredPorts.length > 0) {
      host.filteredPorts = filteredPorts;
    }
    if (silence.closed > 0 || silence.filtered > 0) {
      host.silence = silence;
    }
    // `hostscript` holds the results that belong to the machine rather than to one of its ports —
    // SMB discovery, NBSTAT, the OS-level checks.
    const hostScripts = parseScripts(firstChild(hostNode, "hostscript"));
    if (hostScripts) {
      host.scripts = hostScripts;
    }
    const distance = Number(firstChild(hostNode, "distance")?.attrs.value);
    if (Number.isFinite(distance)) {
      host.distance = distance;
    }
    hosts.push(enrichFromScripts(host));

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

  // `<nmaprun start=… startstr=…>` is the outermost element, and the parser walked straight past
  // it to `<host>`. When the document root is itself nmaprun, `findAll` would not return it.
  const run = doc.name === "nmaprun" ? doc : findAll(doc, "nmaprun")[0];

  return {
    format: "nmap-xml",
    hosts,
    flows: [],
    warnings,
    traces,
    startedAt: (run ? scanTimeFromXmlAttrs(run.attrs) : null) ?? undefined
  };
}
