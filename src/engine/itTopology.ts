import { parseIpv4 } from "./ipv4";
import { mergeScripts } from "../import/nse";
import { classifyItDevice, isRouterLike } from "../import/itInference";
import { resolveIdentities } from "./identity";
import type { ImportedHost, ParsedImport } from "../import/types";
import type { ItLink, ItLinkEvidence, ItMap, ItNode } from "../models/itMap";
import type { Subnet } from "../models/types";
import { isPublicIp } from "./itAnalysis";

/**
 * Turns a parsed scan into a network map. An Nmap scan reports hosts, not links, so the shape
 * of the network has to be reconstructed — and the reconstruction is layered by how solid the
 * evidence is:
 *
 *   1. traceroute hops are observed routers on a real path, and outrank everything below;
 *   2. a public address means the host faces the internet;
 *   3. a subnet's .1/.254 may be its gateway, but only if it also behaves like one;
 *   4. everything else in a subnet hangs off that subnet's gateway.
 *
 * Anything we reasoned rather than observed is marked: synthetic nodes carry
 * `origin: "synthetic"`, reduced confidence and a rationale, and links carry their evidence.
 * `Network Distance` is deliberately never used to materialise routers — a hop count without
 * hop identities would produce a convincing fiction.
 *
 * Positions are all zero here; `layoutItMap` places the graph. Keeping graph and geometry
 * apart means the canvas can re-arrange without re-inferring.
 */

/** Host parts conventionally used for a subnet's gateway. */
const GATEWAY_HOST_PARTS = new Set(["1", "254"]);
/**
 * Which evidence wins when two sources describe the same pair. The operator sits below the scan
 * and above our own reasoning: they may be wrong, but they were there and the inference was not.
 */
const EVIDENCE_RANK: Record<ItLinkEvidence, number> = {
  traceroute: 0,
  "observed-flow": 1,
  // An attack edge never competes with a connectivity edge for the same pair: it is a different
  // claim about the same two hosts, and both belong on the map at once.
  attack: 1.5,
  asserted: 2,
  "same-subnet": 3,
  inferred: 4
};

function isIpv4(value: string | undefined): value is string {
  return !!value && parseIpv4(value) !== null;
}

/** The /24 an address sits in — the only segmentation an address alone can testify to. */
export function cidrOf(ip: string | undefined): string | undefined {
  return isIpv4(ip) ? `${ip.split(".").slice(0, 3).join(".")}.0/24` : undefined;
}

/**
 * The key for a traceroute hop, which carries only an address or a name.
 *
 * Host records go through `resolveIdentities` instead — a hop has no MAC to union on, and inventing
 * an identity for one would let a router silently absorb a scanned host.
 */
function hostKey(host: { ip?: string; hostname?: string }): string {
  return (host.ip || host.hostname || "").toLowerCase();
}

function nodeId(key: string): string {
  return `it:${key}`;
}

/** Sorts CIDRs the way a reader expects (10.10.2.0/24 after 10.10.1.0/24, not before). */
function compareCidr(a: string, b: string): number {
  const octets = (value: string) => value.split("/")[0].split(".").map(Number);
  const left = octets(a);
  const right = octets(b);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return a.localeCompare(b);
}

/**
 * Merges duplicate hosts, folding their ports together.
 *
 * Identity comes from `resolveIdentities`, which unions every identifier a record carries — so a
 * host known by name from outside and by address from inside is one host, and so is a laptop that
 * changed subnet between scans. It replaces a local alias pass that only understood hostname to
 * address and never looked at the MAC at all.
 *
 * Ports are a union, and the scalars are last-non-empty-wins rather than first-wins: across scans,
 * a later credentialed or internal scan knows more about a host than the external one that found
 * it. The consequence is worth stating — **a port that closed midway through an engagement never
 * disappears from the map**. For a record of what was observed that is the honest default, but it
 * is an assumption, not a fact about the network.
 */
function mergeHosts(hosts: ImportedHost[]): {
  hosts: ImportedHost[];
  keyOf: (host: ImportedHost) => string;
  warnings: string[];
} {
  const identity = resolveIdentities(hosts);
  const keyOf = (host: ImportedHost) => identity.keyFor(host);

  const byKey = new Map<string, ImportedHost>();
  for (const host of hosts) {
    const key = keyOf(host);
    if (!key) {
      continue;
    }
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...host, ports: [...host.ports] });
      continue;
    }
    for (const port of host.ports) {
      const already = existing.ports.find((candidate) => candidate.port === port.port);
      if (!already) {
        existing.ports.push(port);
      } else if (port.scripts) {
        // A later scan of a port already seen still brings its script output with it, and that is
        // usually the reason the port was scanned again.
        already.scripts = mergeScripts(already.scripts, port.scripts);
      }
    }
    existing.scripts = mergeScripts(existing.scripts, host.scripts);
    // The strongest silence wins. Two scans of the same host rarely sweep the same range, and a
    // later quick scan reporting nothing filtered must not erase what a full sweep found.
    if (host.silence) {
      existing.silence = {
        closed: Math.max(existing.silence?.closed ?? 0, host.silence.closed),
        filtered: Math.max(existing.silence?.filtered ?? 0, host.silence.filtered)
      };
    }
    for (const port of host.filteredPorts ?? []) {
      // A port seen open by any scan is open; a later "filtered" is a firewall in that scan's path,
      // not a service that went away.
      if (
        !existing.ports.some((candidate) => candidate.port === port.port) &&
        !(existing.filteredPorts ?? []).some((candidate) => candidate.port === port.port)
      ) {
        (existing.filteredPorts ??= []).push(port);
      }
    }
    // The address is the identity: a hostname-only record folded in must not blank it.
    existing.ip ||= host.ip;
    existing.hostname = host.hostname || existing.hostname;
    existing.vendor = host.vendor || existing.vendor;
    // The more confident fingerprint wins, rather than the last file imported. Two scans of one
    // host regularly disagree, and "the newest" is not the same claim as "the better evidenced".
    if (host.os && (host.osAccuracy ?? 0) >= (existing.osAccuracy ?? 0)) {
      existing.os = host.os;
      existing.osAccuracy = host.osAccuracy;
    } else {
      existing.os ||= host.os;
    }
    existing.deviceTypeHint ||= host.deviceTypeHint;
    existing.mac = host.mac || existing.mac;
    existing.vlan = host.vlan || existing.vlan;
    existing.distance = host.distance ?? existing.distance;
  }
  return {
    hosts: [...byKey.values()].sort((a, b) => keyOf(a).localeCompare(keyOf(b))),
    keyOf,
    warnings: identity.warnings
  };
}

interface TraceChain {
  /** Node ids of the routers on the path, nearest the scanner first. */
  routerIds: string[];
  targetKey: string;
}

export function synthesiseItTopology(parsed: ParsedImport, name = "Scanned network"): ItMap {
  const warnings = [...parsed.warnings];
  const merged = mergeHosts(parsed.hosts);
  const hosts = merged.hosts;
  // Node identity comes from the resolver, not from `ip || hostname`. Two machines that shared an
  // address were correctly held apart by the merge and then collapsed again here, because both
  // still answered to the same address when the node id was minted.
  const identityKey = merged.keyOf;
  warnings.push(...merged.warnings);
  const traces = parsed.traces ?? [];

  // --- Subnets -------------------------------------------------------------
  const subnetIdByHostKey = new Map<string, string>();
  const subnetById = new Map<string, Subnet>();
  for (const host of hosts) {
    const cidr = cidrOf(host.ip);
    if (host.vlan) {
      const id = `subnet:vlan:${host.vlan}`;
      subnetById.set(id, { id, name: `VLAN ${host.vlan}`, cidr: cidr ?? "", vlan: host.vlan });
      subnetIdByHostKey.set(identityKey(host), id);
    } else if (cidr) {
      const id = `subnet:${cidr}`;
      subnetById.set(id, { id, name: cidr, cidr, vlan: "" });
      subnetIdByHostKey.set(identityKey(host), id);
    }
  }
  const subnets = [...subnetById.values()].sort((a, b) => compareCidr(a.cidr || a.name, b.cidr || b.name));

  // --- Traceroute evidence -------------------------------------------------
  // Every hop with an address is a router we can name. Hops that timed out are dropped here
  // (they break the chain but we keep no anonymous placeholder for them).
  const hopKeys = new Set<string>();
  for (const trace of traces) {
    for (const hop of trace.hops) {
      const key = hostKey(hop);
      if (key && !hop.timedOut) {
        hopKeys.add(key);
      }
    }
  }

  const hopMeta = new Map<string, { ip?: string; hostname?: string; rttMs?: number }>();
  for (const trace of traces) {
    for (const hop of trace.hops) {
      const key = hostKey(hop);
      if (!key || hop.timedOut || hopMeta.has(key)) {
        continue;
      }
      hopMeta.set(key, { ip: hop.ip, hostname: hop.hostname, rttMs: hop.rttMs });
    }
  }

  // --- Nodes ---------------------------------------------------------------
  const nodes = new Map<string, ItNode>();
  const scannedKeys = new Set(hosts.map(identityKey));

  const addNode = (node: ItNode) => {
    nodes.set(node.id, node);
    return node;
  };

  for (const host of hosts) {
    const key = identityKey(host);
    // Hop matching stays on the address: a hop has no MAC, so it can only ever be recognised by
    // the address or name it answered with.
    const isTracerouteHop = hopKeys.has(hostKey(host));
    const hostPart = isIpv4(host.ip) ? host.ip.split(".")[3] : undefined;
    const isGatewayAddress = hostPart !== undefined && GATEWAY_HOST_PARTS.has(hostPart);
    const kind = classifyItDevice(host, { isTracerouteHop, isGatewayAddress });
    const publicIp = isPublicIp(host.ip);

    const rationale = isTracerouteHop
      ? "Seen forwarding packets in a traceroute, so it routes between segments."
      : publicIp
        ? "Has a publicly routable address, so it is reachable from the internet."
        : `Classified from its open ports${host.os ? " and OS fingerprint" : ""}.`;

    addNode({
      id: nodeId(key),
      kind,
      tier: kind === "firewall" || (publicIp && isTracerouteHop) ? "perimeter" : isTracerouteHop ? "core" : "host",
      name: host.hostname || host.ip || key,
      origin: "scanned",
      ip: host.ip,
      hostname: host.hostname,
      mac: host.mac,
      vendor: host.vendor,
      os: host.os,
      ...(host.osAccuracy !== undefined ? { osAccuracy: host.osAccuracy } : {}),
      ports: host.ports,
      ...(host.scripts ? { scripts: host.scripts } : {}),
      ...(host.filteredPorts ? { filteredPorts: host.filteredPorts } : {}),
      ...(host.silence ? { silence: host.silence } : {}),
      subnetId: subnetIdByHostKey.get(key),
      position: { x: 0, y: 0 },
      confidence: 1,
      rationale
    });
  }

  // Hops that were never scanned still exist — add them as routers we know only by address.
  for (const key of [...hopKeys].sort()) {
    if (scannedKeys.has(key)) {
      continue;
    }
    const meta = hopMeta.get(key) ?? {};
    const cidr = cidrOf(meta.ip);
    addNode({
      id: nodeId(key),
      kind: "router",
      tier: isPublicIp(meta.ip) ? "perimeter" : "core",
      name: meta.hostname || meta.ip || key,
      origin: "scanned",
      ip: meta.ip,
      hostname: meta.hostname,
      ports: [],
      subnetId: cidr && subnetById.has(`subnet:${cidr}`) ? `subnet:${cidr}` : undefined,
      position: { x: 0, y: 0 },
      confidence: 0.9,
      rationale: "Answered a traceroute as an intermediate hop. It was not scanned, so only its address is known."
    });
  }

  const hasPublicHost = hosts.some((host) => isPublicIp(host.ip)) || [...hopKeys].some((key) => isPublicIp(hopMeta.get(key)?.ip));
  const internetId = nodeId("internet");
  if (hasPublicHost) {
    addNode({
      id: internetId,
      kind: "internet",
      tier: "internet",
      name: "Internet",
      origin: "synthetic",
      ports: [],
      position: { x: 0, y: 0 },
      confidence: 1,
      rationale: "The scan found publicly routable addresses, so part of this network faces the internet."
    });
  }

  // --- Gateways ------------------------------------------------------------
  // One per subnet that actually holds hosts. Prefer a traceroute hop inside the subnet — that
  // is observed routing — then a node that both holds a gateway address and behaves like a
  // router, and only then a ghost.
  const gatewayBySubnet = new Map<string, string>();
  for (const subnet of subnets) {
    const members = [...nodes.values()]
      .filter((node) => node.subnetId === subnet.id)
      .sort((a, b) => a.id.localeCompare(b.id));
    if (!members.some((node) => node.tier === "host")) {
      continue;
    }

    const hopInside = members.find((node) => hopKeys.has(hostKey(node)));
    const addressed = members.find((node) => {
      const hostPart = isIpv4(node.ip) ? node.ip.split(".")[3] : undefined;
      return hostPart !== undefined && GATEWAY_HOST_PARTS.has(hostPart) && isRouterLike({ ports: node.ports });
    });

    // A firewall sitting in the subnet already is its way out. Point the hosts at it and leave
    // it on the perimeter — synthesising a gateway beside it would be noise, not information.
    const perimeterInside = members.find((node) => node.tier === "perimeter");
    if (!hopInside && perimeterInside) {
      gatewayBySubnet.set(subnet.id, perimeterInside.id);
      continue;
    }

    const chosen = hopInside ?? addressed;

    if (chosen) {
      chosen.tier = "gateway";
      if (chosen.kind !== "firewall") {
        chosen.kind = "router";
      }
      if (!hopInside) {
        chosen.confidence = 0.6;
        chosen.rationale = `Holds the gateway address for ${subnet.name} and exposes only management services, so it is most likely the gateway.`;
      }
      gatewayBySubnet.set(subnet.id, chosen.id);
      continue;
    }

    const ghostId = `it:gw:${subnet.id}`;
    addNode({
      id: ghostId,
      kind: "router",
      tier: "gateway",
      name: `${subnet.name} gateway`,
      origin: "synthetic",
      subnetId: subnet.id,
      ports: [],
      position: { x: 0, y: 0 },
      confidence: 0.4,
      rationale: `Inferred: ${subnet.name} must route somewhere, but no gateway was scanned. Run the scan with --traceroute to confirm.`
    });
    gatewayBySubnet.set(subnet.id, ghostId);
  }

  // --- Uplinks -------------------------------------------------------------
  const chains: TraceChain[] = traces
    .map((trace) => ({
      routerIds: trace.hops.filter((hop) => !hop.timedOut && hostKey(hop)).map((hop) => nodeId(hostKey(hop))),
      targetKey: hostKey({ ip: trace.targetIp, hostname: trace.targetHostname })
    }))
    .filter((chain) => chain.routerIds.length > 0 && chain.targetKey);

  const links: ItLink[] = [];
  const linkByPair = new Map<string, ItLink>();

  const connect = (source: string, target: string, evidence: ItLinkEvidence, extra: Partial<ItLink> = {}) => {
    if (source === target || !nodes.has(source) || !nodes.has(target)) {
      return;
    }
    const pair = [source, target].sort().join("|");
    const existing = linkByPair.get(pair);
    if (existing) {
      // Keep the strongest evidence for a pair we have already drawn.
      if (EVIDENCE_RANK[evidence] < EVIDENCE_RANK[existing.evidence]) {
        Object.assign(existing, { evidence, ...extra });
      }
      return;
    }
    const link: ItLink = { id: `link:${source}->${target}`, source, target, evidence, ...extra };
    linkByPair.set(pair, link);
    links.push(link);
  };

  // The traceroute chains themselves: router to router, then the last router to the target.
  const tracerouteParent = new Map<string, string>();
  for (const chain of chains) {
    for (let index = 1; index < chain.routerIds.length; index += 1) {
      connect(chain.routerIds[index - 1], chain.routerIds[index], "traceroute", { hopIndex: index });
      tracerouteParent.set(chain.routerIds[index], chain.routerIds[index - 1]);
    }
    const lastRouter = chain.routerIds[chain.routerIds.length - 1];
    const targetId = nodeId(chain.targetKey);
    if (nodes.has(targetId)) {
      tracerouteParent.set(targetId, lastRouter);
    }
  }

  // Exactly one uplink per node, strongest evidence available.
  const uplinkRoot = (() => {
    const perimeter = [...nodes.values()].filter((node) => node.tier === "perimeter").sort((a, b) => a.id.localeCompare(b.id))[0];
    const core = [...nodes.values()].filter((node) => node.tier === "core").sort((a, b) => a.id.localeCompare(b.id))[0];
    return { perimeter, core };
  })();

  for (const node of [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    if (node.tier === "internet") {
      continue;
    }

    const traced = tracerouteParent.get(node.id);
    if (traced) {
      connect(traced, node.id, "traceroute", { rttMs: hopMeta.get(hostKey(node))?.rttMs });
      continue;
    }

    if (node.tier === "host") {
      const gateway = node.subnetId ? gatewayBySubnet.get(node.subnetId) : undefined;
      if (gateway) {
        connect(gateway, node.id, "same-subnet");
        continue;
      }
      // No subnet at all (hostname-only host): hang it off whatever sits above.
      const fallback = uplinkRoot.core?.id ?? uplinkRoot.perimeter?.id ?? (hasPublicHost ? internetId : undefined);
      if (fallback) {
        connect(fallback, node.id, "inferred");
      }
      continue;
    }

    if (node.tier === "gateway") {
      const above = uplinkRoot.core?.id ?? uplinkRoot.perimeter?.id ?? (hasPublicHost ? internetId : undefined);
      if (above && above !== node.id) {
        connect(above, node.id, "inferred");
      }
      continue;
    }

    if (node.tier === "core") {
      const above = uplinkRoot.perimeter?.id ?? (hasPublicHost ? internetId : undefined);
      if (above && above !== node.id) {
        connect(above, node.id, "inferred");
      }
      continue;
    }

    if (node.tier === "perimeter" && hasPublicHost) {
      connect(internetId, node.id, "inferred");
    }
  }

  // With no perimeter device, internet-facing hosts answer the internet directly.
  if (hasPublicHost && !uplinkRoot.perimeter) {
    for (const node of [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id))) {
      if (node.tier === "host" && isPublicIp(node.ip)) {
        connect(internetId, node.id, "inferred");
      }
    }
  }

  if (traces.length === 0 && hosts.length > 1) {
    warnings.push("No traceroute data in this scan, so the links between segments are inferred. Re-run Nmap with --traceroute for the real paths.");
  }

  return {
    id: `itmap:${subnets.map((subnet) => subnet.id).join(",")}:${hosts.length}`,
    name,
    createdAt: new Date().toISOString(),
    nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    links: links.sort((a, b) => a.id.localeCompare(b.id)),
    subnets,
    warnings
  };
}
