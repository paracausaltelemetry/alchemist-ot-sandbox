import type { CafObjectiveId, CafPrincipleId } from "../models/types";

export interface CafObjective {
  id: CafObjectiveId;
  title: string;
}

export interface CafPrinciple {
  id: CafPrincipleId;
  objective: CafObjectiveId;
  title: string;
  summary: string;
  /** Consultancy knowledge base: what "good" looks like for this principle in an OT/CNI context. */
  otGuidance: string;
  references: string[];
}

export const cafObjectives: CafObjective[] = [
  { id: "A", title: "Managing security risk" },
  { id: "B", title: "Protecting against cyber attack" },
  { id: "C", title: "Detecting cyber security events" },
  { id: "D", title: "Minimising the impact of incidents" }
];

export const cafPrinciples: CafPrinciple[] = [
  {
    id: "A1",
    objective: "A",
    title: "Governance",
    summary: "Board-level ownership and accountability for the security of networks and systems supporting the essential function.",
    otGuidance:
      "Name a senior accountable owner for OT cyber risk who understands that safety and availability come first. Put OT explicitly in scope of the security governance framework, with policies, decision rights and assurance reporting.",
    references: ["NCSC CAF Principle A1", "IEC 62443-2-1"]
  },
  {
    id: "A2",
    objective: "A",
    title: "Risk management",
    summary: "A proportionate, documented process to identify, assess and treat risks to the essential function.",
    otGuidance:
      "Use a consequence-led (safety/availability) OT risk method per IEC 62443-3-2 and NIST SP 800-82. Maintain a risk register with explicit treatment decisions, owners and residual risk, not just a list of findings.",
    references: ["NCSC CAF Principle A2", "IEC 62443-3-2", "NIST SP 800-82"]
  },
  {
    id: "A3",
    objective: "A",
    title: "Asset management",
    summary: "Everything required to operate the essential function is determined and understood.",
    otGuidance:
      "Maintain a complete, current inventory of OT assets, connections, protocols and data flows. You cannot protect what you cannot see; capture make/model/firmware, owner, criticality and network address.",
    references: ["NCSC CAF Principle A3", "NIST SP 800-82", "CISA OT asset inventory guidance"]
  },
  {
    id: "A4",
    objective: "A",
    title: "Supply chain",
    summary: "Risks to the essential function from the supply chain are understood and managed.",
    otGuidance:
      "Understand and manage risk from integrators, OEMs and vendor remote access. Contractually require security, broker all vendor access through a monitored jump host with MFA, and time-box it.",
    references: ["NCSC CAF Principle A4", "IEC 62443-2-4"]
  },
  {
    id: "B1",
    objective: "B",
    title: "Service protection policies, processes & procedures",
    summary: "Policies and processes that secure the essential function are defined, communicated and followed.",
    otGuidance:
      "Define and use OT-appropriate security procedures (secure configuration baselines, change control / management of change, and removable-media controls) that engineers can actually follow in the plant.",
    references: ["NCSC CAF Principle B1", "IEC 62443-2-1"]
  },
  {
    id: "B2",
    objective: "B",
    title: "Identity and access control",
    summary: "Access to networks and systems supporting the essential function is controlled.",
    otGuidance:
      "Enforce least privilege, remove or change default credentials, and require MFA for remote and privileged access. Broker administrative access and review accounts regularly.",
    references: ["NCSC CAF Principle B2", "IEC 62443-3-3 FR1/FR2", "NIST SP 800-82"]
  },
  {
    id: "B3",
    objective: "B",
    title: "Data security",
    summary: "Data important to the essential function is protected from actions that could cause an adverse impact.",
    otGuidance:
      "Avoid cleartext legacy protocols across trust boundaries; encrypt and inspect where feasible, and protect the integrity of control and configuration data in transit and at rest.",
    references: ["NCSC CAF Principle B3", "IEC 62443-3-3 FR4"]
  },
  {
    id: "B4",
    objective: "B",
    title: "System security",
    summary: "Networks and systems are protected from cyber attack.",
    otGuidance:
      "Apply secure configuration, manage patching and end-of-life equipment, remove unnecessary functionality, and protect system integrity. Compensate where legacy assets cannot be patched.",
    references: ["NCSC CAF Principle B4", "IEC 62443-3-3 FR3", "NIST SP 800-82"]
  },
  {
    id: "B5",
    objective: "B",
    title: "Resilient networks and systems",
    summary: "The essential function is protected through resilient networks and systems.",
    otGuidance:
      "Design segmented, defensible networks (Purdue zones and tightly controlled conduits) so a compromise is contained and cannot cascade to the essential function. Restrict and inspect cross-boundary flows.",
    references: ["NCSC CAF Principle B5", "IEC 62443-3-3 FR5", "NIST SP 800-82"]
  },
  {
    id: "B6",
    objective: "B",
    title: "Staff awareness and training",
    summary: "Staff have the awareness, knowledge and skills to support the security of the essential function.",
    otGuidance:
      "Give OT engineers and operators role-appropriate security awareness and training, covering secure operating practices, removable media, and how to recognise and report incidents.",
    references: ["NCSC CAF Principle B6"]
  },
  {
    id: "C1",
    objective: "C",
    title: "Security monitoring",
    summary: "Capabilities to monitor networks and systems to detect potential security problems.",
    otGuidance:
      "Deploy passive, OT-aware network monitoring and centralise logging from OT hosts and conduits. Define and tune use cases for the OT environment without disrupting the process.",
    references: ["NCSC CAF Principle C1", "IEC 62443-3-3 FR6", "NIST SP 800-82"]
  },
  {
    id: "C2",
    objective: "C",
    title: "Proactive security event discovery",
    summary: "Detecting events that evade standard monitoring, e.g. through threat hunting.",
    otGuidance:
      "Proactively review anomalies and hunt for activity that signature-based monitoring misses, using methods proportionate to the OT environment and its threat model.",
    references: ["NCSC CAF Principle C2"]
  },
  {
    id: "D1",
    objective: "D",
    title: "Response and recovery planning",
    summary: "Well-defined and tested incident response and recovery capabilities.",
    otGuidance:
      "Maintain OT-specific incident response and recovery plans, validated backups of control logic and configurations, and a tested ability to operate and restore the essential function.",
    references: ["NCSC CAF Principle D1", "IEC 62443-3-3 FR7", "NIST SP 800-82"]
  },
  {
    id: "D2",
    objective: "D",
    title: "Lessons learned",
    summary: "Learning from incidents and near misses to improve security.",
    otGuidance:
      "Run post-incident reviews and exercises, and feed the lessons back into OT risk management, controls and training so resilience improves over time.",
    references: ["NCSC CAF Principle D2"]
  }
];

const byId = new Map(cafPrinciples.map((principle) => [principle.id, principle]));

export function cafPrinciple(id: CafPrincipleId): CafPrinciple {
  const principle = byId.get(id);
  if (!principle) {
    throw new Error(`Unknown CAF principle: ${id}`);
  }
  return principle;
}

export function cafPrinciplesForObjective(objective: CafObjectiveId): CafPrinciple[] {
  return cafPrinciples.filter((principle) => principle.objective === objective);
}
