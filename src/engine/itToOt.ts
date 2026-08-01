import { layoutTiered } from "../data/canvasLayout";
import { blankProject } from "../data/sampleProject";
import { createAsset, createConduit, makeId } from "../models/factory";
import type { ItLink, ItMap, ItNode, ItNodeKind } from "../models/itMap";
import type { Asset, AssetTypeId, Conduit, OtProject, ZoneId } from "../models/types";

/**
 * Promotes a scanned IT map into an OT project so it can be assessed against IEC 62443 and the
 * CAF in the workbench.
 *
 * This is deliberately an explicit, lossy conversion rather than the two views sharing one
 * model. An IT map answers "what is on the network"; an OT project answers "how is it zoned and
 * what controls does it have" — and a scan cannot know the latter. Everything it invents is
 * conservative and flagged in the asset notes, so the reviewer can see what still needs a human:
 *
 *  - zones are a guess from the device class and are almost certainly wrong for a real site;
 *  - every security control starts off, because an unanswered control is not a passed one;
 *  - inferred links become conduits with an `unknown` firewall rule, which is what they are.
 *
 * Synthetic nodes (the internet cloud, ghost gateways) are dropped: they were reasoning aids
 * for drawing the map, not assets anyone owns.
 */

/** The closest OT asset type for each network-map symbol. */
const TYPE_BY_KIND: Record<ItNodeKind, AssetTypeId> = {
  internet: "cloud-service",
  firewall: "firewall",
  router: "firewall",
  switch: "firewall",
  "load-balancer": "enterprise-it",
  server: "enterprise-it",
  database: "historian",
  workstation: "engineering-workstation",
  printer: "enterprise-it",
  "wireless-ap": "wireless-gateway",
  unknown: "enterprise-it"
};

/**
 * A first-guess zone. Perimeter and routing kit land in the DMZ-ish operations level, hosts in
 * enterprise IT. A scan has no idea what is actually control-critical, so nothing is placed
 * below level 3 — better to make the reviewer promote assets down than to quietly assert that
 * a database is a controller.
 */
function zoneFor(node: ItNode): ZoneId {
  switch (node.tier) {
    case "internet":
    case "perimeter":
      return "level5";
    case "core":
    case "gateway":
      return "level3";
    default:
      return node.kind === "workstation" ? "level3" : "level5";
  }
}

const PROMOTION_NOTE = "Imported from an Nmap scan. Zone and controls are unreviewed.";

export interface PromotionResult {
  project: OtProject;
  /** What the conversion could not carry over, for an honest summary in the UI. */
  dropped: { syntheticNodes: number; links: number };
}

export function promoteToOtProject(map: ItMap, name = map.name): PromotionResult {
  const scanned = map.nodes.filter((node) => node.origin === "scanned");
  const keptIds = new Set(scanned.map((node) => node.id));

  const assetByNodeId = new Map<string, Asset>();
  const assets: Asset[] = scanned.map((node) => {
    const type = TYPE_BY_KIND[node.kind];
    const asset = createAsset(type, node.position, zoneFor(node));

    asset.name = node.name;
    asset.ipAddress = node.ip ?? "";
    asset.manufacturer = node.vendor ?? "";
    asset.subnetId = node.subnetId;
    if (node.ports.length > 0) {
      asset.protocols = [...new Set(node.ports.map((port) => port.service || `Port ${port.port}`))];
    }
    asset.notes = [node.os ? `OS: ${node.os}` : "", node.rationale, PROMOTION_NOTE].filter(Boolean).join(" · ");

    assetByNodeId.set(node.id, asset);
    return asset;
  });

  const conduits: Conduit[] = [];
  let droppedLinks = 0;
  for (const link of map.links) {
    if (!keptIds.has(link.source) || !keptIds.has(link.target)) {
      // A link to the internet cloud or a ghost gateway has no asset to attach to.
      droppedLinks += 1;
      continue;
    }
    const source = assetByNodeId.get(link.source)!;
    const target = assetByNodeId.get(link.target)!;

    const conduit = createConduit(source.id, target.id);
    conduit.name = evidenceLabel(link);
    conduit.protocol = "Observed";
    conduit.port = "";
    conduit.protocolFamily = "auto";
    conduit.control = "routed";
    // A scan shows reachability, never the rule that allowed it or whether it is inspected.
    conduit.firewallRule = "unknown";
    conduit.encrypted = false;
    conduit.inspected = false;
    conduit.logged = false;
    conduit.trustBoundary = source.zone !== target.zone;
    conduit.notes = `${evidenceLabel(link)}. ${PROMOTION_NOTE}`;
    conduits.push(conduit);
  }

  const subnets = map.subnets.map((subnet) => ({ ...subnet }));
  const positions = layoutTiered(assets, subnets, conduits);

  return {
    project: {
      ...structuredClone(blankProject),
      id: makeId("project"),
      name,
      assets: assets.map((asset) => ({ ...asset, position: positions.get(asset.id) ?? asset.position })),
      conduits,
      subnets,
      updatedAt: new Date().toISOString()
    },
    dropped: { syntheticNodes: map.nodes.length - scanned.length, links: droppedLinks }
  };
}

function evidenceLabel(link: ItLink): string {
  switch (link.evidence) {
    case "traceroute":
      return "Traced by the scan";
    case "observed-flow":
      return "Observed traffic";
    case "same-subnet":
      return "Same subnet";
    default:
      return "Inferred from addressing";
  }
}
