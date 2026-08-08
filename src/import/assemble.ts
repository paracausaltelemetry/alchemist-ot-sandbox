import { ASSET_MIN_X, ASSET_NODE_HEIGHT, ASSET_NODE_WIDTH } from "../data/canvasLayout";
import { getAssetType } from "../data/catalog";
import { resolveIdentities, type HostIdentifiers } from "../engine/identity";
import { createAsset, createConduit, makeId } from "../models/factory";
import type { Asset, Conduit, Criticality, Subnet, ZoneId } from "../models/types";
import { familyForFlow, inferAssetType, protocolLabelForFlow, protocolsForHost } from "./inference";
import type { ImportedHost, ParsedImport } from "./types";

export interface AssembledTopology {
  assets: Asset[];
  conduits: Conduit[];
  subnets: Subnet[];
  warnings: string[];
}

const MAX_ASSETS = 600;
const MAX_CONDUITS = 500;

const LAYOUT_COLS = 4;
const COL_STEP = ASSET_NODE_WIDTH + 60;
const ROW_STEP = ASSET_NODE_HEIGHT + 70;
const BLOCK_GAP = 80;

/**
 * Identity for the assembled topology, resolved once per import.
 *
 * The same resolver the map synthesis uses, so the two paths cannot disagree about how many
 * machines a scan describes — they each had their own `ip || hostname` copy before this.
 */
function hostKeys(parsed: ParsedImport) {
  const flowHosts: ImportedHost[] = parsed.flows.flatMap((flow) =>
    [flow.sourceIp, flow.targetIp].filter(Boolean).map((ip) => ({ ip, ports: [] }))
  );
  return resolveIdentities([...parsed.hosts, ...flowHosts]);
}

function isIpv4(value: string | undefined): value is string {
  return !!value && /^\d{1,3}(\.\d{1,3}){3}$/.test(value);
}

function normalizeZoneHint(raw: string | undefined): ZoneId | undefined {
  if (!raw) {
    return undefined;
  }
  const value = raw.toLowerCase();
  const direct = value.match(/level\s*([0-5])/) ?? value.match(/\bl\s*([0-5])\b/) ?? value.match(/\b([0-5])\b/);
  if (direct) {
    return `level${direct[1]}` as ZoneId;
  }
  if (/enterprise|corporate/.test(value)) return "level5";
  if (/business|planning|erp/.test(value)) return "level4";
  if (/dmz|operations|mes|supervisor\w* management/.test(value)) return "level3";
  if (/supervisory|scada|hmi/.test(value)) return "level2";
  if (/basic control|\bplc\b|controller/.test(value)) return "level1";
  if (/process|field|sensor/.test(value)) return "level0";
  return undefined;
}

function normalizeCriticality(raw: string | undefined): Criticality | undefined {
  if (!raw) {
    return undefined;
  }
  const value = raw.toLowerCase();
  if (/crit/.test(value)) return "critical";
  if (/high/.test(value)) return "high";
  if (/med/.test(value)) return "medium";
  if (/low/.test(value)) return "low";
  return undefined;
}

/** Merges duplicate hosts (same IP/hostname) and folds in any IPs seen only in flows. */
function collectHosts(parsed: ParsedImport, identity: ReturnType<typeof hostKeys>): ImportedHost[] {
  const byKey = new Map<string, ImportedHost>();
  for (const host of parsed.hosts) {
    const key = identity.keyFor(host);
    if (!key) {
      continue;
    }
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...host, ports: [...host.ports] });
      continue;
    }
    for (const port of host.ports) {
      if (!existing.ports.some((candidate) => candidate.port === port.port)) {
        existing.ports.push(port);
      }
    }
    existing.vendor ??= host.vendor;
    existing.hostname ??= host.hostname;
    existing.os ??= host.os;
    existing.vlan ??= host.vlan;
    existing.mac ??= host.mac;
    existing.typeHint ??= host.typeHint;
    existing.zoneHint ??= host.zoneHint;
    existing.criticalityHint ??= host.criticalityHint;
    existing.protocolsHint ??= host.protocolsHint;
  }
  for (const flow of parsed.flows) {
    for (const ip of [flow.sourceIp, flow.targetIp]) {
      // A flow endpoint may already be a known host under a different identifier, so it goes
      // through the resolver too rather than being keyed on its raw address.
      const key = identity.keyFor({ ip });
      if (key && !byKey.has(key)) {
        byKey.set(key, { ip, ports: [] });
      }
    }
  }
  return [...byKey.values()];
}

interface Group {
  subnet: Subnet;
  hosts: ImportedHost[];
}

/** Groups hosts into subnets by VLAN, else by /24, and records which hosts are ungrouped. */
function groupSubnets(hosts: ImportedHost[], keyOf: (host: HostIdentifiers) => string): { groups: Group[]; ungrouped: ImportedHost[]; subnetByHost: Map<string, string> } {
  const groups = new Map<string, Group>();
  const ungrouped: ImportedHost[] = [];
  const subnetByHost = new Map<string, string>();

  for (const host of hosts) {
    let key: string | undefined;
    let subnet: Omit<Subnet, "id"> | undefined;
    if (host.vlan) {
      key = `vlan:${host.vlan}`;
      subnet = { name: `VLAN ${host.vlan}`, cidr: isIpv4(host.ip) ? `${host.ip.split(".").slice(0, 3).join(".")}.0/24` : "", vlan: host.vlan };
    } else if (isIpv4(host.ip)) {
      const network = `${host.ip.split(".").slice(0, 3).join(".")}.0/24`;
      key = `cidr:${network}`;
      subnet = { name: network, cidr: network, vlan: "" };
    }

    if (!key || !subnet) {
      ungrouped.push(host);
      continue;
    }

    let group = groups.get(key);
    if (!group) {
      group = { subnet: { id: makeId("subnet"), ...subnet }, hosts: [] };
      groups.set(key, group);
    }
    group.hosts.push(host);
    subnetByHost.set(keyOf(host), group.subnet.id);
  }

  return { groups: [...groups.values()], ungrouped, subnetByHost };
}

/** Lays out each subnet block as a grid, stacking blocks vertically so containers stay tidy. */
function layoutPositions(
  groups: Group[],
  ungrouped: ImportedHost[],
  keyOf: (host: HostIdentifiers) => string
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  let cursorY = 60;
  const blocks: ImportedHost[][] = [...groups.map((group) => group.hosts), ...(ungrouped.length > 0 ? [ungrouped] : [])];

  for (const block of blocks) {
    block.forEach((host, index) => {
      const col = index % LAYOUT_COLS;
      const row = Math.floor(index / LAYOUT_COLS);
      positions.set(keyOf(host), { x: ASSET_MIN_X + 40 + col * COL_STEP, y: cursorY + row * ROW_STEP });
    });
    const rows = Math.max(1, Math.ceil(block.length / LAYOUT_COLS));
    cursorY += rows * ROW_STEP + BLOCK_GAP;
  }

  return positions;
}

/** Maps a parsed import into a ready-to-use set of assets, conduits and subnets. */
export function assembleTopology(parsed: ParsedImport): AssembledTopology {
  const warnings = [...parsed.warnings];
  const identity = hostKeys(parsed);
  const keyOf = (host: HostIdentifiers) => identity.keyFor(host);
  warnings.push(...identity.warnings);
  let hosts = collectHosts(parsed, identity);

  if (hosts.length > MAX_ASSETS) {
    warnings.push(`Imported the first ${MAX_ASSETS} of ${hosts.length} hosts; trim the source for the rest.`);
    hosts = hosts.slice(0, MAX_ASSETS);
  }

  const { groups, ungrouped, subnetByHost } = groupSubnets(hosts, keyOf);
  const positions = layoutPositions(groups, ungrouped, keyOf);

  const assetIdByKey = new Map<string, string>();
  const assets = hosts.map((host) => {
    const key = keyOf(host);
    const type = inferAssetType(host);
    const zone = normalizeZoneHint(host.zoneHint) ?? getAssetType(type).defaultZone;
    const asset = createAsset(type, positions.get(key) ?? { x: 96, y: 60 }, zone);

    asset.name = host.hostname || host.ip || asset.name;
    asset.ipAddress = host.ip ?? "";
    asset.vlan = host.vlan ?? "";
    const protocols = protocolsForHost(host);
    if (protocols.length > 0) {
      asset.protocols = protocols;
    }
    asset.manufacturer = host.vendor ?? "";
    const criticality = normalizeCriticality(host.criticalityHint);
    if (criticality) {
      asset.criticality = criticality;
    }
    asset.subnetId = subnetByHost.get(key);
    asset.notes = [host.notes, host.os ? `OS: ${host.os}` : ""].filter(Boolean).join(" · ");

    assetIdByKey.set(key, asset.id);
    return asset;
  });

  const zoneById = new Map(assets.map((asset) => [asset.id, asset.zone]));
  const conduits: Conduit[] = [];
  const seen = new Set<string>();
  let dropped = 0;

  for (const flow of parsed.flows) {
    // Through the resolver, not the raw address: a flow endpoint may be keyed on a hostname or a
    // MAC once several sources describe the same machine.
    const sourceId = assetIdByKey.get(keyOf({ ip: flow.sourceIp }));
    const targetId = assetIdByKey.get(keyOf({ ip: flow.targetIp }));
    if (!sourceId || !targetId || sourceId === targetId) {
      continue;
    }
    const label = protocolLabelForFlow(flow.port, flow.service);
    const dedupeKey = `${[sourceId, targetId].sort().join("|")}|${label}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    if (conduits.length >= MAX_CONDUITS) {
      dropped += 1;
      continue;
    }
    seen.add(dedupeKey);

    const conduit = createConduit(sourceId, targetId);
    conduit.name = label;
    conduit.protocol = label;
    conduit.port = flow.port ? String(flow.port) : "";
    conduit.protocolFamily = familyForFlow(flow.port, flow.service);
    conduit.control = "routed";
    conduit.firewallRule = "unknown";
    conduit.encrypted = false;
    conduit.inspected = false;
    conduit.logged = false;
    conduit.trustBoundary = zoneById.get(sourceId) !== zoneById.get(targetId);
    conduit.notes = "Observed from imported scan data.";
    conduits.push(conduit);
  }

  if (dropped > 0) {
    warnings.push(`Reached the ${MAX_CONDUITS}-conduit limit; ${dropped} additional flows were skipped.`);
  }

  const subnets = groups.map((group) => group.subnet).filter((subnet) => assets.some((asset) => asset.subnetId === subnet.id));

  return { assets, conduits, subnets, warnings };
}
