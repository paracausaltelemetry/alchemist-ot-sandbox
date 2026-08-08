import { getAssetType, getZone } from "../data/catalog";
import type { Asset, Conduit, OtProject, PathRisk, ReachabilityResult } from "../models/types";

type DirectedEdge = {
  from: string;
  to: string;
  conduit: Conduit;
};

function conduitDirections(conduit: Conduit): DirectedEdge[] {
  if (conduit.direction === "source-to-target") {
    return [{ from: conduit.source, to: conduit.target, conduit }];
  }

  if (conduit.direction === "target-to-source") {
    return [{ from: conduit.target, to: conduit.source, conduit }];
  }

  return [
    { from: conduit.source, to: conduit.target, conduit },
    { from: conduit.target, to: conduit.source, conduit }
  ];
}

function buildAdjacency(project: OtProject): Map<string, DirectedEdge[]> {
  const assetIds = new Set(project.assets.map((asset) => asset.id));
  const adjacency = new Map<string, DirectedEdge[]>();

  for (const asset of project.assets) {
    adjacency.set(asset.id, []);
  }

  for (const conduit of project.conduits) {
    if (!assetIds.has(conduit.source) || !assetIds.has(conduit.target)) {
      continue;
    }

    for (const directed of conduitDirections(conduit)) {
      adjacency.get(directed.from)?.push(directed);
    }
  }

  return adjacency;
}

function assetMap(project: OtProject) {
  return new Map(project.assets.map((asset) => [asset.id, asset]));
}

function pathRisks(project: OtProject, assetIds: string[], conduitIds: string[]): PathRisk[] {
  const assets = assetMap(project);
  const conduits = new Map(project.conduits.map((conduit) => [conduit.id, conduit]));
  const risks: PathRisk[] = [];
  const pathAssets = assetIds.map((id) => assets.get(id)).filter(Boolean);
  const pathZones = pathAssets.map((asset) => getZone(asset!.zone));
  const hasDmzBroker = pathAssets.some((asset) => asset?.type === "firewall" || asset?.type === "jump-host" || asset?.name.toLowerCase().includes("dmz"));
  const startsHighTrust = pathZones.some((zone) => zone.riskRank >= 6);
  const reachesControl = pathZones.some((zone) => zone.riskRank <= 3);

  if (startsHighTrust && reachesControl && !hasDmzBroker) {
    risks.push({
      severity: "critical",
      title: "Path bypasses brokered OT boundary controls",
      detail: "A path connects enterprise or business zones to control zones without a clear DMZ, firewall, proxy, or jump-host broker."
    });
  }

  for (const conduitId of conduitIds) {
    const conduit = conduits.get(conduitId);
    if (!conduit) {
      continue;
    }

    if (conduit.firewallRule === "any-any") {
      risks.push({
        severity: "high",
        title: "Broad firewall rule in path",
        detail: `${conduit.name} is marked as any-any. Replace this with explicit source, destination, service, and direction.`,
        conduitId
      });
    }

    if (conduit.firewallRule === "unknown") {
      risks.push({
        severity: "medium",
        title: "Unknown access rule",
        detail: `${conduit.name} does not have a documented permit rule.`,
        conduitId
      });
    }

    if (conduit.trustBoundary && (!conduit.inspected || !conduit.logged)) {
      risks.push({
        severity: "high",
        title: "Boundary crossing lacks inspection or logging",
        detail: `${conduit.name} crosses a trust boundary but is not both inspected and logged.`,
        conduitId
      });
    }

    if (conduit.trustBoundary && conduit.direction === "bidirectional") {
      risks.push({
        severity: "medium",
        title: "Bidirectional trust-boundary flow",
        detail: `${conduit.name} is bidirectional across a trust boundary. Confirm both directions are required.`,
        conduitId
      });
    }
  }

  for (const assetId of assetIds) {
    const asset = assets.get(assetId);
    if (!asset) {
      continue;
    }

    const type = getAssetType(asset.type);
    if (asset.type === "vendor-remote") {
      risks.push({
        severity: asset.controls.mfa ? "medium" : "critical",
        title: "Remote access is on the path",
        detail: `${asset.name} (${type.label}) is part of the permitted route. Verify MFA, approval, session recording, and just-in-time access.`,
        assetId
      });
    }
  }

  return risks;
}

export function findReachability(project: OtProject, sourceId: string, targetId: string): ReachabilityResult {
  if (!sourceId || !targetId) {
    return {
      sourceId,
      targetId,
      reachable: false,
      pathAssetIds: [],
      pathConduitIds: [],
      risks: [],
      explanation: "Choose a source and target asset to test reachability."
    };
  }

  if (sourceId === targetId) {
    return {
      sourceId,
      targetId,
      reachable: true,
      pathAssetIds: [sourceId],
      pathConduitIds: [],
      risks: [],
      explanation: "Source and target are the same asset."
    };
  }

  const assets = assetMap(project);
  if (!assets.has(sourceId) || !assets.has(targetId)) {
    return {
      sourceId,
      targetId,
      reachable: false,
      pathAssetIds: [],
      pathConduitIds: [],
      risks: [],
      explanation: "The selected source or target no longer exists in the topology."
    };
  }

  const adjacency = buildAdjacency(project);
  const queue: Array<{ assetId: string; assetPath: string[]; conduitPath: string[] }> = [
    { assetId: sourceId, assetPath: [sourceId], conduitPath: [] }
  ];
  const visited = new Set<string>([sourceId]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const nextEdges = adjacency.get(current.assetId) ?? [];

    for (const edge of nextEdges) {
      if (visited.has(edge.to)) {
        continue;
      }

      const assetPath = [...current.assetPath, edge.to];
      const conduitPath = [...current.conduitPath, edge.conduit.id];

      if (edge.to === targetId) {
        const risks = pathRisks(project, assetPath, conduitPath);
        return {
          sourceId,
          targetId,
          reachable: true,
          pathAssetIds: assetPath,
          pathConduitIds: conduitPath,
          risks,
          explanation:
            risks.length > 0
              ? "A permitted path exists, but the path has security concerns that should be remediated."
              : "A permitted path exists and no high-risk path conditions were detected."
        };
      }

      visited.add(edge.to);
      queue.push({ assetId: edge.to, assetPath, conduitPath });
    }
  }

  return {
    sourceId,
    targetId,
    reachable: false,
    pathAssetIds: [],
    pathConduitIds: [],
    risks: [],
    explanation:
      "No permitted route exists using the declared conduit directions. Review whether a missing conduit, firewall rule, or jump-host path should be documented."
  };
}

/**
 * A conduit that mediates rather than simply forwards. Reaching an asset only through one of these
 * is a materially different exposure from reaching it directly, which is the distinction the risk
 * heat-map needs and the reason two passes are worth it.
 */
function isBrokered(conduit: Conduit): boolean {
  return conduit.control === "firewalled" || conduit.control === "jump-host" || conduit.control === "data-diode";
}

/**
 * Entry points an attacker is assumed to start from.
 *
 * Where the model draws the internet, that is the starting point, plus vendor remote access and
 * cloud services wherever they sit. Where it does not — every project authored before the internet
 * band existed — fall back to treating enterprise and business zones as the untrusted side, which
 * is what this has always done and what those projects were assessed against.
 *
 * The distinction matters because seeding Enterprise IT makes "an Enterprise IT asset is directly
 * reachable from an untrusted start" true by definition. On an authored OT model that is a
 * reasonable worst case; on a converged map, where most of the estate is corporate, it reported
 * every single asset as directly exposed and said nothing about any of them.
 */
function untrustedEntryIds(project: OtProject): string[] {
  const external = (asset: Asset) => asset.type === "vendor-remote" || asset.type === "cloud-service";
  const modelsTheInternet = project.assets.some((asset) => asset.zone === "internet");

  return project.assets
    .filter((asset) =>
      modelsTheInternet ? asset.zone === "internet" || external(asset) : getZone(asset.zone).riskRank >= 6 || external(asset)
    )
    .map((asset) => asset.id);
}

/** Multi-source BFS from every untrusted entry at once, optionally refusing to cross a broker. */
function spreadFromUntrusted(project: OtProject, adjacency: Map<string, DirectedEdge[]>, crossBrokers: boolean): Set<string> {
  const queue = untrustedEntryIds(project);
  const reached = new Set<string>(queue);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of adjacency.get(current) ?? []) {
      if (reached.has(edge.to) || (!crossBrokers && isBrokered(edge.conduit))) {
        continue;
      }
      reached.add(edge.to);
      queue.push(edge.to);
    }
  }

  return reached;
}

/**
 * How exposed each asset is to an untrusted starting point: 2 when it can be reached without ever
 * crossing a broker, 1 when every route crosses one, 0 when it cannot be reached at all.
 *
 * Two multi-source passes over one adjacency map, each O(assets + conduits). Seeding every entry
 * point into a single walk is what avoids running a search per (entry, target) pair.
 */
export function exposureFromUntrusted(project: OtProject): Map<string, 0 | 1 | 2> {
  const adjacency = buildAdjacency(project);
  const anyRoute = spreadFromUntrusted(project, adjacency, true);
  const unbrokered = spreadFromUntrusted(project, adjacency, false);

  return new Map(
    project.assets.map((asset) => [asset.id, unbrokered.has(asset.id) ? 2 : anyRoute.has(asset.id) ? 1 : 0] as const)
  );
}

export function reachableAssetIds(project: OtProject, sourceId: string): Set<string> {
  const adjacency = buildAdjacency(project);
  const visited = new Set<string>();
  const queue = [sourceId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of adjacency.get(current) ?? []) {
      if (!visited.has(edge.to)) {
        visited.add(edge.to);
        queue.push(edge.to);
      }
    }
  }

  return visited;
}
