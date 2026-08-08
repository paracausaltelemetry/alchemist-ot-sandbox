import { PROJECT_SCHEMA_VERSION, type OtProject } from "../../models/types";
import { applyLayout, asset, conduit, controls, laneY, type ScenarioMeta } from "./builders";

const project: OtProject = {
  schemaVersion: PROJECT_SCHEMA_VERSION,
  id: "scenario-water",
  name: "Water Treatment Plant",
  updatedAt: new Date().toISOString(),
  assumptions: [
    { id: "advisory", label: "Advisory model only; not an ISA/IEC 62443 certification." },
    { id: "remote", label: "Remote lift stations communicate over licensed radio and cellular backhaul." },
    { id: "scope", label: "Scope covers the treatment plant and three SCADA-polled outstations." }
  ],
  zoneTargets: { level1: 3, level2: 3, level3: 2 },
  subnets: [
    { id: "sn-it", name: "Corporate IT", cidr: "10.50.0.0/16", vlan: "IT" },
    { id: "sn-bus", name: "LIMS / Billing", cidr: "10.51.0.0/24", vlan: "BUS" },
    { id: "sn-idmz", name: "IT/OT DMZ", cidr: "10.55.0.0/24", vlan: "IDMZ" },
    { id: "sn-ops", name: "Operations", cidr: "10.53.0.0/24", vlan: "OPS-300" },
    { id: "sn-ctrl", name: "Control LAN", cidr: "10.52.10.0/24", vlan: "CTRL-210" },
    { id: "sn-plc", name: "Process PLCs", cidr: "10.52.20.0/24", vlan: "PLC-220" },
    { id: "sn-remote", name: "Remote Sites (radio)", cidr: "10.52.30.0/24", vlan: "RADIO-230" },
    { id: "sn-field", name: "Field Instruments", cidr: "10.52.40.0/24", vlan: "FIELD-240" }
  ],
  assets: [
    asset("wtr-corp", "Corporate IT", "enterprise-it", "level5", 96, laneY.level5, {
      subnetId: "sn-it",
      ipAddress: "10.50.0.0/16",
      protocols: ["HTTPS", "RDP", "SMB"],
      criticality: "medium",
      controls: controls.strong
    }),
    asset("wtr-vendor", "Integrator Remote Access", "vendor-remote", "level5", 672, laneY.level5, {
      ipAddress: "203.0.113.40",
      protocols: ["VPN", "RDP"],
      criticality: "high",
      owner: "SCADA integrator",
      controls: { ...controls.weak, remoteAccessApproved: true }
    }),
    asset("wtr-lims", "LIMS / Billing", "enterprise-it", "level4", 384, laneY.level4, {
      subnetId: "sn-bus",
      ipAddress: "10.51.0.20",
      protocols: ["HTTPS", "SQL"],
      controls: controls.strong
    }),
    asset("wtr-fw", "IT/OT Firewall", "firewall", "level3", 96, laneY.level3, {
      subnetId: "sn-idmz",
      ipAddress: "10.55.0.1",
      criticality: "critical",
      backupStatus: "verified",
      controls: controls.strong
    }),
    asset("wtr-jump", "OT Jump Host", "jump-host", "level3", 384, laneY.level3, {
      subnetId: "sn-idmz",
      ipAddress: "10.55.10.10",
      protocols: ["RDP", "SSH"],
      criticality: "critical",
      backupStatus: "verified",
      controls: controls.strong
    }),
    asset("wtr-hist", "Plant Historian", "historian", "level3", 672, laneY.level3, {
      subnetId: "sn-ops",
      ipAddress: "10.53.0.15",
      protocols: ["OPC UA", "SQL"],
      criticality: "high",
      controls: controls.moderate
    }),
    asset("wtr-scada", "Plant SCADA Server", "scada", "level2", 240, laneY.level2, {
      subnetId: "sn-ctrl",
      ipAddress: "10.52.10.20",
      protocols: ["DNP3", "Modbus TCP"],
      criticality: "critical",
      backupStatus: "configured",
      manufacturer: "Schneider Electric",
      model: "EcoStruxure Geo SCADA",
      controls: controls.moderate
    }),
    asset("wtr-hmi", "Operator HMI", "hmi", "level2", 528, laneY.level2, {
      subnetId: "sn-ctrl",
      ipAddress: "10.52.10.40",
      protocols: ["DNP3", "HTTPS"],
      criticality: "high",
      controls: controls.moderate
    }),
    asset("wtr-ews", "Engineering Workstation", "engineering-workstation", "level2", 816, laneY.level2, {
      subnetId: "sn-ctrl",
      ipAddress: "10.52.10.55",
      protocols: ["RDP", "Vendor Tooling", "Modbus TCP"],
      criticality: "high",
      lifecycleStatus: "limited",
      controls: { ...controls.weak, endpointProtection: true, defaultCredentialsDisabled: true }
    }),
    asset("wtr-plc-filter", "Filtration PLC", "plc-rtu", "level1", 96, laneY.level1, {
      subnetId: "sn-plc",
      ipAddress: "10.52.20.11",
      protocols: ["Modbus TCP", "EtherNet/IP"],
      criticality: "critical",
      backupStatus: "missing",
      manufacturer: "Rockwell Automation",
      model: "ControlLogix 1756-L8",
      lifecycleStatus: "limited",
      criticalProcessTag: "Filtration",
      controls: { ...controls.weak, defaultCredentialsDisabled: true }
    }),
    asset("wtr-plc-pump", "Pump Station PLC", "plc-rtu", "level1", 384, laneY.level1, {
      subnetId: "sn-plc",
      ipAddress: "10.52.20.12",
      protocols: ["Modbus TCP"],
      criticality: "critical",
      backupStatus: "missing",
      criticalProcessTag: "Raw water pumping",
      controls: controls.weak
    }),
    asset("wtr-chlorine", "Chlorine Dosing Controller", "plc-rtu", "level1", 672, laneY.level1, {
      subnetId: "sn-plc",
      ipAddress: "10.52.20.13",
      protocols: ["Modbus TCP"],
      criticality: "critical",
      backupStatus: "missing",
      criticalProcessTag: "Disinfection",
      controls: controls.weak
    }),
    asset("wtr-radio", "Radio / Cellular Gateway", "wireless-gateway", "level1", 960, laneY.level1, {
      subnetId: "sn-remote",
      ipAddress: "10.52.30.1",
      protocols: ["DNP3"],
      criticality: "high",
      controls: controls.weak
    }),
    asset("wtr-rtu-lift", "Lift Station RTU", "plc-rtu", "level1", 1248, laneY.level1, {
      subnetId: "sn-remote",
      ipAddress: "10.52.30.21",
      protocols: ["DNP3"],
      criticality: "high",
      manufacturer: "SEL",
      model: "SEL-3530 RTAC",
      lifecycleStatus: "obsolete",
      controls: controls.weak
    }),
    asset("wtr-level", "Level / Flow Sensors", "field-device", "level0", 240, laneY.level0, {
      subnetId: "sn-field",
      ipAddress: "10.52.40.0/24",
      protocols: ["HART", "Modbus RTU"],
      criticality: "high",
      controls: controls.weak
    }),
    asset("wtr-turbidity", "Turbidity Analyzer", "field-device", "level0", 528, laneY.level0, {
      subnetId: "sn-field",
      ipAddress: "10.52.40.30",
      protocols: ["Modbus RTU"],
      criticality: "medium",
      controls: controls.weak
    })
  ],
  conduits: [
    conduit("wc-corp-fw", "wtr-corp", "wtr-fw", "IT to IDMZ services", {
      protocol: "HTTPS",
      port: "443",
      trustBoundary: true,
      inspected: true,
      logged: true,
      encrypted: true,
      notes: "Published IDMZ services only."
    }),
    conduit("wc-lims-hist", "wtr-lims", "wtr-hist", "Reporting pull from historian", {
      protocol: "HTTPS",
      port: "443",
      direction: "target-to-source",
      trustBoundary: true,
      inspected: true,
      logged: true,
      encrypted: true
    }),
    conduit("wc-vendor-jump", "wtr-vendor", "wtr-jump", "Integrator support tunnel", {
      protocol: "RDP",
      port: "3389",
      control: "jump-host",
      trustBoundary: true,
      encrypted: true,
      jumpHostRequired: true,
      ruleOwner: "Vendor access owner",
      notes: "Vendor account has no MFA and session logging is disabled."
    }),
    conduit("wc-jump-ews", "wtr-jump", "wtr-ews", "Brokered engineering access", {
      protocol: "RDP",
      port: "3389",
      control: "jump-host",
      trustBoundary: true,
      inspected: true,
      logged: true,
      encrypted: true,
      jumpHostRequired: true
    }),
    conduit("wc-hist-scada", "wtr-hist", "wtr-scada", "Historian collection", {
      protocol: "OPC UA",
      port: "4840",
      direction: "target-to-source",
      trustBoundary: true,
      inspected: true,
      logged: true,
      encrypted: true
    }),
    conduit("wc-scada-hmi", "wtr-scada", "wtr-hmi", "Supervisory display", {
      protocol: "DNP3",
      port: "20000",
      direction: "bidirectional",
      control: "routed"
    }),
    conduit("wc-scada-filter", "wtr-scada", "wtr-plc-filter", "SCADA to filtration PLC", {
      protocol: "Modbus TCP",
      port: "502",
      direction: "bidirectional",
      control: "routed",
      firewallRule: "any-any",
      trustBoundary: true,
      notes: "Broad control rule, no inspection or logging."
    }),
    conduit("wc-scada-pump", "wtr-scada", "wtr-plc-pump", "SCADA to pump PLC", {
      protocol: "Modbus TCP",
      port: "502",
      direction: "bidirectional",
      control: "routed",
      trustBoundary: true
    }),
    conduit("wc-scada-chlorine", "wtr-scada", "wtr-chlorine", "SCADA to dosing controller", {
      protocol: "Modbus TCP",
      port: "502",
      direction: "bidirectional",
      control: "routed",
      firewallRule: "any-any",
      trustBoundary: true,
      notes: "Disinfection control reachable on a flat rule."
    }),
    conduit("wc-ews-filter", "wtr-ews", "wtr-plc-filter", "Engineering download", {
      protocol: "Vendor Tooling",
      port: "44818",
      direction: "bidirectional",
      control: "routed",
      firewallRule: "unknown",
      trustBoundary: true,
      temporaryAccess: true,
      notes: "Programming path is undocumented and unlogged."
    }),
    conduit("wc-radio-scada", "wtr-radio", "wtr-scada", "Remote telemetry over radio", {
      protocol: "DNP3",
      port: "20000",
      direction: "bidirectional",
      control: "routed",
      firewallRule: "any-any",
      trustBoundary: true,
      notes: "Wide-area radio link is unmonitored."
    }),
    conduit("wc-lift-radio", "wtr-rtu-lift", "wtr-radio", "Lift station backhaul", {
      protocol: "DNP3",
      port: "20000",
      direction: "bidirectional",
      control: "routed"
    }),
    conduit("wc-filter-level", "wtr-plc-filter", "wtr-level", "Process I/O", {
      protocol: "Modbus RTU",
      port: "502",
      direction: "bidirectional",
      control: "routed"
    }),
    conduit("wc-pump-turbidity", "wtr-plc-pump", "wtr-turbidity", "Analyzer I/O", {
      protocol: "Modbus RTU",
      port: "502",
      direction: "bidirectional",
      control: "routed"
    })
  ]
};

export const waterScenario: ScenarioMeta = {
  id: project.id,
  name: project.name,
  sector: "Water / Wastewater",
  summary:
    "Municipal water treatment plant with SCADA-polled pump and dosing PLCs, radio-linked lift stations, and an integrator remote-access path.",
  standards: ["AWWA / EPA", "CISA Water Sector", "NIST SP 800-82"],
  project: applyLayout(project)
};
