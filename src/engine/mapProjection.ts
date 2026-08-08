import { getAssetType, getZone } from "../data/catalog";
import { createAsset } from "../models/factory";
import { inferAssetType, protocolsForHost } from "../import/inference";
import { synthesiseItTopology } from "./itTopology";
import { accessByNode, attackLinks } from "./itAccess";
import { isPublicIp } from "./itAnalysis";
import type { ImportedHost, ParsedImport } from "../import/types";
import type { ItNode } from "../models/itMap";
import type {
  AssetId,
  AssetOverride,
  CyberMapDocument,
  MapAsset,
  MapConnection,
  ProjectedMap
} from "../models/cyberMap";
import type { AssetTypeId, Conduit, OtProject, Subnet, ZoneId } from "../models/types";
import { blankProject } from "../data/sampleProject";

/**
 * Rebuilds the whole estate from its sources, then re-applies what a person decided.
 *
 * One derivation, not two. The OT side assembled assets straight from parsed hosts
 * (`assemble.ts`) while the IT side inferred a graph from the same hosts (`itTopology.ts`), and
 * the two disagreed about how many machines a scan described until `resolveIdentities` landed.
 * This uses the graph synthesis for topology — it is the one that grades evidence, follows
 * traceroutes and infers gateways — and adds the OT classification the assessment engines need.
 *
 * Re-synthesis rather than incremental merge, for the reason `projectEngagement` already records:
 * several decisions inside the synthesis are global rather than per host, so merging drawn maps
 * would mean reimplementing them and having two answers to the same question.
 */

/** Sources folded into one parse, in sequence order. The real merge happens in `mergeHosts`. */
export function mergedSourceParse(doc: CyberMapDocument): ParsedImport | null {
  const ordered = [...doc.sources].sort((a, b) => a.sequence - b.sequence);
  if (ordered.length === 0) {
    return null;
  }
  if (ordered.length === 1) {
    return ordered[0].parsed;
  }
  return {
    format: ordered[ordered.length - 1].parsed.format,
    hosts: ordered.flatMap((source) => source.parsed.hosts),
    flows: ordered.flatMap((source) => source.parsed.flows),
    warnings: ordered.flatMap((source) => source.parsed.warnings),
    traces: ordered.flatMap((source) => source.parsed.traces ?? [])
  };
}

/** Which sources reported a given identifier, so every asset can name its evidence. */
function sourceIdsByIdentifier(doc: CyberMapDocument): Map<string, Set<string>> {
  const byIdentifier = new Map<string, Set<string>>();
  for (const source of doc.sources) {
    for (const host of source.parsed.hosts) {
      for (const identifier of [host.ip, host.hostname, host.mac]) {
        const key = identifier?.trim().toLowerCase();
        if (!key) {
          continue;
        }
        byIdentifier.set(key, (byIdentifier.get(key) ?? new Set()).add(source.id));
      }
    }
  }
  return byIdentifier;
}

/** A node carries enough of a host record to be classified; this is the adapter. */
function hostFor(node: ItNode): ImportedHost {
  return {
    ip: node.ip,
    hostname: node.hostname,
    mac: node.mac,
    vendor: node.vendor,
    os: node.os,
    ports: node.ports
  };
}

/**
 * The OT class of a scanned node.
 *
 * Port and OS inference alone cannot see a firewall — it is the one device class a scan identifies
 * structurally, from where it sits in a traceroute, and `synthesiseItTopology` has already made
 * that call. Ignoring it produced cards reading "Firewall · Enterprise IT", which is a device
 * contradicting itself.
 */
function assetTypeFor(node: ItNode, host: ImportedHost): AssetTypeId {
  if (node.kind === "firewall") {
    return "firewall";
  }
  return inferAssetType(host);
}

/**
 * A *starting* Purdue zone, derived from what the asset appears to be.
 *
 * A converged estate is exactly where this guess is least reliable, so it is the first thing an
 * assessor is expected to override. Two things are not guesses and override the asset class:
 *
 * - The internet is the internet. It is why the band exists.
 * - A publicly routable address cannot be in a control zone. `inferAssetType` reads RDP as an
 *   engineering workstation, which is a good call inside a plant and a bad one on 198.51.100.10 —
 *   it put an internet-facing web server in Supervisory Control on the very first sample scan.
 *   Capping at Enterprise IT is the weaker claim and the true one.
 */
function zoneFor(node: ItNode, type: AssetTypeId): ZoneId {
  if (node.kind === "internet" || node.tier === "internet") {
    return "internet";
  }
  const derived = getAssetType(type).defaultZone;
  if (isPublicIp(node.ip) && getZone(derived).riskRank < getZone("level5").riskRank) {
    return "level5";
  }
  return derived;
}

function applyOverride(asset: MapAsset, override: AssetOverride | undefined): MapAsset {
  if (!override) {
    return asset;
  }
  const { controls, ...rest } = override;
  return {
    ...asset,
    ...Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined)),
    controls: { ...asset.controls, ...controls }
  } as MapAsset;
}

export function projectMap(doc: CyberMapDocument): ProjectedMap {
  const parsed = mergedSourceParse(doc);
  if (!parsed) {
    return { assets: [], connections: [], subnets: [], warnings: [], access: new Map() };
  }

  const synthesised = synthesiseItTopology(parsed);
  const warnings = [...synthesised.warnings];
  const sourcesByIdentifier = sourceIdsByIdentifier(doc);

  // --- Assets -------------------------------------------------------------
  const assets: MapAsset[] = synthesised.nodes.map((node) => {
    const host = hostFor(node);
    const type = assetTypeFor(node, host);
    const zone = zoneFor(node, type);
    const base = createAsset(type, doc.positions[node.id] ?? node.position, zone);
    const protocols = protocolsForHost(host);

    const asset: MapAsset = {
      ...base,
      id: node.id,
      name: node.name,
      ipAddress: node.ip ?? "",
      manufacturer: node.vendor ?? "",
      subnetId: node.subnetId,
      notes: node.os ? `OS: ${node.os}` : "",
      ...(protocols.length > 0 ? { protocols } : {}),
      provenance: "imported",
      deviceKind: node.kind,
      ports: node.ports,
      identifiers: {
        ips: node.ip ? [node.ip] : [],
        macs: node.mac ? [node.mac] : [],
        hostnames: node.hostname ? [node.hostname] : []
      },
      confidence: node.confidence,
      rationale: node.rationale,
      sourceIds: [
        ...new Set(
          [node.ip, node.hostname, node.mac]
            .map((value) => value?.trim().toLowerCase())
            .filter((value): value is string => Boolean(value))
            .flatMap((key) => [...(sourcesByIdentifier.get(key) ?? [])])
        )
      ].sort()
    };

    return applyOverride(asset, doc.assetOverrides[node.id]);
  });

  const assetIds = new Set(assets.map((asset) => asset.id));

  // --- Connections --------------------------------------------------------
  const conduitDefaults = (id: string, source: AssetId, target: AssetId): Conduit => ({
    id,
    source,
    target,
    name: "",
    protocol: "",
    port: "",
    protocolFamily: "auto",
    direction: "bidirectional",
    control: "routed",
    firewallRule: "unknown",
    trustBoundary: false,
    inspected: false,
    logged: false,
    encrypted: false,
    jumpHostRequired: false,
    ruleOwner: "",
    businessJustification: "",
    reviewDate: "",
    expiryDate: "",
    monitoringSource: "",
    inspectionPoint: "",
    temporaryAccess: false,
    businessCritical: false,
    notes: ""
  });

  const zoneOf = new Map(assets.map((asset) => [asset.id, asset.zone] as const));

  const derived: MapConnection[] = synthesised.links.map((link) => ({
    ...conduitDefaults(link.id, link.source, link.target),
    name: link.label ?? "",
    // A scan shows reachability, never the rule that allowed it.
    trustBoundary: zoneOf.get(link.source) !== zoneOf.get(link.target),
    provenance: "imported",
    evidence: link.evidence
  }));

  let dangling = 0;
  const authored: MapConnection[] = [];
  for (const connection of doc.connections) {
    if (!assetIds.has(connection.source) || !assetIds.has(connection.target)) {
      dangling += 1;
      continue;
    }
    authored.push({
      ...conduitDefaults(connection.id, connection.source, connection.target),
      name: connection.label ?? "",
      protocol: connection.protocol ?? "",
      port: connection.port ?? "",
      encrypted: connection.encrypted ?? false,
      direction: connection.direction ?? "bidirectional",
      firewallRule: connection.firewallRule ?? "unknown",
      trustBoundary: zoneOf.get(connection.source) !== zoneOf.get(connection.target),
      notes: connection.note ?? "",
      provenance: "authored",
      evidence: "asserted"
    });
  }
  if (dangling > 0) {
    // Warned, not rejected. Removing a source takes its assets with it, and a connection that
    // outlived its endpoints is the ordinary consequence of that.
    warnings.push(
      `${dangling} connection${dangling === 1 ? "" : "s"} you drew ${
        dangling === 1 ? "is" : "are"
      } not shown: the asset${dangling === 1 ? " it joins is" : "s they join are"} no longer in any source.`
    );
  }

  // Attack edges are derived from the journal for the same reason access is: storing them would
  // give one arrow two sources of truth, and deleting an event would leave its line behind.
  const attack: MapConnection[] = attackLinks(doc.events, assetIds).map((link) => ({
    ...conduitDefaults(link.id, link.source, link.target),
    name: link.label ?? "",
    provenance: "authored",
    evidence: "attack"
  }));

  const subnets: Subnet[] = synthesised.subnets.map((subnet) => ({
    ...subnet,
    ...doc.subnetOverrides[subnet.id]
  }));

  return {
    assets,
    connections: [...derived, ...authored, ...attack],
    subnets,
    warnings,
    access: accessByNode(doc.events)
  };
}

/**
 * The projection as something the assessment engines already accept.
 *
 * `MapAsset` is structurally an `Asset` and `MapConnection` a `Conduit`, so this is a shape
 * adapter rather than a conversion — no field is dropped and nothing is recomputed.
 */
export function asOtProject(doc: CyberMapDocument, projected: ProjectedMap): OtProject {
  return {
    ...structuredClone(blankProject),
    id: doc.id,
    name: doc.name,
    updatedAt: doc.updatedAt,
    assets: projected.assets,
    conduits: projected.connections,
    subnets: projected.subnets
  };
}
