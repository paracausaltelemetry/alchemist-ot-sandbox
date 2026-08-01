import { PROJECT_SCHEMA_VERSION, type OtProject } from "../../models/types";
import { applyLayout, asset, conduit, controls, laneY, type ScenarioMeta } from "./builders";

const project: OtProject = {
  schemaVersion: PROJECT_SCHEMA_VERSION,
  id: "scenario-rail",
  name: "Rail Signalling",
  updatedAt: new Date().toISOString(),
  assumptions: [
    { id: "advisory", label: "Advisory model only; not a formal CAF or 62443 assessment." },
    { id: "scope", label: "Scope is one signalling control centre and its interlockings." },
    { id: "illustrative", label: "Illustrative architecture, not based on any specific railway." }
  ],
  zoneTargets: { level1: 3, level2: 3, level3: 2 },
  subnets: [
    { id: "sn-it", name: "Corporate IT", cidr: "10.40.0.0/16", vlan: "IT" },
    { id: "sn-bus", name: "Traffic Management", cidr: "10.41.0.0/24", vlan: "TMS" },
    { id: "sn-idmz", name: "IT/OT DMZ", cidr: "10.45.0.0/24", vlan: "IDMZ" },
    { id: "sn-ops", name: "Operations", cidr: "10.43.0.0/24", vlan: "OPS-300" },
    { id: "sn-ctrl", name: "Control Centre", cidr: "10.42.10.0/24", vlan: "CTRL-210" },
    { id: "sn-sig", name: "Signalling", cidr: "10.42.20.0/24", vlan: "SIG-220" },
    { id: "sn-field", name: "Trackside", cidr: "10.42.30.0/24", vlan: "FIELD-230" }
  ],
  assets: [
    asset("rail-corp", "Corporate IT", "enterprise-it", "level5", 96, laneY.level5, {
      subnetId: "sn-it",
      ipAddress: "10.40.0.0/16",
      protocols: ["HTTPS", "RDP", "SMB"],
      controls: controls.strong
    }),
    asset("rail-vendor", "Signalling Vendor Remote", "vendor-remote", "level5", 672, laneY.level5, {
      ipAddress: "203.0.113.50",
      protocols: ["VPN", "RDP"],
      criticality: "high",
      owner: "Signalling supplier",
      controls: { ...controls.weak, remoteAccessApproved: true }
    }),
    asset("rail-tms", "Traffic Management System", "enterprise-it", "level4", 384, laneY.level4, {
      subnetId: "sn-bus",
      ipAddress: "10.41.0.20",
      protocols: ["HTTPS", "SQL"],
      criticality: "high",
      controls: controls.strong
    }),
    asset("rail-fw", "IT/OT Firewall", "firewall", "level3", 96, laneY.level3, {
      subnetId: "sn-idmz",
      ipAddress: "10.45.0.1",
      criticality: "critical",
      backupStatus: "verified",
      controls: controls.strong
    }),
    asset("rail-jump", "OT Jump Host", "jump-host", "level3", 384, laneY.level3, {
      subnetId: "sn-idmz",
      ipAddress: "10.45.0.10",
      protocols: ["RDP", "SSH"],
      criticality: "critical",
      backupStatus: "verified",
      controls: controls.strong
    }),
    asset("rail-hist", "Signalling Data Recorder", "historian", "level3", 672, laneY.level3, {
      subnetId: "sn-ops",
      ipAddress: "10.43.0.15",
      protocols: ["OPC UA", "SQL"],
      criticality: "high",
      controls: controls.moderate
    }),
    asset("rail-scada", "Signalling Control Centre", "scada", "level2", 240, laneY.level2, {
      subnetId: "sn-ctrl",
      ipAddress: "10.42.10.20",
      protocols: ["Modbus TCP", "ETCS"],
      criticality: "critical",
      backupStatus: "configured",
      controls: controls.moderate
    }),
    asset("rail-hmi", "Signaller HMI", "hmi", "level2", 528, laneY.level2, {
      subnetId: "sn-ctrl",
      ipAddress: "10.42.10.40",
      protocols: ["HTTPS"],
      criticality: "high",
      controls: controls.moderate
    }),
    asset("rail-ews", "Signalling Engineering WS", "engineering-workstation", "level2", 816, laneY.level2, {
      subnetId: "sn-ctrl",
      ipAddress: "10.42.10.55",
      protocols: ["Vendor Tooling", "RDP"],
      criticality: "high",
      lifecycleStatus: "limited",
      controls: { ...controls.weak, endpointProtection: true }
    }),
    asset("rail-ixl", "Interlocking (SSI)", "plc-rtu", "level1", 96, laneY.level1, {
      subnetId: "sn-sig",
      ipAddress: "10.42.20.11",
      protocols: ["Proprietary SSI", "Modbus TCP"],
      criticality: "critical",
      backupStatus: "missing",
      manufacturer: "Alstom",
      lifecycleStatus: "obsolete",
      criticalProcessTag: "Interlocking",
      controls: controls.weak
    }),
    asset("rail-rbc", "Radio Block Centre", "plc-rtu", "level1", 384, laneY.level1, {
      subnetId: "sn-sig",
      ipAddress: "10.42.20.12",
      protocols: ["ETCS", "Euroradio"],
      criticality: "critical",
      backupStatus: "missing",
      criticalProcessTag: "Movement authority",
      controls: controls.weak
    }),
    asset("rail-lx", "Level Crossing Controller", "plc-rtu", "level1", 672, laneY.level1, {
      subnetId: "sn-sig",
      ipAddress: "10.42.20.13",
      protocols: ["Modbus TCP"],
      criticality: "critical",
      backupStatus: "missing",
      criticalProcessTag: "Level crossing",
      controls: controls.weak
    }),
    asset("rail-track", "Trackside Field Equipment", "field-device", "level0", 384, laneY.level0, {
      subnetId: "sn-field",
      ipAddress: "10.42.30.0/24",
      protocols: ["Vendor Trackside"],
      criticality: "high",
      controls: controls.weak
    })
  ],
  conduits: [
    conduit("rc-corp-fw", "rail-corp", "rail-fw", "IT to IDMZ services", {
      protocol: "HTTPS",
      port: "443",
      trustBoundary: true,
      inspected: true,
      logged: true,
      encrypted: true
    }),
    conduit("rc-tms-hist", "rail-tms", "rail-hist", "Reporting pull", {
      protocol: "HTTPS",
      port: "443",
      direction: "target-to-source",
      trustBoundary: true,
      inspected: true,
      logged: true,
      encrypted: true
    }),
    conduit("rc-vendor-jump", "rail-vendor", "rail-jump", "Vendor support tunnel", {
      protocol: "RDP",
      port: "3389",
      control: "jump-host",
      trustBoundary: true,
      encrypted: true,
      jumpHostRequired: true,
      ruleOwner: "Vendor access owner",
      notes: "Vendor account lacks MFA and session recording."
    }),
    conduit("rc-jump-ews", "rail-jump", "rail-ews", "Brokered engineering access", {
      protocol: "RDP",
      port: "3389",
      control: "jump-host",
      trustBoundary: true,
      inspected: true,
      logged: true,
      encrypted: true,
      jumpHostRequired: true
    }),
    conduit("rc-hist-scada", "rail-hist", "rail-scada", "Data recorder collection", {
      protocol: "OPC UA",
      port: "4840",
      direction: "target-to-source",
      trustBoundary: true,
      inspected: true,
      logged: true,
      encrypted: true
    }),
    conduit("rc-scada-hmi", "rail-scada", "rail-hmi", "Signaller display", {
      protocol: "HTTPS",
      port: "443",
      direction: "bidirectional",
      control: "routed"
    }),
    conduit("rc-scada-ixl", "rail-scada", "rail-ixl", "Control to interlocking", {
      protocol: "Modbus TCP",
      port: "502",
      direction: "bidirectional",
      control: "routed",
      firewallRule: "any-any",
      trustBoundary: true,
      notes: "Flat signalling network with a broad control rule."
    }),
    conduit("rc-scada-rbc", "rail-scada", "rail-rbc", "Control to RBC", {
      protocol: "ETCS",
      port: "0",
      direction: "bidirectional",
      control: "routed",
      trustBoundary: true
    }),
    conduit("rc-ews-ixl", "rail-ews", "rail-ixl", "Interlocking maintenance", {
      protocol: "Vendor Tooling",
      port: "0",
      direction: "bidirectional",
      control: "routed",
      firewallRule: "unknown",
      trustBoundary: true,
      temporaryAccess: true,
      notes: "Maintenance path to obsolete interlocking is undocumented and unlogged."
    }),
    conduit("rc-ixl-track", "rail-ixl", "rail-track", "Trackside I/O", {
      protocol: "Vendor Trackside",
      port: "0",
      direction: "bidirectional",
      control: "routed"
    }),
    conduit("rc-lx-track", "rail-lx", "rail-track", "Crossing I/O", {
      protocol: "Vendor Trackside",
      port: "0",
      direction: "bidirectional",
      control: "routed"
    })
  ]
};

export const railScenario: ScenarioMeta = {
  id: project.id,
  name: project.name,
  sector: "Rail / Transport",
  summary:
    "Railway signalling: a control centre and engineering workstation reaching obsolete interlockings, a Radio Block Centre and a level-crossing controller over a flat signalling network, with vendor remote access.",
  standards: ["CENELEC EN 50159", "NCSC CAF", "NIST SP 800-82"],
  project: applyLayout(project)
};
