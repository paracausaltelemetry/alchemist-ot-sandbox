import { PROJECT_SCHEMA_VERSION, type OtProject } from "../../models/types";
import { applyLayout, asset, conduit, controls, laneY, type ScenarioMeta } from "./builders";

const project: OtProject = {
  schemaVersion: PROJECT_SCHEMA_VERSION,
  id: "scenario-oil-gas",
  name: "Gas Pipeline SCADA",
  updatedAt: new Date().toISOString(),
  assumptions: [
    { id: "advisory", label: "Advisory model only; not a TSA pipeline security assessment." },
    { id: "wan", label: "Remote sites communicate over leased cellular and satellite backhaul." },
    { id: "scope", label: "Scope is the pipeline control centre plus wellhead, custody, and compressor outstations." }
  ],
  zoneTargets: { level1: 3, level2: 3, level3: 2 },
  subnets: [
    { id: "sn-it", name: "Corporate IT", cidr: "10.90.0.0/16", vlan: "IT" },
    { id: "sn-bus", name: "Gas Control / Scheduling", cidr: "10.91.0.0/24", vlan: "BUS" },
    { id: "sn-idmz", name: "IT/OT DMZ", cidr: "10.95.0.0/24", vlan: "IDMZ" },
    { id: "sn-ops", name: "Operations", cidr: "10.93.0.0/24", vlan: "OPS-300" },
    { id: "sn-ctrl", name: "Control Centre", cidr: "10.92.10.0/24", vlan: "CTRL-210" },
    { id: "sn-remote", name: "Remote Outstations", cidr: "10.92.30.0/24", vlan: "WAN-230" },
    { id: "sn-station", name: "Compressor Station", cidr: "10.92.40.0/24", vlan: "COMP-240" },
    { id: "sn-field", name: "Field Instruments", cidr: "10.92.50.0/24", vlan: "FIELD-250" }
  ],
  assets: [
    asset("og-corp", "Corporate IT", "enterprise-it", "level5", 96, laneY.level5, {
      subnetId: "sn-it",
      ipAddress: "10.90.0.0/16",
      protocols: ["HTTPS", "RDP", "SMB"],
      controls: controls.strong
    }),
    asset("og-vendor", "SCADA Vendor Remote", "vendor-remote", "level5", 672, laneY.level5, {
      ipAddress: "203.0.113.120",
      protocols: ["VPN", "RDP"],
      criticality: "high",
      owner: "SCADA vendor",
      controls: { ...controls.weak, remoteAccessApproved: true }
    }),
    asset("og-control", "Gas Control / Scheduling", "enterprise-it", "level4", 384, laneY.level4, {
      subnetId: "sn-bus",
      ipAddress: "10.91.0.20",
      protocols: ["HTTPS", "SQL"],
      criticality: "high",
      controls: controls.strong
    }),
    asset("og-fw", "IT/OT Firewall", "firewall", "level3", 96, laneY.level3, {
      subnetId: "sn-idmz",
      ipAddress: "10.95.0.1",
      criticality: "critical",
      backupStatus: "verified",
      controls: controls.strong
    }),
    asset("og-jump", "OT Jump Host", "jump-host", "level3", 384, laneY.level3, {
      subnetId: "sn-idmz",
      ipAddress: "10.95.0.10",
      protocols: ["RDP", "SSH"],
      criticality: "critical",
      backupStatus: "verified",
      controls: controls.strong
    }),
    asset("og-hist", "Pipeline Historian", "historian", "level3", 672, laneY.level3, {
      subnetId: "sn-ops",
      ipAddress: "10.93.0.15",
      protocols: ["OPC UA", "SQL"],
      criticality: "high",
      controls: controls.moderate
    }),
    asset("og-scada", "Pipeline SCADA Master", "scada", "level2", 240, laneY.level2, {
      subnetId: "sn-ctrl",
      ipAddress: "10.92.10.20",
      protocols: ["DNP3", "Modbus TCP"],
      criticality: "critical",
      backupStatus: "configured",
      manufacturer: "Schneider Electric",
      model: "OASyS DNA",
      controls: controls.moderate
    }),
    asset("og-hmi", "Console HMI", "hmi", "level2", 528, laneY.level2, {
      subnetId: "sn-ctrl",
      ipAddress: "10.92.10.40",
      protocols: ["DNP3", "HTTPS"],
      criticality: "high",
      controls: controls.moderate
    }),
    asset("og-leak", "Leak Detection Server", "scada", "level2", 816, laneY.level2, {
      subnetId: "sn-ctrl",
      ipAddress: "10.92.10.50",
      protocols: ["Modbus TCP", "OPC UA"],
      criticality: "high",
      criticalProcessTag: "Leak detection",
      controls: controls.moderate
    }),
    asset("og-ews", "Engineering Workstation", "engineering-workstation", "level2", 1104, laneY.level2, {
      subnetId: "sn-ctrl",
      ipAddress: "10.92.10.55",
      protocols: ["Vendor Tooling", "Modbus TCP", "RDP"],
      criticality: "high",
      lifecycleStatus: "limited",
      controls: { ...controls.weak, endpointProtection: true }
    }),
    asset("og-cell", "Cellular / Satellite Gateway", "wireless-gateway", "level1", 96, laneY.level1, {
      subnetId: "sn-remote",
      ipAddress: "10.92.30.1",
      protocols: ["DNP3"],
      criticality: "high",
      controls: controls.weak
    }),
    asset("og-rtu-well", "Wellhead RTU", "plc-rtu", "level1", 384, laneY.level1, {
      subnetId: "sn-remote",
      ipAddress: "10.92.30.21",
      protocols: ["DNP3", "Modbus TCP"],
      criticality: "critical",
      backupStatus: "missing",
      manufacturer: "Emerson",
      model: "ROC800",
      lifecycleStatus: "obsolete",
      criticalProcessTag: "Wellhead control",
      controls: controls.weak
    }),
    asset("og-flow", "Custody Flow Computer", "plc-rtu", "level1", 672, laneY.level1, {
      subnetId: "sn-remote",
      ipAddress: "10.92.30.22",
      protocols: ["Modbus TCP"],
      criticality: "critical",
      backupStatus: "missing",
      manufacturer: "Emerson",
      model: "FloBoss S600+",
      criticalProcessTag: "Custody transfer",
      controls: { ...controls.weak, defaultCredentialsDisabled: true }
    }),
    asset("og-comp", "Compressor Station PLC", "plc-rtu", "level1", 960, laneY.level1, {
      subnetId: "sn-station",
      ipAddress: "10.92.40.11",
      protocols: ["Modbus TCP", "EtherNet/IP"],
      criticality: "critical",
      backupStatus: "missing",
      criticalProcessTag: "Compression",
      controls: controls.weak
    }),
    asset("og-meters", "Pressure / Flow Meters", "field-device", "level0", 384, laneY.level0, {
      subnetId: "sn-field",
      ipAddress: "10.92.50.0/24",
      protocols: ["HART", "Modbus RTU"],
      criticality: "high",
      controls: controls.weak
    })
  ],
  conduits: [
    conduit("oc-corp-fw", "og-corp", "og-fw", "IT to IDMZ services", {
      protocol: "HTTPS",
      port: "443",
      trustBoundary: true,
      inspected: true,
      logged: true,
      encrypted: true
    }),
    conduit("oc-control-hist", "og-control", "og-hist", "Scheduling data pull", {
      protocol: "HTTPS",
      port: "443",
      direction: "target-to-source",
      trustBoundary: true,
      inspected: true,
      logged: true,
      encrypted: true
    }),
    conduit("oc-vendor-jump", "og-vendor", "og-jump", "SCADA vendor support tunnel", {
      protocol: "RDP",
      port: "3389",
      control: "jump-host",
      trustBoundary: true,
      encrypted: true,
      jumpHostRequired: true,
      ruleOwner: "Vendor access owner",
      notes: "Vendor account lacks MFA and session recording."
    }),
    conduit("oc-jump-ews", "og-jump", "og-ews", "Brokered engineering access", {
      protocol: "RDP",
      port: "3389",
      control: "jump-host",
      trustBoundary: true,
      inspected: true,
      logged: true,
      encrypted: true,
      jumpHostRequired: true
    }),
    conduit("oc-hist-scada", "og-hist", "og-scada", "Historian collection", {
      protocol: "OPC UA",
      port: "4840",
      direction: "target-to-source",
      trustBoundary: true,
      inspected: true,
      logged: true,
      encrypted: true
    }),
    conduit("oc-scada-hmi", "og-scada", "og-hmi", "Console display", {
      protocol: "DNP3",
      port: "20000",
      direction: "bidirectional",
      control: "routed"
    }),
    conduit("oc-scada-leak", "og-scada", "og-leak", "Leak detection feed", {
      protocol: "Modbus TCP",
      port: "502",
      direction: "bidirectional",
      control: "routed"
    }),
    conduit("oc-scada-cell", "og-scada", "og-cell", "Remote telemetry over WAN", {
      protocol: "DNP3",
      port: "20000",
      direction: "bidirectional",
      control: "routed",
      firewallRule: "any-any",
      trustBoundary: true,
      notes: "Wide-area cellular/satellite link is unmonitored and broadly permitted."
    }),
    conduit("oc-cell-rtu", "og-cell", "og-rtu-well", "Wellhead polling", {
      protocol: "DNP3",
      port: "20000",
      direction: "bidirectional",
      control: "routed"
    }),
    conduit("oc-cell-flow", "og-cell", "og-flow", "Custody metering", {
      protocol: "Modbus TCP",
      port: "502",
      direction: "bidirectional",
      control: "routed"
    }),
    conduit("oc-scada-comp", "og-scada", "og-comp", "Compressor control", {
      protocol: "Modbus TCP",
      port: "502",
      direction: "bidirectional",
      control: "routed",
      trustBoundary: true
    }),
    conduit("oc-ews-rtu", "og-ews", "og-rtu-well", "RTU programming", {
      protocol: "Vendor Tooling",
      port: "20000",
      direction: "bidirectional",
      control: "routed",
      firewallRule: "unknown",
      trustBoundary: true,
      temporaryAccess: true,
      notes: "Remote RTU configuration path is undocumented and unlogged."
    }),
    conduit("oc-rtu-meters", "og-rtu-well", "og-meters", "Wellhead I/O", {
      protocol: "Modbus RTU",
      port: "502",
      direction: "bidirectional",
      control: "routed"
    }),
    conduit("oc-flow-meters", "og-flow", "og-meters", "Custody meter I/O", {
      protocol: "HART",
      port: "502",
      direction: "bidirectional",
      control: "routed"
    })
  ]
};

export const oilGasScenario: ScenarioMeta = {
  id: project.id,
  name: project.name,
  sector: "Oil & Gas",
  summary:
    "Gas transmission pipeline with a SCADA master polling obsolete wellhead RTUs and custody flow computers over cellular/satellite, plus leak detection and a compressor station.",
  standards: ["TSA Pipeline SD", "API 1164", "NIST SP 800-82"],
  project: applyLayout(project)
};
