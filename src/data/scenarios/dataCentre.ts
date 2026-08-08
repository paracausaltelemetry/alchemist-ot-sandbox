import { PROJECT_SCHEMA_VERSION, type OtProject } from "../../models/types";
import { applyLayout, asset, conduit, controls, laneY, type ScenarioMeta } from "./builders";

const project: OtProject = {
  schemaVersion: PROJECT_SCHEMA_VERSION,
  id: "scenario-data-centre",
  name: "Data Centre Facility",
  updatedAt: new Date().toISOString(),
  assumptions: [
    { id: "advisory", label: "Advisory model only; not an Uptime Institute or 62443 assessment." },
    { id: "scope", label: "Scope is the facility OT (BMS/EPMS), not the IT compute estate." },
    { id: "illustrative", label: "Illustrative facility, not based on any specific site." }
  ],
  zoneTargets: { level1: 2, level2: 2, level3: 2 },
  subnets: [
    { id: "sn-it", name: "Corporate IT", cidr: "10.120.0.0/16", vlan: "IT" },
    { id: "sn-bus", name: "DCIM / ITSM", cidr: "10.121.0.0/24", vlan: "BUS" },
    { id: "sn-idmz", name: "Edge / DMZ", cidr: "10.125.0.0/24", vlan: "DMZ" },
    { id: "sn-ops", name: "Operations", cidr: "10.123.0.0/24", vlan: "OPS-300" },
    { id: "sn-bms", name: "BMS / EPMS LAN", cidr: "10.122.10.0/24", vlan: "BMS-210" },
    { id: "sn-plant", name: "Plant Controllers", cidr: "10.122.20.0/24", vlan: "PLANT-220" },
    { id: "sn-field", name: "Sensors & Meters", cidr: "10.122.30.0/24", vlan: "FIELD-230" }
  ],
  assets: [
    asset("dc-corp", "Corporate IT", "enterprise-it", "level5", 96, laneY.level5, {
      subnetId: "sn-it",
      ipAddress: "10.120.0.0/16",
      protocols: ["HTTPS", "RDP", "SMB"],
      controls: controls.strong
    }),
    asset("dc-cloud", "Vendor Monitoring Cloud", "cloud-service", "level5", 672, laneY.level5, {
      ipAddress: "198.51.100.120",
      protocols: ["HTTPS", "MQTT"],
      criticality: "medium",
      owner: "BMS cloud vendor",
      controls: controls.moderate
    }),
    asset("dc-vendor", "Facilities Vendor Remote", "vendor-remote", "level5", 960, laneY.level5, {
      ipAddress: "203.0.113.130",
      protocols: ["VPN", "RDP"],
      criticality: "high",
      owner: "Facilities contractor",
      controls: { ...controls.weak, remoteAccessApproved: true }
    }),
    asset("dc-dcim", "DCIM / ITSM", "enterprise-it", "level4", 384, laneY.level4, {
      subnetId: "sn-bus",
      ipAddress: "10.121.0.20",
      protocols: ["HTTPS", "SNMP"],
      criticality: "high",
      controls: controls.moderate
    }),
    asset("dc-fw", "Edge Firewall", "firewall", "level3", 96, laneY.level3, {
      subnetId: "sn-idmz",
      ipAddress: "10.125.0.1",
      criticality: "critical",
      backupStatus: "verified",
      controls: controls.strong
    }),
    asset("dc-jump", "OT Jump Host", "jump-host", "level3", 384, laneY.level3, {
      subnetId: "sn-idmz",
      ipAddress: "10.125.0.10",
      protocols: ["RDP", "SSH"],
      criticality: "critical",
      backupStatus: "verified",
      controls: controls.strong
    }),
    asset("dc-hist", "BMS Historian", "historian", "level3", 672, laneY.level3, {
      subnetId: "sn-ops",
      ipAddress: "10.123.0.15",
      protocols: ["OPC UA", "SQL"],
      criticality: "high",
      controls: controls.moderate
    }),
    asset("dc-bms", "BMS Supervisor", "scada", "level2", 240, laneY.level2, {
      subnetId: "sn-bms",
      ipAddress: "10.122.10.20",
      protocols: ["BACnet/IP", "Modbus TCP"],
      criticality: "critical",
      backupStatus: "configured",
      manufacturer: "Schneider Electric",
      model: "EcoStruxure Building",
      controls: controls.moderate
    }),
    asset("dc-hmi", "Facilities HMI", "hmi", "level2", 528, laneY.level2, {
      subnetId: "sn-bms",
      ipAddress: "10.122.10.40",
      protocols: ["BACnet/IP", "HTTPS"],
      criticality: "high",
      controls: controls.moderate
    }),
    asset("dc-ews", "Controls Workstation", "engineering-workstation", "level2", 816, laneY.level2, {
      subnetId: "sn-bms",
      ipAddress: "10.122.10.55",
      protocols: ["Vendor Tooling", "RDP"],
      criticality: "medium",
      controls: controls.weak
    }),
    asset("dc-epms", "EPMS / Power Controller", "plc-rtu", "level1", 96, laneY.level1, {
      subnetId: "sn-plant",
      ipAddress: "10.122.20.11",
      protocols: ["Modbus TCP"],
      criticality: "critical",
      backupStatus: "missing",
      criticalProcessTag: "Power distribution",
      controls: controls.weak
    }),
    asset("dc-crah", "Cooling / CRAH PLC", "plc-rtu", "level1", 384, laneY.level1, {
      subnetId: "sn-plant",
      ipAddress: "10.122.20.12",
      protocols: ["BACnet/IP", "Modbus TCP"],
      criticality: "critical",
      backupStatus: "missing",
      criticalProcessTag: "Cooling",
      controls: controls.weak
    }),
    asset("dc-gen", "Generator Controller", "plc-rtu", "level1", 672, laneY.level1, {
      subnetId: "sn-plant",
      ipAddress: "10.122.20.13",
      protocols: ["Modbus TCP"],
      criticality: "critical",
      backupStatus: "missing",
      criticalProcessTag: "Standby power",
      controls: controls.weak
    }),
    asset("dc-field", "Sensors & Power Meters", "field-device", "level0", 384, laneY.level0, {
      subnetId: "sn-field",
      ipAddress: "10.122.30.0/24",
      protocols: ["Modbus RTU", "BACnet MS/TP"],
      criticality: "high",
      controls: controls.weak
    })
  ],
  conduits: [
    conduit("dcc-corp-fw", "dc-corp", "dc-fw", "Corporate to edge", {
      protocol: "HTTPS",
      port: "443",
      trustBoundary: true,
      inspected: true,
      logged: true,
      encrypted: true
    }),
    conduit("dcc-dcim-hist", "dc-dcim", "dc-hist", "Facilities reporting", {
      protocol: "HTTPS",
      port: "443",
      direction: "target-to-source",
      trustBoundary: true,
      inspected: true,
      logged: true,
      encrypted: true
    }),
    conduit("dcc-cloud-bms", "dc-cloud", "dc-bms", "Cloud analytics link", {
      protocol: "MQTT",
      port: "8883",
      direction: "bidirectional",
      control: "routed",
      trustBoundary: true,
      encrypted: true,
      notes: "Supervisor maintains an outbound cloud tunnel; inbound exposure not inspected."
    }),
    conduit("dcc-vendor-jump", "dc-vendor", "dc-jump", "Vendor support tunnel", {
      protocol: "RDP",
      port: "3389",
      control: "jump-host",
      trustBoundary: true,
      encrypted: true,
      jumpHostRequired: true,
      ruleOwner: "Vendor access owner",
      notes: "Vendor account lacks MFA and session recording."
    }),
    conduit("dcc-jump-ews", "dc-jump", "dc-ews", "Brokered controls access", {
      protocol: "RDP",
      port: "3389",
      control: "jump-host",
      trustBoundary: true,
      inspected: true,
      logged: true,
      encrypted: true,
      jumpHostRequired: true
    }),
    conduit("dcc-hist-bms", "dc-hist", "dc-bms", "Historian collection", {
      protocol: "OPC UA",
      port: "4840",
      direction: "target-to-source",
      trustBoundary: true,
      inspected: true,
      logged: true,
      encrypted: true
    }),
    conduit("dcc-bms-hmi", "dc-bms", "dc-hmi", "Operator display", {
      protocol: "BACnet/IP",
      port: "47808",
      direction: "bidirectional",
      control: "routed"
    }),
    conduit("dcc-bms-epms", "dc-bms", "dc-epms", "BMS to power controller", {
      protocol: "Modbus TCP",
      port: "502",
      direction: "bidirectional",
      control: "routed",
      firewallRule: "any-any",
      trustBoundary: true,
      notes: "Flat facilities network with a broad control rule."
    }),
    conduit("dcc-bms-crah", "dc-bms", "dc-crah", "BMS to cooling", {
      protocol: "BACnet/IP",
      port: "47808",
      direction: "bidirectional",
      control: "routed",
      trustBoundary: true
    }),
    conduit("dcc-bms-gen", "dc-bms", "dc-gen", "BMS to generator", {
      protocol: "Modbus TCP",
      port: "502",
      direction: "bidirectional",
      control: "routed",
      trustBoundary: true
    }),
    conduit("dcc-epms-field", "dc-epms", "dc-field", "Metering I/O", {
      protocol: "Modbus RTU",
      port: "502",
      direction: "bidirectional",
      control: "routed"
    }),
    conduit("dcc-crah-field", "dc-crah", "dc-field", "Cooling I/O", {
      protocol: "BACnet MS/TP",
      port: "47808",
      direction: "bidirectional",
      control: "routed"
    })
  ]
};

export const dataCentreScenario: ScenarioMeta = {
  id: project.id,
  name: project.name,
  sector: "Data Centre",
  summary:
    "Data-centre facility OT: a BMS/EPMS supervisor controlling power, cooling and standby generators over a flat BACnet/Modbus network, with a cloud analytics tunnel and a facilities-vendor remote path.",
  standards: ["Uptime Institute", "ISO/IEC 27001", "NIST SP 800-82"],
  project: applyLayout(project)
};
