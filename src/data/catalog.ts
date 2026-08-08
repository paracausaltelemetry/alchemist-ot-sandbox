import type { AssetTypeDefinition, ScoreCategory, ZoneDefinition } from "../models/types";

export const zones: ZoneDefinition[] = [
  {
    id: "level5",
    name: "Enterprise IT",
    shortName: "L5",
    levelLabel: "Level 5",
    riskRank: 7,
    description: "Corporate identity, productivity, internet-facing, and enterprise services.",
    color: "#e7eef7"
  },
  {
    id: "level4",
    name: "Business Planning",
    shortName: "L4",
    levelLabel: "Level 4",
    riskRank: 6,
    description: "ERP, production planning, business reporting, and shared services.",
    color: "#edf3f9"
  },
  {
    id: "level3",
    name: "Operations Management",
    shortName: "L3",
    levelLabel: "Level 3",
    riskRank: 4,
    description: "Site operations, MES, OT AD, historians, and supervisory OT services.",
    color: "#eef7ed"
  },
  {
    id: "level2",
    name: "Supervisory Control",
    shortName: "L2",
    levelLabel: "Level 2",
    riskRank: 3,
    description: "SCADA servers, HMIs, batch systems, and engineering stations.",
    color: "#fff7e2"
  },
  {
    id: "level1",
    name: "Basic Control",
    shortName: "L1",
    levelLabel: "Level 1",
    riskRank: 2,
    description: "PLCs, RTUs, controllers, drives, and control logic interfaces.",
    color: "#fff0dd"
  },
  {
    id: "level0",
    name: "Process",
    shortName: "L0",
    levelLabel: "Level 0",
    riskRank: 1,
    description: "Sensors, actuators, instruments, and physical process devices.",
    color: "#fde9df"
  }
];

export const assetTypes: AssetTypeDefinition[] = [
  {
    id: "enterprise-it",
    label: "Enterprise IT",
    defaultZone: "level5",
    icon: "building",
    description: "Corporate IT workstation, server, or service network.",
    baseProtocols: ["HTTPS", "RDP", "SMB"]
  },
  {
    id: "firewall",
    label: "Firewall",
    defaultZone: "level3",
    icon: "shield",
    description: "Layer 3/4 firewall or segmentation gateway.",
    baseProtocols: []
  },
  {
    id: "jump-host",
    label: "Jump Host",
    defaultZone: "level3",
    icon: "key",
    description: "Brokered administrative access point.",
    baseProtocols: ["RDP", "SSH"]
  },
  {
    id: "historian",
    label: "Historian",
    defaultZone: "level3",
    icon: "database",
    description: "Process data historian or replication service.",
    baseProtocols: ["OPC UA", "HTTPS"]
  },
  {
    id: "engineering-workstation",
    label: "Engineering Workstation",
    defaultZone: "level2",
    icon: "monitor",
    description: "Engineering station used to configure control assets.",
    baseProtocols: ["RDP", "OPC UA", "Vendor Tooling"]
  },
  {
    id: "hmi",
    label: "HMI",
    defaultZone: "level2",
    icon: "panel",
    description: "Human-machine interface.",
    baseProtocols: ["OPC UA", "HTTPS"]
  },
  {
    id: "scada",
    label: "SCADA",
    defaultZone: "level2",
    icon: "activity",
    description: "SCADA server or control supervisory system.",
    baseProtocols: ["OPC UA", "DNP3", "Modbus TCP"]
  },
  {
    id: "plc-rtu",
    label: "PLC / RTU",
    defaultZone: "level1",
    icon: "cpu",
    description: "Programmable controller or remote terminal unit.",
    baseProtocols: ["Modbus TCP", "EtherNet/IP"]
  },
  {
    id: "safety-system",
    label: "Safety System",
    defaultZone: "level1",
    icon: "siren",
    description: "Safety instrumented system or safety controller.",
    baseProtocols: ["Vendor Safety Protocol"]
  },
  {
    id: "field-device",
    label: "Field Device",
    defaultZone: "level0",
    icon: "gauge",
    description: "Sensor, actuator, meter, or process instrument.",
    baseProtocols: ["HART", "Profinet"]
  },
  {
    id: "wireless-gateway",
    label: "Wireless Gateway",
    defaultZone: "level1",
    icon: "wifi",
    description: "Industrial wireless access point or gateway.",
    baseProtocols: ["WirelessHART", "HTTPS"]
  },
  {
    id: "vendor-remote",
    label: "Vendor Remote Access",
    defaultZone: "level5",
    icon: "users",
    description: "External vendor support system or tunnel endpoint.",
    baseProtocols: ["VPN", "RDP", "SSH"]
  },
  {
    id: "cloud-service",
    label: "Cloud Service",
    defaultZone: "level5",
    icon: "cloud",
    description: "Cloud analytics, maintenance, or monitoring platform.",
    baseProtocols: ["HTTPS", "MQTT"]
  }
];

export const categoryLabels: Record<ScoreCategory, string> = {
  segmentation: "Segmentation",
  remoteAccess: "Remote access",
  identity: "Identity and access",
  monitoring: "Monitoring and logging",
  resilience: "Resilience",
  legacyExposure: "Legacy exposure",
  safetyImpact: "Safety impact",
  documentation: "Documentation"
};

export const standardReferences = {
  nist80082: "NIST SP 800-82 Rev. 3: Guide to Operational Technology Security",
  nist80082r4: "NIST SP 800-82 Rev. 4 pre-draft direction, January 22 2026",
  isa62443: "ISA/IEC 62443 zones, conduits, and security levels",
  mitreIcs: "MITRE ATT&CK for ICS"
};

export function getZone(id: string): ZoneDefinition {
  return zones.find((zone) => zone.id === id) ?? zones[0];
}

export function getAssetType(id: string): AssetTypeDefinition {
  return assetTypes.find((type) => type.id === id) ?? assetTypes[0];
}
