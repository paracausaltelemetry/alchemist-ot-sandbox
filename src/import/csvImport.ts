import type { AssetTypeId } from "../models/types";
import { parseCsvRecords } from "./csv";
import { classifyPort } from "./inference";
import type { ImportedFlow, ImportedHost, ImportedPort, ParsedImport } from "./types";

const ALIASES = {
  name: ["name", "hostname", "host", "device", "devicename", "device name", "asset", "asset name", "label"],
  ip: ["ip", "ipaddress", "ip address", "address", "ipv4", "ip_address"],
  mac: ["mac", "macaddress", "mac address", "hwaddr"],
  vendor: ["vendor", "manufacturer", "make"],
  type: ["type", "assettype", "asset type", "devicetype", "device type", "category", "role", "class"],
  zone: ["zone", "level", "purdue", "purduelevel", "purdue level", "security level"],
  vlan: ["vlan", "vlanid", "vlan id"],
  protocols: ["protocols", "services", "service", "ports", "openports", "open ports"],
  criticality: ["criticality", "severity", "importance", "priority"],
  os: ["os", "operatingsystem", "operating system", "osfamily"],
  notes: ["notes", "description", "comment", "comments"]
};

const FLOW_SOURCE = ["source", "sourceip", "source ip", "src", "srcip", "src ip", "origin", "orig_h", "id.orig_h", "from"];
const FLOW_TARGET = ["target", "targetip", "target ip", "destination", "destination ip", "dest", "dst", "dstip", "resp_h", "id.resp_h", "to"];
const FLOW_PORT = ["port", "dport", "destinationport", "destination port", "resp_p", "id.resp_p", "service port"];
const FLOW_PROTO = ["protocol", "proto", "service", "application"];

const ASSET_TYPE_IDS: AssetTypeId[] = [
  "enterprise-it",
  "firewall",
  "jump-host",
  "historian",
  "engineering-workstation",
  "hmi",
  "scada",
  "plc-rtu",
  "safety-system",
  "field-device",
  "wireless-gateway",
  "vendor-remote",
  "cloud-service"
];

const TYPE_KEYWORDS: Array<[RegExp, AssetTypeId]> = [
  [/safety|\bsis\b/i, "safety-system"],
  [/plc|rtu|controller|\bied\b/i, "plc-rtu"],
  [/scada|master/i, "scada"],
  [/hmi|panel|operator/i, "hmi"],
  [/histor/i, "historian"],
  [/engineer|\bews\b|workstation|programming/i, "engineering-workstation"],
  [/firewall|router|switch|gateway|segment/i, "firewall"],
  [/jump|bastion|broker/i, "jump-host"],
  [/sensor|actuator|field|instrument|transmitter|meter|\bdrive\b/i, "field-device"],
  [/wireless|wifi|access point|\bap\b/i, "wireless-gateway"],
  [/vendor|remote|support|tunnel/i, "vendor-remote"],
  [/cloud|saas|analytics/i, "cloud-service"],
  [/server|workstation|\bpc\b|laptop|desktop|enterprise|domain|\bad\b/i, "enterprise-it"]
];

function mapType(raw: string | undefined): AssetTypeId | undefined {
  if (!raw) {
    return undefined;
  }
  const direct = raw.trim().toLowerCase();
  if ((ASSET_TYPE_IDS as string[]).includes(direct)) {
    return direct as AssetTypeId;
  }
  return TYPE_KEYWORDS.find(([pattern]) => pattern.test(raw))?.[1];
}

function parseProtocolCell(raw: string): { protocols: string[]; ports: ImportedPort[] } {
  const tokens = raw
    .split(/[,;|]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const protocols: string[] = [];
  const ports: ImportedPort[] = [];
  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      const port = Number(token);
      ports.push({ port });
      protocols.push(classifyPort({ port }).protocol);
    } else {
      protocols.push(token);
    }
  }
  return { protocols, ports };
}

/**
 * Imports a CSV. Auto-detects whether it is an asset inventory (covers Nozomi / Claroty /
 * Tenable.ot / Defender-for-IoT exports and plain spreadsheets) or a connections list, by
 * looking for source/target columns. Column headers are matched by a set of aliases so most
 * real-world exports map without manual configuration.
 */
export function parseInventoryCsv(text: string): ParsedImport {
  const { headers, records } = parseCsvRecords(text);
  const warnings: string[] = [];
  const find = (aliases: string[]) => aliases.find((alias) => headers.includes(alias));

  const sourceHeader = find(FLOW_SOURCE);
  const targetHeader = find(FLOW_TARGET);

  if (sourceHeader && targetHeader) {
    const portHeader = find(FLOW_PORT);
    const protoHeader = find(FLOW_PROTO);
    const flows: ImportedFlow[] = [];
    for (const record of records) {
      const sourceIp = record[sourceHeader];
      const targetIp = record[targetHeader];
      if (!sourceIp || !targetIp) {
        continue;
      }
      const port = portHeader ? Number(record[portHeader]) : NaN;
      flows.push({
        sourceIp,
        targetIp,
        port: Number.isFinite(port) ? port : undefined,
        service: protoHeader ? record[protoHeader] || undefined : undefined
      });
    }
    if (flows.length === 0) {
      warnings.push("Found source/target columns but no valid connection rows.");
    }
    return { format: "csv-inventory", hosts: [], flows, warnings };
  }

  const nameHeader = find(ALIASES.name);
  const ipHeader = find(ALIASES.ip);
  if (!nameHeader && !ipHeader) {
    warnings.push("CSV needs at least a name or IP column to import assets.");
    return { format: "csv-inventory", hosts: [], flows: [], warnings };
  }

  const typeHeader = find(ALIASES.type);
  const macHeader = find(ALIASES.mac);
  const vendorHeader = find(ALIASES.vendor);
  const zoneHeader = find(ALIASES.zone);
  const vlanHeader = find(ALIASES.vlan);
  const protocolsHeader = find(ALIASES.protocols);
  const criticalityHeader = find(ALIASES.criticality);
  const osHeader = find(ALIASES.os);
  const notesHeader = find(ALIASES.notes);

  const hosts: ImportedHost[] = [];
  for (const record of records) {
    const ip = ipHeader ? record[ipHeader] : undefined;
    const hostname = nameHeader ? record[nameHeader] : undefined;
    if (!ip && !hostname) {
      continue;
    }
    const { protocols, ports } = protocolsHeader ? parseProtocolCell(record[protocolsHeader]) : { protocols: [], ports: [] };
    hosts.push({
      ip: ip || undefined,
      hostname: hostname || undefined,
      mac: macHeader ? record[macHeader] || undefined : undefined,
      vendor: vendorHeader ? record[vendorHeader] || undefined : undefined,
      os: osHeader ? record[osHeader] || undefined : undefined,
      vlan: vlanHeader ? record[vlanHeader] || undefined : undefined,
      typeHint: mapType(typeHeader ? record[typeHeader] : undefined),
      zoneHint: zoneHeader ? record[zoneHeader] || undefined : undefined,
      criticalityHint: criticalityHeader ? record[criticalityHeader] || undefined : undefined,
      protocolsHint: protocols.length > 0 ? protocols : undefined,
      notes: notesHeader ? record[notesHeader] || undefined : undefined,
      ports
    });
  }

  if (hosts.length === 0) {
    warnings.push("No asset rows found in the CSV.");
  }

  return { format: "csv-inventory", hosts, flows: [], warnings };
}
