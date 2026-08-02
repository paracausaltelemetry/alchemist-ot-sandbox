import { categoryLabels, getAssetType, getZone, standardReferences } from "../data/catalog";
import { techniquesForCategory } from "../data/attackIcs";
import { findReachability } from "./reachability";
import { assessSecurityLevels, foundationalRequirements } from "./securityLevels";
import type { Asset, AssessmentCoverage, Conduit, Finding, OtProject, ScoreCategory, SecurityAssessment, Severity, Subnet } from "../models/types";

export const categoryWeights: Record<ScoreCategory, number> = {
  segmentation: 0.22,
  remoteAccess: 0.16,
  identity: 0.14,
  monitoring: 0.14,
  resilience: 0.12,
  legacyExposure: 0.1,
  safetyImpact: 0.08,
  documentation: 0.04
};

export const severityDeduction: Record<Severity, number> = {
  critical: 28,
  high: 18,
  medium: 10,
  low: 5
};

/**
 * The smallest model worth rating. Alchemist rates an *architecture*: one asset is an inventory
 * row, and with no conduits there is no topology — segmentation, the heaviest category at 0.22,
 * has nothing to measure.
 */
export const MIN_RATEABLE_ASSETS = 2;
export const MIN_RATEABLE_CONDUITS = 1;

/** Score bands (descending by minimum). The advisory rating maps to the first band it meets. */
export const scoreBands: Array<{ band: SecurityAssessment["band"]; label: string; min: number }> = [
  { band: "strong", label: "Strong", min: 82 },
  { band: "fair", label: "Fair", min: 64 },
  { band: "weak", label: "Weak", min: 45 },
  { band: "critical", label: "Critical", min: 0 }
];

const legacyProtocols = new Set([
  "modbus",
  "modbus tcp",
  "dnp3",
  "ftp",
  "telnet",
  "snmp v1",
  "snmpv1",
  "snmp v2",
  "snmpv2",
  "http"
]);

function scoreBand(score: number): SecurityAssessment["band"] {
  return (scoreBands.find((entry) => score >= entry.min) ?? scoreBands[scoreBands.length - 1]).band;
}

function stableId(category: ScoreCategory, title: string, seed: string) {
  return `${category}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${seed}`.replace(/-+/g, "-");
}

function isControlZone(asset: Asset) {
  return getZone(asset.zone).riskRank <= 3 || asset.type === "safety-system";
}

function isRemoteAccessAsset(asset: Asset) {
  return asset.type === "vendor-remote";
}

function crossesItToControl(source: Asset, target: Asset) {
  const sourceRank = getZone(source.zone).riskRank;
  const targetRank = getZone(target.zone).riskRank;
  return (sourceRank >= 6 && targetRank <= 3) || (targetRank >= 6 && sourceRank <= 3);
}

function addFinding(findings: Finding[], finding: Omit<Finding, "id">, seed: string) {
  findings.push({
    id: stableId(finding.category, finding.title, seed),
    ...finding
  });
}

function assetName(asset?: Asset) {
  return asset?.name ?? "Unknown asset";
}

function conduitName(conduit?: Conduit) {
  return conduit?.name ?? "Unknown conduit";
}

/**
 * Whether an asset's network placement is documented.
 *
 * VLAN lives on the `Subnet` — that is what `Subnet.vlan` is for, and assets carry `subnetId` —
 * so reading `asset.vlan` alone asked the wrong object. No bundled scenario sets an asset-level
 * VLAN, so every asset in every scenario raised "documentation incomplete" regardless of how
 * carefully its segment was described. `asset.vlan` is kept as a per-asset override.
 */
function networkDocumented(asset: Asset, subnets: Map<string, Subnet>): boolean {
  if (asset.vlan.trim()) {
    return true;
  }
  const subnet = asset.subnetId ? subnets.get(asset.subnetId) : undefined;
  return Boolean(subnet && (subnet.vlan.trim() || subnet.cidr.trim()));
}

function listAnd(items: string[]): string {
  if (items.length <= 1) {
    return items[0] ?? "";
  }
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function isPastDate(value: string) {
  if (!value.trim()) {
    return false;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed < Date.now();
}

export function assessProject(project: OtProject): SecurityAssessment {
  const findings: Finding[] = [];
  const assets = new Map(project.assets.map((asset) => [asset.id, asset]));
  const subnetsById = new Map((project.subnets ?? []).map((subnet) => [subnet.id, subnet]));

  for (const conduit of project.conduits) {
    const source = assets.get(conduit.source);
    const target = assets.get(conduit.target);
    if (!source || !target) {
      addFinding(
        findings,
        {
          category: "documentation",
          severity: "high",
          title: "Conduit references a missing asset",
          detail: `${conduit.name} points to an asset that is not present in the model.`,
          remediation: "Remove the conduit or reconnect it to documented source and destination assets.",
          affectedAssetIds: [],
          affectedConduitIds: [conduit.id],
          references: [standardReferences.isa62443]
        },
        conduit.id
      );
      continue;
    }

    if (crossesItToControl(source, target)) {
      addFinding(
        findings,
        {
          category: "segmentation",
          severity: "critical",
          title: "Direct enterprise-to-control conduit",
          detail: `${conduitName(conduit)} connects ${assetName(source)} and ${assetName(target)} without an IDMZ broker.`,
          remediation: "Route enterprise or business access through Level 3.5 IDMZ services, proxies, replication, or a controlled jump-host path.",
          affectedAssetIds: [source.id, target.id],
          affectedConduitIds: [conduit.id],
          references: [standardReferences.nist80082, standardReferences.isa62443]
        },
        conduit.id
      );
    }

    if (conduit.trustBoundary && conduit.firewallRule === "any-any") {
      addFinding(
        findings,
        {
          category: "segmentation",
          severity: "high",
          title: "Any-any rule across trust boundary",
          detail: `${conduitName(conduit)} is documented as any-any across a trust boundary.`,
          remediation: "Replace with least-privilege rules for exact source, destination, protocol, port, and direction.",
          affectedAssetIds: [source.id, target.id],
          affectedConduitIds: [conduit.id],
          references: [standardReferences.nist80082, standardReferences.isa62443]
        },
        conduit.id
      );
    }

    if (conduit.trustBoundary && conduit.firewallRule === "unknown") {
      addFinding(
        findings,
        {
          category: "documentation",
          severity: "medium",
          title: "Undocumented boundary rule",
          detail: `${conduitName(conduit)} crosses a trust boundary but the permit rule is unknown.`,
          remediation: "Document the exact access rule, owner, business justification, review cadence, and expiry if temporary.",
          affectedAssetIds: [source.id, target.id],
          affectedConduitIds: [conduit.id],
          references: [standardReferences.nist80082]
        },
        conduit.id
      );
    }

    if (conduit.trustBoundary && (!conduit.ruleOwner.trim() || !conduit.businessJustification.trim())) {
      addFinding(
        findings,
        {
          category: "documentation",
          severity: "medium",
          title: "Boundary flow lacks ownership or justification",
          detail: `${conduitName(conduit)} crosses a trust boundary without a rule owner and business justification.`,
          remediation: "Assign a rule owner and document why the flow is operationally required before accepting the boundary exposure.",
          affectedAssetIds: [source.id, target.id],
          affectedConduitIds: [conduit.id],
          references: [standardReferences.nist80082, standardReferences.isa62443]
        },
        `${conduit.id}-owner`
      );
    }

    if (conduit.temporaryAccess && isPastDate(conduit.expiryDate)) {
      addFinding(
        findings,
        {
          category: "segmentation",
          severity: "high",
          title: "Temporary conduit is past expiry",
          detail: `${conduitName(conduit)} is marked as temporary access but its expiry date has passed.`,
          remediation: "Remove the rule, renew it through change control, or replace it with a permanent least-privilege conduit.",
          affectedAssetIds: [source.id, target.id],
          affectedConduitIds: [conduit.id],
          references: [standardReferences.nist80082]
        },
        `${conduit.id}-expiry`
      );
    }

    if (conduit.trustBoundary && (!conduit.inspected || !conduit.logged)) {
      addFinding(
        findings,
        {
          category: "monitoring",
          severity: "high",
          title: "Boundary flow lacks inspection or logging",
          detail: `${conduitName(conduit)} crosses a trust boundary but is not both inspected and logged.`,
          remediation: "Enable firewall logging, session logging, IDS/NSM inspection, or another compensating monitoring control for this conduit.",
          affectedAssetIds: [source.id, target.id],
          affectedConduitIds: [conduit.id],
          references: [standardReferences.nist80082, standardReferences.mitreIcs]
        },
        conduit.id
      );
    }

    if (conduit.trustBoundary && conduit.direction === "bidirectional") {
      addFinding(
        findings,
        {
          category: "segmentation",
          severity: "medium",
          title: "Bidirectional boundary conduit",
          detail: `${conduitName(conduit)} permits bidirectional traffic across a trust boundary.`,
          remediation: "Split the conduit into explicit one-way flows and remove directions that are not operationally required.",
          affectedAssetIds: [source.id, target.id],
          affectedConduitIds: [conduit.id],
          references: [standardReferences.isa62443]
        },
        conduit.id
      );
    }

    const sourceType = getAssetType(source.type);
    const targetType = getAssetType(target.type);
    const engineeringToController =
      (source.type === "engineering-workstation" && target.type === "plc-rtu") ||
      (target.type === "engineering-workstation" && source.type === "plc-rtu");
    if (engineeringToController && conduit.direction === "bidirectional" && !conduit.logged) {
      addFinding(
        findings,
        {
          category: "identity",
          severity: "high",
          title: "Engineering path needs tighter control",
          detail: `${sourceType.label} to ${targetType.label} access is bidirectional and not centrally logged.`,
          remediation: "Require jump-host mediation, named accounts, MFA where possible, session recording, and temporary change windows for controller downloads.",
          affectedAssetIds: [source.id, target.id],
          affectedConduitIds: [conduit.id],
          references: [standardReferences.nist80082, standardReferences.mitreIcs]
        },
        conduit.id
      );
    }

    const safetyAsset = source.type === "safety-system" ? source : target.type === "safety-system" ? target : undefined;
    if (safetyAsset && conduit.control !== "data-diode" && conduit.direction === "bidirectional") {
      addFinding(
        findings,
        {
          category: "safetyImpact",
          severity: "critical",
          title: "Safety system has bidirectional control path",
          detail: `${assetName(safetyAsset)} is connected through a bidirectional conduit without a unidirectional control.`,
          remediation: "Validate the safety case, prefer read-only or data-diode style integration, and restrict changes to formal safety change control.",
          affectedAssetIds: [source.id, target.id],
          affectedConduitIds: [conduit.id],
          references: [standardReferences.nist80082, standardReferences.isa62443]
        },
        conduit.id
      );
    }
  }

  for (const asset of project.assets) {
    if (isRemoteAccessAsset(asset) && !asset.controls.mfa) {
      addFinding(
        findings,
        {
          category: "remoteAccess",
          severity: "critical",
          title: "Remote access lacks MFA",
          detail: `${asset.name} is a remote or third-party access point without MFA marked as present.`,
          remediation: "Require phishing-resistant MFA where practical, named accounts, approval, session recording, and emergency access handling.",
          affectedAssetIds: [asset.id],
          affectedConduitIds: [],
          references: [standardReferences.nist80082, standardReferences.mitreIcs]
        },
        asset.id
      );
    }

    if (isRemoteAccessAsset(asset)) {
      const reachableControlAssets = project.assets.filter((target) => {
        if (!isControlZone(target)) {
          return false;
        }
        return findReachability(project, asset.id, target.id).reachable;
      });

      if (reachableControlAssets.length > 0) {
        const hasJumpPath = project.conduits.some(
          (conduit) =>
            conduit.jumpHostRequired &&
            (conduit.source === asset.id || conduit.target === asset.id || reachableControlAssets.some((target) => conduit.target === target.id))
        );
        addFinding(
          findings,
          {
            category: "remoteAccess",
            severity: hasJumpPath ? "high" : "critical",
            title: "Remote access can reach control assets",
            detail: `${asset.name} can reach ${reachableControlAssets.length} Level 2, Level 1, Level 0, or safety asset(s).`,
            remediation: "Constrain remote support to approved jump hosts, named sessions, limited protocols, maintenance windows, and monitored conduits.",
            affectedAssetIds: [asset.id, ...reachableControlAssets.map((target) => target.id)],
            affectedConduitIds: project.conduits.filter((conduit) => conduit.source === asset.id || conduit.target === asset.id).map((conduit) => conduit.id),
            references: [standardReferences.nist80082, standardReferences.mitreIcs]
          },
          asset.id
        );
      }
    }

    // `controls.backups` asks whether there is a backup programme; `backupStatus` asks what
    // evidence exists for it. They were OR'd into one high finding, which treated "unknown" — the
    // default nobody had overridden — as equivalent to "missing", so assets explicitly given a
    // backup programme still raised a high finding. Distinguishing asserted from evidenced is the
    // posture this tool sells, so the false positive becomes a lesser, truer finding.
    if (asset.criticality === "critical" && asset.type !== "field-device") {
      if (!asset.controls.backups || asset.backupStatus === "missing") {
        addFinding(
          findings,
          {
            category: "resilience",
            severity: "high",
            title: "Critical asset has no backup",
            detail: `${asset.name} is critical and has no recorded backup programme.`,
            remediation: "Establish recoverable configuration backups with offline copies, restore testing, and owner accountability.",
            affectedAssetIds: [asset.id],
            affectedConduitIds: [],
            references: [standardReferences.nist80082]
          },
          asset.id
        );
      } else if (asset.backupStatus === "unknown") {
        addFinding(
          findings,
          {
            category: "resilience",
            severity: "low",
            title: "Backup evidence not recorded",
            detail: `${asset.name} has a backup programme, but whether a restore has been verified is not recorded.`,
            remediation: "Record the backup status — configured, or verified by a tested restore — so resilience rests on evidence rather than assertion.",
            affectedAssetIds: [asset.id],
            affectedConduitIds: [],
            references: [standardReferences.nist80082]
          },
          `${asset.id}-backup-evidence`
        );
      }
    }

    if (asset.lifecycleStatus === "obsolete" && isControlZone(asset)) {
      addFinding(
        findings,
        {
          category: "legacyExposure",
          severity: asset.criticality === "critical" ? "critical" : "high",
          title: "Unsupported control-zone asset",
          detail: `${asset.name} is marked obsolete or unsupported in a control or safety zone.`,
          remediation: "Reduce exposure, document compensating controls, plan replacement, and verify backups before any change window.",
          affectedAssetIds: [asset.id],
          affectedConduitIds: project.conduits
            .filter((conduit) => conduit.source === asset.id || conduit.target === asset.id)
            .map((conduit) => conduit.id),
          references: [standardReferences.nist80082]
        },
        `${asset.id}-lifecycle`
      );
    }

    if (!asset.controls.defaultCredentialsDisabled && asset.type !== "field-device") {
      addFinding(
        findings,
        {
          category: "identity",
          severity: asset.criticality === "critical" ? "critical" : "high",
          title: "Default credentials not confirmed disabled",
          detail: `${asset.name} does not have default credential removal marked as complete.`,
          remediation: "Remove vendor defaults, disable shared accounts where possible, and document break-glass exceptions.",
          affectedAssetIds: [asset.id],
          affectedConduitIds: [],
          references: [standardReferences.nist80082, standardReferences.mitreIcs]
        },
        asset.id
      );
    }

    const legacy = asset.protocols.filter((protocol) => legacyProtocols.has(protocol.trim().toLowerCase()));
    if (legacy.length > 0 && isControlZone(asset)) {
      addFinding(
        findings,
        {
          category: "legacyExposure",
          severity: asset.criticality === "critical" ? "high" : "medium",
          title: "Legacy or cleartext protocol exposure",
          detail: `${asset.name} uses ${legacy.join(", ")} in a control or safety zone.`,
          remediation: "Restrict legacy protocols to necessary peers, inspect at conduits, remove unused services, and prefer secure alternatives where supported.",
          affectedAssetIds: [asset.id],
          affectedConduitIds: project.conduits
            .filter((conduit) => conduit.source === asset.id || conduit.target === asset.id)
            .map((conduit) => conduit.id),
          references: [standardReferences.nist80082, standardReferences.mitreIcs]
        },
        `${asset.id}-${legacy.join("-")}`
      );
    }

    const missing: string[] = [];
    if (!asset.ipAddress.trim()) {
      missing.push("IP address");
    }
    if (!networkDocumented(asset, subnetsById)) {
      missing.push("network segment");
    }
    if (!asset.owner.trim()) {
      missing.push("owner");
    }
    if (asset.protocols.length === 0) {
      missing.push("protocols");
    }
    if (missing.length > 0) {
      addFinding(
        findings,
        {
          category: "documentation",
          severity: "low",
          // Naming what is actually absent, rather than the old catch-all "owner, IP/VLAN, or
          // protocol metadata", so the finding is actionable without opening the inspector.
          detail: `${asset.name} is missing ${listAnd(missing)}.`,
          title: "Asset documentation incomplete",
          remediation: "Complete the asset record so ratings and remediation can be traced to responsible owners and allowed services.",
          affectedAssetIds: [asset.id],
          affectedConduitIds: [],
          references: [standardReferences.nist80082]
        },
        asset.id
      );
    }
  }

  const securityLevels = assessSecurityLevels(project, project.zoneTargets);
  for (const zoneSL of securityLevels.zones) {
    // A zone nobody declared assets in is not a weakness — it is simply not part of this model.
    if (!zoneSL.modelled || zoneSL.achieved >= zoneSL.target) {
      continue;
    }
    const zoneDef = getZone(zoneSL.zone);
    const limiting = zoneSL.limiting
      .map((fr) => foundationalRequirements.find((item) => item.id === fr)?.label ?? fr)
      .join(", ");
    addFinding(
      findings,
      {
        category: "segmentation",
        severity: zoneSL.target - zoneSL.achieved >= 2 ? "high" : "medium",
        title: `Modeled 62443 FR signal below target (level ${zoneSL.achieved} vs SL-T ${zoneSL.target})`,
        detail: `${zoneDef.levelLabel} ${zoneDef.name} has an architecture-derived signal of ${zoneSL.achieved} against a target of SL ${zoneSL.target}. Limiting modeled requirement(s): ${limiting}. This is not a formal SL-A.`,
        remediation:
          "Review the limiting Foundational Requirement(s), collect evidence against the applicable 62443-3-3 requirements, and strengthen the controls or conduit posture that hold the modeled signal down.",
        affectedAssetIds: project.assets.filter((asset) => asset.zone === zoneSL.zone).map((asset) => asset.id),
        affectedConduitIds: [],
        references: [standardReferences.isa62443]
      },
      `sl-${zoneSL.zone}`
    );
  }

  const categoryScores = Object.keys(categoryWeights).map((categoryKey) => {
    const category = categoryKey as ScoreCategory;
    const inCategory = findings.filter((finding) => finding.category === category);
    // Each finding removes a share of the credit the category still holds, rather than a flat
    // number of points off 100. Subtraction was unbounded and the rules fire per asset, so a
    // category floored at 0 after a handful of findings — after which more problems were
    // invisible and fixing one was worth nothing until the last one cleared.
    const retained = inCategory.reduce((product, finding) => product * (1 - severityDeduction[finding.severity] / 100), 1);
    const score = Math.round(100 * retained);
    const count = inCategory.length;
    return {
      category,
      label: categoryLabels[category],
      score,
      summary: count === 0 ? "No issues detected in the declared model." : `${count} finding${count === 1 ? "" : "s"} requiring review.`
    };
  });

  const overallScore = Math.round(
    categoryScores.reduce((total, category) => total + category.score * categoryWeights[category.category], 0)
  );

  const coverage: AssessmentCoverage = {
    assets: project.assets.length,
    conduits: project.conduits.length,
    zonesModelled: securityLevels.zones.filter((zone) => zone.modelled).length,
    sufficient: project.assets.length >= MIN_RATEABLE_ASSETS && project.conduits.length >= MIN_RATEABLE_CONDUITS
  };

  return {
    // Below the threshold the score is meaningless rather than good: no assets means no findings,
    // which means every category sits at 100. Reporting that as "Strong" congratulated anyone who
    // opened a blank project, and the number was carried into exports and share links too.
    overallScore: coverage.sufficient ? overallScore : 0,
    band: coverage.sufficient ? scoreBand(overallScore) : "insufficient",
    categoryScores,
    coverage,
    findings: findings
      .map((finding) => ({ ...finding, techniques: techniquesForCategory(finding.category) }))
      .sort((a, b) => severityDeduction[b.severity] - severityDeduction[a.severity]),
  };
}
