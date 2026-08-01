import { PROJECT_SCHEMA_VERSION, type OtProject } from "../../models/types";
import { applyLayout, asset, conduit, controls, laneY, type ScenarioMeta } from "./builders";

// Illustrative teaching scenario only — a generic high-consequence facility, NOT based on any real
// site. It shows defence-in-depth good practice (independent safety I&C, a one-way data diode out of
// the safety zone) alongside realistic improvement areas in the balance-of-plant systems.
const project: OtProject = {
  schemaVersion: PROJECT_SCHEMA_VERSION,
  id: "scenario-nuclear",
  name: "Nuclear / High-Consequence (Illustrative)",
  updatedAt: new Date().toISOString(),
  assumptions: [
    { id: "illustrative", label: "Illustrative teaching scenario only: generic, not based on any real facility." },
    { id: "advisory", label: "Advisory model only; not an IAEA, ONR or 62443 assessment." },
    { id: "safety", label: "Safety I&C is independent of the control systems; data leaves the safety zone one-way only." }
  ],
  zoneTargets: { level1: 3, level2: 3, level3: 2 },
  subnets: [
    { id: "sn-it", name: "Corporate IT", cidr: "10.140.0.0/16", vlan: "IT" },
    { id: "sn-bus", name: "Business Systems", cidr: "10.141.0.0/24", vlan: "BUS" },
    { id: "sn-idmz", name: "IT/OT DMZ", cidr: "10.145.0.0/24", vlan: "IDMZ" },
    { id: "sn-ops", name: "Operations", cidr: "10.143.0.0/24", vlan: "OPS-300" },
    { id: "sn-ctrl", name: "Plant Control", cidr: "10.142.10.0/24", vlan: "CTRL-210" },
    { id: "sn-safety", name: "Safety I&C (isolated)", cidr: "10.142.25.0/24", vlan: "SAFETY-225" },
    { id: "sn-bop", name: "Balance of Plant", cidr: "10.142.20.0/24", vlan: "BOP-220" },
    { id: "sn-field", name: "Field Instruments", cidr: "10.142.30.0/24", vlan: "FIELD-230" }
  ],
  assets: [
    asset("nuc-corp", "Corporate IT", "enterprise-it", "level5", 96, laneY.level5, {
      subnetId: "sn-it",
      ipAddress: "10.140.0.0/16",
      protocols: ["HTTPS", "RDP", "SMB"],
      controls: controls.strong
    }),
    asset("nuc-vendor", "Systems Vendor Remote", "vendor-remote", "level5", 672, laneY.level5, {
      ipAddress: "203.0.113.150",
      protocols: ["VPN", "RDP"],
      criticality: "high",
      owner: "Control systems vendor",
      controls: { ...controls.weak, remoteAccessApproved: true }
    }),
    asset("nuc-biz", "Plant Business Systems", "enterprise-it", "level4", 384, laneY.level4, {
      subnetId: "sn-bus",
      ipAddress: "10.141.0.20",
      protocols: ["HTTPS", "SQL"],
      criticality: "high",
      controls: controls.strong
    }),
    asset("nuc-fw", "IT/OT Firewall", "firewall", "level3", 96, laneY.level3, {
      subnetId: "sn-idmz",
      ipAddress: "10.145.0.1",
      criticality: "critical",
      backupStatus: "verified",
      controls: controls.strong
    }),
    asset("nuc-jump", "OT Jump Host", "jump-host", "level3", 384, laneY.level3, {
      subnetId: "sn-idmz",
      ipAddress: "10.145.0.10",
      protocols: ["RDP", "SSH"],
      criticality: "critical",
      backupStatus: "verified",
      controls: controls.strong
    }),
    asset("nuc-hist", "Plant Historian", "historian", "level3", 672, laneY.level3, {
      subnetId: "sn-ops",
      ipAddress: "10.143.0.15",
      protocols: ["OPC UA", "SQL"],
      criticality: "high",
      controls: controls.moderate
    }),
    asset("nuc-dcs", "Plant Control (DCS)", "scada", "level2", 240, laneY.level2, {
      subnetId: "sn-ctrl",
      ipAddress: "10.142.10.20",
      protocols: ["OPC UA", "Modbus TCP"],
      criticality: "critical",
      backupStatus: "configured",
      controls: controls.moderate
    }),
    asset("nuc-mcr", "Main Control Room HMI", "hmi", "level2", 528, laneY.level2, {
      subnetId: "sn-ctrl",
      ipAddress: "10.142.10.40",
      protocols: ["OPC UA", "HTTPS"],
      criticality: "critical",
      backupStatus: "configured",
      controls: controls.moderate
    }),
    asset("nuc-radmon", "Radiation Monitoring", "scada", "level2", 816, laneY.level2, {
      subnetId: "sn-ctrl",
      ipAddress: "10.142.10.60",
      protocols: ["Modbus TCP", "OPC UA"],
      criticality: "critical",
      backupStatus: "configured",
      criticalProcessTag: "Radiological monitoring",
      controls: controls.moderate
    }),
    asset("nuc-ews", "Engineering Workstation", "engineering-workstation", "level2", 1104, laneY.level2, {
      subnetId: "sn-ctrl",
      ipAddress: "10.142.10.55",
      protocols: ["Vendor Tooling", "RDP"],
      criticality: "high",
      lifecycleStatus: "limited",
      controls: { ...controls.weak, endpointProtection: true }
    }),
    asset("nuc-rps", "Reactor Protection System", "safety-system", "level1", 96, laneY.level1, {
      subnetId: "sn-safety",
      ipAddress: "10.142.25.10",
      protocols: ["Vendor Safety Protocol"],
      criticality: "critical",
      backupStatus: "verified",
      manufacturer: "Safety I&C vendor",
      criticalProcessTag: "Reactor protection",
      controls: { ...controls.strong, safetyValidated: true }
    }),
    asset("nuc-bop", "Balance-of-Plant PLC", "plc-rtu", "level1", 384, laneY.level1, {
      subnetId: "sn-bop",
      ipAddress: "10.142.20.11",
      protocols: ["Modbus TCP", "PROFINET"],
      criticality: "critical",
      backupStatus: "missing",
      lifecycleStatus: "limited",
      criticalProcessTag: "Balance of plant",
      controls: controls.weak
    }),
    asset("nuc-turb", "Turbine Control", "plc-rtu", "level1", 672, laneY.level1, {
      subnetId: "sn-bop",
      ipAddress: "10.142.20.12",
      protocols: ["Modbus TCP"],
      criticality: "high",
      criticalProcessTag: "Turbine",
      controls: controls.weak
    }),
    asset("nuc-field", "Field Instruments", "field-device", "level0", 384, laneY.level0, {
      subnetId: "sn-field",
      ipAddress: "10.142.30.0/24",
      protocols: ["HART", "PROFIBUS PA"],
      criticality: "high",
      controls: controls.weak
    })
  ],
  conduits: [
    conduit("nc-corp-fw", "nuc-corp", "nuc-fw", "IT to IDMZ services", {
      protocol: "HTTPS",
      port: "443",
      trustBoundary: true,
      inspected: true,
      logged: true,
      encrypted: true
    }),
    conduit("nc-biz-hist", "nuc-biz", "nuc-hist", "Reporting pull", {
      protocol: "HTTPS",
      port: "443",
      direction: "target-to-source",
      trustBoundary: true,
      inspected: true,
      logged: true,
      encrypted: true
    }),
    conduit("nc-vendor-jump", "nuc-vendor", "nuc-jump", "Vendor support tunnel", {
      protocol: "RDP",
      port: "3389",
      control: "jump-host",
      trustBoundary: true,
      encrypted: true,
      jumpHostRequired: true,
      ruleOwner: "Vendor access owner",
      notes: "Vendor account lacks MFA and session recording."
    }),
    conduit("nc-jump-ews", "nuc-jump", "nuc-ews", "Brokered engineering access", {
      protocol: "RDP",
      port: "3389",
      control: "jump-host",
      trustBoundary: true,
      inspected: true,
      logged: true,
      encrypted: true,
      jumpHostRequired: true
    }),
    conduit("nc-hist-dcs", "nuc-hist", "nuc-dcs", "Historian collection", {
      protocol: "OPC UA",
      port: "4840",
      direction: "target-to-source",
      trustBoundary: true,
      inspected: true,
      logged: true,
      encrypted: true
    }),
    conduit("nc-dcs-mcr", "nuc-dcs", "nuc-mcr", "Control room display", {
      protocol: "OPC UA",
      port: "4840",
      direction: "bidirectional",
      control: "routed"
    }),
    conduit("nc-rps-dcs", "nuc-rps", "nuc-dcs", "Safety status (one-way diode)", {
      protocol: "Vendor Safety Protocol",
      port: "0",
      direction: "source-to-target",
      control: "data-diode",
      trustBoundary: true,
      inspected: true,
      logged: true,
      encrypted: true,
      notes: "Safety I&C publishes status one-way only; it cannot be written to from the control zone."
    }),
    conduit("nc-radmon-dcs", "nuc-radmon", "nuc-dcs", "Radiation data", {
      protocol: "Modbus TCP",
      port: "502",
      direction: "source-to-target",
      control: "routed",
      trustBoundary: true
    }),
    conduit("nc-dcs-bop", "nuc-dcs", "nuc-bop", "Control to balance-of-plant", {
      protocol: "Modbus TCP",
      port: "502",
      direction: "bidirectional",
      control: "routed",
      firewallRule: "any-any",
      trustBoundary: true,
      notes: "Broad control rule into the balance-of-plant network."
    }),
    conduit("nc-dcs-turb", "nuc-dcs", "nuc-turb", "Control to turbine", {
      protocol: "Modbus TCP",
      port: "502",
      direction: "bidirectional",
      control: "routed",
      trustBoundary: true
    }),
    conduit("nc-ews-bop", "nuc-ews", "nuc-bop", "Balance-of-plant maintenance", {
      protocol: "Vendor Tooling",
      port: "102",
      direction: "bidirectional",
      control: "routed",
      firewallRule: "unknown",
      trustBoundary: true,
      temporaryAccess: true,
      notes: "Engineering path to the balance-of-plant PLC is undocumented and unlogged."
    }),
    conduit("nc-bop-field", "nuc-bop", "nuc-field", "Process I/O", {
      protocol: "PROFINET",
      port: "34964",
      direction: "bidirectional",
      control: "routed"
    })
  ]
};

export const nuclearScenario: ScenarioMeta = {
  id: project.id,
  name: project.name,
  sector: "Nuclear (illustrative)",
  summary:
    "Illustrative high-consequence facility (generic, not a real site): an independent reactor protection safety system publishing status one-way through a data diode, alongside a plant DCS, radiation monitoring and balance-of-plant PLCs with realistic improvement areas.",
  standards: ["IAEA NSS 17", "ONR CAF (CS&IA)", "ISA/IEC 62443"],
  project: applyLayout(project)
};
