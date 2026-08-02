import { nativeSecurityNote, protocolFamilies, transportLabel } from "./protocols";

export type KbCategory = "Frameworks" | "Asset & risk" | "Architecture" | "Operations" | "Sector";

/**
 * Generated from `protocolFamilies` rather than hand-written, so the published cheat sheet cannot
 * drift from the model the engine actually scores against. It was already wrong in three places
 * when it was a literal.
 */
const protocolCheatSheetRows = protocolFamilies
  .filter((family) => family.transport.length > 0)
  .map((family) => [
    family.label,
    family.ports.length > 0 ? family.ports.join(" / ") : "—",
    transportLabel(family.transport),
    nativeSecurityNote[family.nativeSecurity]
  ]);

/** The kind of resource; drives how the library groups and renders a topic. */
export type KbKind = "concept" | "guide" | "checklist" | "cheatsheet" | "resource";

export interface KbSection {
  heading: string;
  points: string[];
}

export interface KbTable {
  columns: string[];
  rows: string[][];
}

export interface KbLink {
  label: string;
  url: string;
  note?: string;
}

export interface KbTopic {
  id: string;
  title: string;
  /** Defaults to "concept" when omitted (see `topicKind`). */
  kind?: KbKind;
  category: KbCategory;
  summary: string;
  sections: KbSection[];
  table?: KbTable;
  links?: KbLink[];
  references: string[];
}

export const kbCategories: KbCategory[] = ["Frameworks", "Asset & risk", "Architecture", "Operations", "Sector"];

export const kbKindGroups: Array<{ kind: KbKind; label: string }> = [
  { kind: "concept", label: "Concepts & frameworks" },
  { kind: "guide", label: "Guides & playbooks" },
  { kind: "checklist", label: "Checklists & templates" },
  { kind: "cheatsheet", label: "Cheat-sheets" },
  { kind: "resource", label: "Resources & links" }
];

export function topicKind(topic: KbTopic): KbKind {
  return topic.kind ?? "concept";
}

/**
 * A browsable OT reference library for engineers and consultants; frameworks, asset
 * management, architecture and operations. Static, data-driven so topics are easy to extend.
 */
export const knowledgeBase: KbTopic[] = [
  {
    id: "asset-registers",
    title: "OT asset registers & inventory",
    category: "Asset & risk",
    summary:
      "A complete, current inventory of OT assets, connections and data flows is the foundation of every framework; you cannot protect, patch or assess what you cannot see.",
    sections: [
      {
        heading: "What to capture per asset",
        points: [
          "Identity: name/tag, function, criticality to the essential function.",
          "Make, model, firmware/OS version and lifecycle status (supported / limited / end-of-life).",
          "Network: IP/MAC, VLAN/subnet, Purdue zone and the conduits it talks over.",
          "Protocols and exposed services; owner and physical location/site area.",
          "Security posture: patch level, backups, MFA, default-credential status."
        ]
      },
      {
        heading: "How to build and keep it current",
        points: [
          "Prefer passive discovery (SPAN/TAP with a tool like Zeek) to avoid disturbing the process.",
          "Use active scanning only with care and change control; enrich with vendor exports and physical walkdowns.",
          "Map data flows, not just hosts; conduits and trust boundaries matter as much as assets.",
          "Tie updates to management-of-change so the register does not drift."
        ]
      },
      {
        heading: "Common pitfalls",
        points: [
          "Stale inventories, missing Level 0/1 field devices, and undocumented vendor/remote connections.",
          "Spreadsheets with no owner; no link from assets to risks or findings."
        ]
      }
    ],
    references: ["NCSC CAF Principle A3", "ISA/IEC 62443-2-1", "NIST SP 800-82 Rev. 3", "CISA OT asset inventory guidance"]
  },
  {
    id: "iec-62443",
    title: "ISA/IEC 62443 for OT",
    category: "Frameworks",
    summary:
      "The international series for securing Industrial Automation and Control Systems (IACS). It defines zones and conduits, Security Levels, and requirements for asset owners, integrators and product suppliers.",
    sections: [
      {
        heading: "Key parts of the series",
        points: [
          "2-1: establishing an IACS security programme (the asset owner's management system).",
          "2-4: security requirements for service providers / integrators.",
          "3-2: risk assessment, and partitioning the system into zones and conduits.",
          "3-3: system security requirements and Security Levels (SL).",
          "4-1 / 4-2: secure product development lifecycle and component requirements."
        ]
      },
      {
        heading: "Zones, conduits & Security Levels",
        points: [
          "Group assets of similar risk into zones; control every flow between zones through a defined conduit.",
          "Each zone has a target SL (SL-T) and an achieved SL (SL-A) on a 0–4 scale.",
          "A formal SL-A requires assessment of applicable 62443-3-3 requirements and enhancements across FR1–FR7; architecture alone is not sufficient evidence."
        ]
      },
      {
        heading: "The seven Foundational Requirements",
        points: [
          "FR1 Identification & authentication, FR2 Use control, FR3 System integrity, FR4 Data confidentiality.",
          "FR5 Restricted data flow, FR6 Timely response to events, FR7 Resource availability."
        ]
      }
    ],
    references: ["ISA/IEC 62443-3-2", "ISA/IEC 62443-3-3", "ISA/IEC 62443-2-1"]
  },
  {
    id: "nist-csf-2",
    title: "NIST CSF 2.0 in OT",
    category: "Frameworks",
    summary:
      "The NIST Cybersecurity Framework 2.0 (2024) organises outcomes under six functions. The new Govern function makes it a strong fit for the governance and risk side of OT/GRC.",
    sections: [
      {
        heading: "The six functions",
        points: [
          "Govern (new): organisational context, risk management strategy, roles, policy and supply chain.",
          "Identify: assets, risk and improvement opportunities.",
          "Protect: safeguards (access control, data security, platform & resilience).",
          "Detect: find and analyse possible attacks and compromises.",
          "Respond & Recover: act on detected incidents and restore operations."
        ]
      },
      {
        heading: "Applying it to OT",
        points: [
          "Lead with consequence: safety and availability outrank confidentiality.",
          "Use Profiles to express the target vs current state for a specific facility or mission.",
          "Pair CSF 2.0 (the what) with NIST SP 800-82 (the how) for OT-specific control tailoring."
        ]
      }
    ],
    references: ["NIST CSF 2.0", "NIST SP 800-82 Rev. 3"]
  },
  {
    id: "nist-800-82",
    title: "NIST SP 800-82 (OT security)",
    category: "Frameworks",
    summary:
      "The US guide to Operational Technology security. Revision 3 (2023) broadened it from ICS to OT, aligned it to the CSF, and provides an OT overlay of SP 800-53 controls.",
    sections: [
      {
        heading: "What it gives you",
        points: [
          "A clear treatment of how OT differs from IT (availability, safety, legacy, real-time constraints).",
          "OT risk management, architecture and a tailored control baseline (the OT overlay to SP 800-53).",
          "Guidance you can cite when justifying compensating controls for assets that cannot be patched."
        ]
      }
    ],
    references: ["NIST SP 800-82 Rev. 3", "NIST SP 800-53"]
  },
  {
    id: "purdue-segmentation",
    title: "Purdue model & network segmentation",
    category: "Architecture",
    summary:
      "The Purdue reference architecture layers an OT network from the process (Level 0) up to enterprise IT (Level 5), with an IT/OT DMZ in between. Segmentation contains compromise and protects the essential function.",
    sections: [
      {
        heading: "The levels",
        points: [
          "L0 process (sensors/actuators), L1 basic control (PLC/RTU), L2 supervisory (SCADA/HMI).",
          "L3 operations (historians, MES, OT services), L3.5 IT/OT DMZ, L4–L5 business / enterprise IT."
        ]
      },
      {
        heading: "Segmentation techniques",
        points: [
          "Deny-by-default firewalls between zones; publish services through the IDMZ, never direct IT→control.",
          "Broker administrative access through jump hosts; use data diodes for one-way historian/telemetry flows.",
          "Keep safety systems (SIS) independent of the basic process control system."
        ]
      }
    ],
    references: ["ISA-95 / Purdue model", "ISA/IEC 62443-3-2", "NIST SP 800-82 Rev. 3"]
  },
  {
    id: "secure-remote-access",
    title: "Secure remote access for OT",
    category: "Operations",
    summary:
      "Vendor and engineer remote access is one of the most common OT intrusion paths. Broker, authenticate, time-box and monitor every session.",
    sections: [
      {
        heading: "Good practice",
        points: [
          "No direct vendor access to control assets; terminate in the IDMZ and broker via a jump host / PAM.",
          "Enforce MFA, least privilege and named accounts; remove shared and default credentials.",
          "Make access on-demand and time-boxed; record and monitor sessions; review and revoke promptly."
        ]
      }
    ],
    references: ["NCSC CAF Principles A4 & B2", "ISA/IEC 62443-3-3", "CISA remote access guidance"]
  },
  {
    id: "ot-protocols",
    title: "OT protocols & legacy exposure",
    category: "Architecture",
    summary:
      "Most industrial protocols were designed for trusted networks and lack native authentication or encryption. Treat them as fragile and protect them with the network around them.",
    sections: [
      {
        heading: "Common protocols",
        points: [
          "Modbus TCP, DNP3, EtherNet/IP, PROFINET, S7, IEC 61850 (MMS/GOOSE), BACnet; generally no built-in security.",
          "OPC UA and HTTPS can be secured (certificates, encryption); verify they are actually configured."
        ]
      },
      {
        heading: "Mitigations",
        points: [
          "Restrict each protocol to the minimum necessary peers and ports; deny across trust boundaries.",
          "Monitor for unauthorised command messages and unexpected engineering traffic.",
          "Prefer secured variants (e.g. OPC UA with security policies) where the equipment supports them."
        ]
      }
    ],
    references: ["ISA/IEC 62443-3-3 FR3/FR4", "NIST SP 800-82 Rev. 3", "MITRE ATT&CK for ICS"]
  },
  {
    id: "patch-vuln-eol",
    title: "Patching, vulnerabilities & end-of-life",
    category: "Operations",
    summary:
      "OT patching is constrained by availability, vendor validation and downtime windows. Manage vulnerabilities by risk, and compensate where patching is not possible.",
    sections: [
      {
        heading: "Practical approach",
        points: [
          "Track advisories (CISA ICS-CERT, vendor PSIRTs) against your asset register.",
          "Patch in approved maintenance windows with vendor sign-off; test first where feasible.",
          "For end-of-life or un-patchable assets, apply compensating controls: isolation, allow-listing, monitoring.",
          "Record the residual risk and treatment decision rather than leaving it implicit."
        ]
      }
    ],
    references: ["NIST SP 800-82 Rev. 3", "ISA/IEC 62443-2-3 (patch management)", "CISA ICS advisories"]
  },
  {
    id: "monitoring-detection",
    title: "OT monitoring & detection",
    category: "Operations",
    summary:
      "You can only respond to what you can see. OT-aware, mostly-passive monitoring detects intrusions and abnormal control activity without disturbing the process.",
    sections: [
      {
        heading: "What good looks like",
        points: [
          "Passive network monitoring (SPAN/TAP) that understands OT protocols and baselines normal traffic.",
          "Centralised, time-synced logging from OT hosts, jump hosts and security devices.",
          "Use cases tuned for OT: new devices, unexpected engineering connections, unauthorised commands.",
          "Proactive review / threat hunting for what signatures miss (CAF C2)."
        ]
      }
    ],
    references: ["NCSC CAF Principles C1 & C2", "ISA/IEC 62443-3-3 FR6", "NIST SP 800-82 Rev. 3"]
  },
  {
    id: "incident-response",
    title: "OT incident response & recovery",
    category: "Operations",
    summary:
      "OT incident response must account for safety and the ability to keep operating. Plan, exercise and validate recovery before you need it.",
    sections: [
      {
        heading: "Key elements",
        points: [
          "OT-specific response plans with clear roles, safe-state / safe-shutdown procedures and decision authority.",
          "Validated, offline backups of control logic, configurations and golden images, plus tested restoration.",
          "Exercises and post-incident reviews that feed lessons back into controls and training (CAF D1/D2).",
          "Engagement with the regulator / national authority where the essential function is affected."
        ]
      }
    ],
    references: ["NCSC CAF Principles D1 & D2", "ISA/IEC 62443-3-3 FR7", "NIST SP 800-82 Rev. 3"]
  },
  {
    id: "supply-chain",
    title: "Supply chain & vendor risk",
    category: "Asset & risk",
    summary:
      "Integrators, OEMs and the components they ship introduce risk you do not directly control. Understand it, require security contractually, and manage vendor access.",
    sections: [
      {
        heading: "Managing the risk",
        points: [
          "Know your suppliers and the access and components they provide to the essential function.",
          "Set security expectations in contracts; prefer products built to a secure development lifecycle (62443-4-1).",
          "Broker and monitor all vendor remote access; review what integrators leave behind after commissioning.",
          "Consider component provenance and firmware integrity (62443-4-2)."
        ]
      }
    ],
    references: ["NCSC CAF Principle A4", "ISA/IEC 62443-2-4", "ISA/IEC 62443-4-1 / 4-2"]
  },
  {
    id: "nuclear-high-consequence-ot",
    category: "Sector",
    title: "Nuclear & high-consequence OT",
    summary:
      "Illustrative reference only. High-consequence OT (nuclear, major-hazard) layers cyber security on top of safety, under sector regulation and international guidance.",
    sections: [
      {
        heading: "Regulation & guidance",
        points: [
          "IAEA Nuclear Security Series; NSS 17 (computer security at nuclear facilities), NSS 42-G and NSS 33-T.",
          "UK: the Office for Nuclear Regulation (ONR) takes a CAF-based approach to cyber security & information assurance (CS&IA), under the Security Assessment Principles (SyAPs) and NISR 2003.",
          "Security measures must never undermine nuclear safety; the two are managed together."
        ]
      },
      {
        heading: "Defining principles",
        points: [
          "Graded approach: protection proportionate to consequence and an asset's role in safety and security functions.",
          "Defence in depth, and protection of the 'vital digital assets' that support safety functions.",
          "Strong segregation of safety I&C from lower-assurance systems; one-way data flows out of the highest-assurance zones."
        ]
      }
    ],
    references: ["IAEA NSS 17", "IAEA NSS 42-G", "ONR SyAPs / CAF (CS&IA)", "NISR 2003"]
  },
  {
    id: "safety-vs-security",
    category: "Architecture",
    title: "Safety vs security & safety I&C",
    summary:
      "Safety instrumented systems protect people and plant deterministically; security protects them from deliberate interference. In high-consequence OT the two are independent but complementary.",
    sections: [
      {
        heading: "Keep safety independent",
        points: [
          "Safety I&C / SIS should be independent of the basic process control system; separate logic solver and network.",
          "Prefer simple, deterministic, well-understood safety logic over feature-rich connectivity.",
          "Where the safety layer must publish data, use one-way gateways / data diodes so it cannot be written to from outside."
        ]
      },
      {
        heading: "Manage them together",
        points: [
          "A security change must never invalidate a safety case; involve safety engineering in OT security decisions.",
          "Bring OT security into management-of-change and functional safety assessment."
        ]
      }
    ],
    references: ["IEC 61511 (SIS)", "ISA/IEC 62443-3-3 FR5", "IAEA NSS 17"]
  },
  {
    id: "guide-asset-inventory",
    kind: "guide",
    category: "Asset & risk",
    title: "Build an OT asset inventory",
    summary: "A step-by-step approach to discovering and recording OT assets and data flows without disturbing the process.",
    sections: [
      {
        heading: "Steps",
        points: [
          "1. Define scope and the essential function; agree what 'in scope' means with operations and safety.",
          "2. Start passive: mirror traffic (SPAN/TAP) into a tool such as Zeek or GRASSMARLIN to enumerate hosts, protocols and flows.",
          "3. Enrich from authoritative sources: vendor/system exports, network diagrams, firewall configs, CMDB.",
          "4. Validate with physical walkdowns for Level 0/1 field devices that are invisible on the network.",
          "5. Record make/model/firmware, owner, criticality, zone/conduit, address and security posture.",
          "6. Use only careful, scheduled, rate-limited active scanning to fill gaps; never blind-scan live control networks.",
          "7. Tie updates to management-of-change so the inventory stays current."
        ]
      }
    ],
    references: ["NCSC CAF A3", "NIST SP 800-82 Rev. 3", "CISA OT asset inventory guidance"]
  },
  {
    id: "guide-purdue-segmentation",
    kind: "guide",
    category: "Architecture",
    title: "Design Purdue zones & conduits",
    summary: "How to partition an OT network into zones and conduits per ISA/IEC 62443-3-2.",
    sections: [
      {
        heading: "Steps",
        points: [
          "1. Group assets of similar risk and function into zones, often aligned to Purdue levels.",
          "2. Identify every required flow between zones and define it as a conduit; deny everything else.",
          "3. Publish IT→OT services through an IT/OT DMZ; never allow direct enterprise→control connections.",
          "4. Set a target Security Level (SL-T) per zone from a risk assessment; design controls to meet it.",
          "5. Broker administrative access via jump hosts; use data diodes for one-way historian/telemetry flows.",
          "6. Document conduit ownership, rules and review dates; remove temporary rules."
        ]
      }
    ],
    references: ["ISA/IEC 62443-3-2", "ISA/IEC 62443-3-3 FR5", "NIST SP 800-82 Rev. 3"]
  },
  {
    id: "guide-remote-access",
    kind: "guide",
    category: "Operations",
    title: "Harden & broker remote access",
    summary: "Make vendor and engineer remote access on-demand, brokered, authenticated and monitored.",
    sections: [
      {
        heading: "Steps",
        points: [
          "1. Terminate all external access in the IT/OT DMZ; no direct path to control assets.",
          "2. Broker every session through a jump host / PAM; named accounts, least privilege, no shared logins.",
          "3. Enforce MFA and remove default and standing credentials.",
          "4. Make access on-demand and time-boxed; require approval and a business justification.",
          "5. Record and monitor sessions; alert on out-of-hours or unexpected engineering activity.",
          "6. Review and revoke access regularly; check what integrators left behind after commissioning."
        ]
      }
    ],
    references: ["NCSC CAF A4 & B2", "ISA/IEC 62443-3-3", "CISA remote access guidance"]
  },
  {
    id: "guide-sl-assessment",
    kind: "guide",
    category: "Frameworks",
    title: "Run an IEC 62443 Security Level assessment",
    summary: "Assess a zone against its target SL using the seven Foundational Requirements and evidence for applicable 62443-3-3 requirements.",
    sections: [
      {
        heading: "Steps",
        points: [
          "1. Confirm zones and conduits, and the target SL (SL-T) per zone from the risk assessment (62443-3-2).",
          "2. Identify the applicable 62443-3-3 system requirements and enhancements under each FR for the zone and its conduits.",
          "3. Collect evidence, record applicability and compensating controls, then determine the level achieved for each FR.",
          "4. Record the gap to SL-T, the limiting FRs and any evidence limitations.",
          "5. Plan remediation against the limiting FRs; re-assess after changes."
        ]
      }
    ],
    references: ["ISA/IEC 62443-3-3", "ISA/IEC 62443-3-2"]
  },
  {
    id: "guide-safe-discovery",
    kind: "guide",
    category: "Operations",
    title: "Safe OT network discovery",
    summary: "Enumerate OT networks without disrupting fragile devices or the process.",
    sections: [
      {
        heading: "Principles",
        points: [
          "Passive first: SPAN/TAP plus a protocol-aware tool (Zeek, GRASSMARLIN) reveals hosts and flows with zero risk.",
          "Treat active scanning as intrusive: legacy PLCs and field devices can crash under aggressive scans.",
          "If you must scan actively; get approval, schedule a window, rate-limit, avoid aggressive timing, and watch the process.",
          "Never run vulnerability scanners against live safety or control systems without explicit sign-off.",
          "Capture results into the asset register and reconcile with walkdowns."
        ]
      }
    ],
    references: ["NIST SP 800-82 Rev. 3", "CISA OT guidance"]
  },
  {
    id: "checklist-asset-register",
    kind: "checklist",
    category: "Asset & risk",
    title: "OT asset register fields",
    summary: "The fields a usable OT asset register should capture.",
    sections: [
      {
        heading: "Per asset",
        points: [
          "Name/tag and function; criticality to the essential function.",
          "Make, model, firmware/OS version and lifecycle status (supported / limited / end-of-life).",
          "Network: IP/MAC, VLAN/subnet, Purdue zone and the conduits it uses.",
          "Protocols and exposed services; physical location / site area.",
          "Owner; patch level; backup status; MFA and default-credential status.",
          "Links to the risks, findings and treatments that affect it."
        ]
      }
    ],
    references: ["NCSC CAF A3", "ISA/IEC 62443-2-1"]
  },
  {
    id: "checklist-remote-access",
    kind: "checklist",
    category: "Operations",
    title: "Secure remote access checklist",
    summary: "Review checklist for OT remote access.",
    sections: [
      {
        heading: "Check",
        points: [
          "No direct external path to control assets; access terminates in the IT/OT DMZ.",
          "Brokered via jump host / PAM with named accounts and least privilege.",
          "MFA enforced; default and shared credentials removed.",
          "Access is on-demand, approved and time-boxed.",
          "Sessions recorded and monitored; alerting on anomalies.",
          "Access list reviewed; dormant and ex-vendor accounts removed."
        ]
      }
    ],
    references: ["NCSC CAF A4 & B2", "ISA/IEC 62443-3-3"]
  },
  {
    id: "checklist-conduit-review",
    kind: "checklist",
    category: "Architecture",
    title: "Conduit / firewall rule review",
    summary: "Review checklist for cross-zone conduits and firewall rules.",
    sections: [
      {
        heading: "Per conduit / rule",
        points: [
          "Documented business justification and owner.",
          "Least privilege: specific source, destination, port and protocol; no any-any.",
          "Direction enforced; one-way where possible (data diode for telemetry out of high-assurance zones).",
          "Inspected and logged at the boundary.",
          "No undocumented or expired temporary rules; review date set.",
          "Cleartext legacy protocols not permitted across trust boundaries."
        ]
      }
    ],
    references: ["ISA/IEC 62443-3-3 FR5", "NCSC CAF B5"]
  },
  {
    id: "checklist-ir-runbook",
    kind: "checklist",
    category: "Operations",
    title: "OT incident response runbook",
    summary: "A template set of steps for an OT cyber incident.",
    sections: [
      {
        heading: "Runbook",
        points: [
          "Prepare: roles, contacts, safe-state procedures, offline backups and a tested recovery plan.",
          "Detect & triage: confirm, classify and assess impact on safety and the essential function.",
          "Contain: isolate affected segments without compromising safety; involve operations and safety engineering.",
          "Eradicate & recover: rebuild from validated golden images / backups; verify integrity before reconnecting.",
          "Communicate: notify management and the regulator / national authority where required.",
          "Review: feed post-incident lessons back into controls and training."
        ]
      }
    ],
    references: ["NCSC CAF D1 & D2", "NIST SP 800-82 Rev. 3"]
  },
  {
    id: "checklist-vendor-onboarding",
    kind: "checklist",
    category: "Asset & risk",
    title: "Vendor / supply-chain onboarding",
    summary: "Checklist for bringing an OT supplier or integrator on board.",
    sections: [
      {
        heading: "Check",
        points: [
          "Security requirements set in the contract, with a right to audit.",
          "Products built to a secure development lifecycle (62443-4-1) where available.",
          "Vendor remote access brokered, MFA'd, time-boxed and monitored.",
          "Component and firmware integrity verified; provenance understood.",
          "Commissioning artefacts (default creds, test accounts, temporary rules) removed at handover."
        ]
      }
    ],
    references: ["NCSC CAF A4", "ISA/IEC 62443-2-4", "ISA/IEC 62443-4-1 / 4-2"]
  },
  {
    id: "cheatsheet-protocols-ports",
    kind: "cheatsheet",
    category: "Architecture",
    title: "OT protocols & ports",
    summary: "Common industrial protocols, their default ports and their security posture.",
    sections: [],
    table: {
      columns: ["Protocol", "Port", "Transport", "Security note"],
      rows: protocolCheatSheetRows
    },
    references: ["ISA/IEC 62443-3-3 FR3/FR4", "NIST SP 800-82 Rev. 3"]
  },
  {
    id: "cheatsheet-attack-ics",
    kind: "cheatsheet",
    category: "Operations",
    title: "MITRE ATT&CK for ICS tactics",
    summary: "The tactics an adversary moves through against industrial control systems.",
    sections: [],
    table: {
      columns: ["Tactic", "What the adversary is doing"],
      rows: [
        ["Initial Access", "Get into the OT environment (remote services, internet-exposed device, supply chain)"],
        ["Execution", "Run code or commands on OT systems"],
        ["Persistence", "Maintain a foothold (modify program or firmware)"],
        ["Privilege Escalation", "Gain higher rights or exploit a vulnerability"],
        ["Evasion", "Avoid detection (indicator removal, rogue master)"],
        ["Discovery", "Map the control network and assets"],
        ["Lateral Movement", "Move toward the process (program download, default credentials)"],
        ["Collection", "Gather process and configuration data"],
        ["Command and Control", "Communicate with the implant"],
        ["Inhibit Response Function", "Disable alarms, safety or protection"],
        ["Impair Process Control", "Manipulate control logic or setpoints"],
        ["Impact", "Loss of control, view, safety or availability"]
      ]
    },
    references: ["MITRE ATT&CK for ICS"]
  },
  {
    id: "cheatsheet-62443-fr",
    kind: "cheatsheet",
    category: "Frameworks",
    title: "IEC 62443 Foundational Requirements",
    summary: "The seven FRs a zone's Security Level is judged against (62443-3-3).",
    sections: [],
    table: {
      columns: ["FR", "Name", "Focus"],
      rows: [
        ["FR1", "Identification & authentication control", "Who/what can access (accounts, MFA)"],
        ["FR2", "Use control", "Least privilege, authorisation, approval"],
        ["FR3", "System integrity", "Patching, hardening, anti-malware, anti-tamper"],
        ["FR4", "Data confidentiality", "Protect data in transit/at rest; no cleartext"],
        ["FR5", "Restricted data flow", "Zones & conduits; segmentation"],
        ["FR6", "Timely response to events", "Monitoring, logging, alerting"],
        ["FR7", "Resource availability", "Backups, resilience, DoS protection"]
      ]
    },
    references: ["ISA/IEC 62443-3-3"]
  },
  {
    id: "cheatsheet-caf",
    kind: "cheatsheet",
    category: "Frameworks",
    title: "NCSC CAF objectives & principles",
    summary: "The four objectives and fourteen principles of the NCSC Cyber Assessment Framework.",
    sections: [],
    table: {
      columns: ["Objective", "Principles"],
      rows: [
        ["A: Managing security risk", "A1 Governance · A2 Risk management · A3 Asset management · A4 Supply chain"],
        [
          "B: Protecting against cyber attack",
          "B1 Policies & processes · B2 Identity & access · B3 Data security · B4 System security · B5 Resilient networks · B6 Staff awareness"
        ],
        ["C: Detecting cyber security events", "C1 Security monitoring · C2 Proactive event discovery"],
        ["D: Minimising the impact", "D1 Response & recovery planning · D2 Lessons learned"]
      ]
    },
    references: ["NCSC Cyber Assessment Framework"]
  },
  {
    id: "cheatsheet-crosswalk",
    kind: "cheatsheet",
    category: "Frameworks",
    title: "Standards crosswalk (62443 / NIST / CAF)",
    summary:
      "How the seven IEC 62443 Foundational Requirements line up with NIST CSF 2.0 functions, NIST SP 800-82r3 / 800-53 control families and NCSC CAF principles. Approximate mappings for orientation, not an official equivalence.",
    sections: [
      {
        heading: "NCSC CAF objectives across the frameworks",
        points: [
          "A Managing security risk: NIST CSF Govern & Identify; IEC 62443-2-1 (security programme) and 62443-3-2 (risk assessment).",
          "B Protecting against cyber attack: NIST CSF Protect; IEC 62443-3-3 FR1 to FR5 and 62443-2-4 (service providers).",
          "C Detecting cyber security events: NIST CSF Detect; IEC 62443-3-3 FR6 (timely response to events).",
          "D Minimising the impact: NIST CSF Respond & Recover; IEC 62443-3-3 FR7 (resource availability)."
        ]
      }
    ],
    table: {
      columns: ["IEC 62443 FR", "NIST CSF 2.0", "NIST SP 800-82 / 800-53", "NCSC CAF"],
      rows: [
        ["FR1 Identification & authentication", "Protect (PR.AA)", "IA, AC", "B2 Identity & access control"],
        ["FR2 Use control", "Protect (PR.AA)", "AC", "B2 Identity & access control"],
        ["FR3 System integrity", "Protect (PR.PS)", "SI, CM", "B4 System security"],
        ["FR4 Data confidentiality", "Protect (PR.DS)", "SC", "B3 Data security"],
        ["FR5 Restricted data flow", "Protect (PR.IR)", "SC-7 boundary protection", "B5 Resilient networks"],
        ["FR6 Timely response to events", "Detect (DE.CM) / Respond (RS)", "AU, SI-4, IR", "C1 Security monitoring"],
        ["FR7 Resource availability", "Recover (RC)", "CP", "B5 / D1 response & recovery"]
      ]
    },
    references: ["ISA/IEC 62443-3-3", "NIST CSF 2.0", "NIST SP 800-82 Rev. 3", "NCSC Cyber Assessment Framework"]
  },
  {
    id: "resource-standards",
    kind: "resource",
    category: "Frameworks",
    title: "Standards & frameworks",
    summary: "Authoritative standards and frameworks for OT/ICS security.",
    sections: [],
    links: [
      {
        label: "ISA/IEC 62443 series (ISA)",
        url: "https://www.isa.org/standards-and-publications/isa-standards/isa-iec-62443-series-of-standards"
      },
      { label: "NIST SP 800-82 Rev. 3: Guide to OT Security", url: "https://csrc.nist.gov/pubs/sp/800/82/r3/final" },
      { label: "NIST Cybersecurity Framework 2.0", url: "https://www.nist.gov/cyberframework" },
      { label: "NCSC Cyber Assessment Framework (CAF)", url: "https://www.ncsc.gov.uk/collection/cyber-assessment-framework" },
      { label: "IAEA Nuclear Security Series", url: "https://www.iaea.org/resources/nuclear-security-series" }
    ],
    references: []
  },
  {
    id: "resource-authorities",
    kind: "resource",
    category: "Operations",
    title: "Authorities, advisories & community",
    summary: "Where to get OT threat intelligence, advisories and learning.",
    sections: [],
    links: [
      { label: "NCSC (UK)", url: "https://www.ncsc.gov.uk/", note: "Guidance & CAF" },
      { label: "CISA: Industrial Control Systems", url: "https://www.cisa.gov/topics/industrial-control-systems", note: "ICS advisories" },
      { label: "MITRE ATT&CK for ICS", url: "https://attack.mitre.org/matrices/ics/" },
      { label: "SANS ICS Security", url: "https://www.sans.org/industrial-control-systems-security/", note: "Training & resources" },
      { label: "ISA Global Cybersecurity Alliance", url: "https://gca.isa.org/" }
    ],
    references: []
  }
];
