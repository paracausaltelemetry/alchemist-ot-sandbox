import { PROJECT_SCHEMA_VERSION, type OtProject } from "../../models/types";
import { applyLayout, asset, conduit, controls, laneY, type ScenarioMeta } from "./builders";

const project: OtProject = {
  schemaVersion: PROJECT_SCHEMA_VERSION,
  id: "scenario-chemical",
  name: "Chemical Batch Plant",
  updatedAt: new Date().toISOString(),
  assumptions: [
    { id: "advisory", label: "Advisory model only; not an ISA/IEC 62443 or CFATS audit." },
    { id: "sis", label: "The SIS is a separate IEC 61511 safety layer from the basic process control system." },
    { id: "scope", label: "Scope is one batch production line and its shared DCS." }
  ],
  zoneTargets: { level1: 3, level2: 3, level3: 2 },
  subnets: [
    { id: "sn-it", name: "Corporate IT", cidr: "10.70.0.0/16", vlan: "IT" },
    { id: "sn-bus", name: "ERP / Batch Records", cidr: "10.71.0.0/24", vlan: "BUS" },
    { id: "sn-idmz", name: "IT/OT DMZ", cidr: "10.75.0.0/24", vlan: "IDMZ" },
    { id: "sn-ops", name: "Operations / MES", cidr: "10.73.0.0/24", vlan: "OPS-300" },
    { id: "sn-dcs", name: "DCS Supervisory", cidr: "10.72.10.0/24", vlan: "DCS-210" },
    { id: "sn-bpcs", name: "BPCS Control", cidr: "10.72.20.0/24", vlan: "BPCS-220" },
    { id: "sn-sis", name: "Safety (SIS)", cidr: "10.72.25.0/24", vlan: "SIS-225" },
    { id: "sn-field", name: "Field Instruments", cidr: "10.72.30.0/24", vlan: "FIELD-230" }
  ],
  assets: [
    asset("chem-corp", "Corporate IT", "enterprise-it", "level5", 96, laneY.level5, {
      subnetId: "sn-it",
      ipAddress: "10.70.0.0/16",
      protocols: ["HTTPS", "RDP", "SMB"],
      controls: controls.strong
    }),
    asset("chem-vendor", "DCS Vendor Remote", "vendor-remote", "level5", 672, laneY.level5, {
      ipAddress: "203.0.113.80",
      protocols: ["VPN", "RDP"],
      criticality: "high",
      owner: "DCS vendor",
      controls: { ...controls.weak, remoteAccessApproved: true }
    }),
    asset("chem-erp", "ERP / Batch Records", "enterprise-it", "level4", 384, laneY.level4, {
      subnetId: "sn-bus",
      ipAddress: "10.71.0.20",
      protocols: ["HTTPS", "SQL"],
      controls: controls.strong
    }),
    asset("chem-fw", "IT/OT Firewall", "firewall", "level3", 96, laneY.level3, {
      subnetId: "sn-idmz",
      ipAddress: "10.75.0.1",
      criticality: "critical",
      backupStatus: "verified",
      controls: controls.strong
    }),
    asset("chem-jump", "OT Jump Host", "jump-host", "level3", 384, laneY.level3, {
      subnetId: "sn-idmz",
      ipAddress: "10.75.0.10",
      protocols: ["RDP", "SSH"],
      criticality: "critical",
      backupStatus: "verified",
      controls: controls.strong
    }),
    asset("chem-mes", "MES / Process Historian", "historian", "level3", 672, laneY.level3, {
      subnetId: "sn-ops",
      ipAddress: "10.73.0.15",
      protocols: ["OPC UA", "SQL"],
      criticality: "high",
      controls: controls.moderate
    }),
    asset("chem-dcs", "DCS Controller Server", "scada", "level2", 240, laneY.level2, {
      subnetId: "sn-dcs",
      ipAddress: "10.72.10.20",
      protocols: ["OPC DA", "Modbus TCP"],
      criticality: "critical",
      backupStatus: "configured",
      manufacturer: "Emerson",
      model: "DeltaV",
      controls: controls.moderate
    }),
    asset("chem-hmi", "DCS Operator Console", "hmi", "level2", 528, laneY.level2, {
      subnetId: "sn-dcs",
      ipAddress: "10.72.10.40",
      protocols: ["OPC DA", "HTTPS"],
      criticality: "high",
      controls: controls.moderate
    }),
    asset("chem-ews", "Engineering Workstation", "engineering-workstation", "level2", 816, laneY.level2, {
      subnetId: "sn-dcs",
      ipAddress: "10.72.10.55",
      protocols: ["OPC DA", "Vendor Tooling", "RDP"],
      criticality: "high",
      lifecycleStatus: "limited",
      controls: { ...controls.weak, endpointProtection: true }
    }),
    asset("chem-bpcs", "BPCS Controller", "plc-rtu", "level1", 96, laneY.level1, {
      subnetId: "sn-bpcs",
      ipAddress: "10.72.20.11",
      protocols: ["Modbus TCP", "EtherNet/IP"],
      criticality: "critical",
      backupStatus: "missing",
      manufacturer: "Emerson",
      model: "DeltaV MD Controller",
      criticalProcessTag: "Reactor control",
      controls: { ...controls.weak, defaultCredentialsDisabled: true }
    }),
    asset("chem-batch", "Batch Reactor PLC", "plc-rtu", "level1", 384, laneY.level1, {
      subnetId: "sn-bpcs",
      ipAddress: "10.72.20.12",
      protocols: ["Modbus TCP"],
      criticality: "critical",
      backupStatus: "missing",
      criticalProcessTag: "Batch sequencing",
      controls: controls.weak
    }),
    asset("chem-sis", "Safety Instrumented System", "safety-system", "level1", 672, laneY.level1, {
      subnetId: "sn-sis",
      ipAddress: "10.72.25.10",
      protocols: ["Vendor Safety Protocol"],
      criticality: "critical",
      backupStatus: "verified",
      manufacturer: "HIMA",
      model: "HIMax",
      criticalProcessTag: "Emergency shutdown",
      controls: { ...controls.strong, safetyValidated: true }
    }),
    asset("chem-field", "Transmitters & Valves", "field-device", "level0", 240, laneY.level0, {
      subnetId: "sn-field",
      ipAddress: "10.72.30.0/24",
      protocols: ["HART", "Profibus PA"],
      criticality: "high",
      controls: controls.weak
    }),
    asset("chem-analyzer", "Process Analyzers", "field-device", "level0", 528, laneY.level0, {
      subnetId: "sn-field",
      ipAddress: "10.72.30.50",
      protocols: ["Modbus RTU"],
      criticality: "medium",
      controls: controls.weak
    })
  ],
  conduits: [
    conduit("hc-corp-fw", "chem-corp", "chem-fw", "IT to IDMZ services", {
      protocol: "HTTPS",
      port: "443",
      trustBoundary: true,
      inspected: true,
      logged: true,
      encrypted: true
    }),
    conduit("hc-erp-mes", "chem-erp", "chem-mes", "Batch record exchange", {
      protocol: "HTTPS",
      port: "443",
      direction: "target-to-source",
      trustBoundary: true,
      inspected: true,
      logged: true,
      encrypted: true
    }),
    conduit("hc-vendor-jump", "chem-vendor", "chem-jump", "DCS vendor support tunnel", {
      protocol: "RDP",
      port: "3389",
      control: "jump-host",
      trustBoundary: true,
      encrypted: true,
      jumpHostRequired: true,
      ruleOwner: "Vendor access owner",
      notes: "Vendor account lacks MFA and session recording."
    }),
    conduit("hc-jump-ews", "chem-jump", "chem-ews", "Brokered engineering access", {
      protocol: "RDP",
      port: "3389",
      control: "jump-host",
      trustBoundary: true,
      inspected: true,
      logged: true,
      encrypted: true,
      jumpHostRequired: true
    }),
    conduit("hc-mes-dcs", "chem-mes", "chem-dcs", "Historian collection", {
      protocol: "OPC UA",
      port: "4840",
      direction: "target-to-source",
      trustBoundary: true,
      inspected: true,
      logged: true,
      encrypted: true
    }),
    conduit("hc-dcs-hmi", "chem-dcs", "chem-hmi", "Operator display", {
      protocol: "OPC DA",
      port: "135",
      direction: "bidirectional",
      control: "routed",
      notes: "OPC Classic (DCOM) on the supervisory LAN."
    }),
    conduit("hc-dcs-bpcs", "chem-dcs", "chem-bpcs", "DCS to BPCS controller", {
      protocol: "Modbus TCP",
      port: "502",
      direction: "bidirectional",
      control: "routed",
      trustBoundary: true
    }),
    conduit("hc-dcs-batch", "chem-dcs", "chem-batch", "DCS to batch reactor PLC", {
      protocol: "Modbus TCP",
      port: "502",
      direction: "bidirectional",
      control: "routed",
      trustBoundary: true
    }),
    conduit("hc-bpcs-sis", "chem-bpcs", "chem-sis", "Safety interlock exchange", {
      protocol: "Vendor Safety Protocol",
      port: "1962",
      direction: "bidirectional",
      control: "routed",
      firewallRule: "unknown",
      trustBoundary: true,
      notes: "BPCS and SIS exchange bidirectionally without a one-way gateway."
    }),
    conduit("hc-ews-bpcs", "chem-ews", "chem-bpcs", "Controller programming", {
      protocol: "Vendor Tooling",
      port: "44818",
      direction: "bidirectional",
      control: "routed",
      firewallRule: "unknown",
      trustBoundary: true,
      temporaryAccess: true,
      notes: "Engineering download path is undocumented and unlogged."
    }),
    conduit("hc-bpcs-field", "chem-bpcs", "chem-field", "Process I/O", {
      protocol: "HART",
      port: "502",
      direction: "bidirectional",
      control: "routed"
    }),
    conduit("hc-batch-analyzer", "chem-batch", "chem-analyzer", "Analyzer I/O", {
      protocol: "Modbus RTU",
      port: "502",
      direction: "bidirectional",
      control: "routed"
    })
  ]
};

export const chemicalScenario: ScenarioMeta = {
  id: project.id,
  name: project.name,
  sector: "Chemical / Process",
  summary:
    "Batch chemical plant with an Emerson DCS, a separate HIMA safety instrumented system, OPC Classic supervisory traffic, and DCS vendor remote access.",
  standards: ["IEC 61511 (SIS)", "CFATS", "ISA/IEC 62443"],
  project: applyLayout(project)
};
