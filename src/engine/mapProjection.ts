import { getAssetType, getZone } from "../data/catalog";
import { createAsset } from "../models/factory";
import { inferAssetType, protocolsForHost } from "../import/inference";
import { cidrOf, synthesiseItTopology } from "./itTopology";
import { accessByNode, attackLinks } from "./itAccess";
import { isPublicIp } from "./itAnalysis";
import type { ImportedHost, ParsedImport } from "../import/types";
import type { ItNode } from "../models/itMap";
import type {
  AssetId,
  AssetOverride,
  ConnectionOverride,
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
    osAccuracy: node.osAccuracy,
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

/**
 * Applies an authored override, dropping keys the author never set.
 *
 * `undefined` has to mean "not decided" rather than "decided to be nothing", or a partially filled
 * override would blank the derived values it does not mention. Shared by both layers because
 * getting it wrong in one place and right in the other is exactly the kind of asymmetry nobody
 * finds until a field mysteriously empties.
 */
function withOverride<T extends object, O extends object>(base: T, override: O | undefined, protect: string[] = []): T {
  if (!override) {
    return base;
  }
  return {
    ...base,
    ...Object.fromEntries(
      Object.entries(override).filter(([key, value]) => value !== undefined && !protect.includes(key))
    )
  };
}

/**
 * Fields no authored layer may write, however the document arrives.
 *
 * `provenance` and `evidence` say where a line came from. A decision about a conduit is a judgement
 * about what it *is*, and no judgement turns an inference into a traceroute. The `ConnectionOverride`
 * type already omits them, but a saved document is validated by shape and never by key, so a
 * hand-edited file could otherwise promote its own guess to observed fact — and the evidence grade
 * is the single thing the rest of the model's trustworthiness rests on.
 */
const PROTECTED_CONNECTION_FIELDS = ["provenance", "evidence", "id", "source", "target"];

const PROTECTED_ASSET_FIELDS = ["provenance", "sourceIds", "confidence", "rationale", "id", "identifiers", "ports", "scripts", "filteredPorts", "silence"];

/** Controls merge rather than replace; everything else follows the shared rule. */
function applyOverride(asset: MapAsset, override: AssetOverride | undefined): MapAsset {
  if (!override) {
    return asset;
  }
  const { controls, ...rest } = override;
  return {
    // Same protection as a connection: an override says what an asset *is*, never who saw it.
    ...withOverride<MapAsset, Omit<AssetOverride, "controls">>(asset, rest, PROTECTED_ASSET_FIELDS),
    controls: { ...asset.controls, ...controls }
  };
}


/**
 * A connection with nothing asserted about it.
 *
 * Exported because the stage maps mint attack edges of their own and need the same neutral base:
 * a copy of some other connection would carry that one's firewall rule and boundary flag onto an
 * arrow that has neither.
 */
export const blankConnection = (id: string, source: AssetId, target: AssetId): Conduit => ({
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

/**
 * The devices somebody added by hand, as assets.
 *
 * `confidence: 1` and not a fraction. Below one means *inferred* — reasoned from evidence — and the
 * canvas dims those and the inferred filter hides them. A device an operator put there on purpose
 * is an assertion, not a guess, and hiding it behind the inferred toggle would lose the one thing
 * on the map that nothing else can recreate.
 */
function authoredAssetsOf(doc: CyberMapDocument, subnets: Subnet[]): MapAsset[] {
  const bySubnetCidr = new Map(subnets.map((subnet) => [subnet.cidr, subnet.id] as const));

  return doc.authoredAssets.map((authored) => {
    const zone = getAssetType(authored.type)?.defaultZone ?? "level3";
    const base = createAsset(authored.type, { x: 0, y: 0 }, zone);
    // Placed in a segment by its address, exactly as a scanned host is. Anything else would make a
    // hand-added device sit outside the box its address says it belongs in.
    const cidr = cidrOf(authored.ipAddress);
    const asset: MapAsset = {
      ...base,
      id: authored.id,
      name: authored.name,
      ipAddress: authored.ipAddress ?? "",
      subnetId: cidr ? bySubnetCidr.get(cidr) : undefined,
      notes: authored.note ?? "",
      provenance: "authored",
      ...(authored.deviceKind ? { deviceKind: authored.deviceKind } : {}),
      ports: [],
      identifiers: { ips: authored.ipAddress ? [authored.ipAddress] : [], macs: [], hostnames: [] },
      confidence: 1,
      rationale: "Added by hand. No scan has seen this device.",
      sourceIds: []
    };
    return applyOverride(asset, doc.assetOverrides[authored.id]);
  });
}

/**
 * The lines somebody drew, as connections.
 *
 * Split out so a map holding nothing but hand-added devices still shows the lines between them —
 * an assessment can be entirely authored before the first scan lands.
 *
 * Endpoints that no longer exist are dropped and counted, not rejected: removing a source takes its
 * assets with it, and a line that outlived them is the ordinary consequence of that.
 */
function authoredConnectionsOf(
  doc: CyberMapDocument,
  assetIds: Set<string>,
  zoneOf: Map<string, ZoneId>
): { connections: MapConnection[]; dangling: number } {
  let dangling = 0;
  const connections: MapConnection[] = [];
  for (const connection of doc.connections) {
    if (!assetIds.has(connection.source) || !assetIds.has(connection.target)) {
      dangling += 1;
      continue;
    }
    connections.push(
      withOverride<MapConnection, ConnectionOverride>(
        {
          ...blankConnection(connection.id, connection.source, connection.target),
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
        },
        doc.connectionOverrides[connection.id],
        PROTECTED_CONNECTION_FIELDS
      )
    );
  }
  return { connections, dangling };
}

export function projectMap(doc: CyberMapDocument): ProjectedMap {
  const parsed = mergedSourceParse(doc);
  if (!parsed) {
    // A map with no scans is not necessarily an empty map: enumeration turns up devices before it
    // turns up packets, and somebody sketching what they have heard about deserves to see it.
    const authoredOnly = authoredAssetsOf(doc, []);
    return {
      assets: authoredOnly,
      connections: authoredConnectionsOf(doc, new Set(authoredOnly.map((asset) => asset.id)), new Map()).connections,
      subnets: [],
      warnings: [],
      access: new Map()
    };
  }

  const synthesised = synthesiseItTopology(parsed);
  const warnings = [...synthesised.warnings];
  const sourcesByIdentifier = sourceIdsByIdentifier(doc);

  // --- Assets -------------------------------------------------------------
  const importedAssets: MapAsset[] = synthesised.nodes.map((node) => {
    const host = hostFor(node);
    const type = assetTypeFor(node, host);
    const zone = zoneFor(node, type);
    // The projection has no arrangement, so it keeps the synthesis position. Where a device is
    // actually drawn is the canvas's business and depends on which arrangement is showing.
    const base = createAsset(type, node.position, zone);
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
      ...(node.os ? { os: node.os } : {}),
      ...(node.osAccuracy !== undefined ? { osAccuracy: node.osAccuracy } : {}),
      ports: node.ports,
      ...(node.scripts ? { scripts: node.scripts } : {}),
      ...(node.filteredPorts ? { filteredPorts: node.filteredPorts } : {}),
      ...(node.silence ? { silence: node.silence } : {}),
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

  const subnets: Subnet[] = synthesised.subnets.map((subnet) => ({
    ...subnet,
    ...doc.subnetOverrides[subnet.id]
  }));

  // Hand-added devices join the estate before anything reads it, so they are in the id set the
  // connections are checked against, in the zone map, and in the assessment.
  const assets = [...importedAssets, ...authoredAssetsOf(doc, subnets)];
  const assetIds = new Set(assets.map((asset) => asset.id));

  // --- Connections --------------------------------------------------------

  const zoneOf = new Map(assets.map((asset) => [asset.id, asset.zone] as const));

  const typeOf = new Map(assets.map((asset) => [asset.id, asset.type] as const));
  /**
   * A link that terminates on a device the topology classified as a firewall or a jump host is
   * brokered, not simply routed.
   *
   * Not a rule — a scan never shows the rule that allowed a packet, and `firewallRule` stays
   * `unknown` for exactly that reason. But *something mediates here* is a different claim from
   * *nothing does*, and it is the one the exposure walk turns on. Without it every derived link
   * defaulted to `routed`, so the whole estate came back "reachable without a broker" and the
   * exposure overlay painted all ten cards `--signal`: the brand's one colour spent on saying
   * nothing.
   *
   * Known imprecision: brokering lives on the conduit, so a link *to* a firewall is marked the same
   * as a link *through* one, and the firewall itself therefore reads as brokered from the internet
   * when it is in fact directly on it. One band too cautious on the broker, and correct for
   * everything behind it. Fixing it properly means moving brokering onto the node, which changes
   * what every existing OT model scores and does not belong in a change about overlays.
   */
  const brokeredBy = (id: string) => typeOf.get(id) === "firewall" || typeOf.get(id) === "jump-host";

  const derived: MapConnection[] = synthesised.links.map((link) =>
    // The override lands last, so a documented permit rule beats the `unknown` a scan can only ever
    // report. `evidence` and `provenance` are deliberately outside the override's reach: those say
    // where the line came from, and a decision about a conduit does not change who observed it.
    withOverride<MapConnection, ConnectionOverride>(
      {
        ...blankConnection(link.id, link.source, link.target),
        name: link.label ?? "",
        control: brokeredBy(link.source) || brokeredBy(link.target) ? "firewalled" : "routed",
        // A scan shows reachability, never the rule that allowed it.
        trustBoundary: zoneOf.get(link.source) !== zoneOf.get(link.target),
        provenance: "imported",
        evidence: link.evidence
      },
      doc.connectionOverrides[link.id],
      PROTECTED_CONNECTION_FIELDS
    )
  );

  const { connections: authored, dangling } = authoredConnectionsOf(doc, assetIds, zoneOf);
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
    ...blankConnection(link.id, link.source, link.target),
    name: link.label ?? "",
    provenance: "authored",
    evidence: "attack"
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
    subnets: projected.subnets,
    // The governance slice is authored, never derived, so it passes straight through. Without it
    // the assessment engines silently fall back to suggested SL-Ts and unoverridden CAF statuses,
    // and the analysis would report the defaults as though they were the assessor's judgement.
    ...(doc.governance.engagement ? { engagement: doc.governance.engagement } : {}),
    ...(doc.governance.zoneTargets ? { zoneTargets: doc.governance.zoneTargets } : {}),
    ...(doc.governance.cafOverrides ? { cafOverrides: doc.governance.cafOverrides } : {}),
    ...(doc.governance.riskTreatments ? { riskTreatments: doc.governance.riskTreatments } : {})
  };
}
