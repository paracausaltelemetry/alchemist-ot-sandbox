import type { ScoreCategory } from "../models/types";

/**
 * A curated slice of MITRE ATT&CK for ICS — the techniques this tool can reason about from a
 * declared architecture. Each finding category maps to the techniques its weakness plausibly
 * enables, so the assessment shows a threat-informed "exposure" view rather than name-dropping
 * the framework. Technique → tactic assignments follow ATT&CK for ICS.
 */

export interface IcsTactic {
  id: string;
  name: string;
}

export interface IcsTechnique {
  id: string;
  name: string;
  tactic: string;
  formerIds?: string[];
}

export const ATTACK_ICS_VERSION = "19.1";
export const ATTACK_ICS_REVIEWED = "2026-07-11";
export const ATTACK_ICS_MATRIX_URL = "https://attack.mitre.org/matrices/ics/";

export const icsTactics: IcsTactic[] = [
  { id: "initial-access", name: "Initial Access" },
  { id: "lateral-movement", name: "Lateral Movement" },
  { id: "command-and-control", name: "Command & Control" },
  { id: "evasion", name: "Evasion" },
  { id: "impair-process-control", name: "Impair Process Control" },
  { id: "inhibit-response", name: "Inhibit Response Function" },
  { id: "impact", name: "Impact" }
];

export const icsTechniques: IcsTechnique[] = [
  { id: "T0822", name: "External Remote Services", tactic: "initial-access" },
  { id: "T0883", name: "Internet Accessible Device", tactic: "initial-access" },
  { id: "T0886", name: "Remote Services", tactic: "lateral-movement" },
  {
    id: "T1694.001",
    name: "Insecure Credentials: Default Credentials",
    tactic: "lateral-movement",
    formerIds: ["T0812"]
  },
  { id: "T0859", name: "Valid Accounts", tactic: "lateral-movement" },
  { id: "T0866", name: "Exploitation of Remote Services", tactic: "lateral-movement" },
  { id: "T0843", name: "Program Download", tactic: "lateral-movement" },
  { id: "T0885", name: "Commonly Used Port", tactic: "command-and-control" },
  { id: "T0869", name: "Standard Application Layer Protocol", tactic: "command-and-control" },
  { id: "T0872", name: "Indicator Removal on Host", tactic: "evasion" },
  {
    id: "T1692.002",
    name: "Unauthorized Message: Reporting Message",
    tactic: "impair-process-control",
    formerIds: ["T0856"]
  },
  {
    id: "T1692.001",
    name: "Unauthorized Message: Command Message",
    tactic: "impair-process-control",
    formerIds: ["T0855"]
  },
  { id: "T0814", name: "Denial of Service", tactic: "inhibit-response" },
  { id: "T0815", name: "Denial of View", tactic: "inhibit-response" },
  { id: "T0880", name: "Loss of Safety", tactic: "impact" },
  { id: "T0837", name: "Loss of Protection", tactic: "impact" },
  { id: "T0826", name: "Loss of Availability", tactic: "impact" },
  { id: "T0827", name: "Loss of Control", tactic: "impact" }
];

const techniqueById = new Map(icsTechniques.map((technique) => [technique.id, technique]));

export function getTechnique(id: string): IcsTechnique | undefined {
  return techniqueById.get(id);
}

const categoryTechniques: Record<ScoreCategory, string[]> = {
  segmentation: ["T0886", "T0843", "T0885"],
  remoteAccess: ["T0822", "T0883", "T0886"],
  identity: ["T1694.001", "T0859"],
  monitoring: ["T0872", "T1692.002"],
  legacyExposure: ["T0866", "T1692.001", "T0869"],
  resilience: ["T0826", "T0827"],
  safetyImpact: ["T0880", "T0837", "T0814"],
  documentation: []
};

/** ATT&CK for ICS technique IDs plausibly enabled by a finding of the given category. */
export function techniquesForCategory(category: ScoreCategory): string[] {
  return categoryTechniques[category] ?? [];
}
