import { PROJECT_SCHEMA_VERSION, type OtProject } from "../../models/types";
import { applyLayout, asset, conduit, controls, laneY, type ScenarioMeta } from "./builders";

const project: OtProject = {
  schemaVersion: PROJECT_SCHEMA_VERSION,
  id: "scenario-building",
  name: "Building Automation System",
  updatedAt: new Date().toISOString(),
  assumptions: [
    { id: "advisory", label: "Advisory model only; not an ISA/IEC 62443 audit." },
    { id: "it-managed", label: "The BAS is managed by facilities IT on a largely flat VLAN." },
    { id: "scope", label: "Scope is HVAC, chiller plant, and door access for one commercial campus." }
  ],
  zoneTargets: { level1: 2, level2: 2, level3: 2 },
  subnets: [
    { id: "sn-it", name: "Corporate IT", cidr: "10.80.0.0/16", vlan: "IT" },
    { id: "sn-bus", name: "Facilities IT", cidr: "10.81.0.0/24", vlan: "FAC" },
    { id: "sn-idmz", name: "Edge / DMZ", cidr: "10.85.0.0/24", vlan: "DMZ" },
    { id: "sn-bas", name: "BAS LAN", cidr: "10.82.10.0/24", vlan: "BAS-210" },
    { id: "sn-hvac", name: "HVAC Controllers", cidr: "10.82.20.0/24", vlan: "HVAC-220" },
    { id: "sn-access", name: "Access Control", cidr: "10.82.25.0/24", vlan: "ACS-225" },
    { id: "sn-field", name: "Zone Devices", cidr: "10.82.30.0/24", vlan: "FIELD-230" }
  ],
  assets: [
    asset("bas-corp", "Corporate IT", "enterprise-it", "level5", 96, laneY.level5, {
      subnetId: "sn-it",
      ipAddress: "10.80.0.0/16",
      protocols: ["HTTPS", "RDP", "SMB"],
      controls: controls.strong
    }),
    asset("bas-cloud", "Vendor Analytics Cloud", "cloud-service", "level5", 672, laneY.level5, {
      ipAddress: "198.51.100.90",
      protocols: ["HTTPS", "MQTT"],
      criticality: "medium",
      owner: "BAS cloud vendor",
      controls: { ...controls.moderate, safetyValidated: false }
    }),
    asset("bas-vendor", "BAS Integrator Remote", "vendor-remote", "level5", 960, laneY.level5, {
      ipAddress: "203.0.113.90",
      protocols: ["Niagara Fox", "RDP"],
      criticality: "high",
      owner: "Controls integrator",
      controls: { ...controls.weak, remoteAccessApproved: true }
    }),
    asset("bas-tenant", "Facilities IT", "enterprise-it", "level4", 384, laneY.level4, {
      subnetId: "sn-bus",
      ipAddress: "10.81.0.20",
      protocols: ["HTTPS", "SMB"],
      controls: controls.moderate
    }),
    asset("bas-fw", "Edge Firewall", "firewall", "level3", 96, laneY.level3, {
      subnetId: "sn-idmz",
      ipAddress: "10.85.0.1",
      criticality: "high",
      controls: controls.moderate
    }),
    asset("bas-super", "Niagara Supervisor", "scada", "level3", 672, laneY.level3, {
      subnetId: "sn-bas",
      ipAddress: "10.82.10.10",
      protocols: ["Niagara Fox", "BACnet/IP", "HTTPS"],
      criticality: "high",
      manufacturer: "Tridium",
      model: "JACE / Niagara 4",
      lifecycleStatus: "limited",
      controls: { ...controls.weak, endpointProtection: true }
    }),
    asset("bas-server", "BAS Front-End Server", "hmi", "level2", 240, laneY.level2, {
      subnetId: "sn-bas",
      ipAddress: "10.82.10.20",
      protocols: ["BACnet/IP", "HTTPS"],
      criticality: "medium",
      controls: controls.weak
    }),
    asset("bas-ws", "BAS Workstation", "engineering-workstation", "level2", 528, laneY.level2, {
      subnetId: "sn-bas",
      ipAddress: "10.82.10.30",
      protocols: ["Niagara Fox", "RDP"],
      criticality: "medium",
      controls: controls.weak
    }),
    asset("bas-access", "Access Control Server", "enterprise-it", "level2", 816, laneY.level2, {
      subnetId: "sn-bas",
      ipAddress: "10.82.10.40",
      protocols: ["HTTPS", "OSDP"],
      criticality: "high",
      controls: controls.moderate
    }),
    asset("bas-ahu", "AHU Controller", "plc-rtu", "level1", 96, laneY.level1, {
      subnetId: "sn-hvac",
      ipAddress: "10.82.20.11",
      protocols: ["BACnet/IP"],
      criticality: "medium",
      manufacturer: "Distech Controls",
      model: "ECB-PTU",
      controls: controls.weak
    }),
    asset("bas-vav", "VAV Controllers", "plc-rtu", "level1", 384, laneY.level1, {
      subnetId: "sn-hvac",
      ipAddress: "10.82.20.12",
      protocols: ["BACnet/IP", "BACnet MS/TP"],
      criticality: "low",
      controls: controls.weak
    }),
    asset("bas-chiller", "Chiller Plant Controller", "plc-rtu", "level1", 672, laneY.level1, {
      subnetId: "sn-hvac",
      ipAddress: "10.82.20.13",
      protocols: ["BACnet/IP", "Modbus TCP"],
      // Loss of chilled water takes the served load with it, and egress control is life safety.
      // Both were authored "high" alongside twelve others, which left this the only scenario with
      // no critical asset at all — and therefore a free full score on resilience.
      criticality: "critical",
      backupStatus: "missing",
      criticalProcessTag: "Chilled water",
      controls: controls.weak
    }),
    asset("bas-acpanel", "Door Access Panel", "plc-rtu", "level1", 960, laneY.level1, {
      subnetId: "sn-access",
      ipAddress: "10.82.25.11",
      protocols: ["OSDP", "BACnet/IP"],
      criticality: "critical",
      backupStatus: "missing",
      criticalProcessTag: "Egress and access control",
      controls: controls.weak
    }),
    asset("bas-sensors", "Zone Sensors & Actuators", "field-device", "level0", 384, laneY.level0, {
      subnetId: "sn-field",
      ipAddress: "10.82.30.0/24",
      protocols: ["BACnet MS/TP"],
      criticality: "low",
      controls: controls.weak
    })
  ],
  conduits: [
    conduit("ac-corp-fw", "bas-corp", "bas-fw", "Corporate to edge", {
      protocol: "HTTPS",
      port: "443",
      trustBoundary: true,
      inspected: true,
      logged: true,
      encrypted: true
    }),
    conduit("ac-corp-server", "bas-corp", "bas-server", "Facilities portal access", {
      protocol: "HTTPS",
      port: "443",
      direction: "bidirectional",
      control: "routed",
      trustBoundary: true,
      notes: "BAS front-end is reachable directly from corporate IT, bypassing a DMZ broker."
    }),
    conduit("ac-cloud-super", "bas-cloud", "bas-super", "Cloud analytics link", {
      protocol: "MQTT",
      port: "8883",
      direction: "bidirectional",
      control: "routed",
      trustBoundary: true,
      encrypted: true,
      notes: "Supervisor maintains an outbound cloud tunnel; inbound exposure not inspected."
    }),
    conduit("ac-vendor-super", "bas-vendor", "bas-super", "Integrator remote access", {
      protocol: "Niagara Fox",
      port: "4911",
      direction: "bidirectional",
      control: "routed",
      trustBoundary: true,
      encrypted: true,
      ruleOwner: "Integrator",
      notes: "Vendor reaches the supervisor directly with no jump host and no MFA."
    }),
    conduit("ac-super-server", "bas-super", "bas-server", "Supervisor to front end", {
      protocol: "Niagara Fox",
      port: "1911",
      direction: "bidirectional",
      control: "routed"
    }),
    conduit("ac-ws-super", "bas-ws", "bas-super", "Engineering to supervisor", {
      protocol: "Niagara Fox",
      port: "1911",
      direction: "bidirectional",
      control: "routed",
      firewallRule: "unknown",
      notes: "Workstation programs the supervisor over an undocumented rule."
    }),
    conduit("ac-super-ahu", "bas-super", "bas-ahu", "Supervisor to AHU", {
      protocol: "BACnet/IP",
      port: "47808",
      direction: "bidirectional",
      control: "routed",
      firewallRule: "any-any",
      trustBoundary: true,
      notes: "Flat BACnet broadcast domain."
    }),
    conduit("ac-super-vav", "bas-super", "bas-vav", "Supervisor to VAV", {
      protocol: "BACnet/IP",
      port: "47808",
      direction: "bidirectional",
      control: "routed",
      firewallRule: "any-any",
      trustBoundary: true
    }),
    conduit("ac-super-chiller", "bas-super", "bas-chiller", "Supervisor to chiller plant", {
      protocol: "BACnet/IP",
      port: "47808",
      direction: "bidirectional",
      control: "routed",
      trustBoundary: true
    }),
    conduit("ac-access-panel", "bas-access", "bas-acpanel", "Access control to door panel", {
      protocol: "OSDP",
      port: "47808",
      direction: "bidirectional",
      control: "routed",
      trustBoundary: true
    }),
    conduit("ac-ahu-sensors", "bas-ahu", "bas-sensors", "Zone I/O", {
      protocol: "BACnet MS/TP",
      port: "47808",
      direction: "bidirectional",
      control: "routed"
    }),
    conduit("ac-chiller-sensors", "bas-chiller", "bas-sensors", "Plant I/O", {
      protocol: "BACnet MS/TP",
      port: "47808",
      direction: "bidirectional",
      control: "routed"
    })
  ]
};

export const buildingAutomationScenario: ScenarioMeta = {
  id: project.id,
  name: project.name,
  sector: "Building Automation",
  summary:
    "Commercial building automation with a Tridium Niagara supervisor, flat BACnet HVAC controllers, door access, and an internet-facing cloud analytics tunnel.",
  standards: ["ASHRAE 135 (BACnet)", "NIST SP 800-82", "ISA/IEC 62443"],
  project: applyLayout(project)
};
