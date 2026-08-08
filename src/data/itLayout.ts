import { CANVAS_GRID_X, snapX } from "./canvasLayout";
import { IT_TIER_ORDER, type ItTier } from "../models/itMap";
import type { Point } from "../models/types";

/**
 * Lays out an IT network map: the internet at the top, then the perimeter, the core, each
 * subnet's gateway, and that subnet's hosts packed underneath it.
 *
 * This is a separate algorithm from `layoutTiered`, whose rows *are* Purdue levels and whose
 * barycentre sweeps exist because an OT topology is an arbitrary graph. An IT map is a tree —
 * every host has exactly one uplink — so a single upward pass places it: hosts define their
 * band, the band defines its gateway's x, the gateways define the core's x, and so on. No
 * iteration, no crossing minimisation, and the same result every time.
 *
 * Only *occupied* tiers get a row, so an all-private scan does not open a band of empty space
 * where the internet would be.
 */

/* Every step is a multiple of CANVAS_GRID_X (48) so the canvas's own snapping never nudges a
   freshly laid-out node, and columns can never round into each other. */
export const IT_NODE_WIDTH = 192;
export const IT_NODE_HEIGHT = 96;
export const IT_TIER_STEP = 192;
export const IT_COL_STEP = 240;
export const IT_ROW_STEP = 144;
export const IT_BAND_GAP = 96;
export const IT_TOP_MARGIN = 48;
export const IT_START_X = 96;

const UNGROUPED_BAND = "__ungrouped__";
const DEFAULT_MAX_HOSTS_PER_ROW = 12;
/** Below this a band reads better as a single row than as a square block. */
const SINGLE_ROW_LIMIT = 6;

export interface ItLayoutNode {
  id: string;
  tier: ItTier;
  subnetId?: string;
}

export interface ItLayoutLink {
  source: string;
  target: string;
}

export interface ItLayoutOptions {
  maxHostsPerRow?: number;
}

/** Rounds to the canvas grid on both axes so the canvas's own snapping never moves a node. */
function snapPoint(x: number, y: number): Point {
  return { x: snapX(x), y: Math.round(y / CANVAS_GRID_X) * CANVAS_GRID_X };
}

/**
 * Columns for a band of `count` hosts: a landscape-biased square, capped so a large subnet
 * grows downwards into a readable rack rather than sideways off the canvas.
 */
function columnsFor(count: number, maxPerRow: number): number {
  if (count <= Math.min(SINGLE_ROW_LIMIT, maxPerRow)) {
    return Math.max(1, count);
  }
  return Math.max(1, Math.min(maxPerRow, Math.ceil(Math.sqrt(count * 1.6))));
}

function compareBandKeys(a: string, b: string): number {
  if (a === UNGROUPED_BAND) {
    return b === UNGROUPED_BAND ? 0 : 1;
  }
  if (b === UNGROUPED_BAND) {
    return -1;
  }
  const octets = (value: string) => {
    const match = value.match(/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})/);
    return match ? match.slice(1).map(Number) : null;
  };
  const left = octets(a);
  const right = octets(b);
  if (left && right) {
    for (let index = 0; index < 4; index += 1) {
      if (left[index] !== right[index]) {
        return left[index] - right[index];
      }
    }
  }
  return a.localeCompare(b);
}

export function layoutItMap(
  nodes: ItLayoutNode[],
  links: ItLayoutLink[],
  subnets: Array<{ id: string }>,
  options: ItLayoutOptions = {}
): Map<string, Point> {
  const positions = new Map<string, Point>();
  if (nodes.length === 0) {
    return positions;
  }

  const maxPerRow = options.maxHostsPerRow ?? DEFAULT_MAX_HOSTS_PER_ROW;
  const validSubnets = new Set(subnets.map((subnet) => subnet.id));
  const byId = new Map(nodes.map((node) => [node.id, node]));

  // Only tiers that actually hold nodes get a row, so the map never opens empty bands.
  const occupied = IT_TIER_ORDER.filter((tier) => nodes.some((node) => node.tier === tier));
  const rowOf = new Map(occupied.map((tier, index) => [tier, index]));
  const tierY = (tier: ItTier) => IT_TOP_MARGIN + (rowOf.get(tier) ?? 0) * IT_TIER_STEP;

  const neighbours = new Map<string, string[]>();
  const addNeighbour = (from: string, to: string) => {
    const list = neighbours.get(from);
    if (list) {
      list.push(to);
    } else {
      neighbours.set(from, [to]);
    }
  };
  for (const link of links) {
    if (!byId.has(link.source) || !byId.has(link.target)) {
      continue;
    }
    addNeighbour(link.source, link.target);
    addNeighbour(link.target, link.source);
  }

  // --- Host bands ----------------------------------------------------------
  const bandKeyOf = (node: ItLayoutNode) =>
    node.subnetId && validSubnets.has(node.subnetId) ? node.subnetId : UNGROUPED_BAND;

  const hostsByBand = new Map<string, string[]>();
  for (const node of [...nodes].sort((a, b) => a.id.localeCompare(b.id))) {
    if (node.tier !== "host") {
      continue;
    }
    const key = bandKeyOf(node);
    const members = hostsByBand.get(key);
    if (members) {
      members.push(node.id);
    } else {
      hostsByBand.set(key, [node.id]);
    }
  }

  const bandKeys = [...hostsByBand.keys()].sort(compareBandKeys);
  const bandCentre = new Map<string, number>();
  const hostY = tierY("host");
  let cursorX = IT_START_X;

  for (const key of bandKeys) {
    const members = hostsByBand.get(key)!;
    const cols = columnsFor(members.length, maxPerRow);
    members.forEach((id, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      positions.set(id, snapPoint(cursorX + col * IT_COL_STEP, hostY + row * IT_ROW_STEP));
    });
    // Every node in a band shares a width, so the centre of the band is the centre of the
    // span between the first and last column origins.
    bandCentre.set(key, cursorX + ((cols - 1) * IT_COL_STEP) / 2);
    cursorX += cols * IT_COL_STEP + IT_BAND_GAP;
  }

  const fallbackCentre = bandKeys.length > 0 ? bandCentre.get(bandKeys[Math.floor(bandKeys.length / 2)])! : IT_START_X;

  // --- Gateways: each centred over its own band ----------------------------
  const gateways = nodes.filter((node) => node.tier === "gateway").sort((a, b) => a.id.localeCompare(b.id));
  let spareX = cursorX;
  for (const gateway of gateways) {
    const key = gateway.subnetId && bandCentre.has(gateway.subnetId) ? gateway.subnetId : undefined;
    if (key) {
      positions.set(gateway.id, snapPoint(bandCentre.get(key)!, tierY("gateway")));
    } else {
      // A gateway for a band with no hosts drawn: park it clear of everything else.
      positions.set(gateway.id, snapPoint(spareX, tierY("gateway")));
      spareX += IT_COL_STEP + IT_BAND_GAP;
    }
  }

  // --- Upper tiers: centred over whatever they connect down to -------------
  const meanChildX = (id: string, placed: Map<string, Point>): number | null => {
    const children = (neighbours.get(id) ?? []).filter((other) => placed.has(other));
    if (children.length === 0) {
      return null;
    }
    return children.reduce((sum, other) => sum + placed.get(other)!.x, 0) / children.length;
  };

  for (const tier of ["core", "perimeter", "internet"] as const) {
    const members = nodes.filter((node) => node.tier === tier).sort((a, b) => a.id.localeCompare(b.id));
    if (members.length === 0) {
      continue;
    }
    const y = tierY(tier);
    // Place by mean child x, then spread any that would land on top of each other.
    const desired = members.map((node) => ({ id: node.id, x: meanChildX(node.id, positions) ?? fallbackCentre }));
    desired.sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
    let previousX = -Infinity;
    for (const entry of desired) {
      const x = Math.max(entry.x, previousX + IT_COL_STEP);
      positions.set(entry.id, snapPoint(x, y));
      previousX = x;
    }
  }

  return positions;
}

export interface ItBandBox {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const IT_BAND_PAD = 22;
export const IT_BAND_LABEL_HEIGHT = 26;

/** A labelled box around each subnet's hosts, mirroring the OT canvas's subnet containers. */
export function itBandBoxes(
  nodes: Array<{ id: string; tier: ItTier; subnetId?: string }>,
  positions: Map<string, Point>,
  subnets: Array<{ id: string; name: string }>,
  pad = IT_BAND_PAD
): ItBandBox[] {
  return subnets.flatMap((subnet) => {
    const members = nodes.filter((node) => node.tier === "host" && node.subnetId === subnet.id);
    if (members.length === 0) {
      return [];
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const member of members) {
      const point = positions.get(member.id);
      if (!point) {
        continue;
      }
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x + IT_NODE_WIDTH);
      maxY = Math.max(maxY, point.y + IT_NODE_HEIGHT);
    }
    if (!Number.isFinite(minX)) {
      return [];
    }

    return [
      {
        id: subnet.id,
        name: subnet.name,
        x: minX - pad,
        y: minY - pad - IT_BAND_LABEL_HEIGHT,
        width: maxX - minX + pad * 2,
        height: maxY - minY + pad * 2 + IT_BAND_LABEL_HEIGHT
      }
    ];
  });
}
