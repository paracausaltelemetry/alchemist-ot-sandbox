import { PROJECT_SCHEMA_VERSION, type OtProject } from "../../models/types";
import { applyLayout, asset, conduit, controls, laneY, type ScenarioMeta } from "./builders";

const project: OtProject = {
  schemaVersion: PROJECT_SCHEMA_VERSION,
  id: "scenario-pharma",
  name: "Pharmaceutical Manufacturing",
  updatedAt: new Date().toISOString(),
  assumptions: [
    { id: "advisory", label: "Advisory model only; not a GxP, 21 CFR Part 11 or 62443 audit." },
    { id: "gmp", label: "A GMP-regulated facility: data integrity and validation sit alongside cyber security." },
    { id: "scope", label: "Scope is one bioreactor suite and its shared DCS." }
  ],
  zoneTargets: { level1: 3, level2: 3, level3: 2 },
  subnets: [
    { id: "sn-it", name: "Corporate IT", cidr: "10.110.0.0/16", vlan: "IT" },
    { id: "sn-bus", name: "ERP / QMS", cidr: "10.111.0.0/24", vlan: "BUS" },
    { id: "sn-idmz", name: "IT/OT DMZ", cidr: "10.115.0.0/24", vlan: "IDMZ" },
    { id: "sn-ops", name: "MES / Operations", cidr: "10.113.0.0/24", vlan: "OPS-300" },
    { id: "sn-dcs", name: "DCS Supervisory", cidr: "10.112.10.0/24", vlan: "DCS-210" },
    { id: "sn-bpcs", name: "Process Control", cidr: "10.112.20.0/24", vlan: "BPCS-220" },
    { id: "sn-field", name: "Field Instruments", cidr: "10.112.30.0/24", vlan: "FIELD-230" }
  ],
  assets: [
    asset("ph-corp", "Corporate IT", "enterprise-it", "level5", 96, laneY.level5, {
      subnetId: "sn-it",
      ipAddress: "10.110.0.0/16",
      protocols: ["HTTPS", "RDP", "SMB"],
      controls: controls.strong
    }),
    asset("ph-vendor", "Automation Vendor Remote", "vendor-remote", "level5", 672, laneY.level5, {
      ipAddress: "203.0.113.110",
      protocols: ["VPN", "RDP"],
      criticality: "high",
      owner: "Automation vendor",
      controls: { ...controls.weak, remoteAccessApproved: true }
    }),
    asset("ph-erp", "ERP / QMS", "enterprise-it", "level4", 384, laneY.level4, {
      subnetId: "sn-bus",
      ipAddress: "10.111.0.20",
      protocols: ["HTTPS", "SQL"],
      criticality: "high",
      controls: controls.strong
    }),
    asset("ph-fw", "IT/OT Firewall", "firewall", "level3", 96, laneY.level3, {
      subnetId: "sn-idmz",
      ipAddress: "10.115.0.1",
      criticality: "critical",
      backupStatus: "verified",
      controls: controls.strong
    }),
    asset("ph-jump", "OT Jump Host", "jump-host", "level3", 384, laneY.level3, {
      subnetId: "sn-idmz",
      ipAddress: "10.115.0.10",
      protocols: ["RDP", "SSH"],
      criticality: "critical",
      backupStatus: "verified",
      controls: controls.strong
    }),
    asset("ph-mes", "MES / Batch Historian", "historian", "level3", 672, laneY.level3, {
      subnetId: "sn-ops",
      ipAddress: "10.113.0.15",
      protocols: ["OPC UA", "SQL"],
      criticality: "high",
      controls: controls.moderate
    }),
    asset("ph-dcs", "DCS Server", "scada", "level2", 240, laneY.level2, {
      subnetId: "sn-dcs",
      ipAddress: "10.112.10.20",
      protocols: ["OPC DA", "Modbus TCP"],
      criticality: "critical",
      backupStatus: "configured",
      manufacturer: "Siemens",
      model: "SIMATIC PCS 7",
      controls: controls.moderate
    }),
    asset("ph-hmi", "Batch HMI", "hmi", "level2", 528, laneY.level2, {
      subnetId: "sn-dcs",
      ipAddress: "10.112.10.40",
      protocols: ["OPC DA", "HTTPS"],
      criticality: "high",
      controls: controls.moderate
    }),
    asset("ph-ews", "Engineering Workstation", "engineering-workstation", "level2", 816, laneY.level2, {
      subnetId: "sn-dcs",
      ipAddress: "10.112.10.55",
      protocols: ["OPC DA", "Vendor Tooling", "RDP"],
      criticality: "high",
      lifecycleStatus: "limited",
      controls: { ...controls.weak, endpointProtection: true }
    }),
    asset("ph-bpcs", "BPCS Controller", "plc-rtu", "level1", 96, laneY.level1, {
      subnetId: "sn-bpcs",
      ipAddress: "10.112.20.11",
      protocols: ["Modbus TCP", "PROFINET"],
      criticality: "critical",
      backupStatus: "missing",
      manufacturer: "Siemens",
      model: "S7-400",
      criticalProcessTag: "Process control",
      controls: { ...controls.weak, defaultCredentialsDisabled: true }
    }),
    asset("ph-batch", "Bioreactor PLC", "plc-rtu", "level1", 384, laneY.level1, {
      subnetId: "sn-bpcs",
      ipAddress: "10.112.20.12",
      protocols: ["Modbus TCP"],
      criticality: "critical",
      backupStatus: "missing",
      criticalProcessTag: "Bioreactor",
      controls: controls.weak
    }),
    asset("ph-cip", "CIP / SIP Skid PLC", "plc-rtu", "level1", 672, laneY.level1, {
      subnetId: "sn-bpcs",
      ipAddress: "10.112.20.13",
      protocols: ["Modbus TCP"],
      criticality: "high",
      criticalProcessTag: "Clean-in-place",
      controls: controls.weak
    }),
    asset("ph-field", "Transmitters & Valves", "field-device", "level0", 384, laneY.level0, {
      subnetId: "sn-field",
      ipAddress: "10.112.30.0/24",
      protocols: ["HART", "PROFIBUS PA"],
      criticality: "high",
      controls: controls.weak
    })
  ],
  conduits: [
    conduit("pc-corp-fw", "ph-corp", "ph-fw", "IT to IDMZ services", {
      protocol: "HTTPS",
      port: "443",
      trustBoundary: true,
      inspected: true,
      logged: true,
      encrypted: true
    }),
    conduit("pc-erp-mes", "ph-erp", "ph-mes", "Batch record exchange", {
      protocol: "HTTPS",
      port: "443",
      direction: "target-to-source",
      trustBoundary: true,
      inspected: true,
      logged: true,
      encrypted: true
    }),
    conduit("pc-vendor-jump", "ph-vendor", "ph-jump", "Vendor support tunnel", {
      protocol: "RDP",
      port: "3389",
      control: "jump-host",
      trustBoundary: true,
      encrypted: true,
      jumpHostRequired: true,
      ruleOwner: "Vendor access owner",
      notes: "Vendor account lacks MFA and session recording."
    }),
    conduit("pc-jump-ews", "ph-jump", "ph-ews", "Brokered engineering access", {
      protocol: "RDP",
      port: "3389",
      control: "jump-host",
      trustBoundary: true,
      inspected: true,
      logged: true,
      encrypted: true,
      jumpHostRequired: true
    }),
    conduit("pc-mes-dcs", "ph-mes", "ph-dcs", "Historian collection", {
      protocol: "OPC UA",
      port: "4840",
      direction: "target-to-source",
      trustBoundary: true,
      inspected: true,
      logged: true,
      encrypted: true
    }),
    conduit("pc-dcs-hmi", "ph-dcs", "ph-hmi", "Operator display", {
      protocol: "OPC DA",
      port: "135",
      direction: "bidirectional",
      control: "routed",
      notes: "OPC Classic (DCOM) on the supervisory LAN."
    }),
    conduit("pc-dcs-bpcs", "ph-dcs", "ph-bpcs", "DCS to BPCS controller", {
      protocol: "Modbus TCP",
      port: "502",
      direction: "bidirectional",
      control: "routed",
      firewallRule: "any-any",
      trustBoundary: true,
      notes: "Broad control-network rule."
    }),
    conduit("pc-dcs-batch", "ph-dcs", "ph-batch", "DCS to bioreactor PLC", {
      protocol: "Modbus TCP",
      port: "502",
      direction: "bidirectional",
      control: "routed",
      trustBoundary: true
    }),
    conduit("pc-ews-bpcs", "ph-ews", "ph-bpcs", "Controller programming", {
      protocol: "Vendor Tooling",
      port: "102",
      direction: "bidirectional",
      control: "routed",
      firewallRule: "unknown",
      trustBoundary: true,
      temporaryAccess: true,
      notes: "Engineering download path is undocumented and unlogged."
    }),
    conduit("pc-bpcs-field", "ph-bpcs", "ph-field", "Process I/O", {
      protocol: "PROFINET",
      port: "34964",
      direction: "bidirectional",
      control: "routed"
    }),
    conduit("pc-cip-field", "ph-cip", "ph-field", "Skid I/O", {
      protocol: "HART",
      port: "502",
      direction: "bidirectional",
      control: "routed"
    })
  ]
};

export const pharmaScenario: ScenarioMeta = {
  id: project.id,
  name: project.name,
  sector: "Pharmaceutical",
  summary:
    "GMP pharmaceutical plant with a Siemens PCS 7 DCS, bioreactor and CIP/SIP PLCs, OPC Classic supervisory traffic, MES batch records, and automation-vendor remote access.",
  standards: ["GAMP 5 / 21 CFR Part 11", "ISA/IEC 62443", "NIST SP 800-82"],
  project: applyLayout(project)
};
