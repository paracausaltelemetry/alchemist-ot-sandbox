import { getAssetType, getZone } from "../data/catalog";
import { getTechnique, icsTactics, type IcsTechnique } from "../data/attackIcs";
import { exposureFromUntrusted, findReachability, reachableAssetIds } from "./reachability";
import { consequenceFor, likelihoodForAsset, riskBand, type RiskBand } from "./risk";
import type { Asset, Finding, OtProject } from "../models/types";

/**
 * Attack-path narrative: ties reachability, the assessment's findings (already mapped to MITRE
 * ATT&CK for ICS techniques) and the OT consequence model into one kill-chain story from an entry
 * point to a crown-jewel asset. Pure and unit-tested; no recomputation of the assessment (findings
 * are passed in).
 */

export interface AttackPathTactic {
  id: string;
  name: string;
  techniques: IcsTechnique[];
}

export interface AttackPathHop {
  assetId: string;
  name: string;
  typeLabel: string;
  zoneLabel: string;
}

export interface AttackPathResult {
  entryId: string;
  targetId: string;
  reachable: boolean;
  hops: AttackPathHop[];
  conduitIds: string[];
  tactics: AttackPathTactic[];
  consequence: { value: number; band: RiskBand; processTag: string };
  breakers: string[];
  protectedAssets: string[];
  explanation: string;
}

function zoneRank(asset: Asset): number {
  return getZone(asset.zone).riskRank;
}

/** Most-exposed entry: prefer external/remote access, otherwise the least-trusted (highest-rank) zone. */
export function suggestEntry(project: OtProject): string {
  if (project.assets.length === 0) {
    return "";
  }
  const external = project.assets.filter((asset) => asset.type === "vendor-remote" || asset.type === "cloud-service");
  const pool = external.length > 0 ? external : project.assets;
  return [...pool].sort((a, b) => zoneRank(b) - zoneRank(a))[0].id;
}

function crownJewelScore(asset: Asset): number {
  // Highest consequence dominates; then a tagged critical process; then depth (deeper zone = lower rank).
  return consequenceFor(asset) * 100 + (asset.criticalProcessTag.trim() ? 10 : 0) + (12 - zoneRank(asset));
}

/** Crown jewel reachable from the entry: the highest-consequence asset an attacker could actually reach. */
export function suggestTarget(project: OtProject, entryId: string): string {
  const reachable = reachableAssetIds(project, entryId);
  const reachablePool = project.assets.filter((asset) => asset.id !== entryId && reachable.has(asset.id));
  const pool = reachablePool.length > 0 ? reachablePool : project.assets.filter((asset) => asset.id !== entryId);
  if (pool.length === 0) {
    return "";
  }
  return [...pool].sort((a, b) => crownJewelScore(b) - crownJewelScore(a))[0].id;
}

function impactTechniqueId(asset: Asset): string {
  if (asset.type === "safety-system") {
    return "T0880"; // Loss of Safety
  }
  if (asset.type === "plc-rtu" || asset.type === "field-device") {
    return "T0827"; // Loss of Control
  }
  return "T0826"; // Loss of Availability
}

function initialAccessTechniqueId(asset: Asset): string {
  return asset.type === "vendor-remote" || asset.type === "cloud-service" ? "T0822" : "T0883";
}

export function analyzeAttackPath(
  project: OtProject,
  entryId: string,
  targetId: string,
  findings: Finding[]
): AttackPathResult {
  const byId = new Map(project.assets.map((asset) => [asset.id, asset]));
  const entry = byId.get(entryId);
  const target = byId.get(targetId);
  const reach = findReachability(project, entryId, targetId);

  const hops: AttackPathHop[] = reach.pathAssetIds.map((id) => {
    const asset = byId.get(id);
    return {
      assetId: id,
      name: asset?.name ?? id,
      typeLabel: asset ? getAssetType(asset.type).label : "Unknown",
      zoneLabel: asset ? getZone(asset.zone).levelLabel : ""
    };
  });

  const pathAssets = new Set(reach.pathAssetIds);
  const pathConduits = new Set(reach.pathConduitIds);
  const onPath = findings.filter(
    (finding) =>
      finding.affectedAssetIds.some((id) => pathAssets.has(id)) ||
      finding.affectedConduitIds.some((id) => pathConduits.has(id))
  );

  // Seed the chain with an initial-access technique at the entry and an impact technique at the
  // target, then fold in every technique the on-path findings already carry.
  const techniqueIds = new Set<string>();
  if (entry && reach.reachable) {
    techniqueIds.add(initialAccessTechniqueId(entry));
  }
  for (const finding of onPath) {
    for (const technique of finding.techniques ?? []) {
      techniqueIds.add(technique);
    }
  }
  if (target && reach.reachable) {
    techniqueIds.add(impactTechniqueId(target));
  }

  const tactics: AttackPathTactic[] = icsTactics
    .map((tactic) => ({
      id: tactic.id,
      name: tactic.name,
      techniques: [...techniqueIds]
        .map((id) => getTechnique(id))
        .filter((technique): technique is IcsTechnique => technique !== undefined && technique.tactic === tactic.id)
    }))
    .filter((tactic) => tactic.techniques.length > 0);

  const breakers = Array.from(new Set(onPath.map((finding) => finding.remediation))).slice(0, 6);

  // Higher- or equal-consequence assets the entry cannot reach: defence in depth working.
  const reachable = reachableAssetIds(project, entryId);
  const targetConsequence = target ? consequenceFor(target) : 0;
  const protectedAssets = project.assets
    .filter(
      (asset) =>
        asset.id !== entryId &&
        asset.id !== targetId &&
        consequenceFor(asset) >= targetConsequence &&
        !reachable.has(asset.id)
    )
    .sort((a, b) => consequenceFor(b) - consequenceFor(a))
    .map((asset) => asset.name);

  // The target's own likelihood, so the attack path's risk band matches the heat-map's.
  const likelihood = target ? likelihoodForAsset(target, exposureFromUntrusted(project).get(target.id) ?? 0) : 1;
  const consequence = {
    value: targetConsequence,
    band: riskBand(targetConsequence * likelihood),
    processTag: target?.criticalProcessTag.trim() ?? ""
  };

  let explanation: string;
  if (!entry || !target) {
    explanation = "Choose an entry point and a target asset.";
  } else if (reach.reachable) {
    const hopCount = Math.max(0, hops.length - 1);
    explanation = `An attacker at ${entry.name} can reach ${target.name} across ${hopCount} hop${hopCount === 1 ? "" : "s"} using the declared conduits.`;
  } else {
    explanation = `No declared path lets ${entry.name} reach ${target.name}. Segmentation or directional controls block this route.`;
  }

  return {
    entryId,
    targetId,
    reachable: reach.reachable,
    hops,
    conduitIds: reach.pathConduitIds,
    tactics,
    consequence,
    breakers,
    protectedAssets,
    explanation
  };
}
