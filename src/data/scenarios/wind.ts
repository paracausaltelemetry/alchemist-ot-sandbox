import { PROJECT_SCHEMA_VERSION, type OtProject } from "../../models/types";
import { applyLayout, asset, conduit, controls, laneY, type ScenarioMeta } from "./builders";

const project: OtProject = {
  schemaVersion: PROJECT_SCHEMA_VERSION,
  id: "scenario-wind",
  name: "Wind Farm",
  updatedAt: new Date().toISOString(),
  assumptions: [
    { id: "advisory", label: "Advisory model only; not a NERC CIP or 62443 assessment." },
    { id: "wan", label: "Turbines and the grid substation connect over site fibre and a WAN link to the control centre." },
    { id: "illustrative", label: "Illustrative wind farm, not based on any specific site." }
  ],
  zoneTargets: { level1: 3, level2: 3, level3: 2 },
  subnets: [
    { id: "sn-it", name: "Corporate IT", cidr: "10.130.0.0/16", vlan: "IT" },
    { id: "sn-bus", name: "Trading / Forecast", cidr: "10.131.0.0/24", vlan: "BUS" },
    { id: "sn-idmz", name: "IT/OT DMZ", cidr: "10.135.0.0/24", vlan: "IDMZ" },
    { id: "sn-ops", name: "Operations", cidr: "10.133.0.0/24", vlan: "OPS-300" },
    { id: "sn-scada", name: "Wind Farm SCADA", cidr: "10.132.10.0/24", vlan: "SCADA-210" },
    { id: "sn-wtg", name: "Turbine Network", cidr: "10.132.20.0/24", vlan: "WTG-220" },
    { id: "sn-sub", name: "Grid Substation", cidr: "10.132.40.0/24", vlan: "SUB-240" }
  ],
  assets: [
    asset("wnd-corp", "Corporate IT", "enterprise-it", "level5", 96, laneY.level5, {
      subnetId: "sn-it",
      ipAddress: "10.130.0.0/16",
      protocols: ["HTTPS", "RDP", "SMB"],
      controls: controls.strong
    }),
    asset("wnd-vendor", "Turbine OEM Remote", "vendor-remote", "level5", 672, laneY.level5, {
      ipAddress: "203.0.113.140",
      protocols: ["VPN", "RDP"],
      criticality: "high",
      owner: "Turbine OEM",
      controls: { ...controls.weak, remoteAccessApproved: true }
    }),
    asset("wnd-trading", "Energy Trading / Forecast", "enterprise-it", "level4", 384, laneY.level4, {
      subnetId: "sn-bus",
      ipAddress: "10.131.0.20",
      protocols: ["HTTPS", "SQL"],
      criticality: "high",
      controls: controls.strong
    }),
    asset("wnd-fw", "IT/OT Firewall", "firewall", "level3", 96, laneY.level3, {
      subnetId: "sn-idmz",
      ipAddress: "10.135.0.1",
      criticality: "critical",
      backupStatus: "verified",
      controls: controls.strong
    }),
    asset("wnd-jump", "OT Jump Host", "jump-host", "level3", 384, laneY.level3, {
      subnetId: "sn-idmz",
      ipAddress: "10.135.0.10",
      protocols: ["RDP", "SSH"],
      criticality: "critical",
      backupStatus: "verified",
      controls: controls.strong
    }),
    asset("wnd-hist", "Generation Historian", "historian", "level3", 672, laneY.level3, {
      subnetId: "sn-ops",
      ipAddress: "10.133.0.15",
      protocols: ["OPC UA", "SQL"],
      criticality: "high",
      controls: controls.moderate
    }),
    asset("wnd-scada", "Wind Farm SCADA", "scada", "level2", 240, laneY.level2, {
      subnetId: "sn-scada",
      ipAddress: "10.132.10.20",
      protocols: ["IEC 61400-25", "Modbus TCP"],
      criticality: "critical",
      backupStatus: "configured",
      controls: controls.moderate
    }),
    asset("wnd-hmi", "Operator HMI", "hmi", "level2", 528, laneY.level2, {
      subnetId: "sn-scada",
      ipAddress: "10.132.10.40",
      protocols: ["HTTPS"],
      criticality: "high",
      controls: controls.moderate
    }),
    asset("wnd-ews", "Engineering Workstation", "engineering-workstation", "level2", 816, laneY.level2, {
      subnetId: "sn-scada",
      ipAddress: "10.132.10.55",
      protocols: ["Vendor Tooling", "RDP"],
      criticality: "high",
      lifecycleStatus: "limited",
      controls: { ...controls.weak, endpointProtection: true }
    }),
    asset("wnd-wtg", "Turbine Controllers", "plc-rtu", "level1", 96, laneY.level1, {
      subnetId: "sn-wtg",
      ipAddress: "10.132.20.0/24",
      protocols: ["IEC 61400-25", "Modbus TCP"],
      criticality: "critical",
      backupStatus: "missing",
      manufacturer: "Vestas",
      criticalProcessTag: "Turbine control",
      controls: controls.weak
    }),
    asset("wnd-met", "Met Mast Controller", "plc-rtu", "level1", 384, laneY.level1, {
      subnetId: "sn-wtg",
      ipAddress: "10.132.20.40",
      protocols: ["Modbus TCP"],
      criticality: "medium",
      controls: controls.weak
    }),
    asset("wnd-sub", "Substation RTU", "plc-rtu", "level1", 672, laneY.level1, {
      subnetId: "sn-sub",
      ipAddress: "10.132.40.11",
      protocols: ["IEC 61850 MMS", "DNP3"],
      criticality: "critical",
      backupStatus: "missing",
      manufacturer: "SEL",
      lifecycleStatus: "limited",
      criticalProcessTag: "Grid export",
      controls: controls.weak
    }),
    asset("wnd-field", "Turbine Sensors", "field-device", "level0", 384, laneY.level0, {
      subnetId: "sn-wtg",
      ipAddress: "10.132.20.200",
      protocols: ["Modbus RTU"],
      criticality: "high",
      controls: controls.weak
    })
  ],
  conduits: [
    conduit("wc-corp-fw", "wnd-corp", "wnd-fw", "IT to IDMZ services", {
      protocol: "HTTPS",
      port: "443",
      trustBoundary: true,
      inspected: true,
      logged: true,
      encrypted: true
    }),
    conduit("wc-trading-hist", "wnd-trading", "wnd-hist", "Generation data pull", {
      protocol: "HTTPS",
      port: "443",
      direction: "target-to-source",
      trustBoundary: true,
      inspected: true,
      logged: true,
      encrypted: true
    }),
    conduit("wc-vendor-jump", "wnd-vendor", "wnd-jump", "OEM support tunnel", {
      protocol: "RDP",
      port: "3389",
      control: "jump-host",
      trustBoundary: true,
      encrypted: true,
      jumpHostRequired: true,
      ruleOwner: "Vendor access owner",
      notes: "OEM account lacks MFA and session recording."
    }),
    conduit("wc-jump-ews", "wnd-jump", "wnd-ews", "Brokered engineering access", {
      protocol: "RDP",
      port: "3389",
      control: "jump-host",
      trustBoundary: true,
      inspected: true,
      logged: true,
      encrypted: true,
      jumpHostRequired: true
    }),
    conduit("wc-hist-scada", "wnd-hist", "wnd-scada", "Historian collection", {
      protocol: "OPC UA",
      port: "4840",
      direction: "target-to-source",
      trustBoundary: true,
      inspected: true,
      logged: true,
      encrypted: true
    }),
    conduit("wc-scada-hmi", "wnd-scada", "wnd-hmi", "Operator display", {
      protocol: "HTTPS",
      port: "443",
      direction: "bidirectional",
      control: "routed"
    }),
    conduit("wc-scada-wtg", "wnd-scada", "wnd-wtg", "SCADA to turbines", {
      protocol: "IEC 61400-25",
      port: "0",
      direction: "bidirectional",
      control: "routed",
      firewallRule: "any-any",
      trustBoundary: true,
      notes: "Broad rule across the turbine network."
    }),
    conduit("wc-scada-sub", "wnd-scada", "wnd-sub", "SCADA to substation", {
      protocol: "DNP3",
      port: "20000",
      direction: "bidirectional",
      control: "routed",
      trustBoundary: true
    }),
    conduit("wc-ews-wtg", "wnd-ews", "wnd-wtg", "Turbine maintenance", {
      protocol: "Vendor Tooling",
      port: "0",
      direction: "bidirectional",
      control: "routed",
      firewallRule: "unknown",
      trustBoundary: true,
      temporaryAccess: true,
      notes: "Turbine configuration path is undocumented and unlogged."
    }),
    conduit("wc-wtg-field", "wnd-wtg", "wnd-field", "Turbine I/O", {
      protocol: "Modbus RTU",
      port: "502",
      direction: "bidirectional",
      control: "routed"
    }),
    conduit("wc-met-scada", "wnd-met", "wnd-scada", "Met data", {
      protocol: "Modbus TCP",
      port: "502",
      direction: "source-to-target",
      control: "routed",
      trustBoundary: true
    })
  ]
};

export const windScenario: ScenarioMeta = {
  id: project.id,
  name: project.name,
  sector: "Renewables",
  summary:
    "Wind farm with IEC 61400-25 turbine controllers, a met mast, an IEC 61850 grid substation RTU and a SCADA control centre, with turbine-OEM remote access over the WAN.",
  standards: ["IEC 61400-25", "NERC CIP", "NIST SP 800-82"],
  project: applyLayout(project)
};
