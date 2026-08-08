import type { OtProject } from "../models/types";

/**
 * Named "what-if" remediations: pure OtProject -> OtProject transforms that each address a class of
 * finding the scoring engine raises. The simulator applies a chosen set to a working copy and shows
 * the score / risk movement before the user commits it.
 */

export interface Remediation {
  id: string;
  label: string;
  description: string;
  apply: (project: OtProject) => OtProject;
}

function mapAssets(project: OtProject, fn: (asset: OtProject["assets"][number]) => OtProject["assets"][number]): OtProject {
  return { ...project, assets: project.assets.map(fn) };
}

function mapConduits(
  project: OtProject,
  fn: (conduit: OtProject["conduits"][number]) => OtProject["conduits"][number]
): OtProject {
  return { ...project, conduits: project.conduits.map(fn) };
}

export const remediations: Remediation[] = [
  {
    id: "mfa",
    label: "Require MFA on remote access",
    description: "Enable phishing-resistant MFA on every vendor and remote-access point.",
    apply: (project) =>
      mapAssets(project, (asset) =>
        asset.type === "vendor-remote" ? { ...asset, controls: { ...asset.controls, mfa: true } } : asset
      )
  },
  {
    id: "default-creds",
    label: "Remove default credentials",
    description: "Confirm vendor default credentials are removed on every device.",
    apply: (project) =>
      mapAssets(project, (asset) =>
        asset.type === "field-device"
          ? asset
          : { ...asset, controls: { ...asset.controls, defaultCredentialsDisabled: true } }
      )
  },
  {
    id: "inspect-log",
    label: "Inspect and log boundary flows",
    description: "Turn on inspection and logging for every trust-boundary conduit.",
    apply: (project) =>
      mapConduits(project, (conduit) => (conduit.trustBoundary ? { ...conduit, inspected: true, logged: true } : conduit))
  },
  {
    id: "firewall",
    label: "Replace any-any firewall rules",
    description: "Make broad or undocumented boundary rules explicit and owned.",
    apply: (project) =>
      mapConduits(project, (conduit) =>
        conduit.firewallRule === "any-any" || conduit.firewallRule === "unknown"
          ? {
              ...conduit,
              firewallRule: "explicit",
              ruleOwner: conduit.ruleOwner || "OT security",
              businessJustification: conduit.businessJustification || "Documented during what-if planning."
            }
          : conduit
      )
  },
  {
    id: "diode",
    label: "Isolate safety with a data diode",
    description: "Make conduits to the safety system one-way through a data diode.",
    apply: (project) => {
      const safetyIds = new Set(project.assets.filter((asset) => asset.type === "safety-system").map((asset) => asset.id));
      return mapConduits(project, (conduit) => {
        const sourceSafety = safetyIds.has(conduit.source);
        const targetSafety = safetyIds.has(conduit.target);
        if ((sourceSafety || targetSafety) && conduit.control !== "data-diode") {
          return { ...conduit, control: "data-diode", direction: sourceSafety ? "source-to-target" : "target-to-source" };
        }
        return conduit;
      });
    }
  },
  {
    id: "backups",
    label: "Back up critical assets",
    description: "Record verified, recoverable backups for every critical asset.",
    apply: (project) =>
      mapAssets(project, (asset) =>
        asset.criticality === "critical" && asset.type !== "field-device"
          ? { ...asset, controls: { ...asset.controls, backups: true }, backupStatus: "verified" }
          : asset
      )
  },
  {
    id: "retire-obsolete",
    label: "Retire obsolete assets",
    description: "Replace end-of-life equipment in control and safety zones with supported kit.",
    apply: (project) =>
      mapAssets(project, (asset) =>
        asset.lifecycleStatus === "obsolete" ? { ...asset, lifecycleStatus: "supported" } : asset
      )
  }
];

/** Applies the chosen remediations (by id) in order, returning a new project. */
export function applyRemediations(project: OtProject, ids: ReadonlySet<string>): OtProject {
  return remediations.reduce((current, remediation) => (ids.has(remediation.id) ? remediation.apply(current) : current), project);
}
