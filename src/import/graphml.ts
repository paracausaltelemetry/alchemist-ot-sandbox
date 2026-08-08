import { childrenNamed, findAll, parseXml, type XmlNode } from "./xml";
import type { ImportedFlow, ImportedHost, ImportedPort, ParsedImport } from "./types";

const IP_PATTERN = /\b\d{1,3}(?:\.\d{1,3}){3}\b/;

function pick(record: Record<string, string>, names: string[]): string | undefined {
  for (const name of names) {
    const value = record[name];
    if (value !== undefined && value.trim() !== "") {
      return value.trim();
    }
  }
  return undefined;
}

/**
 * Parses GraphML — the export format used by Grassmarlin (NSA's passive ICS mapper) and other
 * graph tools (Gephi, yEd, NetworkX). Nodes become hosts; edges become observed flows, so this
 * yields both assets and conduits. `<key>` definitions are resolved so `<data>` values map back
 * to their attribute names (ip, vendor, vlan, …).
 */
export function parseGraphml(text: string): ParsedImport {
  const doc = parseXml(text);
  const warnings: string[] = [];

  const keyMap = new Map<string, string>();
  for (const key of findAll(doc, "key")) {
    const name = key.attrs["attr.name"] || key.attrs.name;
    if (key.attrs.id && name) {
      keyMap.set(key.attrs.id, name.toLowerCase());
    }
  }

  const dataRecord = (node: XmlNode): Record<string, string> => {
    const record: Record<string, string> = {};
    for (const data of childrenNamed(node, "data")) {
      const key = data.attrs.key ?? "";
      const name = keyMap.get(key) ?? key.toLowerCase();
      if (data.text.trim() !== "") {
        record[name] = data.text.trim();
      }
    }
    return record;
  };

  const nodeNodes = findAll(doc, "node");
  if (nodeNodes.length === 0) {
    warnings.push("No <node> elements found. Is this a GraphML export?");
  }

  const idToKey = new Map<string, string>();
  const hostMap = new Map<string, ImportedHost>();
  let missingIp = 0;

  for (const node of nodeNodes) {
    const record = dataRecord(node);
    const label = pick(record, ["label", "name", "host", "hostname"]);
    const ip = pick(record, ["ip", "ipaddress", "ipv4", "address", "addr"]) ?? (label && IP_PATTERN.test(label) ? label.match(IP_PATTERN)?.[0] : undefined);
    const nodeId = node.attrs.id || ip || label || `node-${hostMap.size}`;
    const key = ip ?? label ?? nodeId;
    idToKey.set(nodeId, key);

    if (!ip) {
      missingIp += 1;
    }

    if (!hostMap.has(key)) {
      hostMap.set(key, {
        ip: ip ?? label ?? nodeId,
        mac: pick(record, ["mac", "macaddress", "hwaddr"]),
        vendor: pick(record, ["vendor", "manufacturer", "make"]),
        hostname: label && !IP_PATTERN.test(label) ? label : pick(record, ["hostname", "name", "host"]),
        os: pick(record, ["os", "operatingsystem"]),
        vlan: pick(record, ["vlan", "vlanid"]),
        ports: []
      });
    }
  }

  const flows: ImportedFlow[] = [];
  for (const edge of findAll(doc, "edge")) {
    const source = edge.attrs.source;
    const target = edge.attrs.target;
    if (!source || !target) {
      continue;
    }
    const record = dataRecord(edge);
    const portValue = pick(record, ["port", "dport", "destinationport", "resp_p"]);
    const port = portValue ? Number(portValue) : undefined;
    const service = pick(record, ["service", "protocol", "proto", "application"]);

    const sourceKey = idToKey.get(source) ?? source;
    const targetKey = idToKey.get(target) ?? target;

    if (port && Number.isFinite(port)) {
      const responder = hostMap.get(targetKey);
      if (responder && !responder.ports.some((existing: ImportedPort) => existing.port === port)) {
        responder.ports.push({ port, service });
      }
    }

    flows.push({
      sourceIp: sourceKey,
      targetIp: targetKey,
      port: port && Number.isFinite(port) ? port : undefined,
      service
    });
  }

  if (missingIp > 0) {
    warnings.push(`${missingIp} node${missingIp === 1 ? "" : "s"} had no IP; used the label or id instead.`);
  }

  return { format: "graphml", hosts: [...hostMap.values()], flows, warnings };
}
