import { PROJECT_SCHEMA_VERSION, type OtProject } from "../../models/types";
import { applyLayout, asset, conduit, controls, laneY, type ScenarioMeta } from "./builders";

const project: OtProject = {
  schemaVersion: PROJECT_SCHEMA_VERSION,
  id: "scenario-substation",
  name: "Electric Substation",
  updatedAt: new Date().toISOString(),
  assumptions: [
    { id: "advisory", label: "Advisory model only; not a NERC CIP compliance audit." },
    { id: "esp", label: "The ESP firewall is the only declared Electronic Access Point to the station bus." },
    { id: "ira", label: "Interactive remote access is expected to traverse the intermediate system." }
  ],
  zoneTargets: { level1: 3, level2: 3, level3: 2 },
  subnets: [
    { id: "sn-corp", name: "Corporate / Utility IT", cidr: "10.60.0.0/16", vlan: "IT" },
    { id: "sn-wan", name: "Control Centre WAN", cidr: "10.61.0.0/24", vlan: "WAN" },
    { id: "sn-esp", name: "ESP / Access Point", cidr: "10.65.0.0/24", vlan: "ESP" },
    { id: "sn-station", name: "Station Bus", cidr: "10.62.10.0/24", vlan: "STN-210" },
    { id: "sn-bay", name: "Bay / Protection", cidr: "10.62.20.0/24", vlan: "BAY-220" },
    { id: "sn-process", name: "Process Bus", cidr: "10.62.30.0/24", vlan: "PROC-230" }
  ],
  assets: [
    asset("sub-corp", "Corporate IT", "enterprise-it", "level5", 96, laneY.level5, {
      subnetId: "sn-corp",
      ipAddress: "10.60.0.0/16",
      protocols: ["HTTPS", "RDP", "SMB"],
      controls: controls.strong
    }),
    asset("sub-vendor", "Relay Vendor Remote", "vendor-remote", "level5", 672, laneY.level5, {
      ipAddress: "198.51.100.60",
      protocols: ["VPN", "RDP"],
      criticality: "high",
      owner: "Protection vendor",
      controls: { ...controls.weak, remoteAccessApproved: true }
    }),
    asset("sub-wan", "Control Centre EMS (ICCP)", "enterprise-it", "level4", 384, laneY.level4, {
      subnetId: "sn-wan",
      ipAddress: "10.61.0.10",
      protocols: ["ICCP / TASE.2", "HTTPS"],
      criticality: "high",
      controls: controls.strong
    }),
    asset("sub-eap", "ESP Firewall (EAP)", "firewall", "level3", 96, laneY.level3, {
      subnetId: "sn-esp",
      ipAddress: "10.65.0.1",
      criticality: "critical",
      backupStatus: "verified",
      controls: controls.strong
    }),
    asset("sub-is", "Intermediate System", "jump-host", "level3", 384, laneY.level3, {
      subnetId: "sn-esp",
      ipAddress: "10.65.0.10",
      protocols: ["RDP", "SSH"],
      criticality: "critical",
      backupStatus: "verified",
      controls: controls.strong
    }),
    asset("sub-gw", "Station Gateway / RTU", "scada", "level3", 672, laneY.level3, {
      subnetId: "sn-station",
      ipAddress: "10.62.10.5",
      protocols: ["DNP3", "IEC 61850 MMS", "ICCP / TASE.2"],
      criticality: "critical",
      backupStatus: "configured",
      manufacturer: "SEL",
      model: "SEL-3530 RTAC",
      controls: controls.moderate
    }),
    asset("sub-hmi", "Station HMI", "hmi", "level2", 240, laneY.level2, {
      subnetId: "sn-station",
      ipAddress: "10.62.10.40",
      protocols: ["IEC 61850 MMS", "HTTPS"],
      criticality: "high",
      controls: controls.moderate
    }),
    asset("sub-ews", "Relay Engineering WS", "engineering-workstation", "level2", 528, laneY.level2, {
      subnetId: "sn-station",
      ipAddress: "10.62.10.55",
      protocols: ["IEC 61850 MMS", "Vendor Tooling", "SSH"],
      criticality: "high",
      lifecycleStatus: "limited",
      controls: { ...controls.weak, endpointProtection: true }
    }),
    asset("sub-relay-line", "Line Protection Relay", "plc-rtu", "level1", 96, laneY.level1, {
      subnetId: "sn-bay",
      ipAddress: "10.62.20.11",
      protocols: ["IEC 61850 MMS", "GOOSE", "DNP3"],
      criticality: "critical",
      backupStatus: "missing",
      manufacturer: "SEL",
      model: "SEL-411L",
      criticalProcessTag: "Line protection",
      controls: { ...controls.weak, defaultCredentialsDisabled: true }
    }),
    asset("sub-relay-xfmr", "Transformer Protection Relay", "plc-rtu", "level1", 384, laneY.level1, {
      subnetId: "sn-bay",
      ipAddress: "10.62.20.12",
      protocols: ["IEC 61850 MMS", "GOOSE"],
      criticality: "critical",
      backupStatus: "missing",
      manufacturer: "GE",
      model: "Multilin T60",
      criticalProcessTag: "Transformer protection",
      controls: controls.weak
    }),
    asset("sub-bay", "Bay Controller", "plc-rtu", "level1", 672, laneY.level1, {
      subnetId: "sn-bay",
      ipAddress: "10.62.20.13",
      protocols: ["IEC 61850 MMS", "GOOSE"],
      criticality: "critical",
      backupStatus: "missing",
      manufacturer: "Siemens",
      model: "SIPROTEC 5",
      lifecycleStatus: "limited",
      controls: controls.weak
    }),
    asset("sub-mu", "Merging Units (CT/VT)", "field-device", "level0", 384, laneY.level0, {
      subnetId: "sn-process",
      ipAddress: "10.62.30.0/24",
      protocols: ["IEC 61850 Sampled Values", "GOOSE"],
      criticality: "high",
      controls: controls.weak
    })
  ],
  conduits: [
    conduit("sc-corp-eap", "sub-corp", "sub-eap", "Corporate to ESP", {
      protocol: "HTTPS",
      port: "443",
      trustBoundary: true,
      inspected: true,
      logged: true,
      encrypted: true
    }),
    conduit("sc-wan-gw", "sub-wan", "sub-gw", "Control centre ICCP link", {
      protocol: "ICCP / TASE.2",
      port: "102",
      direction: "bidirectional",
      trustBoundary: true,
      inspected: true,
      logged: true,
      encrypted: true,
      businessCritical: true
    }),
    conduit("sc-vendor-is", "sub-vendor", "sub-is", "Vendor interactive remote access", {
      protocol: "RDP",
      port: "3389",
      control: "jump-host",
      trustBoundary: true,
      encrypted: true,
      jumpHostRequired: true,
      ruleOwner: "Vendor access owner",
      notes: "Vendor IRA account has no MFA and the session is not recorded."
    }),
    conduit("sc-is-ews", "sub-is", "sub-ews", "Brokered relay engineering", {
      protocol: "RDP",
      port: "3389",
      control: "jump-host",
      trustBoundary: true,
      inspected: true,
      logged: true,
      encrypted: true,
      jumpHostRequired: true
    }),
    conduit("sc-gw-hmi", "sub-gw", "sub-hmi", "Station supervisory", {
      protocol: "IEC 61850 MMS",
      port: "102",
      direction: "bidirectional",
      control: "routed"
    }),
    conduit("sc-gw-relay-line", "sub-gw", "sub-relay-line", "Gateway to line relay", {
      protocol: "DNP3",
      port: "20000",
      direction: "bidirectional",
      control: "routed",
      trustBoundary: true
    }),
    conduit("sc-gw-relay-xfmr", "sub-gw", "sub-relay-xfmr", "Gateway to transformer relay", {
      protocol: "DNP3",
      port: "20000",
      direction: "bidirectional",
      control: "routed",
      trustBoundary: true
    }),
    conduit("sc-gw-bay", "sub-gw", "sub-bay", "Gateway to bay controller", {
      protocol: "IEC 61850 MMS",
      port: "102",
      direction: "bidirectional",
      control: "routed",
      trustBoundary: true
    }),
    conduit("sc-ews-relay-line", "sub-ews", "sub-relay-line", "Relay configuration", {
      protocol: "Vendor Tooling",
      port: "102",
      direction: "bidirectional",
      control: "routed",
      firewallRule: "unknown",
      trustBoundary: true,
      notes: "Routable engineering access to protection relays is unlogged."
    }),
    // GOOSE and Sampled Values are layer 2 multicast: no IP, no ports. These three carried port 102,
    // which is IEC 61850 MMS — a different protocol on the same standard's station bus.
    conduit("sc-relay-line-mu", "sub-relay-line", "sub-mu", "Sampled values / GOOSE", {
      protocol: "IEC 61850 Sampled Values",
      port: "",
      direction: "bidirectional",
      control: "routed",
      notes: "Layer 2 multicast on the process bus. It cannot be routed or filtered by port, so containment is the VLAN."
    }),
    conduit("sc-relay-xfmr-mu", "sub-relay-xfmr", "sub-mu", "Sampled values / GOOSE", {
      protocol: "IEC 61850 Sampled Values",
      port: "",
      direction: "bidirectional",
      control: "routed"
    }),
    conduit("sc-bay-mu", "sub-bay", "sub-mu", "Process bus GOOSE", {
      protocol: "GOOSE",
      port: "",
      direction: "bidirectional",
      control: "routed"
    })
  ]
};

export const substationScenario: ScenarioMeta = {
  id: project.id,
  name: project.name,
  sector: "Electric Power",
  summary:
    "Transmission substation with IEC 61850 protection relays, a station gateway with an ICCP control-centre link, and vendor interactive remote access across the ESP.",
  standards: ["NERC CIP", "IEC 61850", "NIST SP 800-82"],
  project: applyLayout(project)
};
