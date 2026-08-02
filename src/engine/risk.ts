import { exposureFromUntrusted } from "./reachability";
import { isHost } from "./securityLevels";
import type { Asset, AssetTypeId, OtProject } from "../models/types";

/**
 * OT risk model: Risk = Likelihood × Consequence.
 *
 * Consequence is the impact if the asset is compromised or fails — derived from asset class and
 * criticality, with an assessor override via `asset.consequence`.
 *
 * Likelihood is exposure plus weakness. It used to be the worst finding severity affecting the
 * asset, which made the heat-map a restatement of the findings list: the same rules fire on nearly
 * every asset, so almost everything landed at likelihood 4 or 5 and the matrix collapsed into a
 * consequence histogram. Reading a heat-map, a practitioner expects *exposure* on that axis.
 *
 * Both sit on a 1–5 scale, giving a 1–25 score placed on the consequence-led heat-map that
 * distinguishes OT risk from IT risk.
 */

export type RiskBand = "low" | "medium" | "high" | "critical";

export interface AssetRisk {
  assetId: string;
  consequence: number;
  likelihood: number;
  score: number;
  band: RiskBand;
  /** Why the likelihood is what it is, for the heat-map row title. */
  reason: string;
}

export interface RiskAssessment {
  assets: AssetRisk[];
  /** matrix[consequence-1][likelihood-1] = number of assets in that cell. */
  matrix: number[][];
}

export const RISK_SCALE = 5;

const typeConsequence: Record<AssetTypeId, number> = {
  "safety-system": 5,
  "plc-rtu": 4,
  scada: 4,
  "field-device": 3,
  hmi: 3,
  "engineering-workstation": 3,
  "wireless-gateway": 3,
  historian: 2,
  firewall: 2,
  "jump-host": 2,
  "vendor-remote": 2,
  "enterprise-it": 2,
  "cloud-service": 2
};

function clamp(value: number): number {
  return Math.min(RISK_SCALE, Math.max(1, value));
}

/** Derived consequence when the assessor has not set one explicitly. */
export function derivedConsequence(asset: Asset): number {
  let consequence = typeConsequence[asset.type] ?? 2;
  if (asset.criticality === "critical") {
    consequence += 1;
  } else if (asset.criticality === "low") {
    consequence -= 1;
  }
  return clamp(consequence);
}

export function consequenceFor(asset: Asset): number {
  return asset.consequence !== undefined ? clamp(asset.consequence) : derivedConsequence(asset);
}

/**
 * How weak an asset is in its own right, independent of where it sits: one point for an access
 * gap, one for a platform gap. Capped at 2 so exposure and weakness carry comparable weight.
 */
export function weaknessFor(asset: Asset): 0 | 1 | 2 {
  const access = !asset.controls.defaultCredentialsDisabled || (isHost(asset) && !asset.controls.mfa);
  // Platform weakness is lifecycle only for now. The protocol half joins it when protocol families
  // gain a `nativeSecurity` flag and the three separate legacy lists collapse into one predicate.
  const platform = asset.lifecycleStatus === "obsolete";
  return ((access ? 1 : 0) + (platform ? 1 : 0)) as 0 | 1 | 2;
}

/**
 * `exposure` comes from `exposureFromUntrusted`. Callers that have not computed it get 0, which
 * reads as "not reachable from anywhere untrusted" — the safe direction to be wrong in.
 */
export function likelihoodForAsset(asset: Asset, exposure: 0 | 1 | 2 = 0): number {
  return clamp(1 + exposure + weaknessFor(asset));
}

/** Plain-English reason for an asset's likelihood, shown on the heat-map row. */
export function likelihoodReason(asset: Asset, exposure: 0 | 1 | 2): string {
  const parts: string[] = [
    exposure === 2
      ? "reachable from an untrusted zone without a broker"
      : exposure === 1
        ? "reachable from an untrusted zone, but only through a broker"
        : "not reachable from an untrusted zone"
  ];
  if (!asset.controls.defaultCredentialsDisabled) {
    parts.push("default credentials not confirmed disabled");
  } else if (isHost(asset) && !asset.controls.mfa) {
    parts.push("no MFA");
  }
  if (asset.lifecycleStatus === "obsolete") {
    parts.push("obsolete platform");
  }
  return parts.join(" · ");
}

export function riskBand(score: number): RiskBand {
  if (score >= 15) {
    return "critical";
  }
  if (score >= 9) {
    return "high";
  }
  if (score >= 4) {
    return "medium";
  }
  return "low";
}

export function assessRisk(project: OtProject): RiskAssessment {
  // One pass over the graph for the whole project, rather than a search per asset.
  const exposure = exposureFromUntrusted(project);

  const assets = project.assets
    .map((asset) => {
      const assetExposure = exposure.get(asset.id) ?? 0;
      const consequence = consequenceFor(asset);
      const likelihood = likelihoodForAsset(asset, assetExposure);
      const score = consequence * likelihood;
      return {
        assetId: asset.id,
        consequence,
        likelihood,
        score,
        band: riskBand(score),
        reason: likelihoodReason(asset, assetExposure)
      };
    })
    .sort((a, b) => b.score - a.score);

  const matrix = Array.from({ length: RISK_SCALE }, () => Array.from({ length: RISK_SCALE }, () => 0));
  for (const risk of assets) {
    matrix[risk.consequence - 1][risk.likelihood - 1] += 1;
  }

  return { assets, matrix };
}

/** How many assets sit in the high or critical risk bands. */
export function countHighRisk(risk: RiskAssessment): number {
  return risk.assets.filter((asset) => asset.band === "critical" || asset.band === "high").length;
}
